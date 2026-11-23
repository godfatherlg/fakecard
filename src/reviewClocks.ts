import { setIcon, setTooltip } from 'obsidian';

import type { AnswerTimeBreakdown } from './answerTime';
import type { CardRecord } from './card';
import { tt, ttf } from './i18n';
import { formatClock, pointsForRatio, recallBudget, slowStep } from './reviewClock';
import type FakeCardPlugin from '../main';

/** The answer side's measurement: what the clock saw and what it ran against. */
export interface RecallMeasurement {
    seconds: number;
    ratio: number;
    breakdown: AnswerTimeBreakdown;
}

export interface ClockHost {
    /** Repaint: hiding or restoring the clock replaces the pill. */
    render: () => void;
    /** Whether the answer is on screen, so the question clock is over. */
    isRevealed: () => boolean;
    /** When the current card was first shown; the question clock runs from it. */
    cardShownAt: () => number;
    /** The clock came back on the question side: measure answering from now. */
    restartCardShownAt: () => void;
}

/**
 * The two clocks and the state they measure.
 *
 * Kept out of ReviewView because the clock is a small state machine - start on
 * reveal, restart by hand, switch off for the card - and the view only has to
 * say when a side appeared and what the rating should do with the score.
 */
export class ReviewClocks {
    /** The answer side's measurement, or null when nothing was measured. */
    private measurement: RecallMeasurement | null = null;
    /** When that clock started; kept so a repaint resumes instead of resetting. */
    private startedAt = 0;
    /** Start of the answering clock, for the fast/slow rating nudge. */
    private questionStartedAt = 0;
    /** Seconds the answer took to come out, frozen when the card is revealed. */
    private answeredSeconds = 0;
    /**
     * The clock was switched off. It stays off for the cards after this one
     * too - a distraction lasts longer than one card - until the small clock
     * button turns it back on. A clock that is off measures nothing and scores
     * nothing, so it cannot leave a wrong Hard point behind.
     */
    private clockHidden = false;
    private hintTimer: number | null = null;

    constructor(
        private plugin: FakeCardPlugin,
        private host: ClockHost,
    ) {}

    /**
     * A repaint starts a fresh slot: a card that is not revealed yet has no
     * memory clock - the number belongs to the pair (this card, this answer),
     * not to the view.
     */
    onRender(revealed: boolean): void {
        this.clearHint();
        if (!revealed) {
            this.measurement = null;
            this.startedAt = 0;
        }
    }

    /** A new session: nothing measured, and the next card starts the clock. */
    resetSession(): void {
        this.answeredSeconds = 0;
        this.questionStartedAt = 0;
        this.measurement = null;
        this.startedAt = 0;
    }

    /** Seconds the answer took; only meaningful once `freezeAnswered` ran. */
    get answered(): number {
        return this.answeredSeconds;
    }

    get hidden(): boolean {
        return this.clockHidden;
    }

    /**
     * Freeze the answering time for the fast/slow nudge. The question clock
     * may be a few hundred milliseconds stale, and its reset moves this.
     */
    freezeAnswered(): void {
        this.answeredSeconds = this.questionStartedAt > 0
            ? Math.max(0, Math.round((Date.now() - this.questionStartedAt) / 1000))
            : 0;
    }

    /**
     * Memorising starts with the answer: a fresh clock, not the question count
     * carried over. The question clock measured answering, which is a
     * different thing and is never scored.
     */
    startOnReveal(card: CardRecord): void {
        if (this.plugin.settings.answerTimeHint && !this.clockHidden) {
            this.measurement = { seconds: 0, ratio: 0, breakdown: this.recallBudget(card) };
            this.startedAt = Date.now();
        } else {
            this.measurement = null;
            this.startedAt = 0;
        }
    }

    /** The budget this card is measured against, live measurement first. */
    budgetFor(card: CardRecord): AnswerTimeBreakdown {
        return this.measurement?.breakdown ?? this.recallBudget(card);
    }

    /** Hard points the answer-side overtime has earned; 0 when not measured. */
    score(): number {
        if (this.clockHidden || !this.measurement) return 0;
        return pointsForRatio(this.measurement.ratio, this.plugin.settings);
    }

    /** Stop the hint's clock; called on every render and when the view closes. */
    clearHint(): void {
        if (this.hintTimer !== null) window.clearInterval(this.hintTimer);
        this.hintTimer = null;
    }

    /** Draw whichever pill the current side of the card needs. */
    renderPill(host: HTMLElement, card: CardRecord, revealed: boolean): void {
        if (!this.plugin.settings.answerTimeHint) return;
        if (this.clockHidden) {
            this.renderRestore(host, card);
        } else if (revealed) {
            this.renderMemorize(host, card);
        } else {
            this.renderQuestion(host, card);
        }
    }

    private recallBudget(card: CardRecord): AnswerTimeBreakdown {
        return recallBudget(card, this.plugin.settings);
    }

    private budgetTooltip(breakdown: AnswerTimeBreakdown): string {
        return ttf(
            'Budget {budget}: one pass {pass} × {repeat} more + first pass {first}',
            {
                budget: formatClock(breakdown.seconds),
                pass: formatClock(Math.round(breakdown.memoryOnePass)),
                repeat: String(Math.max(0, breakdown.passes - 1)),
                first: formatClock(Math.round(breakdown.firstPass)),
            },
        );
    }

    /**
     * The pill both sides use: the number, a reset that starts it over, and a
     * switch that turns the whole clock off for this card.
     */
    private createPill(host: HTMLElement): {
        chip: HTMLElement;
        timeEl: HTMLElement;
        reset: HTMLButtonElement;
        hide: HTMLButtonElement;
    } {
        const chip = host.createDiv({ cls: 'fakecard-recall' });
        const timeEl = chip.createSpan({ cls: 'fakecard-recall-time' });
        const reset = chip.createEl('button', { cls: 'fakecard-recall-reset' });
        setIcon(reset, 'refresh-cw');
        setTooltip(reset, tt('Restart the timer'));
        const hide = chip.createEl('button', { cls: 'fakecard-recall-reset' });
        setIcon(hide, 'eye-off');
        setTooltip(hide, tt('Turn the clock off'));
        return { chip, timeEl, reset, hide };
    }

    /** Switch the clock off: nothing is measured, so nothing can be scored. */
    private hideClock(): void {
        this.clockHidden = true;
        this.measurement = null;
        this.startedAt = 0;
        this.host.render();
    }

    /** The small button that brings the clock back after it was switched off. */
    private renderRestore(host: HTMLElement, card: CardRecord): void {
        const button = host.createEl('button', { cls: 'fakecard-recall-restore' });
        setIcon(button, 'clock');
        setTooltip(button, tt('Turn the clock back on'));
        button.addEventListener('click', () => {
            this.clockHidden = false;
            if (this.host.isRevealed()) {
                // Measuring starts again from now: the hidden stretch is not
                // part of the memory and must not be scored.
                this.measurement = { seconds: 0, ratio: 0, breakdown: this.recallBudget(card) };
                this.startedAt = Date.now();
            } else {
                // Same on the question side: the time with the clock off is not
                // answering time either.
                this.host.restartCardShownAt();
            }
            this.host.render();
        });
    }

    /**
     * Run a pill as a clock; returns the restart its reset button calls.
     *
     * `stopWhenRevealed` is what separates the two sides: the question clock is
     * over once the answer appears, while a clock restarted on the answer side
     * keeps running until the card is rated.
     */
    private runClock(
        chip: HTMLElement,
        timeEl: HTMLElement,
        breakdown: AnswerTimeBreakdown,
        startAt: number,
        label: string,
        stopWhenRevealed: boolean,
        /**
         * Budget the pill counts against. The question side counts against one
         * pass (the answering time, a hint); the answer side and the score use
         * the whole memory budget.
         */
        displayBudget = breakdown.seconds,
        /** Called after every tick with the ratio the pill is showing. */
        onTick?: (ratio: number) => void,
    ): () => void {
        if (this.hintTimer !== null) window.clearInterval(this.hintTimer);
        let startedAt = startAt;
        let frozen = false;
        if (stopWhenRevealed) this.questionStartedAt = startedAt;
        const stopAt = Math.max(1.5, 1 + slowStep(this.plugin.settings));

        const tick = (): void => {
            // A repaint replaces the pill; this closure belongs to the old one.
            if (!chip.isConnected) return;
            if (stopWhenRevealed && this.host.isRevealed()) return;

            const seconds = Math.floor((Date.now() - startedAt) / 1000);
            const shownRatio = displayBudget > 0 ? seconds / displayBudget : 0;
            // The real time is kept even after the display freezes: the rating
            // scores what happened, not the number the pill stopped showing.
            this.measurement = {
                seconds,
                ratio: breakdown.seconds > 0 ? seconds / breakdown.seconds : 0,
                breakdown,
            };
            // Past the first slow step the number is no longer news - it stops
            // and waits for a deliberate reset.
            if (frozen) return;
            if (shownRatio >= stopAt) frozen = true;

            timeEl.setText(ttf('{label} {elapsed} / {budget}', {
                label: tt(label),
                elapsed: formatClock(seconds),
                budget: formatClock(displayBudget),
            }));
            chip.toggleClass('is-warning', shownRatio >= 1);
            chip.toggleClass('is-late', shownRatio >= 1.5);
            chip.toggleClass('is-stop', shownRatio >= stopAt);
            onTick?.(shownRatio);
        };

        this.hintTimer = window.setInterval(tick, 500);
        tick();
        return () => {
            startedAt = Date.now();
            if (stopWhenRevealed) this.questionStartedAt = startedAt;
            frozen = false;
            tick();
        };
    }

    /** The question side: the answering clock, on the question's own row. */
    private renderQuestion(host: HTMLElement, card: CardRecord): void {
        if (this.host.isRevealed()) return;
        const breakdown = this.recallBudget(card);
        const { chip, timeEl, reset, hide } = this.createPill(host);
        chip.addClass('is-live');
        // One pass, not the whole memory budget: this clock is the reminder
        // that answering should not drag on, and nothing here is scored.
        setTooltip(chip, ttf(
            'Answering budget {budget}: base plus reading time for one pass',
            { budget: formatClock(Math.round(breakdown.onePass)) },
        ));
        // Measuring from when the card was first shown (not from this render)
        // keeps the clock honest across a repaint.
        const restart = this.runClock(
            chip,
            timeEl,
            breakdown,
            this.host.cardShownAt() || Date.now(),
            'Answering',
            true,
            breakdown.onePass,
        );
        reset.addEventListener('click', (event) => {
            event.stopPropagation();
            restart();
        });
        hide.addEventListener('click', (event) => {
            event.stopPropagation();
            this.hideClock();
        });
    }

    /**
     * The answer side: a memory clock that starts with the answer.
     *
     * It is its own measurement - memorising the answer from the correct text -
     * not the question-side count carried over. The badge appears as soon as
     * the time passes the first slow step, so the price of the overtime is
     * visible before the rating is given.
     */
    private renderMemorize(host: HTMLElement, card: CardRecord): void {
        const recall = this.measurement;
        if (!recall || !this.plugin.settings.answerTimeHint) return;
        const { chip, timeEl, reset, hide } = this.createPill(host);
        chip.addClass('is-live');
        setTooltip(chip, this.budgetTooltip(recall.breakdown));

        const badge = chip.createSpan({ cls: 'fakecard-recall-badge' });
        badge.hide();

        const restart = this.runClock(
            chip,
            timeEl,
            recall.breakdown,
            this.startedAt || Date.now(),
            'Recalling',
            false,
            recall.breakdown.seconds,
            (ratio) => {
                const points = pointsForRatio(ratio, this.plugin.settings);
                if (points > 0) {
                    badge.setText(ttf('Too slow: +{points} Hard', { points: String(points) }));
                    badge.show();
                } else {
                    badge.hide();
                }
                chip.toggleClass('is-over', points > 0);
            },
        );
        reset.addEventListener('click', (event) => {
            event.stopPropagation();
            this.startedAt = Date.now();
            restart();
        });
        hide.addEventListener('click', (event) => {
            event.stopPropagation();
            this.hideClock();
        });
    }
}
