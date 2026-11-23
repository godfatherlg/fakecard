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
export const WHATS_NEW_VERSION = '1.0.41';

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
        en: 'A mind map is edited in its own panel now - the one that creates maps - instead of a temporary note where {{c1::...}} was raw text. It opens on the card\'s group, saves every group together, and shows masks and notes while you edit.',
        zh: '导图卡改成在自己的面板里编辑（就是新建时用的那个），不再进临时 md 看一堆 {{c1::...}} 原文。打开时定位到卡片自己的分组，保存时整张图一起更新，编辑时能看到挖空和注释。',
    },
    {
        en: 'The mask note field keeps the caret now, and has a Remove mask button beside it that drops the markers and keeps the words.',
        zh: '挖空注释的输入框不再被弹窗抢焦点；旁边新增「删除挖空」，去掉标记、保留原文字。',
    },
    {
        en: 'Opening a map no longer flashes through its unplaced state, and switching c1 / c2 / c3 centres that group\'s first mask instead of keeping the previous view.',
        zh: '打开导图面板不再闪；切换 c1 / c2 / c3 会居中该组的第一处挖空，而不是保留上一组的视口。',
    },
    {
        en: 'One word for a hidden area: English uses mask everywhere (Image occlusion stays as the card type), Chinese uses 挖空 everywhere.',
        zh: '术语统一：中文界面一律用「挖空」，英文界面一律用 mask（Image occlusion 只作为卡型名称）。',
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
