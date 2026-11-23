/** Card state captured before a rating, so Ctrl+Z can put it back. */
export interface UndoEntry {
    /** The rated card, so undoing finds it after a reload or a filter change. */
    cardId: string;
    index: number;
    /** Every card the rating touched, as JSON taken before the change. */
    snapshots: Array<{ id: string; json: string }>;
    /** The review-log row to drop when the rating is undone. */
    reviewLog?: { cardId: string; at: string };
}

/**
 * The ratings this view can still take back, newest last.
 *
 * A small wrapper rather than a bare array: the view no longer knows whether
 * undo is a stack, and the rule "a new session starts empty" lives next to the
 * data it clears.
 */
export class UndoStack {
    private entries: UndoEntry[] = [];

    push(entry: UndoEntry): void {
        this.entries.push(entry);
    }

    pop(): UndoEntry | undefined {
        return this.entries.pop();
    }

    clear(): void {
        this.entries.length = 0;
    }

    get size(): number {
        return this.entries.length;
    }
}
