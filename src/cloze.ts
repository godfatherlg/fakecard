/**
 * Anki cloze syntax helpers.
 *
 *   {{c1::text}}          - a hole in group 1
 *   {{c1::text::hint}}    - a hole in group 1 with a hint
 *
 * The card body is stored as plain text in this format - the same text the
 * manual panel edits, AI generation writes, and the review renderer consumes.
 * Group numbers decide what is hidden together.
 */

export interface ClozeHole {
    group: number;
    /** Start/end of the whole {{cN::...}} token. */
    from: number;
    to: number;
    /** The hidden content. */
    text: string;
    hint?: string;
}

const CLOZE_RE = /\{\{c(\d+)::(.*?)(?:::(.*?))?\}\}/g;

export function parseCloze(text: string): ClozeHole[] {
    const holes: ClozeHole[] = [];
    CLOZE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CLOZE_RE.exec(text)) !== null) {
        holes.push({
            group: Number(match[1]),
            from: match.index,
            to: match.index + match[0].length,
            text: match[2],
            hint: match[3],
        });
    }
    return holes;
}

/** Sorted distinct group numbers present in the text. */
export function clozeGroups(text: string): number[] {
    const groups = new Set<number>();
    for (const hole of parseCloze(text)) groups.add(hole.group);
    return Array.from(groups).sort((a, b) => a - b);
}

/**
 * Front side: holes in `hidden` become [___], every other hole shows its text
 * without the token. `'all'` hides every group.
 */
export function renderCloze(text: string, hidden: ReadonlySet<number> | 'all'): string {
    return text.replace(CLOZE_RE, (_m, groupStr: string, inner: string, hint?: string) => {
        const group = Number(groupStr);
        const isHidden = hidden === 'all' || hidden.has(group);
        if (!isHidden) return inner;
        // Anki hint: {{c1::answer::hint}} shows the hint while the hole is
        // hidden, so the question can carry a note without revealing the
        // answer.
        return hint ? `[${hint}]` : '[___]';
    });
}

/** Back side: every hole revealed, tokens removed. */
export function revealCloze(text: string): string {
    return renderCloze(text, new Set<number>());
}

/** {{c1::answer}} / {{c1::answer::hint}} -> ==answer== (keeps the note's highlight syntax). */
export function clozeToHighlight(text: string): string {
    return text.replace(/\{\{c\d+::([^}]+?)(?:::[^}]+)?\}\}/g, (_m, answer: string) => `==${answer}==`);
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Same as renderCloze, but wrapped in spans so CSS can colour the two sides:
 *
 *   hidden hole -> <span class="fakecard-cloze-mask">[hint]</span>
 *   revealed    -> <span class="fakecard-cloze-answer">text</span>
 *
 * Only used for on-screen rendering (Review / Browse / Preview). The stored
 * front/back stay plain text, so search and the card list are unaffected.
 */
export function renderClozeHtml(
    text: string,
    hidden: ReadonlySet<number> | 'all',
    askedGroup?: number,
): string {
    // A newline right before or after a hole comes from a hard-wrapped source
    // line, not from the card: Obsidian renders a single newline as a line
    // break, which put the hole alone on its own line. Only whitespace that
    // touches a marker is normalised - paragraphs and lists keep their breaks.
    const flow = text
        .replace(/[ \t]*\n[ \t]*(?=\{\{c\d+::)/g, ' ')
        .replace(/(\}\})[ \t]*\n[ \t]*/g, '$1 ');
    return flow.replace(CLOZE_RE, (match, groupStr: string, inner: string, hint: string | undefined, offset: number) => {
        const group = Number(groupStr);
        const isHidden = hidden === 'all' || hidden.has(group);
        // The offsets let an editor map a click back to the source and remove
        // exactly this hole.
        const span = `data-cloze-group="${group}" data-from="${offset}" data-to="${offset + match.length}"`;
        if (isHidden) {
            const label = hint ? escapeHtml(hint) : '___';
            // Only the group being asked gets the accent colour. Other groups
            // are hidden too but stay neutral, so it is obvious what to answer.
            const cls = askedGroup === undefined || group === askedGroup
                ? 'fakecard-cloze-mask'
                : 'fakecard-cloze-other';
            return `<span class="${cls}" ${span}>[${label}]</span>`;
        }
        return `<span class="fakecard-cloze-answer" ${span}>${escapeHtml(inner)}</span>`;
    });
}

/** The note written after the second `::` of a hole token, if any. */
export function holeHint(token: string): string | undefined {
    const match = /^\{\{c\d+::[\s\S]*?(?:::(.*?))?\}\}$/.exec(token);
    return match?.[1]?.trim() || undefined;
}

/** The same hole token with its note replaced; an empty note removes it. */
export function withHoleHint(token: string, hint: string): string {
    const match = /^\{\{c(\d+)::([\s\S]*?)(?:::(.*?))?\}\}$/.exec(token);
    if (!match) return token;
    const [, group, answer] = match;
    return hint ? `{{c${group}::${answer}::${hint}}}` : `{{c${group}::${answer}}}`;
}

/**
 * Wrap the selection in {{cN::...}}. The whole current selection becomes one
 * hole; if it already is a token, the token is re-grouped instead.
 */
export function wrapSelection(
    text: string,
    from: number,
    to: number,
    group: number,
): { text: string; caret: number } {
    const inner = text.slice(from, to);
    const wrapped = `{{c${group}::${inner}}}`;
    return {
        text: text.slice(0, from) + wrapped + text.slice(to),
        caret: from + wrapped.length,
    };
}

/** A replacement covering whole lines, for `wrapBlockLines`. */
export interface BlockWrap {
    text: string;
    from: number;
    to: number;
}

/** Markdown markers that must stay outside a hole for the block to keep its shape. */
const BLOCK_PREFIX = /^[ \t]*(?:[-*+] |\d+[.)] |> ?|#{1,6} )/;

/**
 * Wrap a selection that spans several lines, one line at a time.
 *
 * A single hole around a list is not a hole: `{{c1::1. a\n2. b}}` puts the list
 * markers inside the braces, so the list stops being a list and nothing renders
 * as a hole either. Wrapping each line *after* its own list, quote or heading
 * marker keeps every block intact, and all the pieces still ask in one group.
 *
 * Lines that are already a hole, table rows (braces inside a table break the
 * table), and blank lines are left as they are.
 */
export function wrapBlockLines(
    text: string,
    from: number,
    to: number,
    group: number,
): BlockWrap {
    const lineFrom = text.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
    const newline = text.indexOf('\n', to);
    const lineTo = newline < 0 ? text.length : newline;

    const wrapped = text.slice(lineFrom, lineTo).split('\n').map((line) => {
        if (line.trim().length === 0) return line;
        if (parseCloze(line).length > 0) return line;
        if (/^[ \t]*\|/.test(line)) return line;
        const prefix = BLOCK_PREFIX.exec(line)?.[0] ?? /^[ \t]*/.exec(line)?.[0] ?? '';
        return `${prefix}{{c${group}::${line.slice(prefix.length)}}}`;
    }).join('\n');

    return { text: wrapped, from: lineFrom, to: lineTo };
}

/**
 * Remove the token(s) that overlap the selection, leaving the plain text.
 * Used by the "remove cloze" button after the user selects around a hole.
 */
export function unwrapSelection(
    text: string,
    from: number,
    to: number,
): { text: string; caret: number } {
    const holes = parseCloze(text).filter((hole) => hole.to > from && hole.from < to);
    if (holes.length === 0) return { text, caret: to };

    let next = text;
    let delta = 0;
    let caret = to;
    for (const hole of holes) {
        next = next.slice(0, hole.from + delta) + hole.text + next.slice(hole.to + delta);
        delta -= hole.to - hole.from - hole.text.length;
        caret += delta;
    }
    return { text: next, caret };
}

/**
 * Turn a text selection into Anki cloze text.
 *
 * - ==highlight== becomes a hole.
 * - A %%note%% right after a highlight becomes its ::hint, so
 *   "==麻黄== %%药名%%" -> "{{c1::麻黄::药名}}".
 * - Every LINE with highlights is its own group, so each list item is asked
 *   separately (c1, c2, ...).
 * - Lines without highlights are kept as-is.
 */
export function selectionToClozeText(selection: string): string {
    const lines = selection.split('\n');
    const out: string[] = [];
    let group = 1;

    for (const line of lines) {
        if (!/==[^=]+==/.test(line)) {
            out.push(line);
            continue;
        }

        // Collect the highlights in this line...
        const holes: Array<{ from: number; to: number; text: string }> = [];
        const holeRe = /==([^=]+)==/g;
        let match: RegExpExecArray | null;
        while ((match = holeRe.exec(line)) !== null) {
            holes.push({ from: match.index, to: match.index + match[0].length, text: match[1].trim() });
        }

        // ...and attach every %%note%% to the closest highlight BEFORE it,
        // even when other text sits in between ("==麻黄==、桂枝 %%md%%").
        const hints: string[] = holes.map(() => '');
        const removals: Array<{ from: number; to: number }> = [];
        const noteRe = /%%([^%]+)%%/g;
        while ((match = noteRe.exec(line)) !== null) {
            const noteFrom = match.index;
            let holeIndex = -1;
            for (let i = 0; i < holes.length; i++) {
                if (holes[i].to <= noteFrom) holeIndex = i;
                else break;
            }
            // A note with no highlight before it stays untouched.
            if (holeIndex === -1) continue;
            const note = match[1].trim();
            hints[holeIndex] = hints[holeIndex] ? `${hints[holeIndex]} ${note}` : note;
            removals.push({ from: noteFrom, to: noteFrom + match[0].length });
        }

        // Apply edits from the end so earlier offsets stay valid.
        const edits: Array<{ from: number; to: number; text: string }> = [
            ...removals.map((removal) => ({ ...removal, text: '' })),
            ...holes.map((hole, index) => ({
                from: hole.from,
                to: hole.to,
                text: `{{c${group}::${hole.text}${hints[index] ? `::${hints[index]}` : ''}}}`,
            })),
        ].sort((a, b) => b.from - a.from);

        let converted = line;
        for (const edit of edits) {
            converted = converted.slice(0, edit.from) + edit.text + converted.slice(edit.to);
        }

        out.push(converted);
        group++;
    }

    return out.join('\n');
}

/** Simple front/back preview for the manual panel. */
export function previewCloze(text: string): { front: string; back: string } {
    return {
        front: renderCloze(text, new Set([1])),
        back: revealCloze(text),
    };
}
