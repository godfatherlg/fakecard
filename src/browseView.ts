import { ItemView, MarkdownRenderer, Menu, Notice, WorkspaceLeaf, setTooltip } from 'obsidian';
import { isBuried, type CardRecord } from './card';
import type { EditableField } from './tempEdit';
import { clozeGroups, renderClozeHtml } from './cloze';
import { ConfirmDialog } from './confirm';
import { attachImageZoom, buildImageFigure, makeImageZoomable } from './imageFigure';
import { ImagePanelModal } from './imagePanel';
import { MapPanelModal } from './mapPanel';
import { renderMindmap } from './mapView';
import { parseOutline } from './outline';
import { tt, ttf } from './i18n';
import { matchesQuery, SearchContext } from './search';
import { suggestFor, type Suggestion } from './searchSuggest';
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
/** Rows rendered per page of the browse table. */
const ROW_CHUNK = 300;

export class BrowseView extends ItemView {
    private cards: CardRecord[] = [];
    private filtered: CardRecord[] = [];
    /** How many rows of `filtered` are in the table right now. */
    private rowLimit = ROW_CHUNK;
    /** Typing coalesces into one filter pass. */
    private filterTimer: number | null = null;
    private selectedId: string | null = null;
    /** Cloze / image preview: whether the masks are lifted. */
    private previewRevealed = false;
    /** Column the table is sorted by; null keeps the store's own order. */
    private sortKey: SortKey | null = null;
    private sortAsc = true;
    /** Row last ticked, the anchor for Shift+click ranges. */
    private lastChecked: string | null = null;
    /** Source line of the node last clicked in a map preview, for editing. */
    private mapFocusLine: number | null = null;
    /** Which card that line belongs to, so a stale line is never used. */
    private mapFocusCardId: string | null = null;
    /** Caret and focus of the search box, for a query changed from elsewhere. */
    private searchCaret = 0;
    private searchHadFocus = false;
    /**
     * Toolbar and the areas below it.
     *
     * The toolbar is built once and never rebuilt: it holds the search field,
     * and replacing that field while it is being typed into loses the caret and
     * kills the input method's composition - typing a space then stops working.
     */
    private shell: {
        deckSelect: HTMLSelectElement;
        search: HTMLInputElement;
        suggest: HTMLElement;
        count: HTMLElement;
        selection: HTMLElement;
        chips: HTMLElement;
        body: HTMLElement;
    } | null = null;
    /** Decks the filter currently lists, so the options are only rebuilt on a change. */
    private deckOptionsKey = '';
    /** Suggestion list currently on screen, and which row is highlighted. */
    private suggestions: Suggestion[] = [];
    private suggestRange: { from: number; to: number } | null = null;
    private suggestIndex = 0;
    private suggestionsHidden = false;
    /** Shift was held for the click being handled (change events lack it). */
    private shiftClick = false;

    /** The rows as the table prints them, in the chosen order. */
    private sortedRows(): CardRecord[] {
        if (!this.sortKey) return this.filtered;
        const key = this.sortKey;
        const direction = this.sortAsc ? 1 : -1;
        return [...this.filtered].sort((a, b) => direction * compareCards(a, b, key));
    }

    /** `MM-DD` for a scheduled card, a dash for one that never ran. */
    private dueLabel(card: CardRecord): string {
        if (isBuried(card)) return tt('Buried');
        if (!card.fsrs) return '—';
        const due = new Date(card.fsrs.due);
        if (Number.isNaN(due.getTime())) return '—';
        const month = String(due.getMonth() + 1).padStart(2, '0');
        const day = String(due.getDate()).padStart(2, '0');
        return `${month}-${day}`;
    }
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

    /**
     * Tick every row between the last ticked box and this one, the way a file
     * list does. The clicked row decides the state, so a Shift+click on a ticked
     * row unticks the whole stretch.
     */
    private selectRange(toId: string): void {
        const rows = this.sortedRows();
        const to = rows.findIndex((card) => card.id === toId);
        if (to < 0) return;
        const select = !this.checked.has(toId);
        const from = this.lastChecked ? rows.findIndex((card) => card.id === this.lastChecked) : to;
        const start = from < 0 ? to : Math.min(from, to);
        const end = from < 0 ? to : Math.max(from, to);
        for (let i = start; i <= end; i++) {
            const id = rows[i].id;
            if (select) this.checked.add(id);
            else this.checked.delete(id);
        }
        this.lastChecked = toId;
        this.render();
    }

    /**
     * Take cards out of the review rotation, or put them back.
     *
     * Suspending touches no schedule: the card keeps its FSRS state and simply
     * stops being handed out until it is resumed.
     */
    private async setSuspended(ids: Iterable<string>, suspended: boolean): Promise<void> {
        const all = await this.plugin.store.list();
        let changed = 0;
        for (const id of ids) {
            const card = all.find((entry) => entry.id === id);
            if (!card || Boolean(card.suspended) === suspended) continue;
            card.suspended = suspended;
            card.updated = new Date().toISOString();
            await this.plugin.store.save(card);
            changed++;
        }
        if (changed > 0) {
            new Notice(suspended
                ? ttf('{count} card(s) paused.', { count: changed })
                : ttf('{count} card(s) resumed.', { count: changed }));
            this.plugin.refreshStatusBar();
            await this.reload();
        }
    }

    /** Hide a card from today's queue without touching its schedule. */
    private async setBuried(ids: Iterable<string>, buried: boolean): Promise<void> {
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        const all = await this.plugin.store.list();
        let changed = 0;
        for (const id of ids) {
            const card = all.find((entry) => entry.id === id);
            if (!card || isBuried(card) === buried) continue;
            if (buried) card.buriedUntil = end.toISOString();
            else delete card.buriedUntil;
            card.updated = new Date().toISOString();
            await this.plugin.store.save(card);
            changed++;
        }
        if (changed > 0) {
            new Notice(buried
                ? ttf('{count} card(s) buried until tomorrow.', { count: changed })
                : ttf('{count} card(s) unburied.', { count: changed }));
            this.plugin.refreshStatusBar();
            await this.reload();
        }
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

    private applyFilter(resetRows = false): void {
        // Only a new query starts from the first page; a reload after a bulk
        // action keeps the pages the user had already opened.
        if (resetRows) this.rowLimit = ROW_CHUNK;
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

    /**
     * Show one card: what a badge in a note does when it is clicked.
     *
     * The filters are cleared first - the card may not match the search or deck
     * filter the view was last left in, and it would silently select the first
     * row instead of the one asked for.
     */
    selectCard(cardId: string): void {
        this.query = '';
        this.deckFilter = 'all';
        this.selectedId = cardId;
        this.previewRevealed = false;
        void this.reload().then(() => {
            this.contentEl
                .querySelector<HTMLElement>(`[data-card-id="${cardId}"]`)
                ?.scrollIntoView({ block: 'center' });
        });
    }

    /** Every tag in the library, for `tag:` completion. */
    private allTags(): string[] {
        const tags = new Set<string>();
        for (const card of this.cards) for (const tag of card.tags ?? []) tags.add(tag);
        return [...tags].sort((a, b) => a.localeCompare(b));
    }

    /**
     * The completion list under the search box.
     *
     * It is rebuilt on every repaint, so it always belongs to the query as it is
     * now - no stale popup from a previous render can linger - while the field
     * itself is left alone.
     */
    private renderSuggestions(host: HTMLElement): void {
        host.empty();
        this.suggestions = [];
        this.suggestRange = null;
        if (!this.searchHadFocus || this.suggestionsHidden || this.query.trim().length === 0) return;

        const found = suggestFor(this.query, this.searchCaret, {
            decks: this.decks,
            tags: this.allTags(),
        });
        if (!found) return;

        this.suggestions = found.items;
        this.suggestRange = { from: found.from, to: found.to };
        if (this.suggestIndex >= found.items.length) this.suggestIndex = 0;

        const list = host.createDiv({ cls: 'fakecard-suggest' });
        found.items.forEach((item, index) => {
            const row = list.createDiv({
                cls: `fakecard-suggest-item${index === this.suggestIndex ? ' is-active' : ''}`,
            });
            row.createSpan({ cls: 'fakecard-suggest-label', text: item.label });
            if (item.hint) row.createSpan({ cls: 'fakecard-suggest-hint', text: item.hint });
            // mousedown, not click: the input must not blur first.
            row.addEventListener('mousedown', (event) => {
                event.preventDefault();
                this.acceptSuggestion(item);
            });
        });
    }

    private onSearchKey(event: KeyboardEvent): void {
        if (this.suggestions.length === 0) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            const total = this.suggestions.length;
            this.suggestIndex = (this.suggestIndex + step + total) % total;
            this.render();
            return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
            event.preventDefault();
            this.acceptSuggestion(this.suggestions[this.suggestIndex] ?? this.suggestions[0]);
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.suggestionsHidden = true;
            this.render();
        }
    }

    /** Put a suggestion in place of the token it was offered for. */
    private acceptSuggestion(item: Suggestion | undefined): void {
        if (!item || !this.suggestRange) return;
        const { from, to } = this.suggestRange;
        this.query = `${this.query.slice(0, from)}${item.insert}${this.query.slice(to)}`;
        this.searchCaret = from + item.insert.length;
        this.searchHadFocus = true;
        this.suggestIndex = 0;
        this.suggestionsHidden = false;
        this.applyFilter(true);
    }

    /** Append a term from the picker menu, keeping the existing query. */
    private insertFilter(text: string): void {
        const current = this.query.trim();
        this.query = current ? `${current} ${text}` : text;
        this.searchCaret = this.query.length;
        this.searchHadFocus = true;
        this.suggestIndex = 0;
        this.suggestionsHidden = false;
        this.applyFilter(true);
    }

    /**
     * The menu behind the search box's chevron: the operators, grouped, with the
     * values this library actually has. Each entry only inserts text, so the
     * query stays ordinary typed text that can be edited further.
     */
    private openSearchMenu(anchor: HTMLElement): void {
        const menu = new Menu();
        const add = (title: string, insert: string): void => {
            menu.addItem((item) => item.setTitle(title).onClick(() => this.insertFilter(insert)));
        };

        add(tt('Question only') + '  front:', 'front:');
        add(tt('Answer only') + '  back:', 'back:');

        menu.addSeparator();
        add(tt('New cards') + '  is:new', 'is:new');
        add(tt('Due today') + '  is:due', 'is:due');
        add(tt('Learning') + '  is:learning', 'is:learning');
        add(tt('Paused') + '  is:paused', 'is:paused');
        add(tt('Child cards') + '  is:child', 'is:child');
        add(tt('Graduated') + '  is:graduated', 'is:graduated');
        add(tt('Orphans') + '  is:orphan', 'is:orphan');

        menu.addSeparator();
        add(tt('Type: Q&A') + '  type:qa', 'type:qa');
        add(tt('Type: cloze') + '  type:cloze', 'type:cloze');
        add(tt('Type: image') + '  type:image', 'type:image');
        add(tt('Type: mind map') + '  type:map', 'type:map');

        menu.addSeparator();
        for (const deck of this.decks) add(`${tt('Deck')}: ${deck}`, `deck:${deck}`);
        for (const tag of this.allTags().slice(0, 20)) add(`${tt('Tag')}: ${tag}`, `tag:${tag}`);

        menu.addSeparator();
        add(tt('Due within 7 days') + '  prop:due<7', 'prop:due<7');
        add(tt('Overdue') + '  prop:due<=0', 'prop:due<=0');
        add(tt('Interval at least 21 days') + '  prop:ivl>=21', 'prop:ivl>=21');
        add(tt('Difficulty at least 7') + '  prop:difficulty>=7', 'prop:difficulty>=7');
        add(tt('Added in the last 7 days') + '  added:7', 'added:7');
        add(tt('Reviewed today') + '  rated:1', 'rated:1');

        const rect = anchor.getBoundingClientRect();
        menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
    }

    private render(): void {
        const container = this.contentEl;
        container.addClass('fakecard-browse');
        if (!this.shell) this.buildShell(container);
        const shell = this.shell;
        if (!shell) return;

        // The field is never rebuilt, so a keystroke keeps its caret and its
        // input method to itself. Only a query set from outside (a chip, the
        // filter menu, a suggestion) is written back here - and then the caret
        // goes where that change left it.
        if (shell.search.value !== this.query) {
            shell.search.value = this.query;
            if (this.searchHadFocus) {
                shell.search.focus();
                const caret = Math.min(this.searchCaret, this.query.length);
                shell.search.setSelectionRange(caret, caret);
            }
        }

        this.renderDeckOptions(shell.deckSelect);
        shell.deckSelect.value = this.deckFilter;
        shell.count.setText(`${this.filtered.length} / ${this.cards.length}`);
        this.renderChips(shell.chips);
        this.renderSelection(shell.selection);
        this.renderBody(shell.body);
        this.renderSuggestions(shell.suggest);
    }

    /**
     * Build the parts that outlive a repaint.
     *
     * The toolbar in particular is created once: it holds the search field, and
     * replacing that field while it is being typed into dropped the caret and
     * cut the input method's composition short - typing a space ended the input.
     */
    private buildShell(container: HTMLElement): void {
        container.empty();
        renderViewNav(container, this.plugin, this.leaf, 'browse');

        // Toolbar.
        const bar = container.createDiv({ cls: 'fakecard-browse-bar' });

        const deckSelect = bar.createEl('select', { cls: 'dropdown' });
        deckSelect.addEventListener('change', () => {
            this.deckFilter = deckSelect.value;
            this.applyFilter(true);
        });

        const searchWrap = bar.createDiv({ cls: 'fakecard-search-wrap' });
        const picker = searchWrap.createEl('button', { cls: 'fakecard-search-picker', text: '⌄' });
        setTooltip(picker, tt('Insert a search filter'));
        picker.addEventListener('click', (event) => {
            event.preventDefault();
            this.openSearchMenu(picker);
        });

        const search = searchWrap.createEl('input', { cls: 'fakecard-browse-search' });
        search.type = 'search';
        search.placeholder = tt('Search… (deck:deckname tag:tag is:due is:child -tag:x prop:due<7)');
        search.value = this.query;
        search.addEventListener('input', () => {
            this.query = search.value;
            this.searchCaret = search.selectionStart ?? search.value.length;
            this.searchHadFocus = true;
            this.suggestIndex = 0;
            this.suggestionsHidden = false;
            // The field itself updates at once; the table waits for a pause so
            // typing does not rebuild hundreds of rows per keystroke.
            if (this.filterTimer !== null) window.clearTimeout(this.filterTimer);
            this.filterTimer = window.setTimeout(() => {
                this.filterTimer = null;
                this.applyFilter(true);
            }, 100);
        });
        search.addEventListener('focus', () => {
            this.searchHadFocus = true;
        });
        search.addEventListener('blur', () => {
            this.searchHadFocus = false;
        });
        search.addEventListener('keydown', (event) => this.onSearchKey(event));

        // The completion list hangs under the field. It lives in its own node so
        // a repaint swaps the rows without touching the input beside it.
        const suggest = searchWrap.createDiv();

        const count = bar.createSpan({ cls: 'fakecard-browse-count' });
        const selection = bar.createDiv({ cls: 'fakecard-browse-selection' });

        bar.createEl('button', { text: tt('New card') }).addEventListener('click', () => {
            void this.plugin.newCard();
        });

        const chips = container.createDiv({ cls: 'fakecard-browse-chips' });
        const body = container.createDiv({ cls: 'fakecard-browse-body' });

        this.shell = { deckSelect, search, suggest, count, selection, chips, body };
    }

    /**
     * Keep the deck filter in step with the library.
     *
     * The select outlives a repaint, so a deck created since the last render
     * would otherwise be missing from it.
     */
    private renderDeckOptions(select: HTMLSelectElement): void {
        const key = this.decks.join('\u0000');
        if (key === this.deckOptionsKey) return;
        this.deckOptionsKey = key;
        select.empty();
        for (const deck of ['all', ...this.decks]) {
            const option = select.createEl('option');
            option.value = deck;
            option.textContent = deck === 'all' ? tt('All decks') : deck;
        }
    }

    /** Quick filters that just write into the search box. */
    private renderChips(host: HTMLElement): void {
        host.empty();
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
            const chip = host.createEl('button', {
                cls: `fakecard-chip${this.query === preset ? ' is-active' : ''}`,
                text: tt(label),
            });
            chip.addEventListener('click', () => {
                this.query = preset;
                this.applyFilter(true);
            });
        }
    }

    /** Batch actions for the ticked rows; nothing at all when nothing is ticked. */
    private renderSelection(host: HTMLElement): void {
        host.empty();
        if (this.checked.size === 0) return;

        host.createSpan({
            cls: 'fakecard-browse-count',
            text: ttf('{count} selected', { count: this.checked.size }),
        });

        const moveSelect = host.createEl('select', { cls: 'dropdown' });
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

        // Pause / resume the selection: a card kept out of the queue without
        // being deleted, which is what "not now" usually means.
        const checkedCards = this.cards.filter((card) => this.checked.has(card.id));
        const allPaused = checkedCards.length > 0 && checkedCards.every((card) => card.suspended);
        host.createEl('button', {
            text: allPaused ? tt('Resume selected') : tt('Pause selected'),
        }).addEventListener('click', () => {
            void this.setSuspended(this.checked, !allPaused);
        });

        const allBuried = checkedCards.length > 0 && checkedCards.every((card) => isBuried(card));
        host.createEl('button', {
            text: allBuried ? tt('Unbury selected') : tt('Bury selected'),
        }).addEventListener('click', () => {
            void this.setBuried(this.checked, !allBuried);
        });

        host.createEl('button', { text: tt('Delete selected') }).addEventListener('click', () => {
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

    /** One table row, built the same way on the first page and on every later one. */
    private createRow(card: CardRecord): HTMLElement {
        const row = createEl('tr', { cls: 'fakecard-browse-row' });
        // Used to bring the row into view when a badge in a note opens
        // the card (selectCard).
        row.setAttr('data-card-id', card.id);
        if (card.id === this.selectedId) row.addClass('is-selected');

        const checkCell = row.createEl('td');
        const checkbox = checkCell.createEl('input');
        checkbox.type = 'checkbox';
        checkbox.checked = this.checked.has(card.id);
        // `change` carries no modifiers, so the click remembers whether
        // Shift was held when the box was ticked.
        checkbox.addEventListener('click', (event) => {
            event.stopPropagation();
            this.shiftClick = event.shiftKey;
        });
        checkbox.addEventListener('change', () => {
            if (this.shiftClick) {
                this.shiftClick = false;
                this.selectRange(card.id);
                return;
            }
            if (checkbox.checked) this.checked.add(card.id);
            else this.checked.delete(card.id);
            this.lastChecked = card.id;
            this.render();
        });

        const baseType = card.type === 'cloze'
            ? tt('Cloze')
            : card.type === 'image'
                ? tt('Image')
                : card.type === 'map'
                    ? tt('Mind map')
                    : tt('Q&A');
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
        const dueCell = row.createEl('td', { text: this.dueLabel(card) });
        if (card.fsrs) {
            setTooltip(dueCell, new Date(card.fsrs.due).toLocaleString());
        }
        row.addEventListener('click', () => {
            if (this.selectedId !== card.id) this.previewRevealed = false;
            this.selectedId = card.id;
            this.render();
        });
        return row;
    }

    /** The table at the left and the preview of the selected card at the right. */
    private renderBody(host: HTMLElement): void {
        host.empty();
        const body = host;

        // Left: table.
        const listEl = body.createDiv({ cls: 'fakecard-browse-list' });
        if (this.filtered.length === 0) {
            listEl.createEl('p', { text: tt('No card matches.') });
        } else {
            const table = listEl.createEl('table', { cls: 'fakecard-browse-table' });
            const head = table.createEl('tr');
            head.createEl('th', { text: '' });
            // Every column sorts: click once for ascending, again to reverse.
            // A second click is also how the default order comes back.
            const addSortable = (label: string, key: SortKey): void => {
                const cell = head.createEl('th');
                const button = cell.createEl('button', {
                    cls: `fakecard-sort${this.sortKey === key ? ' is-active' : ''}`,
                });
                button.createSpan({ text: tt(label) });
                if (this.sortKey === key) {
                    button.createSpan({ cls: 'fakecard-sort-arrow', text: this.sortAsc ? '▲' : '▼' });
                }
                button.addEventListener('click', () => {
                    if (this.sortKey === key) this.sortAsc = !this.sortAsc;
                    else {
                        this.sortKey = key;
                        this.sortAsc = true;
                    }
                    this.render();
                });
            };
            // The front is the text you search by, not something to reorder by:
            // it reads like a list of half-sentences.
            head.createEl('th', { text: tt('Front') });
            addSortable('Type', 'type');
            addSortable('Deck', 'deck');
            addSortable('Reviews', 'reviews');
            addSortable('Due', 'due');

            // The table is filled in chunks: a library with thousands of cards
            // should not build thousands of rows before the first paint.
            const rows = this.sortedRows();
            for (const card of rows.slice(0, this.rowLimit)) {
                table.appendChild(this.createRow(card));
            }
            if (rows.length > this.rowLimit) {
                const more = listEl.createEl('button', { cls: 'fakecard-browse-more' });
                const label = (): string => ttf('Show {count} more of {total}', {
                    count: Math.min(ROW_CHUNK, rows.length - this.rowLimit),
                    total: rows.length,
                });
                more.setText(label());
                more.addEventListener('click', () => {
                    const next = rows.slice(this.rowLimit, this.rowLimit + ROW_CHUNK);
                    this.rowLimit += next.length;
                    for (const card of next) table.appendChild(this.createRow(card));
                    if (this.rowLimit >= rows.length) more.remove();
                    else more.setText(label());
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
        actions.createEl('button', {
            text: selected.suspended ? tt('Resume') : tt('Pause'),
        }).addEventListener('click', () => {
            void this.setSuspended([selected.id], !selected.suspended);
        });
        actions.createEl('button', {
            text: isBuried(selected) ? tt('Unbury') : tt('Bury'),
        }).addEventListener('click', () => {
            void this.setBuried([selected.id], !isBuried(selected));
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

        // A child card is studied instead of its parent, and the parent is
        // paused while its children run - so say which one that is, and let the
        // link jump there rather than making the user search for it.
        if (selected.childOf) {
            const parent = this.cards.find((card) => card.id === selected.childOf);
            const parentRow = previewEl.createDiv({ cls: 'fakecard-parent-row' });
            parentRow.createSpan({ cls: 'fakecard-preview-label', text: tt('Parent card') });
            if (parent) {
                const link = parentRow.createEl('button', { cls: 'fakecard-parent-link' });
                link.createSpan({ text: parent.front.slice(0, 48) || tt('(empty)') });
                link.createSpan({ cls: 'fakecard-parent-arrow', text: '↗' });
                setTooltip(link, parent.suspended
                    ? tt('Open the paused parent card')
                    : tt('Open the parent card'));
                link.addEventListener('click', () => {
                    // selectCard clears the filters: the parent may not match the
                    // current search, and choosing it must still work.
                    this.selectCard(parent.id);
                });
            } else {
                parentRow.createSpan({ cls: 'fakecard-parent-missing', text: tt('not found') });
            }
        }

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
        const addEditor = (field: EditableField, label: string, line?: number): void => {
            editors.createEl('button', { text: label }).addEventListener('click', () => {
                void this.plugin.tempEdit.open(selected, field, line);
            });
        };
        if (selected.type === 'cloze') {
            addEditor('clozeText', tt('✎ Edit cloze text'));
        } else if (selected.type === 'map') {
            // The map is edited in its own panel, the same one that creates it:
            // a temp note shows `{{c1::...}}` as raw text, which cannot show a
            // mask, its note, or the shape of the map while it is being edited.
            editors.createEl('button', { text: tt('✎ Edit mind map') }).addEventListener('click', () => {
                new MapPanelModal(this.app, this.plugin, selected.source.path, selected).open();
            });
        } else if (selected.type === 'image') {
            // Only the masks are real content: `front`/`back` are `![[image]]`
            // copies the review view never reads (it draws `card.image`), so
            // editing them would change nothing on screen.
            editors.createEl('button', { text: tt('✎ Edit masks') }).addEventListener('click', () => {
                // Every group of the picture, not just this card's: the panel
                // edits the picture, and a save must not read the other groups
                // as deleted and remove their cards.
                const groups = this.cards
                    .filter((entry) => entry.type === 'image' && entry.image?.path === selected.image?.path)
                    .flatMap((entry) => entry.image?.groups ?? []);
                new ImagePanelModal(
                    this.app,
                    this.plugin,
                    selected.image?.path ?? '',
                    selected.source.path,
                    selected,
                    () => { void this.reload(); },
                    undefined,
                    groups,
                ).open();
            });
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
        if (card.type === 'map') {
            void renderMindmap(el, parseOutline(card.mapText ?? ''), {
                maskGroups: revealed ? new Set<number>() : new Set([card.mapGroup ?? 1]),
                highlightGroups: revealed ? new Set([card.mapGroup ?? 1]) : undefined,
                maskSubtree: this.plugin.settings.mapMaskSubtree,
                app: this.app,
                sourcePath: card.source.path,
                // Remember which node was clicked: "edit" then opens the outline
                // at that line instead of at the top.
                onNodeFocus: (node) => {
                    this.mapFocusLine = node.line;
                    this.mapFocusCardId = card.id;
                },
            });
            el.addClass('fakecard-map-host');
            return;
        }
        if (card.type === 'image' && card.image) {
            const wrap = buildImageFigure(this.app, card, revealed, this.plugin.settings.maskAllGroups);
            if (!wrap) return;
            el.appendChild(wrap);
            const img = wrap.querySelector('img');
            // The preview shows the card at the size it is reviewed at; it
            // never writes that size back.
            if (img) makeImageZoomable(img, el, wrap, card.image?.zoom ?? 1);
            return;
        }
        void MarkdownRenderer.render(
            this.app,
            revealed ? this.backText(card) : this.frontText(card),
            el,
            card.source.path,
            this,
        ).then(() => {
            // Pictures a cloze or Q&A card embeds zoom the same way, right
            // here in the preview - no dialog to open first.
            attachImageZoom(el, el);
        });
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
        if (this.filterTimer !== null) window.clearTimeout(this.filterTimer);
        this.filterTimer = null;
        this.contentEl.empty();
        // The leaf may be reopened on this same instance: the shell's nodes went
        // with the content, so the next render has to build it again.
        this.shell = null;
    }
}

/** One sortable column of the card table. */
type SortKey = 'type' | 'deck' | 'reviews' | 'due';

/**
 * Order two cards by one column.
 *
 * Text uses `localeCompare` so Chinese sorts by pinyin instead of by code
 * point; a card that never ran has no due date and sorts last rather than
 * jumping to 1970.
 */
function compareCards(a: CardRecord, b: CardRecord, key: SortKey): number {
    switch (key) {
        case 'type':
            return a.type.localeCompare(b.type);
        case 'deck':
            return (a.deck ?? 'default').localeCompare(b.deck ?? 'default');
        case 'reviews':
            return (a.reviews ?? 0) - (b.reviews ?? 0);
        case 'due': {
            const left = a.fsrs ? new Date(a.fsrs.due).getTime() : Number.POSITIVE_INFINITY;
            const right = b.fsrs ? new Date(b.fsrs.due).getTime() : Number.POSITIVE_INFINITY;
            return left - right;
        }
        default:
            return 0;
    }
}
