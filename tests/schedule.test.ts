import { describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard } from 'ts-fsrs';
import { capOverdueInterval, shortenEarlyInterval } from '../src/reviewSchedule';

const DAY = 86400000;

function fsrs(partial: Partial<FsrsCard> = {}): FsrsCard {
    return {
        due: new Date(),
        stability: 10,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: 10,
        reps: 1,
        lapses: 0,
        state: State.Review,
        ...partial,
    } as FsrsCard;
}

describe('shortenEarlyInterval', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');

    it('gives back the days gained early', () => {
        const previous = fsrs({ due: new Date(now.getTime() + 25 * DAY) });
        const scheduled = fsrs({ scheduled_days: 40, due: new Date(now.getTime() + 40 * DAY) });
        shortenEarlyInterval(previous, scheduled, now, Rating.Good, true);
        expect(scheduled.scheduled_days).toBe(25);
        expect(scheduled.due.getTime()).toBe(now.getTime() + 25 * DAY);
    });

    it('never schedules the card earlier than it already was', () => {
        // 30 of the 40 days are already gone: the honest interval is the 30
        // days still lived, i.e. exactly the old due date, not sooner.
        const previous = fsrs({ due: new Date(now.getTime() + 30 * DAY) });
        const scheduled = fsrs({ scheduled_days: 40, due: new Date(now.getTime() + 40 * DAY) });
        shortenEarlyInterval(previous, scheduled, now, Rating.Good, true);
        expect(scheduled.scheduled_days).toBe(30);
        expect(scheduled.due.getTime()).toBe(now.getTime() + 30 * DAY);
    });

    it('leaves an FSRS interval shorter than the remaining time alone', () => {
        const previous = fsrs({ due: new Date(now.getTime() + 20 * DAY) });
        const scheduled = fsrs({ scheduled_days: 5, due: new Date(now.getTime() + 5 * DAY) });
        shortenEarlyInterval(previous, scheduled, now, Rating.Good, true);
        expect(scheduled.scheduled_days).toBe(5);
    });

    it('keeps most of the FSRS interval when the early part is small', () => {
        const previous = fsrs({ due: new Date(now.getTime() + 3 * DAY) });
        const scheduled = fsrs({ scheduled_days: 40, due: new Date(now.getTime() + 40 * DAY) });
        shortenEarlyInterval(previous, scheduled, now, Rating.Easy, true);
        expect(scheduled.scheduled_days).toBe(37);
    });

    it('leaves an Again alone', () => {
        const previous = fsrs({ due: new Date(now.getTime() + 25 * DAY) });
        const scheduled = fsrs({ scheduled_days: 10, due: new Date(now.getTime() + 10 * DAY) });
        shortenEarlyInterval(previous, scheduled, now, Rating.Again, true);
        expect(scheduled.scheduled_days).toBe(10);
    });

    it('leaves a card that was not being reviewed alone', () => {
        const previous = fsrs({ state: State.Learning, due: new Date(now.getTime() + 25 * DAY) });
        const scheduled = fsrs({ scheduled_days: 40, due: new Date(now.getTime() + 40 * DAY) });
        shortenEarlyInterval(previous, scheduled, now, Rating.Good, true);
        expect(scheduled.scheduled_days).toBe(40);
    });

    it('leaves a review that lands outside Review alone', () => {
        const previous = fsrs({ due: new Date(now.getTime() + 25 * DAY) });
        const scheduled = fsrs({ state: State.Learning, scheduled_days: 40, due: new Date(now.getTime() + 40 * DAY) });
        shortenEarlyInterval(previous, scheduled, now, Rating.Good, true);
        expect(scheduled.scheduled_days).toBe(40);
    });

    it('does nothing when the setting is off', () => {
        const previous = fsrs({ due: new Date(now.getTime() + 25 * DAY) });
        const scheduled = fsrs({ scheduled_days: 40, due: new Date(now.getTime() + 40 * DAY) });
        shortenEarlyInterval(previous, scheduled, now, Rating.Good, false);
        expect(scheduled.scheduled_days).toBe(40);
    });
});

describe('capOverdueInterval', () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const lastReview = new Date(now.getTime() - 100 * DAY);

    it('caps a success after a long gap at 1.5x the old interval', () => {
        const previous = fsrs({ last_review: lastReview, stability: 5, scheduled_days: 10 });
        const scheduled = fsrs({ scheduled_days: 200, due: new Date(now.getTime() + 200 * DAY) });
        capOverdueInterval(previous, scheduled, now, Rating.Good, true);
        expect(scheduled.scheduled_days).toBe(15);
        expect(scheduled.due.getTime()).toBe(now.getTime() + 15 * DAY);
    });

    it('never caps above 60 days', () => {
        const previous = fsrs({ last_review: lastReview, stability: 5, scheduled_days: 100 });
        const scheduled = fsrs({ scheduled_days: 300, due: new Date(now.getTime() + 300 * DAY) });
        capOverdueInterval(previous, scheduled, now, Rating.Good, true);
        expect(scheduled.scheduled_days).toBe(60);
    });

    it('leaves a success made on time alone', () => {
        const previous = fsrs({ last_review: new Date(now.getTime() - 10 * DAY), stability: 5, scheduled_days: 10 });
        const scheduled = fsrs({ scheduled_days: 60, due: new Date(now.getTime() + 60 * DAY) });
        capOverdueInterval(previous, scheduled, now, Rating.Good, true);
        expect(scheduled.scheduled_days).toBe(60);
    });

    it('leaves a failing rating alone', () => {
        const previous = fsrs({ last_review: lastReview, stability: 5, scheduled_days: 10 });
        const scheduled = fsrs({ scheduled_days: 5, due: new Date(now.getTime() + 5 * DAY) });
        capOverdueInterval(previous, scheduled, now, Rating.Hard, true);
        expect(scheduled.scheduled_days).toBe(5);
    });

    it('leaves a card that was not being reviewed alone', () => {
        const previous = fsrs({ state: State.Relearning, last_review: lastReview, stability: 5, scheduled_days: 10 });
        const scheduled = fsrs({ scheduled_days: 200, due: new Date(now.getTime() + 200 * DAY) });
        capOverdueInterval(previous, scheduled, now, Rating.Good, true);
        expect(scheduled.scheduled_days).toBe(200);
    });

    it('does nothing when the setting is off', () => {
        const previous = fsrs({ last_review: lastReview, stability: 5, scheduled_days: 10 });
        const scheduled = fsrs({ scheduled_days: 200, due: new Date(now.getTime() + 200 * DAY) });
        capOverdueInterval(previous, scheduled, now, Rating.Good, false);
        expect(scheduled.scheduled_days).toBe(200);
    });
});
