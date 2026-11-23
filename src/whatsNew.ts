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
export const WHATS_NEW_VERSION = '1.0.46';

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
        en: 'Large libraries render in pages now: Browse builds 300 rows at a time, skips off-screen paint, and coalesces search input. The status bar uses a count-only path instead of rebuilding the queue after every rating.',
        zh: '大库不再一次性渲染：浏览页一次建 300 行、屏外行跳过绘制、搜索输入合并处理；状态栏改用只算数字的计数，不再每次评分都重建队列。',
    },
    {
        en: 'New: CSV export, and bury a card until tomorrow from the browse preview or the bulk bar (FSRS schedule untouched, is:due excludes it).',
        zh: '新增：CSV 导出；浏览页预览和批量栏都可以把卡埋藏到明天（不改 FSRS 排期，is:due 会排除它）。',
    },
    {
        en: 'Fixes: a corrupt review day file is now really recreated after being moved aside, a failed rating save keeps you on the card, undo finds the card by id, and the official review lint is down to zero.',
        zh: '修复：坏日志隔离后会真正新建当天文件；评分保存失败会停留在当前卡；撤销按卡片 id 定位；官方评审 lint 降到 0。',
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
