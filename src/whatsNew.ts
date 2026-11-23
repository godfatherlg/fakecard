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
export const WHATS_NEW_VERSION = '1.0.56';

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
        en: 'Four commands are now bindable to hotkeys: New Q&A card from selection, New cloze card from selection, Record the answer (start/stop), and Edit this card. They read the selection or the card on screen, so the usual actions work without the context menu.',
        zh: '新增四个可绑定快捷键的命令：用选中内容新建问答卡、用选中内容新建填空卡、录制答案（开始/停止）、编辑当前卡片。它们直接读取选区或当前复习卡，常用操作不再依赖右键菜单。',
    },
    {
        en: 'The review answer side has its own compact Record button: record, stop and the clip is saved immediately, with the player strip refreshed above the card. Recording blocks ratings, undo and deck switching so a take is not lost when the card changes.',
        zh: '复习答案面新增紧凑的「录音」按钮：录制、停止后立即保存，并刷新卡片上方的播放条。录音期间会阻止评分、撤销和切换牌组，避免翻卡时丢失录音。',
    },
    {
        en: 'Q&A drafts now use one visible `---` divider instead of the hidden answer marker. A blank line stays above the rule so the question is not parsed as a heading; drafts from earlier versions still load.',
        zh: '问答草稿不再写隐藏的答案标记，只保留一条可见的 `---`。分隔线前会自动留空行，避免问题被 Markdown 当成标题；旧版本写下的草稿仍能读取。',
    },
    {
        en: 'The Q&A preview question area now shrinks to its content, capped at half the box, and long questions scroll in place. Editing a text card from Browse opens Obsidian\'s editor with Back to panel; pictures and maps keep their own panels.',
        zh: '问答预览的问题区按内容收缩，最多占一半，长问题在问题区内滚动。浏览页编辑问答/填空卡时打开 Obsidian 编辑器，并保留「回到面板」；图片和导图仍使用各自面板。',
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
