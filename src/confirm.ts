import { App, Modal } from 'obsidian';

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

        buttons.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => this.close());

        buttons.createEl('button', { text: this.confirmText, cls: 'mod-warning' })
            .addEventListener('click', () => {
                void this.onConfirm();
                this.close();
            });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
