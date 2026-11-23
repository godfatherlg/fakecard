import { App, Component, MarkdownRenderer, Modal, Notice, Setting } from 'obsidian';
import type { CardRecord } from './card';
import type FakeCardPlugin from '../main';
import { HistoryStack } from './history';
import { addFillScreenButton } from './panelFill';
import { createStages, type StageSwitch } from './panelStages';
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
    private frontOut!: HTMLElement;
    private backOut!: HTMLElement;
    /** Owns the rendered markdown, so it can be unloaded on repaint and close. */
    private mdComponent: Component | null = null;
    /** The editor/render switch shared with the other new-card panels. */
    private stages!: StageSwitch;
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

        // Two stages in one box: the fields while writing, the rendered card
        // afterwards. The box keeps its size, so "Done" cannot make it jump.
        const toolbar = contentEl.createDiv({ cls: 'fakecard-toolbar' });
        const modeButton = toolbar.createEl('button', { cls: 'mod-cta', text: tt('Done'), attr: { type: 'button' } });
        addFillScreenButton(this, toolbar);

        const body = contentEl.createDiv({ cls: 'fakecard-panel-body' });
        const editStage = body.createDiv({ cls: 'fakecard-panel-stage' });
        const previewStage = body.createDiv({ cls: 'fakecard-panel-stage is-hidden' });

        const frontHead = editStage.createDiv({ cls: 'fakecard-field-head' });
        frontHead.createEl('label', { cls: 'fakecard-field-label', text: tt('Question') });
        this.addEditorButton(frontHead, 'front');

        this.frontEl = editStage.createEl('textarea', {
            cls: 'fakecard-cloze-editor fakecard-autosize fakecard-qa-field',
        });
        this.frontEl.rows = 1;
        this.frontEl.value = this.initialFront;
        bindAutoSize(this.frontEl);
        // No captions: the card reads like it does in review, question then a
        // divider then the answer.
        // Rendered straight into a plain container: the field preview's own
        // show/hide rules are for the inline block under a textarea, and inside
        // a fixed stage they made the question disappear.
        this.frontOut = previewStage.createDiv({ cls: 'fakecard-md-render' });

        const backHead = editStage.createDiv({ cls: 'fakecard-field-head' });
        backHead.createEl('label', { cls: 'fakecard-field-label', text: tt('Answer') });
        this.addEditorButton(backHead, 'back');

        this.backEl = editStage.createEl('textarea', {
            cls: 'fakecard-cloze-editor fakecard-autosize fakecard-qa-field',
        });
        this.backEl.rows = 3;
        this.backEl.value = this.initialBack;
        bindAutoSize(this.backEl);
        this.backOut = previewStage.createDiv({ cls: 'fakecard-md-render fakecard-md-answer' });

        this.stages = createStages({
            button: modeButton,
            edit: editStage,
            view: previewStage,
            onShowView: () => {
                void this.renderStage();
            },
            onShowEdit: () => this.frontEl.focus(),
        });
        modeButton.addEventListener('click', () => {
            if (this.stages.onView) this.stages.showEdit();
            else this.stages.showView();
        });

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
        this.frontEl.addEventListener('input', () => {
            if (this.stages.onView) void this.renderStage();
        });
        this.backEl.addEventListener('input', () => {
            if (this.stages.onView) void this.renderStage();
        });

        this.contentEl.addEventListener('keydown', (event: KeyboardEvent) => {
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
            event.preventDefault();
            const next = event.shiftKey ? this.history.redo() : this.history.undo();
            if (next === null) return;
            this.frontEl.value = next.front;
            this.backEl.value = next.back;
            autoSizeTextarea(this.frontEl);
            autoSizeTextarea(this.backEl);
            if (this.stages.onView) void this.renderStage();
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

    /**
     * Draw the card the way review will: question, then answer.
     *
     * The component that owns the rendered children lives on the panel: it is
     * unloaded before every repaint and once more on close, so embedded notes
     * and their listeners are released instead of piling up.
     */
    private async renderStage(): Promise<void> {
        const front = this.frontEl.value.trim() || tt('(empty)');
        const back = this.backEl.value.trim() || tt('(empty)');
        this.mdComponent?.unload();
        this.mdComponent = new Component();
        this.frontOut.empty();
        this.backOut.empty();
        await MarkdownRenderer.render(this.app, front, this.frontOut, this.sourcePath, this.mdComponent);
        await MarkdownRenderer.render(this.app, back, this.backOut, this.sourcePath, this.mdComponent);
    }

    onClose(): void {
        this.mdComponent?.unload();
        this.mdComponent = null;
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
