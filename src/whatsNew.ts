import { App, Modal, Setting } from 'obsidian';
import { isChinese, t } from './i18n';

/**
 * What changed in the release the user just updated to.
 *
 * The notes live IN the plugin rather than being fetched from GitHub: no
 * network request is needed and it works offline. Only the CURRENT release is
 * listed - the dialog is shown once, right after an update, so notes for older
 * versions would never be read.
 *
 * Update WHATS_NEW_VERSION and WHATS_NEW together when cutting a release; the
 * text mirrors RELEASE_NOTES.md.
 */
export const WHATS_NEW_VERSION = '1.0.50';

/**
 * English and Chinese side by side in one entry, so a translation cannot be
 * forgotten when a line is added.
 */
interface WhatsNewEntry {
    en: string;
    zh: string;
}

const WHATS_NEW: WhatsNewEntry[] = [
    {
        en: 'Browse is a real virtual list now: only the rows around the viewport are built, row heights are measured, the header stays put, and selecting a row keeps your scroll position. The Show more button is gone.',
        zh: '浏览页改成真正的虚拟列表：只渲染视口附近的行、按内容测量行高、表头固定，选中一行不再跳回顶部；「再显示」按钮已移除。',
    },
    {
        en: 'Q&A and cloze cards are edited in their own panels from Browse and Review, like maps and images. Masks, notes and the card text stay visible while editing.',
        zh: '问答卡和填空卡在浏览页、复习界面都改为打开各自的面板编辑，和导图/图片一致；编辑时能直接看到挖空和注释。',
    },
    {
        en: 'Map repaints reuse rendered node text, so editing one line no longer sends every node through the Markdown renderer again.',
        zh: '导图重绘会复用已渲染的节点文本，改一行不再让所有节点重新走一遍 Markdown 渲染。',
    },
];

export class WhatsNewModal extends Modal {
    constructor(app: App, private readonly version: string) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('fakecard-whats-new');
        contentEl.createEl('h2', { text: `${t('whatsNew.title')} · ${this.version}` });

        const chinese = isChinese();
        const list = contentEl.createEl('ul');
        list.addClass('fakecard-whats-new-list');
        for (const entry of WHATS_NEW) {
            list.createEl('li', { text: chinese ? entry.zh : entry.en });
        }

        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(t('whatsNew.notes'))
                .onClick(() => {
                    window.open(
                        `https://github.com/godfatherlg/fakecard/releases/tag/${this.version}`,
                        '_blank',
                    );
                }))
            .addButton((button) => button
                .setButtonText(t('whatsNew.close'))
                .setCta()
                .onClick(() => this.close()));
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
