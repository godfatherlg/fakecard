import { App, Component, MarkdownRenderer } from 'obsidian';

import { renderInlineMd } from './inlineMd';
import type { OutlineNode } from './outline';
import { splitNodeText } from './outline';

/**
 * A mind map drawn from an outline.
 *
 * Right-growing tree: depth runs left to right, each level starts after the
 * widest node of the level before it, and siblings are packed vertically by
 * subtree height so branches never overlap. Everything is absolutely placed DOM
 * inside one transformed canvas, which makes panning and zooming a single
 * transform rather than a re-layout.
 *
 * Node text is plain: the masking holes are drawn as boxes, but Markdown inside
 * a node is not rendered. That is deliberate for now - emphasis and links would
 * change how wide a node is measured, and width is what the layout is built on.
 */
export interface MapRenderOptions {
    /** Groups to hide. Empty means the answer side: everything is shown. */
    maskGroups: ReadonlySet<number>;
    /** Groups to mark as answers once revealed: the words that were hidden. */
    highlightGroups?: ReadonlySet<number>;
    /** A fully masked node also hides its children. */
    maskSubtree: boolean;
    /** When given, a node can be clicked - the panel uses it to toggle a mask. */
    onNodeClick?: (node: OutlineNode) => void;
    /** Called when a node is pressed, so the panel knows where a selection is. */
    onNodeFocus?: (node: OutlineNode, el: HTMLElement) => void;
    /** Double-click: the node's text is being edited, raw, in place. */
    onNodeEdit?: (node: OutlineNode, text: string) => void;
    /**
     * Centre on the question after a repaint. Review wants that; a panel being
     * edited does not - there the view belongs to the user's hand, and jumping
     * on every keystroke is worse than an off-screen node.
     */
    autoCenter?: boolean;
    /**
     * Node to centre on, by id. Review passes the node the card asks about, so
     * the answer side keeps looking at the same place as the question side.
     */
    focusNodeId?: string;
    /** When given, node text is rendered by Obsidian instead of the fallback. */
    app?: App;
    /** Vault path used to resolve links and embeds inside a node. */
    sourcePath?: string;
}

export interface MapHandle {
    /** Centre the first masked node, or fit the map when nothing is masked. */
    centerOnQuestion(): void;
    fit(): void;
    zoomBy(factor: number): void;
}

/** Does any node below this one carry a hole of its own? */
function subtreeHasHoles(node: OutlineNode): boolean {
    return node.children.some((child) => child.holes.length > 0 || subtreeHasHoles(child));
}

/**
 * Rendered node text, keyed by source path and text.
 *
 * A repaint rebuilds every node, and each visible piece goes through
 * MarkdownRenderer. Caching the resulting HTML keeps a mask toggle cheap on a
 * large map instead of re-parsing the same labels every time. The cache is
 * bounded: it is a speed-up, not a store.
 */
const RENDER_CACHE = new Map<string, string>();
const RENDER_CACHE_LIMIT = 500;

const GAP_X = 56;
const GAP_Y = 16;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2;

interface Box {
    node: OutlineNode;
    el: HTMLElement;
    w: number;
    h: number;
    x: number;
    y: number;
}

export async function renderMindmap(
    host: HTMLElement,
    root: OutlineNode,
    options: MapRenderOptions,
): Promise<MapHandle> {
    host.empty();
    host.addClass('fakecard-map');

    const canvas = host.createDiv({ cls: 'fakecard-map-canvas' });
    // Nodes are measured in place, before they are positioned. Their width comes
    // from `width: max-content` in the stylesheet (capped by `max-width`), not
    // from the canvas - an absolutely positioned canvas has no width of its own,
    // and depending on it collapsed every node to one character per line.
    const linkLayer = canvas.createSvg('svg', { cls: 'fakecard-map-links' });

    const boxes = new Map<OutlineNode, Box>();
    const created: Array<{ node: OutlineNode; el: HTMLElement }> = [];
    let firstMasked: HTMLElement | null = null;

    const build = (node: OutlineNode): void => {
        const whole = node.wholeHole !== undefined && options.maskGroups.has(node.wholeHole);
        // Hiding the branch only makes sense when nothing below it is asked: if
        // a child carries its own hole, that child is another card's question and
        // must stay on screen.
        const hideChildren = whole && options.maskSubtree && !subtreeHasHoles(node);
        if (node.text.trim()) {
            const el = canvas.createDiv({ cls: 'fakecard-map-node' });
            if (node.depth === 0) el.addClass('is-root');
            if (whole) {
                el.addClass('is-whole-mask');
                el.createSpan({ cls: 'fakecard-map-question', text: '?' });
                firstMasked ??= el;
            } else {
                // A whole node that was the answer shows as one green block.
                if (node.wholeHole !== undefined && options.highlightGroups?.has(node.wholeHole)) {
                    el.addClass('is-whole-answer');
                }
                for (const piece of splitNodeText(node.text, options.maskGroups)) {
                    // One span per raw piece, carrying its offsets: that is what
                    // turns a selection in the rendered node back into text.
                    const span = el.createSpan();
                    span.dataset.from = String(piece.from);
                    span.dataset.to = String(piece.to);
                    if (piece.masked) {
                        // The answer must not be readable through the mask.
                        span.addClass('fakecard-map-hole');
                        span.setText('[___]');
                        firstMasked ??= span;
                        continue;
                    }
                    // The words that were hidden are marked as the answer once
                    // revealed - the same green a cloze card gives its holes.
                    if (piece.group !== undefined && options.highlightGroups?.has(piece.group)) {
                        span.addClass('fakecard-map-answer');
                    }
                    // Fallback drawing first, so the node is never blank while
                    // Obsidian's renderer is still working on it.
                    span.dataset.raw = piece.text;
                    renderInlineMd(span, piece.text);
                }
            }
            if (options.onNodeClick || options.onNodeFocus || options.onNodeEdit) {
                el.addClass('is-clickable');
                el.addEventListener('mousedown', (event) => {
                    event.stopPropagation();
                    // One node at a time reads as selected; the panel uses it to
                    // know which node a toolbar action applies to.
                    const selected = canvas.querySelectorAll('.is-selected');
                    for (let index = 0; index < selected.length; index++) {
                        (selected[index] as HTMLElement).removeClass('is-selected');
                    }
                    el.addClass('is-selected');
                    options.onNodeFocus?.(node, el);
                });
                el.addEventListener('click', (event) => {
                    event.stopPropagation();
                    options.onNodeClick?.(node);
                });
            }
            if (options.onNodeEdit) {
                el.addEventListener('dblclick', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    // Editing is a focus mode: bring the node to the middle at
                    // 100% first, so the box is readable whatever the zoom was.
                    focusOn(el);
                    const input = canvas.createEl('textarea', { cls: 'fakecard-map-editor' });
                    input.value = node.text;
                    input.setCssStyles({
                        left: `${Number.parseFloat(el.style.left || '0')}px`,
                        top: `${Number.parseFloat(el.style.top || '0') - 2}px`,
                        width: `${Math.max(260, el.offsetWidth + 80)}px`,
                    });
                    const grow = (): void => {
                        input.setCssStyles({ height: 'auto' });
                        input.setCssStyles({ height: `${Math.min(360, input.scrollHeight + 2)}px` });
                    };
                    input.addEventListener('input', grow);
                    grow();
                    input.focus();
                    input.setSelectionRange(input.value.length, input.value.length);

                    let closed = false;
                    // Clicking anywhere else has to end the edit. A blur handler
                    // is not enough: the map's mousedown calls preventDefault to
                    // start a drag, which keeps focus where it was.
                    const onDocumentDown = (down: MouseEvent): void => {
                        if (down.target instanceof Node && input.contains(down.target)) return;
                        finish(true);
                    };
                    const finish = (save: boolean): void => {
                        if (closed) return;
                        closed = true;
                        document.removeEventListener('mousedown', onDocumentDown, true);
                        const next = input.value.trim();
                        input.remove();
                        if (save && next && next !== node.text) options.onNodeEdit?.(node, next);
                    };
                    document.addEventListener('mousedown', onDocumentDown, true);
                    input.addEventListener('keydown', (key) => {
                        // Enter must not reach the modal: its primary button would
                        // take it as "save and close".
                        key.stopPropagation();
                        if (key.key === 'Escape') {
                            key.preventDefault();
                            finish(false);
                        } else if (key.key === 'Enter' && !key.shiftKey) {
                            key.preventDefault();
                            finish(true);
                        }
                    });
                    input.addEventListener('click', (event) => event.stopPropagation());
                    input.addEventListener('blur', () => finish(true));
                });
            }
            created.push({ node, el });
        }
        // The branch is the answer: nothing below it is drawn on the question
        // side - unless a child is asked by another card.
        if (hideChildren) return;
        for (const child of node.children) build(child);
    };
    build(root);

    // Node text is rendered by Obsidian itself when a vault path is available,
    // so a node can hold anything a note can. It is async, which is why the map
    // measures only after every node has settled.
    if (options.app && options.sourcePath) {
        const component = new Component();
        await Promise.all(created.map(async ({ el }) => {
            const spans = el.querySelectorAll<HTMLElement>('[data-raw]');
            for (let index = 0; index < spans.length; index++) {
                const span = spans[index];
                const raw = span.dataset.raw ?? '';
                if (!raw) continue;
                span.empty();
                const key = `${options.sourcePath}\u0000${raw}`;
                const cached = RENDER_CACHE.get(key);
                if (cached !== undefined) {
                    // Same text, same note: the HTML is already known.
                    span.innerHTML = cached;
                    continue;
                }
                await MarkdownRenderer.render(options.app!, raw, span, options.sourcePath!, component);
                if (RENDER_CACHE.size >= RENDER_CACHE_LIMIT) RENDER_CACHE.clear();
                RENDER_CACHE.set(key, span.innerHTML);
            }
        }));
        // The renderer's children are done; releasing them here keeps embedded
        // notes from holding listeners for the life of the view.
        component.unload();
    }

    // Sizes are known only now.
    for (const { node, el } of created) {
        const rect = el.getBoundingClientRect();
        boxes.set(node, { node, el, w: rect.width, h: rect.height, x: 0, y: 0 });
    }

    // Column widths: each depth starts after the widest node of the one before.
    const widthByDepth: number[] = [];
    for (const box of boxes.values()) {
        widthByDepth[box.node.depth] = Math.max(widthByDepth[box.node.depth] ?? 0, box.w);
    }
    const xByDepth: number[] = [];
    let cursorX = 0;
    for (let depth = 0; depth < widthByDepth.length; depth++) {
        xByDepth[depth] = cursorX;
        cursorX += (widthByDepth[depth] ?? 0) + GAP_X;
    }

    // Vertical packing: a leaf takes the next slot, a parent centres on its
    // children. A root without text is not drawn, so its children start at the
    // top and the tree grows without a title node.
    let cursorY = 0;
    const place = (node: OutlineNode): void => {
        const box = boxes.get(node);
        const children = node.children
            .map((child) => boxes.get(child))
            .filter((entry): entry is Box => entry !== undefined);

        if (children.length > 0) {
            for (const child of children) place(child.node);
            if (box) box.y = (children[0].y + children[children.length - 1].y) / 2;
        } else if (box) {
            box.y = cursorY;
            cursorY += box.h + GAP_Y;
        }

        if (box) {
            box.x = xByDepth[box.node.depth] ?? 0;
            box.el.setCssStyles({ left: `${box.x}px`, top: `${box.y}px` });
        }
    };
    place(root);

    let maxX = 0;
    let maxY = 0;
    for (const box of boxes.values()) {
        maxX = Math.max(maxX, box.x + box.w);
        maxY = Math.max(maxY, box.y + box.h);
        for (const child of box.node.children) {
            const target = boxes.get(child);
            if (!target) continue;
            const x1 = box.x + box.w;
            const y1 = box.y + box.h / 2;
            const x2 = target.x;
            const y2 = target.y + target.h / 2;
            const mid = (x1 + x2) / 2;
            const path = linkLayer.createSvg('path', { cls: 'fakecard-map-link' });
            path.setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
        }
    }
    linkLayer.setAttribute('width', String(maxX + 80));
    linkLayer.setAttribute('height', String(maxY + 80));
    // Now that the tree is placed, the canvas can take its real size.
    canvas.setCssStyles({ width: `${maxX + 80}px`, height: `${maxY + 80}px` });

    let scale = 1;
    let tx = 0;
    let ty = 0;
    const apply = (): void => {
        canvas.setCssStyles({ transform: `translate(${tx}px, ${ty}px) scale(${scale})` });
        // Kept on the element, which survives a repaint: the panel restores it so
        // editing a word does not throw the map back to its default position.
        host.dataset.view = `${scale},${tx},${ty}`;
    };

    const fit = (): void => {
        const rect = host.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const next = Math.min((rect.width - 40) / (maxX || 1), (rect.height - 40) / (maxY || 1), 1);
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
        tx = (rect.width - maxX * scale) / 2;
        ty = (rect.height - maxY * scale) / 2;
        apply();
    };

    /** Centre one node at the given scale - the only centring code there is. */
    const centerOn = (el: HTMLElement, nextScale: number): void => {
        const rect = host.getBoundingClientRect();
        const left = Number.parseFloat(el.style.left || '0');
        const top = Number.parseFloat(el.style.top || '0');
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
        tx = rect.width / 2 - (left + el.offsetWidth / 2) * scale;
        ty = rect.height / 2 - (top + el.offsetHeight / 2) * scale;
        apply();
    };

    /** The scale at which the whole map fits, never above 100%. */
    const fitScale = (): number => {
        const rect = host.getBoundingClientRect();
        const next = Math.min((rect.width - 40) / (maxX || 1), (rect.height - 40) / (maxY || 1), 1);
        return Math.max(MIN_SCALE, next);
    };

    /** Editing wants the node at 100%: the view a text box needs. */
    const focusOn = (el: HTMLElement): void => centerOn(el, 1);

    const centerOnQuestion = (): void => {
        // An explicit node wins (review passes the one the card asks about, so
        // the answer side stays where the question was). Then the first mask,
        // then the root - fitting everything would leave it small and askew.
        const focus = options.focusNodeId
            ? [...boxes.entries()].find(([node]) => node.id === options.focusNodeId)?.[1]
            : undefined;
        const target = focus?.el ?? firstMasked ?? boxes.get(root)?.el ?? null;
        if (target) {
            centerOn(target, fitScale());
            return;
        }
        fit();
    };

    // Pointer events cover mouse, pen and touch with one set of handlers: one
    // pointer pans, two pointers pinch. `touch-action: none` in the stylesheet
    // stops the page from scrolling instead.
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchSpan = 0;

    const spanOf = (): number => {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return 0;
        return Math.hypot(a.x - b.x, a.y - b.y);
    };

    host.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        // Typing into the inline editor is not a drag: preventDefault here would
        // stop the caret from being placed at the click.
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('.fakecard-map-editor')) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 1) {
            host.addClass('is-panning');
            host.setPointerCapture(event.pointerId);
        } else {
            pinchSpan = spanOf();
        }
    });

    host.addEventListener('pointermove', (event) => {
        const previous = pointers.get(event.pointerId);
        if (!previous) return;
        const from = { x: previous.x, y: previous.y };
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (pointers.size === 1) {
            tx += event.clientX - from.x;
            ty += event.clientY - from.y;
            apply();
            return;
        }
        if (pointers.size !== 2) return;

        // Pinch: the distance between the fingers is the zoom, anchored at their
        // midpoint so the map grows under the fingers.
        const span = spanOf();
        if (pinchSpan <= 0) {
            pinchSpan = span;
            return;
        }
        const factor = span / pinchSpan;
        pinchSpan = span;
        const rect = host.getBoundingClientRect();
        const [a, b] = [...pointers.values()];
        const px = (a.x + b.x) / 2 - rect.left;
        const py = (a.y + b.y) / 2 - rect.top;
        const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
        tx = px - ((px - tx) / scale) * next;
        ty = py - ((py - ty) / scale) * next;
        scale = next;
        apply();
    });

    const endPointer = (event: PointerEvent): void => {
        pointers.delete(event.pointerId);
        pinchSpan = 0;
        if (pointers.size === 0) host.removeClass('is-panning');
        if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    };
    host.addEventListener('pointerup', endPointer);
    host.addEventListener('pointercancel', endPointer);

    host.addEventListener('wheel', (event) => {
        if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            const factor = event.deltaY < 0 ? 1.1 : 0.9;
            const rect = host.getBoundingClientRect();
            const px = event.clientX - rect.left;
            const py = event.clientY - rect.top;
            const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
            tx = px - ((px - tx) / scale) * next;
            ty = py - ((py - ty) / scale) * next;
            scale = next;
            apply();
            return;
        }
        // A map is bigger than the frame: the wheel moves it, like the canvas of
        // any map editor.
        event.preventDefault();
        if (event.shiftKey) tx -= event.deltaY;
        else {
            ty -= event.deltaY;
            tx -= event.deltaX;
        }
        apply();
    }, { passive: false });

    host.addEventListener('dblclick', (event) => {
        event.preventDefault();
        centerOnQuestion();
    });

    // First paint: review centres the question, an editor restores the view the
    // user already had. In both cases a repaint must not move the map.
    const settle = (): void => {
        if (host.getBoundingClientRect().width === 0) return;
        const saved = options.autoCenter === false ? host.dataset.view : undefined;
        if (saved) {
            const [nextScale, nextX, nextY] = saved.split(',').map(Number);
            if ([nextScale, nextX, nextY].every((value) => Number.isFinite(value))) {
                scale = nextScale;
                tx = nextX;
                ty = nextY;
                apply();
                return;
            }
        }
        // First paint of a panel is still centred: the map has to start
        // somewhere sensible before the user takes over.
        centerOnQuestion();
    };
    window.setTimeout(settle, 0);
    window.setTimeout(settle, 60);

    return {
        centerOnQuestion,
        fit,
        zoomBy: (factor: number) => {
            scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
            apply();
        },
    };
}
