import { ItemView, MarkdownRenderer, Notice, WorkspaceLeaf } from 'obsidian';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard, Grade } from 'ts-fsrs';
import type { CardRecord } from './card';
import { suggestedAnswerSeconds } from './answerTime';
import { clozeGroups, renderClozeHtml } from './cloze';
import { ClozePanelModal } from './clozePanel';
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

        // The exam is over: drop the date and go back to the long-term plan.
        // Card data (stability, difficulty, history) is never touched.
        if (this.plugin.settings.examDate) {
            const examEnd = new Date(`${this.plugin.settings.examDate}T23:59:59`).getTime();
            if (Number.isFinite(examEnd) && examEnd < Date.now()) {
                this.plugin.settings.examDate = '';
                await this.plugin.saveSettings();
                new Notice('Exam date has passed - back to the long-term review plan.');
            }
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
        const bar = container.createEl('div', { cls: 'fakecard-review-bar' });

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

        bar.createEl('div', {
            cls: 'fakecard-review-progress',
            text: `${this.index + 1} / ${this.cards.length}`,
        });

        if (this.plugin.settings.answerTimeHint) {
            bar.createEl('span', {
                cls: 'fakecard-review-time',
                text: `⏱ ~${suggestedAnswerSeconds(card, this.plugin.settings.answerTimeBase)}s`,
                attr: { title: 'Suggested answer time, based on the answer length and this card\'s history' },
            });
        }

        if (this.plugin.settings.examDate) {
            const examEnd = new Date(`${this.plugin.settings.examDate}T23:59:59`).getTime();
            if (Number.isFinite(examEnd)) {
                const days = Math.ceil((examEnd - Date.now()) / 86400000);
                if (days > 0) {
                    bar.createEl('span', {
                        cls: 'fakecard-review-time',
                        text: `📅 ${days}d`,
                        attr: { title: 'Days until the exam date' },
                    });
                }
            }
        }

        const sourceButton = bar.createEl('button', {
            cls: 'fakecard-review-edit',
            text: '↗ Source',
            attr: { title: 'Open the note at the block this card came from' },
        });
        sourceButton.addEventListener('click', () => {
            void jumpToCardSource(this.app, card);
        });

        if (this.plugin.settings.childCardsEnabled && !card.childOf) {
            const childButton = bar.createEl('button', {
                cls: 'fakecard-review-edit',
                text: '+ Child',
                attr: { title: 'Pause this card and study it through an easier stand-in' },
            });
            childButton.addEventListener('click', () => this.createChild(card));
        }

        // Child card that keeps getting Hard: suggest simplifying it.
        if (card.childOf) {
            const streak = Math.max(1, this.plugin.settings.childHardStreak);
            void this.plugin.reviews.recentForCard(card.id, streak).then((logs) => {
                if (logs.length < streak || !logs.every((log) => log.rating === Rating.Hard)) return;
                const hint = container.createEl('div', {
                    cls: 'fakecard-review-hint',
                    text: `⚠️ ${streak} Hard ratings in a row - consider simplifying this child card.`,
                });
                container.insertBefore(hint, container.firstChild);
            });
        }
        const editButton = bar.createEl('button', {
            cls: 'fakecard-review-edit',
            text: '✎ Edit',
        });
        editButton.addEventListener('click', () => {
            this.openEditor(card);
        });

        if (!this.revealed) {
            // Front. Q&A questions are centred; cloze fronts keep the text
            // flow; image cards draw the picture with the first group masked.
            const frontEl = container.createEl('div', { cls: 'fakecard-review-front' });
            if (card.type === 'qa') frontEl.addClass('fakecard-qa-front');
            this.renderCardBody(frontEl, card, false);

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
            const frontEl = container.createEl('div', { cls: 'fakecard-review-front fakecard-qa-front' });
            this.renderCardBody(frontEl, card, false);
            container.createEl('hr');
            const backEl = container.createEl('div', { cls: 'fakecard-review-back' });
            this.renderCardBody(backEl, card, true);
        } else {
            // Cloze and image cards reveal in place - the same block shows the
            // answer, there is no separate answer side.
            const bodyEl = container.createEl('div', { cls: 'fakecard-review-front' });
            this.renderCardBody(bodyEl, card, true);
        }

        // Rating buttons.
        const ratings = container.createEl('div', { cls: 'fakecard-review-ratings' });
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
        const wrap = el.createEl('div', { cls: 'fakecard-image-wrap' });
        const img = wrap.createEl('img', { cls: 'fakecard-image' });
        img.src = this.app.vault.adapter.getResourcePath(image.path);

        if (revealed || image.groups.length === 0) return;

        const firstId = image.groups[0].id;
        const overlay = wrap.createEl('div', { cls: 'fakecard-image-overlay is-static' });
        for (const group of image.groups) {
            const isAsked = group.id === firstId;
            // The asked group is always hidden; other groups are hidden too
            // unless "mask all groups" is switched off.
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
     * Pause the parent and open a prefilled panel for a stand-in card. The
     * child is linked through childOf and never touches the parent's text.
     */
    private createChild(parent: CardRecord): void {
        if (!this.plugin.settings.childCardsEnabled) return;

        const onSaved = (): void => {
            void this.reload();
        };

        if (parent.type === 'cloze' && parent.clozeText) {
            new ClozePanelModal(
                this.app,
                this.plugin,
                parent.source.path,
                undefined,
                parent.clozeText,
                onSaved,
                parent.id,
            ).open();
        } else {
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

        parent.suspended = true;
        void this.plugin.store.save(parent);
    }

    /**
     * After rating a child: a run of Good ratings graduates it; once every
     * child of the parent has graduated, the parent comes back.
     */
    private async checkChild(child: CardRecord): Promise<void> {
        if (!child.childOf) return;

        const streak = Math.max(1, this.plugin.settings.childGoodStreak);
        const logs = await this.plugin.reviews.recentForCard(child.id, streak);
        if (logs.length < streak || !logs.every((log) => log.rating >= 3)) return;

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
        this.contentEl.empty();
    }
}
