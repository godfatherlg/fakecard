import { App, Modal, Notice, setTooltip, Setting } from 'obsidian';
import type { CardRecord } from './card';
import type FakeCardPlugin from '../main';
import { clozeGroups, holeAnswer, holeHint, renderClozeHtml, unwrapSelection, withHoleHint, wrapBlockLines, wrapSelection } from './cloze';
import { closeHintEditor, openHintEditor } from './hintEditor';
import { FieldPreview } from './fieldPreview';
import { HistoryStack } from './history';
import { tt, ttf } from './i18n';
import { clozeVisibleMap, plainOf, wrapSelectionLines } from './inlineMd';
import { addFillScreenButton } from './panelFill';
import { createStages, type StageSwitch } from './panelStages';
import { autoSizeTextarea, bindAutoSize, parseTags } from './ui';

/**
 * Manual cloze editor.
 *
 * Only the fields that need editing: the cloze body in Anki's format
 * ({{c1::...}}, {{c1::...::hint}}) plus the group selector and the wrap /
 * unwrap buttons. Under the body sits its rendering, with every hole shown as
 * the highlight review will hide, so the markup being typed has a visible
 * meaning.
 */
export class ClozePanelModal extends Modal {
    private textarea!: HTMLTextAreaElement;
    private preview!: FieldPreview;
    private groupSelect!: HTMLSelectElement;
    private text: string;
    private history!: HistoryStack<string>;
    private historyTimer: number | null = null;
    private deckEl!: HTMLSelectElement;
    private tagsEl!: HTMLInputElement;
    /** Preview side: show the words the masks are hiding. */
    private showAnswers = false;

    constructor(
        app: App,
        private plugin: FakeCardPlugin,
        private sourcePath: string,
        private card?: CardRecord,
        initialText?: string,
        private onSaved?: () => void,
        /** When set, new cards become children of this card id. */
        private childOf?: string,
    ) {
        super(app);
        // Never let a non-string slip into the textarea (a selection object
        // used to show up as "[object Object]").
        this.text = typeof initialText === 'string'
            ? initialText
            : (typeof card?.clozeText === 'string' ? card.clozeText : '');
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.card ? tt('Edit cloze card') : tt('New cloze card') });

        contentEl.createEl('p', {
            cls: 'fakecard-help',
            text: tt('Anki cloze format: {{c1::answer}} hides "answer" in group 1. Append ::note to show a note while hidden, e.g. {{c1::answer::dose}}. Select text and press "Wrap" to create a mask; use "New group" to create c2, c3 ...'),
        });

        // One area, two stages: the source while typing, the rendered card once
        // "Done" is pressed. Same height for both, so switching cannot jump.
        const body = contentEl.createDiv({ cls: 'fakecard-panel-body' });
        const editStage = body.createDiv({ cls: 'fakecard-panel-stage' });
        const previewStage = body.createDiv({ cls: 'fakecard-panel-stage is-hidden' });
        this.textarea = editStage.createEl('textarea', { cls: 'fakecard-cloze-editor fakecard-autosize' });
        this.textarea.value = this.text;
        this.textarea.rows = 3;
        // The current group is hidden, so the preview shows the card as it will
        // be asked; the other groups stay visible so the whole text is readable.
        // A mask can be clicked to write the note it shows while hidden.
        this.preview = new FieldPreview(
            this.app,
            previewStage,
            this.sourcePath,
            (text) => {
                const group = this.currentGroup();
                if (this.showAnswers) return renderClozeHtml(text, new Set<number>());
                // Every group is masked; the selected one keeps the accent,
                // the others are neutral - the same picture review gives.
                return renderClozeHtml(text, 'all', group);
            },
        );
        this.preview.show(this.text);
        // A plain click on a mask opens its note; a drag across one is a
        // selection (handled by the mouseup path above) and is left alone.
        previewStage.addEventListener('click', this.onHoleClick);
        this.history = new HistoryStack(this.text);
        this.textarea.addEventListener('input', () => {
            this.text = this.textarea.value;
            this.preview.queue(this.text);
            // Coalesce typing into one snapshot after a short pause.
            if (this.historyTimer !== null) window.clearTimeout(this.historyTimer);
            this.historyTimer = window.setTimeout(() => {
                this.historyTimer = null;
                this.history.push(this.text);
            }, 300);
        });
        bindAutoSize(this.textarea);

        // Ctrl/Cmd+Z undoes the whole panel state (text + groups), Shift+Z redoes.
        this.contentEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
            event.preventDefault();
            const next = event.shiftKey ? this.history.redo() : this.history.undo();
            if (next === null) return;
            this.text = next;
            this.textarea.value = next;
            this.rebuildGroupOptions();
            autoSizeTextarea(this.textarea);
            this.preview.show(next);
        });

        const toolbar = contentEl.createDiv({ cls: 'fakecard-toolbar' });

        this.groupSelect = toolbar.createEl('select', { cls: 'dropdown' });
        this.rebuildGroupOptions();
        // The preview hides the selected group, so switching it changes what
        // is masked - and therefore which note belongs to the hole on screen.
        this.groupSelect.addEventListener('change', () => this.preview.show(this.text));

        // The same box, two stages: editing, then the rendered card.
        const modeButton = toolbar.createEl('button', { cls: 'mod-cta', text: tt('Done'), attr: { type: 'button' } });
        addFillScreenButton(this, toolbar);
        this.stages = createStages({
            button: modeButton,
            edit: editStage,
            view: previewStage,
            onShowView: () => {
                this.preview.show(this.textarea.value);
                window.setTimeout(() => this.dimGroups(), 60);
            },
            onShowEdit: () => this.textarea.focus(),
        });
        modeButton.addEventListener('click', () => {
            if (this.stages.onView) this.stages.showEdit();
            else this.stages.showView();
        });

        // Selecting words in the rendered card wraps them, the same gesture as
        // on a mind map. The selection is found in the source by its text: the
        // preview has no offsets of its own.
        const onSelectionUp = (): void => {
            window.setTimeout(() => {
                this.hideFloat();
                if (!this.stages.onView) return;
                const selection = window.getSelection();
                if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
                const range = selection.getRangeAt(0);
                if (!previewStage.contains(range.commonAncestorContainer)) return;
                const content = this.preview.content;
                if (!content.contains(range.commonAncestorContainer)) return;

                // Selecting inside an existing hole is how you take it away.
                const hole = (range.startContainer.parentElement ?? null)
                    ?.closest<HTMLElement>('[data-cloze-group]') ?? null;
                if (hole && content.contains(hole)) {
                    this.showFloat(range.getBoundingClientRect(), 0, 0, undefined, hole);
                    return;
                }

                // Count visible characters up to the selection, then read their
                // raw offsets off the map: the preview has dropped both the
                // `{{c1::}}` markers and the `**` ones.
                const pre = activeDocument.createRange();
                pre.selectNodeContents(content);
                pre.setEnd(range.startContainer, range.startOffset);
                const start = pre.toString().length;
                const length = range.toString().length;
                if (length === 0) return;
                if (!selection.toString().trim()) return;

                const { visible, map } = clozeVisibleMap(this.text);
                if (map.length === 0) return;

                // Counting characters can still be off by one wherever the
                // renderer and the source disagree about a character. The
                // selected text itself is a far stronger hint: if it occurs in
                // the visible text, prefer the occurrence nearest the count.
                const picked = selection.toString();
                let at = start;
                const first = visible.indexOf(picked);
                if (first >= 0) {
                    const last = visible.lastIndexOf(picked);
                    at = first === last || Math.abs(first - start) <= Math.abs(last - start)
                        ? first
                        : last;
                }

                const from = map[Math.min(at, map.length - 1)];
                const to = map[Math.min(at + length - 1, map.length - 1)] + 1;
                if (to <= from) return;

                // Several lines: match the first and last selected lines by text
                // and wrap every line between them, which is how a block wrap has
                // always worked here.
                const pickedLines = picked.trim().split('\n').map((line) => line.trim()).filter(Boolean);
                const lines = pickedLines.length > 1 ? this.findLineRange(pickedLines) : null;
                this.showFloat(range.getBoundingClientRect(), from, to, lines ?? undefined);
            }, 0);
        };
        this.selectionDoc = activeDocument;
        this.selectionDoc.addEventListener('mouseup', onSelectionUp);
        this.selectionHandler = onSelectionUp;

        toolbar.createEl('button', { text: tt('New group') })
            .addEventListener('click', () => {
                // The next group is the first one after the last group that
                // actually has holes. Empty groups created earlier are reused,
                // so no empty numbers pile up (c1 filled -> c2, c2 still empty
                // -> stays c2, c2 filled -> c3).
                const groups = clozeGroups(this.textarea.value);
                const next = Math.max(0, ...groups) + 1;
                this.rebuildGroupOptions(next);
                this.groupSelect.value = String(next);
            });

        toolbar.createEl('button', { text: tt('Wrap selection') })
            .addEventListener('click', () => this.wrapSelection());

        toolbar.createEl('button', { text: tt('Remove cloze') })
            .addEventListener('click', () => this.removeCloze());

        // Same switch as the mind map panel: write the card from both sides.
        const reveal = toolbar.createEl('button', { text: tt('Show answer'), attr: { type: 'button' } });
        setTooltip(reveal, tt('Show the masked text in the preview'));
        reveal.addEventListener('click', () => {
            this.showAnswers = !this.showAnswers;
            reveal.setText(this.showAnswers ? tt('Hide answer') : tt('Show answer'));
            this.preview.show(this.text);
        });

        if (this.card) {
            toolbar.createEl('button', { text: tt('↗ Edit in editor') })
                .addEventListener('click', () => {
                    void this.openInEditor();
                });
        }

        contentEl.createEl('label', { cls: 'fakecard-field-label', text: tt('Deck') });
        this.deckEl = contentEl.createEl('select', { cls: 'dropdown' });
        void this.fillDeckOptions(this.card?.deck ?? this.plugin.settings.defaultDeck ?? 'default');

        contentEl.createEl('label', { cls: 'fakecard-field-label', text: tt('Tags') });
        this.tagsEl = contentEl.createEl('input', { cls: 'fakecard-tags-input' });
        this.tagsEl.type = 'text';
        this.tagsEl.placeholder = tt('tag1, tag2');
        this.tagsEl.value = (this.card?.tags ?? []).join(', ');

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

    /**
     * Continue the body in a real editor split (see tempEdit.ts): Obsidian's own
     * live preview, which a modal cannot host. Saved first, so nothing typed
     * here is lost when the panel closes.
     */
    private async openInEditor(): Promise<void> {
        const card = this.card;
        if (!card) return;
        const text = this.textarea.value.trim();
        if (!text) {
            new Notice(tt('The card body is empty.'));
            return;
        }
        card.deck = this.deckEl.value || card.deck;
        card.tags = parseTags(this.tagsEl.value);
        await this.plugin.syncClozeGroup(card, text);
        await this.plugin.store.save(card);
        this.close();
        await this.plugin.tempEdit.open(card, 'clozeText');
    }

    /** Floating "wrap this selection" button, mirroring the mind map's. */
    private floatEl: HTMLElement | null = null;
    /** The editor/render switch shared with the other new-card panels. */
    private stages!: StageSwitch;
    private selectionHandler: (() => void) | null = null;
    /** The document the mouseup listener was added to. */
    private selectionDoc: Document | null = null;

    private showFloat(
        box: DOMRect,
        from: number,
        to: number,
        lines?: { start: number; end: number },
        hole?: HTMLElement | null,
    ): void {
        this.hideFloat();
        const button = createEl('button', {
            cls: 'fakecard-map-float',
            text: hole ? tt('Remove mask') : ttf('Mask c{group}', { group: this.groupSelect.value }),
            attr: { type: 'button' },
        });
        button.setCssStyles({
            left: `${Math.round(box.left + box.width / 2 - 40)}px`,
            top: `${Math.round(box.bottom + 6)}px`,
        });
        button.addEventListener('mousedown', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const group = Number.parseInt(this.groupSelect.value, 10) || 1;
            this.text = hole
                ? this.removeHole(hole)
                : lines
                    ? this.wrapWholeLines(lines.start, lines.end, group)
                    : wrapSelectionLines(this.text, from, to, group);
            this.textarea.value = this.text;
            this.history.push(this.text);
            this.rebuildGroupOptions();
            autoSizeTextarea(this.textarea);
            this.preview.show(this.text);
            window.setTimeout(() => this.dimGroups(), 60);
            this.hideFloat();
        });
        this.preview.content.ownerDocument.body.appendChild(button);
        this.floatEl = button;
    }

    /** Dim every hole that is not the group being edited. */
    private dimGroups(): void {
        const group = Number.parseInt(this.groupSelect.value, 10) || 1;
        const holes = this.preview.content.querySelectorAll<HTMLElement>('[data-cloze-group]');
        for (let index = 0; index < holes.length; index++) {
            const hole = holes[index];
            hole.toggleClass('is-dim', Number(hole.dataset.clozeGroup) !== group);
        }
    }

    /** Drop one hole, keeping its text: the raw offsets come from the span. */
    private removeHole(hole: HTMLElement): string {
        const from = Number(hole.dataset.from ?? '-1');
        const to = Number(hole.dataset.to ?? '-1');
        if (from < 0 || to <= from) return this.text;
        return `${this.text.slice(0, from)}${hole.textContent ?? ''}${this.text.slice(to)}`;
    }

    /** Wrap every line a multi-line selection touches, one hole per line. */
    private wrapWholeLines(start: number, end: number, group: number): string {
        const lines = this.text.split('\n');
        for (let index = start; index <= end && index < lines.length; index++) {
            const line = lines[index];
            if (!line.trim() || /\{\{c\d+::/.test(line)) continue;
            const marker = /^[\s]*(?:[-*+] |\d+[.)] |> ?|#{1,6} )/.exec(line)?.[0] ?? '';
            const body = plainOf(line.slice(marker.length)).plain.trim();
            if (body) lines[index] = `${marker}{{c${group}::${body}}}`;
        }
        return lines.join('\n');
    }

    /**
     * Source line range of a selection that covers several lines.
     *
     * Character offsets are fragile once a preview line differs from its source
     * line by a list marker; the first and last selected lines are compared as
     * text instead, which is what people see.
     */
    private findLineRange(picked: string[]): { start: number; end: number } | null {
        const lines = this.text.split('\n');
        const plain = (line: string): string => plainOf(
            line.replace(/^\s*(?:[-*+] |\d+[.)] |> ?|#{1,6} )/, ''),
        ).plain.trim();
        const first = picked[0].slice(0, 12);
        const last = picked[picked.length - 1].slice(0, 12);
        const start = lines.findIndex((line) => plain(line).startsWith(first));
        if (start < 0) return null;
        let end = start;
        for (let index = start; index < lines.length; index++) {
            if (plain(lines[index]).startsWith(last)) {
                end = index;
                break;
            }
        }
        return { start, end };
    }

    private hideFloat(): void {
        this.floatEl?.remove();
        this.floatEl = null;
    }

    onClose(): void {
        closeHintEditor();
        if (this.selectionHandler) this.selectionDoc?.removeEventListener('mouseup', this.selectionHandler);
        this.hideFloat();
        this.preview?.dispose();
        if (this.historyTimer !== null) window.clearTimeout(this.historyTimer);
        this.contentEl.empty();
    }

    private async fillDeckOptions(selected: string): Promise<void> {
        const decks = await this.plugin.store.loadDecks();
        this.deckEl.empty();
        for (const deck of decks) {
            const option = this.deckEl.createEl('option');
            option.value = deck;
            option.textContent = deck;
        }
        this.deckEl.value = decks.includes(selected) ? selected : (decks[0] ?? 'default');
    }

    private rebuildGroupOptions(select?: number): void {
        const groups = clozeGroups(this.textarea?.value ?? this.text);
        // Only the groups that actually exist (plus the one being selected);
        // "New group" is the only way to add more.
        const max = Math.max(1, ...groups, select ?? 0);
        this.groupSelect.empty();
        for (let group = 1; group <= max; group++) {
            // textContent rather than the createEl text option: on <option>
            // the latter could render as [object Object] in some versions.
            const option = this.groupSelect.createEl('option');
            option.value = String(group);
            option.textContent = `c${group}`;
        }
        this.groupSelect.value = String(select ?? 1);
    }

    private currentGroup(): number {
        // Called once while the preview is built, before the select exists.
        const parsed = Number.parseInt(this.groupSelect?.value ?? '1', 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }

    /** Clicking a mask writes the note it will show while hidden. */
    private onHoleClick = (event: MouseEvent): void => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const hole = target.closest<HTMLElement>('.fakecard-cloze-mask');
        if (!hole) return;
        // A drag selection also ends in a click; only a plain click annotates.
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;

        const from = Number(hole.dataset.from ?? '-1');
        const to = Number(hole.dataset.to ?? '-1');
        if (from < 0 || to <= from) return;
        const token = this.text.slice(from, to);
        openHintEditor(hole, holeHint(token) ?? '', (hint) => {
            const next = withHoleHint(token, hint);
            if (next === token) return;
            this.text = this.text.slice(0, from) + next + this.text.slice(to);
            this.textarea.value = this.text;
            this.preview.show(this.text);
            this.history.push(this.text);
        }, () => {
            // Removing the hole keeps the answer words in the text.
            this.text = this.text.slice(0, from) + holeAnswer(token) + this.text.slice(to);
            this.textarea.value = this.text;
            this.rebuildGroupOptions();
            this.preview.show(this.text);
            this.history.push(this.text);
        });
    };

    private wrapSelection(): void {
        const from = this.textarea.selectionStart;
        const to = this.textarea.selectionEnd;
        if (from === to) {
            new Notice(tt('Select some text first.'));
            return;
        }
        const group = this.currentGroup();
        const value = this.textarea.value;
        let next: string;
        let caret: number;
        if (value.slice(from, to).includes('\n')) {
            // One hole per line: a single hole around a list would swallow the
            // markers and the list would stop rendering as one.
            const block = wrapBlockLines(value, from, to, group);
            next = value.slice(0, block.from) + block.text + value.slice(block.to);
            caret = block.from + block.text.length;
        } else {
            const result = wrapSelection(value, from, to, group);
            next = result.text;
            caret = result.caret;
        }
        this.textarea.value = next;
        this.text = next;
        this.textarea.setSelectionRange(caret, caret);
        // Stay on the group the user picked instead of jumping back to c1.
        this.rebuildGroupOptions(group);
        this.preview.show(this.text);
        this.history.push(this.text);
    }

    private removeCloze(): void {
        const from = this.textarea.selectionStart;
        const to = this.textarea.selectionEnd;
        const group = this.currentGroup();
        const result = unwrapSelection(this.textarea.value, from, to);
        this.textarea.value = result.text;
        this.text = result.text;
        this.textarea.setSelectionRange(result.caret, result.caret);
        this.rebuildGroupOptions(group);
        this.preview.show(this.text);
        this.history.push(this.text);
    }

    private async save(): Promise<void> {
        const text = this.textarea.value.trim();
        if (!text) {
            new Notice(tt('The card body is empty.'));
            return;
        }
        if (clozeGroups(text).length === 0) {
            new Notice(tt('No mask found - wrap some text in {{c1::...}} first.'));
            return;
        }

        const deck = this.deckEl.value || 'default';
        const tags = parseTags(this.tagsEl.value);

        if (this.card) {
            // Update every card that belongs to this cloze group (each group
            // is its own card with its own schedule).
            await this.plugin.syncClozeGroup(this.card, text);
            this.card.deck = deck;
            this.card.tags = tags;
            await this.plugin.store.save(this.card);
        } else {
            const cards = this.plugin.createClozeCards(text, this.sourcePath, undefined, deck);
            for (const card of cards) {
                card.tags = tags;
                if (this.childOf) card.childOf = this.childOf;
                await this.plugin.store.save(card);
            }
        }
        new Notice(tt('Card saved.'));
        this.close();
        this.onSaved?.();
    }
}
