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
export const WHATS_NEW_VERSION = '1.0.55';

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
        en: 'Optional audio recordings, off by default: an existing card\'s edit panel can record several clips, saved under fakecard/media with a time-stamped file name. The label can be renamed without touching the file, and review shows a player strip above the card that never starts by itself.',
        zh: '新增可选录音（默认关闭）：已有卡片的编辑面板可以录制多段录音，按时间戳保存在 fakecard/media。显示名可以改，但不会动文件名；复习时卡片上方显示播放条，不会自动播放。',
    },
    {
        en: 'Optional learning steps, off by default: new cards and lapses can follow Anki-style minute steps such as 1m 10m and 10m. Again returns to the first step, Good moves one step on, Hard repeats the current step and Easy graduates; after the last step FSRS still picks the interval.',
        zh: '新增可选学习步骤（默认关闭）：新卡和遗忘后的卡可以按 1m 10m、10m 这样的 Anki 式分钟步骤走。Again 回到第一步，Good 前进一步，Hard 重复当前步，Easy 直接毕业；最后一步之后的间隔仍由 FSRS 决定。',
    },
    {
        en: 'Both switches are off by default; with them off, scheduling and the edit panels behave exactly as in 1.0.54. The settings entries explain each option in both languages.',
        zh: '两项开关默认关闭；关闭时排程和编辑面板与 1.0.54 完全一致。设置项里有中英文说明。',
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
