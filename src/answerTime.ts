import type { CardRecord } from './card';

/**
 * Suggested answer time, ported from the True Recall PR.
 *
 * Two inputs, both already known while the card is on screen:
 * - answer length: reading a long answer back costs time, up to +75% at the
 *   extremes of the usual range;
 * - difficulty: FSRS's learned summary of the Again/Hard/Good/Easy history
 *   (1 = trivial, 10 = hard), moved by `historyWeight` in percent. A negative
 *   weight pulls the nudge in earlier (counters overthinking), a positive one
 *   gives slow cards more room, 0 ignores history entirely.
 *
 * The two are combined as `(base + length) * historyFactor`, clamped so a
 * pathological card never suggests more than 600 seconds, and never less than
 * 5. Defaults follow the values the True Recall install uses: 10s base, 10s
 * per 40 characters, -20% difficulty weight.
 */
const CHARS_PER_CHUNK = 40;

/** FSRS difficulty is 1..10; 5.5 is the neutral middle. */
const NEUTRAL_DIFFICULTY = 5.5;
const DIFFICULTY_SPAN = 9;
/** The history factor never collapses the budget below this share. */
const MIN_HISTORY_FACTOR = 0.3;

const MIN_SECONDS = 5;
const MAX_SECONDS = 600;

export const DEFAULT_ANSWER_SECONDS = 10;
export const DEFAULT_SECONDS_PER_CHUNK = 10;
export const DEFAULT_HISTORY_WEIGHT = -20;

export interface AnswerTimeWeights {
    /** Extra seconds per 40 characters of answer. 0 ignores length. */
    secondsPerChunk?: number;
    /**
     * How strongly difficulty moves the budget, in percent. Positive gives hard
     * cards more time (slow recall); negative flags them earlier (stuck); 0
     * ignores history.
     */
    historyWeight?: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/** Characters the reader actually sees: tags, cloze markers and spacing dropped. */
export function visibleAnswerLength(text: string): number {
    return text
        .replace(/<[^>]*>/g, ' ')
        .replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, '$1')
        .replace(/\s+/g, ' ')
        .trim().length;
}

/** The text the user has to read back: the back side, or the cloze body. */
function answerText(card: CardRecord): string {
    if (card.type === 'cloze' && card.clozeText) return card.clozeText;
    return card.back ?? card.front ?? '';
}

export function suggestedAnswerSeconds(
    card: CardRecord,
    baseSeconds = DEFAULT_ANSWER_SECONDS,
    weights: AnswerTimeWeights = {},
): number {
    const base = Math.max(MIN_SECONDS, Math.round(baseSeconds));
    const secondsPerChunk = Math.max(
        0,
        weights.secondsPerChunk ?? DEFAULT_SECONDS_PER_CHUNK,
    );
    // Negative on purpose: a hard card can also mean "nudge me sooner".
    const historyWeight = (weights.historyWeight ?? DEFAULT_HISTORY_WEIGHT) / 100;

    // The base time covers a short answer; every 40 characters of answer adds
    // its own reading time on top, so the budget grows linearly with length.
    const lengthSeconds =
        (visibleAnswerLength(answerText(card)) / CHARS_PER_CHUNK) * secondsPerChunk;

    const reps = card.fsrs?.reps ?? 0;
    const difficulty = card.fsrs?.difficulty ?? 0;
    // Difficulty is normalised to -1..+1 around the neutral middle, then scaled
    // by the weight. New cards have no history, so the weight never fires before
    // the first review.
    const spread = clamp((difficulty - NEUTRAL_DIFFICULTY) / DIFFICULTY_SPAN, -1, 1);
    const historyFactor =
        reps > 0 && historyWeight !== 0
            ? Math.max(MIN_HISTORY_FACTOR, 1 + spread * historyWeight)
            : 1;

    const total = (base + lengthSeconds) * historyFactor;
    return Math.max(
        MIN_SECONDS,
        Math.round(Math.min(total, MAX_SECONDS)),
    );
}
