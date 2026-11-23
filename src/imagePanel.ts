import { App, Modal, Notice, Setting } from 'obsidian';
import type { CardImage, CardRecord, ImageGroup, ImageMask } from './card';
import { cloneValue, HistoryStack } from './history';
import { tt, ttf } from './i18n';
import type FakeCardPlugin from '../main';

/** The eight grips of a selected box: corners first, then edges. */
const RESIZE_DIRECTIONS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
type ResizeDir = (typeof RESIZE_DIRECTIONS)[number];

/**
 * Image occlusion editor.
 *
 * Draw rectangles or ellipses on the image, assign each shape to a mask group
 * (c1, c2 ...), and review asks one group at a time. Coordinates are stored as
 * fractions of the image (0..1), so any display size works. Each mask carries
 * its shape ('rect' by default, 'ellipse' when drawn with the ellipse tool).
 */
export class ImagePanelModal extends Modal {
    private groups: ImageGroup[];
    private currentGroup = 1;
    private scrollEl!: HTMLElement;
    private wrapEl!: HTMLElement;
    private imgEl!: HTMLImageElement;
    private overlayEl!: HTMLElement;
    private groupSelect!: HTMLSelectElement;
    private drawn: HTMLDivElement | null = null;
    private dragStart: { x: number; y: number } | null = null;
    /** Shape drawn by the next drag. */
    private currentShape: 'rect' | 'ellipse' = 'rect';
    private shapeButton!: HTMLButtonElement;
    /** Puts the selected boxes into the group the dropdown points at. */
    private assignButton!: HTMLButtonElement;
    private history!: HistoryStack<ImageGroup[]>;
    /** Display zoom of the image (1 = fit width). Masks stay fractional. */
    private scale = 1;
    private wrapElForScale!: HTMLElement;
    /** Editor container; swapped between the picker and the canvas. */
    private bodyEl!: HTMLElement;
    /** Document-level paste listener, removed with the panel. */
    private pasteHandler: ((event: ClipboardEvent) => void) | null = null;

    constructor(
        app: App,
        private plugin: FakeCardPlugin,
        private imagePath: string,
        private sourcePath: string,
        private card?: CardRecord,
        private onSaved?: () => void,
        /** Set when the new card is a child: it links back and pauses the parent. */
        private childOf?: string,
        /**
         * Every group the picture has, across all of its cards. One card holds
         * one group, so without this the panel would only know about its own
         * group - and saving would then see the others as "removed" and delete
         * their cards.
         */
        allGroups?: ImageGroup[],
    ) {
        super(app);
        const existing = allGroups && allGroups.length > 0 ? allGroups : card?.image?.groups;
        this.groups = existing && existing.length > 0
            ? existing.map((group) => ({ id: group.id, masks: group.masks.map((mask) => ({ ...mask })) }))
            : [{ id: 1, masks: [] }];
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('fakecard-image-panel');
        contentEl.createEl('h2', { text: this.card ? tt('Edit image card') : tt('New image card') });

        this.bodyEl = contentEl.createDiv({ cls: 'fakecard-image-body' });

        // Ctrl/Cmd+V on an empty panel takes the image straight from the
        // clipboard - screenshots usually arrive that way. Bound on document
        // so the paste lands wherever the focus is, and removed on close.
        this.pasteHandler = (event: ClipboardEvent): void => this.onPaste(event);
        activeDocument.addEventListener('paste', this.pasteHandler);

        // Ctrl/Cmd+Z undoes the last mask change, Shift+Z redoes it.
        contentEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (!this.imagePath) return;
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
            event.preventDefault();
            const next = event.shiftKey ? this.history.redo() : this.history.undo();
            if (next === null) return;
            this.groups = cloneValue(next);
            this.rebuildGroupOptions();
            this.renderMasks();
        });

        this.renderBody();
    }

    /** The editor, rebuilt whenever the image changes. */
    private renderBody(): void {
        this.bodyEl.empty();
        if (!this.imagePath) {
            this.renderPicker();
            return;
        }

        const contentEl = this.bodyEl;
        contentEl.createEl('p', {
            cls: 'fakecard-help',
            text: tt('Drag on the image to add a box. Click a box to select it and drag to move it; Ctrl+click selects several; drag a grip on a selected box to resize it. Pick a group (c1, c2 ...) first; each group is asked separately during review.'),
        });

        // Toolbar.
        const toolbar = contentEl.createDiv({ cls: 'fakecard-toolbar' });
        this.groupSelect = toolbar.createEl('select', { cls: 'dropdown' });
        this.rebuildGroupOptions();
        this.groupSelect.addEventListener('change', () => {
            this.currentGroup = Number.parseInt(this.groupSelect.value, 10) || 1;
            this.renderMasks();
            // Picking a group also selects its boxes, so they can be moved to
            // another group, extended with Ctrl+click, or deleted together.
            this.selectGroup(this.currentGroup);
        });

        toolbar.createEl('button', { text: tt('New group') }).addEventListener('click', () => {
            const nextId = Math.max(0, ...this.groups.map((group) => group.id)) + 1;
            this.groups.push({ id: nextId, masks: [] });
            this.currentGroup = nextId;
            this.rebuildGroupOptions();
            this.renderMasks();
        });

        // The one action that changes which group a box asks in: take whatever
        // is selected and put it in the group the dropdown points at.
        this.assignButton = toolbar.createEl('button', { cls: 'fakecard-image-assign' });
        this.assignButton.addEventListener('click', () => this.assignSelectionToGroup());
        this.updateAssignButton();

        this.shapeButton = toolbar.createEl('button', { text: tt('Shape: Rect') });
        this.shapeButton.addEventListener('click', () => {
            this.currentShape = this.currentShape === 'rect' ? 'ellipse' : 'rect';
            this.shapeButton.textContent = this.currentShape === 'rect' ? tt('Shape: Rect') : tt('Shape: Ellipse');
        });

        toolbar.createEl('button', { text: tt('Remove selected') }).addEventListener('click', () => {
            this.removeSelected();
        });

        // Canvas.
        this.history = new HistoryStack(cloneValue(this.groups));

        // Zoom controls: +/- or Ctrl+wheel; the scroll container pans.
        const zoomOut = toolbar.createEl('button', { text: '−' });
        zoomOut.addEventListener('click', () => this.setScale(this.scale - 0.2));
        const zoomReset = toolbar.createEl('button', { text: '100%' });
        zoomReset.addEventListener('click', () => this.setScale(1));
        const zoomIn = toolbar.createEl('button', { text: '+' });
        zoomIn.addEventListener('click', () => this.setScale(this.scale + 0.2));

        this.scrollEl = contentEl.createDiv({ cls: 'fakecard-image-scroll' });
        this.scrollEl.addEventListener('wheel', (event: WheelEvent) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            this.setScale(this.scale + (event.deltaY < 0 ? 0.1 : -0.1));
        }, { passive: false });

        this.wrapEl = this.scrollEl.createDiv({ cls: 'fakecard-image-wrap' });
        this.wrapElForScale = this.wrapEl;
        this.imgEl = this.wrapEl.createEl('img', { cls: 'fakecard-image' });
        this.imgEl.src = this.app.vault.adapter.getResourcePath(this.imagePath);
        this.overlayEl = this.wrapEl.createDiv({ cls: 'fakecard-image-overlay' });

        this.overlayEl.addEventListener('mousedown', (event) => this.onDragStart(event));
        this.overlayEl.addEventListener('mousemove', (event) => this.onDragMove(event));
        this.overlayEl.addEventListener('mouseup', (event) => this.onDragEnd(event));
        this.overlayEl.addEventListener('mouseleave', () => {
            // A move or a resize keeps whatever it reached; a half-drawn box is
            // not a box yet and is thrown away.
            if (this.resizeDrag) {
                this.resizeDrag = null;
                this.history.push(cloneValue(this.groups));
                return;
            }
            if (this.moveDrag) {
                this.moveDrag = null;
                this.history.push(cloneValue(this.groups));
                return;
            }
            if (this.dragStart) this.cancelDrag();
        });

        this.renderMasks();

        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(this.card ? tt('Save changes') : tt('Create card'))
                .setCta()
                .onClick(() => {
                    void this.save();
                }))
            .addButton((button) => button
                .setButtonText(tt('Cancel'))
                .onClick(() => this.close()));
    }

    /** Empty panel: no image yet, so offer the three ways to get one. */
    private renderPicker(): void {
        const box = this.bodyEl.createDiv({ cls: 'fakecard-image-picker' });
        box.createEl('p', {
            cls: 'fakecard-help',
            text: tt('Paste an image (Ctrl/Cmd+V), drop a file here, or choose one from disk. It is copied into the library folder.'),
        });

        const actions = box.createDiv({ cls: 'fakecard-toolbar' });
        const paste = actions.createEl('button', { cls: 'mod-cta', text: tt('Paste from clipboard') });
        paste.addEventListener('click', () => {
            void this.pasteFromClipboard();
        });

        const input = actions.createEl('input', {
            type: 'file',
            attr: { accept: 'image/*' },
        });
        input.addClass('fakecard-image-file');
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (file) void this.adoptFile(file);
        });

        actions.createEl('button', { text: tt('Cancel') }).addEventListener('click', () => this.close());

        box.addEventListener('dragover', (event) => {
            event.preventDefault();
            box.addClass('is-dropping');
        });
        box.addEventListener('dragleave', () => box.removeClass('is-dropping'));
        box.addEventListener('drop', (event) => {
            event.preventDefault();
            box.removeClass('is-dropping');
            const file = event.dataTransfer?.files?.[0];
            if (file && file.type.startsWith('image/')) void this.adoptFile(file);
        });
    }

    private async pasteFromClipboard(): Promise<void> {
        const path = await this.plugin.clipboardImagePath();
        if (!path) {
            new Notice(tt('No image on the clipboard - press Ctrl/Cmd+V or choose a file.'));
            return;
        }
        this.imagePath = path;
        this.renderBody();
    }

    private async adoptFile(file: File): Promise<void> {
        const path = await this.plugin.importImageFile(file);
        if (!path) {
            new Notice(tt('Could not import that image.'));
            return;
        }
        this.imagePath = path;
        this.renderBody();
    }

    private onPaste(event: ClipboardEvent): void {
        if (this.imagePath) return;
        const item = Array.from(event.clipboardData?.items ?? [])
            .find((entry) => entry.type.startsWith('image/'));
        const file = item?.getAsFile();
        if (!file) return;
        event.preventDefault();
        void this.adoptFile(file);
    }

    onClose(): void {
        if (this.pasteHandler) {
            activeDocument.removeEventListener('paste', this.pasteHandler);
            this.pasteHandler = null;
        }
        this.contentEl.empty();
    }

    private setScale(scale: number): void {
        this.scale = Math.min(5, Math.max(0.5, scale));
        this.wrapElForScale.style.width = `${this.scale * 100}%`;
    }

    private rebuildGroupOptions(): void {
        this.groupSelect.empty();
        for (const group of this.groups) {
            const option = this.groupSelect.createEl('option', { text: `c${group.id} (${group.masks.length})` });
            option.value = String(group.id);
        }
        this.groupSelect.value = String(this.currentGroup);
        this.updateAssignButton();
    }

    /** Label follows the group dropdown: "move here" must say where. */
    private updateAssignButton(): void {
        if (!this.assignButton) return;
        this.assignButton.setText(ttf('Move selected to c{group}', { group: this.currentGroup }));
        this.assignButton.disabled = this.selection.length === 0;
    }

    /** Highlight every box of one group. */
    private selectGroup(groupId: number): void {
        for (const entry of this.selection) entry.el.classList.remove('is-selected');
        this.selection = [];
        const group = this.groups.find((entry) => entry.id === groupId);
        if (!group || group.masks.length === 0) {
            this.updateAssignButton();
            return;
        }
        const nodes = this.overlayEl.querySelectorAll<HTMLElement>(`.fakecard-image-mask[data-group-id="${groupId}"]`);
        nodes.forEach((el, index) => {
            const mask = group.masks[index];
            if (!mask) return;
            el.classList.add('is-selected');
            this.selection.push({ groupId, mask, el });
        });
        this.updateAssignButton();
    }

    /**
     * Put the selected boxes into the current group.
     *
     * This is how a box changes group after it was drawn: draw it under the
     * group it belongs to, or draw anywhere and move the selection afterwards.
     */
    private assignSelectionToGroup(): void {
        if (this.selection.length === 0) {
            new Notice(tt('Select a box first, then remove it.'));
            return;
        }
        const target = this.groupFor(this.currentGroup);
        const moving = new Set(this.selection.map((entry) => entry.mask));
        for (const group of this.groups) {
            if (group === target) continue;
            group.masks = group.masks.filter((mask) => !moving.has(mask));
        }
        for (const mask of moving) {
            if (!target.masks.includes(mask)) target.masks.push(mask);
        }
        this.selection = [];
        this.rebuildGroupOptions();
        this.renderMasks();
        this.selectGroup(target.id);
        this.history.push(cloneValue(this.groups));
    }

    private groupFor(id: number): ImageGroup {
        let group = this.groups.find((entry) => entry.id === id);
        if (!group) {
            group = { id, masks: [] };
            this.groups.push(group);
        }
        return group;
    }

    private relativePoint(event: MouseEvent): { x: number; y: number } | null {
        const rect = this.imgEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        return {
            x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
            y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
        };
    }

    private onDragStart(event: MouseEvent): void {
        if (event.button !== 0) return;
        const point = this.relativePoint(event);
        if (!point) return;
        event.preventDefault();
        this.dragStart = point;
        this.drawn = this.overlayEl.createDiv({ cls: 'fakecard-image-mask is-drawing' });
    }

    private onDragMove(event: MouseEvent): void {
        // A grip on a selected box resizes that box and nothing else.
        if (this.resizeDrag) {
            const point = this.relativePoint(event);
            if (point) this.applyResize(point);
            return;
        }
        // Moving the selection takes precedence: the box under the pointer was
        // already claimed by its own mousedown, which stopped the event.
        if (this.moveDrag) {
            const point = this.relativePoint(event);
            if (!point) return;
            const dx = point.x - this.moveDrag.startX;
            const dy = point.y - this.moveDrag.startY;
            for (const item of this.moveDrag.items) {
                item.mask.x = Math.min(1 - item.mask.w, Math.max(0, item.x + dx));
                item.mask.y = Math.min(1 - item.mask.h, Math.max(0, item.y + dy));
                this.positionMask(item.el, item.mask);
            }
            return;
        }

        if (!this.dragStart || !this.drawn) return;
        const point = this.relativePoint(event);
        if (!point) return;
        this.positionMask(this.drawn, this.normalize(this.dragStart, point));
    }

    private onDragEnd(event: MouseEvent): void {
        if (this.resizeDrag) {
            this.resizeDrag = null;
            this.history.push(cloneValue(this.groups));
            return;
        }
        if (this.moveDrag) {
            this.moveDrag = null;
            this.history.push(cloneValue(this.groups));
            return;
        }
        if (!this.dragStart || !this.drawn) return;
        const point = this.relativePoint(event);
        if (!point) {
            this.cancelDrag();
            return;
        }
        const mask = this.normalize(this.dragStart, point);
        this.drawn.remove();
        this.drawn = null;
        this.dragStart = null;

        // Ignore accidental tiny rectangles (a click, not a drag).
        if (mask.w < 0.005 || mask.h < 0.005) {
            this.renderMasks();
            return;
        }

        this.groupFor(this.currentGroup).masks.push({ ...mask, shape: this.currentShape });
        this.rebuildGroupOptions();
        this.renderMasks();
        this.history.push(cloneValue(this.groups));
    }

    private cancelDrag(): void {
        this.drawn?.remove();
        this.drawn = null;
        this.dragStart = null;
        this.renderMasks();
    }

    /**
     * Pull the edges or corners the grip belongs to, keeping the opposite side
     * fixed. The box never shrinks past 1% or leaves the picture.
     */
    private applyResize(point: { x: number; y: number }): void {
        const drag = this.resizeDrag;
        if (!drag) return;
        const { original: o, dir } = drag;
        const min = 0.01;
        let left = o.x;
        let right = o.x + o.w;
        let top = o.y;
        let bottom = o.y + o.h;

        if (dir.includes('e')) right = Math.min(1, Math.max(o.x + min, point.x));
        if (dir.includes('w')) left = Math.max(0, Math.min(o.x + o.w - min, point.x));
        if (dir.includes('s')) bottom = Math.min(1, Math.max(o.y + min, point.y));
        if (dir.includes('n')) top = Math.max(0, Math.min(o.y + o.h - min, point.y));

        drag.mask.x = left;
        drag.mask.y = top;
        drag.mask.w = right - left;
        drag.mask.h = bottom - top;
        this.positionMask(drag.el, drag.mask);
    }

    private normalize(a: { x: number; y: number }, b: { x: number; y: number }): ImageMask {
        return {
            x: Math.min(a.x, b.x),
            y: Math.min(a.y, b.y),
            w: Math.abs(a.x - b.x),
            h: Math.abs(a.y - b.y),
        };
    }

    private positionMask(el: HTMLElement, mask: ImageMask): void {
        el.style.left = `${mask.x * 100}%`;
        el.style.top = `${mask.y * 100}%`;
        el.style.width = `${mask.w * 100}%`;
        el.style.height = `${mask.h * 100}%`;
    }

    private renderMasks(): void {
        // Keep the in-progress rectangle if a drag is running.
        const drawing = this.drawn;
        this.overlayEl.empty();
        // Every element below is new, so the old selection cannot be shown.
        this.selection = [];
        for (const group of this.groups) {
            for (const mask of group.masks) {
                const el = this.overlayEl.createDiv({
                    cls: `fakecard-image-mask${group.id === this.currentGroup ? ' is-current' : ''}${mask.shape === 'ellipse' ? ' is-ellipse' : ''}`,
                });
                this.positionMask(el, mask);
                el.createSpan({ cls: 'fakecard-image-mask-label', text: `c${group.id}` });
                el.dataset.groupId = String(group.id);
                el.addEventListener('mousedown', (event) => {
                    event.stopPropagation();
                    if (event.button !== 0) return;
                    const record = { groupId: group.id, mask, el };
                    if (event.ctrlKey || event.metaKey) {
                        // Ctrl adds to the selection so several boxes move together.
                        this.toggleSelected(record);
                        return;
                    }
                    if (!this.isSelected(mask)) this.selectOnly(record);
                    this.startMove(event);
                });

                // Eight grips, shown only while the box is selected: drag one to
                // resize from that edge or corner.
                for (const dir of RESIZE_DIRECTIONS) {
                    const handle = el.createDiv({ cls: `fakecard-image-mask-handle is-${dir}` });
                    handle.addEventListener('mousedown', (event) => {
                        if (event.button !== 0) return;
                        event.preventDefault();
                        event.stopPropagation();
                        const point = this.relativePoint(event);
                        if (!point) return;
                        this.resizeDrag = { dir, mask, el, original: { ...mask } };
                    });
                }
            }
        }
        if (drawing) this.overlayEl.appendChild(drawing);
        this.updateAssignButton();
    }

    /** Masks currently selected, with the element that draws each one. */
    private selection: Array<{ groupId: number; mask: ImageMask; el: HTMLElement }> = [];
    /** A drag on one of the eight handles of a selected box. */
    private resizeDrag: {
        dir: ResizeDir;
        mask: ImageMask;
        el: HTMLElement;
        original: { x: number; y: number; w: number; h: number };
    } | null = null;
    /** A drag that moves the selection instead of drawing a new box. */
    private moveDrag: {
        startX: number;
        startY: number;
        items: Array<{ mask: ImageMask; x: number; y: number; el: HTMLElement }>;
    } | null = null;

    private isSelected(mask: ImageMask): boolean {
        return this.selection.some((entry) => entry.mask === mask);
    }

    private selectOnly(record: { groupId: number; mask: ImageMask; el: HTMLElement }): void {
        for (const entry of this.selection) entry.el.classList.remove('is-selected');
        this.selection = [record];
        record.el.classList.add('is-selected');
        this.updateAssignButton();
    }

    private toggleSelected(record: { groupId: number; mask: ImageMask; el: HTMLElement }): void {
        const at = this.selection.findIndex((entry) => entry.mask === record.mask);
        if (at >= 0) {
            this.selection[at].el.classList.remove('is-selected');
            this.selection.splice(at, 1);
            return;
        }
        this.selection.push(record);
        record.el.classList.add('is-selected');
        this.updateAssignButton();
    }

    /** Start moving every selected mask, keeping their relative offsets. */
    private startMove(event: MouseEvent): void {
        const point = this.relativePoint(event);
        if (!point || this.selection.length === 0) return;
        event.preventDefault();
        this.moveDrag = {
            startX: point.x,
            startY: point.y,
            items: this.selection.map((entry) => ({
                mask: entry.mask,
                x: entry.mask.x,
                y: entry.mask.y,
                el: entry.el,
            })),
        };
    }

    private removeSelected(): void {
        if (this.selection.length === 0) {
            new Notice(tt('Select a box first, then remove it.'));
            return;
        }
        const doomed = new Set(this.selection.map((entry) => entry.mask));
        for (const group of this.groups) {
            group.masks = group.masks.filter((mask) => !doomed.has(mask));
        }
        this.selection = [];
        this.rebuildGroupOptions();
        this.renderMasks();
        this.history.push(cloneValue(this.groups));
    }

    private async save(): Promise<void> {
        if (!this.imagePath) {
            new Notice(tt('Choose an image first.'));
            return;
        }
        const total = this.groups.reduce((sum, group) => sum + group.masks.length, 0);
        if (total === 0) {
            new Notice(tt('Draw at least one rectangle first.'));
            return;
        }

        // Groups without a box are dropped and the rest are renumbered 1..n, so
        // what is saved is always c1, c2, ... with no gaps. The old id is kept
        // alongside, because that is how a group finds its existing card.
        const used = this.groups.filter((group) => group.masks.length > 0);
        const plan = used.map((group, index) => ({
            oldId: group.id,
            group: { id: index + 1, masks: group.masks },
        }));
        // The zoom is a reading preference, not part of the masks: an edit here
        // must not reset the size the card has been read at.
        const image: CardImage = {
            path: this.imagePath,
            groups: plan.map((entry) => entry.group),
            zoom: this.card?.image?.zoom,
        };

        // One card per group (Anki model): each group schedules separately.
        const cards = this.plugin.createImageCards(image, this.sourcePath);
        if (this.childOf) {
            for (const card of cards) card.childOf = this.childOf;
        }

        if (!this.card) {
            for (const card of cards) await this.plugin.store.save(card);
            new Notice(ttf('Saved {count} image card(s).', { count: cards.length }));
            this.close();
            this.onSaved?.();
            return;
        }

        // Reconcile with the cards that already exist for this picture, one per
        // group: a group that survives keeps its card id and FSRS history, a new
        // group gets a card of its own, a group that lost every box takes its
        // card with it. Replacing the lot would reset every group's schedule just
        // because one box changed.
        const all = await this.plugin.store.list();
        const known = new Map<number, CardRecord>();
        for (const entry of all) {
            if (entry.type !== 'image' || entry.image?.path !== image.path) continue;
            const groupId = entry.image.groups[0]?.id;
            if (groupId !== undefined) known.set(groupId, entry);
        }

        // A new group is the same picture and the same knowledge, so it takes
        // over the deck, tags and schedule of the card being edited - only the id
        // is new. The due date is pulled to today, otherwise a region nobody has
        // seen yet would inherit a date weeks away and never show up.
        const source = this.card;
        const inherit = (card: CardRecord): void => {
            card.deck = source.deck;
            card.tags = [...(source.tags ?? [])];
            if (source.childOf) card.childOf = source.childOf;
            if (source.fsrs) {
                card.fsrs = { ...source.fsrs, due: new Date() };
            }
        };

        const kept = new Set<number>();
        for (const [index, entry] of plan.entries()) {
            const card = cards[index];
            kept.add(entry.oldId);
            const existing = known.get(entry.oldId);
            if (!existing) {
                inherit(card);
                await this.plugin.store.save(card);
                continue;
            }
            existing.image = card.image;
            existing.front = card.front;
            existing.back = card.back;
            existing.updated = new Date().toISOString();
            await this.plugin.store.save(existing);
        }
        for (const [groupId, entry] of known) {
            if (!kept.has(groupId)) await this.plugin.store.remove(entry.id);
        }

        new Notice(ttf('Saved {count} image card(s).', { count: cards.length }));
        this.close();
        this.onSaved?.();
    }
}
