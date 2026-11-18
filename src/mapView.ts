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
    // Nodes are measured while they are already in the DOM. Without a definite
    // width here, an absolutely positioned canvas is 0px wide and every node
    // shrinks to one character per line - the "vertical text" look.
    canvas.setCssStyles({ width: '8000px', height: '8000px' });
    const linkLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    linkLayer.setAttribute('class', 'fakecard-map-links');
    canvas.appendChild(linkLayer);

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
                await MarkdownRenderer.render(options.app!, raw, span, options.sourcePath!, component);
            }
        }));
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
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
            path.setAttribute('class', 'fakecard-map-link');
            linkLayer.appendChild(path);
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

    const centerOn = (el: HTMLElement): void => {
        const rect = host.getBoundingClientRect();
        const left = Number.parseFloat(el.style.left || '0');
        const top = Number.parseFloat(el.style.top || '0');
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        // Readable but not huge: a masked node is centred at 100%, or at the fit
        // scale when the map is wider than the frame.
        const fitted = Math.min((rect.width - 40) / (maxX || 1), (rect.height - 40) / (maxY || 1));
        scale = Math.min(1, Math.max(MIN_SCALE, fitted));
        tx = rect.width / 2 - (left + w / 2) * scale;
        ty = rect.height / 2 - (top + h / 2) * scale;
        apply();
    };

    /** Put one node in the middle at 100%: the view an editor wants. */
    const focusOn = (el: HTMLElement): void => {
        const rect = host.getBoundingClientRect();
        const left = Number.parseFloat(el.style.left || '0');
        const top = Number.parseFloat(el.style.top || '0');
        scale = 1;
        tx = rect.width / 2 - (left + el.offsetWidth / 2);
        ty = rect.height / 2 - (top + el.offsetHeight / 2);
        apply();
    };

    const centerOnQuestion = (): void => {
        // With a mask, that is the question. Without one, the root is the
        // centre of the map - fitting the whole thing would leave it small and
        // off in a corner.
        const target = firstMasked ?? boxes.get(root)?.el ?? null;
        if (target) {
            centerOn(target);
            return;
        }
        fit();
    };

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    host.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        // Typing into the inline editor is not a drag: preventDefault here would
        // stop the caret from being placed at the click.
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('.fakecard-map-editor')) return;
        dragging = true;
        lastX = event.clientX;
        lastY = event.clientY;
        host.addClass('is-panning');
        event.preventDefault();
    });
    host.addEventListener('mousemove', (event) => {
        if (!dragging) return;
        tx += event.clientX - lastX;
        ty += event.clientY - lastY;
        lastX = event.clientX;
        lastY = event.clientY;
        apply();
    });
    const endDrag = (): void => {
        dragging = false;
        host.removeClass('is-panning');
    };
    host.addEventListener('mouseup', endDrag);
    host.addEventListener('mouseleave', endDrag);

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
