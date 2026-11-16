import { ItemView, MarkdownRenderer, Menu, Notice, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import { createEmptyCard, fsrs, Rating } from 'ts-fsrs';
import type { Card as FsrsCard, Grade } from 'ts-fsrs';
import type { CardRecord } from './card';
import { suggestedAnswerSeconds } from './answerTime';
import { ChildCardPromptModal } from './childPrompt';
import { hardStreakScore, isGraduatable } from './childStreak';
import { clozeGroups, renderClozeHtml } from './cloze';
import { ClozePanelModal } from './clozePanel';
import { ImagePanelModal } from './imagePanel';
import { daysLeft, nextExamPlan } from './examPlan';
import { tt, ttf } from './i18n';
import { RatingKeys, keyLabel, matchesKey } from './keys';
import { buildReviewQueue, ReviewQueue } from './queue';
import { QaPanelModal } from './qaPanel';
import { jumpToCardSource } from './sourceJump';
import type FakeCardPlugin from '../main';

export const REVIEW_VIEW_TYPE = 'fakecard-review';

/**
 * Dedicated review view (not a modal).
 *
 * One card at a time: the front is rendered, "Show answer" reveals the back,
 * then four rating buttons schedule it with FSRS. Works for Q&A and cloze
 * cards; a cloze card hides the first group on the front and reveals
 * everything on the back (group-by-group review comes later).
 */
export class ReviewView extends ItemView {
    private cards: CardRecord[] = [];
    /** Queue read while a restored view waits for the layout, see `onOpen`. */
    private prefetched: Promise<ReviewQueue> | null = null;
    private index = 0;
    private revealed = false;
    private loading = true;
    /** Deck selected in the toolbar; 'all' reviews every deck. */
    private deckFilter = 'all';
    private decks: string[] = ['default'];
    /** When the current card was first shown, for the review duration. */
    private cardShownAt = 0;
    /** Interval that reveals the answer-time hint; cleared on every render. */
    private hintTimer: number | null = null;
    /** Handler that keeps the hint's clock from running while hidden. */
    private hintVisibilityHandler: (() => void) | null = null;
    /** Ratings that can still be taken back with Ctrl+Z, newest last. */
    private undoStack: UndoEntry[] = [];
    /** Link under the pointer, waiting for Ctrl+hover to turn into a preview. */
    private hoverLink: HTMLElement | null = null;
    /** Mouse event over that link, replayed when the preview is raised. */
    private hoverEvent: MouseEvent | null = null;
    private hoverParent: HTMLElement | null = null;
    private hoverTimer: number | null = null;
    /** Link whose preview is already open, so one dwell asks only once. */
    private hoverPreviewed: HTMLElement | null = null;
    /** Ctrl/Cmd state, tracked so a key press over a still pointer counts. */
    private hoverModifier = false;
    private hoverSourcePath = '';

    constructor(leaf: WorkspaceLeaf, private plugin: FakeCardPlugin) {
        super(leaf);
    }

    getViewType(): string {
        return REVIEW_VIEW_TYPE;
    }

    getDisplayText(): string {
        return tt('Review');
    }

    getIcon(): string {
        return 'layers';
    }

    async onOpen(): Promise<void> {
        // One listener for the whole view: reveal, ratings and undo all depend
        // on the current state, so binding per render would go stale.
        this.registerDomEvent(activeDocument, 'keydown', (event: KeyboardEvent) => this.onKeyDown(event));
        // Pressing or releasing Ctrl over a link that is already under the
        // pointer produces no mouse event, so the dwell has to watch keys too.
        this.registerDomEvent(activeDocument, 'keydown', (event: KeyboardEvent) => this.onHoverModifierKey(event));
        this.registerDomEvent(activeDocument, 'keyup', (event: KeyboardEvent) => this.onHoverModifierKey(event));
        // A leaf restored with the workspace opens while the layout is still
        // being assembled. Painting a card then renders it into a leaf that is
        // not attached yet, and its wiki links come out without the classes and
        // click handling Obsidian adds once the layout is up: the text is there
        // but every link in it is dead until something paints it again. A card
        // is therefore painted only after the layout is ready - a view opened
        // later has nothing to wait for and paints straight away.
        //
        // `onOpen` itself must not wait: the workspace waits for the view it is
        // restoring, so blocking here stalls the whole restore until the
        // deferred-view timeout gives up, which is worse than the bug.
        //
        // Nothing is painted in that window either. The pane is still being
        // assembled around it, so a "Loading..." placeholder has no reader
        // until the leaf is attached - and by then the card is a moment away,
        // which makes the placeholder a flash of its own. The pane stays empty
        // until the card is painted, like any other deferred view.
        if (this.app.workspace.layoutReady) {
            await this.reload();
            return;
        }
        this.loading = true;
        // Reading the queue does not depend on the layout, so it runs during the
        // wait: the card is then painted in the same frame the layout becomes
        // ready instead of popping in a moment after the rest of the workspace.
        this.prefetched = buildReviewQueue(this.plugin, this.deckFilter);
        this.app.workspace.onLayoutReady(() => {
            void this.reload();
        });
    }

    async reload(): Promise<void> {
        this.loading = true;

        // A restored view starts this while it waits for the layout, so the
        // queue is already in memory by the time the card can be painted.
        let queue = this.prefetched ? await this.prefetched.catch(() => null) : null;
        this.prefetched = null;
        if (!queue) queue = await buildReviewQueue(this.plugin, this.deckFilter);

        if (queue.expired > 0) {
            new Notice(queue.expired === 1
                ? tt('The exam day has passed - that plan was removed and its cards are back on the long-term schedule.')
                : ttf('{count} exam plans have passed and were removed. Their cards are back on the long-term schedule.', { count: queue.expired }));
        }

        this.decks = queue.decks;
        this.cards = queue.cards;
        this.index = 0;
        this.revealed = false;
        this.loading = false;
        this.cardShownAt = Date.now();
        this.render();
    }

    /** Deck the pane is filtered to; the status bar follows it. */
    get deck(): string {
        return this.deckFilter;
    }

    private render(): void {
        const container = this.contentEl;
        this.clearAnswerTimeHint();
        // The body element is rebuilt below; any tracked link is now detached.
        this.endHoverDwell();
        container.empty();
        container.addClass('fakecard-review');
        // Settings -> Card display: a centred column, or the whole pane.
        container.toggleClass('is-wide', this.plugin.settings.reviewLayout === 'wide');
        // Every rating moves the session on, so the status bar follows the pane
        // from here instead of from its own timer.
        this.plugin.refreshStatusBar();

        if (this.loading) {
            container.createEl('p', { text: tt('Loading…') });
            return;
        }

        if (this.cards.length === 0) {
            container.createEl('h2', { text: tt('No cards yet') });
            container.createEl('p', { text: tt('Generate cards from a note or create one manually first.') });
            return;
        }

        if (this.index >= this.cards.length) {
            this.renderDone(container);
            return;
        }

        const card = this.cards[this.index];

        // Toolbar: deck and progress on the left, small icon actions on the
        // right. Anything that is not about answering the card is an icon with
        // a tooltip, so the card itself stays the loudest thing on screen.
        const bar = container.createDiv({ cls: 'fakecard-review-bar' });
        const meta = bar.createDiv({ cls: 'fakecard-review-meta' });

        const deckSelect = meta.createEl('select', { cls: 'dropdown fakecard-review-deck' });
        for (const deck of ['all', ...this.decks]) {
            const option = deckSelect.createEl('option');
            option.value = deck;
            option.textContent = deck === 'all' ? tt('All decks') : deck;
        }
        deckSelect.value = this.deckFilter;
        deckSelect.addEventListener('change', () => {
            this.deckFilter = deckSelect.value;
            void this.reload();
        });

        // The counter is the only number in the bar, so it carries the weight:
        // the card being reviewed is large and dark, the total sits behind it.
        const progress = meta.createDiv({
            cls: 'fakecard-review-progress',
            attr: { 'aria-label': ttf('Card {n} of {total}', { n: this.index + 1, total: this.cards.length }) },
        });
        progress.createSpan({
            cls: 'fakecard-review-progress-current',
            text: String(this.index + 1),
        });
        progress.createSpan({
            cls: 'fakecard-review-progress-total',
            text: `/ ${this.cards.length}`,
        });

        const actions = bar.createDiv({ cls: 'fakecard-review-actions' });

        // Countdown of the exam finishing first; plans with a later date still
        // show up in Settings.
        const nextPlan = nextExamPlan(this.plugin.settings.examPlans ?? []);
        if (nextPlan) {
            const days = daysLeft(nextPlan.date);
            actions.createSpan({
                cls: 'fakecard-review-time',
                text: days === 0 ? `📅 ${tt('today')}` : `📅 ${ttf('{days}d', { days })}`,
                attr: {
                    title: days === 0
                        ? ttf('{name}: exam today', { name: nextPlan.name })
                        : ttf('{name}: days until the exam', { name: nextPlan.name }),
                },
            });
        }

        const iconButton = (icon: string, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement => {
            // setTooltip only: a native `title` here would pop a second, black
            // tooltip next to the one Obsidian draws from aria-label.
            const button = actions.createEl('button', { cls: 'fakecard-review-icon' });
            setTooltip(button, title);
            setIcon(button, icon);
            button.addEventListener('click', onClick);
            return button;
        };

        iconButton('arrow-up-right', tt('Open the note this card came from'), () => {
            void jumpToCardSource(this.app, card);
        });
        if (this.plugin.settings.childCardsEnabled && !card.childOf) {
            // Always present, but only highlighted once the recent reviews add
            // up to the failing score: before that the click explains the
            // trade-off and waits for a confirmation.
            const childButton = iconButton(
                'git-branch',
                tt('Pause this card and study it through a simpler stand-in'),
                (event) => { void this.requestChildCard(card, event); },
            );
            void this.markChildArmed(childButton, card);
        }
        iconButton('pencil', tt('Edit this card'), () => {
            this.openEditor(card);
        });

        if (this.plugin.settings.answerTimeHint) {
            this.startAnswerTimeHint(bar, card);
        }

        // The card itself: centred while it is short, scrolling normally once
        // a long answer does not fit.
        const body = container.createDiv({ cls: 'fakecard-review-body' });
        this.attachHoverPreview(body, card);

        if (!this.revealed) {
            // Front. Q&A questions are centred; cloze fronts keep the text
            // flow; image cards draw the picture with the first group masked.
            const frontEl = body.createDiv({ cls: 'fakecard-review-front' });
            if (card.type === 'qa') frontEl.addClass('fakecard-qa-front');
            this.renderCardBody(frontEl, card, false);

            // Outside the scrolling body, in the slot the rating row will
            // occupy: the button keeps its place when the card flips instead
            // of travelling up and down the pane with the question.
            const footer = container.createDiv({ cls: 'fakecard-review-footer' });
            const button = footer.createEl('button', { cls: 'fakecard-review-show' });
            button.createSpan({ text: tt('Show answer') });
            button.createSpan({ cls: 'fakecard-rate-key', text: tt('Space') });
            button.addEventListener('click', () => this.reveal());
            return;
        }

        if (card.type === 'qa') {
            // Q&A keeps both sides: question above, answer below.
            const frontEl = body.createDiv({ cls: 'fakecard-review-front fakecard-qa-front' });
            this.renderCardBody(frontEl, card, false);
            const backEl = body.createDiv({ cls: 'fakecard-review-back' });
            this.renderCardBody(backEl, card, true);
        } else {
            // Cloze and image cards reveal in place - the same block shows the
            // answer, there is no separate answer side.
            const bodyEl = body.createDiv({ cls: 'fakecard-review-front' });
            this.renderCardBody(bodyEl, card, true);
        }

        // Rating buttons: one cell each, with the shortcut under the label.
        const ratings = container.createDiv({ cls: 'fakecard-review-ratings' });
        const keys = this.ratingKeys();
        const options: Array<[Rating, string, string, string]> = [
            [Rating.Again, tt('Again'), 'fakecard-again', keys.again],
            [Rating.Hard, tt('Hard'), 'fakecard-hard', keys.hard],
            [Rating.Good, tt('Good'), 'fakecard-good', keys.good],
            [Rating.Easy, tt('Easy'), 'fakecard-easy', keys.easy],
        ];
        for (const [rating, label, cls, key] of options) {
            const button = ratings.createEl('button', { cls: `fakecard-rate ${cls}` });
            button.createSpan({ cls: 'fakecard-rate-label', text: label });
            const hint = keyLabel(key);
            if (hint) button.createSpan({ cls: 'fakecard-rate-key', text: tt(hint) });
            button.addEventListener('click', () => {
                void this.rate(rating);
            });
        }
    }

    private renderCardBody(el: HTMLElement, card: CardRecord, revealed: boolean): void {
        if (card.type === 'image' && card.image) {
            this.renderImageBody(el, card, revealed);
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
            this,
        );
    }

    private renderImageBody(el: HTMLElement, card: CardRecord, revealed: boolean): void {
        const image = card.image;
        if (!image) return;
        const wrap = el.createDiv({ cls: 'fakecard-image-wrap' });
        const img = wrap.createEl('img', { cls: 'fakecard-image' });
        img.src = this.app.vault.adapter.getResourcePath(image.path);

        if (revealed || image.groups.length === 0) return;

        const firstId = image.groups[0].id;
        const overlay = wrap.createDiv({ cls: 'fakecard-image-overlay is-static' });
        for (const group of image.groups) {
            const isAsked = group.id === firstId;
            // The asked group is always hidden; other groups are hidden too
            // unless "mask all groups" is switched off.
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
    }

    private frontText(card: CardRecord): string {
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

    /**
     * How badly the card has been failing lately. Every Hard adds 1 and every
     * Again adds `childAgainScore`; any Good or Easy ends the run.
     */
    private async childFailingScore(card: CardRecord): Promise<number> {
        const streak = Math.max(1, this.plugin.settings.childHardStreak);
        // Wide window on purpose: an imported Anki history is often months old
        // and must still count towards the failing streak.
        const logs = await this.plugin.reviews.recentForCard(card.id, streak, 365);
        return hardStreakScore(
            logs.map((log) => log.rating),
            this.plugin.settings.childAgainScore,
        );
    }

    /** Colour the button once the card has failed often enough to deserve one. */
    private async markChildArmed(button: HTMLButtonElement, card: CardRecord): Promise<void> {
        const target = Math.max(1, this.plugin.settings.childHardStreak);
        const score = await this.childFailingScore(card);
        if (score < target || !button.isConnected) return;

        button.addClass('is-armed');
        setTooltip(button, tt('This card keeps failing - build a child card now'));
    }

    /**
     * The button is always available, but building a child pauses the parent.
     * Below the failing threshold that is a decision, not a misclick: explain
     * it and wait for Continue before the type menu opens.
     */
    private async requestChildCard(parent: CardRecord, event: MouseEvent): Promise<void> {
        if (!this.plugin.settings.childCardsEnabled) return;
        const at = { x: event.clientX, y: event.clientY };
        const target = Math.max(1, this.plugin.settings.childHardStreak);
        const score = await this.childFailingScore(parent);

        if (score >= target) {
            this.chooseChildType(parent, at);
            return;
        }

        new ChildCardPromptModal(this.app, score, target, () => {
            this.chooseChildType(parent, at);
        }).open();
    }

    /**
     * Offer the shapes a child card can take. The parent's own text seeds the
     * panel, so the user trims instead of retyping. An image parent can hand
     * its picture to a new occlusion card.
     */
    private chooseChildType(parent: CardRecord, at: { x: number; y: number }): void {
        if (!this.plugin.settings.childCardsEnabled) return;
        const menu = new Menu();
        menu.addItem((item) => item
            .setTitle(tt('Q&A child card'))
            .setIcon('file-text')
            .onClick(() => this.openChildPanel(parent, 'qa')));
        menu.addItem((item) => item
            .setTitle(tt('Cloze child card'))
            .setIcon('text-cursor-input')
            .onClick(() => this.openChildPanel(parent, 'cloze')));
        // Every card can get an image child: a text card just starts from an
        // empty panel and takes the picture from the clipboard or a file.
        menu.addItem((item) => item
            .setTitle(tt('Image occlusion child card'))
            .setIcon('image')
            .onClick(() => this.openChildPanel(parent, 'image')));
        menu.showAtPosition(at);
    }

    /**
     * Open a panel prefilled from the parent. The new card is linked through
     * childOf and never touches the parent's own text.
     */
    private openChildPanel(parent: CardRecord, type: 'qa' | 'cloze' | 'image'): void {
        const onSaved = (): void => {
            void this.attachChild(parent);
        };

        if (type === 'image') {
            // An empty path opens the panel in "pick an image" mode: the
            // parent has no picture, so the user pastes or imports one.
            new ImagePanelModal(
                this.app,
                this.plugin,
                parent.image?.path ?? '',
                parent.source.path,
                undefined,
                onSaved,
                parent.id,
            ).open();
            return;
        }

        if (type === 'cloze') {
            const seed = parent.type === 'cloze' && parent.clozeText
                ? parent.clozeText
                : parent.back;
            new ClozePanelModal(
                this.app,
                this.plugin,
                parent.source.path,
                undefined,
                seed,
                onSaved,
                parent.id,
            ).open();
            return;
        }

        new QaPanelModal(
            this.app,
            this.plugin,
            parent.source.path,
            undefined,
            parent.back,
            onSaved,
            parent.front,
            parent.id,
        ).open();
    }

    /**
     * Pause the parent once a child really exists. A panel that was dismissed
     * without saving must not leave the parent suspended with nothing to
     * study it through.
     */
    private async attachChild(parent: CardRecord): Promise<void> {
        const all = await this.plugin.store.list();
        if (!all.some((card) => card.childOf === parent.id)) return;

        parent.suspended = true;
        await this.plugin.store.save(parent);
        new Notice(tt('Child card created - parent paused.'));
        await this.reload();
    }

    /**
     * Obsidian's hover preview is raised by Markdown views: they listen for the
     * pointer over an internal link and send a `hover-link` workspace event to
     * the core Page preview plugin. This view renders its own markdown, so
     * nothing raised that event - normal links and fakelink's virtual links
     * both navigated on click but never showed a popover.
     *
     * Ctrl/Cmd+hover over a link raises the same preview here, but only after
     * the pointer rests on it. The first version hooked `mousemove`, so every
     * sweep across a card with Ctrl held popped whatever link it crossed.
     * Pressing Ctrl while the pointer already sits on a link counts as well:
     * that produces no mouse event, so the dwell watches the keyboard too.
     */
    private attachHoverPreview(el: HTMLElement, card: CardRecord): void {
        this.hoverSourcePath = card.source.path || this.app.workspace.getActiveFile()?.path || '';
        this.hoverParent = el;

        const linkAt = (event: MouseEvent): HTMLElement | null =>
            (event.target as HTMLElement | null)?.closest?.<HTMLElement>('a.internal-link') ?? null;

        el.addEventListener('mouseover', (event: MouseEvent) => {
            const link = linkAt(event);
            if (link) this.startHoverDwell(link, event);
        });
        el.addEventListener('mouseout', (event: MouseEvent) => {
            const link = linkAt(event);
            if (!link) return;
            const next = event.relatedTarget as HTMLElement | null;
            if (next && link.contains(next)) return;
            this.endHoverDwell();
        });
        // The body scrolls on its own: a still pointer can leave a link that
        // slides away underneath it without any mouse event.
        el.addEventListener('scroll', () => this.endHoverDwell(), { passive: true });
    }

    /** Pointer arrived on a link: start (or keep) the dwell that may preview. */
    private startHoverDwell(link: HTMLElement, event: MouseEvent): void {
        this.hoverModifier = event.ctrlKey || event.metaKey;
        this.hoverEvent = event;
        if (link === this.hoverLink) return;
        this.clearHoverTimer();
        this.hoverLink = link;
        this.hoverPreviewed = null;
        this.scheduleHoverPreview(400);
    }

    private scheduleHoverPreview(delay: number): void {
        this.clearHoverTimer();
        this.hoverTimer = window.setTimeout(() => {
            this.hoverTimer = null;
            this.showHoverPreview();
        }, delay);
    }

    private showHoverPreview(): void {
        const link = this.hoverLink;
        const event = this.hoverEvent;
        if (!link || !event || !this.hoverModifier) return;
        if (this.hoverPreviewed === link) return;

        const linktext = link.getAttribute('data-href') ?? link.getAttribute('href');
        if (!linktext) return;

        this.hoverPreviewed = link;
        this.app.workspace.trigger('hover-link', {
            event,
            source: 'preview',
            hoverParent: this.hoverParent ?? link,
            targetEl: link,
            linktext,
            sourcePath: this.hoverSourcePath,
        });
    }

    /** Ctrl/Cmd pressed or released while the pointer is already resting. */
    private onHoverModifierKey(event: KeyboardEvent): void {
        // Key events can target the document itself; only a modal or menu in
        // front of the card should keep Ctrl quiet.
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('.modal-container') || target?.closest?.('.menu')) return;

        const held = event.ctrlKey || event.metaKey;

        // Ctrl+<key> is a shortcut (undo, reveal, rating), not a hover: drop a
        // preview that is still waiting for its dwell instead of popping it
        // over the card mid-shortcut.
        if (held && event.type === 'keydown' && event.key !== 'Control' && event.key !== 'Meta') {
            this.clearHoverTimer();
            return;
        }

        const wasHeld = this.hoverModifier;
        this.hoverModifier = held;
        if (held === wasHeld) return;

        if (held) {
            // Short dwell: the pointer is already parked, so this press is the
            // hover. Long enough that Ctrl+S or Ctrl+Z over a link stay quiet.
            if (this.hoverLink && this.hoverPreviewed !== this.hoverLink) this.scheduleHoverPreview(150);
        } else {
            this.clearHoverTimer();
        }
    }

    private clearHoverTimer(): void {
        if (this.hoverTimer === null) return;
        window.clearTimeout(this.hoverTimer);
        this.hoverTimer = null;
    }

    private endHoverDwell(): void {
        this.clearHoverTimer();
        this.hoverLink = null;
        this.hoverPreviewed = null;
        this.hoverEvent = null;
    }

    /**
     * Show how long the card has been on screen once it passes its suggested
     * time. Nothing appears before that: the point is to break a long
     * hesitation, not to put a stopwatch on every card. Time spent with the
     * window hidden does not count.
     */
    private startAnswerTimeHint(bar: HTMLElement, card: CardRecord): void {
        const budget = suggestedAnswerSeconds(card, this.plugin.settings.answerTimeBase, {
            secondsPerChunk: this.plugin.settings.answerTimeSecondsPerChunk,
            historyWeight: this.plugin.settings.answerTimeHistoryWeight,
        });
        // Measuring from when the card was first shown (not from this render)
        // keeps the clock honest across a reveal, which rebuilds the view.
        const shownAt = this.cardShownAt || Date.now();
        let hiddenTotal = 0;
        let hiddenAt: number | null = null;
        let hint: HTMLElement | null = null;

        const tick = (): void => {
            // Once the answer is on screen the wait is over: stop nagging.
            if (this.revealed) return;
            const elapsed = Math.floor((Date.now() - shownAt - hiddenTotal) / 1000);
            if (elapsed < budget) return;
            const text = ttf('⏱ Over suggested time: {elapsed} / {budget}', {
                elapsed: formatClock(elapsed),
                budget: formatClock(budget),
            });
            if (hint) {
                hint.setText(text);
                return;
            }
            hint = bar.createDiv({
                cls: 'fakecard-review-answer-time',
                text,
                attr: { title: tt("Based on answer length and this card's rating history") },
            });
            bar.after(hint);
        };

        const onVisibility = (): void => {
            if (activeDocument.hidden) {
                hiddenAt = Date.now();
                return;
            }
            if (hiddenAt !== null) {
                hiddenTotal += Date.now() - hiddenAt;
                hiddenAt = null;
            }
            tick();
        };

        activeDocument.addEventListener('visibilitychange', onVisibility);
        this.hintVisibilityHandler = onVisibility;
        this.hintTimer = window.setInterval(tick, 500);
    }

    /** Stop the hint's clock; called on every render and when the view closes. */
    private clearAnswerTimeHint(): void {
        if (this.hintTimer !== null) window.clearInterval(this.hintTimer);
        this.hintTimer = null;
        if (this.hintVisibilityHandler) {
            activeDocument.removeEventListener('visibilitychange', this.hintVisibilityHandler);
            this.hintVisibilityHandler = null;
        }
    }

    /**
     * After rating a child: a run of Good ratings graduates it; once every
     * child of the parent has graduated, the parent comes back.
     */
    private async checkChild(child: CardRecord): Promise<{ id: string; json: string } | null> {
        if (!child.childOf) return null;

        const streak = Math.max(1, this.plugin.settings.childGoodStreak);
        const logs = await this.plugin.reviews.recentForCard(child.id, streak);
        if (!isGraduatable(logs.map((log) => log.rating), streak)) return null;

        child.graduated = true;
        await this.plugin.store.save(child);

        const all = await this.plugin.store.list();
        const siblings = all.filter((card) => card.childOf === child.childOf);
        if (siblings.length === 0 || !siblings.every((card) => card.graduated)) return null;

        const parent = all.find((card) => card.id === child.childOf);
        if (!parent) return null;
        // Snapshot before the parent is touched: undoing the child's rating
        // must put the parent back to paused if it was.
        const snapshot = { id: parent.id, json: JSON.stringify(parent) };
        parent.suspended = false;
        await this.plugin.store.save(parent);
        return snapshot;
    }

    /** Open the manual editor for the card being reviewed. */
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

    private async rate(rating: Rating): Promise<void> {
        const card = this.cards[this.index];
        if (!card) return;

        // Snapshot before anything mutates, so Ctrl+Z can put it back.
        const entry: UndoEntry = {
            index: this.index,
            snapshots: [{ id: card.id, json: JSON.stringify(card) }],
        };

        const scheduler = fsrs();
        const fsrsCard: FsrsCard = card.fsrs ?? createEmptyCard();
        const scheduling = scheduler.next(fsrsCard, new Date(), rating as Grade);

        const wasNew = !card.fsrs;
        card.fsrs = scheduling.card;
        card.reviews = (card.reviews ?? 0) + 1;
        if (rating >= Rating.Good) card.correct = (card.correct ?? 0) + 1;
        card.updated = new Date().toISOString();
        await this.plugin.store.save(card);
        await this.plugin.reviews.append({
            cardId: card.id,
            at: card.updated,
            rating,
            wasNew,
            durationMs: this.cardShownAt > 0 ? Date.now() - this.cardShownAt : undefined,
        });
        entry.reviewLog = { cardId: card.id, at: card.updated };

        if (card.childOf) {
            const parent = await this.checkChild(card);
            if (parent) entry.snapshots.push(parent);
        }

        this.undoStack.push(entry);

        this.index++;
        this.revealed = false;
        this.cardShownAt = Date.now();
        this.render();
    }

    /**
     * Take back the last rating: the card returns to the screen with its old
     * schedule, and the review-log entry is removed so the daily limits and the
     * stats do not count a rating that no longer happened.
     */
    private async undo(): Promise<void> {
        const entry = this.undoStack.pop();
        if (!entry) {
            new Notice(tt('Nothing to undo.'));
            return;
        }

        for (const snapshot of entry.snapshots) {
            const record = JSON.parse(snapshot.json) as CardRecord;
            const at = this.cards.findIndex((card) => card.id === record.id);
            if (at >= 0) this.cards[at] = record;
            await this.plugin.store.save(record);
        }

        if (entry.reviewLog) {
            await this.plugin.reviews.remove(entry.reviewLog.cardId, entry.reviewLog.at);
        }

        this.index = Math.min(entry.index, Math.max(0, this.cards.length - 1));
        // Back to the question, not the answer: the point of undoing a rating
        // is to read the card again and rate it differently.
        this.revealed = false;
        this.cardShownAt = Date.now();
        this.clearAnswerTimeHint();
        this.render();
        new Notice(tt('Rating undone.'));
    }

    /** Ratings use the configured shortcuts; digits work on the numpad too. */
    private ratingKeys(): RatingKeys {
        const settings = this.plugin.settings;
        return {
            again: settings.ratingKeyAgain,
            hard: settings.ratingKeyHard,
            good: settings.ratingKeyGood,
            easy: settings.ratingKeyEasy,
        };
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (this.loading || this.cards.length === 0) return;

        // Typing in the deck name field or an edit panel must not rate cards.
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
        if (event.altKey) return;

        const mod = event.ctrlKey || event.metaKey;
        if (mod) {
            if (!event.shiftKey && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                void this.undo();
            }
            return;
        }

        if (!this.revealed) {
            // Space reveals the answer first; the rating keys stay quiet until
            // the answer is on screen.
            if (event.code === 'Space' || event.key === 'Enter') {
                event.preventDefault();
                this.reveal();
            }
            return;
        }

        const keys = this.ratingKeys();
        const bindings: Array<[Rating, string]> = [
            [Rating.Again, keys.again],
            [Rating.Hard, keys.hard],
            [Rating.Good, keys.good],
            [Rating.Easy, keys.easy],
        ];
        for (const [rating, key] of bindings) {
            if (!matchesKey(event, key)) continue;
            event.preventDefault();
            void this.rate(rating);
            return;
        }
    }

    private reveal(): void {
        if (this.revealed) return;
        this.revealed = true;
        this.render();
    }

    private renderDone(container: HTMLElement): void {
        container.createEl('h2', { text: tt('Review finished') });
        const reviewed = this.cards.filter((card) => (card.reviews ?? 0) > 0).length;
        container.createEl('p', { text: ttf('{count} card(s) in the library.', { count: reviewed }) });
        const again = container.createEl('button', { text: tt('Review again') });
        again.addEventListener('click', () => {
            void this.reload();
            new Notice(tt('Reloaded.'));
        });
    }

    async onClose(): Promise<void> {
        this.clearAnswerTimeHint();
        this.contentEl.empty();
    }
}

/** Card state captured before a rating, so Ctrl+Z can put it back. */
interface UndoEntry {
    index: number;
    /** Every card the rating touched, as JSON taken before the change. */
    snapshots: Array<{ id: string; json: string }>;
    /** The review-log row to drop when the rating is undone. */
    reviewLog?: { cardId: string; at: string };
}

/** `m:ss`, for the answer-time hint. */
function formatClock(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
