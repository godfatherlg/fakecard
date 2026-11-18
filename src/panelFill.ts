import { type Modal, setTooltip } from 'obsidian';

import { tt } from './i18n';

/**
 * The "fill screen" toggle every new-card panel shares.
 *
 * The panels put the input in the same box the rendered card will use, and a
 * map or a long answer needs more room than a default dialog gives. The class
 * goes on the modal itself, so the dialog and its body grow together.
 */
export function addFillScreenButton(modal: Modal, toolbar: HTMLElement): void {
    const button = toolbar.createEl('button', {
        cls: 'fakecard-panel-fill',
        text: tt('Fill screen'),
        attr: { type: 'button' },
    });
    setTooltip(button, tt('Make the panel as large as the window'));

    let filled = false;
    button.addEventListener('click', (event) => {
        event.preventDefault();
        filled = !filled;
        modal.modalEl.toggleClass('fakecard-panel-full', filled);
        button.setText(filled ? tt('Exit fill screen') : tt('Fill screen'));
    });
}
