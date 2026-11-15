import { State } from 'ts-fsrs';
import type { CardRecord } from './card';

/**
 * Anki-style search for the Browse view.
 *
 * Supported terms (space separated, AND):
 *
 *   deck:方剂            deck contains the value
 *   tag:麻黄             tag equals the value
 *   type:qa|cloze|image
 *   is:new|learning|review|relearning|due|child|paused|graduated|orphan
 *   front:text / back:text
 *   added:7              created in the last N days
 *   rated:N              reviewed in the last N days (1 = today)
 *   prop:due<7           due within 7 days
 *   prop:ivl>=21         interval at least 21 days
 *   prop:difficulty>=7   FSRS difficulty 1..10 (decimals allowed)
 *   prop:reps>5 / prop:lapses>0
 *   -tag:xxx             negated term
 *   plain words          full-text match
 *
 * Everything that is not a known key falls through to full text, so a plain
 * search keeps working.
 */
export interface SearchContext {
    /** cardId -> how many days ago it was last reviewed (0 = today). */
    ratedAgo: ReadonlyMap<string, number>;
    /** Cards whose source note is missing. */
    orphanIds: ReadonlySet<string>;
    now: number;
}

interface Token {
    negate: boolean;
    key: string;
    value: string;
}

const DAY_MS = 86400000;

function tokenize(query: string): Token[] {
    const tokens: Token[] = [];
    const re = /(-?)(?:(\w+):)?("[^"]*"|\S+)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(query)) !== null) {
        const negate = match[1] === '-';
        const key = (match[2] ?? '').toLowerCase();
        let value = match[3];
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        value = value.trim();
        if (!value) continue;
        tokens.push({ negate, key, value: value.toLowerCase() });
    }
    return tokens;
}

function matchesIs(card: CardRecord, value: string, ctx: SearchContext): boolean {
    switch (value) {
        case 'new':
            return !card.fsrs || card.fsrs.state === State.New;
        case 'learning':
            return card.fsrs?.state === State.Learning;
        case 'review':
            return card.fsrs?.state === State.Review;
        case 'relearning':
            return card.fsrs?.state === State.Relearning;
        case 'due':
            return !!card.fsrs && new Date(card.fsrs.due).getTime() <= ctx.now;
        case 'child':
            return !!card.childOf;
        case 'paused':
            return !!card.suspended;
        case 'graduated':
            return !!card.graduated;
        case 'orphan':
            return ctx.orphanIds.has(card.id);
        default:
            return false;
    }
}

function matchesProp(card: CardRecord, value: string, ctx: SearchContext): boolean {
    const match = /^(due|ivl|reps|lapses|difficulty)(<=|>=|<|>|=)([\d.]+)$/.exec(value);
    if (!match) return false;
    const [, prop, op, raw] = match;
    const target = Number(raw);
    if (!Number.isFinite(target)) return false;

    let actual: number;
    if (prop === 'due') {
        if (!card.fsrs) return false;
        actual = (new Date(card.fsrs.due).getTime() - ctx.now) / DAY_MS;
    } else if (prop === 'ivl') {
        actual = card.fsrs?.scheduled_days ?? 0;
    } else if (prop === 'reps') {
        actual = card.fsrs?.reps ?? 0;
    } else if (prop === 'difficulty') {
        // Unreviewed cards have no difficulty yet - they never match.
        if (!card.fsrs) return false;
        actual = card.fsrs.difficulty;
    } else {
        actual = card.fsrs?.lapses ?? 0;
    }

    switch (op) {
        case '<':
            return actual < target;
        case '<=':
            return actual <= target;
        case '>':
            return actual > target;
        case '>=':
            return actual >= target;
        default:
            return Math.round(actual) === target;
    }
}

function matchesToken(card: CardRecord, token: Token, ctx: SearchContext): boolean {
    const { key, value } = token;
    const text = [
        card.front,
        card.back,
        card.clozeText ?? '',
        (card.tags ?? []).join(' '),
        card.source.path,
    ].join(' ').toLowerCase();

    switch (key) {
        case 'deck':
            return (card.deck ?? 'default').toLowerCase().includes(value);
        case 'tag':
            return (card.tags ?? []).some((tag) => tag.toLowerCase() === value);
        case 'type':
            return card.type === value;
        case 'front':
            return card.front.toLowerCase().includes(value);
        case 'back':
            return card.back.toLowerCase().includes(value);
        case 'is':
            return matchesIs(card, value, ctx);
        case 'added': {
            const days = Number(value);
            if (!Number.isFinite(days) || days < 0) return false;
            return new Date(card.created).getTime() >= ctx.now - days * DAY_MS;
        }
        case 'rated': {
            const days = Number(value);
            if (!Number.isFinite(days) || days <= 0) return false;
            const ago = ctx.ratedAgo.get(card.id);
            // rated:1 = today, rated:7 = today + the previous six days.
            return ago !== undefined && ago <= days - 1;
        }
        case 'prop':
            return matchesProp(card, value, ctx);
        default:
            return text.includes(value);
    }
}

export function matchesQuery(card: CardRecord, query: string, ctx: SearchContext): boolean {
    const tokens = tokenize(query);
    if (tokens.length === 0) return true;
    return tokens.every((token) => {
        const hit = matchesToken(card, token, ctx);
        return token.negate ? !hit : hit;
    });
}
