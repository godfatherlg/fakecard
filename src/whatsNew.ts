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
export const WHATS_NEW_VERSION = '1.0.7';

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
        en: 'The ribbon icon now opens Statistics, and a Statistics / Browse / Review strip switches between the three pages in place - no duplicate tabs.',
        zh: '功能区图标现在打开统计界面，顶部一行 Statistics / Browse / Review 在三个页面之间原地切换，不会重复开标签。',
    },
    {
        en: 'Exam plans are reworked: several plans at once, each with a countdown in days, ticked decks and a share, plus a live "cards per day" estimate before you build.',
        zh: '考试计划重做：可以同时建多个计划，每个有自己的剩余天数、勾选的牌组和比例，生成前就能看到每天多少张。',
    },
    {
        en: 'The suggested answer time is now configurable: base seconds, seconds per 40 characters of answer, and how strongly the card history moves it.',
        zh: '建议作答时间可以调了：基础秒数、答案每 40 字增加的秒数、以及评分历史的影响权重。',
    },
    {
        en: 'Child cards take two new settings: the Hard streak threshold (2-10) and how much an Again counts towards a failing run (0-3).',
        zh: '子卡新增两个设置：Hard 连击阈值（2–10）和 Again 在失败连击里的记分（0–3）。',
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
