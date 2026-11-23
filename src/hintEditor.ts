import { tt } from './i18n';

/**
 * A one-field editor in place, next to the mask it belongs to.
 *
 * A modal for a short note would cover the map or the card being annotated;
 * this is a row pinned under the hole instead: an input, and a button to
 * remove the hole itself (clicking the mask can no longer mean "select it",
 * so removing has to be offered here). Enter saves, Escape cancels, clicking
 * elsewhere saves the same way leaving the field does - the text was typed,
 * losing it would be the surprise.
 */
let current: { close: (save: boolean) => void } | null = null;

export function openHintEditor(
    anchor: HTMLElement,
    hint: string,
    onSave: (hint: string) => void,
    onRemove?: () => void,
): void {
    closeHintEditor(false);
    // Inside the dialog, not on <body>: the modal treats focus outside itself
    // as a mistake and pulls it back, which turned a field on <body> into a
    // focus fight. Within the dialog there is nothing to pull it away.
    const modal = anchor.closest<HTMLElement>('.modal');
    const host = modal ?? document.body;
    const box = document.createElement('div');
    box.className = 'fakecard-hint-editor';

    const input = document.createElement('input');
    input.className = 'fakecard-hint-input';
    input.type = 'text';
    input.placeholder = tt('Note shown while hidden (optional)');
    input.value = hint;
    box.appendChild(input);

    if (onRemove) {
        const remove = document.createElement('button');
        remove.className = 'fakecard-hint-remove';
        remove.type = 'button';
        remove.textContent = tt('Remove hole');
        remove.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            close(false);
            onRemove();
        });
        box.appendChild(remove);
    }
    host.appendChild(box);

    // Inside the dialog coordinates are relative to it; on <body> they are
    // viewport coordinates. The dialog is the positioned box, so absolute
    // works there even while its open animation is still moving it.
    const rect = anchor.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const offsetX = modal ? hostRect.left : 0;
    const offsetY = modal ? hostRect.top : 0;
    box.setCssStyles({
        position: modal ? 'absolute' : 'fixed',
        left: `${Math.round(rect.left - offsetX)}px`,
        top: `${Math.round(rect.bottom - offsetY + 4)}px`,
        minWidth: `${Math.max(220, Math.min(360, Math.round(rect.width) + 120))}px`,
    });

    let closed = false;
    const onOutside = (event: MouseEvent): void => {
        if (event.target instanceof Node && box.contains(event.target)) return;
        close(true);
    };
    const close = (save: boolean): void => {
        if (closed) return;
        closed = true;
        document.removeEventListener('mousedown', onOutside, true);
        const value = input.value.trim();
        box.remove();
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
    box.addEventListener('mousedown', (event) => event.stopPropagation());
    box.addEventListener('click', (event) => event.stopPropagation());

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
