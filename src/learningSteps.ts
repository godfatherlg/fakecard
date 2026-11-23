import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard, Grade } from 'ts-fsrs';
import type { CardRecord } from './card';

const UNITS: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
};

/**
 * Parse an Anki-style step list: `1m 10m 1d`.
 *
 * Returns null for empty or malformed text. Comma-separated lists work too,
 * because users paste them from Anki's settings.
 */
export function parseSteps(text: string): number[] | null {
    const parts = text.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (parts.length === 0) return null;

    const steps: number[] = [];
    for (const part of parts) {
        const match = /^(\d+(?:\.\d+)?)\s*([smhd])$/.exec(part);
        if (!match) return null;
        const amount = Number(match[1]);
        if (!Number.isFinite(amount) || !(amount > 0)) return null;
        const ms = Math.round(amount * UNITS[match[2]]);
        if (ms < 1000) return null;
        steps.push(ms);
    }
    return steps;
}

/** Format a step list back to text, for a settings field or a hint. */
export function formatSteps(steps: number[]): string {
    return steps.map((ms) => {
        if (ms % UNITS.d === 0) return `${ms / UNITS.d}d`;
        if (ms % UNITS.h === 0) return `${ms / UNITS.h}h`;
        if (ms % UNITS.m === 0) return `${ms / UNITS.m}m`;
        return `${Math.round(ms / UNITS.s)}s`;
    }).join(' ');
}

export interface StepResult {
    /** FSRS memory state with a learning-step due date laid over it. */
    card: FsrsCard;
    /** The step the card now sits in; absent once it graduated. */
    lstep?: number;
}

/**
 * Put one rating through Anki-style learning steps instead of FSRS's own
 * short-term schedule.
 *
 * Returns null when the rating is not a learning step, so the caller can keep
 * the normal FSRS path: a Review card rated Hard/Good/Easy, a card whose
 * learning state predates this setting (no step index), or an empty list.
 */
export function applyLearningStep(
    card: CardRecord,
    rating: Rating,
    now: Date,
    learning: number[],
    relearning: number[],
): StepResult | null {
    if (learning.length === 0) return null;

    const current = card.fsrs;
    const state = current?.state ?? State.New;
    const relearningPhase = state === State.Relearning
        || (state === State.Review && rating === Rating.Again);
    if (state === State.Review && rating !== Rating.Again) return null;
    // A Learning or Relearning card from before this setting has no step
    // index: FSRS owns it until it graduates rather than guessing mid-list.
    if ((state === State.Learning || state === State.Relearning) && card.lstep === undefined) {
        return null;
    }

    const list = relearningPhase
        ? (relearning.length > 0 ? relearning : learning)
        : learning;
    if (list.length === 0) return null;

    const scheduler = fsrs();
    const next = scheduler.next(current ?? createEmptyCard(now), now, rating as Grade);
    // A new card enters at the first step; a learning card sits at its own.
    const index = state === State.New ? 0 : Math.min(card.lstep ?? 0, list.length - 1);

    let lstep = 0;
    let delay: number | null = null;
    if (rating === Rating.Again) {
        lstep = 0;
        delay = list[0];
    } else if (rating === Rating.Hard) {
        lstep = index;
        delay = list[index];
    } else if (rating === Rating.Good) {
        const following = index + 1;
        if (following < list.length) {
            lstep = following;
            delay = list[following];
        }
    } else {
        // Easy: straight to Review, with whatever interval FSRS gives it.
        lstep = 0;
    }

    if (delay !== null) {
        const stepped = { ...next.card };
        stepped.state = relearningPhase ? State.Relearning : State.Learning;
        stepped.due = new Date(now.getTime() + delay);
        return { card: stepped, lstep };
    }

    // Graduation: FSRS decides the interval. A new card rated Good before it
    // was in a learning state can still come back as Learning (10 minutes);
    // one more Good turns that into the day-level interval.
    let graduated = next.card;
    if (graduated.state !== State.Review) {
        graduated = scheduler.next(graduated, now, Rating.Good).card;
    }
    if (graduated.state !== State.Review) {
        graduated = { ...graduated, state: State.Review, due: new Date(now.getTime() + UNITS.d) };
    }
    graduated.state = State.Review;
    return { card: graduated };
}
