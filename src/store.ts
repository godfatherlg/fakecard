import { App, TFile, TFolder, normalizePath } from 'obsidian';
import type { CardRecord } from './card';

export const DEFAULT_LIBRARY_FOLDER = 'fakecard';

/**
 * Cards live in a plain folder inside the vault:
 *
 *   fakecard/
 *     decks.json
 *     cards/<card-id>.json
 *
 * Everything is a normal file, so the library can be synced, backed up, edited
 * by hand, or versioned in git. The plugin never writes into the notes the
 * cards came from.
 */
export class CardStore {
    /** Cards grouped by source note path, kept in memory for the render-time
     *  badges (post processors are synchronous and cannot await a list). */
    private index = new Map<string, CardRecord[]>();
    /** Whole library, cached so review/browse don't re-read every JSON. */
    private cached: CardRecord[] | null = null;
    /** Paths we are writing ourselves - their vault events must not
     *  invalidate the cache. */
    private writing = new Set<string>();

    constructor(private app: App, private libraryFolder: string) {}

    /** Drop the cache (called when the vault changes outside our writes). */
    invalidate(): void {
        this.cached = null;
    }

    /** True when the path was written by us; the watcher then keeps the cache. */
    consumeWrite(path: string): boolean {
        if (!this.writing.has(path)) return false;
        this.writing.delete(path);
        return true;
    }

    /** Cards generated from one note (empty when none). */
    cardsForPath(path: string): CardRecord[] {
        return this.index.get(path) ?? [];
    }

    private indexCard(card: CardRecord): void {
        const path = card.source?.path;
        if (!path) return;
        const list = this.index.get(path) ?? [];
        const at = list.findIndex((entry) => entry.id === card.id);
        if (at >= 0) list[at] = card;
        else list.push(card);
        this.index.set(path, list);
    }

    private unindexCard(id: string): void {
        for (const [path, list] of this.index) {
            const at = list.findIndex((entry) => entry.id === id);
            if (at >= 0) {
                list.splice(at, 1);
                if (list.length === 0) this.index.delete(path);
                return;
            }
        }
    }

    /** The library folder itself, for anything stored beside `cards/`. */
    get folder(): string {
        return this.libraryFolder;
    }

    private get cardsFolder(): string {
        return normalizePath(`${this.libraryFolder}/cards`);
    }

    private get decksFile(): string {
        return normalizePath(`${this.libraryFolder}/decks.json`);
    }

    async ensure(): Promise<void> {
        await this.ensureFolder(normalizePath(this.libraryFolder));
        await this.ensureFolder(this.cardsFolder);
    }

    private async ensureFolder(path: string): Promise<void> {
        if (this.app.vault.getAbstractFileByPath(path)) return;
        await this.app.vault.createFolder(path);
    }

    async save(card: CardRecord): Promise<void> {
        await this.ensure();
        const path = normalizePath(`${this.cardsFolder}/${card.id}.json`);
        const json = JSON.stringify(card, null, 2);
        this.writing.add(path);
        const existing = this.app.vault.getAbstractFileByPath(path);
        if (existing instanceof TFile) {
            await this.app.vault.modify(existing, json);
        } else {
            await this.app.vault.create(path, json);
        }
        this.indexCard(card);

        if (this.cached) {
            const at = this.cached.findIndex((entry) => entry.id === card.id);
            if (at >= 0) this.cached[at] = card;
            else this.cached.push(card);
        }
    }

    async remove(id: string): Promise<void> {
        const path = normalizePath(`${this.cardsFolder}/${id}.json`);
        this.writing.add(path);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) await this.app.fileManager.trashFile(file);
        this.unindexCard(id);
        if (this.cached) this.cached = this.cached.filter((entry) => entry.id !== id);
    }

    async list(): Promise<CardRecord[]> {
        if (this.cached) return this.cached;

        const folder = this.app.vault.getAbstractFileByPath(this.cardsFolder);
        if (!(folder instanceof TFolder)) return [];
        const files = folder.children.filter(
            (child): child is TFile => child instanceof TFile && child.name.endsWith('.json'),
        );
        // Hundreds of small files on a cold vault: read them together, not one
        // after another, or the first page after a restart crawls.
        const loaded = await Promise.all(files.map(async (file) => {
            try {
                const text = await this.app.vault.cachedRead(file);
                return JSON.parse(text) as CardRecord;
            } catch {
                // A hand-edited file with a syntax error must not break the list.
                return null;
            }
        }));
        const cards = loaded.filter((card): card is CardRecord => card !== null);

        this.cached = cards;
        this.index.clear();
        for (const card of cards) this.indexCard(card);
        return cards;
    }

    async loadDecks(): Promise<string[]> {
        const file = this.app.vault.getAbstractFileByPath(this.decksFile);
        if (!(file instanceof TFile)) return ['default'];
        try {
            const parsed = JSON.parse(await this.app.vault.cachedRead(file)) as unknown;
            if (Array.isArray(parsed) && parsed.every((d) => typeof d === 'string') && parsed.length > 0) {
                return parsed;
            }
        } catch {
            // fall through to the default
        }
        return ['default'];
    }

    async saveDecks(decks: string[]): Promise<void> {
        await this.ensure();
        const json = JSON.stringify(decks, null, 2);
        const file = this.app.vault.getAbstractFileByPath(this.decksFile);
        if (file instanceof TFile) {
            await this.app.vault.modify(file, json);
        } else {
            await this.app.vault.create(this.decksFile, json);
        }
    }
}
