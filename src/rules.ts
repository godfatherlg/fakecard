import { renderCloze } from './cloze';

/**
 * Card generation rules.
 *
 * Q&A - a MARKED HEADING is one card. The marker is configurable (settings,
 * default "*"); a heading CONTAINING it counts:
 *   ## 小青龙汤 *
 *   组成：麻黄、桂枝…
 *
 *   Front = the heading without the marker.
 *   Back  = the heading + everything until the next heading of the same or a
 *           higher level.
 *
 * Cloze - one LIST BLOCK is one card:
 *   - 解表剂：==麻黄==、桂枝
 *   - 主治：==外感风寒==
 *
 *   Every ==highlight== in the block becomes a hole in GROUP 1 - the whole
 *   list is one group by default, exactly how AI generation should behave.
 *   Re-grouping happens later in the manual panel.
 */

/**
 * Split a selection for a Q&A card.
 *
 * If the selection contains a heading, the heading becomes the question and
 * the text after it becomes the answer; without a heading the whole selection
 * is the answer (the question is typed by hand).
 */
export function splitHeadingSelection(selection: string): { front: string; back: string } {
    const lines = selection.split('\n');
    const index = lines.findIndex((line) => /^#{1,6}\s+/.test(line));
    if (index === -1) {
        return { front: '', back: selection.trim() };
    }
    const front = lines[index].replace(/^#{1,6}\s+/, '').trim();
    const back = lines.slice(index + 1).join('\n').trim();
    return { front, back };
}

export interface CardDraft {
    type: 'qa' | 'cloze';
    front: string;
    back: string;
    /** Anki-format cloze body ({{c1::...}}), only for cloze drafts. */
    clozeText?: string;
    /** Heading the draft came from, when generated from a marked heading. */
    heading?: string;
    /** Original source text (for "sync back to the note"). */
    sourceText?: string;
    /** Human-readable origin, used in the preview list. */
    origin: string;
}

/** Inclusive line range, for "generate from selection". */
export interface LineRange {
    from: number;
    to: number;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_RE = /^\s*(?:[-*+]|\d+\.)\s+/;

/** ==text== -> {{c1::text}} (one group for the whole block). */
function toAnkiHoles(text: string): string {
    return text.replace(/==([^=]+)==/g, (_m, inner: string) => `{{c1::${inner}}}`);
}

/**
 * Q&A drafts from marked headings.
 *
 * `range` limits which headings are picked up (selection-based generation);
 * the answer still runs to the next heading of the same or a higher level,
 * even if that is outside the selection.
 */
export function extractMarkedHeadings(
    markdown: string,
    markerSymbol: string,
    range?: LineRange,
): CardDraft[] {
    const lines = markdown.split('\n');
    const from = Math.max(0, range?.from ?? 0);
    const to = Math.min(lines.length - 1, range?.to ?? lines.length - 1);
    const marker = markerSymbol && markerSymbol.length > 0 ? markerSymbol : '*';
    const drafts: CardDraft[] = [];

    for (let i = from; i <= to; i++) {
        const match = HEADING_RE.exec(lines[i]);
        if (!match) continue;
        const level = match[1].length;
        const rawTitle = match[2];
        if (!rawTitle.includes(marker)) continue;

        // Remove every occurrence of the marker from the question.
        const title = rawTitle.split(marker).join('').trim();
        if (!title) continue;

        const body: string[] = [];
        for (let j = i + 1; j < lines.length; j++) {
            const next = HEADING_RE.exec(lines[j]);
            if (next && next[1].length <= level) break;
            body.push(lines[j]);
        }
        const content = body.join('\n').trim();

        drafts.push({
            type: 'qa',
            front: title,
            // Requirement: the answer side shows the heading AND its content.
            back: content ? `${title}\n\n${content}` : title,
            heading: title,
            origin: `${'#'.repeat(level)} ${title}`,
        });
    }

    return drafts;
}

/**
 * Cloze drafts from list blocks.
 *
 * One contiguous list block with at least one ==highlight== becomes one card;
 * every highlight in the block goes into group 1 (a single group). The manual
 * panel is where groups get split.
 */
export function extractClozeLists(markdown: string, range?: LineRange): CardDraft[] {
    const lines = markdown.split('\n');
    const from = Math.max(0, range?.from ?? 0);
    const to = Math.min(lines.length - 1, range?.to ?? lines.length - 1);
    const drafts: CardDraft[] = [];

    let inFence = false;
    let i = from;
    while (i <= to) {
        const line = lines[i];
        if (/^\s*(```|~~~)/.test(line)) {
            inFence = !inFence;
            i++;
            continue;
        }
        if (inFence || !LIST_RE.test(line)) {
            i++;
            continue;
        }

        const blockStart = i;
        const block: string[] = [];
        while (i <= to && LIST_RE.test(lines[i])) {
            block.push(lines[i]);
            i++;
        }

        if (!block.some((blockLine) => /==[^=]+==/.test(blockLine))) continue;

        const clozeText = toAnkiHoles(block.join('\n'));
        const origin = block[0].trim().slice(0, 40);
        drafts.push({
            type: 'cloze',
            front: renderCloze(clozeText, new Set([1])),
            back: block.join('\n').replace(/==([^=]+)==/g, (_m, inner: string) => inner),
            clozeText,
            sourceText: block.join('\n'),
            origin: `List at line ${blockStart + 1}: ${origin}${origin.length >= 40 ? '…' : ''}`,
        });
    }

    return drafts;
}
