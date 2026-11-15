import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import type { CardRecord } from './card';
import { clozeGroups, renderClozeHtml } from './cloze';
import { ClozePanelModal } from './clozePanel';
import { QaPanelModal } from './qaPanel';
import { CardPreviewDialog } from './cardPreview';
import { ConfirmDialog } from './confirm';
import { matchesQuery, SearchContext } from './search';
import { jumpToCardSource } from './sourceJump';
import type FakeCardPlugin from '../main';

export const BROWSE_VIEW_TYPE = 'fakecard-browse';

/**
 * Anki-style Browse view: a searchable card list, a read-only preview of the
 * selected card, and an Edit button.
 *
 * Search matches the front, the back, the cloze body and the source path.
 * The preview is always read-only; editing opens the same manual panels the
 * review view uses, so both entry points stay consistent.
 */
export class BrowseView extends ItemView {
    private cards: CardRecord[] = [];
    private filtered: CardRecord[] = [];
    private selectedId: string | null = null;
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
        return 'fakecard: browse';
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
        new Notice('Cards moved.');
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

        // Toolbar.
        const bar = container.createEl('div', { cls: 'fakecard-browse-bar' });

        const deckSelect = bar.createEl('select', { cls: 'dropdown' });
        for (const deck of ['all', ...this.decks]) {
            const option = deckSelect.createEl('option');
            option.value = deck;
            option.textContent = deck === 'all' ? 'All decks' : deck;
        }
        deckSelect.value = this.deckFilter;
        deckSelect.addEventListener('change', () => {
            this.deckFilter = deckSelect.value;
            this.applyFilter();
        });

        const search = bar.createEl('input', { cls: 'fakecard-browse-search' });
        search.type = 'search';
        search.placeholder = 'Search… (deck:方剂 tag:麻黄 is:due is:child -tag:x prop:due<7)';
        search.value = this.query;
        search.addEventListener('input', () => {
            this.query = search.value;
            this.applyFilter();
        });

        bar.createEl('span', {
            cls: 'fakecard-browse-count',
            text: `${this.filtered.length} / ${this.cards.length}`,
        });

        if (this.checked.size > 0) {
            bar.createEl('span', {
                cls: 'fakecard-browse-count',
                text: `${this.checked.size} selected`,
            });

            const moveSelect = bar.createEl('select', { cls: 'dropdown' });
            const placeholder = moveSelect.createEl('option');
            placeholder.value = '';
            placeholder.textContent = 'Move to…';
            for (const deck of this.decks) {
                const option = moveSelect.createEl('option');
                option.value = deck;
                option.textContent = deck;
            }
            moveSelect.addEventListener('change', () => {
                if (moveSelect.value) void this.moveChecked(moveSelect.value);
            });

            bar.createEl('button', { text: 'Delete selected' }).addEventListener('click', () => {
                new ConfirmDialog(
                    this.app,
                    `Delete ${this.checked.size} card(s)?`,
                    'Delete',
                    async () => {
                        for (const id of this.checked) await this.plugin.store.remove(id);
                        this.checked.clear();
                        new Notice('Cards deleted.');
                        await this.reload();
                    },
                ).open();
            });
        }

        bar.createEl('button', { text: 'New card' }).addEventListener('click', () => {
            this.plugin.newCard();
        });

        // Quick filters that just write into the search box.
        const chips = container.createEl('div', { cls: 'fakecard-browse-chips' });
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
                text: label,
            });
            chip.addEventListener('click', () => {
                this.query = preset;
                this.applyFilter();
            });
        }

        const body = container.createEl('div', { cls: 'fakecard-browse-body' });

        // Left: table.
        const listEl = body.createEl('div', { cls: 'fakecard-browse-list' });
        if (this.filtered.length === 0) {
            listEl.createEl('p', { text: 'No card matches.' });
        } else {
            const table = listEl.createEl('table', { cls: 'fakecard-browse-table' });
            const head = table.createEl('tr');
            head.createEl('th', { text: '' });
            for (const label of ['Front', 'Type', 'Deck', 'Reviews']) {
                head.createEl('th', { text: label });
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

                const baseType = card.type === 'cloze' ? 'Cloze' : card.type === 'image' ? 'Image' : 'Q&A';
                const state = card.graduated ? ' · graduated' : card.suspended ? ' · paused' : card.childOf ? ' · child' : '';
                row.createEl('td', { text: card.front.slice(0, 60) });
                row.createEl('td', { text: `${baseType}${state}` });
                row.createEl('td', { text: card.deck ?? 'default' });
                row.createEl('td', { text: String(card.reviews ?? 0) });
                row.addEventListener('click', () => {
                    this.selectedId = card.id;
                    this.render();
                });
            }
        }

        // Right: preview + actions.
        const previewEl = body.createEl('div', { cls: 'fakecard-browse-preview' });
        const selected = this.filtered.find((card) => card.id === this.selectedId);
        if (!selected) {
            previewEl.createEl('p', { text: 'Select a card to preview it.' });
            return;
        }

        const actions = previewEl.createEl('div', { cls: 'fakecard-browse-actions' });
        actions.createEl('button', { text: '👁 Preview' }).addEventListener('click', () => {
            new CardPreviewDialog(this.app, selected, this.plugin.settings.maskAllGroups).open();
        });
        actions.createEl('button', { text: '↗ Source' }).addEventListener('click', () => {
            void jumpToCardSource(this.app, selected);
        });
        actions.createEl('button', { text: '✎ Edit' }).addEventListener('click', () => {
            this.openEditor(selected);
        });
        actions.createEl('button', { text: '🗑 Delete' }).addEventListener('click', () => {
            new ConfirmDialog(
                this.app,
                `Delete this card?\n\n${selected.front.slice(0, 120)}`,
                'Delete',
                async () => {
                    await this.plugin.store.remove(selected.id);
                    new Notice('Card deleted.');
                    await this.reload();
                },
            ).open();
        });

        previewEl.createEl('div', { cls: 'fakecard-preview-label', text: 'Front' });
        const frontEl = previewEl.createEl('div', { cls: 'fakecard-card-view' });
        this.renderPreview(frontEl, selected, false);

        previewEl.createEl('div', { cls: 'fakecard-preview-label', text: 'Back' });
        const backEl = previewEl.createEl('div', { cls: 'fakecard-card-view' });
        this.renderPreview(backEl, selected, true);
    }

    private renderPreview(el: HTMLElement, card: CardRecord, revealed: boolean): void {
        if (card.type === 'image' && card.image) {
            const wrap = el.createEl('div', { cls: 'fakecard-image-wrap' });
            const img = wrap.createEl('img', { cls: 'fakecard-image' });
            img.src = this.app.vault.adapter.getResourcePath(card.image.path);
            if (revealed || card.image.groups.length === 0) return;

            const firstId = card.image.groups[0].id;
            const overlay = wrap.createEl('div', { cls: 'fakecard-image-overlay is-static' });
            for (const group of card.image.groups) {
                const isAsked = group.id === firstId;
                if (!isAsked && !this.plugin.settings.maskAllGroups) continue;
                for (const mask of group.masks) {
                    const maskEl = overlay.createEl('div', {
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

    private openEditor(card: CardRecord): void {
        const onSaved = () => {
            void this.reload();
        };
        if (card.type === 'cloze') {
            new ClozePanelModal(this.app, this.plugin, card.source.path, card, undefined, onSaved).open();
        } else {
            new QaPanelModal(this.app, this.plugin, card.source.path, card, undefined, onSaved).open();
        }
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }
}
