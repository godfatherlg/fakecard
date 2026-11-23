import { describe, expect, it } from 'vitest';
import { createEmptyCard, fsrs, Rating, State } from 'ts-fsrs';
import type { Card as FsrsCard } from 'ts-fsrs';
import type { CardRecord } from '../src/card';
import { applyLearningStep, formatSteps, parseSteps } from '../src/learningSteps';

const NOW = new Date('2026-11-23T10:00:00Z');
const MINUTE = 60 * 1000;

function record(fsrsCard?: FsrsCard, lstep?: number): CardRecord {
    return {
        id: 'c1',
        type: 'qa',
        deck: 'default',
        front: 'q',
        back: 'a',
        source: { path: 'note.md' },
        tags: [],
        created: NOW.toISOString(),
        updated: NOW.toISOString(),
        fsrs: fsrsCard,
        lstep,
    };
}

describe('parseSteps', () => {
    it('parses minutes, hours and days in order', () => {
        expect(parseSteps('1m 10m 1d')).toEqual([MINUTE, 10 * MINUTE, 24 * 60 * MINUTE]);
        expect(parseSteps('1.5h')).toEqual([90 * MINUTE]);
    });

    it('accepts commas and extra spaces', () => {
        expect(parseSteps(' 1m, 10m ')).toEqual([MINUTE, 10 * MINUTE]);
    });

    it('rejects empty, unit-less and zero values', () => {
        expect(parseSteps('')).toBeNull();
        expect(parseSteps('10')).toBeNull();
        expect(parseSteps('0m')).toBeNull();
        expect(parseSteps('-1m')).toBeNull();
    });

    it('formats a list back to text', () => {
        expect(formatSteps([MINUTE, 10 * MINUTE, 24 * 60 * MINUTE])).toBe('1m 10m 1d');
    });
});

describe('applyLearningStep', () => {
    const steps = [MINUTE, 10 * MINUTE];
    const relearn = [5 * MINUTE];

    it('puts a new card rated Again on the first step', () => {
        const result = applyLearningStep(record(), Rating.Again, NOW, steps, relearn);
        expect(result).not.toBeNull();
        expect(result!.lstep).toBe(0);
        expect(result!.card.state).toBe(State.Learning);
        expect(result!.card.due.getTime() - NOW.getTime()).toBe(MINUTE);
    });

    it('puts a new card rated Good on the second step', () => {
        const result = applyLearningStep(record(), Rating.Good, NOW, steps, relearn);
        expect(result!.lstep).toBe(1);
        expect(result!.card.state).toBe(State.Learning);
        expect(result!.card.due.getTime() - NOW.getTime()).toBe(10 * MINUTE);
    });

    it('repeats the current step on Hard', () => {
        const first = applyLearningStep(record(), Rating.Good, NOW, steps, relearn)!;
        const hard = applyLearningStep(record(first.card, first.lstep), Rating.Hard, NOW, steps, relearn)!;
        expect(hard.lstep).toBe(1);
        expect(hard.card.due.getTime() - NOW.getTime()).toBe(10 * MINUTE);
    });

    it('graduates after the last step', () => {
        const first = applyLearningStep(record(), Rating.Good, NOW, steps, relearn)!;
        const last = applyLearningStep(record(first.card, first.lstep), Rating.Good, NOW, steps, relearn)!;
        expect(last.lstep).toBeUndefined();
        expect(last.card.state).toBe(State.Review);
        expect(last.card.due.getTime() - NOW.getTime()).toBeGreaterThan(60 * MINUTE);
    });

    it('graduates a one-step list on Good', () => {
        const result = applyLearningStep(record(), Rating.Good, NOW, [MINUTE], relearn)!;
        expect(result.lstep).toBeUndefined();
        expect(result.card.state).toBe(State.Review);
    });

    it('graduates a new card on Easy', () => {
        const result = applyLearningStep(record(), Rating.Easy, NOW, steps, relearn)!;
        expect(result.lstep).toBeUndefined();
        expect(result.card.state).toBe(State.Review);
    });

    it('sends a lapsed review card to relearning', () => {
        const scheduler = fsrs();
        const review = scheduler.next(createEmptyCard(NOW), NOW, Rating.Good).card;
        const learned = scheduler.next(review, NOW, Rating.Good).card;
        expect(learned.state).toBe(State.Review);

        const result = applyLearningStep(record(learned), Rating.Again, NOW, steps, relearn)!;
        expect(result.lstep).toBe(0);
        expect(result.card.state).toBe(State.Relearning);
        expect(result.card.due.getTime() - NOW.getTime()).toBe(5 * MINUTE);
    });

    it('leaves review ratings other than Again to FSRS', () => {
        const scheduler = fsrs();
        const review = scheduler.next(createEmptyCard(NOW), NOW, Rating.Easy).card;
        expect(review.state).toBe(State.Review);
        for (const rating of [Rating.Hard, Rating.Good, Rating.Easy]) {
            expect(applyLearningStep(record(review), rating, NOW, steps, relearn)).toBeNull();
        }
    });

    it('leaves learning cards without a step index to FSRS', () => {
        const scheduler = fsrs();
        const learning = scheduler.next(createEmptyCard(NOW), NOW, Rating.Again).card;
        expect(learning.state).toBe(State.Learning);
        expect(applyLearningStep(record(learning), Rating.Good, NOW, steps, relearn)).toBeNull();
    });

    it('does nothing without steps', () => {
        expect(applyLearningStep(record(), Rating.Again, NOW, [], relearn)).toBeNull();
    });
});
