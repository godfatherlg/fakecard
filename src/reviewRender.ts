import { App, Component, MarkdownRenderer } from 'obsidian';

import type { CardRecord } from './card';
import { clozeGroups, renderClozeHtml } from './cloze';
import { attachImageZoom, buildImageFigure, makeImageZoomable } from './imageFigure';
import { renderMindmap } from './mapView';
import { findQuestionNode, outlineGroups, parseOutline } from './outline';
import type FakeCardPlugin from '../main';

/**
 * The card body itself: Q&A/cloze text, a mind map, or an occlusion picture.
 *
 * Kept out of ReviewView so the view is about the session (queue, clock,
 * rating) and this file is about what a card looks like. The view passes its
 * own Component in because MarkdownRenderer unloads embeds with it.
 */
export class ReviewCardRenderer {
    private pendingZoom: { cardId: string; zoom: number } | null = null;
    private zoomTimer: number | null = null;

    constructor(
        private app: App,
        private plugin: FakeCardPlugin,
        private component: Component,
    ) {}

    render(el: HTMLElement, card: CardRecord, revealed: boolean): void {
        if (card.type === 'image' && card.image) {
            this.renderImageBody(el, card, revealed);
            return;
        }
        if (card.type === 'map') {
            this.renderMapBody(el, card, revealed);
            return;
        }
        // Same class the reading view uses, so headings, lists and spacing look
        // like the note the card came from.
        el.addClass('markdown-rendered');
        void MarkdownRenderer.render(
            this.app,
            revealed ? this.backText(card) : this.frontText(card),
            el,
            card.source.path,
            this.component,
        ).then(() => {
            // A cloze or Q&A card can carry pictures too; they zoom the same
            // way an occlusion picture does.
            attachImageZoom(el, el.closest<HTMLElement>('.fakecard-review-body') ?? el);
        });
    }

    /** Stop the pending zoom write; the value is not flushed on close. */
    close(): void {
        if (this.zoomTimer === null) return;
        window.clearTimeout(this.zoomTimer);
        this.zoomTimer = null;
    }

    /**
     * A map card is a canvas, not a column of text: it pans and zooms, and it
     * opens centred on the node it is asking about.
     */
    private renderMapBody(el: HTMLElement, card: CardRecord, revealed: boolean): void {
        const group = card.mapGroup ?? 1;
        const root = parseOutline(card.mapText ?? '');
        // Centred on the node this card asks about, on both sides: revealing the
        // answer should not scroll the map away from the question.
        const focus = findQuestionNode(root, group);
        // Same rule as a cloze card: "mask all groups" hides every hole, with
        // the asked group in the accent colour and the rest neutral.
        const maskGroups = revealed
            ? new Set<number>()
            : this.plugin.settings.maskAllGroups
                ? new Set(outlineGroups(root))
                : new Set([group]);
        void renderMindmap(el, root, {
            maskGroups,
            askedGroup: group,
            // Revealed: mark the words that were hidden, the way a cloze card
            // marks its answers.
            highlightGroups: revealed ? new Set([group]) : undefined,
            maskSubtree: this.plugin.settings.mapMaskSubtree,
            focusNodeId: focus?.id,
            app: this.app,
            sourcePath: card.source.path,
        });
        el.addClass('fakecard-map-host');
    }

    private renderImageBody(el: HTMLElement, card: CardRecord, revealed: boolean): void {
        const wrap = buildImageFigure(this.app, card, revealed, this.plugin.settings.maskAllGroups);
        if (!wrap) return;
        el.appendChild(wrap);
        wrap.addClass('is-zoomable');
        const scroller = el.closest<HTMLElement>('.fakecard-review-body') ?? el;
        const img = wrap.querySelector('img');
        if (!img) return;
        // The size a card was last read at is the size it comes back at: the
        // zoom is saved on the card, so there is no separate width to set
        // anywhere - the gesture is the setting.
        makeImageZoomable(img, scroller, wrap, card.image?.zoom ?? 1, (zoom) => {
            this.rememberZoom(card, zoom);
        });
    }

    /**
     * Persist the zoom after the gesture settles.
     *
     * A wheel flicks through a dozen values; writing each one would rewrite the
     * card a dozen times. Half a second of quiet is one write.
     */
    private rememberZoom(card: CardRecord, zoom: number): void {
        if (!card.image) return;
        this.pendingZoom = { cardId: card.id, zoom };
        if (this.zoomTimer !== null) window.clearTimeout(this.zoomTimer);
        this.zoomTimer = window.setTimeout(() => {
            this.zoomTimer = null;
            const pending = this.pendingZoom;
            this.pendingZoom = null;
            if (!pending) return;
            void (async () => {
                const live = (await this.plugin.store.list()).find((entry) => entry.id === pending.cardId);
                if (!live?.image) return;
                // 1 is the default: store nothing rather than a no-op number.
                if (Math.abs(pending.zoom - 1) < 0.01) delete live.image.zoom;
                else live.image.zoom = Math.round(pending.zoom * 100) / 100;
                live.updated = new Date().toISOString();
                await this.plugin.store.save(live);
            })();
        }, 500);
    }

    private frontText(card: CardRecord): string {
        // A map has no text side; this is only what search and hover previews
        // read, and the holes are stripped there.
        if (card.type === 'map' && card.mapText) {
            return card.mapText.replace(/\{\{c\d+::([\s\S]*?)(?:::[^}]*?)?\}\}/g, '$1');
        }
        if (card.type === 'cloze' && card.clozeText) {
            // Each card asks exactly its own group; when "mask all groups" is
            // on every group is hidden on the front.
            if (card.clozeGroup !== undefined) {
                return renderClozeHtml(
                    card.clozeText,
                    this.plugin.settings.maskAllGroups ? 'all' : new Set([card.clozeGroup]),
                    card.clozeGroup,
                );
            }
            const groups = clozeGroups(card.clozeText);
            return renderClozeHtml(
                card.clozeText,
                groups.length > 0 ? new Set([groups[0]]) : 'all',
                groups[0],
            );
        }
        return card.front;
    }

    private backText(card: CardRecord): string {
        if (card.type === 'cloze' && card.clozeText) {
            return renderClozeHtml(card.clozeText, new Set<number>());
        }
        return card.back;
    }
}
