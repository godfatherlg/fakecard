import { Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard } from 'ts-fsrs';

/**
 * The two interval corrections FSRS itself does not know about: a success after
 * a long gap, and a rating given before the card was due.
 *
 * Both are pure and take the setting as a flag, so the review view stays about
 * the session and these rules stay testable on their own.
 */

/**
 * A success after a long gap is weak evidence: the card had decayed, so one
 * late pass must not push it out for months. Cap the new interval at 1.5x the
 * previous one (and 60 days), which two on-time reviews then undo by growing
 * normally again.
 */
export function capOverdueInterval(
    previous: FsrsCard,
    scheduled: FsrsCard,
    now: Date,
    rating: Rating,
    enabled: boolean,
): void {
    if (!enabled) return;
    if (rating < Rating.Good) return;
    if (previous.state !== State.Review) return;
    const last = previous.last_review
        ? new Date(previous.last_review).getTime()
        : new Date(previous.due).getTime();
    const elapsed = Math.max(0, (now.getTime() - last) / 86400000);
    const stability = previous.stability ?? 0;
    // ~5x past stability is roughly below 70% retrievability.
    if (stability <= 0 || elapsed < stability * 5) return;
    const previousInterval = Math.max(1, previous.scheduled_days ?? 1);
    const cap = Math.min(60, Math.ceil(previousInterval * 1.5));
    if (scheduled.scheduled_days <= cap) return;
    scheduled.scheduled_days = cap;
    scheduled.due = new Date(now.getTime() + cap * 86400000);
}

/**
 * Keep a rating made before the due date honest.
 *
 * FSRS assumes the rating arrived when the card was scheduled; taken at face
 * value, studying a 30-day card on day 3 would push it out as if it had just
 * been reviewed on time. Subtracting the days gained early gives back what that
 * unearned head start was worth, and the result is clamped so a card is never
 * scheduled earlier than it already was.
 *
 * Only reviews of learned cards are touched: new and learning cards are
 * scheduled in minutes, and an Again is a real failure whose shorter interval
 * should stand.
 */
export function shortenEarlyInterval(
    previous: FsrsCard | undefined,
    scheduled: FsrsCard,
    now: Date,
    rating: Rating,
    enabled: boolean,
): void {
    if (!enabled) return;
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
