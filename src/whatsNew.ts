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
export const WHATS_NEW_VERSION = '1.0.8';

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
        en: 'Anki imports now carry the full review history: every rating lands in the daily log, so the heatmap, the retention numbers and the child-card streak all see it. Duplicates ask whether to use the Anki schedule or keep the current one.',
        zh: 'Anki 导入会带上完整复习历史：每一条评分都写进按日日志，热力图、留存率和子卡失败连击都能读到。重复卡会询问使用 Anki 进度还是保留当前进度。',
    },
    {
        en: 'Review settings grew two pages: Again / Hard / Good / Easy can each be bound to a key (Space and digits work), and the card sits in a centred column or spans the full pane.',
        zh: '复习设置多了两项：Again / Hard / Good / Easy 可以各自绑定按键（空格和数字都行），卡片可选居中一栏或铺满窗格。',
    },
    {
        en: 'A card that keeps failing now offers a child card right in review, showing the recent failing score - Q&A, cloze or image occlusion - and the parent is paused. Ratings can be undone.',
        zh: '反复失败的卡会在复习界面直接提示建子卡，并显示最近的失败分数——问答、填空或图片遮挡都可以，父卡自动暂停。评分可以撤销。',
    },
    {
        en: 'The heatmap is rebuilt GitHub-style: 7 rows, horizontal scrolling, drag to pan, arrows to page through, and it covers the whole history instead of the last 90 days.',
        zh: '热力图按 GitHub 风格重做：7 行、横向滚动、可拖动、两侧箭头翻页，显示全部历史而不是固定 90 天。',
    },
    {
        en: 'The answer button and the four rating buttons use pale fills with matching text instead of full-strength colour blocks.',
        zh: '「显示答案」和四个评分按钮改成淡底同色系文字，不再是大块饱和色。',
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
