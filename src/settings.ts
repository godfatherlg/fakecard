import { App, PluginSettingTab, Setting } from 'obsidian';
import type FakeCardPlugin from '../main';
import { t } from './i18n';
import { DEFAULT_LIBRARY_FOLDER } from './store';

export interface FakeCardSettings {
    // --- Library -----------------------------------------------------------
    libraryFolder: string;
    /** Deck new cards go to unless the panel says otherwise. */
    defaultDeck: string;

    // --- Card creation -----------------------------------------------------
    /** A heading containing this symbol is a Q&A card marker. */
    markerSymbol: string;
    /** Alt+click an image in the editor opens the occlusion panel. */
    altClickOcclusion: boolean;
    /** Child cards: a paused parent is studied through easier stand-ins. */
    childCardsEnabled: boolean;
    /** Consecutive Good ratings a child needs before it graduates. */
    childGoodStreak: number;
    /** Consecutive Hard ratings that show a hint on a child card. */
    childHardStreak: number;

    // --- Review ------------------------------------------------------------
    newCardsPerDay: number;
    maxReviewsPerDay: number;
    /** Show the suggested answer time in review. */
    answerTimeHint: boolean;
    /** Base seconds in the answer-time estimate (reading time is added). */
    answerTimeBase: number;

    // --- Card display ------------------------------------------------------
    /**
     * Front side: hide EVERY group of a cloze/image card, not just the group
     * this card asks. Answer side always reveals everything.
     */
    maskAllGroups: boolean;

    // --- Exam --------------------------------------------------------------
    /** Target exam date (YYYY-MM-DD); empty = not used. */
    examDate: string;
    /** Decks included in the exam plan, comma separated; empty = all decks. */
    examDecks: string;
    /** Share of cards (10-100%) that join the exam plan, hardest first. */
    examPlanRatio: number;

    /** Legacy switches, kept so old data still loads. Not read any more. */
    showOtherClozeGroups?: boolean;
    showOtherImageGroups?: boolean;
    /** Legacy AI block from an early version. Not read any more. */
    ai?: unknown;
}

export const DEFAULT_SETTINGS: FakeCardSettings = {
    libraryFolder: DEFAULT_LIBRARY_FOLDER,
    defaultDeck: 'default',

    markerSymbol: '*',
    altClickOcclusion: true,
    childCardsEnabled: true,
    childGoodStreak: 2,
    childHardStreak: 4,

    newCardsPerDay: 20,
    maxReviewsPerDay: 200,
    answerTimeHint: true,
    answerTimeBase: 20,

    maskAllGroups: true,

    examDate: '',
    examDecks: '',
    examPlanRatio: 100,
};

/** Small helper: integer field that only saves valid values. */
function numberSetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    value: number,
    fallback: number,
    min: number,
    onSave: (value: number) => void,
): void {
    new Setting(containerEl)
        .setName(name)
        .setDesc(desc)
        .addText((text) => text
            .setPlaceholder(String(fallback))
            .setValue(String(value))
            .onChange((raw) => {
                const parsed = Number.parseInt(raw, 10);
                if (Number.isFinite(parsed) && parsed >= min) onSave(parsed);
            }));
}

export class FakeCardSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: FakeCardPlugin) {
        super(app, plugin);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        this.renderLibrary(containerEl);
        this.renderCreation(containerEl);
        this.renderReview(containerEl);
        this.renderDisplay(containerEl);
        this.renderExam(containerEl);
        this.renderImportExport(containerEl);
    }

    // ------------------------------------------------------------------ Library

    private renderLibrary(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('library.heading')).setHeading();

        new Setting(containerEl)
            .setName(t('library.folder.name'))
            .setDesc(t('library.folder.desc'))
            .addText((text) => text
                .setPlaceholder(DEFAULT_LIBRARY_FOLDER)
                .setValue(this.plugin.settings.libraryFolder)
                .onChange(async (value) => {
                    const folder = value.trim() || DEFAULT_LIBRARY_FOLDER;
                    if (folder === this.plugin.settings.libraryFolder) return;
                    this.plugin.settings.libraryFolder = folder;
                    this.plugin.rebuildStores();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('library.decks.name'))
            .setDesc(t('library.decks.desc'))
            .addTextArea((area) => {
                area.inputEl.rows = 4;
                area.setPlaceholder('default\n方剂\n针灸');
                void this.plugin.store.loadDecks().then((decks) => area.setValue(decks.join('\n')));
                area.onChange(async (value) => {
                    const decks = value
                        .split('\n')
                        .map((deck) => deck.trim())
                        .filter((deck) => deck.length > 0);
                    await this.plugin.store.saveDecks(decks.length > 0 ? decks : ['default']);
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName(t('library.defaultDeck.name'))
            .setDesc(t('library.defaultDeck.desc'))
            .addDropdown((dropdown) => {
                void this.plugin.store.loadDecks().then((decks) => {
                    for (const deck of decks) dropdown.addOption(deck, deck);
                    const current = this.plugin.settings.defaultDeck;
                    dropdown.setValue(decks.includes(current) ? current : (decks[0] ?? 'default'));
                });
                dropdown.onChange(async (value) => {
                    this.plugin.settings.defaultDeck = value;
                    await this.plugin.saveSettings();
                });
            });
    }

    // ----------------------------------------------------------------- Creation

    private renderCreation(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('creation.heading')).setHeading();

        new Setting(containerEl)
            .setName(t('creation.marker.name'))
            .setDesc(t('creation.marker.desc'))
            .addText((text) => text
                .setPlaceholder('*')
                .setValue(this.plugin.settings.markerSymbol)
                .onChange(async (value) => {
                    this.plugin.settings.markerSymbol = value || '*';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('creation.altClick.name'))
            .setDesc(t('creation.altClick.desc'))
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.altClickOcclusion)
                .onChange(async (value) => {
                    this.plugin.settings.altClickOcclusion = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('creation.childCards.name'))
            .setDesc(t('creation.childCards.desc'))
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.childCardsEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.childCardsEnabled = value;
                    await this.plugin.saveSettings();
                }));

        numberSetting(
            containerEl,
            t('creation.goodStreak.name'),
            t('creation.goodStreak.desc'),
            this.plugin.settings.childGoodStreak,
            2,
            1,
            (value) => {
                this.plugin.settings.childGoodStreak = value;
                void this.plugin.saveSettings();
            },
        );

        numberSetting(
            containerEl,
            t('creation.hardStreak.name'),
            t('creation.hardStreak.desc'),
            this.plugin.settings.childHardStreak,
            4,
            1,
            (value) => {
                this.plugin.settings.childHardStreak = value;
                void this.plugin.saveSettings();
            },
        );
    }

    // ------------------------------------------------------------------- Review

    private renderReview(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('review.heading')).setHeading();

        numberSetting(
            containerEl,
            t('review.newPerDay.name'),
            t('review.newPerDay.desc'),
            this.plugin.settings.newCardsPerDay,
            20,
            0,
            (value) => {
                this.plugin.settings.newCardsPerDay = value;
                void this.plugin.saveSettings();
            },
        );

        numberSetting(
            containerEl,
            t('review.maxPerDay.name'),
            t('review.maxPerDay.desc'),
            this.plugin.settings.maxReviewsPerDay,
            200,
            1,
            (value) => {
                this.plugin.settings.maxReviewsPerDay = value;
                void this.plugin.saveSettings();
            },
        );

        new Setting(containerEl)
            .setName(t('review.answerTime.name'))
            .setDesc(t('review.answerTime.desc'))
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.answerTimeHint)
                .onChange(async (value) => {
                    this.plugin.settings.answerTimeHint = value;
                    await this.plugin.saveSettings();
                }));

        numberSetting(
            containerEl,
            t('review.answerBase.name'),
            t('review.answerBase.desc'),
            this.plugin.settings.answerTimeBase,
            20,
            5,
            (value) => {
                this.plugin.settings.answerTimeBase = value;
                void this.plugin.saveSettings();
            },
        );
    }

    // ------------------------------------------------------------------ Display

    private renderDisplay(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('display.heading')).setHeading();

        new Setting(containerEl)
            .setName(t('display.maskAll.name'))
            .setDesc(t('display.maskAll.desc'))
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.maskAllGroups)
                .onChange(async (value) => {
                    this.plugin.settings.maskAllGroups = value;
                    await this.plugin.saveSettings();
                }));
    }

    // --------------------------------------------------------------------- Exam

    private renderExam(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('exam.heading')).setHeading();

        new Setting(containerEl)
            .setName(t('exam.date.name'))
            .setDesc(t('exam.date.desc'))
            .addText((text) => text
                .setPlaceholder('2027-01-15')
                .setValue(this.plugin.settings.examDate)
                .onChange(async (value) => {
                    this.plugin.settings.examDate = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('exam.decks.name'))
            .setDesc(t('exam.decks.desc'))
            .addText((text) => text
                .setPlaceholder('方剂, 针灸')
                .setValue(this.plugin.settings.examDecks)
                .onChange(async (value) => {
                    this.plugin.settings.examDecks = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('exam.ratio.name'))
            .setDesc(t('exam.ratio.desc'))
            .addSlider((slider) => slider
                .setLimits(10, 100, 10)
                .setValue(this.plugin.settings.examPlanRatio)
                .onChange(async (value) => {
                    this.plugin.settings.examPlanRatio = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('exam.build.name'))
            .setDesc(t('exam.build.desc'))
            .addButton((button) => button
                .setButtonText(t('exam.build.button'))
                .setCta()
                .onClick(async () => {
                    await this.plugin.buildExamPlan();
                }));
    }

    // ---------------------------------------------------------- Import / export

    private renderImportExport(containerEl: HTMLElement): void {
        new Setting(containerEl).setName(t('io.heading')).setHeading();

        new Setting(containerEl)
            .setName(t('io.external.name'))
            .setDesc(t('io.external.desc'));

        new Setting(containerEl)
            .setName(t('io.clipboard.name'))
            .setDesc(t('io.clipboard.desc'))
            .addButton((button) => button
                .setButtonText(t('io.clipboard.button'))
                .onClick(() => {
                    void this.plugin.importFromClipboard();
                }));

        new Setting(containerEl)
            .setName(t('io.apkg.name'))
            .setDesc(t('io.apkg.desc'))
            .addButton((button) => button
                .setButtonText(t('io.apkg.button'))
                .onClick(() => {
                    this.plugin.importApkgFile();
                }));

        new Setting(containerEl)
            .setName(t('io.export.name'))
            .setDesc(t('io.export.desc'))
            .addButton((button) => button
                .setButtonText(t('io.export.button'))
                .onClick(() => {
                    void this.plugin.exportCards();
                }));

        new Setting(containerEl)
            .setName(t('io.housekeeping.name'))
            .setDesc(t('io.housekeeping.desc'))
            .addButton((button) => button
                .setButtonText(t('io.orphans.button'))
                .onClick(() => {
                    void this.plugin.cleanOrphans();
                }))
            .addButton((button) => button
                .setButtonText(t('io.graduated.button'))
                .onClick(() => {
                    void this.plugin.cleanGraduated();
                }));
    }
}
