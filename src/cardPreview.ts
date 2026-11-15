import { Component, MarkdownRenderer, Modal } from 'obsidian';
import type { CardRecord } from './card';
import { clozeGroups, renderClozeHtml } from './cloze';
import { tt, ttf } from './i18n';
import { jumpToCardSource } from './sourceJump';

/**
 * Full card preview - the same flow as the review view:
 * front first, "Show answer" reveals the back. Read-only.
 *
 * Image cards render the picture with the first mask group hidden, exactly
 * like the review view, so Preview and Review never diverge.
 */
export class CardPreviewDialog extends Modal {
    private component = new Component();
    private revealed = false;

    constructor(
        app: import('obsidian').App,
        private card: CardRecord,
        private maskAllGroups = true,
    ) {
        super(app);
        this.component.load();
    }

    onOpen(): void {
        this.render();
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('fakecard-card-preview');

        contentEl.createEl('h2', { text: tt('Card preview') });

        const frontEl = contentEl.createDiv({ cls: 'fakecard-card-preview-front' });

        if (!this.revealed) {
            this.renderSide(frontEl, false);
            const button = contentEl.createEl('button', {
                cls: 'fakecard-card-preview-show',
                text: tt('Show answer'),
            });
            button.addEventListener('click', () => {
                this.revealed = true;
                this.render();
            });
            return;
        }

        if (this.card.type === 'qa') {
            // Q&A keeps both sides.
            this.renderSide(frontEl, false);
            contentEl.createEl('hr');
            const backEl = contentEl.createDiv({ cls: 'fakecard-card-preview-back' });
            this.renderSide(backEl, true);
        } else {
            // Cloze and image reveal in place - no separate answer side.
            this.renderSide(frontEl, true);
        }

        if (this.card.source.path) {
            const row = contentEl.createDiv({ cls: 'fakecard-source-row' });
            row.createSpan({
                cls: 'fakecard-preview-label',
                text: ttf('Source: {path}', { path: this.card.source.path }),
            });
            row.createEl('button', { text: tt('↗ Open at source') })
                .addEventListener('click', () => {
                    void jumpToCardSource(this.app, this.card);
                });
        }
    }

    private renderSide(el: HTMLElement, revealed: boolean): void {
        if (this.card.type === 'image' && this.card.image) {
            this.renderImage(el, revealed);
            return;
        }
        void MarkdownRenderer.render(
            this.app,
            revealed ? this.backText() : this.frontText(),
            el,
            this.card.source.path,
            this.component,
        );
    }

    private renderImage(el: HTMLElement, revealed: boolean): void {
        const image = this.card.image;
        if (!image) return;

        const wrap = el.createDiv({ cls: 'fakecard-image-wrap' });
        const img = wrap.createEl('img', { cls: 'fakecard-image' });
        img.src = this.app.vault.adapter.getResourcePath(image.path);

        if (revealed || image.groups.length === 0) return;

        const firstId = image.groups[0].id;
        const overlay = wrap.createDiv({ cls: 'fakecard-image-overlay is-static' });
        for (const group of image.groups) {
            const isAsked = group.id === firstId;
            if (!isAsked && !this.maskAllGroups) continue;
            for (const mask of group.masks) {
                const maskEl = overlay.createDiv({
                    cls: `fakecard-image-mask${isAsked ? ' is-current' : ''}${mask.shape === 'ellipse' ? ' is-ellipse' : ''}`,
                });
                maskEl.style.left = `${mask.x * 100}%`;
                maskEl.style.top = `${mask.y * 100}%`;
                maskEl.style.width = `${mask.w * 100}%`;
                maskEl.style.height = `${mask.h * 100}%`;
            }
        }
    }

    private frontText(): string {
        if (this.card.type === 'cloze' && this.card.clozeText) {
            if (this.card.clozeGroup !== undefined) {
                return renderClozeHtml(
                    this.card.clozeText,
                    this.maskAllGroups ? 'all' : new Set([this.card.clozeGroup]),
                    this.card.clozeGroup,
                );
            }
            const groups = clozeGroups(this.card.clozeText);
            return renderClozeHtml(
                this.card.clozeText,
                groups.length > 0 ? new Set([groups[0]]) : 'all',
                groups[0],
            );
        }
        return this.card.front;
    }

    private backText(): string {
        if (this.card.type === 'cloze' && this.card.clozeText) {
            return renderClozeHtml(this.card.clozeText, new Set<number>());
        }
        return this.card.back;
    }

    onClose(): void {
        this.component.unload();
        this.contentEl.empty();
    }
}
