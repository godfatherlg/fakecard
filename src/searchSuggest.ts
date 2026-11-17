import { tt } from './i18n';

/**
 * Suggestions for the browse search box.
 *
 * The query language is Anki-flavoured (see search.ts): space-separated terms,
 * each `key:value`, a leading `-` negates. Typing all of that from memory is no
 * fun, so the token under the caret is read back and completed here - the
 * operator first, then its values, then the comparison for `prop:`.
 *
 * Pure: it takes the query, the caret and the values that exist in the library,
 * and returns what could be inserted. No DOM, no settings, no async.
 */
export interface SuggestSource {
    decks: readonly string[];
    tags: readonly string[];
}

export interface Suggestion {
    /** Replaces the token under the caret. */
    insert: string;
    /** Shown in the row. */
    label: string;
    /** What the term means, on the right. */
    hint?: string;
}

export interface SuggestResult {
    from: number;
    to: number;
    items: Suggestion[];
}

/** Operators, in the order they are worth learning. */
const KEYS: ReadonlyArray<{ key: string; hint: string }> = [
    { key: 'is:', hint: 'State' },
    { key: 'deck:', hint: 'Deck' },
    { key: 'tag:', hint: 'Tag' },
    { key: 'type:', hint: 'Type' },
    { key: 'front:', hint: 'Question' },
    { key: 'back:', hint: 'Answer' },
    { key: 'prop:', hint: 'due, interval, difficulty …' },
    { key: 'added:', hint: 'created in the last N days' },
    { key: 'rated:', hint: 'reviewed in the last N days' },
];

const IS_VALUES: ReadonlyArray<{ value: string; hint: string }> = [
    { value: 'new', hint: 'never reviewed' },
    { value: 'due', hint: 'ready today' },
    { value: 'learning', hint: 'in its first steps' },
    { value: 'review', hint: 'on the long schedule' },
    { value: 'relearning', hint: 'failed and back in steps' },
    { value: 'child', hint: 'a stand-in card' },
    { value: 'paused', hint: 'kept out of the queue' },
    { value: 'graduated', hint: 'finished stand-in' },
    { value: 'orphan', hint: 'source note is gone' },
];

const TYPE_VALUES: ReadonlyArray<{ value: string; hint: string }> = [
    { value: 'qa', hint: 'question and answer' },
    { value: 'cloze', hint: 'cloze' },
    { value: 'image', hint: 'image occlusion' },
];

/** `prop:` takes a comparison, then a number. */
const PROPS: ReadonlyArray<{ name: string; ops: string[]; hint: string }> = [
    { name: 'due', ops: ['<', '<=', '>', '>='], hint: 'days until due' },
    { name: 'ivl', ops: ['>=', '<='], hint: 'interval in days' },
    { name: 'difficulty', ops: ['>=', '<'], hint: 'FSRS difficulty 1-10' },
    { name: 'reps', ops: ['>', '>='], hint: 'reviews so far' },
    { name: 'lapses', ops: ['>', '>='], hint: 'times forgotten' },
];

/** A value that contains a space has to be quoted to stay one term. */
function term(prefix: string, key: string, value: string): string {
    return /\s/.test(value) ? `${prefix}${key}:"${value}"` : `${prefix}${key}:${value}`;
}

export function suggestFor(
    query: string,
    caret: number,
    source: SuggestSource,
): SuggestResult | null {
    const at = Math.max(0, Math.min(caret, query.length));
    let start = at;
    while (start > 0 && !/\s/.test(query[start - 1])) start--;
    let end = at;
    while (end < query.length && !/\s/.test(query[end])) end++;

    const token = query.slice(start, end);
    if (!token) return null;

    const negate = token.startsWith('-');
    const prefix = negate ? '-' : '';
    const body = negate ? token.slice(1) : token;
    const colon = body.indexOf(':');

    if (colon < 0) {
        const typed = body.toLowerCase();
        const items = KEYS
            .filter((entry) => entry.key.toLowerCase().startsWith(typed))
            .map((entry) => ({
                insert: `${prefix}${entry.key}`,
                label: `${prefix}${entry.key}`,
                hint: tt(entry.hint),
            }));
        return items.length > 0 ? { from: start, to: end, items } : null;
    }

    const key = body.slice(0, colon).toLowerCase();
    const value = body.slice(colon + 1);
    const lowered = value.toLowerCase();
    const result = (items: Suggestion[]): SuggestResult | null =>
        (items.length > 0 ? { from: start, to: end, items } : null);

    switch (key) {
        case 'deck':
        case 'tag': {
            const pool = key === 'deck' ? source.decks : source.tags;
            const items = pool
                .filter((entry) => entry.toLowerCase().includes(lowered))
                .slice(0, 12)
                .map((entry) => ({
                    insert: term(prefix, key, entry),
                    label: term(prefix, key, entry),
                    hint: tt(key === 'deck' ? 'Deck' : 'Tag'),
                }));
            return result(items);
        }
        case 'type':
            return result(TYPE_VALUES
                .filter((entry) => entry.value.startsWith(lowered))
                .map((entry) => ({
                    insert: `${prefix}type:${entry.value}`,
                    label: `${prefix}type:${entry.value}`,
                    hint: tt(entry.hint),
                })));
        case 'is':
            return result(IS_VALUES
                .filter((entry) => entry.value.startsWith(lowered))
                .map((entry) => ({
                    insert: `${prefix}is:${entry.value}`,
                    label: `${prefix}is:${entry.value}`,
                    hint: tt(entry.hint),
                })));
        case 'prop': {
            const match = /^([a-z]*)([<>=]*)([\d.]*)$/.exec(value);
            if (!match) return null;
            const [, name, op, number] = match;
            const prop = PROPS.find((entry) => entry.name.startsWith(name.toLowerCase()));
            if (!prop) {
                // Still typing the property name.
                return result(PROPS
                    .filter((entry) => entry.name.startsWith(name.toLowerCase()))
                    .map((entry) => ({
                        insert: `${prefix}prop:${entry.name}`,
                        label: `${prefix}prop:${entry.name}`,
                        hint: tt(entry.hint),
                    })));
            }
            if (!op) {
                return result(prop.ops.map((candidate) => ({
                    insert: `${prefix}prop:${prop.name}${candidate}`,
                    label: `${prefix}prop:${prop.name}${candidate}`,
                    hint: tt('comparison'),
                })));
            }
            if (number === '') {
                return result(['1', '7', '30', '90'].map((candidate) => ({
                    insert: `${prefix}prop:${prop.name}${op}${candidate}`,
                    label: `${prefix}prop:${prop.name}${op}${candidate}`,
                    hint: tt(prop.hint),
                })));
            }
            return null;
        }
        case 'added':
        case 'rated':
            return result(['1', '7', '30'].map((candidate) => ({
                insert: `${prefix}${key}:${candidate}`,
                label: `${prefix}${key}:${candidate}`,
                hint: tt(key === 'added' ? 'created in the last N days' : 'reviewed in the last N days'),
            })));
        default:
            // front:, back: and anything unknown take free text - no list to give.
            return null;
    }
}
