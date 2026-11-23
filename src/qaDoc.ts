/**
 * One scratch note holds both sides of a Q&A card: the question on top, one
 * visible rule, then the answer.
 *
 * The rule itself is the separator, so the note stays compact:
 *
 *     Question
 *
 *     ---
 *     Answer
 *
 * The blank line above the rule matters: `Question` immediately followed by
 * `---` is a Markdown setext heading, not a horizontal rule.
 *
 * A question cannot contain a bare `---` line (that would be the divider).
 * The hidden comment from the first version is still accepted when reading an
 * old scratch note, but new notes never write it.
 */
export const QA_SEPARATOR = '---';

const LEGACY_SEPARATOR = '<!-- fakecard:answer -->';

export interface QaParts {
    front: string;
    back: string;
}

export function joinQa(front: string, back: string): string {
    return `${front}\n\n${QA_SEPARATOR}\n${back}`;
}

function afterSeparator(lines: string[], at: number, skipRule: boolean): QaParts {
    const front = lines.slice(0, at).join('\n').trim();
    const rest = lines.slice(at + 1);
    while (rest.length > 0 && rest[0].trim() === '') rest.shift();
    // Old notes kept the rule below a hidden comment; it belongs to the
    // separator, not to the answer.
    if (skipRule && rest.length > 0 && rest[0].trim() === QA_SEPARATOR) rest.shift();
    return { front, back: rest.join('\n').trim() };
}

/**
 * Split a scratch note back into its two fields.
 *
 * Returns null when the divider is gone - the caller must not overwrite the
 * card with a guess, or deleting one line would silently move the answer into
 * the question.
 */
export function splitQa(raw: string): QaParts | null {
    const lines = raw.replace(/\r\n/g, '\n').split('\n');

    // Backwards compatibility for a scratch note left by the first build.
    const legacy = lines.findIndex((line) => line.trim() === LEGACY_SEPARATOR);
    if (legacy >= 0) return afterSeparator(lines, legacy, true);

    const at = lines.findIndex((line) => line.trim() === QA_SEPARATOR);
    if (at < 0) return null;
    return afterSeparator(lines, at, false);
}
