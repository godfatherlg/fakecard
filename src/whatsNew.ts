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
export const WHATS_NEW_VERSION = '1.0.35';

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
        en: 'The suggested time now covers a full recall: one pass × 3 by default, plus a first pass (base 20s, growing with answer length). Answering and recall have separate history weights: -20% for answers, +20% for memory.',
        zh: '建议用时改成按完整回忆计算：一遍预算 × 记忆遍数（默认 3 遍），再加首遍的思考时间（基础 20 秒，同样按字数增加）。作答与记忆的评分历史权重分开：作答 −20%、记忆 +20%。',
    },
    {
        en: 'Question and answer share one pill: "Answering" counts against one pass and is only a reminder, "Recalling" freezes the same number against the whole memory budget, and both sides have a ↻ reset. Only memory overtime scores: a fraction of a Hard per step (1.5x = 0.5, 2x = 1 by default), feeding the "Child" button.',
        zh: '问题面和答案面用同一个胶囊：问题面「作答」按一遍预算计时，只作提醒；揭示后「记忆」冻结同一个数字、按整张卡的记忆预算衡量，两边都有 ↻ 重新计时。只有记忆超时才记分：每多一步记一部分 Hard（默认 1.5 倍 0.5、2 倍 1），计入「建子卡」。',
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
