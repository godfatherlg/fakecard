import type { CardRecord } from './card';
import { clozeGroups, renderCloze } from './cloze';
import { backupCards } from './maintenance';
import type FakeCardPlugin from '../main';

/**
 * Saving a cloze card back to its whole card group (all groups of one panel
 * share a card id prefix). This never touches the source note - cards are
 * independent copies by design.
 */

/**
 * Save edits from one cloze panel back to the whole card group: cards for
 * existing groups are updated in place (keeping their FSRS history), new
 * groups are created, removed groups are backed up and deleted.
 */
export async function syncClozeGroup(
    plugin: FakeCardPlugin,
    card: CardRecord,
    clozeText: string,
): Promise<void> {
    const normalized = clozeText.includes('{{c')
        ? clozeText
        : clozeText.replace(/==([^=]+)==/g, (_m, inner: string) => `{{c1::${inner}}}`);
    const wanted = clozeGroups(normalized);
    const groups = wanted.length > 0 ? wanted : [1];
    const groupId = card.clozeGroupId ?? `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fullText = renderCloze(normalized, new Set<number>());

    const siblings = (await plugin.store.list()).filter((entry) =>
        entry.id === card.id || (card.clozeGroupId !== undefined && entry.clozeGroupId === card.clozeGroupId));
    const byGroup = new Map<number, CardRecord>();
    for (const entry of siblings) byGroup.set(entry.clozeGroup ?? 1, entry);

    const now = new Date().toISOString();
    for (const group of groups) {
        const existing = byGroup.get(group);
        if (existing) {
            existing.type = 'cloze';
            existing.clozeText = normalized;
            existing.clozeGroupId = groupId;
            existing.clozeGroup = group;
            existing.front = renderCloze(normalized, new Set([group]));
            existing.back = fullText;
            existing.updated = now;
            await plugin.store.save(existing);
        } else {
            await plugin.store.save({
                id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                type: 'cloze',
                deck: card.deck,
                front: renderCloze(normalized, new Set([group])),
                back: fullText,
                clozeText: normalized,
                clozeGroupId: groupId,
                clozeGroup: group,
                source: card.source,
                tags: [],
                created: now,
                updated: now,
            });
        }
    }

    // Delete cards whose group no longer exists - back them up first, like
    // every other destructive action.
    const removed = Array.from(byGroup.entries())
        .filter(([group]) => !groups.includes(group))
        .map(([, entry]) => entry);
    await backupCards(plugin, removed, 'sync-removed');
    for (const entry of removed) await plugin.store.remove(entry.id);
}
