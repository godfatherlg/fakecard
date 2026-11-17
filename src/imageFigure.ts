import { App, setTooltip } from 'obsidian';
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
 * Ctrl+wheel zooms a picture in place; double-click puts it back.
 *
 * Shared by every picture a card can show - an occlusion picture, or one
 * embedded in a cloze or Q&A card - because the gesture should not depend on
 * how the picture got there. Zooming widens the image past its box and lets the
 * scroller (`scroller`) take over; `host` is the element that owns the size cap
 * (the figure wrapper for an occlusion picture, the embed span otherwise).
 */
export function makeImageZoomable(
    img: HTMLImageElement,
    scroller: HTMLElement,
    host?: HTMLElement | null,
    /** Size to start at, as a multiple of "fits the pane" (a saved zoom). */
    initialZoom = 1,
    /** Called whenever the gesture changes the zoom, for saving it. */
    onChange?: (zoom: number) => void,
): void {
    if (img.dataset.fcZoom === 'on') return;
    img.dataset.fcZoom = 'on';
    img.addClass('is-zoomable');
    setTooltip(img, tt('Ctrl+wheel to zoom, double-click to fit'));

    const shell = host ?? (img.parentElement instanceof HTMLElement ? img.parentElement : null);
    let zoom = initialZoom;
    let baseWidth = 0;
    const apply = (): void => {
        shell?.toggleClass('is-zoomed', zoom !== 1);
        if (zoom === 1) {
            img.setCssStyles({ width: '', maxWidth: '' });
            shell?.setCssStyles({ maxWidth: '' });
            scroller.removeClass('has-zoomed-image');
            return;
        }
        if (baseWidth === 0) baseWidth = img.getBoundingClientRect().width;
        img.setCssStyles({
            maxWidth: 'none',
            width: `${Math.round(baseWidth * zoom)}px`,
        });
        shell?.setCssStyles({ maxWidth: 'none' });
        scroller.addClass('has-zoomed-image');
    };

    img.addEventListener('wheel', (event) => {
        // Plain wheel keeps scrolling the card; zoom needs the modifier, the
        // same way Obsidian's own canvas zooms.
        if (!(event.ctrlKey || event.metaKey)) return;
        event.preventDefault();
        // Below 100% is allowed too: a picture can still be too big for the
        // text around it, and shrinking it is the polite way out.
            zoom = Math.min(4, Math.max(0.5, zoom + (event.deltaY < 0 ? 0.15 : -0.15)));
            apply();
            onChange?.(zoom);
        }, { passive: false });

        img.addEventListener('dblclick', (event) => {
            event.preventDefault();
            event.stopPropagation();
            zoom = 1;
            apply();
            onChange?.(1);
        });

    // A saved zoom multiplies a width that is not known until the picture has
    // been laid out once, so it is applied as soon as there is something to
    // multiply.
    if (zoom !== 1) {
        const applySaved = (): void => {
            if (img.getBoundingClientRect().width === 0) return;
            apply();
        };
        if (img.complete) window.setTimeout(applySaved, 0);
        else img.addEventListener('load', () => window.setTimeout(applySaved, 0), { once: true });
        window.setTimeout(applySaved, 60);
    }
}

/**
 * Make every picture inside rendered markdown zoomable, including the ones
 * Obsidian resolves after the render promise settles (embeds load late).
 */
export function attachImageZoom(container: HTMLElement, scroller: HTMLElement): void {
    const wire = (img: HTMLImageElement): void => makeImageZoomable(img, scroller);
    container.querySelectorAll('img').forEach((img) => wire(img));
    container.addEventListener('load', (event) => {
        if (event.target instanceof HTMLImageElement) wire(event.target);
    }, true);
}
