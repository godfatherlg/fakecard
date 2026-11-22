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
export const WHATS_NEW_VERSION = '1.0.38';

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
        en: 'Anti-middle nudges (off by default): above the rating buttons, a quick recall offers "Too easy (Easy)" and "No idea (Again)", a slow one offers "Stuck (Again)" and "Mixed up (Hard)", and every card offers the mixed-up mark. Ignoring the line changes nothing.',
        zh: '防中庸提示（默认关）：评分按钮上方，很快的卡给「太容易（简单）」「没思路（重来）」，很慢的卡给「卡思路（重来）」「记混卡（困难）」，正常速度也常驻「记混卡（困难）」。不点就不影响正常操作。',
    },
    {
        en: 'After a break (three switches, off by default): recovery order for the queue, an interval cap for cards reviewed long after their due date, and a daily size that follows yesterday\'s success rate.',
        zh: '中断处理（三个开关，默认关）：恢复顺序排队、超期很久的卡成功后限制新间隔、按昨天成功率调整今天放多少张。',
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
