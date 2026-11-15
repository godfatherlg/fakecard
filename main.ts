import { App, Editor, FileSystemAdapter, MarkdownFileInfo, MarkdownView, Menu, Modal, Notice, Plugin, Setting, TAbstractFile, TFile, WorkspaceLeaf, normalizePath } from 'obsidian';
import type { CardImage, CardRecord } from './src/card';
import { clozeGroups, renderCloze, selectionToClozeText } from './src/cloze';
import { ClozePanelModal } from './src/clozePanel';
import { buildExamPlan as buildExamPlanImpl } from './src/examPlan';
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
} from './src/maintenance';
import { QaPanelModal } from './src/qaPanel';
import { ReviewView, REVIEW_VIEW_TYPE } from './src/reviewView';
import { BrowseView, BROWSE_VIEW_TYPE } from './src/browseView';
import { StatsView, STATS_VIEW_TYPE } from './src/statsView';
import { ReviewStore } from './src/reviews';
import { CardDraft, extractClozeLists, extractMarkedHeadings, LineRange, splitHeadingSelection } from './src/rules';
import { DEFAULT_SETTINGS, FakeCardSettings, FakeCardSettingTab } from './src/settings';
import { findSourceTarget } from './src/sourceLocate';
import { syncClozeGroup as syncClozeGroupImpl } from './src/sourceSync';
import { CardStore } from './src/store';

export default class FakeCardPlugin extends Plugin {
    settings: FakeCardSettings;
    store: CardStore;
    reviews: ReviewStore;


    /** Debounce handle for refreshing views after a settings change. */
    private refreshTimer: number | null = null;

    async onload() {
        await this.loadSettings();
        this.store = new CardStore(this.app, this.settings.libraryFolder);
        this.reviews = new ReviewStore(this.app, this.settings.libraryFolder);
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
        };
        this.registerEvent(this.app.vault.on('modify', onCardsChange));
        this.registerEvent(this.app.vault.on('create', onCardsChange));
        this.registerEvent(this.app.vault.on('delete', onCardsChange));
        this.addSettingTab(new FakeCardSettingTab(this.app, this));

        // ----- Generation from notes -----
        this.addCommand({
            id: 'generate-qa-from-note',
            name: 'Generate Q&A cards from the whole note',
            callback: () => {
                void this.generateFromNote('qa');
            },
        });

        this.addCommand({
            id: 'generate-cloze-from-note',
            name: 'Generate cloze cards from the whole note',
            callback: () => {
                void this.generateFromNote('cloze');
            },
        });

        this.addCommand({
            id: 'generate-from-selection',
            name: 'Generate cards from the selected lines',
            callback: () => {
                void this.generateFromSelection();
            },
        });

        // ----- Review / Browse (main area views) -----
        this.registerView(REVIEW_VIEW_TYPE, (leaf) => new ReviewView(leaf, this));
        this.registerView(BROWSE_VIEW_TYPE, (leaf) => new BrowseView(leaf, this));
        this.registerView(STATS_VIEW_TYPE, (leaf) => new StatsView(leaf, this));
        this.addRibbonIcon('table', 'fakecard: browse cards', () => {
            void this.openBrowse();
        });

        // Reading view: show a small badge next to the block a card came from.
        // The note file is never modified - this only injects an element into
        // the rendered DOM.
        this.registerMarkdownPostProcessor((el, ctx) => {
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
                const badge = target.createEl('span', {
                    cls: 'fakecard-source-badge',
                    text: '📇',
                    attr: { 'aria-label': 'fakecard: this block has cards' },
                });
                badge.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void this.openBrowse();
                });
            }
        });
        this.addCommand({
            id: 'review',
            name: 'Start reviewing',
            callback: () => {
                void this.openReview();
            },
        });
        this.addCommand({
            id: 'browse-cards',
            name: 'Browse and edit cards',
            callback: () => {
                void this.openBrowse();
            },
        });
        this.addCommand({
            id: 'new-image-card',
            name: 'New image occlusion card (from clipboard)',
            callback: () => {
                void this.newImageCard();
            },
        });
        this.addCommand({
            id: 'occlusion-from-cursor',
            name: 'Make occlusion card from the image at the cursor',
            callback: () => {
                void this.occlusionFromCursor();
            },
        });
        this.addCommand({
            id: 'statistics',
            name: 'Open statistics',
            callback: () => {
                void this.openStats();
            },
        });

        // ----- Manual panels -----
        this.addCommand({
            id: 'new-card',
            name: 'New card (manual)',
            callback: () => {
                void this.newCard();
            },
        });



        // ----- External AI import (no built-in model) -----
        this.addCommand({
            id: 'import-from-clipboard',
            name: 'Import cards from clipboard (JSON)',
            callback: () => {
                void this.importFromClipboard();
            },
        });

        this.addCommand({
            id: 'import-apkg',
            name: 'Import cards from Anki (.apkg)',
            callback: () => {
                this.importApkgFile();
            },
        });

        this.addCommand({
            id: 'export-cards',
            name: 'Export all cards (JSON)',
            callback: () => {
                void this.exportCards();
            },
        });

        this.addCommand({
            id: 'clean-orphans',
            name: 'Clean up orphan cards (source note deleted)',
            callback: () => {
                void this.cleanOrphans();
            },
        });

        this.addCommand({
            id: 'clean-graduated',
            name: 'Remove graduated child cards',
            callback: () => {
                void this.cleanGraduated();
            },
        });

        this.addCommand({
            id: 'reschedule-for-exam',
            name: 'Build the exam plan (spread cards until the exam)',
            callback: () => {
                void this.buildExamPlan();
            },
        });

        this.addCommand({
            id: 'open-library',
            name: 'Open the card library folder',
            callback: () => {
                void this.store.ensure();
                new Notice(`Card library: ${this.settings.libraryFolder}`);
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
                .setTitle('fakecard: new Q&A card from selection')
                .setIcon('help-circle')
                .onClick(() => {
                    const { front, back } = splitHeadingSelection(selection);
                    new QaPanelModal(this.app, this, file.path, undefined, back, undefined, front).open();
                }));
            menu.addItem((item) => item
                .setTitle('fakecard: new cloze card from selection')
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
                .setTitle('fakecard: generate Q&A cards')
                .setIcon('help-circle')
                .onClick(() => {
                    void this.generateFromFile(file, 'qa');
                }));
            menu.addItem((item) => item
                .setTitle('fakecard: generate cloze cards')
                .setIcon('layers')
                .onClick(() => {
                    void this.generateFromFile(file, 'cloze');
                }));
            menu.addItem((item) => item
                .setTitle('fakecard: new card')
                .setIcon('edit')
                .onClick(() => {
                    void this.newCard();
                }));
        }));
    }

    async loadSettings() {
        const loaded = (await this.loadData()) as Partial<FakeCardSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded ?? {});
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.scheduleViewRefresh();
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
        }, 250);
    }

    /** Recreate both stores after the library folder changes. */
    rebuildStores(): void {
        this.store = new CardStore(this.app, this.settings.libraryFolder);
        this.reviews = new ReviewStore(this.app, this.settings.libraryFolder);
        // Warm the new library so badges and lists see it right away.
        void this.store.list().catch(() => undefined);
    }

    // ----- Generation -----

    async generateFromNote(kind: 'qa' | 'cloze'): Promise<void> {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice('Open a note first.');
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
            new Notice('Open a note first.');
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
            new Notice('Open a note first.');
            return;
        }
        const selection = editor.getSelection();
        const text = selection || editor.getLine(editor.getCursor().line);
        const path = this.imagePathFromMarkdown(text, view.file.path);
        if (!path) {
            new Notice('No image on this line. Put the cursor on an ![[image]] line, or select the image embed.');
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
            new Notice('Put an image on the clipboard first, or right-click an image in a note.');
            return;
        }
        new ImagePanelModal(this.app, this, path, this.app.workspace.getActiveFile()?.path ?? '').open();
    }

    private async clipboardImagePath(): Promise<string | null> {
        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const type = item.types.find((entry) => entry.startsWith('image/'));
                if (!type) continue;
                const blob = await item.getType(type);
                const buffer = await blob.arrayBuffer();
                const ext = type.split('/')[1] ?? 'png';
                const dir = normalizePath(`${this.settings.libraryFolder}/images`);
                if (!this.app.vault.getAbstractFileByPath(dir)) {
                    await this.app.vault.createFolder(dir);
                }
                const path = normalizePath(`${dir}/${Date.now()}.${ext}`);
                await this.app.vault.createBinary(path, buffer);
                return path;
            }
        } catch {
            // No clipboard permission or no image - handled by the caller.
        }
        return null;
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

    async openBrowse(): Promise<void> {
        let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(BROWSE_VIEW_TYPE)[0] ?? null;
        if (!leaf) {
            leaf = this.app.workspace.getLeaf('tab');
            await leaf.setViewState({ type: BROWSE_VIEW_TYPE, active: true });
        }
        void this.app.workspace.revealLeaf(leaf);
        const view = leaf.view;
        if (view instanceof BrowseView) await view.reload();
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

    // ----- External import -----

    async importFromClipboard(): Promise<void> {
        return importFromClipboardImpl(this);
    }

    async cleanOrphans(): Promise<void> {
        return cleanOrphansImpl(this);
    }

    async buildExamPlan(): Promise<void> {
        return buildExamPlanImpl(this);
    }

    async cleanGraduated(): Promise<void> {
        return cleanGraduatedImpl(this);
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
            new Notice('fakecard: missing "data" parameter.');
            return;
        }
        try {
            const count = await importCardJsonImpl(this, raw);
            new Notice(`Imported ${count} card(s).`);
        } catch {
            new Notice('fakecard: the data is not valid card JSON.');
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
        private selection: string,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: 'New card' });
        contentEl.createEl('p', { cls: 'fakecard-help', text: 'Pick a card type. The manual panel opens next.' });

        const list = contentEl.createEl('div', { cls: 'fakecards-preview' });

        const row = (title: string, desc: string, onClick: () => void) => {
            const item = list.createEl('div', { cls: 'fakecards-preview-row fakecards-clickable' });
            const body = item.createEl('div', { cls: 'fakecards-preview-body' });
            body.createEl('div', { cls: 'fakecards-preview-front', text: title });
            body.createEl('div', { cls: 'fakecards-preview-back', text: desc });
            item.addEventListener('click', onClick);
        };

        row('Q&A', 'Question on the front, answer on the back.', () => {
            this.close();
            const { front, back } = splitHeadingSelection(this.selection);
            new QaPanelModal(this.app, this.plugin, this.sourcePath, undefined, back, undefined, front).open();
        });

        row('Cloze', 'Anki {{c1::...}} holes, one or more groups.', () => {
            this.close();
            new ClozePanelModal(
                this.app,
                this.plugin,
                this.sourcePath,
                undefined,
                selectionToClozeText(this.selection),
            ).open();
        });

        row('Image occlusion', 'Draw mask groups on an image (from the clipboard, or right-click any image).', () => {
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
        contentEl.createEl('h2', { text: `Preview ${this.drafts.length} card(s)` });

        const selected = new Set<number>(this.drafts.map((_, index) => index));
        const list = contentEl.createEl('div', { cls: 'fakecards-preview' });

        this.drafts.forEach((draft, index) => {
            const row = list.createEl('div', { cls: 'fakecards-preview-row' });

            const checkbox = row.createEl('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selected.add(index);
                else selected.delete(index);
            });

            const body = row.createEl('div', { cls: 'fakecards-preview-body' });
            body.createEl('div', {
                cls: 'fakecards-preview-type',
                text: draft.type === 'qa' ? 'Q&A' : 'Cloze',
            });
            body.createEl('div', { cls: 'fakecards-preview-front', text: draft.front });
            body.createEl('div', { cls: 'fakecards-preview-back', text: draft.back });
        });

        new Setting(contentEl).addButton((button) => button
            .setButtonText('Create cards')
            .setCta()
            .onClick(async () => {
                let created = 0;
                for (const index of selected) {
                    const draft = this.drafts[index];
                    const cards = this.plugin.createCards(draft, this.sourcePath);
                    for (const card of cards) await this.plugin.store.save(card);
                    created += cards.length;
                }
                new Notice(`Created ${created} card(s).`);
                this.close();
            }));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}


