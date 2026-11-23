import { App, Modal, Notice, TFile } from 'obsidian';
import { importApkg } from './ankiImport';
import type { CardImage, CardRecord } from './card';
import { tt, ttf } from './i18n';
import { findSourceSnapshot } from './sourceLocate';
import type FakeCardPlugin from '../main';

/**
 * Import entry points: clipboard JSON (from any external AI), the URL scheme,
 * and Anki .apkg files. All of them funnel into store.save - a preview is only
 * skipped because the JSON itself is the preview.
 */

/** Text from an unknown JSON field; anything else becomes an empty string. */
function asText(value: unknown): string {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return '';
}

/** Read JSON from the clipboard and import it. */
export async function importFromClipboard(plugin: FakeCardPlugin): Promise<void> {
    try {
        const text = await navigator.clipboard.readText();
        if (!text.trim()) {
            new Notice(tt('The clipboard is empty.'));
            return;
        }
        const count = await importCardJson(plugin, text);
        new Notice(ttf('Imported {count} card(s).', { count }));
    } catch {
        new Notice(tt('Could not read the clipboard.'));
    }
}

/**
 * Asked before an .apkg import rewrites cards the library already has.
 *
 * Re-importing a deck is the whole point of carrying Anki's history over, but
 * it replaces whatever was reviewed inside this plugin, so it gets a prompt of
 * its own instead of happening silently.
 */
class AnkiDuplicateModal extends Modal {
    private answer: ((choice: 'overwrite' | 'skip' | 'cancel') => void) | null = null;

    constructor(
        app: App,
        private duplicates: number,
        private withHistory: number,
    ) {
        super(app);
    }

    ask(): Promise<'overwrite' | 'skip' | 'cancel'> {
        return new Promise((resolve) => {
            this.answer = resolve;
            this.open();
        });
    }

    private finish(choice: 'overwrite' | 'skip' | 'cancel'): void {
        const resolve = this.answer;
        this.answer = null;
        this.close();
        resolve?.(choice);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: tt('This deck is already in the library') });
        contentEl.createEl('p', {
            text: ttf(
                '{duplicates} card(s) match cards that are already here, {withHistory} of them with an Anki schedule. Using the Anki schedule replaces their current progress here; the card text is never changed.',
                { duplicates: this.duplicates, withHistory: this.withHistory },
            ),
        });

        const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
        const useAnki = buttons.createEl('button', { cls: 'mod-cta', text: tt('Use the Anki schedule') });
        useAnki.addEventListener('click', () => this.finish('overwrite'));
        const keep = buttons.createEl('button', { text: tt('Keep the current schedule') });
        keep.addEventListener('click', () => this.finish('skip'));
        const cancel = buttons.createEl('button', { text: tt('Cancel') });
        cancel.addEventListener('click', () => this.finish('cancel'));
    }

    onClose(): void {
        this.contentEl.empty();
        // Esc or a backdrop click counts as cancel.
        const resolve = this.answer;
        this.answer = null;
        resolve?.('cancel');
    }
}

/** Pick an .apkg file and import its notes as cards. */
export function importApkgFile(plugin: FakeCardPlugin): void {
    const input = createEl('input');
    input.type = 'file';
    input.accept = '.apkg';
    input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        new Notice(tt('Reading Anki deck…'));
        void file.arrayBuffer().then(async (buffer) => {
            const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? '';
            const result = await importApkg(plugin, buffer, sourcePath, {
                onDuplicates: ({ duplicates, withHistory }) => (
                    new AnkiDuplicateModal(plugin.app, duplicates, withHistory).ask()
                ),
            });
            if (result.cancelled) return;
            if (result.error) {
                new Notice(ttf('Anki import failed: {error}', { error: result.error ?? '' }));
                return;
            }
            new Notice(ttf(
                'Imported {qa} Q&A, {cloze} cloze and {image} image card(s), updated {updated}, skipped {skipped}.',
                {
                    qa: result.qa,
                    cloze: result.cloze,
                    image: result.image,
                    updated: result.updated,
                    skipped: result.skipped + result.duplicates,
                },
            ));
        });
    };
    input.click();
}

/**
 * Import cards from JSON produced by ANY external AI/tool:
 *
 *   [ { "type": "qa", "front": "...", "back": "..." },
 *     { "type": "cloze", "clozeText": "{{c1::...}}" } ]
 *
 * Optional per-card fields: sourcePath, sourceText (used to place the
 * reading-view badge). `==highlights==` in a cloze body are converted to
 * {{c1::...}} so tools that only know the highlight syntax work too.
 */
export async function importCardJson(plugin: FakeCardPlugin, jsonText: string): Promise<number> {
    const parsed = JSON.parse(jsonText) as unknown;
    const list = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { cards?: unknown }).cards)
            ? (parsed as { cards: unknown[] }).cards
            : [parsed]);

    // The note a card points at is read once and reused, so a batch of AI
    // cards does not re-read the same file per card.
    const sourceCache = new Map<string, string>();
    const readSource = async (path: string): Promise<string> => {
        if (!path) return '';
        if (sourceCache.has(path)) return sourceCache.get(path)!;
        const file = plugin.app.vault.getAbstractFileByPath(path);
        const content = file instanceof TFile ? await plugin.app.vault.cachedRead(file) : '';
        sourceCache.set(path, content);
        return content;
    };

    let count = 0;
    for (const item of list) {
        if (!item || typeof item !== 'object') continue;
        const raw = item as Record<string, unknown>;
        // Export writes cards as they are, so import has to accept every type
        // it can produce - otherwise a map or an occlusion card comes back as a
        // Q&A card with its content thrown away.
        const type = raw.type === 'cloze'
            ? 'cloze'
            : raw.type === 'map'
                ? 'map'
                : raw.type === 'image'
                    ? 'image'
                    : 'qa';
        const sourcePath = typeof raw.sourcePath === 'string'
            ? raw.sourcePath
            : (plugin.app.workspace.getActiveFile()?.path ?? '');
        const sourceText = typeof raw.sourceText === 'string' ? raw.sourceText : undefined;

        if (type === 'cloze') {
            const clozeText = asText(raw.clozeText ?? raw.text).trim();
            if (!clozeText) continue;
            const cards = plugin.createClozeCards(clozeText, sourcePath, sourceText);
            const content = sourceText ? '' : await readSource(sourcePath);
            for (const card of cards) {
                if (!sourceText && content) {
                    const snapshot = findSourceSnapshot(content, card);
                    if (snapshot) card.source.snapshot = snapshot;
                }
                if (await plugin.store.save(card)) count++;
            }
        } else if (type === 'map') {
            const mapText = asText(raw.mapText ?? raw.front).trim();
            if (!mapText) continue;
            const cards = plugin.createMapCards(mapText, sourcePath, sourceText);
            const groupId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            for (const card of cards) {
                card.mapGroupId = groupId;
                if (Array.isArray(raw.tags)) card.tags = raw.tags.map((tag) => asText(tag)).filter(Boolean);
                if (await plugin.store.save(card)) count++;
            }
        } else if (type === 'image') {
            const image = raw.image as { path?: unknown; groups?: unknown } | undefined;
            const path = typeof image?.path === 'string' ? image.path : '';
            if (!path || !Array.isArray(image?.groups)) continue;
            const cards = plugin.createImageCards(image as unknown as CardImage, sourcePath);
            for (const card of cards) {
                if (await plugin.store.save(card)) count++;
            }
        } else {
            const front = asText(raw.front ?? raw.question).trim();
            const back = asText(raw.back ?? raw.answer).trim();
            if (!front || !back) continue;
            const card: CardRecord = plugin.createQaCard(front, back, sourcePath);
            if (sourceText) {
                card.source.snapshot = sourceText;
            } else {
                const content = await readSource(sourcePath);
                const snapshot = findSourceSnapshot(content, card);
                if (snapshot) card.source.snapshot = snapshot;
            }
            if (await plugin.store.save(card)) count++;
        }
    }
    return count;
}
