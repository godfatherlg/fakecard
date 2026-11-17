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
export const WHATS_NEW_VERSION = '1.0.18';

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
        en: 'Study ahead: when today is clear, the finish page lends you 10 cards that are not due yet, hardest first. Ratings still go through FSRS, with the new interval shortened by the days you gained early - and they do not use up today\'s allowance.',
        zh: '提前复习：今天清空后，完成页会从还没到期的卡里借 10 张给你练（优先最难的）。评分照常走 FSRS，但会按提前的天数缩短新间隔，而且不占用当天的复习额度。',
    },
    {
        en: 'When due cards exceed the daily limit, review shows a red backlog chip and offers "study more today", which can be pressed again and again. New cards are held back until the queue fits.',
        zh: '到期卡超过每日上限时，复习界面会标出积压数量，并提供「今天多学一点」——可以反复点着续。积压期间新卡自动暂停，队列降下来再恢复。',
    },
    {
        en: 'Settings are regrouped into eight sections (daily pace, study ahead, review screen, maintenance ...), and the stats page\'s hardest cards now scroll and can be studied by clicking a row.',
        zh: '设置页重排成八组（每日节奏、提前复习、复习界面、维护……）；统计页的「最难的卡」可以滚动，点一行就能直接开始学。',
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
