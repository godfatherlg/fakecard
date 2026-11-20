import type { CardRecord } from './card';
import { parseCloze } from './cloze';

/**
 * Suggested recall time, ported from the True Recall PR.
 *
 * Three inputs, all already known while the card is on screen:
 * - answer length: reading a long answer back costs time, up to +75% at the
 *   extremes of the usual range;
 * - how many passes count as "known": recalling three times costs three
 *   passes, so the per-pass budget is multiplied. The first pass alone also
 *   gets its own base for sorting the thoughts out - plus the same reading
 *   time, since a long answer takes longer to organise as well - and that part
 *   is added once, because only the first pass builds the structure the later
 *   ones follow;
 * - difficulty: FSRS's learned summary of the Again/Hard/Good/Easy history
 *   (1 = trivial, 10 = hard), with two separate weights:
 *   - `historyWeight` moves ONE PASS: the answering speed. Negative (the
 *     default) flags a hard card earlier, countering overthinking.
 *   - `memoryWeight` moves the WHOLE budget: the recall. Positive (the
 *     default) gives a hard card more time, because it needs it.
 *
 * Combined as `((base + length) * passes + firstPass) * memoryFactor`, with
 * the per-pass parts scaled by the answering factor, then clamped so a
 * pathological card never suggests more than 600 seconds, and never less than
 * 5.
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
/**
 * Answering speed: a harder card gets LESS time, so overthinking is flagged
 * early instead of being rewarded. The True Recall default.
 */
export const DEFAULT_HISTORY_WEIGHT = -20;
/** Recalling: a harder card gets MORE time - it is the one that needs it. */
export const DEFAULT_MEMORY_WEIGHT = 20;
/** How many full recalls count as knowing the card. */
export const DEFAULT_RECALL_PASSES = 3;
/**
 * Base seconds for the first pass, before reading time is added: sorting the
 * structure out costs more than a plain recall of a short answer.
 */
export const DEFAULT_FIRST_PASS_SECONDS = 20;
/** Extra multiples of the budget that count as one slow step. */
export const DEFAULT_SLOW_STEP = 0.5;
/** Hard points a slow step adds (and 0 turns the scoring off). */
export const DEFAULT_SLOW_POINTS = 0.5;
/** Characters a completely masked picture is worth, for an occlusion card. */
export const DEFAULT_IMAGE_CHARS = 200;

export interface AnswerTimeWeights {
    /** Extra seconds per 40 characters of answer. 0 ignores length. */
    secondsPerChunk?: number;
    /**
     * How strongly difficulty moves one pass, in percent. This is the answering
     * speed: negative flags a hard card earlier (counters overthinking), which
     * is the default; positive gives it more room; 0 ignores history.
     */
    historyWeight?: number;
    /**
     * How strongly difficulty moves the whole memory budget, in percent. This
     * is the recall side: positive (the default) gives hard cards more time,
     * because they are the ones that need it.
     */
    memoryWeight?: number;
    /** Characters an entirely masked picture counts as (occlusion cards). */
    imageChars?: number;
    /** Full recalls that count as knowing the card (1..5). */
    passes?: number;
    /** Base seconds for the first pass; its reading time is added on top. */
    firstPassSeconds?: number;
}

/** The parts of a budget, so the tooltip can show how it was built. */
export interface AnswerTimeBreakdown {
    characters: number;
    lengthSeconds: number;
    /** Base plus reading time, after the answering-speed factor. */
    onePass: number;
    passes: number;
    /** The first pass: its own base plus reading time, after the same factor. */
    firstPass: number;
    /** Factor applied to one pass (answering speed). */
    historyFactor: number;
    /** Factor applied to the whole budget (recall). */
    memoryFactor: number;
    /** The final budget, clamped. */
    seconds: number;
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
        // Emphasis markers are formatting, not words: `**` and `==` were
        // inflating every highlighted answer by a few percent per pair.
        .replace(/(\*\*|__|~~|==)/g, '')
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

/** The text the user has to read back: the back side, or the hidden holes. */
function answerText(card: CardRecord): string {
    // A map card is a cloze card wearing a tree: its holes are the same
    // `{{cN::...}}` markers, so it is measured the same way - the words this
    // card hides, not the outline around them.
    const source = card.type === 'cloze'
        ? card.clozeText
        : card.type === 'map'
            ? card.mapText
            : undefined;
    if (source) {
        const holes = parseCloze(source);
        const group = card.type === 'cloze'
            ? (card.clozeGroup ?? holes[0]?.group)
            : (card.mapGroup ?? holes[0]?.group);
        const asked = holes.filter((hole) => hole.group === group);
        if (asked.length > 0) return asked.map((hole) => hole.text).join(' ');
        return source;
    }
    return card.back ?? card.front ?? '';
}

export function answerTimeBreakdown(
    card: CardRecord,
    baseSeconds = DEFAULT_ANSWER_SECONDS,
    weights: AnswerTimeWeights = {},
): AnswerTimeBreakdown {
    const base = Math.max(MIN_SECONDS, Math.round(baseSeconds));
    const secondsPerChunk = Math.max(
        0,
        weights.secondsPerChunk ?? DEFAULT_SECONDS_PER_CHUNK,
    );
    // Two knobs on purpose: answering speed (negative: a hard card is flagged
    // earlier) and recall (positive: a hard card gets more room). One factor
    // moves a single pass, the other the whole memory budget.
    const answerWeight = (weights.historyWeight ?? DEFAULT_HISTORY_WEIGHT) / 100;
    const memoryWeight = (weights.memoryWeight ?? DEFAULT_MEMORY_WEIGHT) / 100;

    // The base time covers a short answer; every 40 characters of answer adds
    // its own reading time on top, so the budget grows linearly with length.
    // An occlusion card has no text: its boxes are measured as an area and read
    // as an equivalent number of characters.
    const imageChars = weights.imageChars ?? DEFAULT_IMAGE_CHARS;
    const characters = card.type === 'image'
        ? imageAnswerCharacters(card, imageChars)
        : visibleAnswerLength(answerText(card));
    const lengthSeconds = (characters / CHARS_PER_CHUNK) * secondsPerChunk;

    const reps = card.fsrs?.reps ?? 0;
    const difficulty = card.fsrs?.difficulty ?? 0;
    // Difficulty is normalised to -1..+1 around the neutral middle, then scaled
    // by the weight. New cards have no history, so the weight never fires before
    // the first review.
    const spread = clamp((difficulty - NEUTRAL_DIFFICULTY) / DIFFICULTY_SPAN, -1, 1);
    const factor = (weight: number): number =>
        reps > 0 && weight !== 0
            ? Math.max(MIN_HISTORY_FACTOR, 1 + spread * weight)
            : 1;
    const historyFactor = factor(answerWeight);
    const memoryFactor = factor(memoryWeight);

    // A full recall is one pass; more passes cost their own budget. The first
    // pass is the only one that has to build the structure, so it gets a base
    // of its own - and the same reading time, because a long answer takes
    // longer to organise too. It is added once and is not multiplied.
    const passes = clamp(Math.round(weights.passes ?? DEFAULT_RECALL_PASSES), 1, 5);
    const firstPassBase = Math.max(0, weights.firstPassSeconds ?? DEFAULT_FIRST_PASS_SECONDS);
    const onePass = (base + lengthSeconds) * historyFactor;
    const firstPass = (firstPassBase + lengthSeconds) * historyFactor;

    const total = (onePass * passes + firstPass) * memoryFactor;
    return {
        characters,
        lengthSeconds,
        onePass,
        passes,
        firstPass,
        historyFactor,
        memoryFactor,
        seconds: Math.max(MIN_SECONDS, Math.round(Math.min(total, MAX_SECONDS))),
    };
}

export function suggestedAnswerSeconds(
    card: CardRecord,
    baseSeconds = DEFAULT_ANSWER_SECONDS,
    weights: AnswerTimeWeights = {},
): number {
    return answerTimeBreakdown(card, baseSeconds, weights).seconds;
}
