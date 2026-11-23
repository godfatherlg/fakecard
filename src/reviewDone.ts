import { setTooltip } from 'obsidian';

import { tt, ttf } from './i18n';
import type FakeCardPlugin from '../main';

export interface DonePageState {
    /** The queue came back empty, so nothing else is due today. */
    emptyQueue: boolean;
    /** Cards in the library, for the line shown when a session ended. */
    total: number;
    /** Due cards the daily limit kept out of the session. */
    backlog: number;
    /** Cards hidden until tomorrow by a bury. */
    buried: number;
}

/**
 * The end of a session, with the two ways to keep going.
 *
 * They never appear together, because they mean different things: a card
 * behind the daily limit is today's work (no interval scaling), a card that
 * is not due yet is borrowed from the future (its interval is scaled).
 *
 * Kept out of ReviewView so the view stays about the card on screen; this page
 * owns its own receipt line and the timer that fades it.
 */
export class ReviewDonePage {
    /** When Refresh was last pressed, for the receipt it leaves behind. */
    private refreshedAt = 0;
    private flashTimer: number | null = null;

    constructor(
        private plugin: FakeCardPlugin,
        private hooks: {
            /** Repaint the view once the receipt fades. */
            render: () => void;
            /** Recompute today's queue in the same pane. */
            reload: () => void;
            /** Borrow a batch of cards from the future. */
            startAhead: () => void;
        },
    ) {}

    /** Drop the receipt's timer; every render starts the page from scratch. */
    cancelFlash(): void {
        if (this.flashTimer === null) return;
        window.clearTimeout(this.flashTimer);
        this.flashTimer = null;
    }

    render(container: HTMLElement, state: DonePageState): void {
        container.createEl('h2', { text: tt('Review finished') });
        container.createEl('p', {
            cls: 'fakecard-review-done-note',
            text: state.emptyQueue
                // Nothing was due when the page was drawn (refresh, or the
                // session ended and the queue came back empty).
                ? tt('Nothing else is due today.')
                : ttf('{count} card(s) in the library.', { count: state.total }),
        });

        // A buried card is not due and not behind the limit: say where it went,
        // or the finish page reads as if the library lost it.
        if (state.buried > 0) {
            container.createEl('p', {
                cls: 'fakecard-review-done-note',
                text: ttf('{count} card(s) are buried until tomorrow.', { count: state.buried }),
            });
        }

        const actions = container.createDiv({ cls: 'fakecard-review-done' });

        if (state.backlog > 0) {
            container.createEl('p', {
                cls: 'fakecard-review-done-note',
                text: ttf('{count} due card(s) are waiting behind the daily limit.', { count: state.backlog }),
            });
            const more = actions.createEl('button', {
                cls: 'mod-cta fakecard-review-done-primary',
                text: ttf('Study more today ({count} left)', { count: state.backlog }),
            });
            setTooltip(more, ttf(
                'Today still has {count} due card(s) the daily limit cut off. Each press allows {step} more; they are due today, so intervals are not scaled.',
                { count: state.backlog, step: this.plugin.boostStepSize() },
            ));
            more.addEventListener('click', () => {
                this.plugin.boostReviewLimit();
                this.hooks.reload();
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
                this.hooks.startAhead();
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
            this.hooks.reload();
        });

        if (Date.now() - this.refreshedAt < 2500) {
            container.createEl('p', {
                cls: 'fakecard-review-done-flash',
                text: state.backlog > 0
                    ? ttf('Refreshed - {count} due card(s) are waiting.', { count: state.backlog })
                    : state.buried > 0
                        ? ttf('Refreshed - {count} card(s) are buried until tomorrow.', { count: state.buried })
                        : tt('Refreshed - nothing else is due today.'),
            });
            // The flash is a receipt, not a state: drop it after a moment.
            this.flashTimer = window.setTimeout(() => {
                this.flashTimer = null;
                this.refreshedAt = 0;
                this.hooks.render();
            }, 2500);
        }
    }
}
