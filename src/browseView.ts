import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import type { CardRecord } from './card';
import { clozeGroups, renderClozeHtml } from './cloze';
import { ConfirmDialog } from './confirm';
import { tt, ttf } from './i18n';
import { matchesQuery, SearchContext } from './search';
import { jumpToCardSource } from './sourceJump';
import { parseTags } from './ui';
import { renderViewNav } from './viewNav';
import type FakeCardPlugin from '../main';

export const BROWSE_VIEW_TYPE = 'fakecard-browse';

/**
 * Anki-style Browse view: a searchable card list and a preview of the selected
 * card.
 *
 * Search matches the front, the back, the cloze body and the source path.
 * The preview is read-only. Deck and tags are edited inline and saved at once;
 * the text opens in Obsidian's own editor, so the card looks there exactly like
 * it will in review.
 */
export class BrowseView extends ItemView {
    private cards: CardRecord[] = [];
    private filtered: CardRecord[] = [];
    private selectedId: string | null = null;
    /** Cloze / image preview: whether the masks are lifted. */
    private previewRevealed = false;
    private query = '';
    private deckFilter = 'all';
    private decks: string[] = ['default'];
    /** Rows ticked for a batch action. */
    private checked = new Set<string>();
    private ratedAgo: ReadonlyMap<string, number> = new Map();
    private orphanIds: ReadonlySet<string> = new Set();

    constructor(leaf: WorkspaceLeaf, private plugin: FakeCardPlugin) {
        super(leaf);
    }

    getViewType(): string {
        return BROWSE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return tt('Browse');
    }

    getIcon(): string {
        return 'table';
    }

    async onOpen(): Promise<void> {
        await this.reload();
    }

    async reload(): Promise<void> {
        this.cards = await this.plugin.store.list();
        this.decks = await this.plugin.store.loadDecks();

        // Context for is:orphan / rated:N - how many days ago each card was
        // last reviewed, so rated:7 covers the whole week instead of today only.
        const recentLogs = await this.plugin.reviews.recent(90);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const ratedAgo = new Map<string, number>();
        for (const [dayKey, logs] of recentLogs) {
            const [year, month, day] = dayKey.split('-').map(Number);
            const dayStart = new Date(year, month - 1, day);
            const ago = Math.round((today.getTime() - dayStart.getTime()) / 86400000);
            for (const log of logs) {
                const previous = ratedAgo.get(log.cardId);
                if (previous === undefined || ago < previous) ratedAgo.set(log.cardId, ago);
            }
        }
        this.ratedAgo = ratedAgo;

        this.orphanIds = new Set(
            this.cards
                .filter((card) => card.source.path
                    && !this.app.vault.getAbstractFileByPath(card.source.path))
                .map((card) => card.id),
        );

        this.applyFilter();
    }

    private async moveChecked(deck: string): Promise<void> {
        const all = await this.plugin.store.list();
        for (const id of this.checked) {
            const card = all.find((entry) => entry.id === id);
            if (!card) continue;
            card.deck = deck;
            await this.plugin.store.save(card);
        }
        this.checked.clear();
        new Notice(tt('Cards moved.'));
        await this.reload();
    }

    private applyFilter(): void {
        const context: SearchContext = {
            ratedAgo: this.ratedAgo,
            orphanIds: this.orphanIds,
            now: Date.now(),
        };
        this.filtered = this.cards.filter((card) => {
            if (this.deckFilter !== 'all' && card.deck !== this.deckFilter) return false;
            return matchesQuery(card, this.query, context);
        });
        if (!this.filtered.some((card) => card.id === this.selectedId)) {
            this.selectedId = this.filtered[0]?.id ?? null;
        }
        this.render();
    }

    private render(): void {
        const container = this.contentEl;
        container.empty();
        container.addClass('fakecard-browse');
        renderViewNav(container, this.plugin, this.leaf, 'browse');

        // Toolbar.
        const bar = container.createDiv({ cls: 'fakecard-browse-bar' });

        const deckSelect = bar.createEl('select', { cls: 'dropdown' });
        for (const deck of ['all', ...this.decks]) {
            const option = deckSelect.createEl('option');
            option.value = deck;
            option.textContent = deck === 'all' ? tt('All decks') : deck;
        }
        deckSelect.value = this.deckFilter;
        deckSelect.addEventListener('change', () => {
            this.deckFilter = deckSelect.value;
            this.applyFilter();
        });

        const search = bar.createEl('input', { cls: 'fakecard-browse-search' });
        search.type = 'search';
        search.placeholder = tt('Search… (deck:deckname tag:tag is:due is:child -tag:x prop:due<7)');
        search.value = this.query;
        search.addEventListener('input', () => {
            this.query = search.value;
            this.applyFilter();
        });

        bar.createSpan({
            cls: 'fakecard-browse-count',
            text: `${this.filtered.length} / ${this.cards.length}`,
        });

        if (this.checked.size > 0) {
            bar.createSpan({
                cls: 'fakecard-browse-count',
                text: ttf('{count} selected', { count: this.checked.size }),
            });

            const moveSelect = bar.createEl('select', { cls: 'dropdown' });
            const placeholder = moveSelect.createEl('option');
            placeholder.value = '';
            placeholder.textContent = tt('Move to…');
            for (const deck of this.decks) {
                const option = moveSelect.createEl('option');
                option.value = deck;
                option.textContent = deck;
            }
            moveSelect.addEventListener('change', () => {
                if (moveSelect.value) void this.moveChecked(moveSelect.value);
            });

            bar.createEl('button', { text: tt('Delete selected') }).addEventListener('click', () => {
                new ConfirmDialog(
                    this.app,
                    ttf('Delete {count} card(s)?', { count: this.checked.size }),
                    tt('Delete'),
                    async () => {
                        for (const id of this.checked) await this.plugin.store.remove(id);
                        this.checked.clear();
                        new Notice(tt('Cards deleted.'));
                        await this.reload();
                    },
                ).open();
            });
        }

        bar.createEl('button', { text: tt('New card') }).addEventListener('click', () => {
            void this.plugin.newCard();
        });

        // Quick filters that just write into the search box.
        const chips = container.createDiv({ cls: 'fakecard-browse-chips' });
        const presets: Array<[string, string]> = [
            ['All', ''],
            ['New', 'is:new'],
            ['Due', 'is:due'],
            ['Learning', 'is:learning'],
            ['Child', 'is:child'],
            ['Paused', 'is:paused'],
            ['Graduated', 'is:graduated'],
            ['Orphan', 'is:orphan'],
        ];
        for (const [label, preset] of presets) {
            const chip = chips.createEl('button', {
                cls: `fakecard-chip${this.query === preset ? ' is-active' : ''}`,
                text: tt(label),
            });
            chip.addEventListener('click', () => {
                this.query = preset;
                this.applyFilter();
            });
        }

        const body = container.createDiv({ cls: 'fakecard-browse-body' });

        // Left: table.
        const listEl = body.createDiv({ cls: 'fakecard-browse-list' });
        if (this.filtered.length === 0) {
            listEl.createEl('p', { text: tt('No card matches.') });
        } else {
            const table = listEl.createEl('table', { cls: 'fakecard-browse-table' });
            const head = table.createEl('tr');
            head.createEl('th', { text: '' });
            for (const label of ['Front', 'Type', 'Deck', 'Reviews']) {
                head.createEl('th', { text: tt(label) });
            }
            for (const card of this.filtered) {
                const row = table.createEl('tr', { cls: 'fakecard-browse-row' });
                if (card.id === this.selectedId) row.addClass('is-selected');

                const checkCell = row.createEl('td');
                const checkbox = checkCell.createEl('input');
                checkbox.type = 'checkbox';
                checkbox.checked = this.checked.has(card.id);
                checkbox.addEventListener('click', (event) => event.stopPropagation());
                checkbox.addEventListener('change', () => {
                    if (checkbox.checked) this.checked.add(card.id);
                    else this.checked.delete(card.id);
                    this.render();
                });

                const baseType = card.type === 'cloze' ? tt('Cloze') : card.type === 'image' ? tt('Image') : tt('Q&A');
                const state = card.graduated ? ` · ${tt('graduated')}` : card.suspended ? ` · ${tt('paused')}` : card.childOf ? ` · ${tt('child')}` : '';
                // Front only - but a card found by a word that lives in its
                // answer would look like a wrong hit, so say where it matched.
                const frontCell = row.createEl('td');
                frontCell.createDiv({ text: card.front.slice(0, 60) });
                const hint = this.matchHint(card);
                if (hint) frontCell.createDiv({ cls: 'fakecard-match-hint', text: hint });
                row.createEl('td', { text: `${baseType}${state}` });
                row.createEl('td', { text: card.deck ?? 'default' });
                row.createEl('td', { text: String(card.reviews ?? 0) });
                row.addEventListener('click', () => {
                    if (this.selectedId !== card.id) this.previewRevealed = false;
                    this.selectedId = card.id;
                    this.render();
                });
            }
        }

        // Right: preview + actions.
        const previewEl = body.createDiv({ cls: 'fakecard-browse-preview' });
        const selected = this.filtered.find((card) => card.id === this.selectedId);
        if (!selected) {
            previewEl.createEl('p', { text: tt('Select a card to preview it.') });
            return;
        }

        const actions = previewEl.createDiv({ cls: 'fakecard-browse-actions' });
        actions.createEl('button', { text: tt('↗ Source') }).addEventListener('click', () => {
            void jumpToCardSource(this.app, selected);
        });
        actions.createEl('button', { text: tt('🗑 Delete') }).addEventListener('click', () => {
            new ConfirmDialog(
                this.app,
                `${tt('Delete this card?')}\n\n${selected.front.slice(0, 120)}`,
                tt('Delete'),
                async () => {
                    await this.plugin.store.remove(selected.id);
                    new Notice(tt('Card deleted.'));
                    await this.reload();
                },
            ).open();
        });

        // Deck and tags are metadata, not text: they are edited right here and
        // saved on the spot, so a card never needs a dialog for them.
        const meta = previewEl.createDiv({ cls: 'fakecard-browse-meta' });

        const deckField = meta.createDiv({ cls: 'fakecard-meta-field' });
        deckField.createSpan({ cls: 'fakecard-preview-label', text: tt('Deck') });
        const cardDeck = deckField.createEl('select', { cls: 'dropdown' });
        for (const deck of new Set(['default', ...this.decks, selected.deck ?? 'default'])) {
            const option = cardDeck.createEl('option');
            option.value = deck;
            option.textContent = deck;
        }
        cardDeck.value = selected.deck ?? 'default';
        cardDeck.addEventListener('change', () => {
            void this.saveMeta(selected, { deck: cardDeck.value });
        });

        const tagField = meta.createDiv({ cls: 'fakecard-meta-field' });
        tagField.createSpan({ cls: 'fakecard-preview-label', text: tt('Tags') });
        const tagsInput = tagField.createEl('input', { cls: 'fakecard-tags-input' });
        tagsInput.type = 'text';
        tagsInput.placeholder = tt('tag1, tag2');
        tagsInput.value = (selected.tags ?? []).join(', ');
        tagsInput.addEventListener('change', () => {
            void this.saveMeta(selected, { tags: parseTags(tagsInput.value) });
        });

        // The text itself is edited in Obsidian's own editor, one button per
        // field: live preview, links, math - everything a note gets.
        const editors = previewEl.createDiv({ cls: 'fakecard-browse-editors' });
        const addEditor = (field: 'front' | 'back' | 'clozeText', label: string): void => {
            editors.createEl('button', { text: label }).addEventListener('click', () => {
                void this.plugin.tempEdit.open(selected, field);
            });
        };
        if (selected.type === 'cloze') {
            addEditor('clozeText', tt('✎ Edit cloze text'));
        } else if (selected.type === 'image') {
            // The only text an image card has is the embed that points at the
            // picture; the masks are drawn, not typed.
            addEditor('front', tt('✎ Edit image link'));
        } else {
            addEditor('front', tt('✎ Edit question'));
            addEditor('back', tt('✎ Edit answer'));
        }

        this.renderCardPreview(previewEl, selected);
    }

    /**
     * The card the way review will show it.
     *
     * Q&A has two sides, so both are printed with a rule between them: one look
     * tells you what is asked and what is answered. Cloze and image cards
     * reveal in place, and their answer is the same content with nothing
     * masked, so printing it twice says nothing - they get a switch instead.
     */
    private renderCardPreview(el: HTMLElement, card: CardRecord): void {
        if (card.type === 'qa') {
            const front = el.createDiv({ cls: 'fakecard-card-view' });
            this.renderPreview(front, card, false);
            el.createEl('hr', { cls: 'fakecard-preview-divider' });
            const back = el.createDiv({ cls: 'fakecard-card-view' });
            this.renderPreview(back, card, true);
            return;
        }

        const view = el.createDiv({ cls: 'fakecard-card-view' });
        this.renderPreview(view, card, this.previewRevealed);
        el.createEl('button', {
            cls: 'fakecard-card-preview-show',
            text: this.previewRevealed ? tt('Hide answer') : tt('Show answer'),
        }).addEventListener('click', () => {
            this.previewRevealed = !this.previewRevealed;
            this.render();
        });
    }

    private renderPreview(el: HTMLElement, card: CardRecord, revealed: boolean): void {
        if (card.type === 'image' && card.image) {
            const wrap = el.createDiv({ cls: 'fakecard-image-wrap' });
            const img = wrap.createEl('img', { cls: 'fakecard-image' });
            img.src = this.app.vault.adapter.getResourcePath(card.image.path);
            if (revealed || card.image.groups.length === 0) return;

            const firstId = card.image.groups[0].id;
            const overlay = wrap.createDiv({ cls: 'fakecard-image-overlay is-static' });
            for (const group of card.image.groups) {
                const isAsked = group.id === firstId;
                if (!isAsked && !this.plugin.settings.maskAllGroups) continue;
                for (const mask of group.masks) {
                    const maskEl = overlay.createDiv({
                        cls: `fakecard-image-mask${isAsked ? ' is-current' : ''}${mask.shape === 'ellipse' ? ' is-ellipse' : ''}`,
                    });
                    maskEl.style.left = `${mask.x * 100}%`;
                    maskEl.style.top = `${mask.y * 100}%`;
                    maskEl.style.width = `${mask.w * 100}%`;
                    maskEl.style.height = `${mask.h * 100}%`;
                }
            }
            return;
        }
        void MarkdownRenderer.render(
            this.app,
            revealed ? this.backText(card) : this.frontText(card),
            el,
            card.source.path,
            this,
        );
    }

    private frontText(card: CardRecord): string {
        if (card.type === 'cloze' && card.clozeText) {
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

    /**
     * What a search term hit, when it was not the front.
     *
     * The list prints the front only; a card matched through a word in its
     * answer (or in a hidden cloze hole) would otherwise look like a bug.
     */
    private matchHint(card: CardRecord): string | null {
        const terms = this.query
            .split(/\s+/)
            .filter((term) => term.length > 0 && !/^-?\w+:/.test(term))
            .map((term) => term.replace(/^"|"$/g, '').replace(/^-/, '').trim().toLowerCase())
            .filter((term) => term.length > 0);
        if (terms.length === 0) return null;

        const front = card.front.toLowerCase();
        const rest = `${card.back}\n${card.clozeText ?? ''}`;
        const lowered = rest.toLowerCase();
        const hit = terms.find((term) => !front.includes(term) && lowered.includes(term));
        if (!hit) return null;

        const at = lowered.indexOf(hit);
        const from = Math.max(0, at - 24);
        const excerpt = rest.slice(from, at + hit.length + 32).replace(/\s+/g, ' ').trim();
        return ttf('matched in the answer: {text}', { text: from > 0 ? `…${excerpt}` : excerpt });
    }

    /**
     * Deck and tags save as soon as they change - there is no dialog left to
     * hold them, and a metadata edit should not cost a trip to a modal.
     */
    private async saveMeta(card: CardRecord, patch: { deck?: string; tags?: string[] }): Promise<void> {
        // Re-resolve: the row may be a render behind the stored card.
        const live = (await this.plugin.store.list()).find((entry) => entry.id === card.id);
        if (!live) return;
        if (patch.deck !== undefined) live.deck = patch.deck;
        if (patch.tags !== undefined) live.tags = patch.tags;
        live.updated = new Date().toISOString();
        await this.plugin.store.save(live);
        this.plugin.refreshStatusBar();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }
}
