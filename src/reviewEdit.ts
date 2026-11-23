import { App } from 'obsidian';

import type { CardRecord } from './card';
import { ClozePanelModal } from './clozePanel';
import { ImagePanelModal } from './imagePanel';
import { MapPanelModal } from './mapPanel';
import { QaPanelModal } from './qaPanel';
import type FakeCardPlugin from '../main';

/**
 * Open the card's editor. Text cards (Q&A, cloze) go straight to Obsidian's
 * own editor in a split: that is where text is actually written, and the
 * panel is one click away from the editor's own "Back to panel" button.
 *
 * Pictures and mind maps keep their panels: their content is masks and nodes,
 * not markdown.
 */
export async function openCardEditor(
    app: App,
    plugin: FakeCardPlugin,
    card: CardRecord,
    refresh: () => void,
): Promise<void> {
    if (card.type === 'qa' || card.type === 'cloze') {
        const field = card.type === 'cloze' ? 'clozeText' : 'qa';
        await plugin.tempEdit.open(card, field, undefined, () => {
            // The scratch note has just been written back; read the stored
            // copy so the panel cannot open with stale text.
            void plugin.store.list().then((all) => {
                const fresh = all.find((entry) => entry.id === card.id);
                if (fresh) void openCardPanel(app, plugin, fresh, refresh);
            });
        });
        return;
    }
    await openCardPanel(app, plugin, card, refresh);
}

/**
 * Open the panel that owns a card's content: masks for a picture, the outline
 * for a map, the text for Q&A and cloze.
 *
 * Editing from the review view keeps the card id and its FSRS history; the
 * caller only repaints the card in place once the panel saves.
 */
export async function openCardPanel(
    app: App,
    plugin: FakeCardPlugin,
    card: CardRecord,
    refresh: () => void,
): Promise<void> {
    if (card.type === 'image') {
        const image = card.image;
        if (!image) return;
        // One card holds one group; the panel edits the picture, so it needs
        // the groups of every card made from it - otherwise saving would treat
        // the other groups as deleted and take their cards with them.
        const all = await plugin.store.list();
        const groups = all
            .filter((entry) => entry.type === 'image' && entry.image?.path === image.path)
            .flatMap((entry) => entry.image?.groups ?? []);
        new ImagePanelModal(
            app,
            plugin,
            image.path,
            card.source.path,
            card,
            refresh,
            undefined,
            groups,
        ).open();
        return;
    }
    if (card.type === 'map') {
        new MapPanelModal(app, plugin, card.source.path, card, '', refresh).open();
        return;
    }
    if (card.type === 'cloze') {
        new ClozePanelModal(app, plugin, card.source.path, card, undefined, refresh).open();
        return;
    }
    new QaPanelModal(app, plugin, card.source.path, card, undefined, refresh).open();
}
