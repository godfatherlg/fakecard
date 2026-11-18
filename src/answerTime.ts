import type { CardRecord } from './card';
import { parseCloze } from './cloze';
import { findQuestionNode, parseOutline } from './outline';

/**
 * Suggested answer time, ported from the True Recall PR.
 *
 * Two inputs, both already known while the card is on screen:
 * - answer length: reading a long answer back costs time, up to +75% at the
 *   extremes of the usual range;
 * - difficulty: FSRS's learned summary of the Again/Hard/Good/Easy history
 *   (1 = trivial, 10 = hard), moved by `historyWeight` in percent. A negative
 *   weight pulls the nudge in earlier (counters overthinking), a positive one
 *   gives slow cards more room, 0 ignores history entirely.
 *
 * The two are combined as `(base + length) * historyFactor`, clamped so a
 * pathological card never suggests more than 600 seconds, and never less than
 * 5. Defaults follow the values the True Recall install uses: 10s base, 10s
 * per 40 characters, -20% difficulty weight.
 */
const CHARS_PER_CHUNK = 40;

/** FSRS difficulty is 1..10; 5.5 is the neutral middle. */
const NEUTRAL_DIFFICULTY = 5.5;
const DIFFICULTY_SPAN = 9;
/** The history factor never collapses the budget below this share. */
const MIN_HISTORY_FACTOR = 0.3;

const MIN_SECONDS = 5;
const MAX_SECONDS = 600;

export const DEFAULT_ANSWER_SECONDS = 10;
export const DEFAULT_SECONDS_PER_CHUNK = 10;
export const DEFAULT_HISTORY_WEIGHT = -20;
/** Characters a completely masked picture is worth, for an occlusion card. */
export const DEFAULT_IMAGE_CHARS = 200;

export interface AnswerTimeWeights {
    /** Extra seconds per 40 characters of answer. 0 ignores length. */
    secondsPerChunk?: number;
    /**
     * How strongly difficulty moves the budget, in percent. Positive gives hard
     * cards more time (slow recall); negative flags them earlier (stuck); 0
     * ignores history.
     */
    historyWeight?: number;
    /** Characters an entirely masked picture counts as (occlusion cards). */
    imageChars?: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Characters the reader actually has to recall.
 *
 * Dropped: HTML tags, spacing, and every kind of link. A link's label is not
 * something to read back - "pdf", "视频", or "《note》· block 29" at the end of
 * an imported card were all being counted as answer text, which inflated the
 * budget of nearly every card the importer produced.
 */
export function visibleAnswerLength(text: string): number {
    return text
        .replace(/<[^>]*>/g, ' ')
        // Cloze markers first, so a hole's own text still counts.
        .replace(/\{\{c\d+::([\s\S]*?)(?:::[\s\S]*?)?\}\}/g, '$1')
        .replace(/!?\[\[[^\]]*\]\]/g, ' ')
        .replace(/!?\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim().length;
}

/** Grid resolution used to union mask areas: 5% cells, 400 of them. */
const AREA_GRID = 20;

/** Extra characters charged per box: switching between boxes costs a moment. */
const CHARS_PER_MASK = 3;

/**
 * Area of the masked region, as a share of the whole picture (0..1).
 *
 * Union, not sum: overlapping boxes must not be counted twice. A coarse grid is
 * enough for a time estimate and handles ellipses without any geometry code -
 * for each cell, ask whether its centre falls inside any of the boxes.
 */
export function maskedArea(masks: ReadonlyArray<{ x: number; y: number; w: number; h: number; shape?: string }>): number {
    if (masks.length === 0) return 0;
    const cell = 1 / AREA_GRID;
    let hit = 0;
    for (let row = 0; row < AREA_GRID; row++) {
        const y = (row + 0.5) * cell;
        for (let column = 0; column < AREA_GRID; column++) {
            const x = (column + 0.5) * cell;
            for (const mask of masks) {
                if (mask.shape === 'ellipse') {
                    const cx = mask.x + mask.w / 2;
                    const cy = mask.y + mask.h / 2;
                    const dx = (x - cx) / (mask.w / 2 || 1);
                    const dy = (y - cy) / (mask.h / 2 || 1);
                    if (dx * dx + dy * dy <= 1) {
                        hit++;
                        break;
                    }
                } else if (x >= mask.x && x <= mask.x + mask.w && y >= mask.y && y <= mask.y + mask.h) {
                    hit++;
                    break;
                }
            }
        }
    }
    return hit / (AREA_GRID * AREA_GRID);
}

/**
 * How many characters an occlusion card's hidden region is worth.
 *
 * There is no text to measure, so the boxes are read as text: the whole picture
 * is worth `fullImageChars` characters (200 by default - a figure, not a page),
 * and the covered share of it is what has to be recalled. Each box adds a small
 * fixed cost, because finding the next one is work too.
 */
export function imageAnswerCharacters(
    card: CardRecord,
    fullImageChars = DEFAULT_IMAGE_CHARS,
): number {
    // Only the group this card asks is hidden on its own front, so only that
    // group's boxes are what the answer consists of.
    const masks = card.image?.groups[0]?.masks ?? [];
    const area = maskedArea(masks);
    if (area <= 0) return 0;
    return Math.round(area * Math.max(20, fullImageChars)) + CHARS_PER_MASK * masks.length;
}

/**
 * How many characters a map card actually asks for.
 *
 * Measuring the whole outline made a 40-line map look like a three-minute
 * answer. What has to be recalled is the hole this card asks about - or, for a
 * whole-node mask, that node's text - plus a little context around it.
 */
function mapAnswerCharacters(card: CardRecord): number {
    const root = parseOutline(card.mapText ?? '');
    const group = card.mapGroup ?? 1;
    const node = findQuestionNode(root, group);
    if (!node) return visibleAnswerLength(card.back ?? '');
    const plain = (text: string): string =>
        text.replace(/\{\{c\d+::([\s\S]*?)(?:::[^}]*?)?\}\}/g, '$1').replace(/\s+/g, ' ').trim();

    if (node.wholeHole === group) return plain(node.text).length;
    const holes = node.holes.filter((hole) => hole.group === group);
    if (holes.length === 0) return plain(node.text).length;
    const words = holes.reduce((sum, hole) => sum + hole.text.trim().length, 0);
    return words + 8;
}

/** The text the user has to read back: the back side, or the cloze body. */
function answerText(card: CardRecord): string {
    if (card.type === 'cloze' && card.clozeText) {
        // What has to be recalled is the hidden part, not the paragraph around
        // it. Measuring the whole body made the budget roughly ten times too
        // long for a normal cloze card, so its reminder arrived after a minute
        // or two and looked like it never came.
        const holes = parseCloze(card.clozeText);
        const group = card.clozeGroup ?? holes[0]?.group;
        const asked = holes.filter((hole) => hole.group === group);
        if (asked.length > 0) return asked.map((hole) => hole.text).join(' ');
        return card.clozeText;
    }
    return card.back ?? card.front ?? '';
}

export function suggestedAnswerSeconds(
    card: CardRecord,
    baseSeconds = DEFAULT_ANSWER_SECONDS,
    weights: AnswerTimeWeights = {},
): number {
    const base = Math.max(MIN_SECONDS, Math.round(baseSeconds));
    const secondsPerChunk = Math.max(
        0,
        weights.secondsPerChunk ?? DEFAULT_SECONDS_PER_CHUNK,
    );
    // Negative on purpose: a hard card can also mean "nudge me sooner".
    const historyWeight = (weights.historyWeight ?? DEFAULT_HISTORY_WEIGHT) / 100;

    // The base time covers a short answer; every 40 characters of answer adds
    // its own reading time on top, so the budget grows linearly with length.
    // An occlusion card has no text: its boxes are measured as an area and read
    // as an equivalent number of characters.
    const imageChars = weights.imageChars ?? DEFAULT_IMAGE_CHARS;
    const characters = card.type === 'image'
        ? imageAnswerCharacters(card, imageChars)
        : card.type === 'map'
            ? mapAnswerCharacters(card)
            : visibleAnswerLength(answerText(card));
    const lengthSeconds = (characters / CHARS_PER_CHUNK) * secondsPerChunk;

    const reps = card.fsrs?.reps ?? 0;
    const difficulty = card.fsrs?.difficulty ?? 0;
    // Difficulty is normalised to -1..+1 around the neutral middle, then scaled
    // by the weight. New cards have no history, so the weight never fires before
    // the first review.
    const spread = clamp((difficulty - NEUTRAL_DIFFICULTY) / DIFFICULTY_SPAN, -1, 1);
    const historyFactor =
        reps > 0 && historyWeight !== 0
            ? Math.max(MIN_HISTORY_FACTOR, 1 + spread * historyWeight)
            : 1;

    const total = (base + lengthSeconds) * historyFactor;
    return Math.max(
        MIN_SECONDS,
        Math.round(Math.min(total, MAX_SECONDS)),
    );
}
