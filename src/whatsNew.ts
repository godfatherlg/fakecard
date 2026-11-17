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
export const WHATS_NEW_VERSION = '1.0.19';

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
        en: 'Pictures in a card are capped to the pane now, click one to open it large, and Ctrl+wheel zooms in place. The mask editor gained dragging, eight resize handles, Ctrl+multi-select and "move selected to cN".',
        zh: '卡片里的图片按窗格限高了，点一下可看大图，Ctrl+滚轮能就地缩放；蒙版编辑器支持拖动、八个把手缩放、Ctrl 多选，还能把选中的框移到指定组。',
    },
    {
        en: 'The answer-time chip sits after the card counter, starts at zero and turns orange past the budget. Cloze cards are measured by their hidden words, and links no longer count - both used to inflate the budget by minutes.',
        zh: '答题计时胶囊放在张数之后，从 0 开始走、超时变橙。填空卡只按挖空长度计算，链接也不再计入——这两项以前会把预算抬到好几分钟。',
    },
    {
        en: 'Browse: sort by type, deck, reviews or due; a child card links to its parent; Shift+click selects a range; cards can be paused and resumed. The finish page confirms a refresh and keeps its buttons when the queue is empty.',
        zh: '浏览视图：可按类型、牌组、复习次数、到期排序；子卡能跳到父卡；Shift 连选；卡片可暂停/恢复。完成页的刷新会有回执，队列为空时也不再只剩一片空白。',
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
