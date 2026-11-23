import { App, Editor, FileSystemAdapter, MarkdownFileInfo, MarkdownView, Menu, Modal, Notice, Plugin, Setting, TAbstractFile, TFile, WorkspaceLeaf, normalizePath } from 'obsidian';
import type { CardImage, CardRecord } from './src/card';
import { clozeGroups, renderCloze, selectionToClozeText } from './src/cloze';
import { ClozePanelModal } from './src/clozePanel';
import { MapPanelModal } from './src/mapPanel';
import { outlineGroups, parseOutline } from './src/outline';
import type { ExamPlanConfig } from './src/examPlan';
import { buildExamPlan as buildExamPlanImpl, legacyExamPlan } from './src/examPlan';
import { tt, ttf } from './src/i18n';
import { ImagePanelModal } from './src/imagePanel';
import {
    importApkgFile as importApkgFileImpl,
    importCardJson as importCardJsonImpl,
    importFromClipboard as importFromClipboardImpl,
} from './src/importer';
import {
    cleanGraduated as cleanGraduatedImpl,
    cleanOrphans as cleanOrphansImpl,
    exportCards as exportCardsImpl,
    exportCardsCsv as exportCardsCsvImpl,
} from './src/maintenance';
import { QaPanelModal } from './src/qaPanel';
import { buildQueueCounts } from './src/queue';
import { ReviewView, REVIEW_VIEW_TYPE } from './src/reviewView';
import { BrowseView, BROWSE_VIEW_TYPE } from './src/browseView';
import { StatsView, STATS_VIEW_TYPE } from './src/statsView';
import { ReviewStore } from './src/reviews';
import { CardDraft, extractClozeLists, extractMarkedHeadings, LineRange, splitHeadingSelection } from './src/rules';
import { DEFAULT_SETTINGS, FakeCardSettings, FakeCardSettingTab } from './src/settings';
import { findSourceTarget } from './src/sourceLocate';
import { syncClozeGroup as syncClozeGroupImpl } from './src/sourceSync';
import { CardStore } from './src/store';
import { TempEditor } from './src/tempEdit';
import type { FakeCardPage } from './src/viewNav';
import { WHATS_NEW_VERSION, WhatsNewModal } from './src/whatsNew';

export default class FakeCardPlugin extends Plugin {
    settings: FakeCardSettings;
    store: CardStore;
    reviews: ReviewStore;
    /** Card fields being edited in a real editor split, see `tempEdit.ts`. */
    tempEdit!: TempEditor;
    /**
     * Extra reviews allowed beyond `maxReviewsPerDay`, added by "study more
     * today" on the review-finished page. Memory only: it means "today".
     */
    reviewLimitBoost = 0;


    /** Debounce handle for refreshing views after a settings change. */
    private refreshTimer: number | null = null;
    /** Status bar entry showing today's queue, see `refreshStatusBar`. */
    private statusEl: HTMLElement | null = null;
    /** Debounce handle for the status bar: every rating recomputes it. */
    private statusTimer: number | null = null;
    /** Debounce handle for repainting views after an in-editor card edit. */
    private cardRefreshTimer: number | null = null;
    /** Timer that opens the "what is new" dialog after an update. */
    private whatsNewTimer: number | null = null;
    /** Set by onunload, so delayed startup work does not run after unloading. */
    private unloaded = false;
    /** Settings existed before `lastSeenVersion` did: treat as one upgrade. */
    private upgradedWithoutVersion = false;

    async onload() {
        await this.loadSettings();
        this.store = new CardStore(this.app, this.settings.libraryFolder);
        this.reviews = new ReviewStore(this.app, this.settings.libraryFolder);
        this.tempEdit = new TempEditor(this);



        // Warm the per-note index so the reading-view badges can be injected
        // synchronously (post processors cannot await).
        await this.store.list();

        // External changes inside cards/ (sync, hand edits) drop the cache;
        // our own writes are recognised and keep it.
        const cardsPrefix = normalizePath(`${this.settings.libraryFolder}/cards`) + '/';
        const onCardsChange = (file: TAbstractFile): void => {
            if (!file.path.startsWith(cardsPrefix)) return;
            if (this.store.consumeWrite(file.path)) return;
            this.store.invalidate();
            this.refreshStatusBar();
        };
        this.registerEvent(this.app.vault.on('modify', onCardsChange));
        this.registerEvent(this.app.vault.on('create', onCardsChange));
        this.registerEvent(this.app.vault.on('delete', onCardsChange));
        this.addSettingTab(new FakeCardSettingTab(this.app, this));

        // ----- Generation from notes -----
        this.addCommand({
            id: 'generate-qa-from-note',
            name: tt('Generate Q&A cards from the whole note'),
            callback: () => {
                void this.generateFromNote('qa');
            },
        });

        this.addCommand({
            id: 'generate-cloze-from-note',
            name: tt('Generate cloze cards from the whole note'),
            callback: () => {
                void this.generateFromNote('cloze');
            },
        });

        this.addCommand({
            id: 'generate-map-from-note',
            name: tt('Generate a mind map from this note'),
            callback: () => {
                void this.generateMapFromNote();
            },
        });

        this.addCommand({
            id: 'generate-map-from-selection',
            name: tt('Generate a mind map from the selected lines'),
            callback: () => {
                const view = this.app.workspace.getActiveViewOfType(MarkdownView);
                const selection = view?.editor?.getSelection() ?? '';
                if (!selection.trim()) {
                    new Notice(tt('Select some lines first.'));
                    return;
                }
                new MapPanelModal(
                    this.app,
                    this,
                    view?.file?.path ?? '',
                    undefined,
                    this.mapTextFromSelection(selection),
                ).open();
            },
        });

        this.addCommand({
            id: 'generate-from-selection',
            name: tt('Generate cards from the selected lines'),
            callback: () => {
                void this.generateFromSelection();
            },
        });

        // ----- Review / Browse (main area views) -----
        this.registerView(REVIEW_VIEW_TYPE, (leaf) => new ReviewView(leaf, this));
        this.registerView(BROWSE_VIEW_TYPE, (leaf) => new BrowseView(leaf, this));
        this.registerView(STATS_VIEW_TYPE, (leaf) => new StatsView(leaf, this));
        this.addRibbonIcon('bar-chart-2', tt('fakecard: statistics'), () => {
            void this.openStats();
        });

        // ----- Today's queue in the status bar -----
        // Same three numbers Anki puts on a deck row (due / new / learning), so
        // the day's workload is readable without opening the review pane.
        this.statusEl = this.addStatusBarItem();
        this.statusEl.addClass('fakecard-status');
        this.statusEl.addEventListener('click', () => {
            void this.openReview();
        });
        this.app.workspace.onLayoutReady(() => {
            this.refreshStatusBar();
            // Scratch notes from a crashed editing session, now that the vault
            // is up (see TempEditor.sweep).
            void this.tempEdit.sweep();
        });

        // Reading view: show a small badge next to the block a card came from.
        // The note file is never modified - this only injects an element into
        // the rendered DOM.
        this.registerMarkdownPostProcessor((el, ctx) => {
            // The badge says "this block has cards" and belongs to a NOTE. Inside
            // our own views the markdown is a card being reviewed or previewed,
            // where the chip is noise - and it showed on both sides of the card.
            if (el.closest('.fakecard-review-body, .fakecard-card-view, .fakecard-field-preview-body')) return;
            if (!this.settings.showCardBadge) return;
            const cards = this.store.cardsForPath(ctx.sourcePath);
            if (cards.length === 0) return;
            // Several mask groups can share one image - show one badge there.
            const seen = new Set<string>();
            for (const card of cards) {
                const key = card.type === 'image' ? (card.image?.path ?? '') : card.id;
                if (key && seen.has(key)) continue;
                const target = findSourceTarget(el, card);
                if (!target) continue;
                if (key) seen.add(key);
                const badge = target.createSpan({
                    cls: 'fakecard-source-badge',
                    text: '📇',
                    attr: { 'aria-label': 'fakecard: this block has cards' },
                });
                badge.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    // The badge marks one block: land on the card built from
                    // it, not on the first row of the library.
                    void this.openBrowse(card.id);
                });
            }
        });
        this.addCommand({
            id: 'review',
            name: tt('Start reviewing'),
            callback: () => {
                void this.openReview();
            },
        });
        this.addCommand({
            id: 'browse-cards',
            name: tt('Browse and edit cards'),
            callback: () => {
                void this.openBrowse();
            },
        });
        this.addCommand({
            id: 'new-image-card',
            name: tt('New image occlusion card (from clipboard)'),
            callback: () => {
                void this.newImageCard();
            },
        });
        this.addCommand({
            id: 'occlusion-from-cursor',
            name: tt('Make occlusion card from the image at the cursor'),
            callback: () => {
                void this.occlusionFromCursor();
            },
        });
        this.addCommand({
            id: 'statistics',
            name: tt('Open statistics'),
            callback: () => {
                void this.openStats();
            },
        });

        // ----- Manual panels -----
        this.addCommand({
            id: 'new-card',
            name: tt('New card (manual)'),
            callback: () => {
                void this.newCard();
            },
        });



        // ----- External AI import (no built-in model) -----
        this.addCommand({
            id: 'import-from-clipboard',
            name: tt('Import cards from clipboard (JSON)'),
            callback: () => {
                void this.importFromClipboard();
            },
        });

        this.addCommand({
            id: 'import-apkg',
            name: tt('Import cards from Anki (.apkg)'),
            callback: () => {
                this.importApkgFile();
            },
        });

        this.addCommand({
            id: 'export-cards',
            name: tt('Export all cards (JSON)'),
            callback: () => {
                void this.exportCards();
            },
        });

        this.addCommand({
            id: 'export-cards-csv',
            name: tt('Export all cards (CSV)'),
            callback: () => {
                void this.exportCardsCsv();
            },
        });

        this.addCommand({
            id: 'clean-orphans',
            name: tt('Clean up orphan cards (source note deleted)'),
            callback: () => {
                void this.cleanOrphans();
            },
        });

        this.addCommand({
            id: 'clean-graduated',
            name: tt('Remove graduated child cards'),
            callback: () => {
                void this.cleanGraduated();
            },
        });

        this.addCommand({
            id: 'reschedule-for-exam',
            name: tt('Build an exam plan (spread cards until the exam)'),
            callback: () => {
                void this.buildExamPlan();
            },
        });

        this.addCommand({
            id: 'open-library',
            name: tt('Open the card library folder'),
            callback: () => {
                void this.store.ensure();
                new Notice(ttf('Card library: {path}', { path: this.settings.libraryFolder }));
            },
        });

        // obsidian://fakecard?data=<url-encoded JSON>
        this.registerObsidianProtocolHandler('fakecard', (params) => {
            void this.handleProtocol(params);
        });

        // Selected text: right-click to create a card from it. Text selections
        // do fire editor-menu (images do not), so the native menu is kept and
        // our items are appended.
        this.registerEvent(this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor, info: MarkdownView | MarkdownFileInfo) => {
            const selection = editor.getSelection();
            if (typeof selection !== 'string' || selection.trim().length === 0) return;
            const file = info.file;
            if (!file) return;

            menu.addSeparator();
            menu.addItem((item) => item
                .setTitle(tt('fakecard: new Q&A card from selection'))
                .setIcon('help-circle')
                .onClick(() => {
                    const { front, back } = splitHeadingSelection(selection);
                    new QaPanelModal(this.app, this, file.path, undefined, back, undefined, front).open();
                }));
            menu.addItem((item) => item
                .setTitle(tt('fakecard: new cloze card from selection'))
                .setIcon('layers')
                .onClick(() => {
                    new ClozePanelModal(
                        this.app,
                        this,
                        file.path,
                        undefined,
                        selectionToClozeText(selection),
                    ).open();
                }));
            menu.addItem((item) => item
                .setTitle(tt('fakecard: new mind map from selection'))
                .setIcon('git-fork')
                .onClick(() => {
                    new MapPanelModal(
                        this.app,
                        this,
                        file.path,
                        undefined,
                        this.mapTextFromSelection(selection),
                    ).open();
                }));
        }));

        // Alt+click an image in the editor to mask it. The native right-click
        // menu is left untouched - Obsidian's own image actions keep working.
        this.registerDomEvent(activeWindow, 'mousedown', (event: MouseEvent) => {
            if (!this.settings.altClickOcclusion) return;
            if (!event.altKey || event.button !== 0) return;
            const target = event.target;
            if (!(target instanceof HTMLImageElement)) return;
            if (!target.closest('.cm-editor')) return;
            const path = this.vaultPathFromImageSrc(target.src);
            if (!path) return;
            event.preventDefault();
            event.stopPropagation();
            new ImagePanelModal(
                this.app,
                this,
                path,
                this.app.workspace.getActiveFile()?.path ?? '',
            ).open();
        }, true);

        // ----- File context menu -----
        this.registerEvent(this.app.workspace.on('file-menu', (menu: Menu, file) => {
            if (!(file instanceof TFile) || file.extension !== 'md') return;
            menu.addItem((item) => item
                .setTitle(tt('fakecard: generate Q&A cards'))
                .setIcon('help-circle')
                .onClick(() => {
                    void this.generateFromFile(file, 'qa');
                }));
            menu.addItem((item) => item
                .setTitle(tt('fakecard: generate cloze cards'))
                .setIcon('layers')
                .onClick(() => {
                    void this.generateFromFile(file, 'cloze');
                }));
            menu.addItem((item) => item
                .setTitle(tt('fakecard: generate a mind map'))
                .setIcon('git-fork')
                .onClick(() => {
                    void this.generateMapFromFile(file);
                }));
        }));

        // Show "what is new" once, right after an update - never on a fresh
        // install, where notes about past releases are of no use to anyone.
        // Only when the notes really belong to this version, so a release that
        // forgot to update them stays quiet instead of showing stale text.
        //
        // It has to wait for onLayoutReady: a modal opened while the workspace
        // is still restoring its layout gets thrown away with the old DOM, and
        // the timer alone is not enough because the plugin can be loaded long
        // before the layout is ready. The version is written only once the
        // dialog is actually shown, so an interrupted start does not swallow
        // the notice for good.
        const currentVersion = this.manifest.version;
        const isUpdate = this.settings.lastSeenVersion !== ''
            ? this.settings.lastSeenVersion !== currentVersion
            // No stored version at all. A brand-new install stays quiet, but a
            // settings file written before this feature existed is an upgrade
            // that would otherwise never see another note.
            : this.upgradedWithoutVersion;
        if (isUpdate && WHATS_NEW_VERSION === currentVersion) {
            this.app.workspace.onLayoutReady(() => {
                if (this.unloaded) return;
                this.whatsNewTimer = window.setTimeout(() => {
                    this.whatsNewTimer = null;
                    if (this.unloaded || this.settings.lastSeenVersion === currentVersion) return;
                    this.settings.lastSeenVersion = currentVersion;
                    void this.saveData(this.settings);
                    new WhatsNewModal(this.app, currentVersion).open();
                }, 1500);
            });
        } else if (isUpdate) {
            this.settings.lastSeenVersion = currentVersion;
            void this.saveData(this.settings);
        }
    }

    onunload(): void {
        this.unloaded = true;
        if (this.whatsNewTimer !== null) window.clearTimeout(this.whatsNewTimer);
        if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
        if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
        if (this.cardRefreshTimer !== null) window.clearTimeout(this.cardRefreshTimer);
        // Persist any open editor draft and drop its scratch file.
        void this.tempEdit?.flushAll();
        // A pending paint must not write into the old element after a reload.
        this.statusEl = null;
    }

    async loadSettings() {
        const loaded = (await this.loadData()) as Partial<FakeCardSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
        // Settings saved before the "what is new" notes existed carry no
        // version. Empty means "never seen" and used to be read as a fresh
        // install, which disabled the notes for good.
        this.upgradedWithoutVersion = !!loaded && !loaded.lastSeenVersion;
        // 1.0.35 splits the history weight in two: answering (-20) and recall
        // (+20). A settings file saved while this was a single +20 weight has no
        // `answerTimeMemoryWeight`; put the answering default back, so the pair
        // starts out as intended instead of both being positive.
        if (loaded && loaded.answerTimeMemoryWeight === undefined
            && this.settings.answerTimeHistoryWeight === 20) {
            this.settings.answerTimeHistoryWeight = DEFAULT_SETTINGS.answerTimeHistoryWeight;
        }
        if (!Array.isArray(this.settings.examPlans)) this.settings.examPlans = [];
        // A data file edited by hand may carry anything; only two layouts exist.
        if (this.settings.reviewLayout !== 'wide') this.settings.reviewLayout = 'center';
        // The old single exam date becomes the first plan, so an update does
        // not lose the countdown the user already had.
        if (this.settings.examPlans.length === 0) {
            const migrated = legacyExamPlan(
                this.settings.examDate ?? '',
                this.settings.examDecks ?? '',
                this.settings.examPlanRatio ?? 100,
            );
            if (migrated) this.settings.examPlans = [migrated];
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.scheduleViewRefresh();
    }

    /**
     * The status bar entry: today's queue as due / new / learning.
     *
     * Debounced, because every rating asks for it and ratings can arrive
     * faster than the queue can be read.
     */
    refreshStatusBar(): void {
        if (!this.statusEl) return;
        if (this.statusTimer !== null) window.clearTimeout(this.statusTimer);
        this.statusTimer = window.setTimeout(() => {
            this.statusTimer = null;
            void this.paintStatusBar();
        }, 300);
    }

    private async paintStatusBar(): Promise<void> {
        const el = this.statusEl;
        if (!el) return;
        // Follow the open pane's deck filter, so the bar and the card counter
        // never disagree about the size of today's queue.
        const leaf = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0] ?? null;
        const deck = leaf?.view instanceof ReviewView ? leaf.view.deck : 'all';
        let queue: { due: number; fresh: number; learning: number };
        try {
            queue = await buildQueueCounts(this, deck);
        } catch {
            return;
        }
        // The view may have been torn down while the queue was being read.
        if (!this.statusEl) return;

        el.empty();
        el.setAttr('aria-label', ttf(
            'Today: {due} due, {new} new, {learning} learning. Click to review.',
            { due: queue.due, new: queue.fresh, learning: queue.learning },
        ));
        const parts: Array<[string, number, string]> = [
            ['Due', queue.due, 'is-due'],
            ['New', queue.fresh, 'is-new'],
            ['Learning', queue.learning, 'is-learning'],
        ];
        for (const [label, count, cls] of parts) {
            const part = el.createSpan({
                cls: `fakecard-status-part ${cls}${count === 0 ? ' is-empty' : ''}`,
            });
            part.createSpan({ cls: 'fakecard-status-label', text: tt(label) });
            part.createSpan({ cls: 'fakecard-status-count', text: String(count) });
        }
    }

    /**
     * Settings must take effect immediately: open views reload shortly after a
     * change (debounced, so dragging a slider does not rebuild them on every
     * tick).
     */
    private scheduleViewRefresh(): void {
        if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
        this.refreshTimer = window.setTimeout(() => {
            this.refreshTimer = null;
            for (const leaf of this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)) {
                const view = leaf.view;
                if (view instanceof ReviewView) void view.reload();
            }
            for (const leaf of this.app.workspace.getLeavesOfType(BROWSE_VIEW_TYPE)) {
                const view = leaf.view;
                if (view instanceof BrowseView) void view.reload();
            }
            for (const leaf of this.app.workspace.getLeavesOfType(STATS_VIEW_TYPE)) {
                const view = leaf.view;
                if (view instanceof StatsView) void view.reload();
            }
            // Daily limits and the deck list live in the settings.
            this.refreshStatusBar();
        }, 250);
    }

    /**
     * Study a hand-picked set of cards - the stats page's hardest list. Opens
     * the review view on exactly those cards; their schedules are untouched
     * until they are rated.
     */
    async openReviewWith(cards: CardRecord[]): Promise<void> {
        let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0] ?? null;
        if (!leaf) {
            leaf = this.app.workspace.getLeaf('tab');
            await leaf.setViewState({ type: REVIEW_VIEW_TYPE, active: true });
        }
        void this.app.workspace.revealLeaf(leaf);
        const view = leaf.view;
        if (view instanceof ReviewView) view.startExtra(cards);
    }

    /**
     * Drop the card cache and repaint every view from disk. For hand-edited
     * JSON or a sync that changed files while Obsidian was open.
     */
    async rebuildIndex(): Promise<void> {
        this.store.invalidate();
        this.refreshStatusBar();
        for (const leaf of this.app.workspace.getLeavesOfType(BROWSE_VIEW_TYPE)) {
            const view = leaf.view;
            if (view instanceof BrowseView) void view.reload();
        }
        for (const leaf of this.app.workspace.getLeavesOfType(STATS_VIEW_TYPE)) {
            const view = leaf.view;
            if (view instanceof StatsView) void view.reload();
        }
        for (const leaf of this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)) {
            const view = leaf.view;
            if (view instanceof ReviewView) void view.reload();
        }
        new Notice(tt('Card index rebuilt.'));
    }

    /**
     * Re-run markdown rendering in open notes. The card badge is injected by a
     * post-processor that reads a setting, so toggling it needs a re-render
     * rather than a reload.
     */
    rerenderNotes(): void {
        for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.getMode() === 'preview') {
                view.previewMode.rerender(true);
            }
        }
    }

    /**
     * A card was saved by something other than the views - the editor split in
     * `tempEdit.ts` writes straight into the JSON. Repaint what is on screen
     * without rebuilding the review session: same card, same side.
     */
    notifyCardEdited(): void {
        if (this.cardRefreshTimer !== null) window.clearTimeout(this.cardRefreshTimer);
        this.cardRefreshTimer = window.setTimeout(() => {
            this.cardRefreshTimer = null;
            for (const leaf of this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)) {
                const view = leaf.view;
                if (view instanceof ReviewView) view.refreshCurrentCard();
            }
            for (const leaf of this.app.workspace.getLeavesOfType(BROWSE_VIEW_TYPE)) {
                const view = leaf.view;
                if (view instanceof BrowseView) void view.reload();
            }
        }, 300);
    }

    /**
     * "Study more today": raise the review limit for the rest of this session.
     * Only due cards can fill the gap, so nothing is studied early by it.
     */
    boostReviewLimit(): void {
        this.reviewLimitBoost += this.boostStepSize();
    }

    /** Extra cards one "study more today" adds: set, or a tenth of the limit. */
    boostStepSize(): number {
        if (this.settings.boostStep > 0) return this.settings.boostStep;
        return Math.max(10, Math.round(this.settings.maxReviewsPerDay / 10));
    }

    /** Recreate both stores after the library folder changes. */
    rebuildStores(): void {
        this.store = new CardStore(this.app, this.settings.libraryFolder);
        this.reviews = new ReviewStore(this.app, this.settings.libraryFolder);
        // Warm the new library so badges and lists see it right away.
        void this.store.list().catch(() => undefined);
    }

    // ----- Generation -----

    /**
     * A note's outline: its headings and list items, with `==highlight==`
     * turned into holes - the same convention a cloze card uses, so a note
     * written for one can produce the other.
     */
    mapTextFromNote(markdown: string): string {
        const body = markdown
            .replace(/^---\n[\s\S]*?\n---\n/, '')
            .replace(/```[\s\S]*?```/g, '');
        // Everything in the note takes part: headings and list items keep their
        // shape, and a paragraph between them becomes its own node (joined into
        // one line, so a wrapped paragraph is one node, not five).
        const outline: string[] = [];
        let paragraph: string[] = [];
        const flush = (): void => {
            if (paragraph.length === 0) return;
            outline.push(`- ${paragraph.join(' ').trim()}`);
            paragraph = [];
        };
        for (const line of body.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) {
                flush();
                continue;
            }
            if (/^#{1,6}\s/.test(trimmed) || /^\s*(?:[-*+]|\d+[.)])\s/.test(line)) {
                flush();
                outline.push(line);
                continue;
            }
            paragraph.push(trimmed);
        }
        flush();
        const text = outline.join('\n');
        // Same conversion a cloze card gets: ==text== becomes a hole, and a
        // following %%note%% becomes that hole's hint.
        return selectionToClozeText(text);
    }

    /** A selection is already an outline: same cloze conversion, line by line. */
    mapTextFromSelection(selection: string): string {
        return selectionToClozeText(selection);
    }

    async generateMapFromFile(file: TFile): Promise<void> {
        const markdown = await this.app.vault.read(file);
        const text = this.mapTextFromNote(markdown);
        if (!text.trim()) {
            new Notice(tt('No headings or list items in this note.'));
            return;
        }
        new MapPanelModal(this.app, this, file.path, undefined, text).open();
    }

    async generateMapFromNote(): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice(tt('Open a note first.'));
            return;
        }
        await this.generateMapFromFile(file);
    }

    async generateFromNote(kind: 'qa' | 'cloze'): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice(tt('Open a note first.'));
            return;
        }
        await this.generateFromFile(file, kind);
    }

    async generateFromFile(file: TFile, kind: 'qa' | 'cloze'): Promise<void> {
        const markdown = await this.app.vault.read(file);
        await this.generateFromMarkdown(markdown, file.path, kind);
    }

    async generateFromSelection(): Promise<void> {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = view?.editor;
        if (!view || !editor || !view.file) {
            new Notice(tt('Open a note first.'));
            return;
        }
        const from = editor.getCursor('from').line;
        const to = editor.getCursor('to').line;
        const range: LineRange = {
            from: Math.min(from, to),
            to: Math.max(from, to),
        };
        await this.generateFromMarkdown(editor.getValue(), view.file.path, 'both', range);
    }

    private async generateFromMarkdown(
        markdown: string,
        path: string,
        kind: 'qa' | 'cloze' | 'both',
        range?: LineRange,
    ): Promise<void> {
        const drafts: CardDraft[] = [];
        if (kind === 'qa' || kind === 'both') {
            drafts.push(...extractMarkedHeadings(markdown, this.settings.markerSymbol, range));
        }
        if (kind === 'cloze' || kind === 'both') {
            drafts.push(...extractClozeLists(markdown, range));
        }

        if (drafts.length === 0) {
            const hint = kind === 'qa'
                ? `No marked heading found (a heading containing "${this.settings.markerSymbol}").`
                : 'No list with ==highlights== found.';
            new Notice(hint);
            return;
        }
        new CardPreviewModal(this.app, drafts, path, this).open();
    }

    // ----- Manual panels -----

    async newCard(): Promise<void> {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        // Defensive: some editor implementations return a selection object
        // instead of a string, which used to be pasted as "[object Object]".
        const rawSelection = view?.editor?.getSelection();
        const selection = typeof rawSelection === 'string' ? rawSelection : '';
        new CardTypeModal(this.app, this, view?.file?.path ?? '', selection).open();
    }

    /**
     * Image occlusion card: use the given image, or pull one from the
     * clipboard (a screenshot, for example) and save it into the library.
     */
    /**
     * Image occlusion from the editor without touching any menu: put the
     * cursor on (or select) an image embed and run the command.
     */
    async occlusionFromCursor(): Promise<void> {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const editor = view?.editor;
        if (!view || !editor || !view.file) {
            new Notice(tt('Open a note first.'));
            return;
        }
        const selection = editor.getSelection();
        const text = selection || editor.getLine(editor.getCursor().line);
        const path = this.imagePathFromMarkdown(text, view.file.path);
        if (!path) {
            new Notice(tt('No image on this line. Put the cursor on an ![[image]] line, or select the image embed.'));
            return;
        }
        new ImagePanelModal(this.app, this, path, view.file.path).open();
    }

    /** First image embed in a piece of Markdown, resolved to a vault path. */
    private imagePathFromMarkdown(text: string, sourcePath: string): string | null {
        // ![[image.png]] / ![[image.png|300]]
        const wiki = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/.exec(text);
        if (wiki) {
            const dest = this.app.metadataCache.getFirstLinkpathDest(wiki[1].trim(), sourcePath);
            return dest ? dest.path : null;
        }
        // ![alt](path)
        const markdown = /!\[[^\]]*\]\(([^)]+)\)/.exec(text);
        if (markdown) {
            const dest = this.app.metadataCache.getFirstLinkpathDest(markdown[1].trim(), sourcePath);
            return dest ? dest.path : null;
        }
        return null;
    }

    async newImageCard(imagePath?: string): Promise<void> {
        const path = imagePath ?? await this.clipboardImagePath();
        if (!path) {
            new Notice(tt('Put an image on the clipboard first, or right-click an image in a note.'));
            return;
        }
        new ImagePanelModal(this.app, this, path, this.app.workspace.getActiveFile()?.path ?? '').open();
    }

    /**
     * Read an image from the system clipboard and copy it into the library.
     * Returns null when the clipboard holds no image (or the browser refuses
     * permission - the caller offers Ctrl+V and a file picker instead).
     */
    async clipboardImagePath(): Promise<string | null> {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = item.types.find((entry) => entry.startsWith('image/'));
                if (!type) continue;
                const blob = await item.getType(type);
                return await this.writeLibraryImage(await blob.arrayBuffer(), type.split('/')[1] ?? 'png');
            }
        } catch {
            // No clipboard permission or no image - handled by the caller.
        }
        return null;
    }

    /** Copy a picked image file into the library. Null when it cannot be written. */
    async importImageFile(file: File): Promise<string | null> {
        try {
            const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
            return await this.writeLibraryImage(await file.arrayBuffer(), ext);
        } catch {
            return null;
        }
    }

    private async writeLibraryImage(buffer: ArrayBuffer, ext: string): Promise<string> {
        const dir = normalizePath(`${this.settings.libraryFolder}/images`);
        if (!this.app.vault.getAbstractFileByPath(dir)) {
            await this.app.vault.createFolder(dir);
        }
        const safeExt = ext.replace(/[^a-z0-9]/gi, '') || 'png';
        const path = normalizePath(`${dir}/${Date.now()}.${safeExt}`);
        await this.app.vault.createBinary(path, buffer);
        return path;
    }

    /**
     * Turn an app:// image URL back into a vault path.
     *
     * Obsidian serves images as app://<vault-hash>/<ABSOLUTE file path>?<mtime>,
     * e.g. app://4999.../F:/Vault/Note/Pasted image 1.png?179472. The absolute
     * path has to be trimmed to the vault root before it means anything to
     * getAbstractFileByPath.
     */
    private vaultPathFromImageSrc(src: string): string | null {
        try {
            const url = new URL(src);
            if (url.protocol !== 'app:') return null;
            const absolute = decodeURIComponent(url.pathname).replace(/^\/+/, '');

            let relative = absolute;
            const adapter = this.app.vault.adapter;
            if (adapter instanceof FileSystemAdapter) {
                const base = adapter.getBasePath().replace(/\\/g, '/').replace(/\/+$/, '');
                if (absolute.startsWith(base + '/')) {
                    relative = absolute.slice(base.length + 1);
                }
            }

            return this.app.vault.getAbstractFileByPath(relative) ? relative : null;
        } catch {
            return null;
        }
    }

    async openReview(): Promise<void> {
        let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE)[0] ?? null;
        if (!leaf) {
            // Main area tab - reviewing is a primary activity, not a sidebar.
            leaf = this.app.workspace.getLeaf('tab');
            await leaf.setViewState({ type: REVIEW_VIEW_TYPE, active: true });
        }
        void this.app.workspace.revealLeaf(leaf);
        const view = leaf.view;
        if (view instanceof ReviewView) await view.reload();
    }

    async openBrowse(cardId?: string): Promise<void> {
        let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(BROWSE_VIEW_TYPE)[0] ?? null;
        if (!leaf) {
            leaf = this.app.workspace.getLeaf('tab');
            await leaf.setViewState({ type: BROWSE_VIEW_TYPE, active: true });
        }
        void this.app.workspace.revealLeaf(leaf);
        const view = leaf.view;
        if (!(view instanceof BrowseView)) return;
        await view.reload();
        if (cardId) view.selectCard(cardId);
    }

    async openStats(): Promise<void> {
        let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(STATS_VIEW_TYPE)[0] ?? null;
        if (!leaf) {
            leaf = this.app.workspace.getLeaf('tab');
            await leaf.setViewState({ type: STATS_VIEW_TYPE, active: true });
        }
        void this.app.workspace.revealLeaf(leaf);
        const view = leaf.view;
        if (view instanceof StatsView) await view.reload();
    }

    /**
     * Switch the page a fakecard tab shows (the nav strip below Statistics /
     * Browse). An already-open page is revealed and refreshed instead, so a
     * review session living in its own tab survives navigation.
     */
    async navigateTo(page: FakeCardPage, from: WorkspaceLeaf): Promise<void> {
        const type = page === 'stats'
            ? STATS_VIEW_TYPE
            : page === 'browse'
                ? BROWSE_VIEW_TYPE
                : REVIEW_VIEW_TYPE;

        const existing = this.app.workspace.getLeavesOfType(type)[0] ?? null;
        if (existing && existing !== from) {
            void this.app.workspace.revealLeaf(existing);
            const view = existing.view;
            if (view instanceof StatsView) await view.reload();
            else if (view instanceof BrowseView) await view.reload();
            else if (view instanceof ReviewView) await view.reload();
            return;
        }

        // Replace the current tab: the nav is one surface, not a tab factory.
        await from.setViewState({ type, active: true });
    }

    // ----- External import -----

    async importFromClipboard(): Promise<void> {
        return importFromClipboardImpl(this);
    }

    async cleanOrphans(): Promise<void> {
        return cleanOrphansImpl(this);
    }

    async buildExamPlan(plan?: ExamPlanConfig): Promise<void> {
        return buildExamPlanImpl(this, plan);
    }

    async cleanGraduated(): Promise<void> {
        return cleanGraduatedImpl(this);
    }

    async exportCardsCsv(): Promise<void> {
        return exportCardsCsvImpl(this);
    }

    async exportCards(): Promise<void> {
        return exportCardsImpl(this);
    }

    importApkgFile(): void {
        importApkgFileImpl(this);
    }

    async handleProtocol(params: Record<string, string>): Promise<void> {
        const raw = params.data ?? params.cards;
        if (!raw) {
            new Notice(tt('fakecard: missing "data" parameter.'));
            return;
        }
        try {
            const count = await importCardJsonImpl(this, raw);
            new Notice(ttf('Imported {count} card(s).', { count }));
        } catch {
            new Notice(tt('fakecard: the data is not valid card JSON.'));
        }
    }

    async importCardJson(jsonText: string): Promise<number> {
        return importCardJsonImpl(this, jsonText);
    }

    // ----- Card factories -----

    createQaCard(front: string, back: string, sourcePath: string, deck = this.settings.defaultDeck || 'default', heading?: string): CardRecord {
        const now = new Date().toISOString();
        return {
            id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'qa',
            deck,
            front,
            back,
            source: { path: sourcePath, snapshot: front.slice(0, 80), heading },
            tags: [],
            created: now,
            updated: now,
        };
    }

    /**
     * One card PER mask group, the way Anki does it: each group gets its own
     * id, its own FSRS state and its own due date. A group that is easier than
     * another therefore schedules independently.
     */
    createImageCards(image: CardImage, sourcePath: string): CardRecord[] {
        const now = new Date().toISOString();
        const embed = `![[${image.path}]]`;
        return image.groups.map((group) => ({
            id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'image' as const,
            deck: this.settings.defaultDeck || 'default',
            front: embed,
            back: embed,
            image: { path: image.path, groups: [group] },
            source: { path: sourcePath, snapshot: image.path },
            tags: [],
            created: now,
            updated: now,
        }));
    }

    /**
     * One card PER cloze group (Anki model). All cards share the same
     * clozeText and a common clozeGroupId; each asks only its own group and
     * schedules independently.
     */
    createClozeCards(clozeText: string, sourcePath: string, sourceText?: string, deck = this.settings.defaultDeck || 'default'): CardRecord[] {
        // Accept ==highlight== from external tools; normalize to Anki syntax.
        const normalized = clozeText.includes('{{c')
            ? clozeText
            : clozeText.replace(/==([^=]+)==/g, (_m, inner: string) => `{{c1::${inner}}}`);

        const groups = clozeGroups(normalized);
        const wanted = groups.length > 0 ? groups : [1];
        const groupId = `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const now = new Date().toISOString();
        const fullText = renderCloze(normalized, new Set<number>());

        return wanted.map((group) => ({
            id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'cloze' as const,
            deck,
            front: renderCloze(normalized, new Set([group])),
            back: fullText,
            clozeText: normalized,
            clozeGroupId: groupId,
            clozeGroup: group,
            source: { path: sourcePath, snapshot: sourceText ?? normalized.slice(0, 80) },
            tags: [],
            created: now,
            updated: now,
        }));
    }

    /**
     * One card per hole group of an outline, exactly like a cloze card: the map
     * text is the single source of truth, `front`/`back` are derived for search
     * and export, and each card asks only its own group.
     */
    createMapCards(mapText: string, sourcePath: string, sourceText?: string, deck = this.settings.defaultDeck || 'default'): CardRecord[] {
        const root = parseOutline(mapText);
        const groups = outlineGroups(root);
        const wanted = groups.length > 0 ? groups : [1];
        const now = new Date().toISOString();
        const plain = mapText.replace(/\{\{c\d+::([\s\S]*?)(?:::[^}]*?)?\}\}/g, '$1');

        return wanted.map((group) => ({
            id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: 'map' as const,
            deck,
            front: plain,
            back: plain,
            mapText,
            mapGroup: group,
            source: { path: sourcePath, snapshot: sourceText ?? mapText.slice(0, 80) },
            tags: [],
            created: now,
            updated: now,
        }));
    }

    /**
     * Rewrite a whole map: every card cut from it shares `mapGroupId`, so an
     * edit that adds c3 or drops c2 has to change the set of cards, not just the
     * text of the one being edited.
     */
    /** Deck and tags are properties of the whole map, not of one of its cards. */
    async applyMapMeta(card: CardRecord, deck: string, tags: string[]): Promise<void> {
        const all = await this.store.list();
        const groupId = card.mapGroupId;
        for (const entry of all) {
            if (entry.type !== 'map') continue;
            const sameMap = groupId ? entry.mapGroupId === groupId : entry.id === card.id;
            if (!sameMap) continue;
            entry.deck = deck;
            entry.tags = [...tags];
            entry.updated = new Date().toISOString();
            await this.store.save(entry);
        }
    }

    async syncMapGroup(card: CardRecord, mapText: string): Promise<void> {
        const all = await this.store.list();
        const groupId = card.mapGroupId;
        const siblings = all.filter((entry) => entry.type === 'map'
            && (groupId ? entry.mapGroupId === groupId : entry.id === card.id));
        const groups = outlineGroups(parseOutline(mapText));
        const wanted = groups.length > 0 ? groups : [1];
        const plain = mapText.replace(/\{\{c\d+::([\s\S]*?)(?:::[^}]*?)?\}\}/g, '$1');
        const now = new Date().toISOString();

        for (const group of wanted) {
            const existing = siblings.find((entry) => entry.mapGroup === group);
            if (existing) {
                existing.mapText = mapText;
                existing.front = plain;
                existing.back = plain;
                existing.updated = now;
                await this.store.save(existing);
                continue;
            }
            const [fresh] = this.createMapCards(mapText, card.source.path, undefined, card.deck)
                .filter((entry) => entry.mapGroup === group);
            if (!fresh) continue;
            fresh.mapGroupId = groupId ?? card.id;
            fresh.tags = [...card.tags];
            await this.store.save(fresh);
        }

        for (const sibling of siblings) {
            if (wanted.includes(sibling.mapGroup ?? 1)) continue;
            await this.store.remove(sibling.id);
        }
    }

    createCards(draft: CardDraft, sourcePath: string): CardRecord[] {
        if (draft.type === 'cloze' && draft.clozeText) {
            return this.createClozeCards(draft.clozeText, sourcePath, draft.sourceText);
        }
        return [this.createQaCard(draft.front, draft.back, sourcePath, 'default', draft.heading)];
    }

    async syncClozeGroup(card: CardRecord, clozeText: string): Promise<void> {
        return syncClozeGroupImpl(this, card, clozeText);
    }
}

class CardTypeModal extends Modal {
    constructor(
        app: App,
        private plugin: FakeCardPlugin,
        private sourcePath: string,
        // Not `selection`: Obsidian's Modal already uses that name for the DOM
        // selection it restores on close, and `open()` overwrites the value.
        private selectionText: string,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: tt('New card') });
        contentEl.createEl('p', { cls: 'fakecard-help', text: tt('Pick a card type. The manual panel opens next.') });

        const list = contentEl.createDiv({ cls: 'fakecards-preview' });

        const row = (title: string, desc: string, onClick: () => void) => {
            const item = list.createDiv({ cls: 'fakecards-preview-row fakecards-clickable' });
            const body = item.createDiv({ cls: 'fakecards-preview-body' });
            body.createDiv({ cls: 'fakecards-preview-front', text: title });
            body.createDiv({ cls: 'fakecards-preview-back', text: desc });
            item.addEventListener('click', onClick);
        };

        row(tt('Q&A'), tt('Question on the front, answer on the back.'), () => {
            this.close();
            const { front, back } = splitHeadingSelection(this.selectionText);
            new QaPanelModal(this.app, this.plugin, this.sourcePath, undefined, back, undefined, front).open();
        });

        row(tt('Cloze'), tt('Anki {{c1::...}} masks, one or more groups.'), () => {
            this.close();
            new ClozePanelModal(
                this.app,
                this.plugin,
                this.sourcePath,
                undefined,
                selectionToClozeText(this.selectionText),
            ).open();
        });

        row(tt('Mind map'), tt('Paste an outline - headings and list items become a map, {{c1::...}} the masks.'), () => {
            this.close();
            // Highlights become holes and a following %%note%% becomes that
            // hole's hint, exactly as for a cloze card.
            new MapPanelModal(
                this.app,
                this.plugin,
                this.sourcePath,
                undefined,
                selectionToClozeText(this.selectionText),
            ).open();
        });

        row(tt('Image occlusion'), tt('Draw mask groups on an image (from the clipboard, or right-click any image).'), () => {
            this.close();
            void this.plugin.newImageCard();
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

class CardPreviewModal extends Modal {
    constructor(
        app: App,
        private drafts: CardDraft[],
        private sourcePath: string,
        private plugin: FakeCardPlugin,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: ttf('Preview {count} card(s)', { count: this.drafts.length }) });

        const selected = new Set<number>(this.drafts.map((_, index) => index));
        const list = contentEl.createDiv({ cls: 'fakecards-preview' });

        this.drafts.forEach((draft, index) => {
            const row = list.createDiv({ cls: 'fakecards-preview-row' });

            const checkbox = row.createEl('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selected.add(index);
                else selected.delete(index);
            });

            const body = row.createDiv({ cls: 'fakecards-preview-body' });
            body.createDiv({
                cls: 'fakecards-preview-type',
                text: draft.type === 'qa' ? tt('Q&A') : tt('Cloze'),
            });
            body.createDiv({ cls: 'fakecards-preview-front', text: draft.front });
            body.createDiv({ cls: 'fakecards-preview-back', text: draft.back });
        });

        new Setting(contentEl).addButton((button) => button
            .setButtonText(tt('Create cards'))
            .setCta()
            .onClick(async () => {
                let created = 0;
                for (const index of selected) {
                    const draft = this.drafts[index];
                    const cards = this.plugin.createCards(draft, this.sourcePath);
                    for (const card of cards) await this.plugin.store.save(card);
                    created += cards.length;
                }
                new Notice(ttf('Created {count} card(s).', { count: created }));
                this.close();
            }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}


