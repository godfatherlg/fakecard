import { App, Modal, setTooltip } from 'obsidian';
import type { CardRecord } from './card';
import { tt } from './i18n';

/**
 * An occlusion card's picture with its masks on top.
 *
 * Shared by the review view, the browse preview and the zoom dialog, so a mask
 * can never be drawn one way in one place and another way somewhere else.
 */
export function buildImageFigure(
    app: App,
    card: CardRecord,
    revealed: boolean,
    maskAll: boolean,
): HTMLElement | null {
    const image = card.image;
    if (!image) return null;

    const wrap = createDiv({ cls: 'fakecard-image-wrap' });
    const img = wrap.createEl('img', { cls: 'fakecard-image' });
    img.src = app.vault.adapter.getResourcePath(image.path);

    if (revealed || image.groups.length === 0) return wrap;

    const firstId = image.groups[0].id;
    const overlay = wrap.createDiv({ cls: 'fakecard-image-overlay is-static' });
    for (const group of image.groups) {
        const isAsked = group.id === firstId;
        // The asked group is always hidden; other groups are hidden too unless
        // "mask all groups" is switched off.
        if (!isAsked && !maskAll) continue;
        for (const mask of group.masks) {
            const maskEl = overlay.createDiv({
                cls: `fakecard-image-mask${isAsked ? ' is-current' : ''}${mask.shape === 'ellipse' ? ' is-ellipse' : ''}`,
            });
            maskEl.style.left = `${mask.x * 100}%`;
            maskEl.style.top = `${mask.y * 100}%`;
            maskEl.style.width = `${mask.w * 100}%`;
            maskEl.style.height = `${mask.h * 100}%`;
        }
    }
    return wrap;
}

/**
 * An image card, enlarged.
 *
 * The card itself keeps the picture within a share of the pane height, which is
 * what stops a screenshot from swallowing the review view - but then the small
 * print in it is unreadable. This dialog shows it in a scrolling frame that can
 * be zoomed. The masks come along, so an occlusion card cannot be "zoomed open"
 * and leak its answer.
 */
export class ImageZoomModal extends Modal {
    private figureEl: HTMLElement | null = null;
    private labelEl: HTMLElement | null = null;
    private scale = 1;
    /** Width in CSS pixels at 100%: the picture fitted into the frame. */
    private baseWidth = 0;

    constructor(
        app: App,
        private card: CardRecord,
        private revealed: boolean,
        private maskAll: boolean,
    ) {
        super(app);
    }

    onOpen(): void {
        this.modalEl.addClass('fakecard-zoom-modal');
        const { contentEl } = this;
        contentEl.empty();

        const bar = contentEl.createDiv({ cls: 'fakecard-zoom-bar' });
        bar.createEl('button', { text: '−' }).addEventListener('click', () => this.zoomBy(1 / 1.25));
        this.labelEl = bar.createSpan({ cls: 'fakecard-zoom-level', text: '100%' });
        bar.createEl('button', { text: '+' }).addEventListener('click', () => this.zoomBy(1.25));
        bar.createEl('button', { text: tt('Reset') }).addEventListener('click', () => this.zoomTo(1));

        const viewport = contentEl.createDiv({ cls: 'fakecard-zoom-viewport' });
        this.figureEl = buildImageFigure(this.app, this.card, this.revealed, this.maskAll);
        if (!this.figureEl) {
            viewport.createEl('p', { text: tt('This card has no image.') });
            return;
        }
        viewport.appendChild(this.figureEl);
        setTooltip(this.figureEl, tt('Ctrl+wheel to zoom, double-click to fit'));

        const img = this.figureEl.querySelector('img');
        const fit = (): void => {
            if (!img || !img.naturalWidth) return;
            const width = viewport.clientWidth - 24;
            const height = viewport.clientHeight - 24;
            // The modal has no size until the browser has laid it out; the
            // timers below run again once it does.
            if (width < 80 || height < 80) return;
            const ratio = Math.min(width / img.naturalWidth, height / img.naturalHeight, 1);
            this.baseWidth = Math.max(120, Math.round(img.naturalWidth * ratio));
            this.zoomTo(1);
        };
        if (img) {
            if (img.complete) window.setTimeout(fit, 0);
            else img.addEventListener('load', () => window.setTimeout(fit, 0), { once: true });
        }
        window.setTimeout(fit, 60);

        // Plain wheel keeps scrolling; Ctrl (or Cmd) turns it into zoom, the
        // way every other image viewer on the desktop behaves.
        viewport.addEventListener('wheel', (event) => {
            if (!(event.ctrlKey || event.metaKey)) return;
            event.preventDefault();
            this.zoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12);
        }, { passive: false });

        this.figureEl.addEventListener('dblclick', () => this.zoomTo(this.scale === 1 ? 2 : 1));
    }

    private zoomBy(factor: number): void {
        this.zoomTo(this.scale * factor);
    }

    private zoomTo(next: number): void {
        this.scale = Math.min(6, Math.max(0.5, Math.round(next * 100) / 100));
        const img = this.figureEl?.querySelector('img');
        if (img && this.baseWidth > 0) {
            // Width rather than a transform: the frame then scrolls for real,
            // and the masks (percentages of the wrapper) stay glued to the
            // picture.
            img.setCssStyles({
                maxWidth: 'none',
                width: `${Math.round(this.baseWidth * this.scale)}px`,
            });
        }
        this.labelEl?.setText(`${Math.round(this.scale * 100)}%`);
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
