import { tt } from './i18n';

/**
 * The two-stage layout every new-card panel shares.
 *
 * One box, two halves: the editor fills it while the card is being written, and
 * the rendered card fills the same box afterwards. Keeping the box the same is
 * what stops the dialog from jumping when "Done" is pressed, and keeping the
 * logic in one place stops the three panels from drifting apart.
 */
export interface StageOptions {
    /** The button that flips between the halves (its label is managed here). */
    button: HTMLElement;
    /** The editing half: a textarea, or a set of fields. */
    edit: HTMLElement;
    /** The rendered half. */
    view: HTMLElement;
    /** Called right before the rendered half is shown. */
    onShowView?: () => void;
    /** Called right before the editing half is shown. */
    onShowEdit?: () => void;
    /** Label while the editor is showing; defaults to "Done". */
    doneLabel?: string;
    /** Label while the card is showing; defaults to "Edit". */
    editLabel?: string;
}

export interface StageSwitch {
    /** Show the rendered card. */
    showView(): void;
    /** Show the editor. */
    showEdit(): void;
    /** True while the rendered card is on screen. */
    readonly onView: boolean;
}

export function createStages(options: StageOptions): StageSwitch {
    let onView = false;

    const apply = (view: boolean): void => {
        // Guard against the same stage being requested twice: the callbacks may
        // re-render, which is wasteful when nothing changed.
        const wasView = onView;
        onView = view;
        options.edit.toggleClass('is-hidden', view);
        options.view.toggleClass('is-hidden', !view);
        options.button.setText(view
            ? (options.editLabel ?? tt('Edit'))
            : (options.doneLabel ?? tt('Done')));
        if (view) {
            if (!wasView) options.onShowView?.();
            return;
        }
        if (wasView) options.onShowEdit?.();
    };

    return {
        showView: () => apply(true),
        showEdit: () => apply(false),
        get onView() {
            return onView;
        },
    };
}
