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

    for (const card of orphans) await plugin.store.remove(card.id);
    new Notice(ttf('Removed {count} orphan card(s). Backup: {path}', { count: orphans.length, path }));
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

    for (const card of graduated) await plugin.store.remove(card.id);
    new Notice(ttf('Removed {count} graduated child card(s). Backup: {path}', { count: graduated.length, path }));
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
