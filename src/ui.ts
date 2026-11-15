/**
 * Make a textarea grow with its content instead of keeping a fixed height.
 * Called once after the initial value is set and on every input.
 */
/** Comma / space separated tags -> clean unique list ("#tag" accepted). */
export function parseTags(value: string): string[] {
    const tags = value
        .split(/[,，\s]+/)
        .map((tag) => tag.replace(/^#/, '').trim())
        .filter((tag) => tag.length > 0);
    return Array.from(new Set(tags));
}

export function autoSizeTextarea(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
}

export function bindAutoSize(el: HTMLTextAreaElement): void {
    autoSizeTextarea(el);
    el.addEventListener('input', () => autoSizeTextarea(el));
}
