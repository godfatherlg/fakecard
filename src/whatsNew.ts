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
export const WHATS_NEW_VERSION = '1.0.47';

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
        en: 'The browse table keeps a minimum width and scrolls sideways in a narrow pane, so columns no longer squeeze text into one character per line.',
        zh: '浏览页表格设了最小宽度，窗口变窄时改为横向滚动，列不再把文字挤成一字一行。',
    },
    {
        en: 'New is:buried search term, and the status-bar labels are translated (Due / New / Learning).',
        zh: '新增 is:buried 搜索词；状态栏的到期 / 新卡 / 学习中标签也走中文了。',
    },
    {
        en: 'A mind map now opens centred on the node that holds the mask, instead of half a pane to the right with the right side clipped. Switching c1/c2/c3 follows the group, and a c2 card opens on c2.',
        zh: '导图打开时按挖空所在节点居中，不再整体偏右、右侧被裁切；切换 c1/c2/c3 会居中各自节点，c2 的卡默认打开 c2。',
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
