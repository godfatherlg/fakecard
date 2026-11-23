import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import type { CardRecord } from '../src/card';
import {
    holeAnswer,
    holeHint,
    parseCloze,
    renderClozeHtml,
    withHoleHint,
    wrapSelection,
} from '../src/cloze';
import { findQuestionNode, outlineGroups, parseOutline, splitNodeText } from '../src/outline';
import { answerTimeBreakdown } from '../src/answerTime';
import { childScore, hardStreakScore, hasHardStreak } from '../src/childStreak';
import { dailyReviewLimit } from '../src/limit';
import { formatClock, pointsForRatio } from '../src/reviewClock';
import { UndoStack } from '../src/reviewUndo';
import { matchesQuery, type SearchContext } from '../src/search';
import type { FakeCardSettings } from '../src/settings';

function card(partial: Partial<CardRecord> = {}): CardRecord {
    return {
        id: 'c1',
        type: 'qa',
        front: 'hello',
        back: 'world',
        deck: 'x',
        tags: ['t'],
        source: { path: 'note.md' },
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
        ...partial,
    } as unknown as CardRecord;
}

function context(): SearchContext {
    return { ratedAgo: new Map(), orphanIds: new Set(), now: Date.now() };
}

describe('cloze', () => {
    it('parses group, text and note', () => {
        const [hole] = parseCloze('a{{c1::answer::note}}b');
        expect(hole.group).toBe(1);
        expect(hole.text).toBe('answer');
        expect(hole.hint).toBe('note');
        expect(hole.from).toBe(1);
    });

    it('wraps a selection and keeps the caret after the token', () => {
        const result = wrapSelection('abcd', 1, 3, 2);
        expect(result.text).toBe('a{{c2::bc}}d');
        expect(result.caret).toBe(result.text.length - 1);
    });

    it('reads and rewrites the note without touching the answer', () => {
        const token = '{{c1::answer::old}}';
        expect(holeHint(token)).toBe('old');
        expect(holeAnswer(token)).toBe('answer');
        expect(withHoleHint(token, 'new')).toBe('{{c1::answer::new}}');
        expect(withHoleHint('{{c1::answer}}', 'new')).toBe('{{c1::answer::new}}');
        expect(withHoleHint(token, '')).toBe('{{c1::answer}}');
    });

    it('renders every group as a mask and the asked one in the accent', () => {
        const html = renderClozeHtml('a{{c1::one}}b{{c2::two}}', 'all', 1);
        expect(html).toContain('fakecard-cloze-mask');
        expect(html).toContain('fakecard-cloze-other');
        expect(html).not.toContain('fakecard-cloze-answer');
    });

    it('renders the answer side with no hidden groups', () => {
        const html = renderClozeHtml('a{{c1::one}}', new Set<number>(), 1);
        expect(html).toContain('fakecard-cloze-answer');
        expect(html).not.toContain('fakecard-cloze-mask');
    });
});

describe('outline', () => {
    const root = parseOutline('root\n  - a\n  - b{{c1::x}}');

    it('builds depths and keeps holes on the node', () => {
        expect(root.children).toHaveLength(2);
        expect(root.children[1].text).toContain('{{c1::x}}');
        expect(root.children[1].holes).toHaveLength(1);
    });

    it('splits a node into pieces with offsets and notes', () => {
        const pieces = splitNodeText('a{{c1::b::h}}c', new Set([1]));
        expect(pieces.map((piece) => piece.text)).toEqual(['a', 'b', 'c']);
        expect(pieces[1].masked).toBe(true);
        expect(pieces[1].hint).toBe('h');
        expect(pieces[1].from).toBe(1);
    });

    it('finds the node a group asks about', () => {
        expect(findQuestionNode(root, 1)?.text).toBe('b{{c1::x}}');
        expect(outlineGroups(root)).toEqual([1]);
    });
});

describe('answer time', () => {
    it('multiplies one pass by the passes and adds the first pass once', () => {
        const breakdown = answerTimeBreakdown(card({ back: 'x'.repeat(40) }), 10, {
            secondsPerChunk: 10,
            passes: 3,
            firstPassSeconds: 20,
            historyWeight: 0,
            memoryWeight: 0,
        });
        expect(breakdown.onePass).toBe(20);
        expect(breakdown.firstPass).toBe(40);
        expect(breakdown.seconds).toBe(80);
    });

    it('gives a hard card more room with a positive memory weight', () => {
        const fsrs = {
            state: State.Review,
            due: new Date(),
            last_review: new Date(),
            reps: 5,
            difficulty: 9,
            stability: 10,
            scheduled_days: 10,
        };
        const neutral = answerTimeBreakdown(card({ back: 'x'.repeat(40), fsrs: fsrs as never }), 10, {
            secondsPerChunk: 10,
            passes: 1,
            firstPassSeconds: 0,
            historyWeight: 0,
            memoryWeight: 0,
        });
        const hard = answerTimeBreakdown(card({ back: 'x'.repeat(40), fsrs: fsrs as never }), 10, {
            secondsPerChunk: 10,
            passes: 1,
            firstPassSeconds: 0,
            historyWeight: 0,
            memoryWeight: 20,
        });
        expect(hard.seconds).toBeGreaterThan(neutral.seconds);
    });
});

describe('child score', () => {
    it('counts Again as two and Hard as one, and stops at a normal Good', () => {
        expect(childScore([{ rating: 1 }, { rating: 2 }, { rating: 3 }])).toBe(3);
    });

    it('counts a slow Hard and stops at a good pass', () => {
        expect(childScore([{ rating: 2, slow: true }])).toBe(2);
        expect(childScore([{ rating: 3, slow: true }, { rating: 2 }])).toBe(0);
    });

    it('reports a streak at the threshold', () => {
        expect(hardStreakScore([2, 2], 2)).toBe(2);
        expect(hardStreakScore([2, 3], 2)).toBe(1);
        expect(hasHardStreak([2, 2], 2)).toBe(true);
        expect(hasHardStreak([2, 3], 2)).toBe(false);
    });
});

describe('search', () => {
    const fsrs = {
        state: State.Review,
        due: new Date(Date.now() - 86400000),
        last_review: new Date(Date.now() - 2 * 86400000),
        reps: 4,
        difficulty: 5,
        stability: 3,
        scheduled_days: 2,
    };
    const due = card({ deck: '方剂', tags: ['麻黄'], fsrs: fsrs as never });

    it('matches deck, tag and due', () => {
        expect(matchesQuery(due, 'deck:方剂 tag:麻黄 is:due', context())).toBe(true);
        expect(matchesQuery(due, 'deck:其他', context())).toBe(false);
        expect(matchesQuery(due, 'tag:麻黄 -tag:桂枝', context())).toBe(true);
    });

    it('matches numeric properties', () => {
        expect(matchesQuery(due, 'prop:due<7 prop:ivl>=2', context())).toBe(true);
        expect(matchesQuery(due, 'prop:reps>10', context())).toBe(false);
    });

    it('matches buried cards separately from due ones', () => {
        const buried = card({
            buriedUntil: new Date(Date.now() + 86400000).toISOString(),
            fsrs: fsrs as never,
        });
        expect(matchesQuery(buried, 'is:buried', context())).toBe(true);
        expect(matchesQuery(buried, 'is:due', context())).toBe(false);
        expect(matchesQuery(buried, '-is:buried', context())).toBe(false);
    });
});

describe('review clock', () => {
    const settings = {
        answerTimeSlowStep: 0.5,
        answerTimeSlowPoints: 0.5,
    } as FakeCardSettings;

    it('formats m:ss and clamps negatives', () => {
        expect(formatClock(0)).toBe('0:00');
        expect(formatClock(65)).toBe('1:05');
        expect(formatClock(-3)).toBe('0:00');
    });

    it('counts half a point per step past the budget', () => {
        expect(pointsForRatio(1.4, settings)).toBe(0);
        expect(pointsForRatio(1.5, settings)).toBe(0.5);
        expect(pointsForRatio(2, settings)).toBe(1);
    });

    it('turns scoring off at zero points per step', () => {
        expect(pointsForRatio(3, { ...settings, answerTimeSlowPoints: 0 } as FakeCardSettings)).toBe(0);
    });
});

describe('undo stack', () => {
    it('pops newest first and clears at a session boundary', () => {
        const stack = new UndoStack();
        stack.push({ cardId: 'a', index: 0, snapshots: [] });
        stack.push({ cardId: 'b', index: 1, snapshots: [] });
        expect(stack.size).toBe(2);
        expect(stack.pop()?.cardId).toBe('b');
        stack.clear();
        expect(stack.size).toBe(0);
        expect(stack.pop()).toBeUndefined();
    });
});

describe('daily limit', () => {
    const base = { base: 100, boost: 0, adaptive: true };

    it('leaves the configured limit alone when adaptive is off', () => {
        expect(dailyReviewLimit({ ...base, adaptive: false, yesterday: [] })).toBe(100);
    });

    it('needs ten reviews before acting', () => {
        const nine = Array.from({ length: 9 }, () => ({ rating: 1 }));
        expect(dailyReviewLimit({ ...base, yesterday: nine })).toBe(100);
    });

    it('shrinks after a bad day and grows after a good one', () => {
        const bad = Array.from({ length: 10 }, (_, i) => ({ rating: i < 5 ? 3 : 1 }));
        const good = Array.from({ length: 10 }, () => ({ rating: 3 }));
        expect(dailyReviewLimit({ ...base, yesterday: bad })).toBe(80);
        expect(dailyReviewLimit({ ...base, yesterday: good })).toBe(110);
    });

    it('counts the boost before applying the percentage', () => {
        const bad = Array.from({ length: 10 }, () => ({ rating: 1 }));
        expect(dailyReviewLimit({ ...base, boost: 20, yesterday: bad })).toBe(96);
    });
});
