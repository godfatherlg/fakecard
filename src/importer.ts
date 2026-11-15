import { Notice, TFile } from 'obsidian';
import { importApkg } from './ankiImport';
import type { CardRecord } from './card';
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
            new Notice('The clipboard is empty.');
            return;
        }
        const count = await importCardJson(plugin, text);
        new Notice(`Imported ${count} card(s).`);
    } catch {
        new Notice('Could not read the clipboard.');
    }
}

/** Pick an .apkg file and import its notes as cards. */
export function importApkgFile(plugin: FakeCardPlugin): void {
    const input = activeDocument.createElement('input');
    input.type = 'file';
    input.accept = '.apkg';
    input.onchange = () => {
        const file = input.files?.[0];
        if (!file) return;
        new Notice('Reading Anki deck…');
        void file.arrayBuffer().then(async (buffer) => {
            const sourcePath = plugin.app.workspace.getActiveFile()?.path ?? '';
            const result = await importApkg(plugin, buffer, sourcePath);
            if (result.error) {
                new Notice(`Anki import failed: ${result.error}`);
                return;
            }
            new Notice(`Imported ${result.qa} Q&A, ${result.cloze} cloze and ${result.image} image card(s), skipped ${result.skipped}.`);
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
        const type = raw.type === 'cloze' ? 'cloze' : 'qa';
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
                await plugin.store.save(card);
            }
            count += cards.length;
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
            await plugin.store.save(card);
            count++;
        }
    }
    return count;
}
