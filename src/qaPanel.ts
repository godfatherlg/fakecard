import { App, Modal, Notice, Setting } from 'obsidian';
import type { CardRecord } from './card';
import type FakeCardPlugin from '../main';
import { FieldPreview } from './fieldPreview';
import { HistoryStack } from './history';
import { tt } from './i18n';
import { autoSizeTextarea, bindAutoSize, parseTags } from './ui';

/**
 * Q&A editor: exactly the two fields that need editing.
 *
 * Both fields are textareas - there is no way to mount Obsidian's editor in a
 * modal - but each one renders what it holds underneath it, so bold text,
 * links and math are seen as the card will show them instead of as markup.
 */
export class QaPanelModal extends Modal {
    private frontEl!: HTMLTextAreaElement;
    private backEl!: HTMLTextAreaElement;
    private frontPreview!: FieldPreview;
    private backPreview!: FieldPreview;
    private history!: HistoryStack<{ front: string; back: string }>;
    private historyTimer: number | null = null;
    private deckEl!: HTMLSelectElement;
    private tagsEl!: HTMLInputElement;

    constructor(
        app: App,
        private plugin: FakeCardPlugin,
        private sourcePath: string,
        private card?: CardRecord,
        /**
         * Text to prefill the ANSWER with. A selection is usually the part the
         * user highlighted as important, so it becomes the answer and the
         * question is typed by hand.
         */
        initialAnswer?: string,
        private onSaved?: () => void,
        /** Prefill for the question (used when the selection starts with a heading). */
        initialFront?: string,
        /** When set, the new card becomes a child of this card id. */
        private childOf?: string,
    ) {
        super(app);
        this.initialFront = typeof initialFront === 'string' && initialFront.length > 0
            ? initialFront
            : (typeof card?.front === 'string' ? card.front : '');
        this.initialBack = typeof initialAnswer === 'string'
            ? initialAnswer
            : (typeof card?.back === 'string' ? card.back : '');
    }

    private initialFront: string;
    private initialBack: string;

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('h2', { text: this.card ? tt('Edit Q&A card') : tt('New Q&A card') });

        const frontHead = contentEl.createDiv({ cls: 'fakecard-field-head' });
        frontHead.createEl('label', { cls: 'fakecard-field-label', text: tt('Question') });
        this.addEditorButton(frontHead, 'front');

        this.frontEl = contentEl.createEl('textarea', { cls: 'fakecard-cloze-editor fakecard-autosize' });
        this.frontEl.rows = 1;
        this.frontEl.value = this.initialFront;
        bindAutoSize(this.frontEl);
        this.frontPreview = new FieldPreview(this.app, contentEl, this.sourcePath);

        const backHead = contentEl.createDiv({ cls: 'fakecard-field-head' });
        backHead.createEl('label', { cls: 'fakecard-field-label', text: tt('Answer') });
        this.addEditorButton(backHead, 'back');

        this.backEl = contentEl.createEl('textarea', { cls: 'fakecard-cloze-editor fakecard-autosize' });
        this.backEl.rows = 3;
        this.backEl.value = this.initialBack;
        bindAutoSize(this.backEl);
        this.backPreview = new FieldPreview(this.app, contentEl, this.sourcePath);

        contentEl.createEl('label', { cls: 'fakecard-field-label', text: tt('Deck') });
        this.deckEl = contentEl.createEl('select', { cls: 'dropdown' });
        void this.fillDeckOptions(this.card?.deck ?? this.plugin.settings.defaultDeck ?? 'default');

        contentEl.createEl('label', { cls: 'fakecard-field-label', text: tt('Tags') });
        this.tagsEl = contentEl.createEl('input', { cls: 'fakecard-tags-input' });
        this.tagsEl.type = 'text';
        this.tagsEl.placeholder = tt('tag1, tag2');
        this.tagsEl.value = (this.card?.tags ?? []).join(', ');

        this.history = new HistoryStack({ front: this.initialFront, back: this.initialBack });
        const onInput = (): void => {
            if (this.historyTimer !== null) window.clearTimeout(this.historyTimer);
            this.historyTimer = window.setTimeout(() => {
                this.historyTimer = null;
                this.history.push({ front: this.frontEl.value, back: this.backEl.value });
            }, 300);
        };
        this.frontEl.addEventListener('input', onInput);
        this.backEl.addEventListener('input', onInput);
        this.frontEl.addEventListener('input', () => this.frontPreview.queue(this.frontEl.value));
        this.backEl.addEventListener('input', () => this.backPreview.queue(this.backEl.value));
        this.frontPreview.show(this.frontEl.value);
        this.backPreview.show(this.backEl.value);

        this.contentEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
            event.preventDefault();
            const next = event.shiftKey ? this.history.redo() : this.history.undo();
            if (next === null) return;
            this.frontEl.value = next.front;
            this.backEl.value = next.back;
            autoSizeTextarea(this.frontEl);
            autoSizeTextarea(this.backEl);
            this.frontPreview.show(next.front);
            this.backPreview.show(next.back);
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
    }

    /**
     * Hand this field to a real Obsidian editor (see tempEdit.ts).
     *
     * Only for a card that already exists - a new one has nothing to sync back
     * to. The panel's text is saved first: the split takes over from here.
     */
    private addEditorButton(parent: HTMLElement, field: 'front' | 'back'): void {
        const card = this.card;
        if (!card) return;
        parent.createEl('button', { cls: 'fakecard-field-editor', text: tt('↗ Edit in editor') })
            .addEventListener('click', () => {
                card.front = this.frontEl.value.trim();
                card.back = this.backEl.value.trim();
                if (!card.front || !card.back) {
                    new Notice(tt('Both the question and the answer are required.'));
                    return;
                }
                card.deck = this.deckEl.value || card.deck;
                card.tags = parseTags(this.tagsEl.value);
                card.updated = new Date().toISOString();
                void this.plugin.store.save(card).then(() => {
                    this.close();
                    void this.plugin.tempEdit.open(card, field);
                });
            });
    }

    onClose(): void {
        this.frontPreview?.dispose();
        this.backPreview?.dispose();
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

    private async save(): Promise<void> {
        const front = this.frontEl.value.trim();
        const back = this.backEl.value.trim();
        const deck = this.deckEl.value || 'default';
        const tags = parseTags(this.tagsEl.value);
        if (!front || !back) {
            new Notice(tt('Both the question and the answer are required.'));
            return;
        }

        if (this.card) {
            this.card.front = front;
            this.card.back = back;
            this.card.deck = deck;
            this.card.tags = tags;
            this.card.updated = new Date().toISOString();
            await this.plugin.store.save(this.card);
        } else {
            const card = this.plugin.createQaCard(front, back, this.sourcePath, deck);
            card.tags = tags;
            if (this.childOf) card.childOf = this.childOf;
            await this.plugin.store.save(card);
        }
        new Notice(tt('Card saved.'));
        this.close();
        this.onSaved?.();
    }
}
