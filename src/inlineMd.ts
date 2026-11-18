import { parseCloze } from './cloze';

/**
 * The small slice of Markdown a map node actually uses.
 *
 * A node is a label, not a document: bold, italic, highlight, inline code and
 * link labels are what people put in them, and all of it can be drawn in one
 * pass without waiting on a renderer - which matters because the layout
 * measures the node right after it is built.
 */
const PATTERN = /(\*\*[^*]+\*\*|==[^=]+==|`[^`]+`|\*[^*]+\*|\[\[[^\]]*\]\]|\[[^\]]*\]\([^)]*\))/g;

/**
 * The visible characters of a node's raw text, plus where each of them came
 * from. Obsidian's renderer drops the markers (`**`, `==`, `[[a|b]]`), so a
 * selection counted in visible characters needs this map to find its way back
 * to the raw text that gets wrapped.
 */
/**
 * Wrap a selection as plain text.
 *
 * The selection is counted in visible characters, so it can start or end inside
 * a `**bold**` or `==highlight==` token - wrapping those offsets verbatim would
 * cut a marker in half and leave broken Markdown behind. So the range is grown
 * to whole tokens first, and the markers inside it are dropped: a hole holds
 * words, not formatting. When the answer is shown it appears as plain text,
 * which is what a masked word should look like anyway.
 */
/**
 * Wrap exactly the selected words, absorbing only the Markdown markers that
 * would otherwise be left dangling.
 *
 * Growing the range to whole tokens (above) is right for a map node, where the
 * selection is the thing being asked. In a cloze card the selection is usually
 * part of a phrase, and pulling in the rest of the bold token surprises people;
 * here the marker pair around the selection is removed instead, so `==主==动性`
 * with "主动" selected becomes `{{c1::主动}}性` rather than a bigger hole.
 */
/**
 * Wrap a selection in a cloze hole: the words inside the hole are exactly the
 * ones selected, and any Markdown token the selection touches loses its markers
 * entirely - half a `**` pair would either leak into the hole or be left
 * dangling outside it. Untouched tokens keep their formatting.
 */
export function wrapVisibleSelection(raw: string, from: number, to: number, group: number): string {
    const remove: Array<[number, number]> = [];
    for (const match of raw.matchAll(PATTERN)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        if (start >= to || end <= from) continue;
        const token = match[0];
        if (token.startsWith('**') || token.startsWith('==') || token.startsWith('~~')) {
            remove.push([start, start + 2], [end - 2, end]);
        } else if (token.startsWith('`') || token.startsWith('*')) {
            remove.push([start, start + 1], [end - 1, end]);
        }
    }
    remove.sort((a, b) => a[0] - b[0]);

    let text = '';
    let cursor = 0;
    let start = from;
    let end = to;
    for (const [from2, to2] of remove) {
        text += raw.slice(cursor, from2);
        cursor = to2;
        const width = to2 - from2;
        if (to2 <= from) start -= width;
        if (to2 <= to) end -= width;
    }
    text += raw.slice(cursor);

    const begin = Math.max(0, Math.min(start, text.length));
    const finish = Math.max(begin, Math.min(end, text.length));
    return `${text.slice(0, begin)}{{c${group}::${text.slice(begin, finish)}}}${text.slice(finish)}`;
}

/**
 * Wrap a selection that runs over several lines.
 *
 * One hole cannot span a line break in a way that keeps list markers intact, so
 * each line gets its own hole and its own marker stays outside - the same rule
 * the cloze toolbar uses when it wraps line by line.
 */
export function wrapSelectionLines(raw: string, from: number, to: number, group: number): string {
    const slice = raw.slice(from, to);
    if (!slice.includes('\n')) return wrapVisibleSelection(raw, from, to, group);
    const wrapped = slice.split('\n').map((line) => {
        if (!line.trim()) return line;
        if (/\{\{c\d+::/.test(line)) return line;
        const marker = /^[\s]*(?:[-*+] |\d+[.)] |> ?|#{1,6} )/.exec(line)?.[0] ?? '';
        const body = plainOf(line.slice(marker.length)).plain.trim();
        if (!body) return line;
        return `${marker}{{c${group}::${body}}}`;
    }).join('\n');
    return `${raw.slice(0, from)}${wrapped}${raw.slice(to)}`;
}

export function wrapSelectedWords(raw: string, from: number, to: number, group: number): string {
    let start = Math.max(0, Math.min(from, to));
    let end = Math.min(raw.length, Math.max(from, to));
    for (const marker of ['**', '==', '~~', '`', '*']) {
        if (raw.slice(start - marker.length, start) === marker) start -= marker.length;
        if (raw.slice(end, end + marker.length) === marker) end += marker.length;
    }
    const inner = plainOf(raw.slice(start, end)).plain.trim();
    return `${raw.slice(0, start)}{{c${group}::${inner}}}${raw.slice(end)}`;
}

export function wrapRangePlainText(raw: string, from: number, to: number, group: number): string {
    let start = Math.max(0, Math.min(from, to));
    let end = Math.min(raw.length, Math.max(from, to));
    for (const match of raw.matchAll(PATTERN)) {
        const index = match.index ?? 0;
        const tokenEnd = index + match[0].length;
        if (index < end && tokenEnd > start) {
            start = Math.min(start, index);
            end = Math.max(end, tokenEnd);
        }
    }
    const slice = raw.slice(start, end);
    const inner = plainOf(slice).plain.trim();
    return `${raw.slice(0, start)}{{c${group}::${inner}}}${raw.slice(end)}`;
}

export function plainOf(raw: string): { plain: string; map: number[] } {
    let plain = '';
    const map: number[] = [];
    let at = 0;
    for (const match of raw.matchAll(PATTERN)) {
        const index = match.index ?? 0;
        for (let position = at; position < index; position++) {
            map.push(position);
            plain += raw[position];
        }
        const token = match[0];
        let inner = token;
        let start = index;
        if (token.startsWith('**') || token.startsWith('==')) {
            inner = token.slice(2, -2);
            start = index + 2;
        } else if (token.startsWith('`') || token.startsWith('*')) {
            inner = token.slice(1, -1);
            start = index + 1;
        } else if (token.startsWith('[[')) {
            const pipe = token.indexOf('|');
            inner = pipe > 0 ? token.slice(pipe + 1, -2) : token.slice(2, -2);
            start = pipe > 0 ? index + pipe + 1 : index + 2;
        } else {
            const label = /^\[([^\]]*)\]/.exec(token);
            inner = label?.[1] ?? token;
            start = index + 1;
        }
        for (let position = 0; position < inner.length; position++) {
            map.push(start + position);
            plain += inner[position];
        }
        at = index + token.length;
    }
    for (let position = at; position < raw.length; position++) {
        map.push(position);
        plain += raw[position];
    }
    return { plain, map };
}

/**
 * Visible characters of a cloze text, with the raw offset behind each of them.
 *
 * A preview drops the `{{c1::}}` markers and the `**` ones, so a selection has
 * no direct line back to the source. This map is that line: it walks the holes
 * (whose visible text is their content) and the Markdown between them.
 */
export function clozeVisibleMap(text: string): { visible: string; map: number[] } {
    let visible = '';
    const map: number[] = [];
    let at = 0;
    for (const hole of parseCloze(text)) {
        if (hole.from > at) {
            const segment = text.slice(at, hole.from);
            const plain = plainOf(segment);
            for (let index = 0; index < plain.plain.length; index++) {
                visible += plain.plain[index];
                map.push(at + (plain.map[index] ?? index));
            }
        }
        const raw = text.slice(hole.from, hole.to);
        const prefix = /^\{\{c\d+::/.exec(raw)?.[0].length ?? 3;
        for (let index = 0; index < hole.text.length; index++) {
            visible += hole.text[index];
            map.push(hole.from + prefix + index);
        }
        at = hole.to;
    }
    const tail = plainOf(text.slice(at));
    for (let index = 0; index < tail.plain.length; index++) {
        visible += tail.plain[index];
        map.push(at + (tail.map[index] ?? index));
    }

    // A renderer turns `3. ` / `- ` / `# ` at the start of a line into a list
    // marker or a heading, and those characters are NOT in the rendered text.
    // Counting them here shifted every offset on that line - a selection three
    // characters in produced a hole three characters early.
    let stripped = '';
    const strippedMap: number[] = [];
    let atLineStart = true;
    for (let index = 0; index < visible.length; index++) {
        if (atLineStart) {
            const marker = /^(?:[-*+]|\d+[.)])\s+|^#{1,6}\s+|^>\s?/.exec(visible.slice(index));
            if (marker) {
                index += marker[0].length - 1;
                atLineStart = false;
                continue;
            }
        }
        stripped += visible[index];
        strippedMap.push(map[index]);
        atLineStart = visible[index] === '\n';
    }
    return { visible: stripped, map: strippedMap };
}

export function renderInlineMd(host: HTMLElement, text: string): void {
    let at = 0;
    for (const match of text.matchAll(PATTERN)) {
        const index = match.index ?? 0;
        if (index > at) host.appendText(text.slice(at, index));
        const raw = match[0];
        if (raw.startsWith('**')) host.createEl('strong', { text: raw.slice(2, -2) });
        else if (raw.startsWith('==')) host.createEl('mark', { text: raw.slice(2, -2) });
        else if (raw.startsWith('`')) host.createEl('code', { text: raw.slice(1, -1) });
        else if (raw.startsWith('*')) host.createEl('em', { text: raw.slice(1, -1) });
        else if (raw.startsWith('[[')) {
            // ![[image]] is not drawn in a node yet; show the link label only.
            const pipe = raw.indexOf('|');
            host.createSpan({ cls: 'fakecard-map-link-label', text: pipe > 0 ? raw.slice(pipe + 1, -2) : raw.slice(2, -2) });
        } else {
            const label = /^\[([^\]]*)\]/.exec(raw)?.[1] ?? raw;
            host.createSpan({ cls: 'fakecard-map-link-label', text: label });
        }
        at = index + raw.length;
    }
    if (at < text.length) host.appendText(text.slice(at));
}
