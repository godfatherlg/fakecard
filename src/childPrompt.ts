import { App, Modal } from 'obsidian';
import { tt, ttf } from './i18n';

/**
 * Shown when the "child card" button is pressed before the card has failed
 * often enough to deserve one. The child flow is deliberate - it pauses the
 * parent - so an accidental click must not silently take a card out of the
 * queue: explain the trade-off, show how close the card is, and only start
 * the flow on an explicit Continue.
 */
export class ChildCardPromptModal extends Modal {
    constructor(
        app: App,
        private score: number,
        private target: number,
        private onConfirm: () => void,
        /**
         * How this card has actually gone: reviews and how many of them were
         * "mixed up" answers. A high share is the signal for a comparison card
         * rather than another cloze.
         */
        private stats: { reviews: number; mixed: number } | null = null,
    ) {
        super(app);
    }

    onOpen(): void {
        this.titleEl.setText(tt('Build a child card?'));

        const { contentEl } = this;
        contentEl.createEl('p', {
            text: tt('A child card pauses this card and replaces it while you study a simpler version you write yourself - a smaller question, a shorter cloze. When every child card graduates, this card comes back on its normal schedule.'),
        });
        contentEl.createEl('p', {
            text: tt('It is meant for cards that keep failing. This one has not reached the threshold yet, so the button is not highlighted.'),
        });
        contentEl.createEl('p', {
            cls: 'fakecard-child-prompt-score',
            text: ttf('Recent failing score: {score} / {target}', { score: this.score, target: this.target }),
        });
        if (this.stats && this.stats.reviews > 0) {
            const percent = Math.round((this.stats.mixed / this.stats.reviews) * 100);
            contentEl.createEl('p', {
                cls: 'fakecard-child-prompt-stats',
                text: ttf('{reviews} reviews, {mixed} of them mixed up ({percent}%)', {
                    reviews: this.stats.reviews,
                    mixed: this.stats.mixed,
                    percent,
                }),
            });
        }
        contentEl.createEl('p', {
            cls: 'fakecard-child-prompt-note',
            text: tt('Each Hard or Again raises the score, any Good or Easy resets it. You can lower the threshold in Settings.'),
        });

        const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
        buttons.createEl('button', { text: tt('Cancel') }).addEventListener('click', () => this.close());
        const confirm = buttons.createEl('button', { cls: 'mod-cta', text: tt('Continue') });
        confirm.addEventListener('click', () => {
            this.close();
            this.onConfirm();
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
