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
export const WHATS_NEW_VERSION = '1.0.40';

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
        en: 'Click a mask in the mind map or cloze panel to write its note; it is stored as the Anki hint ({{c1::answer::note}}) and shows inside the mask in review. Both panels also have a Show answer switch now.',
        zh: '导图和挖空面板里单击遮罩就能写注释，存成 Anki 的挖空提示（{{c1::答案::注释}}），复习时显示在遮罩里。两个面板也都加了「显示答案」开关。',
    },
    {
        en: 'A map mask no longer sits on a line of its own: the renderer used to wrap each text run in a paragraph, and the mask was stranded between two blocks. Single-paragraph node text now stays inline.',
        zh: '导图遮罩不再独占一行：以前每段文字都被包进 `<p>`，遮罩夹在两个块之间就被挤出去了；现在单段文本保持行内。',
    },
    {
        en: 'The Q&A panel sizes its question and answer fields to the text again - a one-line question is one line high, not a tall empty box.',
        zh: '问答面板的问题和答案框重新按内容自适应：一行问题就一行高，不再是一个空的大框。',
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
