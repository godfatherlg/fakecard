import { App, PluginSettingTab, Setting } from 'obsidian';
import type FakeCardPlugin from '../main';
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
        new Setting(containerEl).setName('Library').setHeading();

        new Setting(containerEl)
            .setName('Card library folder')
            .setDesc('Folder inside the vault that holds the cards. Changing it switches to another library; the old files are left untouched.')
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
            .setName('Decks')
            .setDesc('One deck name per line. These are the decks offered when creating or editing a card, and by the Browse filter.')
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
            .setName('Default deck for new cards')
            .setDesc('Where a newly created card goes when the panel does not pick a deck.')
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
        new Setting(containerEl).setName('Card creation').setHeading();

        new Setting(containerEl)
            .setName('Heading marker')
            .setDesc('A heading that contains this symbol is treated as a Q&A card: the heading becomes the question and the text under it becomes the answer. The symbol itself is removed from the question.')
            .addText((text) => text
                .setPlaceholder('*')
                .setValue(this.plugin.settings.markerSymbol)
                .onChange(async (value) => {
                    this.plugin.settings.markerSymbol = value || '*';
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Alt+click an image to make an occlusion card')
            .setDesc('Holding Alt and clicking an image in the editor opens the mask panel directly. The normal right-click menu stays untouched either way.')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.altClickOcclusion)
                .onChange(async (value) => {
                    this.plugin.settings.altClickOcclusion = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Child cards')
            .setDesc('Pause a card that keeps failing and study it through easier stand-ins. Children graduate after a Good streak; when every child has graduated, the parent comes back.')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.childCardsEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.childCardsEnabled = value;
                    await this.plugin.saveSettings();
                }));

        numberSetting(
            containerEl,
            'Good streak to graduate a child',
            'Consecutive Good or Easy ratings a child needs before it graduates.',
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
            'Hard streak before a hint',
            'Consecutive Hard ratings on a child card before review suggests simplifying it.',
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
        new Setting(containerEl).setName('Review').setHeading();

        numberSetting(
            containerEl,
            'New cards per day',
            'How many unseen cards are introduced per day.',
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
            'Maximum reviews per day',
            'Upper bound on cards shown in a single day.',
            this.plugin.settings.maxReviewsPerDay,
            200,
            1,
            (value) => {
                this.plugin.settings.maxReviewsPerDay = value;
                void this.plugin.saveSettings();
            },
        );

        new Setting(containerEl)
            .setName('Show suggested answer time')
            .setDesc('Review shows an estimated time for the current card: a base budget plus reading time for the answer, adjusted by how hard the card has been.')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.answerTimeHint)
                .onChange(async (value) => {
                    this.plugin.settings.answerTimeHint = value;
                    await this.plugin.saveSettings();
                }));

        numberSetting(
            containerEl,
            'Answer time: base seconds',
            'Seconds allowed for a short answer before reading time is added.',
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
        new Setting(containerEl).setName('Card display').setHeading();

        new Setting(containerEl)
            .setName('Mask all groups on the front')
            .setDesc('On: every group of a cloze or image card is hidden on the front (the answer side always reveals everything). Off: only the group this card asks is hidden, the other groups stay visible.')
            .addToggle((toggle) => toggle
                .setValue(this.plugin.settings.maskAllGroups)
                .onChange(async (value) => {
                    this.plugin.settings.maskAllGroups = value;
                    await this.plugin.saveSettings();
                }));
    }

    // --------------------------------------------------------------------- Exam

    private renderExam(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Exam plan').setHeading();

        new Setting(containerEl)
            .setName('Exam date')
            .setDesc('Target date (YYYY-MM-DD). The exam plan spreads the selected cards across the days until then, so nothing lands after the exam. Once the date passes, the plan is dropped automatically and cards return to the normal FSRS schedule.')
            .addText((text) => text
                .setPlaceholder('2027-01-15')
                .setValue(this.plugin.settings.examDate)
                .onChange(async (value) => {
                    this.plugin.settings.examDate = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Exam plan: decks')
            .setDesc('Comma separated deck names to include (empty = every deck). Cards from these decks are still ordered by difficulty, so the hardest ones enter the plan first.')
            .addText((text) => text
                .setPlaceholder('方剂, 针灸')
                .setValue(this.plugin.settings.examDecks)
                .onChange(async (value) => {
                    this.plugin.settings.examDecks = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Exam plan: share of cards')
            .setDesc('How many cards join the plan, hardest first. 100% = every card; lower means fewer cards per day, at the cost of coverage.')
            .addSlider((slider) => slider
                .setLimits(10, 100, 10)
                .setValue(this.plugin.settings.examPlanRatio)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.examPlanRatio = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Build the exam plan now')
            .setDesc('Applies the settings above: pulls cards due after the exam into the remaining days and writes a backup first.')
            .addButton((button) => button
                .setButtonText('Build plan')
                .setCta()
                .onClick(async () => {
                    await this.plugin.buildExamPlan();
                }));
    }

    // ---------------------------------------------------------- Import / export

    private renderImportExport(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Import and export').setHeading();

        new Setting(containerEl)
            .setName('External AI / tools')
            .setDesc('No model is built in. Any tool can push cards through "obsidian://fakecard?data=<url-encoded JSON>" or the clipboard button below. JSON shape: [{"type":"qa","front":"...","back":"..."},{"type":"cloze","clozeText":"{{c1::...}}"}] - ==highlights== are accepted too.');

        new Setting(containerEl)
            .setName('Import cards from the clipboard')
            .setDesc('Reads JSON from the clipboard.')
            .addButton((button) => button
                .setButtonText('Import')
                .onClick(() => {
                    void this.plugin.importFromClipboard();
                }));

        new Setting(containerEl)
            .setName('Import an Anki deck (.apkg)')
            .setDesc('Basic, cloze and image-occlusion notes are converted.')
            .addButton((button) => button
                .setButtonText('Choose file')
                .onClick(() => {
                    this.plugin.importApkgFile();
                }));

        new Setting(containerEl)
            .setName('Export all cards')
            .setDesc('Writes every card (including FSRS state) to a JSON file in the library folder.')
            .addButton((button) => button
                .setButtonText('Export')
                .onClick(() => {
                    void this.plugin.exportCards();
                }));

        new Setting(containerEl)
            .setName('Housekeeping')
            .setDesc('Removes orphan cards whose note was deleted, or graduated child cards. Both write a backup first.')
            .addButton((button) => button
                .setButtonText('Clean orphans')
                .onClick(() => {
                    void this.plugin.cleanOrphans();
                }))
            .addButton((button) => button
                .setButtonText('Clean graduated')
                .onClick(() => {
                    void this.plugin.cleanGraduated();
                }));
    }
}
