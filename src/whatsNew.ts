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
export const WHATS_NEW_VERSION = '1.0.13';

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
        en: 'Cards are edited in Obsidian\'s own editor now: the pencil opens that side of the card as a note, with live preview, links and math - and the cloze body gets a toolbar for wrapping the selection.',
        zh: '卡片改用 Obsidian 自己的编辑器编辑：点铅笔会把这一面作为笔记打开，有真渲染、内链和公式；填空正文还带一条包裹选中的工具条。',
    },
    {
        en: 'Wrapping a multi-line selection puts one hole per line, so lists keep their numbers, and the source line under a card jumps to the block it came from.',
        zh: '跨行包裹时逐行成洞，列表编号不再被吞掉；翻到答案后卡片底部多一行「来源」，点了跳到源笔记那一块。',
    },
    {
        en: 'The browse view was rebuilt: deck and tags are edited inline and save at once, and cloze or image cards reveal in place instead of printing the same text twice.',
        zh: '浏览视图重做了：牌组、标签行内直接改并即时保存，填空与图片卡就地揭示答案，不再把同一段文字印两遍。',
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
