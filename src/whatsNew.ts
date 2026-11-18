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
export const WHATS_NEW_VERSION = '1.0.24';

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
        en: 'A fourth card type: paste an outline and headings and list items become a mind map, rendered by Obsidian itself. One card per mask group, in the same queue and schedule as the rest.',
        zh: '第四种卡片：粘贴大纲，标题与列表项就变成思维导图，节点内容由 Obsidian 渲染；一组建一张卡，和其他卡一样排队、排程。',
    },
    {
        en: 'Work straight on the map: drag to pan, Ctrl+wheel to zoom, double-click a node to edit it, select words to mask them, and the map decides how big the box is - the outline is only the input.',
        zh: '导图就是操作界面：拖动平移、Ctrl+滚轮缩放、双击节点改字、划选文字直接遮罩；大纲只是输入，之后都在图上完成。',
    },
    {
        en: 'The Q&A, cloze and mind-map panels now share one layout: the input fills the box, "Done" turns it into the rendered card in place, and cloze cards can be masked by selecting words on that card.',
        zh: '问答、填空、导图三个新建面板统一成一套：输入填满窗口，点「完成」原地变成渲染后的卡片，填空卡还能直接在上面划选挖空。',
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
