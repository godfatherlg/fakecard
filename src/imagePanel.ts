import { App, Modal, Notice, Setting } from 'obsidian';
import type { CardImage, CardRecord, ImageGroup, ImageMask } from './card';
import { cloneValue, HistoryStack } from './history';
import type FakeCardPlugin from '../main';

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
    private history!: HistoryStack<ImageGroup[]>;
    /** Display zoom of the image (1 = fit width). Masks stay fractional. */
    private scale = 1;
    private wrapElForScale!: HTMLElement;

    constructor(
        app: App,
        private plugin: FakeCardPlugin,
        private imagePath: string,
        private sourcePath: string,
        private card?: CardRecord,
        private onSaved?: () => void,
    ) {
        super(app);
        const existing = card?.image?.groups;
        this.groups = existing && existing.length > 0
            ? existing.map((group) => ({ id: group.id, masks: group.masks.map((mask) => ({ ...mask })) }))
            : [{ id: 1, masks: [] }];
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('fakecard-image-panel');
        contentEl.createEl('h2', { text: this.card ? 'Edit image card' : 'New image card' });

        contentEl.createEl('p', {
            cls: 'fakecard-help',
            text: 'Drag on the image to add rectangles. Pick a group (c1, c2 ...) first; each group is asked separately during review.',
        });

        // Toolbar.
        const toolbar = contentEl.createDiv({ cls: 'fakecard-toolbar' });
        this.groupSelect = toolbar.createEl('select', { cls: 'dropdown' });
        this.rebuildGroupOptions();
        this.groupSelect.addEventListener('change', () => {
            this.currentGroup = Number.parseInt(this.groupSelect.value, 10) || 1;
            this.renderMasks();
        });

        toolbar.createEl('button', { text: 'New group' }).addEventListener('click', () => {
            const nextId = Math.max(0, ...this.groups.map((group) => group.id)) + 1;
            this.groups.push({ id: nextId, masks: [] });
            this.currentGroup = nextId;
            this.rebuildGroupOptions();
            this.renderMasks();
        });

        this.shapeButton = toolbar.createEl('button', { text: 'Shape: Rect' });
        this.shapeButton.addEventListener('click', () => {
            this.currentShape = this.currentShape === 'rect' ? 'ellipse' : 'rect';
            this.shapeButton.textContent = this.currentShape === 'rect' ? 'Shape: Rect' : 'Shape: Ellipse';
        });

        toolbar.createEl('button', { text: 'Remove selected' }).addEventListener('click', () => {
            this.removeSelected();
        });

        // Canvas.
        this.history = new HistoryStack(cloneValue(this.groups));

        // Ctrl/Cmd+Z undoes the last mask change, Shift+Z redoes it.
        // Arrow keys nudge the selected mask (Shift = 1%, else 0.1%).
        this.contentEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                const next = event.shiftKey ? this.history.redo() : this.history.undo();
                if (next === null) return;
                this.groups = cloneValue(next);
                this.rebuildGroupOptions();
                this.renderMasks();
                return;
            }

            if (!this.selectedMask || !this.selectedEl) return;
            const step = event.shiftKey ? 0.01 : 0.001;
            let dx = 0;
            let dy = 0;
            if (event.key === 'ArrowLeft') dx = -step;
            else if (event.key === 'ArrowRight') dx = step;
            else if (event.key === 'ArrowUp') dy = -step;
            else if (event.key === 'ArrowDown') dy = step;
            else return;

            event.preventDefault();
            const { mask } = this.selectedMask;
            mask.x = Math.min(1 - mask.w, Math.max(0, mask.x + dx));
            mask.y = Math.min(1 - mask.h, Math.max(0, mask.y + dy));
            this.positionMask(this.selectedEl, mask);
            this.history.push(cloneValue(this.groups));
        });

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
            if (this.dragStart) this.cancelDrag();
        });

        this.renderMasks();

        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(this.card ? 'Save changes' : 'Create card')
                .setCta()
                .onClick(() => {
                    void this.save();
                }))
            .addButton((button) => button
                .setButtonText('Cancel')
                .onClick(() => this.close()));
    }

    onClose(): void {
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
        if (!this.dragStart || !this.drawn) return;
        const point = this.relativePoint(event);
        if (!point) return;
        this.positionMask(this.drawn, this.normalize(this.dragStart, point));
    }

    private onDragEnd(event: MouseEvent): void {
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
        // The elements are rebuilt below; the old selected element is gone.
        this.selectedEl = null;
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
                    this.selectMask(group.id, mask, el);
                });
            }
        }
        if (drawing) this.overlayEl.appendChild(drawing);
    }

    private selectedMask: { groupId: number; mask: ImageMask } | null = null;
    private selectedEl: HTMLElement | null = null;

    private selectMask(groupId: number, mask: ImageMask, el: HTMLElement): void {
        this.selectedMask = { groupId, mask };
        this.overlayEl.querySelectorAll('.fakecard-image-mask').forEach((node) => node.classList.remove('is-selected'));
        this.selectedEl = el;
        el.classList.add('is-selected');
    }

    private removeSelected(): void {
        if (!this.selectedMask) {
            new Notice('Click a mask first, then remove it.');
            return;
        }
        const { groupId, mask } = this.selectedMask;
        const group = this.groups.find((entry) => entry.id === groupId);
        if (group) {
            group.masks = group.masks.filter((entry) => entry !== mask);
        }
        this.selectedMask = null;
        this.selectedEl = null;
        this.rebuildGroupOptions();
        this.renderMasks();
        this.history.push(cloneValue(this.groups));
    }

    private async save(): Promise<void> {
        const total = this.groups.reduce((sum, group) => sum + group.masks.length, 0);
        if (total === 0) {
            new Notice('Draw at least one rectangle first.');
            return;
        }

        const image: CardImage = {
            path: this.imagePath,
            groups: this.groups
                .filter((group) => group.masks.length > 0)
                .map((group) => ({ id: group.id, masks: group.masks })),
        };

        // One card per group (Anki model): each group schedules separately.
        const cards = this.plugin.createImageCards(image, this.sourcePath);

        if (this.card) {
            if (cards.length === 1) {
                // Still a single group - update the card in place, keeping its
                // id and FSRS history.
                this.card.image = cards[0].image;
                this.card.front = cards[0].front;
                this.card.back = cards[0].back;
                this.card.updated = new Date().toISOString();
                await this.plugin.store.save(this.card);
            } else {
                // Split into one card per group: the old combined card is
                // replaced (its FSRS state cannot be shared between groups).
                await this.plugin.store.remove(this.card.id);
                for (const card of cards) await this.plugin.store.save(card);
            }
        } else {
            for (const card of cards) await this.plugin.store.save(card);
        }
        new Notice(`Saved ${cards.length} image card(s).`);
        this.close();
        this.onSaved?.();
    }
}
