import { App, Modal, Notice, Setting, setTooltip } from 'obsidian';

import type { CardRecord } from './card';
import { clozeGroups, parseCloze, unwrapSelection, wrapSelection } from './cloze';
import { plainOf, wrapRangePlainText } from './inlineMd';
import { parseTags } from './ui';
import { tt, ttf } from './i18n';
import { type OutlineNode, parseOutline } from './outline';
import { addFillScreenButton } from './panelFill';
import { renderMindmap } from './mapView';
import type FakeCardPlugin from '../main';

/**
 * Create or edit a mind-map card.
 *
 * The outline text is the only input: headings and list items become nodes, and
 * the same `{{c1::...}}` holes a cloze card uses become the masks - word-level
 * when they sit inside a line, node-level when they wrap the whole line. The
 * preview to the right is the map as review will draw it.
 */
export class MapPanelModal extends Modal {
    private textarea!: HTMLTextAreaElement;
    private previewEl!: HTMLElement;
    private groupSelect!: HTMLSelectElement;
    private currentGroup = 1;
    private previewTimer: number | null = null;

    constructor(
        app: App,
        private plugin: FakeCardPlugin,
        private sourcePath: string,
        private card?: CardRecord,
        initialText = '',
    ) {
        super(app);
        this.text = (card?.mapText ?? initialText) || '';
        if (card?.mapGroup) this.currentGroup = card.mapGroup;
    }

    private text: string;
    private deck = 'default';
    private tags = '';
    /** Node last pressed in the preview: where a text selection is read from. */
    private activeNode: OutlineNode | null = null;
    private activeEl: HTMLElement | null = null;
    /** The floating "mask this selection" button, when one is on screen. */
    private floatEl: HTMLElement | null = null;
    /** Whether the outline strip is showing its source box. */
    private editingSource = false;

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('fakecard-map-panel');
        contentEl.createEl('h2', { text: this.card ? tt('Edit mind map') : tt('New mind map') });
        contentEl.createEl('p', {
            cls: 'fakecard-help',
            text: tt('Double-click a node to edit it. Select words to mask them. Drag to pan, double-click empty space to re-centre.'),
        });

        const toolbar = contentEl.createDiv({ cls: 'fakecard-toolbar' });
        this.groupSelect = toolbar.createEl('select', { cls: 'dropdown' });
        this.fillGroups();

        toolbar.createEl('button', { text: tt('New group'), attr: { type: 'button' } }).addEventListener('click', () => {
            const next = Math.max(0, ...clozeGroups(this.text)) + 1;
            this.currentGroup = next;
            this.fillGroups();
            this.schedulePreview();
        });

        const wrapButton = toolbar.createEl('button', { text: tt('Wrap selection'), attr: { type: 'button' } });
        wrapButton.addEventListener('click', () => this.wrapSelectionInHole());
        setTooltip(wrapButton, tt('Wrap the selection in a hole for the chosen group'));

        toolbar.createEl('button', { text: tt('Mask whole node'), attr: { type: 'button' } }).addEventListener('click', () => {
            // With a node selected in the map, this masks that node; the text
            // area path stays for editing without touching the map.
            if (this.activeNode) this.toggleNodeMask(this.activeNode);
            else this.maskWholeNode();
        });

        toolbar.createEl('button', { text: tt('Remove mask'), attr: { type: 'button' } }).addEventListener('click', () => {
            this.removeMask();
        });

        // One area, two stages: the outline while it is being written, the map
        // once it is done. Same box, so nothing on screen has to move - which is
        // what made pressing "Done" flicker when they were stacked.
        const body = contentEl.createDiv({ cls: 'fakecard-map-panel-body' });
        this.previewEl = body.createDiv({ cls: 'fakecard-map-preview' });
        this.textarea = body.createEl('textarea', { cls: 'fakecard-map-text' });
        this.textarea.value = this.text;
        this.textarea.spellcheck = false;
        this.textarea.addEventListener('input', () => {
            this.text = this.textarea.value;
            this.fillGroups();
        });

        const modeButton = toolbar.createEl('button', { cls: 'mod-cta', text: tt('Done'), attr: { type: 'button' } });

        // Room to work: a big map in the default dialog is a postage stamp.
        addFillScreenButton(this, toolbar);

        const showSource = (): void => {
            this.editingSource = true;
            this.textarea.removeClass('is-hidden');
            this.previewEl.addClass('is-hidden');
            modeButton.setText(tt('Done'));
            this.textarea.focus();
        };
        const showMap = (): void => {
            this.editingSource = false;
            this.textarea.addClass('is-hidden');
            this.previewEl.removeClass('is-hidden');
            modeButton.setText(tt('Edit outline'));
            this.previewEl.dataset.view = '';
            this.drawPreview();
        };

        modeButton.addEventListener('click', (event) => {
            event.preventDefault();
            if (!this.editingSource) {
                showSource();
                return;
            }
            if (!this.text.trim()) {
                new Notice(tt('The map is empty.'));
                return;
            }
            showMap();
        });

        if (this.text.trim()) {
            showMap();
        } else {
            showSource();
        }

        new Setting(contentEl)
            .setName(tt('Deck'))
            .addDropdown((dropdown) => {
                for (const deck of new Set(['default', ...this.availableDecks()])) {
                    dropdown.addOption(deck, deck);
                }
                dropdown.setValue(this.card?.deck ?? this.plugin.settings.defaultDeck ?? 'default');
                dropdown.onChange((value) => {
                    this.deck = value;
                });
            });

        new Setting(contentEl)
            .setName(tt('Tags'))
            .addText((input) => {
                input.setPlaceholder(tt('tag1, tag2'));
                input.setValue((this.card?.tags ?? []).join(', '));
                input.onChange((value) => {
                    this.tags = value;
                });
            });

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

        document.addEventListener('mouseup', this.onSelectionUp);
        this.deck = this.card?.deck ?? this.plugin.settings.defaultDeck ?? 'default';
        this.tags = (this.card?.tags ?? []).join(', ');
        this.schedulePreview();
    }

    /** Decks this panel may offer: the default plus whatever created the card. */
    private availableDecks(): string[] {
        const decks = new Set<string>(['default']);
        if (this.plugin.settings.defaultDeck) decks.add(this.plugin.settings.defaultDeck);
        if (this.card?.deck) decks.add(this.card.deck);
        return [...decks];
    }

    private fillGroups(): void {
        const groups = clozeGroups(this.text);
        const max = Math.max(1, ...groups, this.currentGroup);
        this.groupSelect.empty();
        for (let group = 1; group <= max; group++) {
            const option = this.groupSelect.createEl('option');
            option.value = String(group);
            option.textContent = `c${group}`;
        }
        this.groupSelect.value = String(this.currentGroup);
        this.groupSelect.onchange = () => {
            this.currentGroup = Number.parseInt(this.groupSelect.value, 10) || 1;
            this.schedulePreview();
        };
    }

    private schedulePreview(): void {
        if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
        this.previewTimer = window.setTimeout(() => {
            this.previewTimer = null;
            this.drawPreview();
        }, 150);
    }

    private drawPreview(): void {
        // Nothing to draw while the outline is on screen: it would be a hidden
        // repaint, and the map is rendered the moment the stage changes.
        if (this.editingSource) return;
        const group = this.currentGroup;
        void renderMindmap(this.previewEl, parseOutline(this.text), {
            maskGroups: new Set([group]),
            maskSubtree: this.plugin.settings.mapMaskSubtree,
            // The view belongs to the user from here on; only entering the map
            // stage (which clears the stored view) re-centres it.
            autoCenter: false,
            app: this.app,
            sourcePath: this.sourcePath,
            // No click-to-toggle here: a click must not repaint the map, or the
            // second half of a double-click lands on a new element and editing
            // never opens.
            onNodeFocus: (node, el) => {
                this.activeNode = node;
                this.activeEl = el;
            },
            onNodeEdit: (node, text) => this.applyNodeText(node, text),
        });
    }

    /**
     * Click a node to mask or unmask it as a whole.
     *
     * This is the map-side operation the text pane cannot offer: the node you
     * point at is the thing you want asked, and wrapping it by hand means
     * counting characters in a line of Markdown.
     */
    private toggleNodeMask(node: OutlineNode): void {
        if (node.endLine !== node.line) {
            new Notice(tt('Multi-line nodes cannot be masked as a whole yet.'));
            return;
        }
        const lines = this.text.replace(/\r\n?/g, '\n').split('\n');
        const line = lines[node.line] ?? '';
        const marker = /^[\s]*(?:[-*+] |\d+[.)] |> ?|#{1,6} )/.exec(line)?.[0] ?? '';
        const whole = /^\s*\{\{c(\d+)::([\s\S]*)\}\}\s*$/.exec(line.slice(marker.length));
        lines[node.line] = whole
            ? `${marker}${whole[2]}`
            : `${marker}{{c${this.currentGroup}::${line.slice(marker.length)}}}`;
        this.setText(lines.join('\n'), 0);
    }

    private setText(text: string, caret: number): void {
        this.text = text;
        this.textarea.value = text;
        this.textarea.setSelectionRange(caret, caret);
        this.fillGroups();
        this.schedulePreview();
    }

    private wrapSelectionInHole(): void {
        // A selection inside the map wins: that is where the text is read, and
        // pointing at the words you want asked is the whole point.
        if (this.activeNode && this.activeEl) {
            const range = this.selectionOffsets(this.activeEl);
            if (range) {
                this.wrapNodeRange(this.activeNode, range.from, range.to);
                return;
            }
        }
        const from = this.textarea.selectionStart;
        const to = this.textarea.selectionEnd;
        if (from === to) {
            new Notice(tt('Select some text first.'));
            return;
        }
        const result = wrapSelection(this.text, from, to, this.currentGroup);
        this.setText(result.text, result.caret);
    }

    /** Raw-text offsets of the current DOM selection inside one node. */
    private selectionOffsets(el: HTMLElement): { from: number; to: number } | null {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
        const range = selection.getRangeAt(0);
        if (!el.contains(range.commonAncestorContainer)) return null;

        const offsetOf = (container: Node, offset: number): number | null => {
            const spans = el.querySelectorAll<HTMLElement>('[data-from]');
            for (let index = 0; index < spans.length; index++) {
                const span = spans[index];
                if (!span.contains(container) && span !== container) continue;
                // Visible characters up to the caret, then back to raw offsets:
                // the renderer dropped the Markdown markers, so a plain `+offset`
                // would land a few characters early.
                const rangeTo = document.createRange();
                rangeTo.setStart(span, 0);
                rangeTo.setEnd(container, offset);
                const visible = rangeTo.toString().length;
                const raw = span.dataset.raw ?? '';
                const { map } = plainOf(raw);
                const from = Number(span.dataset.from ?? 0);
                return from + (visible < map.length ? map[visible] : raw.length);
            }
            return null;
        };

        const from = offsetOf(range.startContainer, range.startOffset);
        const to = offsetOf(range.endContainer, range.endOffset);
        if (from === null || to === null || to <= from) return null;
        return { from, to };
    }

    /** Replace a node's source line with new text, keeping its list marker. */
    private applyNodeText(node: OutlineNode, text: string): void {
        const lines = this.text.replace(/\r\n?/g, '\n').split('\n');
        const line = lines[node.line] ?? '';
        const marker = /^[\s]*(?:[-*+] |\d+[.)] |> ?|#{1,6} )/.exec(line)?.[0] ?? '';
        lines.splice(node.line, node.endLine - node.line + 1, `${marker}${text}`);
        this.setText(lines.join('\n'), 0);
    }

    /** Wrap [from, to) of one node's raw text in a hole for the current group. */
    private wrapNodeRange(node: OutlineNode, from: number, to: number): void {
        if (node.endLine !== node.line) {
            new Notice(tt('Multi-line nodes cannot be masked as a whole yet.'));
            return;
        }
        const lines = this.text.replace(/\r\n?/g, '\n').split('\n');
        const line = lines[node.line] ?? '';
        const marker = /^[\s]*(?:[-*+] |\d+[.)] |> ?|#{1,6} )/.exec(line)?.[0] ?? '';
        const raw = line.slice(marker.length);
        // Plain text goes in the hole: a selection that starts inside `**bold**`
        // would otherwise split the marker and leave broken Markdown behind.
        lines[node.line] = `${marker}${wrapRangePlainText(raw, from, to, this.currentGroup)}`;
        this.setText(lines.join('\n'), 0);
    }

    /**
     * Mask the node under the caret as a whole: the line's own marker stays
     * outside, everything after it goes into one hole.
     */
    private maskWholeNode(): void {
        const value = this.text;
        const caret = this.textarea.selectionStart;
        const lineStart = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
        const lineEnd = value.indexOf('\n', caret);
        const end = lineEnd < 0 ? value.length : lineEnd;
        const line = value.slice(lineStart, end);
        if (!line.trim()) return;
        if (parseCloze(line).length > 0) {
            new Notice(tt('This line already has a mask.'));
            return;
        }
        const prefix = /^[\s]*(?:[-*+] |\d+[.)] |> ?|#{1,6} )/.exec(line)?.[0] ?? '';
        const hole = `${prefix}{{c${this.currentGroup}::${line.slice(prefix.length)}}}`;
        this.text = `${value.slice(0, lineStart)}${hole}${value.slice(end)}`;
        this.textarea.value = this.text;
        const at = lineStart + hole.length;
        this.textarea.setSelectionRange(at, at);
        this.fillGroups();
        this.schedulePreview();
    }

    private removeMask(): void {
        // A hole selected on the map comes first: the text box is hidden while
        // the map is on screen, so its selection is always empty there.
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const holder = range.startContainer.parentElement ?? null;
            const hole = holder?.closest<HTMLElement>('.fakecard-map-hole') ?? null;
            if (hole && this.activeEl?.contains(hole)) {
                this.unwrapHole(hole);
                return;
            }
        }

        const from = this.textarea.selectionStart;
        const to = this.textarea.selectionEnd;
        if (from === to) {
            new Notice(tt('Select the masked text first.'));
            return;
        }
        const result = unwrapSelection(this.text, from, to);
        this.text = result.text;
        this.textarea.value = result.text;
        this.textarea.setSelectionRange(result.caret, result.caret);
        this.fillGroups();
        this.schedulePreview();
    }

    private async save(): Promise<void> {
        const text = this.text.trim();
        if (!text) {
            new Notice(tt('The map is empty.'));
            return;
        }
        if (clozeGroups(text).length === 0) {
            new Notice(tt('Mask at least one word or node with {{c1::...}} first.'));
            return;
        }

        if (this.card) {
            await this.plugin.syncMapGroup(this.card, text);
            // Deck and tags belong to the whole map: setting them on this card
            // alone left the other groups of the same map on the old values.
            await this.plugin.applyMapMeta(this.card, this.deck, parseTags(this.tags));
        } else {
            const cards = this.plugin.createMapCards(text, this.sourcePath, undefined, this.deck);
            const tags = parseTags(this.tags);
            const groupId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            for (const card of cards) {
                card.mapGroupId = groupId;
                card.tags = tags;
                await this.plugin.store.save(card);
            }
            new Notice(ttf('Saved {count} map card(s).', { count: cards.length }));
        }
        this.close();
        this.plugin.refreshStatusBar();
    }

    /**
     * A small button that appears next to the selection inside a node: select
     * the words you want asked, click once, done. The toolbar button is still
     * there, but this is the gesture people actually reach for.
     */
    private onSelectionUp = (): void => {
        window.setTimeout(() => {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
                this.hideFloat();
                return;
            }
            const range = selection.getRangeAt(0);
            if (!this.previewEl.contains(range.commonAncestorContainer)) {
                this.hideFloat();
                return;
            }
            // instanceOf, not instanceof: the node may come from another window
            // (a popped-out pane), where the global Element is a different class.
            const container = range.commonAncestorContainer;
            const holder = container.instanceOf(Element) ? container : container.parentElement;
            const nodeEl = holder?.closest<HTMLElement>('.fakecard-map-node') ?? null;
            if (!nodeEl || nodeEl !== this.activeEl || !this.activeNode) {
                this.hideFloat();
                return;
            }
            const hole = (range.startContainer.parentElement ?? null)?.closest<HTMLElement>('.fakecard-map-hole') ?? null;
            const box = range.getBoundingClientRect();
            this.showFloat(box, hole);
        }, 0);
    };

    private showFloat(box: DOMRect, hole: HTMLElement | null): void {
        this.hideFloat();
        const button = createEl('button', { cls: 'fakecard-map-float', attr: { type: 'button' } });
        button.setText(hole ? tt('Remove mask') : tt('Mask selection'));
        button.setCssStyles({
            left: `${Math.round(box.left + box.width / 2 - 40)}px`,
            top: `${Math.round(box.bottom + 6)}px`,
        });
        button.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (hole) this.unwrapHole(hole);
            else this.wrapSelectionInHole();
            this.hideFloat();
        });
        document.body.appendChild(button);
        this.floatEl = button;
    }

    private hideFloat(): void {
        this.floatEl?.remove();
        this.floatEl = null;
    }

    /** Drop one hole, keeping the words it hid. */
    private unwrapHole(hole: HTMLElement): void {
        const node = this.activeNode;
        if (!node || node.endLine !== node.line) return;
        const from = Number(hole.dataset.from ?? '-1');
        const to = Number(hole.dataset.to ?? '-1');
        if (from < 0 || to <= from) return;
        const lines = this.text.replace(/\r\n?/g, '\n').split('\n');
        const line = lines[node.line] ?? '';
        const marker = /^[\s]*(?:[-*+] |\d+[.)] |> ?|#{1,6} )/.exec(line)?.[0] ?? '';
        const raw = line.slice(marker.length);
        const inner = /\{\{c\d+::([\s\S]*?)(?:::[^}]*?)?\}\}/.exec(raw.slice(from, to))?.[1] ?? raw.slice(from, to);
        lines[node.line] = `${marker}${raw.slice(0, from)}${inner}${raw.slice(to)}`;
        this.setText(lines.join('\n'), 0);
    }

    onClose(): void {
        if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
        document.removeEventListener('mouseup', this.onSelectionUp);
        this.hideFloat();
        this.contentEl.empty();
    }
}
