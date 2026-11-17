import { ItemView, MarkdownRenderer, Menu, Notice, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard, Grade } from 'ts-fsrs';
import type { CardRecord } from './card';
import { suggestedAnswerSeconds } from './answerTime';
import { ChildCardPromptModal } from './childPrompt';
import { hardStreakScore, isGraduatable } from './childStreak';
import { clozeGroups, renderClozeHtml } from './cloze';
import { attachImageZoom, buildImageFigure, makeImageZoomable } from './imageFigure';
import { ClozePanelModal } from './clozePanel';
import { ImagePanelModal } from './imagePanel';
import { daysLeft, nextExamPlan } from './examPlan';
import { tt, ttf } from './i18n';
import { RatingKeys, keyLabel, matchesKey } from './keys';
import { buildReviewQueue, ReviewQueue } from './queue';
import { QaPanelModal } from './qaPanel';
import { jumpToCardSource } from './sourceJump';
import type { EditableField } from './tempEdit';
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
    /** Due cards the daily limit kept out of the current queue. */
    private backlog = 0;
    /** Zoom waiting to be written to its card, and the timer that writes it. */
    private pendingZoom: { cardId: string; zoom: number } | null = null;
    private zoomTimer: number | null = null;
    /** When the finish page's refresh was last pressed, for its receipt line. */
    private refreshedAt = 0;
    private flashTimer: number | null = null;
    /** Cards in the library for this deck filter, so an empty queue is not
     *  mistaken for an empty library. */
    private total = 0;
    /** True while the cards on screen were pulled in ahead of their due date. */
    private ahead = false;
    /** Interval that reveals the answer-time hint; cleared on every render. */
    private hintTimer: number | null = null;
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

    /**
     * Rebuild the queue - a new session: first card, question side.
     *
     * An edit does not come through here: the card is repainted in place by
     * `refreshCurrentCard`, so fixing an answer never flips the card back.
     */
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
        this.backlog = queue.backlog;
        this.total = queue.total;
        this.index = 0;
        this.revealed = false;
        this.ahead = false;
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
        if (this.flashTimer !== null) {
            window.clearTimeout(this.flashTimer);
            this.flashTimer = null;
        }
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
            // An empty queue is not an empty library: after the day's cards are
            // rated (or after pressing refresh on the finish page) there is
            // nothing left to show but the ways to keep going.
            if (this.total === 0) {
                container.createEl('h2', { text: tt('No cards yet') });
                container.createEl('p', { text: tt('Generate cards from a note or create one manually first.') });
                return;
            }
            this.renderDone(container);
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

        // These cards came from after today's queue: say so, or the interval
        // correction in `shortenEarlyInterval` looks like a numbers bug.
        if (this.ahead) {
            meta.createSpan({ cls: 'fakecard-review-ahead', text: tt('studying ahead') });
        } else if (this.backlog > 0) {
            const badge = meta.createSpan({
                cls: 'fakecard-review-backlog',
                text: ttf('{count} more due', { count: this.backlog }),
            });
            setTooltip(badge, tt('These cards are due today; the daily limit kept them out of this session.'));
        }

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
        // One door per kind of content: text opens in Obsidian's own editor,
        // while an image card's content is the picture and its masks, which only
        // the mask panel can change (the editor could just rewrite the embed).
        if (card.type === 'image') {
            iconButton('image', tt('Edit the masks on this picture'), () => {
                void this.editImageCard(card);
            });
        } else {
            iconButton('pencil', tt('Edit the text in the editor'), () => {
                void this.editTextInEditor(card);
            });
        }

        if (this.plugin.settings.answerTimeHint) {
            this.startAnswerTimeHint(meta, card);
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

    /**
     * Repaint the card on screen after it was edited elsewhere (the editor
     * split). The queue position and the side being read are left alone - a
     * card is painted, not restarted.
     */
    refreshCurrentCard(): void {
        const current = this.cards[this.index];
        if (!current) return;
        void this.plugin.store.list().then((all) => {
            const fresh = all.find((entry) => entry.id === current.id);
            if (!fresh) return;
            const at = this.cards.findIndex((entry) => entry.id === fresh.id);
            if (at < 0) return;
            this.cards[at] = fresh;
            this.render();
        });
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
        ).then(() => {
            // A cloze or Q&A card can carry pictures too; they zoom the same
            // way an occlusion picture does.
            attachImageZoom(el, (el.closest('.fakecard-review-body') as HTMLElement | null) ?? el);
        });
    }

    private renderImageBody(el: HTMLElement, card: CardRecord, revealed: boolean): void {
        const wrap = buildImageFigure(this.app, card, revealed, this.plugin.settings.maskAllGroups);
        if (!wrap) return;
        el.appendChild(wrap);
        wrap.addClass('is-zoomable');
        const scroller = (el.closest('.fakecard-review-body') as HTMLElement | null) ?? el;
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
    /**
     * How long the card has been on screen, once it passes its budget.
     *
     * Plain wall-clock time from when the card first appeared: pausing while
     * the window was hidden made the number stop for no visible reason and
     * disagree with the clock on the wall, and switching panes inside Obsidian
     * never paused it at all - the same card behaved differently depending on
     * where the user looked. The chip is small enough to sit in the toolbar
     * without reflowing it; the budget is in its tooltip.
     */
    private startAnswerTimeHint(host: HTMLElement, card: CardRecord): void {
        // The clock belongs to the question: on the answer side there is nothing
        // to recall, so it is not built at all.
        if (this.revealed) return;
        const budget = suggestedAnswerSeconds(card, this.plugin.settings.answerTimeBase, {
            secondsPerChunk: this.plugin.settings.answerTimeSecondsPerChunk,
            historyWeight: this.plugin.settings.answerTimeHistoryWeight,
        });
        // Measuring from when the card was first shown (not from this render)
        // keeps the clock honest across a reveal, which rebuilds the view.
        let startedAt = this.cardShownAt || Date.now();
        /** Set once the clock passes twice the budget - it stops there. */
        let frozen = false;

        // Elapsed on the left, the budget it is measured against on the right,
        // and a reset in between: one pill, three things to read.
        const chip = createDiv({ cls: 'fakecard-timer' });
        const elapsedEl = chip.createSpan({ cls: 'fakecard-timer-elapsed', text: formatClock(0) });
        chip.createSpan({ cls: 'fakecard-timer-budget', text: formatClock(budget) });
        const reset = chip.createEl('button', { cls: 'fakecard-timer-reset' });
        setIcon(reset, 'refresh-cw');
        setTooltip(reset, tt('Restart the timer'));
        reset.addEventListener('click', (event) => {
            event.stopPropagation();
            startedAt = Date.now();
            frozen = false;
            tick();
        });
        setTooltip(chip, ttf(
            'Suggested {budget} - based on answer length and this card\'s rating history',
            { budget: formatClock(budget) },
        ));
        host.appendChild(chip);

        const tick = (): void => {
            // Once the answer is on screen the wait is over: the clock has no
            // meaning there (the time it measured was for recalling, not for
            // reading), so it leaves instead of freezing at a number.
            if (this.revealed) {
                chip.remove();
                return;
            }
            // Past twice the budget the number is no longer news - it stops,
            // keeps its colour, and waits for a deliberate reset.
            if (frozen) return;

            const elapsed = Math.floor((Date.now() - startedAt) / 1000);
            const ratio = budget > 0 ? elapsed / budget : 0;
            if (ratio >= 2) frozen = true;

            elapsedEl.setText(formatClock(elapsed));
            chip.toggleClass('is-warning', ratio >= 1);
            chip.toggleClass('is-late', ratio >= 1.5);
            chip.toggleClass('is-stop', ratio >= 2);
        };

        this.hintTimer = window.setInterval(tick, 500);
        tick();
    }

    /** Stop the hint's clock; called on every render and when the view closes. */
    private clearAnswerTimeHint(): void {
        if (this.hintTimer !== null) window.clearInterval(this.hintTimer);
        this.hintTimer = null;
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

    /**
     * Back into the mask panel with this card's own boxes: add, move, reshape or
     * delete them, exactly like when the card was created. Saving there keeps the
     * card id and its FSRS history.
     */
    private async editImageCard(card: CardRecord): Promise<void> {
        const image = card.image;
        if (!image) return;
        // One card holds one group; the panel edits the picture, so it needs the
        // groups of every card made from it - otherwise saving would treat the
        // other groups as deleted and take their cards with them.
        const all = await this.plugin.store.list();
        const groups = all
            .filter((entry) => entry.type === 'image' && entry.image?.path === image.path)
            .flatMap((entry) => entry.image?.groups ?? []);
        new ImagePanelModal(
            this.app,
            this.plugin,
            image.path,
            card.source.path,
            card,
            () => this.refreshCurrentCard(),
            undefined,
            groups,
        ).open();
    }

    /**
     * Open the field that is on screen in Obsidian's own editor: the question,
     * the answer, or the cloze body. Image cards have no text field - their
     * content is the picture and the masks drawn over it.
     */
    private async editTextInEditor(card: CardRecord): Promise<void> {
        const field: EditableField = card.type === 'cloze'
            ? 'clozeText'
            : (this.revealed ? 'back' : 'front');
        await this.plugin.tempEdit.open(card, field);
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
        const now = new Date();
        const scheduling = scheduler.next(fsrsCard, now, rating as Grade);
        this.shortenEarlyInterval(card, scheduling.card, now, rating);

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
            // Rated before its due date: practice, not today's quota.
            ahead: new Date(fsrsCard.due).getTime() > now.getTime() || undefined,
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
     * Keep a rating made before the due date honest.
     *
     * FSRS assumes the rating arrived when the card was scheduled; taken at
     * face value, studying a 30-day card on day 3 would push it out as if it
     * had just been reviewed on time. Subtracting the days gained early gives
     * back what that unearned head start was worth, and the result is clamped
     * so a card is never scheduled earlier than it already was.
     *
     * Only reviews of learned cards are touched: new and learning cards are
     * scheduled in minutes, and an Again is a real failure whose shorter
     * interval should stand.
     */
    private shortenEarlyInterval(
        card: CardRecord,
        scheduled: FsrsCard,
        now: Date,
        rating: Rating,
    ): void {
        if (!this.plugin.settings.scaleEarlyReviews) return;
        const previous = card.fsrs;
        if (!previous || previous.state !== State.Review) return;
        if (rating === Rating.Again || scheduled.state !== State.Review) return;

        const earlyDays = (new Date(previous.due).getTime() - now.getTime()) / 86400000;
        if (earlyDays <= 0) return;

        const fsrsDays = Math.max(1, scheduled.scheduled_days);
        const honestDays = Math.max(earlyDays, fsrsDays - earlyDays);
        const rounded = Math.max(1, Math.round(honestDays));
        if (rounded >= fsrsDays) return;

        scheduled.scheduled_days = rounded;
        scheduled.due = new Date(now.getTime() + rounded * 86400000);
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

    /**
     * The end of a session, with the two ways to keep going.
     *
     * They never appear together, because they mean different things: a card
     * behind the daily limit is today's work (no interval scaling), a card that
     * is not due yet is borrowed from the future (its interval is scaled).
     */
    private renderDone(container: HTMLElement): void {
        container.createEl('h2', { text: tt('Review finished') });
        container.createEl('p', {
            cls: 'fakecard-review-done-note',
            text: this.cards.length === 0
                // Nothing was due when the page was drawn (refresh, or the
                // session ended and the queue came back empty).
                ? tt('Nothing else is due today.')
                : ttf('{count} card(s) in the library.', { count: this.total }),
        });

        const actions = container.createDiv({ cls: 'fakecard-review-done' });

        if (this.backlog > 0) {
            container.createEl('p', {
                cls: 'fakecard-review-done-note',
                text: ttf('{count} due card(s) are waiting behind the daily limit.', { count: this.backlog }),
            });
            const more = actions.createEl('button', {
                cls: 'mod-cta fakecard-review-done-primary',
                text: ttf('Study more today ({count} left)', { count: this.backlog }),
            });
            setTooltip(more, ttf(
                'Today still has {count} due card(s) the daily limit cut off. Each press allows {step} more; they are due today, so intervals are not scaled.',
                { count: this.backlog, step: this.plugin.boostStepSize() },
            ));
            more.addEventListener('click', () => {
                this.plugin.boostReviewLimit();
                void this.reload();
            });
        } else if (!this.plugin.settings.scaleEarlyReviews) {
            // Study ahead without the interval correction would inflate the
            // schedules of the very cards it borrows, so it stays off.
            container.createEl('p', {
                cls: 'fakecard-review-done-note',
                text: tt('Study ahead is off: turn on interval scaling in Settings to use it.'),
            });
        } else {
            const batch = Math.max(1, this.plugin.settings.aheadBatch);
            const ahead = actions.createEl('button', {
                cls: 'fakecard-review-done-primary',
                text: ttf('Study {count} cards ahead', { count: batch }),
            });
            setTooltip(ahead, tt('Today is clear. These cards are not due yet; because they are early, a rating shortens the new interval by the days you gained early.'));
            ahead.addEventListener('click', () => {
                void this.startAhead();
            });
        }

        const refresh = actions.createEl('button', {
            cls: 'fakecard-review-done-refresh',
            text: tt('Refresh'),
        });
        setTooltip(refresh, tt('Recompute today\'s queue. Only needed after adding or editing cards during the session.'));
        refresh.addEventListener('click', () => {
            // Same page, same buttons: without a trace of the click the button
            // looks broken. The line below says what the fresh queue holds and
            // fades on its own.
            this.refreshedAt = Date.now();
            void this.reload();
        });

        if (Date.now() - this.refreshedAt < 2500) {
            container.createEl('p', {
                cls: 'fakecard-review-done-flash',
                text: this.backlog > 0
                    ? ttf('Refreshed - {count} due card(s) are waiting.', { count: this.backlog })
                    : tt('Refreshed - nothing else is due today.'),
            });
            // The flash is a receipt, not a state: drop it after a moment.
            this.flashTimer = window.setTimeout(() => {
                this.flashTimer = null;
                this.refreshedAt = 0;
                this.render();
            }, 2500);
        }
    }

    /**
     * Study an explicit set of cards (the stats page's hardest list) instead of
     * today's queue. Only these cards appear; rating one schedules it as usual,
     * with the early correction if it was not due yet.
     */
    startExtra(cards: CardRecord[]): void {
        const list = cards.filter((card) => !card.suspended && !card.graduated);
        if (list.length === 0) {
            new Notice(tt('No card to study ahead.'));
            return;
        }
        this.cards = list;
        this.index = 0;
        this.revealed = false;
        this.ahead = false;
        this.loading = false;
        this.cardShownAt = Date.now();
        this.render();
    }

    /**
     * Borrow a few cards from the future: not due yet, hardest first, and
     * reviewed with the early-interval correction (see `shortenEarlyInterval`).
     */
    private async startAhead(): Promise<void> {
        if (!this.plugin.settings.scaleEarlyReviews) {
            new Notice(tt('Study ahead is off: turn on interval scaling in Settings to use it.'));
            return;
        }
        const all = await this.plugin.store.list();
        const now = Date.now();
        const misses = (card: CardRecord): number => (card.reviews ?? 0) - (card.correct ?? 0);
        const byEarliest = this.plugin.settings.aheadOrder === 'earliest';
        const pool = all
            .filter((card) => !card.suspended && !card.graduated)
            .filter((card) => this.deckFilter === 'all' || card.deck === this.deckFilter)
            .filter((card) => card.fsrs
                && card.fsrs.state === State.Review
                && new Date(card.fsrs.due).getTime() > now)
            .sort((a, b) => (byEarliest
                // Borrow from the future in order: the card that would have come
                // up soonest is the one that suffers least from a few days early.
                ? new Date(a.fsrs!.due).getTime() - new Date(b.fsrs!.due).getTime()
                : misses(b) - misses(a) || (b.fsrs?.difficulty ?? 0) - (a.fsrs?.difficulty ?? 0)))
            .slice(0, Math.max(1, this.plugin.settings.aheadBatch));

        if (pool.length === 0) {
            new Notice(tt('No card to study ahead.'));
            return;
        }

        this.cards = pool;
        this.index = 0;
        this.revealed = false;
        this.ahead = true;
        this.cardShownAt = Date.now();
        this.render();
    }

    async onClose(): Promise<void> {
        this.clearAnswerTimeHint();
        if (this.zoomTimer !== null) {
            window.clearTimeout(this.zoomTimer);
            this.zoomTimer = null;
        }
        if (this.flashTimer !== null) {
            window.clearTimeout(this.flashTimer);
            this.flashTimer = null;
        }
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
