/**
 * Small undo/redo stack for the edit panels.
 *
 * Ctrl+Z inside a panel undoes the whole edit state (text, mask groups, ...),
 * not just the textarea's native undo. Snapshots are plain JSON-able values.
 */
export class HistoryStack<T> {
    private stack: T[] = [];
    private index = -1;
    private readonly limit: number;

    constructor(initial: T, limit = 50) {
        this.limit = limit;
        this.reset(initial);
    }

    reset(value: T): void {
        this.stack = [value];
        this.index = 0;
    }

    push(value: T): void {
        if (this.index >= 0 && this.equal(this.stack[this.index], value)) return;
        this.stack = this.stack.slice(0, this.index + 1);
        this.stack.push(value);
        if (this.stack.length > this.limit) this.stack.shift();
        this.index = this.stack.length - 1;
    }

    undo(): T | null {
        if (this.index <= 0) return null;
        this.index--;
        return this.stack[this.index];
    }

    redo(): T | null {
        if (this.index >= this.stack.length - 1) return null;
        this.index++;
        return this.stack[this.index];
    }

    private equal(a: T, b: T): boolean {
        return JSON.stringify(a) === JSON.stringify(b);
    }
}

/** Deep copy that also works for plain card data (masks, groups). */
export function cloneValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
