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
export const WHATS_NEW_VERSION = '1.0.25';

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
        en: 'A map card in review centres on the node it asks about and stays there when the answer appears. Holes are blue like a cloze hole, and the revealed words turn green - the same colours a cloze card uses.',
        zh: '复习导图卡时会居中到这张卡所问的节点，翻面后仍停在原处；挖空改成和填空卡一样的蓝底，揭示的答案标绿。',
    },
    {
        en: 'Browse: click a node in the preview and "edit" opens the outline at that line. The map panel gained a "fill screen" button, and the type filter knows about mind maps.',
        zh: '浏览视图里先点节点再点编辑，会直接定位到大纲对应那行；导图面板新增「铺满」，类型筛选也支持思维导图了。',
    },
    {
        en: 'Generating a map from a note now includes its paragraphs, and goes through the cloze conversion: ==highlight== becomes a hole, a following %%note%% becomes that hole\'s hint.',
        zh: '从笔记生成导图现在连正文段落一起收进来，并沿用填空卡的转换：==高亮== 变成挖空，其后的 %%注释%% 成为该挖空的提示。',
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
