import { App, Component, MarkdownRenderer } from 'obsidian';
import { tt } from './i18n';

/**
 * Rendered preview under a text field of an edit panel.
 *
 * Obsidian's Markdown editor lives inside MarkdownView and there is no API to
 * mount one in a modal, so an edit panel cannot have Live Preview: the typing
 * surface stays a textarea. What a textarea lacks is the rendering, so the
 * field gets one underneath - produced by the same MarkdownRenderer the review
 * view uses, a moment after typing stops.
 *
 * Plain text is left alone: it renders to nothing but its own paragraphs, which
 * would be a second copy of what the box already shows. The block stays hidden
 * until the text contains something Markdown actually does something with.
 */
export class FieldPreview {
    private el: HTMLElement;
    private body: HTMLElement;
    private component: Component | null = null;
    private timer: number | null = null;
    /** Guards against an older render landing after a newer one. */
    private token = 0;

    constructor(
        private app: App,
        parent: HTMLElement,
        private sourcePath: string,
        /** Rewrites the raw text before rendering (cloze markup, for one). */
        private prepare?: (text: string) => string,
    ) {
        this.el = parent.createDiv({ cls: 'fakecard-field-preview' });
        this.el.createDiv({ cls: 'fakecard-field-preview-label', text: tt('Preview') });
        this.body = this.el.createDiv({ cls: 'fakecard-field-preview-body' });
    }

    /** Coalesces typing into one render. */
    queue(text: string): void {
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
            this.timer = null;
            void this.render(text);
        }, 200);
    }

    /** Render now - for opening the panel, undo and the toolbar edits. */
    show(text: string): void {
        if (this.timer !== null) {
            window.clearTimeout(this.timer);
            this.timer = null;
        }
        void this.render(text);
    }

    dispose(): void {
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = null;
        this.token++;
        this.component?.unload();
        this.component = null;
        this.el.remove();
    }

    private async render(text: string): Promise<void> {
        const mine = ++this.token;
        this.component?.unload();
        this.component = null;
        this.body.empty();
        this.el.removeClass('is-visible');

        const raw = text.trim();
        if (!raw) return;

        const component = new Component();
        component.load();
        this.component = component;
        await MarkdownRenderer.render(
            this.app,
            this.prepare ? this.prepare(text) : text,
            this.body,
            this.sourcePath,
            component,
        );
        if (mine !== this.token) return;
        if (this.rendersAsPlainText(raw)) {
            this.body.empty();
            return;
        }
        this.el.addClass('is-visible');
    }

    /**
     * True when the output is the input: same words, and Markdown built nothing
     * out of them. Wrappers like the paragraph around a line of text do not
     * count - only elements that mean something (emphasis, a link, a list ...).
     */
    private rendersAsPlainText(raw: string): boolean {
        const squash = (value: string): string => value.replace(/\s+/g, ' ').trim();
        if (squash(this.body.textContent ?? '') !== squash(raw)) return false;
        const meaningful = 'strong, em, a, code, mark, del, s, img, ul, ol, li, h1, h2, h3, h4, h5, h6, table, blockquote, hr, .math, .fakecard-cloze-answer';
        return this.body.querySelector(meaningful) === null;
    }
}
