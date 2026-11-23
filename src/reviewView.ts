import { ItemView, Notice, WorkspaceLeaf, setIcon, setTooltip } from 'obsidian';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard, Grade } from 'ts-fsrs';
import type { CardRecord } from './card';

import { daysLeft, nextExamPlan } from './examPlan';
import { tt, ttf } from './i18n';
import { RatingKeys, keyLabel, matchesKey } from './keys';
import { buildReviewQueue, ReviewQueue } from './queue';
import { ReviewCardRenderer } from './reviewRender';
import { ReviewChildCards } from './reviewChildCards';
import { ReviewClocks } from './reviewClocks';
import { ReviewDonePage } from './reviewDone';
import { openCardEditor } from './reviewEdit';
import { HoverPreview } from './reviewHover';
import { renderRatingNudge } from './reviewNudge';
import { capOverdueInterval, shortenEarlyInterval } from './reviewSchedule';
import { UndoStack, type UndoEntry } from './reviewUndo';
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
    /** Due cards the daily limit kept out of the current queue. */
    private backlog = 0;
    /** Cards hidden until tomorrow by a bury. */
    private buried = 0;
    /** Renders the card body (text, map, picture) and owns the zoom write. */
    private readonly cardRenderer: ReviewCardRenderer;
    /** Builds child cards and brings the parent back once they graduate. */
    private readonly childCards: ReviewChildCards;
    /** The two clocks and the measurement a rating is scored from. */
    private readonly clocks: ReviewClocks;
    /** The finish page and its refresh receipt. */
    private readonly donePage: ReviewDonePage;
    /** Ctrl/Cmd+hover previews for links in the card. */
    private readonly hover: HoverPreview;
    /** Cards in the library for this deck filter, so an empty queue is not
     *  mistaken for an empty library. */
    private total = 0;
    /** True while the cards on screen were pulled in ahead of their due date. */
    private ahead = false;
    /** Today's queue is ordered for coming back after a long gap. */
    private recovery = false;
    /** Ratings that can still be taken back with Ctrl+Z, newest last. */
    private undoStack = new UndoStack();

    constructor(leaf: WorkspaceLeaf, private plugin: FakeCardPlugin) {
        super(leaf);
        this.cardRenderer = new ReviewCardRenderer(this.app, plugin, this);
        this.childCards = new ReviewChildCards(this.app, plugin, () => {
            void this.reload();
        });
        this.clocks = new ReviewClocks(plugin, {
            render: () => this.render(),
            isRevealed: () => this.revealed,
            cardShownAt: () => this.cardShownAt,
            restartCardShownAt: () => { this.cardShownAt = Date.now(); },
        });
        this.donePage = new ReviewDonePage(plugin, {
            render: () => this.render(),
            reload: () => { void this.reload(); },
            startAhead: () => { void this.startAhead(); },
        });
        this.hover = new HoverPreview(this.app);
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
        this.registerDomEvent(activeDocument, 'keydown', (event: KeyboardEvent) => this.hover.handleKey(event));
        this.registerDomEvent(activeDocument, 'keyup', (event: KeyboardEvent) => this.hover.handleKey(event));
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
        this.buried = queue.buried;
        this.recovery = queue.recovery;
        // A new session has a new list; an entry from the old one would point
        // at a card that may no longer be in it.
        this.undoStack.clear();
        this.total = queue.total;
        this.index = 0;
        this.revealed = false;
        this.ahead = false;
        this.loading = false;
        this.cardShownAt = Date.now();
        this.clocks.resetSession();
        this.render();
    }

    /** Deck the pane is filtered to; the status bar follows it. */
    get deck(): string {
        return this.deckFilter;
    }

    private render(): void {
        const container = this.contentEl;
        // A card that is not revealed yet has no memory clock: the number
        // belongs to the pair (this card, this answer), not to the view.
        this.clocks.onRender(this.revealed);
        this.donePage.cancelFlash();
        // The body element is rebuilt below; any tracked link is now detached.
        this.hover.reset();
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
        // correction in `reviewSchedule` looks like a numbers bug.
        if (this.ahead) {
            meta.createSpan({ cls: 'fakecard-review-ahead', text: tt('studying ahead') });
        } else if (this.backlog > 0) {
            const badge = meta.createSpan({
                cls: 'fakecard-review-backlog',
                text: ttf('{count} more due', { count: this.backlog }),
            });
            setTooltip(badge, tt('These cards are due today; the daily limit kept them out of this session.'));
        }
        // A bury is invisible by design; the count is what keeps a card from
        // looking lost. Shown next to the backlog because both are "not now".
        if (!this.ahead && this.buried > 0) {
            const badge = meta.createSpan({
                cls: 'fakecard-review-buried',
                text: ttf('{count} buried', { count: this.buried }),
            });
            setTooltip(badge, tt('Hidden until tomorrow; the schedule is unchanged.'));
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
                (event) => { void this.childCards.request(card, event); },
            );
            void this.childCards.markArmed(childButton, card);
        }
        // One door per kind of content: text opens in Obsidian's own editor,
        // while an image card's content is the picture and its masks, which only
        // the mask panel can change (the editor could just rewrite the embed).
        if (card.type === 'image') {
            iconButton('image', tt('Edit the masks on this picture'), () => {
                void openCardEditor(this.app, this.plugin, card, () => this.refreshCurrentCard());
            });
        } else {
            iconButton('pencil', tt('Edit the text in the editor'), () => {
                void openCardEditor(this.app, this.plugin, card, () => this.refreshCurrentCard());
            });
        }

        // Both clocks live in the toolbar row, next to the deck filter: the
        // card area stays what it is, the card. The answer side re-renders
        // through here too, so it simply picks its own clock.
        const clockHost = meta.createDiv({ cls: 'fakecard-review-clock' });
        this.clocks.renderPill(clockHost, card, this.revealed);
        if (this.recovery) {
            const badge = meta.createSpan({ cls: 'fakecard-review-recovery', text: tt('Recovery mode') });
            setTooltip(badge, tt('Ordered for coming back after a break: cards you still remember first, the weak ones mixed in a few at a time.'));
        }

        // The card itself: centred while it is short, scrolling normally once
        // a long answer does not fit.
        const body = container.createDiv({ cls: 'fakecard-review-body' });
        // A map brings its own scrolling: the body must not scroll under it.
        if (card.type === 'map') body.addClass('is-map');
        this.hover.attach(body, card);

        if (!this.revealed) {
            // Front. Q&A questions are centred; cloze fronts keep the text
            // flow; image cards draw the picture with the first group masked.
            const frontEl = body.createDiv({ cls: 'fakecard-review-front' });
            if (card.type === 'qa') frontEl.addClass('fakecard-qa-front');
            this.cardRenderer.render(frontEl, card, false);

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
            this.cardRenderer.render(frontEl, card, false);
            const backEl = body.createDiv({ cls: 'fakecard-review-back' });
            this.cardRenderer.render(backEl, card, true);
        } else {
            // Cloze and image cards reveal in place - the same block shows the
            // answer, there is no separate answer side.
            const bodyEl = body.createDiv({ cls: 'fakecard-review-front' });
            this.cardRenderer.render(bodyEl, card, true);
        }

        // A one-line suggestion between the card and the buttons: noticeable,
        // but it never blocks a key or a click.
        renderRatingNudge(container, card, {
            settings: this.plugin.settings,
            revealed: this.revealed,
            answeredSeconds: this.clocks.answered,
            clockHidden: this.clocks.hidden,
            breakdown: this.clocks.budgetFor(card),
            rate: (rating, mixed) => { void this.rate(rating, mixed); },
        });

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

    private async rate(rating: Rating, mixed = false): Promise<void> {
        const card = this.cards[this.index];
        if (!card) return;

        // Snapshot before anything mutates, so Ctrl+Z can put it back.
        const entry: UndoEntry = {
            cardId: card.id,
            index: this.index,
            snapshots: [{ id: card.id, json: JSON.stringify(card) }],
        };

        const scheduler = fsrs();
        const fsrsCard: FsrsCard = card.fsrs ?? createEmptyCard();
        const now = new Date();
        const scheduling = scheduler.next(fsrsCard, now, rating as Grade);
        shortenEarlyInterval(
            card.fsrs,
            scheduling.card,
            now,
            rating,
            this.plugin.settings.scaleEarlyReviews,
        );
        capOverdueInterval(
            fsrsCard,
            scheduling.card,
            now,
            rating,
            this.plugin.settings.gapIntervalCap,
        );

        const wasNew = !card.fsrs;
        card.fsrs = scheduling.card;
        card.reviews = (card.reviews ?? 0) + 1;
        if (rating >= Rating.Good) card.correct = (card.correct ?? 0) + 1;
        card.updated = new Date().toISOString();
        if (!await this.plugin.store.save(card)) {
            // The store already showed the reason. Put the card back where it
            // was and stay on it: advancing without a saved review would log a
            // rating the disk never received.
            const snapshot = JSON.parse(entry.snapshots[0].json) as CardRecord;
            this.cards[this.index] = snapshot;
            this.render();
            return;
        }
        // Overtime only counts on a failing rating: a Good or Easy that ran long
        // is usually distraction, not a missing memory, and must not keep the
        // failing run alive. One step past the budget is worth
        // `answerTimeSlowPoints` Hard points (0.5 by default).
        const slowPoints = rating <= Rating.Hard ? this.clocks.score() : 0;
        await this.plugin.reviews.append({
            cardId: card.id,
            at: card.updated,
            rating,
            wasNew,
            durationMs: this.cardShownAt > 0 ? Date.now() - this.cardShownAt : undefined,
            slowPoints: slowPoints || undefined,
            mixed: mixed || undefined,
            // Rated before its due date: practice, not today's quota.
            ahead: new Date(fsrsCard.due).getTime() > now.getTime() || undefined,
        });
        entry.reviewLog = { cardId: card.id, at: card.updated };

        if (card.childOf) {
            const parent = await this.childCards.checkChild(card);
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

        // By id, not by the old index: a deck filter or a reload may have
        // rebuilt this.cards since the rating, and the same slot now holds a
        // different card.
        const at = this.cards.findIndex((card) => card.id === entry.cardId);
        this.index = at >= 0
            ? at
            : Math.min(entry.index, Math.max(0, this.cards.length - 1));
        // Back to the question, not the answer: the point of undoing a rating
        // is to read the card again and rate it differently.
        this.revealed = false;
        this.cardShownAt = Date.now();
        this.clocks.clearHint();
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
        // Freeze the answering time for the fast/slow nudge, then start the
        // answer-side clock: memorising starts with the answer.
        this.clocks.freezeAnswered();
        this.clocks.startOnReveal(this.cards[this.index]);
        this.revealed = true;
        this.render();
    }

    /** The finish page's state: the page itself lives in `reviewDone`. */
    private renderDone(container: HTMLElement): void {
        this.donePage.render(container, {
            emptyQueue: this.cards.length === 0,
            total: this.total,
            backlog: this.backlog,
            buried: this.buried,
        });
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
     * reviewed with the early-interval correction (see `reviewSchedule`).
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
        this.clocks.clearHint();
        this.donePage.cancelFlash();
        this.hover.reset();
        this.cardRenderer.close();
        this.contentEl.empty();
    }
}


