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
export const WHATS_NEW_VERSION = '1.0.22';

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
        en: 'Pictures zoom in place everywhere - Ctrl+wheel in review, in the browse preview, and on pictures embedded in a cloze or Q&A card; double-click fits again. The click-to-enlarge dialog is gone: it only got in the way.',
        zh: '图片现在到处都能就地缩放：复习界面、浏览右栏、以及填空/问答卡正文里的图片，Ctrl+滚轮即可，双击还原。单击弹出大图的那个窗口删掉了，它只会碍事。',
    },
    {
        en: 'An occlusion card remembers the size you read it at, and card pictures are height-capped so a long screenshot no longer pushes the answer off the screen.',
        zh: '图片遮挡卡会记住你读到的大小；卡片里的图片也限了高，长截图不再把答案挤出屏幕。',
    },
    {
        en: 'The answer-time chip sits after the card counter: elapsed on the left, the suggested time beside it, a reset on the right. Orange past 1x, red past 1.5x, frozen at 2x - and it leaves the screen once the answer is up.',
        zh: '答题计时胶囊放在张数之后：左边是已用时间，中间是建议用时，右边可重置；超过 1 倍变橙、1.5 倍变红、2 倍定格，翻到答案后不再显示。',
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
