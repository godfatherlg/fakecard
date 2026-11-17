import { App, Notice, PluginSettingTab, TFile, TFolder, normalizePath } from 'obsidian';
import type { SettingDefinitionGroup, SettingDefinitionItem } from 'obsidian';
import type FakeCardPlugin from '../main';
import { ConfirmDialog } from './confirm';

import {
    DEFAULT_ANSWER_SECONDS,
    DEFAULT_HISTORY_WEIGHT,
    DEFAULT_SECONDS_PER_CHUNK,
} from './answerTime';
import {
    buildExamPlan as buildExamPlanImpl,
    clampDays,
    clampRatio,
    createExamPlan,
    dateFromDays,
    daysLeft,
    estimateExamPlan,
    EXAM_PLAN_MAX_DAYS,
    EXAM_PLAN_MIN_DAYS,
    EXAM_PLAN_RATIO_STEP,
    ExamPlanConfig,
} from './examPlan';
import { t, tf, ttf } from './i18n';
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
    /** Consecutive Good or Easy ratings a child needs before it graduates. */
    childGoodStreak: number;
    /** Failing score that shows the "build a child card" hint. */
    childHardStreak: number;
    /** Points an Again rating adds to that failing score (Hard always adds 1). */
    childAgainScore: number;

    // --- Review ------------------------------------------------------------
    newCardsPerDay: number;
    maxReviewsPerDay: number;
    /** How many not-yet-due cards one "study ahead" batch pulls. */
    aheadBatch: number;
    /** Which not-yet-due cards come first in a batch. */
    aheadOrder: 'hardest' | 'earliest';
    /**
     * Hold new cards while due cards already exceed the daily limit: a backlog
     * means the day is full, and new cards only add tomorrow's work.
     */
    pauseNewWhenBacklogged: boolean;
    /**
     * Extra cards one press of "study more today" allows; 0 means half of the
     * daily limit (at least 20).
     */
    boostStep: number;
    /**
     * Scale the interval when a card is rated before its due date. Turning this
     * off also disables "study ahead" - borrowing cards from the future without
     * the correction would push their intervals further out than earned.
     */
    scaleEarlyReviews: boolean;
    /** Show the 📇 badge next to blocks that produced cards. */
    showCardBadge: boolean;
    /** Show the suggested answer time in review. */
    answerTimeHint: boolean;
    /** Base seconds in the answer-time estimate (reading time is added). */
    answerTimeBase: number;
    /** Extra seconds per 40 characters of answer (0 ignores length). */
    answerTimeSecondsPerChunk: number;
    /** Maximum bonus from rating history, in percent (0 ignores history). */
    answerTimeHistoryWeight: number;
    /** Rating shortcuts: a character, "Space", or empty for none. */
    ratingKeyAgain: string;
    ratingKeyHard: string;
    ratingKeyGood: string;
    ratingKeyEasy: string;

    // --- Card display ------------------------------------------------------
    /**
     * Review layout: a centred column (default) or the full width of the pane
     * with the text starting at the left edge.
     */
    reviewLayout: 'center' | 'wide';
    /**
     * Front side: hide EVERY group of a cloze/image card, not just the group
     * this card asks. Answer side always reveals everything.
     */
    maskAllGroups: boolean;

    // --- Exam --------------------------------------------------------------
    /** Exam plans; each one has its own countdown, decks and share. */
    examPlans: ExamPlanConfig[];
    /** Legacy single-plan fields, migrated into examPlans on load. */
    examDate: string;
    examDecks: string;
    examPlanRatio: number;

    // --- Update notice -----------------------------------------------------
    /** Version this plugin last ran as, so "what is new" is shown once. */
    lastSeenVersion: string;

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
    childAgainScore: 2,

    newCardsPerDay: 20,
    maxReviewsPerDay: 200,
    aheadBatch: 10,
    aheadOrder: 'hardest',
    pauseNewWhenBacklogged: true,
    boostStep: 0,
    scaleEarlyReviews: true,
    showCardBadge: true,
    answerTimeHint: true,
    // The three answer-time values below are the ones the True Recall install
    // this plugin was ported from actually uses.
    answerTimeBase: DEFAULT_ANSWER_SECONDS,
    answerTimeSecondsPerChunk: DEFAULT_SECONDS_PER_CHUNK,
    answerTimeHistoryWeight: DEFAULT_HISTORY_WEIGHT,
    // Anki's layout: 1-2-3 along the top row, Space on Good. Digits work on
    // the numpad too.
    ratingKeyAgain: '1',
    ratingKeyHard: '2',
    ratingKeyGood: 'Space',
    ratingKeyEasy: '3',

    reviewLayout: 'center',
    maskAllGroups: true,

    examPlans: [],
    examDate: '',
    examDecks: '',
    examPlanRatio: 100,

    lastSeenVersion: '',
};

/**
 * Numeric settings are kept inside the range the slider or field advertises,
 * whatever gets typed. A missing `max` means "no upper bound".
 */
const NUMBER_LIMITS: Record<string, { min: number; max?: number }> = {
    childGoodStreak: { min: 1, max: 6 },
    childHardStreak: { min: 2, max: 10 },
    childAgainScore: { min: 0, max: 3 },
    newCardsPerDay: { min: 0 },
    maxReviewsPerDay: { min: 1 },
    aheadBatch: { min: 1, max: 100 },
    boostStep: { min: 0, max: 500 },
    answerTimeBase: { min: 5, max: 120 },
    answerTimeSecondsPerChunk: { min: 0, max: 120 },
    answerTimeHistoryWeight: { min: -60, max: 100 },
};

/** Text settings that fall back to their default when the field is cleared. */
const TEXT_DEFAULTS: Record<string, string> = {
    libraryFolder: DEFAULT_LIBRARY_FOLDER,
    markerSymbol: '*',
    ratingKeyAgain: DEFAULT_SETTINGS.ratingKeyAgain,
    ratingKeyHard: DEFAULT_SETTINGS.ratingKeyHard,
    ratingKeyGood: DEFAULT_SETTINGS.ratingKeyGood,
    ratingKeyEasy: DEFAULT_SETTINGS.ratingKeyEasy,
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
            this.paceGroup(),
            this.aheadGroup(),
            this.reviewGroup(),
            this.examGroup(),
            this.importExportGroup(),
            this.maintenanceGroup(),
        ];
    }

    getControlValue(key: string): unknown {
        return (this.plugin.settings as unknown as Record<string, unknown>)[key];
    }

    async setControlValue(key: string, value: unknown): Promise<void> {
        const settings = this.plugin.settings as unknown as Record<string, unknown>;
        let next = typeof value === 'string' ? value.trim() : value;

        if (next === '' && key in TEXT_DEFAULTS) next = TEXT_DEFAULTS[key];

        const limit = NUMBER_LIMITS[key];
        if (limit !== undefined) {
            const parsed = Number(next);
            if (!Number.isFinite(parsed)) return;
            const rounded = Math.round(parsed);
            next = Math.min(Math.max(rounded, limit.min), limit.max ?? Number.POSITIVE_INFINITY);
        }

        if (settings[key] === next) return;
        settings[key] = next;
        if (key === 'libraryFolder') this.plugin.rebuildStores();
        await this.plugin.saveSettings();
        // The badge is drawn by a post-processor, so open notes must be redrawn
        // for the change to show without reopening them.
        if (key === 'showCardBadge') this.plugin.rerenderNotes();
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
                            // Keep the callback body in braces and return nothing:
                            // TextAreaComponent.setValue() returns the component, which is
                            // thenable in Obsidian's declarative settings, so returning it
                            // would resolve the promise with a thenable and spin forever.
                            void this.plugin.store.loadDecks()
                                .then((decks) => {
                                    area.setValue(decks.join('\n'));
                                })
                                .catch(() => undefined);
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
                            void this.plugin.store.loadDecks()
                                .then((decks) => {
                                    for (const deck of decks) dropdown.addOption(deck, deck);
                                    const current = this.plugin.settings.defaultDeck;
                                    dropdown.setValue(decks.includes(current) ? current : (decks[0] ?? 'default'));
                                })
                                .catch(() => undefined);
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
                    control: { type: 'number', key: 'childHardStreak', min: 2, max: 10, step: 1 },
                },
                {
                    name: t('creation.againScore.name'),
                    desc: t('creation.againScore.desc'),
                    control: { type: 'number', key: 'childAgainScore', min: 0, max: 3, step: 1 },
                },
            ],
        };
    }

    // -------------------------------------------------------------- Daily pace

    private paceGroup(): SettingDefinitionGroup {
        return {
            type: 'group',
            heading: t('pace.heading'),
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
                    name: t('review.pauseNew.name'),
                    desc: t('review.pauseNew.desc'),
                    control: { type: 'toggle', key: 'pauseNewWhenBacklogged' },
                },
                {
                    name: t('review.boostStep.name'),
                    desc: t('review.boostStep.desc'),
                    render: (setting) => {
                        setting.addText((text) => {
                            // Blank means "work it out": a tenth of the daily
                            // limit. A stored 0 is that same choice, but the
                            // field shows nothing rather than a puzzling zero.
                            text.inputEl.type = 'number';
                            text.inputEl.min = '1';
                            text.inputEl.max = '500';
                            text.setPlaceholder(t('review.boostStep.auto'));
                            text.setValue(this.plugin.settings.boostStep > 0
                                ? String(this.plugin.settings.boostStep)
                                : '');
                            text.onChange(async (raw) => {
                                const typed = raw.trim();
                                const parsed = Number(typed);
                                const next = typed === '' || !Number.isFinite(parsed) || parsed <= 0
                                    ? 0
                                    : Math.min(500, Math.round(parsed));
                                if (this.plugin.settings.boostStep === next) return;
                                this.plugin.settings.boostStep = next;
                                await this.plugin.saveSettings();
                            });
                        });
                    },
                },
            ],
        };
    }

    // ------------------------------------------------------------ Study ahead

    private aheadGroup(): SettingDefinitionGroup {
        return {
            type: 'group',
            heading: t('ahead.heading'),
            items: [
                {
                    name: t('review.aheadBatch.name'),
                    desc: t('review.aheadBatch.desc'),
                    control: { type: 'number', key: 'aheadBatch', min: 1, max: 100, step: 1 },
                },
                {
                    name: t('review.aheadOrder.name'),
                    desc: t('review.aheadOrder.desc'),
                    control: {
                        type: 'dropdown',
                        key: 'aheadOrder',
                        options: {
                            hardest: t('review.aheadOrder.hardest'),
                            earliest: t('review.aheadOrder.earliest'),
                        },
                        defaultValue: 'hardest',
                    },
                },
                {
                    name: t('review.scaleEarly.name'),
                    desc: t('review.scaleEarly.desc'),
                    control: { type: 'toggle', key: 'scaleEarlyReviews' },
                },
            ],
        };
    }

    // ----------------------------------------------------------- Review screen

    private reviewGroup(): SettingDefinitionGroup {
        return {
            type: 'group',
            heading: t('review.heading'),
            items: [
                {
                    name: t('display.layout.name'),
                    desc: t('display.layout.desc'),
                    control: {
                        type: 'dropdown',
                        key: 'reviewLayout',
                        options: {
                            center: t('display.layout.center'),
                            wide: t('display.layout.wide'),
                        },
                        defaultValue: 'center',
                    },
                },
                {
                    name: t('display.maskAll.name'),
                    desc: t('display.maskAll.desc'),
                    control: { type: 'toggle', key: 'maskAllGroups' },
                },
                {
                    name: t('display.badge.name'),
                    desc: t('display.badge.desc'),
                    control: { type: 'toggle', key: 'showCardBadge' },
                },
                {
                    name: t('review.answerTime.name'),
                    desc: t('review.answerTime.desc'),
                    control: { type: 'toggle', key: 'answerTimeHint' },
                },
                {
                    name: t('review.answerBase.name'),
                    desc: t('review.answerBase.desc'),
                    control: { type: 'number', key: 'answerTimeBase', min: 5, max: 120, step: 5 },
                },
                {
                    name: t('review.answerChunk.name'),
                    desc: t('review.answerChunk.desc'),
                    control: { type: 'number', key: 'answerTimeSecondsPerChunk', min: 0, max: 120, step: 5 },
                },
                {
                    name: t('review.answerWeight.name'),
                    desc: t('review.answerWeight.desc'),
                    control: { type: 'number', key: 'answerTimeHistoryWeight', min: -60, max: 100, step: 5 },
                },
                {
                    name: t('review.keyAgain.name'),
                    desc: t('review.keys.desc'),
                    control: { type: 'text', key: 'ratingKeyAgain', placeholder: '1' },
                },
                {
                    name: t('review.keyHard.name'),
                    desc: t('review.keys.desc'),
                    control: { type: 'text', key: 'ratingKeyHard', placeholder: '2' },
                },
                {
                    name: t('review.keyGood.name'),
                    desc: t('review.keys.desc'),
                    control: { type: 'text', key: 'ratingKeyGood', placeholder: 'Space' },
                },
                {
                    name: t('review.keyEasy.name'),
                    desc: t('review.keys.desc'),
                    control: { type: 'text', key: 'ratingKeyEasy', placeholder: '3' },
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
                    name: t('exam.plans.name'),
                    desc: t('exam.plans.desc'),
                    render: (setting) => {
                        setting.settingEl.addClass('fakecard-exam-setting');
                        const host = setting.settingEl.createDiv({ cls: 'fakecard-exam-plans' });
                        void this.plugin.store.loadDecks()
                            .then((decks) => {
                                if (!host.isConnected) return;
                                this.renderExamPlans(host, decks);
                            })
                            .catch(() => undefined);
                    },
                },
            ],
        };
    }

    /** One card per plan: name, countdown, decks, share, estimated load. */
    private renderExamPlans(host: HTMLElement, decks: string[]): void {
        host.empty();
        // Finished plans are hidden here; the review view removes them for good.
        const plans = (this.plugin.settings.examPlans ?? [])
            .filter((plan) => daysLeft(plan.date) >= 0);

        if (plans.length === 0) {
            host.createDiv({ cls: 'fakecard-exam-empty', text: t('exam.plans.empty') });
        }

        plans.forEach((plan) => this.renderExamPlan(host, plan, decks));

        const add = host.createEl('button', { cls: 'fakecard-exam-add', text: t('exam.plans.add') });
        add.addEventListener('click', () => {
            this.plugin.settings.examPlans = [...plans, createExamPlan(plans.length + 1)];
            void this.plugin.saveSettings();
            this.renderExamPlans(host, decks);
        });
    }

    private renderExamPlan(host: HTMLElement, plan: ExamPlanConfig, decks: string[]): void {
        const card = host.createDiv({ cls: 'fakecard-exam-plan' });

        // Name + delete.
        const head = card.createDiv({ cls: 'fakecard-exam-plan-head' });
        const name = head.createEl('input', {
            cls: 'fakecard-exam-plan-name',
            attr: { type: 'text', spellcheck: 'false' },
        });
        name.value = plan.name;
        name.addEventListener('change', () => {
            plan.name = name.value.trim() || 'Exam';
            name.value = plan.name;
            void this.plugin.saveSettings();
        });
        const remove = head.createEl('button', {
            cls: 'fakecard-exam-plan-delete clickable-icon',
            attr: { 'aria-label': t('exam.plan.delete'), title: t('exam.plan.delete') },
        });
        remove.setText('×');
        remove.addEventListener('click', () => {
            this.plugin.settings.examPlans = (this.plugin.settings.examPlans ?? [])
                .filter((entry) => entry.id !== plan.id);
            void this.plugin.saveSettings();
            this.renderExamPlans(host, decks);
        });

        // Countdown, entered as a number of days rather than a date.
        const daysRow = card.createDiv({ cls: 'fakecard-exam-plan-field' });
        daysRow.createSpan({ cls: 'fakecard-exam-plan-label', text: t('exam.plan.days') });
        const daysInput = daysRow.createEl('input', {
            cls: 'fakecard-exam-plan-number',
            attr: {
                type: 'number',
                min: String(EXAM_PLAN_MIN_DAYS),
                max: String(EXAM_PLAN_MAX_DAYS),
                step: '1',
            },
        });
        daysInput.value = String(daysLeft(plan.date));
        daysRow.createSpan({ cls: 'fakecard-exam-plan-unit', text: t('exam.plan.daysUnit') });
        daysInput.addEventListener('change', () => {
            plan.date = dateFromDays(clampDays(Number(daysInput.value)));
            daysInput.value = String(daysLeft(plan.date));
            void this.plugin.saveSettings();
            scheduleRefresh(0);
        });

        // Decks: tick the ones this plan covers; nothing ticked = all decks.
        const deckRow = card.createDiv({ cls: 'fakecard-exam-plan-field fakecard-exam-plan-decks' });
        deckRow.createSpan({ cls: 'fakecard-exam-plan-label', text: t('exam.plan.decks') });
        const ticked = new Set(plan.decks);
        for (const deck of decks) {
            const label = deckRow.createEl('label', { cls: 'fakecard-exam-plan-deck' });
            const box = label.createEl('input', { attr: { type: 'checkbox' } });
            box.checked = ticked.has(deck);
            label.createSpan({ text: deck });
            box.addEventListener('change', () => {
                if (box.checked) ticked.add(deck);
                else ticked.delete(deck);
                plan.decks = decks.filter((entry) => ticked.has(entry));
                void this.plugin.saveSettings();
                scheduleRefresh(0);
            });
        }

        // Share, with the resulting daily load underneath.
        const ratioRow = card.createDiv({ cls: 'fakecard-exam-plan-field' });
        ratioRow.createSpan({ cls: 'fakecard-exam-plan-label', text: t('exam.plan.ratio') });
        const slider = ratioRow.createEl('input', {
            cls: 'fakecard-exam-plan-slider',
            attr: {
                type: 'range',
                min: String(EXAM_PLAN_RATIO_STEP),
                max: '100',
                step: String(EXAM_PLAN_RATIO_STEP),
            },
        });
        slider.value = String(plan.ratio);
        const ratioValue = ratioRow.createSpan({
            cls: 'fakecard-exam-plan-ratio-value',
            text: `${plan.ratio}%`,
        });
        slider.addEventListener('input', () => {
            plan.ratio = clampRatio(Number(slider.value));
            ratioValue.setText(`${plan.ratio}%`);
            scheduleRefresh();
        });
        slider.addEventListener('change', () => {
            void this.plugin.saveSettings();
        });

        const estimate = card.createDiv({ cls: 'fakecard-exam-plan-estimate' });
        const refresh = async (): Promise<void> => {
            const result = await estimateExamPlan(this.plugin, plan);
            if (!estimate.isConnected) return;
            estimate.empty();
            if (result.selected === 0) {
                estimate.setText(t('exam.estimate.empty'));
                return;
            }
            estimate.createDiv({
                cls: 'fakecard-exam-plan-perday',
                text: tf('exam.estimate.line', { perDay: result.perDay, days: result.days }),
            });
            estimate.createDiv({
                cls: 'fakecard-exam-plan-detail',
                text: tf('exam.estimate.detail', {
                    moved: result.moved,
                    selected: result.selected,
                    cap: result.cap,
                }),
            });
            if (result.overloaded) {
                estimate.createDiv({ cls: 'fakecard-exam-plan-warn', text: t('exam.estimate.overloaded') });
            }
        };

        let refreshTimer: number | null = null;
        let saveTimer: number | null = null;
        const scheduleRefresh = (delay = 250): void => {
            if (refreshTimer !== null) window.clearTimeout(refreshTimer);
            refreshTimer = window.setTimeout(() => {
                refreshTimer = null;
                void refresh();
            }, delay);
            if (saveTimer !== null) window.clearTimeout(saveTimer);
            saveTimer = window.setTimeout(() => {
                saveTimer = null;
                void this.plugin.saveSettings();
            }, 400);
        };

        const actions = card.createDiv({ cls: 'fakecard-exam-plan-actions' });
        const build = actions.createEl('button', {
            cls: 'fakecard-exam-plan-build mod-cta',
            text: t('exam.plan.build'),
        });
        build.addEventListener('click', () => {
            void buildExamPlanImpl(this.plugin, plan);
        });

        void refresh();
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

    // ------------------------------------------------------------- Maintenance

    /**
     * The things that have no other home: the scratch notes the editor split
     * leaves behind, the backups the destructive actions write, and a way to
     * rebuild the card index without restarting Obsidian.
     */
    private maintenanceGroup(): SettingDefinitionGroup {
        return {
            type: 'group',
            heading: t('maintenance.heading'),
            items: [
                {
                    name: t('maintenance.sweep.name'),
                    desc: t('maintenance.sweep.desc'),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(t('maintenance.sweep.button'))
                            .onClick(async () => {
                                const removed = await this.plugin.tempEdit.cleanup();
                                new Notice(removed > 0
                                    ? ttf('Removed {count} scratch file(s).', { count: removed })
                                    : t('maintenance.sweep.empty'));
                            }));
                    },
                },
                {
                    name: t('maintenance.backup.name'),
                    desc: t('maintenance.backup.desc'),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(t('maintenance.backup.button'))
                            .onClick(() => {
                                new ConfirmDialog(
                                    this.app,
                                    t('maintenance.backup.confirm'),
                                    t('maintenance.backup.button'),
                                    () => this.clearBackups(),
                                ).open();
                            }));
                    },
                },
                {
                    name: t('maintenance.reindex.name'),
                    desc: t('maintenance.reindex.desc'),
                    render: (setting) => {
                        setting.addButton((button) => button
                            .setButtonText(t('maintenance.reindex.button'))
                            .onClick(() => {
                                void this.plugin.rebuildIndex();
                            }));
                    },
                },
            ],
        };
    }

    /** Delete the backup folder's contents; the user confirmed first. */
    private async clearBackups(): Promise<void> {
        const dir = normalizePath(`${this.plugin.store.folder}/backup`);
        const folder = this.plugin.app.vault.getAbstractFileByPath(dir);
        if (!(folder instanceof TFolder)) {
            new Notice(t('maintenance.backup.empty'));
            return;
        }
        let removed = 0;
        for (const child of [...folder.children]) {
            if (!(child instanceof TFile)) continue;
            try {
                await this.plugin.app.fileManager.trashFile(child);
                removed++;
            } catch {
                // Locked or already gone.
            }
        }
        new Notice(removed > 0
            ? ttf('Removed {count} backup file(s).', { count: removed })
            : t('maintenance.backup.empty'));
    }
}
