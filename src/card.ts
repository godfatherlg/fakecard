import type { Card as FsrsCard } from 'ts-fsrs';

export type CardType = 'qa' | 'cloze' | 'image' | 'map';

/** Where a card came from. The note is only a reference - card content is a
 *  copy and never writes back unless the user opts in. */
export interface CardSource {
    /** Vault path of the note the card was generated from. */
    path: string;
    /** Heading the card came from, when the rule was a marked heading. */
    heading?: string;
    /**
     * Ordinal of the block inside the note, in document order - what the
     * importer calls "第 N 块". Cards that share a block (cloze groups) share
     * the number.
     */
    block?: number;
    /** Text snapshot at creation time, for re-finding the source later. */
    snapshot?: string;
    /**
     * Legacy: old versions could insert a %%fakecard:id%% comment above the
     * source block. Writing back to notes no longer exists, but the marker is
     * still read as a last-resort anchor when jumping to the source.
     */
    marker?: string;
}

/** One occlusion shape, relative to the image (0..1). */
export interface ImageMask {
    x: number;
    y: number;
    w: number;
    h: number;
    /** Defaults to a rectangle for old cards. */
    shape?: 'rect' | 'ellipse';
}

/** A mask group: the rectangles asked together in one review pass. */
export interface ImageGroup {
    id: number;
    masks: ImageMask[];
}

export interface CardImage {
    /** Vault path of the image file. */
    path: string;
    groups: ImageGroup[];
    /**
     * Size the picture is drawn at, as a multiple of "fits the pane".
     *
     * Set by Ctrl+wheel while reviewing, so the size a card was last read at
     * is the size it comes back at. Absent (or 1) means the default fit.
     */
    zoom?: number;
    }

/** Hidden until a later time ("buried"), as opposed to suspended. */
export function isBuried(card: CardRecord, now = Date.now()): boolean {
    return Boolean(card.buriedUntil && new Date(card.buriedUntil).getTime() > now);
}

export interface CardRecord {
    id: string;
    type: CardType;
    deck: string;
    /** Question / prompt shown first. Markdown. */
    front: string;
    /** Answer shown after reveal. Markdown. */
    back: string;
    /**
     * Cloze body in ANKI FORMAT: {{c1::text}}, {{c2::text}} ...
     *
     * This is the single source of truth for cloze cards - the same text the
     * manual panel edits and AI generation writes. Group numbers decide what
     * is hidden together during a review.
     */
    clozeText?: string;
    /**
     * Cloze cards split from ONE panel share this id, so the editor can open
     * them together and keep their text in sync.
     */
    clozeGroupId?: string;
    /** Which cloze group (c1, c2 ...) this card asks. */
    clozeGroup?: number;
    /**
     * Outline for type 'map': headings and list items, with the same
     * `{{cN::...}}` holes a cloze card uses. A node whose whole text sits inside
     * one hole is a node-level mask.
     */
    mapText?: string;
    /** Which hole group this map card asks. */
    mapGroup?: number;
    /** Cards cut from one map share this id, so an edit updates them together. */
    mapGroupId?: string;
    /** Image + mask groups for type 'image'. */
    image?: CardImage;
    source: CardSource;
    tags: string[];
    created: string;
    updated: string;
    /** When set, this card is a child of another card (its id). */
    childOf?: string;
    /** Parent card paused while its children are studied. */
    suspended?: boolean;
    /**
     * Hidden from the queue until this ISO time ("bury"). It is a pause, not a
     * schedule change: the FSRS due date stays where it was.
     */
    buriedUntil?: string;
    /** Child card finished its run: kept with history, no longer asked. */
    graduated?: boolean;
    /** FSRS scheduling state. Absent until the card is first reviewed. */
    fsrs?: FsrsCard;
    /** Lifetime review counters, used by the stats page. */
    reviews?: number;
    /** Lifetime correct reviews (rating >= Good). */
    correct?: number;
}
