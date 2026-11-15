import { App, Modal } from 'obsidian';
import { tt } from './i18n';

/** Small confirmation dialog for destructive actions. */
export class ConfirmDialog extends Modal {
    constructor(
        app: App,
        private message: string,
        private confirmText: string,
        private onConfirm: () => void | Promise<void>,
    ) {
        super(app);
    }

    onOpen(): void {
        this.contentEl.empty();
        this.contentEl.createEl('p', { text: this.message });

        const buttons = this.contentEl.createDiv({ cls: 'fakecard-dialog-buttons' });

        buttons.createEl('button', { text: tt('Cancel') })
            .addEventListener('click', () => this.close());

        buttons.createEl('button', { text: tt(this.confirmText), cls: 'mod-warning' })
            .addEventListener('click', () => {
                void this.onConfirm();
                this.close();
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
