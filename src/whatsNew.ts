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
export const WHATS_NEW_VERSION = '1.0.27';

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
        en: 'Importing cards keeps their type: a mind map or an occlusion card no longer comes back as a plain Q&A card with its masks thrown away.',
        zh: '导入卡片会保留类型了：思维导图卡和图片卡不再被降级成普通问答卡、丢掉遮罩和分组。',
    },
    {
        en: 'A map card\'s suggested time now counts what it asks - the node or the holes - instead of the whole outline, and editing a map updates the deck and tags of all its cards.',
        zh: '导图卡的建议用时改为按「这张卡要回忆的内容」计算，不再按整份大纲；编辑导图时牌组与标签会同步到这张图的所有卡。',
    },
    {
        en: 'Housekeeping: duplicated stylesheet rules removed (11 selectors, ~475 lines) and dead code deleted. Nothing should look different.',
        zh: '整理：样式表里的重复定义清掉了（11 组选择器、约 475 行），并删除了死代码。外观不应有任何变化。',
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
