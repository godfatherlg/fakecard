/**
 * Rating shortcuts for the review view.
 *
 * A configured key is either a single character ("1", "a", "?"), the word
 * "Space", or an empty string for "no shortcut". Digits match the number row
 * and the numpad alike, so `1` answers the same whether it comes from the top
 * row or the keypad.
 */
export interface RatingKeys {
    again: string;
    hard: string;
    good: string;
    easy: string;
}

/** Short text for a rating button: "Space", "A", "1", or "" for none. */
export function keyLabel(key: string): string {
    const trimmed = key.trim();
    if (trimmed === '') return '';
    if (trimmed.toLowerCase() === 'space') return 'Space';
    return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed;
}

/** True when this keydown was produced by the configured shortcut. */
export function matchesKey(event: KeyboardEvent, key: string): boolean {
    const wanted = key.trim().toLowerCase();
    if (wanted === '') return false;
    if (wanted === 'space' || wanted === '空格') {
        return event.code === 'Space' || event.key === ' ';
    }

    // A digit means the same key on the number row and on the numpad.
    if (/^[0-9]$/.test(wanted)) {
        return event.key === wanted
            || event.code === `Digit${wanted}`
            || event.code === `Numpad${wanted}`;
    }

    return event.key.toLowerCase() === wanted || event.code.toLowerCase() === wanted;
}
