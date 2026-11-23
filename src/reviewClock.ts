import { answerTimeBreakdown, DEFAULT_SLOW_STEP } from './answerTime';
import type { AnswerTimeBreakdown } from './answerTime';
import type { CardRecord } from './card';
import type { FakeCardSettings } from './settings';

/** `m:ss`, for both clocks and the rating nudge. */
export function formatClock(totalSeconds: number): string {
    const safe = Math.max(0, Math.floor(totalSeconds));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** The answering/memorising budget for one card, from the current settings. */
export function recallBudget(card: CardRecord, settings: FakeCardSettings): AnswerTimeBreakdown {
    return answerTimeBreakdown(card, settings.answerTimeBase, {
        secondsPerChunk: settings.answerTimeSecondsPerChunk,
        passes: settings.answerTimePasses,
        firstPassSeconds: settings.answerTimeFirstPass,
        historyWeight: settings.answerTimeHistoryWeight,
        memoryWeight: settings.answerTimeMemoryWeight,
        imageChars: settings.answerTimeImageChars,
    });
}

/** Size of one step of overtime, in multiples of the budget. */
export function slowStep(settings: FakeCardSettings): number {
    const value = Number(settings.answerTimeSlowStep);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_SLOW_STEP;
}

/** Hard points one slow step is worth; 0 turns the scoring off. */
export function slowPointsPerStep(settings: FakeCardSettings): number {
    const value = Number(settings.answerTimeSlowPoints);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Failing points a recall at `ratio` times the budget has earned.
 *
 * One step is `answerTimeSlowStep` budgets past the first: with the defaults
 * (0.5 and 0.5) 1.5x is one step and 2x is two, so 0.5 and 1 point.
 */
export function pointsForRatio(ratio: number, settings: FakeCardSettings): number {
    const perStep = slowPointsPerStep(settings);
    if (perStep <= 0) return 0;
    const step = slowStep(settings);
    const over = ratio - 1;
    if (over < step) return 0;
    return Math.round(Math.floor(over / step) * perStep * 100) / 100;
}
