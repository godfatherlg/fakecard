import { App } from 'obsidian';

import type { CardRecord } from './card';

/**
 * Ctrl/Cmd+hover previews for links inside the rendered card.
 *
 * Obsidian's preview is raised by Markdown views: they listen for the pointer
 * over an internal link and send a `hover-link` workspace event to the core
 * Page preview plugin. The review view renders its own markdown, so nothing
 * raised that event - normal links and fakelink's virtual links both navigated
 * on click but never showed a popover.
 *
 * The same preview is raised here, but only after the pointer rests on a link.
 * The first version hooked `mousemove`, so every sweep across a card with Ctrl
 * held popped whatever link it crossed. Pressing Ctrl while the pointer already
 * sits on a link counts as well: that produces no mouse event, so the dwell
 * watches the keyboard too.
 */
export class HoverPreview {
    /** Link under the pointer, waiting for Ctrl+hover to turn into a preview. */
    private link: HTMLElement | null = null;
    /** Mouse event over that link, replayed when the preview is raised. */
    private event: MouseEvent | null = null;
    private parent: HTMLElement | null = null;
    private timer: number | null = null;
    /** Link whose preview is already open, so one dwell asks only once. */
    private previewed: HTMLElement | null = null;
    /** Ctrl/Cmd state, tracked so a key press over a still pointer counts. */
    private modifier = false;
    private sourcePath = '';

    constructor(private app: App) {}

    /** Watch a freshly painted card body for the links its markdown carries. */
    attach(el: HTMLElement, card: CardRecord): void {
        this.sourcePath = card.source.path || this.app.workspace.getActiveFile()?.path || '';
        this.parent = el;

        const linkAt = (event: MouseEvent): HTMLElement | null =>
            (event.target as HTMLElement | null)?.closest?.<HTMLElement>('a.internal-link') ?? null;

        el.addEventListener('mouseover', (event: MouseEvent) => {
            const link = linkAt(event);
            if (link) this.startDwell(link, event);
        });
        el.addEventListener('mouseout', (event: MouseEvent) => {
            const link = linkAt(event);
            if (!link) return;
            const next = event.relatedTarget as HTMLElement | null;
            if (next && link.contains(next)) return;
            this.endDwell();
        });
        // The body scrolls on its own: a still pointer can leave a link that
        // slides away underneath it without any mouse event.
        el.addEventListener('scroll', () => this.endDwell(), { passive: true });
    }

    /**
     * Ctrl/Cmd pressed or released while the pointer is already resting.
     *
     * Registered for keydown and keyup on the document, once for the view's
     * lifetime; a repaint never needs to bind it again.
     */
    handleKey(event: KeyboardEvent): void {
        // Key events can target the document itself; only a modal or menu in
        // front of the card should keep Ctrl quiet.
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('.modal-container') || target?.closest?.('.menu')) return;

        const held = event.ctrlKey || event.metaKey;

        // Ctrl+<key> is a shortcut (undo, reveal, rating), not a hover: drop a
        // preview that is still waiting for its dwell instead of popping it
        // over the card mid-shortcut.
        if (held && event.type === 'keydown' && event.key !== 'Control' && event.key !== 'Meta') {
            this.clearTimer();
            return;
        }

        const wasHeld = this.modifier;
        this.modifier = held;
        if (held === wasHeld) return;

        if (held) {
            // Short dwell: the pointer is already parked, so this press is the
            // hover. Long enough that Ctrl+S or Ctrl+Z over a link stay quiet.
            if (this.link && this.previewed !== this.link) this.schedule(150);
        } else {
            this.clearTimer();
        }
    }

    /** Drop the tracked link; the body it pointed into is about to be replaced. */
    reset(): void {
        this.endDwell();
        this.parent = null;
        this.sourcePath = '';
    }

    /** Pointer arrived on a link: start (or keep) the dwell that may preview. */
    private startDwell(link: HTMLElement, event: MouseEvent): void {
        this.modifier = event.ctrlKey || event.metaKey;
        this.event = event;
        if (link === this.link) return;
        this.clearTimer();
        this.link = link;
        this.previewed = null;
        this.schedule(400);
    }

    private schedule(delay: number): void {
        this.clearTimer();
        this.timer = window.setTimeout(() => {
            this.timer = null;
            this.show();
        }, delay);
    }

    private show(): void {
        const link = this.link;
        const event = this.event;
        if (!link || !event || !this.modifier) return;
        if (this.previewed === link) return;

        const linktext = link.getAttribute('data-href') ?? link.getAttribute('href');
        if (!linktext) return;

        this.previewed = link;
        this.app.workspace.trigger('hover-link', {
            event,
            source: 'preview',
            hoverParent: this.parent ?? link,
            targetEl: link,
            linktext,
            sourcePath: this.sourcePath,
        });
    }

    private clearTimer(): void {
        if (this.timer === null) return;
        window.clearTimeout(this.timer);
        this.timer = null;
    }

    private endDwell(): void {
        this.clearTimer();
        this.link = null;
        this.previewed = null;
        this.event = null;
    }
}
