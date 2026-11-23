import { tt } from './i18n';

/**
 * A one-field editor in place, next to the mask it belongs to.
 *
 * A modal for a short note would cover the map or the card being annotated;
 * this is an input pinned under the hole instead. Enter saves, Escape cancels,
 * clicking elsewhere saves the same way leaving the field does - the text was
 * typed, losing it would be the surprise.
 */
let current: { close: (save: boolean) => void } | null = null;

export function openHintEditor(
    anchor: HTMLElement,
    hint: string,
    onSave: (hint: string) => void,
): void {
    closeHintEditor(false);
    const input = document.createElement('input');
    input.className = 'fakecard-hint-input';
    input.type = 'text';
    input.placeholder = tt('Note shown while hidden (optional)');
    input.value = hint;
    document.body.appendChild(input);

    const rect = anchor.getBoundingClientRect();
    input.setCssStyles({
        left: `${Math.round(rect.left)}px`,
        top: `${Math.round(rect.bottom + 4)}px`,
        width: `${Math.max(180, Math.min(320, Math.round(rect.width) + 100))}px`,
    });

    let closed = false;
    const onOutside = (event: MouseEvent): void => {
        if (event.target instanceof Node && input.contains(event.target)) return;
        close(true);
    };
    const close = (save: boolean): void => {
        if (closed) return;
        closed = true;
        document.removeEventListener('mousedown', onOutside, true);
        const value = input.value.trim();
        input.remove();
        current = null;
        if (save) onSave(value);
    };

    input.addEventListener('keydown', (event) => {
        // The panel listens for shortcuts (rating keys, undo); a note being
        // typed is not one of them.
        event.stopPropagation();
        if (event.key === 'Enter') {
            event.preventDefault();
            close(true);
        } else if (event.key === 'Escape') {
            event.preventDefault();
            close(false);
        }
    });
    // The map and the card behind the field have their own mousedown handlers
    // (pan, select, focus); a click inside the note is not one of those.
    input.addEventListener('mousedown', (event) => event.stopPropagation());
    input.addEventListener('click', (event) => event.stopPropagation());
    document.addEventListener('mousedown', onOutside, true);
    current = { close };
    // After the click that opened it has finished, so nothing moves focus back
    // to the button that was pressed; a second pass catches the modal putting
    // focus back after that.
    window.setTimeout(() => {
        if (closed) return;
        input.focus();
        input.select();
    }, 0);
    window.setTimeout(() => {
        if (closed || document.activeElement === input) return;
        input.focus();
        input.select();
    }, 60);
}

export function closeHintEditor(save = false): void {
    current?.close(save);
}
