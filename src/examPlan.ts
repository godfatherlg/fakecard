import { Menu, normalizePath, Notice } from 'obsidian';
import type { CardRecord } from './card';
import { tt, ttf } from './i18n';
import type FakeCardPlugin from '../main';

const DAY_MS = 86400000;

/** Days a plan may cover; 0 means the exam is today. */
export const EXAM_PLAN_MIN_DAYS = 0;
export const EXAM_PLAN_MAX_DAYS = 730;
/** Share of the eligible cards a plan may take. */
export const EXAM_PLAN_MIN_RATIO = 10;
export const EXAM_PLAN_MAX_RATIO = 100;
export const EXAM_PLAN_RATIO_STEP = 10;

/**
 * One exam plan. Several can exist side by side (one per subject, say), each
 * with its own decks, share and countdown.
 *
 * The date is stored as a real day so the countdown keeps running; the UI
 * only ever shows and edits "days left", never the calendar date.
 */
export interface ExamPlanConfig {
    id: string;
    name: string;
    /** YYYY-MM-DD. Edited in the UI as a number of days. */
    date: string;
    /** Decks in this plan; empty = every deck. */
    decks: string[];
    /** Share of the eligible cards that join, 10-100. */
    ratio: number;
}

export interface ExamPlanEstimate {
    /** Reviewed, unsuspended cards in the plan's decks. */
    eligible: number;
    /** How many of those the share selects (hardest first). */
    selected: number;
    /** Selected cards whose FSRS due date lands after the exam. */
    moved: number;
    /** Days available before the exam. */
    days: number;
    /** Cards per day the build would produce. */
    perDay: number;
    /** Daily review cap in effect. */
    cap: number;
    overloaded: boolean;
}

function pad(value: number): string {
    return value < 10 ? `0${value}` : String(value);
}

/** Local calendar day for a Date, as YYYY-MM-DD. */
function dayKey(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function newExamPlanId(): string {
    return `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Calendar days between today and a plan's date: 0 = exam today, 3 = three
 * more days to study, negative once the day has passed. Counting calendar
 * days (not elapsed hours) keeps the number the user typed stable.
 */
export function daysLeft(date: string): number {
    const target = new Date(`${date}T00:00:00`);
    if (!Number.isFinite(target.getTime())) return -1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

/** Calendar date that is `days` from today, as YYYY-MM-DD. */
export function dateFromDays(days: number): string {
    const target = new Date();
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + Math.max(EXAM_PLAN_MIN_DAYS, Math.round(days)));
    return dayKey(target);
}

export function clampDays(days: number): number {
    if (!Number.isFinite(days)) return 1;
    return Math.min(EXAM_PLAN_MAX_DAYS, Math.max(EXAM_PLAN_MIN_DAYS, Math.round(days)));
}

export function clampRatio(ratio: number): number {
    const rounded = Math.round(ratio / EXAM_PLAN_RATIO_STEP) * EXAM_PLAN_RATIO_STEP;
    return Math.min(EXAM_PLAN_MAX_RATIO, Math.max(EXAM_PLAN_MIN_RATIO, rounded));
}

/** Plans whose exam day has not passed yet (the exam day itself still counts). */
export function activeExamPlans(plans: ExamPlanConfig[]): ExamPlanConfig[] {
    return plans.filter((plan) => daysLeft(plan.date) >= 0);
}

/**
 * Drop finished plans. Data on the cards themselves is never touched - they
 * simply go back to the normal FSRS schedule.
 */
export async function pruneExpiredExamPlans(plugin: FakeCardPlugin): Promise<number> {
    const plans = plugin.settings.examPlans ?? [];
    const kept = activeExamPlans(plans);
    if (kept.length === plans.length) return 0;
    plugin.settings.examPlans = kept;
    await plugin.saveSettings();
    return plans.length - kept.length;
}

/** The plan finishing first, used for the review-view countdown. */
export function nextExamPlan(plans: ExamPlanConfig[]): ExamPlanConfig | null {
    const active = activeExamPlans(plans);
    if (active.length === 0) return null;
    return active.slice().sort((a, b) => daysLeft(a.date) - daysLeft(b.date))[0];
}

/** New plan with sensible defaults, used by the "add" button. */
export function createExamPlan(index: number): ExamPlanConfig {
    return {
        id: newExamPlanId(),
        name: `Exam ${index}`,
        date: dateFromDays(30),
        decks: [],
        ratio: 100,
    };
}

/**
 * Old single-plan settings (`examDate` / `examDecks` / `examPlanRatio`)
 * carried over as the first plan, so an update does not lose the countdown.
 */
export function legacyExamPlan(exam: string, decks: string, ratio: number): ExamPlanConfig | null {
    const date = exam.trim();
    if (!date || daysLeft(date) < 0) return null;
    return {
        id: newExamPlanId(),
        name: 'Exam',
        date,
        decks: decks.split(/[,，\s]+/).map((name) => name.trim()).filter((name) => name.length > 0),
        ratio: clampRatio(ratio),
    };
}

function planDeckNames(plan: ExamPlanConfig): string[] {
    return plan.decks.map((deck) => deck.trim()).filter((deck) => deck.length > 0);
}

/** Reviewed, unsuspended cards in the plan's decks, hardest first. */
async function collectCards(plugin: FakeCardPlugin, plan: ExamPlanConfig): Promise<CardRecord[]> {
    const cards = await plugin.store.list();
    const decks = planDeckNames(plan);
    return cards
        .filter((card) => card.fsrs && !card.suspended && !card.graduated)
        .filter((card) => decks.length === 0 || decks.includes(card.deck ?? 'default'))
        .sort((a, b) => (b.fsrs!.difficulty ?? 0) - (a.fsrs!.difficulty ?? 0));
}

interface ExamPlanWork {
    estimate: ExamPlanEstimate;
    /** Cards that the build would reschedule. */
    outside: CardRecord[];
    /** Upper bound in ms (23:59:59 of the plan day). */
    examEnd: number;
}

async function planWork(plugin: FakeCardPlugin, plan: ExamPlanConfig): Promise<ExamPlanWork> {
    const examEnd = new Date(`${plan.date}T23:59:59`).getTime();
    const eligible = await collectCards(plugin, plan);
    const ratio = clampRatio(plan.ratio) / 100;
    const selected = eligible.length === 0
        ? 0
        : Math.max(1, Math.round(eligible.length * ratio));
    const chosen = eligible.slice(0, selected);
    const outside = chosen.filter((card) => new Date(card.fsrs!.due).getTime() > examEnd);

    // The same number the user typed: "3 days left" spreads over 3 days
    // (today included), and "0 days" crams everything into today.
    const days = Math.max(1, daysLeft(plan.date));
    const cap = Math.max(1, plugin.settings.maxReviewsPerDay);
    const perDay = outside.length === 0
        ? 0
        : Math.min(cap, Math.max(1, Math.ceil(outside.length / days)));

    return {
        estimate: {
            eligible: eligible.length,
            selected,
            moved: outside.length,
            days,
            perDay,
            cap,
            overloaded: outside.length > cap * days,
        },
        outside,
        examEnd,
    };
}

/** What the build would do, without touching anything - drives the settings text. */
export async function estimateExamPlan(
    plugin: FakeCardPlugin,
    plan: ExamPlanConfig,
): Promise<ExamPlanEstimate> {
    const { estimate } = await planWork(plugin, plan);
    return estimate;
}

async function applyExamPlan(plugin: FakeCardPlugin, plan: ExamPlanConfig): Promise<void> {
    const { estimate, outside } = await planWork(plugin, plan);

    if (estimate.eligible === 0) {
        new Notice(planDeckNames(plan).length > 0
            ? ttf('No reviewed cards in: {decks}.', { decks: planDeckNames(plan).join(', ') })
            : tt('No reviewed cards to plan yet.'));
        return;
    }
    if (outside.length === 0) {
        new Notice(tt('Every selected card is already due before the exam.'));
        return;
    }

    const days = Math.max(1, daysLeft(plan.date));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Backup before touching scheduling.
    const dir = normalizePath(`${plugin.settings.libraryFolder}/backup`);
    if (!plugin.app.vault.getAbstractFileByPath(dir)) {
        await plugin.app.vault.createFolder(dir);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = normalizePath(`${dir}/exam-plan-${plan.id}-${stamp}.json`);
    await plugin.app.vault.create(path, JSON.stringify(outside, null, 2));

    // Spread evenly over the window: day 0, day 1, ... then wrap.
    for (let i = 0; i < outside.length; i++) {
        const card = outside[i];
        if (!card.fsrs) continue;
        const dayIndex = Math.floor(i / estimate.perDay);
        const offsetDays = Math.min(days - 1, Math.max(0, dayIndex));
        // 09:00 of that day: a card placed on today is due immediately when
        // the morning has already passed.
        card.fsrs.due = new Date(today.getTime() + offsetDays * DAY_MS + 9 * 3600000);
        card.updated = new Date().toISOString();
        await plugin.store.save(card);
    }

    new Notice(ttf('{name}: {selected}/{eligible} card(s) selected, {moved} moved to ~{perDay}/day over {days} days. Backup: {path}', {
        name: plan.name,
        selected: estimate.selected,
        eligible: estimate.eligible,
        moved: outside.length,
        perDay: estimate.perDay,
        days,
        path,
    }));
    if (estimate.overloaded) {
        new Notice(
            ttf('Warning: {count} cards over {days} days is more than {cap}/day. Lower the share, or raise the daily review limit.', {
                count: outside.length,
                days,
                cap: estimate.cap,
            }),
            10000,
        );
    }
}

/**
 * Build one plan, or let the user pick when several exist. Called from the
 * settings screen (with a plan) and from the command (without one).
 */
export async function buildExamPlan(
    plugin: FakeCardPlugin,
    plan?: ExamPlanConfig,
): Promise<void> {
    if (plan) {
        await applyExamPlan(plugin, plan);
        return;
    }

    const plans = activeExamPlans(plugin.settings.examPlans ?? []);
    if (plans.length === 0) {
        new Notice(tt('Add an exam plan first (Settings -> FakeCard -> Exam plan).'));
        return;
    }
    if (plans.length === 1) {
        await applyExamPlan(plugin, plans[0]);
        return;
    }

    const menu = new Menu();
    for (const entry of plans) {
        menu.addItem((item) => item
            .setTitle(`${entry.name} - ${daysLeft(entry.date)} day(s) left`)
            .onClick(() => {
                void applyExamPlan(plugin, entry);
            }));
    }
    // Pinned to the main window: the command can be fired while the settings
    // popout holds focus, and the menu would open in that window otherwise.
    const doc = plugin.app.workspace.containerEl.ownerDocument;
    const width = doc.defaultView?.innerWidth ?? 0;
    menu.showAtPosition({ x: Math.round(width / 2), y: 120 }, doc);
}
