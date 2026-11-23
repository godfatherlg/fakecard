import { App, Modal, Notice, Setting, setTooltip } from 'obsidian';

import { type AudioEditorHandle, renderAudioEditor } from './audio';
import type { CardRecord } from './card';
import { clozeGroups, holeAnswer, holeHint, parseCloze, unwrapSelection, withHoleHint, wrapSelection } from './cloze';
import { closeHintEditor, openHintEditor } from './hintEditor';
import { plainOf, wrapRangePlainText } from './inlineMd';
import { parseTags } from './ui';
import { tt, ttf } from './i18n';
import { findQuestionNode, type OutlineNode, outlineGroups, parseOutline } from './outline';
import { addFillScreenButton } from './panelFill';
import { createStages, type StageSwitch } from './panelStages';
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
        private onSaved?: () => void,
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
    /** Stops a recording in progress if the panel is closed. */
    private audio?: AudioEditorHandle;
    /** Whether the outline strip is showing its source box. */
    /** The editor/render switch shared with the other new-card panels. */
    private stages!: StageSwitch;
    /** Preview side: show the words the masks are hiding. */
    private showAnswers = false;
    private revealButton: HTMLButtonElement | null = null;
    /** The map has been painted once; the first paint is hidden until settled. */
    private painted = false;
    /** The next draw centres on the current group instead of restoring a view. */
    private recenter = false;
    /** Just applied a mask: ignore the mouseup that is still on its way. */
    private suppressSelectionUntil = 0;
    /** The document the mouseup listener was added to. */
    private selectionDoc: Document | null = null;

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

        // Write the card from both sides: the masked view is how it is asked,
        // the revealed one is what the answer will look like. Without this the
        // panel only ever showed the holes.
        this.revealButton = toolbar.createEl('button', {
            text: tt('Show answer'),
            attr: { type: 'button' },
        });
        setTooltip(this.revealButton, tt('Show the masked text in the preview'));
        this.revealButton.addEventListener('click', () => {
            this.showAnswers = !this.showAnswers;
            this.revealButton?.setText(this.showAnswers ? tt('Hide answer') : tt('Show answer'));
            if (!this.stages.onView) {
                if (!this.text.trim()) return;
                this.stages.showView();
                return;
            }
            this.drawPreview();
        });

        const wrapButton = toolbar.createEl('button', { text: tt('Wrap selection'), attr: { type: 'button' } });
        wrapButton.addEventListener('click', () => this.wrapSelectionInHole());
        setTooltip(wrapButton, tt('Wrap the selection in a mask for the chosen group'));

        const maskWholeButton = toolbar.createEl('button', { text: tt('Mask whole node'), attr: { type: 'button' } });
        maskWholeButton.addEventListener('click', () => {
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

        const syncStageButtons = (view: boolean): void => {
            this.revealButton?.toggleClass('fakecard-stage-hidden', !view);
            wrapButton.toggleClass('fakecard-stage-hidden', view);
            maskWholeButton.toggleClass('fakecard-stage-hidden', view);
        };
        this.stages = createStages({
            button: modeButton,
            edit: this.textarea,
            view: this.previewEl,
            doneLabel: tt('Preview'),
            editLabel: tt('Edit outline'),
            onShowView: () => {
                // The map is being shown fresh: centre it, do not inherit the
                // position the empty canvas had.
                this.recenter = true;
                syncStageButtons(true);
                this.drawPreview();
            },
            onShowEdit: () => {
                this.textarea.value = this.text;
                syncStageButtons(false);
                this.textarea.focus();
            },
        });

        modeButton.addEventListener('click', (event) => {
            event.preventDefault();
            if (this.stages.onView) {
                this.stages.showEdit();
                return;
            }
            if (!this.text.trim()) {
                new Notice(tt('The map is empty.'));
                return;
            }
            this.stages.showView();
        });

        if (this.text.trim()) this.stages.showView();
        else this.stages.showEdit();

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

        // Recording is file-level: it writes immediately, so Cancel cannot
        // lose a clip. Only an existing card has somewhere to write.
        if (this.card) this.audio = renderAudioEditor(this.plugin, contentEl, this.card);

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

        this.selectionDoc = activeDocument;
        this.selectionDoc.addEventListener('mouseup', this.onSelectionUp);
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
            // A group switch is a new question: centre that group's node instead
            // of keeping the view of the previous one.
            this.recenter = true;
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
        if (!this.stages.onView) return;
        const group = this.currentGroup;
        const root = parseOutline(this.text);
        // Every group is masked in the editor, so the whole map reads as it
        // will be asked; the current group keeps the blue accent and the
        // others are neutral, exactly like the cloze preview. Showing the
        // answer unmasks everything and paints the current group green.
        const maskGroups = this.showAnswers ? new Set<number>() : new Set(outlineGroups(root));
        // Name the node the group asks about, rather than relying on "the first
        // mask the renderer happens to meet": c2 must centre on c2's node.
        const question = findQuestionNode(root, group);
        // The first paint lands before the map is centred and measured; hiding
        // it until then is what stops the layout flashing on open.
        const first = !this.painted;
        if (first) this.previewEl.addClass('is-laying-out');
        const forceCenter = this.recenter;
        this.recenter = false;
        void renderMindmap(this.previewEl, root, {
            maskGroups,
            askedGroup: group,
            highlightGroups: this.showAnswers ? new Set([group]) : undefined,
            maskSubtree: this.plugin.settings.mapMaskSubtree,
            focusNodeId: question?.id,
            // The view belongs to the user from here on; only entering the map
            // stage, or picking another group, re-centres it.
            autoCenter: false,
            forceCenter,
            app: this.app,
            sourcePath: this.sourcePath,
            // No click-to-toggle here: a click must not repaint the map, or the
            // second half of a double-click lands on a new element and editing
            // never opens.
            onNodeFocus: (node, el) => {
                this.activeNode = node;
                this.activeEl = el;
            },
            onMaskClick: (node, hole) => this.editHoleHint(node, hole),
            onNodeEdit: (node, text) => this.applyNodeText(node, text),
        }).then(() => {
            if (!first) return;
            window.setTimeout(() => {
                this.previewEl.removeClass('is-laying-out');
                this.painted = true;
            }, 90);
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

    /**
     * The mask was just applied: drop the selection and the floating button.
     *
     * Without this the DOM selection survives the repaint long enough for the
     * document mouseup handler to run again, and the button reappears over the
     * node until something else is clicked.
     */
    private finishMasking(): void {
        this.suppressSelectionUntil = Date.now() + 500;
        window.getSelection()?.removeAllRanges();
        this.hideFloat();
    }

    private wrapSelectionInHole(): void {
        // A selection inside the map wins: that is where the text is read, and
        // pointing at the words you want asked is the whole point.
        if (this.activeNode && this.activeEl) {
            const range = this.selectionOffsets(this.activeEl);
            if (range) {
                this.wrapNodeRange(this.activeNode, range.from, range.to);
                this.finishMasking();
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
        this.finishMasking();
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
                const rangeTo = activeDocument.createRange();
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
            if (!await this.plugin.syncMapGroup(this.card, text)) return;
            // Deck and tags belong to the whole map: setting them on this card
            // alone left the other groups of the same map on the old values.
            if (!await this.plugin.applyMapMeta(this.card, this.deck, parseTags(this.tags))) return;
        } else {
            const cards = this.plugin.createMapCards(text, this.sourcePath, undefined, this.deck);
            const tags = parseTags(this.tags);
            const groupId = `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            let saved = 0;
            for (const card of cards) {
                card.mapGroupId = groupId;
                card.tags = tags;
                if (await this.plugin.store.save(card)) saved++;
            }
            if (saved === 0) return;
            new Notice(ttf('Saved {count} map card(s).', { count: saved }));
        }
        this.close();
        this.plugin.refreshStatusBar();
        this.onSaved?.();
    }

    /**
     * A small button that appears next to the selection inside a node: select
     * the words you want asked, click once, done. The toolbar button is still
     * there, but this is the gesture people actually reach for.
     */
    private onSelectionUp = (): void => {
        window.setTimeout(() => {
            if (Date.now() < this.suppressSelectionUntil) {
                this.hideFloat();
                return;
            }
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
        this.previewEl.ownerDocument.body.appendChild(button);
        this.floatEl = button;
    }

    private hideFloat(): void {
        this.floatEl?.remove();
        this.floatEl = null;
    }

    /**
     * Write the note that shows inside a mask.
     *
     * Clicking the mask is the shortest path from "this hole needs a reminder"
     * to the note that will be visible while it is hidden; the note is the
     * third part of the Anki token, so review shows it in the mask itself.
     */
    private editHoleHint(node: OutlineNode, hole: HTMLElement): void {
        if (node.endLine !== node.line) {
            new Notice(tt('Multi-line nodes cannot be masked as a whole yet.'));
            return;
        }
        const from = Number(hole.dataset.from ?? '-1');
        const to = Number(hole.dataset.to ?? '-1');
        if (from < 0 || to <= from) return;
        const lines = this.text.replace(/\r\n?/g, '\n').split('\n');
        const line = lines[node.line] ?? '';
        const marker = /^[\s]*(?:[-*+] |\d+[.)] |> ?|#{1,6} )/.exec(line)?.[0] ?? '';
        const raw = line.slice(marker.length);
        const token = raw.slice(from, to);
        openHintEditor(hole, holeHint(token) ?? '', (hint) => {
            const next = withHoleHint(token, hint);
            if (next === token) return;
            lines[node.line] = `${marker}${raw.slice(0, from)}${next}${raw.slice(to)}`;
            this.setText(lines.join('\n'), 0);
            this.finishMasking();
        }, () => {
            // The mask itself goes away, the words stay in the sentence.
            lines[node.line] = `${marker}${raw.slice(0, from)}${holeAnswer(token)}${raw.slice(to)}`;
            this.setText(lines.join('\n'), 0);
            this.finishMasking();
        });
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
        this.finishMasking();
    }

    onClose(): void {
        this.audio?.dispose();
        closeHintEditor();
        if (this.previewTimer !== null) window.clearTimeout(this.previewTimer);
        this.selectionDoc?.removeEventListener('mouseup', this.onSelectionUp);
        this.hideFloat();
        this.contentEl.empty();
    }
}
