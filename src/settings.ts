import { App, PluginSettingTab } from 'obsidian';
import type { SettingDefinitionGroup, SettingDefinitionItem } from 'obsidian';
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

/** Numeric settings never drop below these values, whatever gets typed. */
const NUMBER_FLOORS: Record<string, number> = {
    childGoodStreak: 1,
    childHardStreak: 1,
    newCardsPerDay: 0,
    maxReviewsPerDay: 1,
    answerTimeBase: 5,
};

/**
 * Settings UI. The values are declared once and rendered by Obsidian's
 * declarative settings API (1.13+), so every row is indexed by the settings
 * search. Rows that need async data or a button use a custom render callback.
 */
export class FakeCardSettingTab extends PluginSettingTab {
    constructor(app: App, private plugin: FakeCardPlugin) {
        super(app, plugin);
    }

    getSettingDefinitions(): SettingDefinitionItem[] {
        return [
            this.libraryGroup(),
            this.creationGroup(),
            this.reviewGroup(),
            this.displayGroup(),
            this.examGroup(),
            this.importExportGroup(),
        ];
    }

    getControlValue(key: string): unknown {
        return (this.plugin.settings as unknown as Record<string, unknown>)[key];
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        const settings = this.plugin.settings as unknown as Record<string, unknown>;
        let next = typeof value === 'string' ? value.trim() : value;

        if (key === 'libraryFolder' && next === '') next = DEFAULT_LIBRARY_FOLDER;
        if (key === 'markerSymbol' && next === '') next = '*';

        const floor = NUMBER_FLOORS[key];
        if (floor !== undefined) {
            const parsed = Number(next);
            if (!Number.isFinite(parsed)) return;
            next = Math.max(floor, Math.round(parsed));
        }

        if (settings[key] === next) return;
        settings[key] = next;
        if (key === 'libraryFolder') this.plugin.rebuildStores();
        await this.plugin.saveSettings();
    }

    // ------------------------------------------------------------------ Library

    private libraryGroup(): SettingDefinitionGroup {
        return {
            type: 'group',
            heading: t('library.heading'),
            items: [
                {
                    name: t('library.folder.name'),
                    desc: t('library.folder.desc'),
                    control: {
                        type: 'text',
                        key: 'libraryFolder',
                        placeholder: DEFAULT_LIBRARY_FOLDER,
                        defaultValue: DEFAULT_LIBRARY_FOLDER,
                    },
                },
                {
                    name: t('library.decks.name'),
                    desc: t('library.decks.desc'),
                    render: (setting) => {
                        setting.addTextArea((area) => {
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
                    },
                },
                {
                    name: t('library.defaultDeck.name'),
                    desc: t('library.defaultDeck.desc'),
                    render: (setting) => {
                        setting.addDropdown((dropdown) => {
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
                    },
                },
            ],
        };
    }

    // ----------------------------------------------------------------- Creation

    private creationGroup(): SettingDefinitionGroup {
        return {
            type: 'group',
            heading: t('creation.heading'),
            items: [
                {
                    name: t('creation.marker.name'),
                    desc: t('creation.marker.desc'),
                    control: { type: 'text', key: 'markerSymbol', placeholder: '*' },
                },
                {
                    name: t('creation.altClick.name'),
                    desc: t('creation.altClick.desc'),
                    control: { type: 'toggle', key: 'altClickOcclusion' },
                },
                {
                    name: t('creation.childCards.name'),
                    desc: t('creation.childCards.desc'),
                    control: { type: 'toggle', key: 'childCardsEnabled' },
                },
                {
                    name: t('creation.goodStreak.name'),
                    desc: t('creation.goodStreak.desc'),
                    control: { type: 'number', key: 'childGoodStreak', min: 1, step: 1 },
                },
                {
                    name: t('creation.hardStreak.name'),
                    desc: t('creation.hardStreak.desc'),
                    control: { type: 'number', key: 'childHardStreak', min: 1, step: 1 },
                },
            ],
        };
    }

    // ------------------------------------------------------------------- Review

    private reviewGroup(): SettingDefinitionGroup {
        return {
            type: 'group',
            heading: t('review.heading'),
            items: [
                {
                    name: t('review.newPerDay.name'),
                    desc: t('review.newPerDay.desc'),
                    control: { type: 'number', key: 'newCardsPerDay', min: 0, step: 1 },
                },
                {
                    name: t('review.maxPerDay.name'),
                    desc: t('review.maxPerDay.desc'),
                    control: { type: 'number', key: 'maxReviewsPerDay', min: 1, step: 1 },
                },
                {
                    name: t('review.answerTime.name'),
                    desc: t('review.answerTime.desc'),
                    control: { type: 'toggle', key: 'answerTimeHint' },
                },
                {
                    name: t('review.answerBase.name'),
                    desc: t('review.answerBase.desc'),
                    control: { type: 'number', key: 'answerTimeBase', min: 5, step: 1 },
                },
            ],
        };
    }

    // ------------------------------------------------------------------ Display

    private displayGroup(): SettingDefinitionGroup {
        return {
            type: 'group',
            heading: t('display.heading'),
            items: [
                {
                    name: t('display.maskAll.name'),
                    desc: t('display.maskAll.desc'),
                    control: { type: 'toggle', key: 'maskAllGroups' },
                },
            ],
        };
    }

    // --------------------------------------------------------------------- Exam

    private examGroup(): SettingDefinitionGroup {
        return {
            type: 'group',
            heading: t('exam.heading'),
            items: [
                {
                    name: t('exam.date.name'),
                    desc: t('exam.date.desc'),
                    control: { type: 'text', key: 'examDate', placeholder: '2027-01-15' },
                },
                {
                    name: t('exam.decks.name'),
                    desc: t('exam.decks.desc'),
                    control: { type: 'text', key: 'examDecks', placeholder: '方剂, 针灸' },
                },
                {
                    name: t('exam.ratio.name'),
                    desc: t('exam.ratio.desc'),
                    control: {
                        type: 'slider',
                        key: 'examPlanRatio',
                        min: 10,
                        max: 100,
                        step: 10,
                        displayFormat: (value) => `${value}%`,
                    },
                },
                {
                    name: t('exam.build.name'),
                    desc: t('exam.build.desc'),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(t('exam.build.button'))
                            .setCta()
                            .onClick(() => {
                                void this.plugin.buildExamPlan();
                            }));
                    },
                },
            ],
        };
    }

    // ---------------------------------------------------------- Import / export

    private importExportGroup(): SettingDefinitionGroup {
        return {
            type: 'group',
            heading: t('io.heading'),
            items: [
                {
                    name: t('io.external.name'),
                    desc: t('io.external.desc'),
                },
                {
                    name: t('io.clipboard.name'),
                    desc: t('io.clipboard.desc'),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(t('io.clipboard.button'))
                            .onClick(() => {
                                void this.plugin.importFromClipboard();
                            }));
                    },
                },
                {
                    name: t('io.apkg.name'),
                    desc: t('io.apkg.desc'),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(t('io.apkg.button'))
                            .onClick(() => {
                                this.plugin.importApkgFile();
                            }));
                    },
                },
                {
                    name: t('io.export.name'),
                    desc: t('io.export.desc'),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(t('io.export.button'))
                            .onClick(() => {
                                void this.plugin.exportCards();
                            }));
                    },
                },
                {
                    name: t('io.housekeeping.name'),
                    desc: t('io.housekeeping.desc'),
                    render: (setting) => {
                        setting
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
                    },
                },
            ],
        };
    }
}
