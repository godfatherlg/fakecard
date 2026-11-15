import { normalizePath, Notice } from 'obsidian';
import type FakeCardPlugin from '../main';

const DAY_MS = 86400000;

/**
 * Exam plan: spread the selected cards over the days until the exam.
 *
 * - Only the decks listed in settings (all when the list is empty).
 * - Hardest cards first (FSRS difficulty), limited by the share setting.
 * - Any selected card due after the exam is pulled into the remaining window
 *   and spread evenly (the same number per day), so every day's load stays
 *   flat instead of everything landing at the end.
 * - Cards already due before the exam keep their FSRS schedule, which already
 *   makes hard cards come back more often.
 * - Never more than the daily review cap per day; warn when the window cannot
 *   hold the selected cards at all.
 */
export async function buildExamPlan(plugin: FakeCardPlugin): Promise<void> {
    const exam = plugin.settings.examDate.trim();
    if (!exam) {
        new Notice('Set an exam date first (Settings -> FakeCard -> Exam date).');
        return;
    }
    const examEnd = new Date(`${exam}T23:59:59`).getTime();
    const now = Date.now();
    if (!Number.isFinite(examEnd) || examEnd <= now) {
        new Notice('The exam date is invalid or in the past.');
        return;
    }

    const cards = await plugin.store.list();
    const deckNames = plugin.settings.examDecks
        .split(/[,，\s]+/)
        .map((name) => name.trim())
        .filter((name) => name.length > 0);

    // Only the chosen decks (all when the list is empty), then hardest first
    // so the difficult cards enter the plan before the easy ones.
    const eligible = cards
        .filter((card) => card.fsrs && !card.suspended && !card.graduated)
        .filter((card) => deckNames.length === 0
            || deckNames.includes(card.deck ?? 'default'))
        .sort((a, b) => (b.fsrs!.difficulty ?? 0) - (a.fsrs!.difficulty ?? 0));

    if (eligible.length === 0) {
        new Notice(deckNames.length > 0
            ? `No reviewed cards in: ${deckNames.join(', ')}.`
            : 'No reviewed cards to plan yet.');
        return;
    }

    const ratio = Math.min(100, Math.max(10, plugin.settings.examPlanRatio)) / 100;
    const take = Math.max(1, Math.round(eligible.length * ratio));
    const selected = eligible.slice(0, take);

    // Cards that already fall after the exam are the ones we move.
    const outside = selected.filter((card) => new Date(card.fsrs!.due).getTime() > examEnd);
    if (outside.length === 0) {
        new Notice('Every selected card is already due before the exam.');
        return;
    }

    const days = Math.max(1, Math.ceil((examEnd - now) / DAY_MS));
    // Never schedule more per day than the daily review cap.
    const cap = Math.max(1, plugin.settings.maxReviewsPerDay);
    const perDay = Math.min(cap, Math.max(1, Math.ceil(outside.length / days)));
    const overloaded = outside.length > cap * days;

    // Backup before touching scheduling.
    const dir = normalizePath(`${plugin.settings.libraryFolder}/backup`);
    if (!plugin.app.vault.getAbstractFileByPath(dir)) {
        await plugin.app.vault.createFolder(dir);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = normalizePath(`${dir}/exam-plan-${stamp}.json`);
    await plugin.app.vault.create(path, JSON.stringify(outside, null, 2));

    // Spread evenly over the window: day 0, day 1, ... then wrap.
    for (let i = 0; i < outside.length; i++) {
        const card = outside[i];
        if (!card.fsrs) continue;
        const dayIndex = Math.floor(i / perDay);
        const offsetDays = Math.min(days - 1, Math.max(0, dayIndex));
        card.fsrs.due = new Date(now + offsetDays * DAY_MS + 9 * 3600000);
        card.updated = new Date().toISOString();
        await plugin.store.save(card);
    }

    new Notice(
        `Exam plan: ${take}/${eligible.length} card(s) selected, `
        + `${outside.length} moved to ~${perDay}/day over ${days} days. Backup: ${path}`,
    );
    if (overloaded) {
        new Notice(
            `Warning: ${outside.length} cards over ${days} days is more than `
            + `${cap}/day. Lower the share, or raise the daily review limit.`,
            10000,
        );
    }
}
