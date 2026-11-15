import { ItemView, MarkdownRenderer, Menu, Notice, WorkspaceLeaf } from 'obsidian';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard, Grade } from 'ts-fsrs';
import type { CardRecord } from './card';
import { suggestedAnswerSeconds } from './answerTime';
import { hasHardStreak, isGraduatable } from './childStreak';
import { clozeGroups, renderClozeHtml } from './cloze';
import { ClozePanelModal } from './clozePanel';
import { daysLeft, nextExamPlan, pruneExpiredExamPlans } from './examPlan';
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

    constructor(leaf: WorkspaceLeaf, private plugin: FakeCardPlugin) {
        super(leaf);
    }

    getViewType(): string {
        return REVIEW_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'fakecard: review';
    }

    getIcon(): string {
        return 'layers';
    }

    async onOpen(): Promise<void> {
        await this.reload();
    }

    async reload(): Promise<void> {
        this.loading = true;

        // Plans whose exam day is over are dropped; card data (stability,
        // difficulty, history) is never touched, cards just go back to FSRS.
        const expired = await pruneExpiredExamPlans(this.plugin);
        if (expired > 0) {
            new Notice(expired === 1
                ? 'The exam day has passed - that plan was removed and its cards are back on the long-term schedule.'
                : `${expired} exam plans have passed and were removed. Their cards are back on the long-term schedule.`);
        }

        this.decks = await this.plugin.store.loadDecks();
        const everyCard = await this.plugin.store.list();
        const scoped = this.deckFilter === 'all'
            ? everyCard
            : everyCard.filter((card) => card.deck === this.deckFilter);
        // Suspended parents wait for their children; graduated children are
        // done and stay only for their history.
        const all = scoped.filter((card) => !card.suspended && !card.graduated);

        // Today's queue: due cards first (oldest due first), then new cards,
        // both capped by the daily limits in settings.
        const today = new Date();
        const todayLogs = await this.plugin.reviews.forDay(today);
        const reviewedToday = todayLogs.length;
        const newToday = todayLogs.filter((log) => log.wasNew).length;
        const remainingReviews = Math.max(0, this.plugin.settings.maxReviewsPerDay - reviewedToday);
        const remainingNew = Math.max(0, this.plugin.settings.newCardsPerDay - newToday);

        const now = Date.now();
        const due = all
            .filter((card) => card.fsrs
                && card.fsrs.state !== State.New
                && new Date(card.fsrs.due).getTime() <= now)
            .sort((a, b) => new Date(a.fsrs!.due).getTime() - new Date(b.fsrs!.due).getTime());

        const fresh = all
            .filter((card) => !card.fsrs || card.fsrs.state === State.New)
            .sort((a, b) => a.created.localeCompare(b.created));

        this.cards = [
            ...due.slice(0, remainingReviews),
            ...fresh.slice(0, remainingNew),
        ];
        this.index = 0;
        this.revealed = false;
        this.loading = false;
        this.cardShownAt = Date.now();
        this.render();
    }

    private render(): void {
        const container = this.contentEl;
        this.clearAnswerTimeHint();
        container.empty();
        container.addClass('fakecard-review');

        if (this.loading) {
            container.createEl('p', { text: 'Loading…' });
            return;
        }

        if (this.cards.length === 0) {
            container.createEl('h2', { text: 'No cards yet' });
            container.createEl('p', { text: 'Generate cards from a note or create one manually first.' });
            return;
        }

        if (this.index >= this.cards.length) {
            this.renderDone(container);
            return;
        }

        const card = this.cards[this.index];

        // Toolbar: deck selector + progress + edit the card being reviewed.
        const bar = container.createDiv({ cls: 'fakecard-review-bar' });

        const deckSelect = bar.createEl('select', { cls: 'dropdown' });
        for (const deck of ['all', ...this.decks]) {
            const option = deckSelect.createEl('option');
            option.value = deck;
            option.textContent = deck === 'all' ? 'All decks' : deck;
        }
        deckSelect.value = this.deckFilter;
        deckSelect.addEventListener('change', () => {
            this.deckFilter = deckSelect.value;
            void this.reload();
        });

        bar.createDiv({
            cls: 'fakecard-review-progress',
            text: `${this.index + 1} / ${this.cards.length}`,
        });

        // Countdown of the exam finishing first; plans with a later date still
        // show up in Settings.
        const nextPlan = nextExamPlan(this.plugin.settings.examPlans ?? []);
        if (nextPlan) {
            const days = daysLeft(nextPlan.date);
            bar.createSpan({
                cls: 'fakecard-review-time',
                text: days === 0 ? '📅 today' : `📅 ${days}d`,
                attr: { title: days === 0 ? `${nextPlan.name}: exam today` : `${nextPlan.name}: days until the exam` },
            });
        }

        const sourceButton = bar.createEl('button', {
            cls: 'fakecard-review-edit',
            text: '↗ Source',
            attr: { title: 'Open the note at the block this card came from' },
        });
        sourceButton.addEventListener('click', () => {
            void jumpToCardSource(this.app, card);
        });

        if (this.plugin.settings.childCardsEnabled && !card.childOf && card.type !== 'image') {
            const childButton = bar.createEl('button', {
                cls: 'fakecard-review-edit',
                text: '+ Child',
                attr: { title: 'Pause this card and study it through a simpler stand-in' },
            });
            childButton.addEventListener('click', (event) => this.chooseChildType(card, event));
        }

        const editButton = bar.createEl('button', {
            cls: 'fakecard-review-edit',
            text: '✎ Edit',
        });
        editButton.addEventListener('click', () => {
            this.openEditor(card);
        });

        if (this.plugin.settings.answerTimeHint) {
            this.startAnswerTimeHint(bar, card);
        }

        if (!this.revealed) {
            // Front. Q&A questions are centred; cloze fronts keep the text
            // flow; image cards draw the picture with the first group masked.
            const frontEl = container.createDiv({ cls: 'fakecard-review-front' });
            if (card.type === 'qa') frontEl.addClass('fakecard-qa-front');
            this.renderCardBody(frontEl, card, false);

            // Offered on the question face, before the answer is revealed:
            // once the answer is on screen the decision is already made.
            if (this.plugin.settings.childCardsEnabled && card.type !== 'image') {
                void this.showChildHint(
                    container.createDiv({ cls: 'fakecard-review-hint-slot' }),
                    card,
                );
            }

            const button = container.createEl('button', {
                cls: 'fakecard-review-show',
                text: 'Show answer',
            });
            button.addEventListener('click', () => {
                this.revealed = true;
                this.render();
            });
            // Space also reveals.
            this.registerDomEvent(activeDocument, 'keydown', (event: KeyboardEvent) => {
                if (event.code === 'Space' && !this.revealed) {
                    event.preventDefault();
                    this.revealed = true;
                    this.render();
                }
            }, { once: true });
            return;
        }

        if (card.type === 'qa') {
            // Q&A keeps both sides: question above, answer below.
            const frontEl = container.createDiv({ cls: 'fakecard-review-front fakecard-qa-front' });
            this.renderCardBody(frontEl, card, false);
            container.createEl('hr');
            const backEl = container.createDiv({ cls: 'fakecard-review-back' });
            this.renderCardBody(backEl, card, true);
        } else {
            // Cloze and image cards reveal in place - the same block shows the
            // answer, there is no separate answer side.
            const bodyEl = container.createDiv({ cls: 'fakecard-review-front' });
            this.renderCardBody(bodyEl, card, true);
        }

        if (this.plugin.settings.childCardsEnabled && card.type !== 'image') {
            void this.showChildHint(
                container.createDiv({ cls: 'fakecard-review-hint-slot' }),
                card,
            );
        }

        // Rating buttons.
        const ratings = container.createDiv({ cls: 'fakecard-review-ratings' });
        const options: Array<[Rating, string, string]> = [
            [Rating.Again, 'Again', 'fakecard-again'],
            [Rating.Hard, 'Hard', 'fakecard-hard'],
            [Rating.Good, 'Good', 'fakecard-good'],
            [Rating.Easy, 'Easy', 'fakecard-easy'],
        ];
        for (const [rating, label, cls] of options) {
            const button = ratings.createEl('button', { cls, text: label });
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
     * Offer the two shapes a child card can take. The parent's own text seeds
     * the panel, so the user trims instead of retyping - same idea as the
     * True Recall chooser, minus the image type (a masked image has no text to
     * trim, so it has no prefilled child).
     */
    private chooseChildType(parent: CardRecord, event: MouseEvent): void {
        if (!this.plugin.settings.childCardsEnabled) return;
        const menu = new Menu();
        menu.addItem((item) => item
            .setTitle('Q&A child card')
            .setIcon('file-text')
            .onClick(() => this.openChildPanel(parent, 'qa')));
        menu.addItem((item) => item
            .setTitle('Cloze child card')
            .setIcon('text-cursor-input')
            .onClick(() => this.openChildPanel(parent, 'cloze')));
        menu.showAtMouseEvent(event);
    }

    /**
     * Open a panel prefilled from the parent. The new card is linked through
     * childOf and never touches the parent's own text.
     */
    private openChildPanel(parent: CardRecord, type: 'qa' | 'cloze'): void {
        const onSaved = (): void => {
            void this.attachChild(parent);
        };

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
        new Notice('Child card created - parent paused.');
        await this.reload();
    }

    /**
     * Show the "build a child card" button when the recent reviews of this
     * card add up to the configured failing score. Sits above the rating bar
     * on the question face: a hint after the rating arrives too late.
     */
    private async showChildHint(slot: HTMLElement, card: CardRecord): Promise<void> {
        const streak = Math.max(1, this.plugin.settings.childHardStreak);
        const againScore = this.plugin.settings.childAgainScore;
        const logs = await this.plugin.reviews.recentForCard(card.id, streak);
        if (!hasHardStreak(logs.map((log) => log.rating), streak, againScore)) return;
        // The view may have moved on while the history was being read.
        if (!slot.isConnected || this.cards[this.index]?.id !== card.id) return;

        const hint = slot.createEl('button', {
            cls: 'fakecard-review-child-hint',
            text: 'Card keeps failing - build a child card',
            attr: { title: 'Pause this card and study it through a simpler stand-in' },
        });
        hint.addEventListener('click', (event) => this.chooseChildType(card, event));
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
            const text = `⏱ Over suggested time: ${formatClock(elapsed)} / ${formatClock(budget)}`;
            if (hint) {
                hint.setText(text);
                return;
            }
            hint = bar.createDiv({
                cls: 'fakecard-review-answer-time',
                text,
                attr: { title: 'Based on answer length and this card\'s rating history' },
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
    private async checkChild(child: CardRecord): Promise<void> {
        if (!child.childOf) return;

        const streak = Math.max(1, this.plugin.settings.childGoodStreak);
        const logs = await this.plugin.reviews.recentForCard(child.id, streak);
        if (!isGraduatable(logs.map((log) => log.rating), streak)) return;

        child.graduated = true;
        await this.plugin.store.save(child);

        const all = await this.plugin.store.list();
        const siblings = all.filter((card) => card.childOf === child.childOf);
        if (siblings.length === 0 || !siblings.every((card) => card.graduated)) return;

        const parent = all.find((card) => card.id === child.childOf);
        if (!parent) return;
        parent.suspended = false;
        await this.plugin.store.save(parent);
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

        if (card.childOf) await this.checkChild(card);

        this.index++;
        this.revealed = false;
        this.cardShownAt = Date.now();
        this.render();
    }

    private renderDone(container: HTMLElement): void {
        container.createEl('h2', { text: 'Review finished' });
        const reviewed = this.cards.filter((card) => (card.reviews ?? 0) > 0).length;
        container.createEl('p', { text: `${reviewed} card(s) in the library.` });
        const again = container.createEl('button', { text: 'Review again' });
        again.addEventListener('click', () => {
            void this.reload();
            new Notice('Reloaded.');
        });
    }

    async onClose(): Promise<void> {
        this.clearAnswerTimeHint();
        this.contentEl.empty();
    }
}

/** `m:ss`, for the answer-time hint. */
function formatClock(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}
