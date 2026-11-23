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
export const WHATS_NEW_VERSION = '1.0.52';

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
        en: 'Burying a card now shows where it went: the review bar counts buried cards, the finish page and Refresh explain them, and Stats lists them as hidden from the queue. Burying a new card no longer leaves it in today\'s new-card queue.',
        zh: '埋藏不再“消失”：复习栏会显示埋藏张数，完成页和刷新会说明卡片被埋到明天，统计页也能看到「不在队列里的卡」。埋藏新卡后，它不会再出现在今天的新卡队列里。',
    },
    {
        en: 'Large maps repaint faster: editing one node in the outline leaves the other nodes in place instead of rebuilding the whole map, and their sizes are cached between repaints.',
        zh: '大导图重绘更快：在大纲里改一个节点，其余节点原地保留，不再整张重建；节点尺寸也会在两次重绘之间缓存。',
    },
    {
        en: 'Long editing sessions no longer pile up event listeners on the map view.',
        zh: '长时间编辑导图时，事件监听不再越积越多。',
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
