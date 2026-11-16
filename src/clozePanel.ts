import { App, Modal, Notice, Setting } from 'obsidian';
import type { CardRecord } from './card';
import type FakeCardPlugin from '../main';
import { clozeGroups, renderClozeHtml, unwrapSelection, wrapBlockLines, wrapSelection } from './cloze';
import { FieldPreview } from './fieldPreview';
import { HistoryStack } from './history';
import { tt } from './i18n';
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
            text: tt('Anki cloze format: {{c1::answer}} hides "answer" in group 1. Append ::note to show a note while hidden, e.g. {{c1::answer::dose}}. Select text and press "Wrap" to create a hole; use "New group" to create c2, c3 ...'),
        });

        this.textarea = contentEl.createEl('textarea', { cls: 'fakecard-cloze-editor fakecard-autosize' });
        this.textarea.value = this.text;
        this.textarea.rows = 3;
        // Nothing is hidden in the preview: every hole is marked where it is, so
        // the editor shows what is asked and what the answer is, not just braces.
        this.preview = new FieldPreview(
            this.app,
            contentEl,
            this.sourcePath,
            (text) => renderClozeHtml(text, new Set<number>()),
        );
        this.preview.show(this.text);
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

    onClose(): void {
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
        const parsed = Number.parseInt(this.groupSelect.value, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }

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
            new Notice(tt('No hole found - wrap some text in {{c1::...}} first.'));
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
