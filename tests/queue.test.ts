import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import type { CardRecord } from '../src/card';
import { buildQueueCounts, buildReviewQueue } from '../src/queue';

const DAY = 86400000;

function card(id: string, fsrs: Record<string, unknown> | undefined, extra: Partial<CardRecord> = {}): CardRecord {
    return {
        id,
        type: 'qa',
        front: id,
        back: 'a',
        deck: 'default',
        tags: [],
        source: { path: 'note.md' },
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        ...(fsrs ? { fsrs: fsrs as never } : {}),
        ...extra,
    };
}

function plugin(cards: CardRecord[], settings: Partial<Record<string, unknown>> = {}, todayLogs: unknown[] = []) {
    return {
        settings: {
            maxReviewsPerDay: 2,
            newCardsPerDay: 3,
            adaptiveDailyLoad: false,
            pauseNewWhenBacklogged: false,
            ...settings,
        },
        reviewLimitBoost: 0,
        store: { list: async () => cards },
        reviews: { forDay: async () => todayLogs },
    } as never;
}

const past = new Date(Date.now() - DAY).toISOString();

describe('queue counts', () => {
    const cards = [
        card('review', { state: State.Review, due: past, last_review: past, stability: 5 }),
        card('learning', { state: State.Learning, due: past, last_review: past, stability: 1 }),
        card('new', undefined),
        card('buried', { state: State.Review, due: past, last_review: past }, {
            buriedUntil: new Date(Date.now() + DAY).toISOString(),
        }),
        card('suspended', { state: State.Review, due: past, last_review: past }, { suspended: true }),
        card('graduated', undefined, { graduated: true }),
    ];

    it('separates due, learning and new, and ignores paused or buried cards', async () => {
        const counts = await buildQueueCounts(plugin(cards));
        expect(counts).toEqual({ due: 1, learning: 1, fresh: 1, backlog: 0 });
    });

    it('caps due cards at the daily limit and reports the rest as backlog', async () => {
        const counts = await buildQueueCounts(plugin(cards, { maxReviewsPerDay: 1 }));
        expect(counts).toEqual({ due: 0, learning: 1, fresh: 1, backlog: 1 });
    });

    it('does not count reviews already made today', async () => {
        const logs = [{ rating: 3, wasNew: false }, { rating: 3, wasNew: false }];
        const counts = await buildQueueCounts(plugin(cards, {}, logs));
        expect(counts).toEqual({ due: 0, learning: 0, fresh: 1, backlog: 2 });
    });

    it('can pause new cards when the backlog exceeds the limit', async () => {
        const counts = await buildQueueCounts(plugin(cards, {
            maxReviewsPerDay: 1,
            pauseNewWhenBacklogged: true,
        }));
        expect(counts.fresh).toBe(0);
    });

    it('filters by deck before counting', async () => {
        const mixed = [...cards, card('other', undefined, { deck: 'other' })];
        const counts = await buildQueueCounts(plugin(mixed), 'other');
        expect(counts.fresh).toBe(1);
        expect(counts.due).toBe(0);
    });

    it('keeps a buried new card out of the fresh count', async () => {
        const counts = await buildQueueCounts(plugin([
            card('new', undefined),
            card('buriedNew', undefined, { buriedUntil: new Date(Date.now() + DAY).toISOString() }),
        ]));
        expect(counts).toEqual({ due: 0, learning: 0, fresh: 1, backlog: 0 });
    });
});

function reviewPlugin(cards: CardRecord[], settings: Partial<Record<string, unknown>> = {}) {
    return {
        settings: {
            maxReviewsPerDay: 2,
            newCardsPerDay: 3,
            adaptiveDailyLoad: false,
            pauseNewWhenBacklogged: false,
            recoveryMode: false,
            ...settings,
        },
        reviewLimitBoost: 0,
        store: { list: async () => cards, loadDecks: async () => ['default'] },
        reviews: { forDay: async () => [] },
    } as never;
}

describe('review queue', () => {
    const buriedUntil = new Date(Date.now() + DAY).toISOString();
    const cards = [
        card('due', { state: State.Review, due: past, last_review: past, stability: 5 }),
        card('fresh', undefined),
        card('buried', { state: State.Review, due: past, last_review: past, stability: 5 }, { buriedUntil }),
        card('buriedNew', undefined, { buriedUntil }),
    ];

    it('keeps buried cards out of the session but counts them', async () => {
        const queue = await buildReviewQueue(reviewPlugin(cards), 'all', { prune: false });
        expect(queue.cards.map((entry) => entry.id)).toEqual(['due', 'fresh']);
        expect(queue.buried).toBe(2);
        expect(queue.total).toBe(4);
    });

    it('brings a bury back once its deadline has passed', async () => {
        const yesterday = new Date(Date.now() - DAY).toISOString();
        const woke = cards.map((entry) => (
            entry.buriedUntil ? { ...entry, buriedUntil: yesterday } : entry
        ));
        const queue = await buildReviewQueue(reviewPlugin(woke), 'all', { prune: false });
        expect(queue.buried).toBe(0);
        expect(queue.cards.map((entry) => entry.id)).toEqual(['due', 'buried', 'fresh', 'buriedNew']);
    });
});
