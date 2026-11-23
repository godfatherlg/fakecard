import { normalizePath, Notice } from 'obsidian';
import type { CardRecord } from './card';
import { tt, ttf } from './i18n';
import type FakeCardPlugin from '../main';

/**
 * Housekeeping: backups, orphan cleanup, graduated-child cleanup and export.
 * Every destructive action writes a backup first.
 */

/** Write cards to backup/<prefix>-<timestamp>.json. */
export async function backupCards(
    plugin: FakeCardPlugin,
    cards: CardRecord[],
    prefix: string,
): Promise<void> {
    if (cards.length === 0) return;
    const dir = normalizePath(`${plugin.settings.libraryFolder}/backup`);
    if (!plugin.app.vault.getAbstractFileByPath(dir)) {
        await plugin.app.vault.createFolder(dir);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = normalizePath(`${dir}/${prefix}-${stamp}.json`);
    await plugin.app.vault.create(path, JSON.stringify(cards, null, 2));
}

/**
 * Remove cards whose source note no longer exists. A backup of the removed
 * cards is written first, so a wrong deletion can be undone by hand.
 */
export async function cleanOrphans(plugin: FakeCardPlugin): Promise<void> {
    const cards = await plugin.store.list();
    const orphans = cards.filter((card) => card.source.path
        && !plugin.app.vault.getAbstractFileByPath(card.source.path));
    if (orphans.length === 0) {
        new Notice(tt('No orphan cards.'));
        return;
    }

    const dir = normalizePath(`${plugin.settings.libraryFolder}/backup`);
    if (!plugin.app.vault.getAbstractFileByPath(dir)) {
        await plugin.app.vault.createFolder(dir);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = normalizePath(`${dir}/orphans-${stamp}.json`);
    await plugin.app.vault.create(path, JSON.stringify(orphans, null, 2));

    let removed = 0;
    for (const card of orphans) {
        if (await plugin.store.remove(card.id)) removed++;
    }
    new Notice(ttf('Removed {count} orphan card(s). Backup: {path}', { count: removed, path }));
}

/** Remove graduated child cards (backed up first), keeping the parent. */
export async function cleanGraduated(plugin: FakeCardPlugin): Promise<void> {
    const cards = await plugin.store.list();
    const graduated = cards.filter((card) => card.graduated);
    if (graduated.length === 0) {
        new Notice(tt('No graduated child cards.'));
        return;
    }

    const dir = normalizePath(`${plugin.settings.libraryFolder}/backup`);
    if (!plugin.app.vault.getAbstractFileByPath(dir)) {
        await plugin.app.vault.createFolder(dir);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = normalizePath(`${dir}/graduated-${stamp}.json`);
    await plugin.app.vault.create(path, JSON.stringify(graduated, null, 2));

    let removed = 0;
    for (const card of graduated) {
        if (await plugin.store.remove(card.id)) removed++;
    }
    new Notice(ttf('Removed {count} graduated child card(s). Backup: {path}', { count: removed, path }));
}

/** Write every card to a JSON file inside the library (backup/migration). */
export async function exportCards(plugin: FakeCardPlugin): Promise<void> {
    const cards = await plugin.store.list();
    const dir = normalizePath(`${plugin.settings.libraryFolder}/export`);
    if (!plugin.app.vault.getAbstractFileByPath(dir)) {
        await plugin.app.vault.createFolder(dir);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = normalizePath(`${dir}/fakecard-${stamp}.json`);
    await plugin.app.vault.create(path, JSON.stringify(cards, null, 2));
    new Notice(ttf('Exported {count} card(s) to {path}', { count: cards.length, path }));
}

/**
 * One CSV field: quotes doubled, wrapped when it contains a comma or line
 * break, and prefixed with an apostrophe when a spreadsheet would read it as a
 * formula. Card text is user content; `=HYPERLINK(...)` in a front field must
 * not become a live cell when the file is opened.
 */
function csvField(value: string): string {
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The same export as a table, for spreadsheets and for other SRS tools.
 *
 * Cloze cards keep their raw `{{c1::...}}` text in `Text`, which is what an
 * Anki import expects; the question and answer columns stay empty for them.
 */
export async function exportCardsCsv(plugin: FakeCardPlugin): Promise<void> {
    const cards = await plugin.store.list();
    const dir = normalizePath(`${plugin.settings.libraryFolder}/export`);
    if (!plugin.app.vault.getAbstractFileByPath(dir)) {
        await plugin.app.vault.createFolder(dir);
    }
    const rows: string[][] = [['Front', 'Back', 'Text', 'Deck', 'Tags', 'Type', 'Due', 'Interval', 'Reviews', 'Lapses', 'Source']];
    for (const card of cards) {
        rows.push([
            card.type === 'qa' ? card.front : '',
            card.type === 'qa' ? card.back : '',
            card.type === 'cloze' ? (card.clozeText ?? '') : card.type === 'map' ? (card.mapText ?? '') : '',
            card.deck ?? 'default',
            (card.tags ?? []).join(' '),
            card.type,
            card.fsrs ? new Date(card.fsrs.due).toISOString() : '',
            card.fsrs ? String(card.fsrs.scheduled_days ?? '') : '',
            String(card.reviews ?? 0),
            String(card.fsrs?.lapses ?? 0),
            card.source.path,
        ]);
    }
    const csv = rows.map((row) => row.map(csvField).join(',')).join('\r\n');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = normalizePath(`${dir}/fakecard-${stamp}.csv`);
    await plugin.app.vault.create(path, csv);
    new Notice(ttf('Exported {count} card(s) to {path}', { count: cards.length, path }));
}
