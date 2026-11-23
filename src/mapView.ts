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
    /**
     * The group this card asks, when every group is masked: its holes keep the
     * blue accent, the others are drawn neutral, the way a cloze card does it.
     */
    askedGroup?: number;
    /** Groups to mark as answers once revealed: the words that were hidden. */
    highlightGroups?: ReadonlySet<number>;
    /** A fully masked node also hides its children. */
    maskSubtree: boolean;
    /**
     * Ignore the saved view for this render: centre on the question even when
     * the host already carries a position from the previous one.
     */
    forceCenter?: boolean;
    /** When given, a node can be clicked - the panel uses it to toggle a mask. */
    onNodeClick?: (node: OutlineNode) => void;
    /** Called when a node is pressed, so the panel knows where a selection is. */
    onNodeFocus?: (node: OutlineNode, el: HTMLElement) => void;
    /** Click on a mask: the panel opens its note editor. */
    onMaskClick?: (node: OutlineNode, hole: HTMLElement) => void;
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

const GAP_X = 56;
const GAP_Y = 16;
const MIN_SCALE = 0.3;
const MAX_SCALE = 2;

/**
 * Rendered node text, keyed by source path and raw markdown.
 *
 * A map repaint creates new spans but rarely changes more than one line; this
 * keeps MarkdownRenderer off that path. Bounded because a panel can be open for
 * a long editing session.
 */
const RENDERED_TEXT_LIMIT = 500;
const renderedText = new Map<string, Node[]>();

/**
 * Measured node sizes, keyed by depth, visible mask groups and raw text.
 *
 * A repaint recreates the nodes but usually changes one line; the other boxes
 * would be measured again, and every read forces a synchronous layout. The
 * width comes from `max-content` capped at a fixed 420px, so it does not depend
 * on the canvas or the zoom, only on what is drawn inside the box.
 */
const MEASURED_LIMIT = 2000;
const measuredSize = new Map<string, { w: number; h: number }>();

function measuredKey(node: OutlineNode, el: HTMLElement): string {
    // The drawn box decides the size, not the source text: the same line is
    // shorter while masked and longer once the answer is shown.
    return `${node.depth}\u0000${el.className.replace(' is-selected', '')}\u0000${el.textContent ?? ''}`;
}

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
                if (options.askedGroup !== undefined && node.wholeHole !== options.askedGroup) {
                    el.addClass('is-other');
                }
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
                        // The answer must not be readable through the mask, and
                        // the hole must occupy the same kind of line box as the
                        // words it replaces. A fixed `[___]` reflowed the node,
                        // and an inline-block of a set height made the line
                        // taller (blank space above and below); plain spaces
                        // keep the exact metrics of the surrounding text.
                        span.addClass('fakecard-map-hole');
                        if (options.askedGroup !== undefined && piece.group !== options.askedGroup) {
                            span.addClass('is-other');
                        }
                        // Text inside the hole, not an empty box: a box with
                        // padding and no content has no reliable metrics, and
                        // this also matches what a cloze mask looks like.
                        if (piece.hint) span.addClass('has-hint');
                        span.setText(piece.hint ? `[${piece.hint}]` : '[___]');
                        if (options.onMaskClick) {
                            span.addClass('is-editable');
                            span.addEventListener('click', (event) => {
                                event.stopPropagation();
                                options.onMaskClick?.(node, span);
                            });
                        }
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
                        // Measure with the class that resets the height, then
                        // give the measured height back as a real value.
                        input.addClass('is-measuring');
                        const height = input.scrollHeight;
                        input.removeClass('is-measuring');
                        input.setCssProps({ height: `${Math.min(360, height + 2)}px` });
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
                        const target = down.target as Node | null;
                        if (target?.instanceOf(Node) && input.contains(target)) return;
                        finish(true);
                    };
                    const finish = (save: boolean): void => {
                        if (closed) return;
                        closed = true;
                        activeDocument.removeEventListener('mousedown', onDocumentDown, true);
                        const next = input.value.trim();
                        input.remove();
                        if (save && next && next !== node.text) options.onNodeEdit?.(node, next);
                    };
                    activeDocument.addEventListener('mousedown', onDocumentDown, true);
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
    //
    // A repaint rebuilds the nodes but usually changes one line; the rendered
    // HTML for a piece of text is reused, so only the edited line pays for
    // MarkdownRenderer. The cache is bounded because the panel is not.
    if (options.app && options.sourcePath) {
        const component = new Component();
        await Promise.all(created.map(async ({ el }) => {
            const spans = el.querySelectorAll<HTMLElement>('[data-raw]');
            for (let index = 0; index < spans.length; index++) {
                const span = spans[index];
                const raw = span.dataset.raw ?? '';
                if (!raw) continue;
                const key = `${options.sourcePath}\u0000${raw}`;
                const cached = renderedText.get(key);
                if (cached !== undefined) {
                    // The span already holds the synchronous fallback; the
                    // cached children replace it, not append to it.
                    span.empty();
                    for (const child of cached) span.appendChild(child.cloneNode(true));
                    continue;
                }
                span.empty();
                await MarkdownRenderer.render(options.app!, raw, span, options.sourcePath!, component);
                // The renderer puts a single paragraph inside a <p>, which turns
                // every text run into a block: the hole between two runs then
                // sits alone on its line. One paragraph means one line of text
                // here, so its contents are lifted into the span itself.
                const paragraph = span.firstElementChild;
                if (span.children.length === 1 && paragraph?.tagName === 'P') {
                    while (paragraph.firstChild) span.insertBefore(paragraph.firstChild, paragraph);
                    paragraph.remove();
                }
                if (renderedText.size >= RENDERED_TEXT_LIMIT) {
                    for (const oldest of renderedText.keys()) {
                        renderedText.delete(oldest);
                        break;
                    }
                }
                renderedText.set(key, Array.from(span.childNodes, (child) => child.cloneNode(true)));
            }
        }));
        // The renderer's children are done; releasing them here keeps embedded
        // notes from holding listeners for the life of the view.
        component.unload();
    }

    // Sizes are known only now. A box whose text and visible masks did not
    // change keeps its last size: reading a rect after the DOM was written is
    // what forces a synchronous layout, and a repaint usually touches one node.
    const misses: Array<{ node: OutlineNode; el: HTMLElement; key: string }> = [];
    for (const { node, el } of created) {
        const key = measuredKey(node, el);
        const cached = measuredSize.get(key);
        if (cached) {
            boxes.set(node, { node, el, w: cached.w, h: cached.h, x: 0, y: 0 });
        } else {
            misses.push({ node, el, key });
        }
    }
    // One batch of reads, so the browser lays out once instead of per box.
    for (const miss of misses) {
        const rect = miss.el.getBoundingClientRect();
        boxes.set(miss.node, { node: miss.node, el: miss.el, w: rect.width, h: rect.height, x: 0, y: 0 });
        measuredSize.set(miss.key, { w: rect.width, h: rect.height });
    }
    if (measuredSize.size > MEASURED_LIMIT) {
        for (const oldest of measuredSize.keys()) {
            measuredSize.delete(oldest);
            if (measuredSize.size <= MEASURED_LIMIT) break;
        }
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

    // A repaint replaces every node, but the previous render's settle timers
    // are still pending. They must not touch this render's view: that is how a
    // correct centre got overwritten by a measurement taken before layout.
    const renderId = String((Number(host.dataset.renderId) || 0) + 1);
    host.dataset.renderId = renderId;
    const alive = (): boolean => host.dataset.renderId === renderId;

    const fit = (): void => {
        const rect = host.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        if (maxX === 0 && maxY === 0) return;
        const next = Math.min((rect.width - 40) / (maxX || 1), (rect.height - 40) / (maxY || 1), 1);
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
        tx = (rect.width - maxX * scale) / 2;
        ty = (rect.height - maxY * scale) / 2;
        apply();
    };

    /**
     * Centre one node at the given scale - the only centring code there is.
     *
     * The node can still have no width when the first settle runs (markdown is
     * rendered asynchronously), and a measurement of zero parks the map half a
     * pane to the right. Retry on the next frames until it has a size; a later
     * render cancels the retry through `alive`.
     */
    const centerOn = (el: HTMLElement, nextScale: number, attempt = 0): void => {
        if (!alive()) return;
        const rect = host.getBoundingClientRect();
        if ((rect.width === 0 || el.offsetWidth === 0) && attempt < 20) {
            window.setTimeout(() => centerOn(el, nextScale, attempt + 1), 50);
            return;
        }
        // A node from a render that has already been replaced must not apply.
        if (!el.isConnected) return;
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

    const centerOnQuestion = (attempt = 0): void => {
        if (!alive()) return;
        // An explicit node wins (review passes the one the card asks about, so
        // the answer side stays where the question was). Then the first mask,
        // then the root - fitting everything would leave it small and askew.
        const focus = options.focusNodeId
            ? [...boxes.entries()].find(([node]) => node.id === options.focusNodeId)?.[1]
            : undefined;
        // A mask span is inline and has no position of its own; centring it put
        // the map half a pane to the right. Always centre the node that holds
        // the mask.
        const maskedNode = firstMasked?.closest<HTMLElement>('.fakecard-map-node') ?? null;
        const target = focus?.el ?? maskedNode ?? boxes.get(root)?.el ?? null;
        if (target) {
            centerOn(target, fitScale());
            return;
        }
        // The render is asynchronous: a settle that runs before the nodes are
        // in the map has nothing to centre on, and fitting an empty map parks
        // it half a pane to the right. Wait for the nodes instead.
        if (boxes.size === 0 && attempt < 20) {
            window.setTimeout(() => centerOnQuestion(attempt + 1), 50);
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
        // A press on a node is a press on text: let the browser start a text
        // selection there instead of panning. The bare canvas still pans.
        if (target instanceof HTMLElement && target.closest('.fakecard-map-node')) return;
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
        // any map editor. At the edge of the map the wheel is left alone, so the
        // panel around it scrolls instead - otherwise the bottom of the dialog
        // (deck, tags, the save button) could never be reached from the map.
        const rect = host.getBoundingClientRect();
        const shift = event.shiftKey;
        const panX = shift ? event.deltaY : event.deltaX;
        const panY = shift ? 0 : event.deltaY;
        const canPanY = panY !== 0
            && (panY > 0
                ? ty + maxY * scale > rect.height + 1
                : ty < -1);
        const canPanX = panX !== 0
            && (panX > 0
                ? tx + maxX * scale > rect.width + 1
                : tx < -1);
        if (!canPanX && !canPanY) return;
        event.preventDefault();
        if (canPanY) ty -= panY;
        if (canPanX) tx -= panX;
        apply();
    }, { passive: false });

    host.addEventListener('dblclick', (event) => {
        event.preventDefault();
        centerOnQuestion();
    });

    // First paint: review centres the question, an editor restores the view the
    // user already had. In both cases a repaint must not move the map.
    const settle = (): void => {
        if (!alive()) return;
        if (host.getBoundingClientRect().width === 0) return;
        const saved = options.autoCenter === false && !options.forceCenter
            ? host.dataset.view
            : undefined;
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
