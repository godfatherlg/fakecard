import { App, TFolder, TFile, normalizePath } from 'obsidian';

export interface ReviewLog {
    cardId: string;
    /** ISO timestamp of the review. */
    at: string;
    /** FSRS rating: 1 Again / 2 Hard / 3 Good / 4 Easy. */
    rating: number;
    /** True when this was the card's first review (a "new card"). */
    wasNew: boolean;
    /** Time spent on the card, in milliseconds (front shown -> rated). */
    durationMs?: number;
    /**
     * Rated before the card was due - "study ahead". Such a review does not
     * consume the day's allowance for due cards.
     */
    ahead?: boolean;
}

/** YYYY-MM-DD in local time, the name of the day file. */
export function dayKey(date: Date): string {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
}

/**
 * One JSON file per day: Fake Cards/reviews/YYYY-MM-DD.json.
 *
 * Daily limits and the stats page both read these files. Per-day files keep
 * reads small (today + the last 30 days) and make the log easy to inspect by
 * hand.
 */
export class ReviewStore {
    constructor(private app: App, private libraryFolder: string) {}

    private get reviewsFolder(): string {
        return normalizePath(`${this.libraryFolder}/reviews`);
    }

    private dayPath(day: string): string {
        return normalizePath(`${this.reviewsFolder}/${day}.json`);
    }


    async ensure(): Promise<void> {
        if (!this.app.vault.getAbstractFileByPath(normalizePath(this.libraryFolder))) {
            await this.app.vault.createFolder(normalizePath(this.libraryFolder));
        }
        if (!this.app.vault.getAbstractFileByPath(this.reviewsFolder)) {
            await this.app.vault.createFolder(this.reviewsFolder);
        }
    }

    async append(log: ReviewLog): Promise<void> {
        await this.ensure();
        const day = dayKey(new Date(log.at));
        const path = this.dayPath(day);
        const file = this.app.vault.getAbstractFileByPath(path);
        let logs: ReviewLog[] = [];
        if (file instanceof TFile) {
            try {
                logs = JSON.parse(await this.app.vault.cachedRead(file)) as ReviewLog[];
                if (!Array.isArray(logs)) logs = [];
            } catch {
                logs = [];
            }
        }
        logs.push(log);
        const json = JSON.stringify(logs, null, 2);
        if (file instanceof TFile) await this.app.vault.modify(file, json);
        else await this.app.vault.create(path, json);
    }

    /**
     * Add a batch of entries (an Anki import replays years of reviews at once).
     *
     * Grouped per day so every file is written once. Entries already on disk
     * are skipped, so importing the same deck twice cannot double the history.
     * Returns how many entries were actually new.
     */
    async appendMany(entries: readonly ReviewLog[]): Promise<number> {
        if (entries.length === 0) return 0;
        await this.ensure();

        const byDay = new Map<string, ReviewLog[]>();
        for (const log of entries) {
            const day = dayKey(new Date(log.at));
            const list = byDay.get(day) ?? [];
            list.push(log);
            byDay.set(day, list);
        }

        let added = 0;
        for (const [day, logs] of byDay) {
            const path = this.dayPath(day);
            const file = this.app.vault.getAbstractFileByPath(path);
            let existing: ReviewLog[] = [];
            if (file instanceof TFile) {
                try {
                    const parsed = JSON.parse(await this.app.vault.read(file)) as ReviewLog[];
                    if (Array.isArray(parsed)) existing = parsed;
                } catch {
                    existing = [];
                }
            }

            const seen = new Set(existing.map((log) => `${log.cardId}|${log.at}`));
            let changed = false;
            for (const log of logs) {
                const key = `${log.cardId}|${log.at}`;
                if (seen.has(key)) continue;
                seen.add(key);
                existing.push(log);
                changed = true;
                added++;
            }
            if (!changed) continue;

            // Keep the file chronological; the readers rely on it.
            existing.sort((a, b) => a.at.localeCompare(b.at));
            const json = JSON.stringify(existing, null, 2);
            if (file instanceof TFile) await this.app.vault.modify(file, json);
            else await this.app.vault.create(path, json);
        }
        return added;
    }

    /**
     * Drop one entry. A rating that gets undone must not keep counting towards
     * the daily limits or the stats, so the log entry is removed again.
     */
    async remove(cardId: string, at: string): Promise<void> {
        const day = dayKey(new Date(at));
        const path = this.dayPath(day);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return;

        let logs: ReviewLog[];
        try {
            const parsed = JSON.parse(await this.app.vault.read(file)) as ReviewLog[];
            if (!Array.isArray(parsed)) return;
            logs = parsed;
        } catch {
            return;
        }

        // Newest first: the entry just written is the last one for this card.
        for (let i = logs.length - 1; i >= 0; i--) {
            if (logs[i].cardId === cardId && logs[i].at === at) {
                logs.splice(i, 1);
                await this.app.vault.modify(file, JSON.stringify(logs, null, 2));
                return;
            }
        }
    }

    async forDay(date: Date): Promise<ReviewLog[]> {
        const path = this.dayPath(dayKey(date));
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return [];
        try {
            const parsed = JSON.parse(await this.app.vault.cachedRead(file)) as ReviewLog[];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    /**
     * Last `days` days, oldest first, grouped by day key.
     *
     * The days are read in parallel: on a cold vault every miss costs a round
     * trip to the disk, and a page that waits for them one by one feels stuck.
     */
    async recent(days: number): Promise<Map<string, ReviewLog[]>> {
        const dates: Date[] = [];
        const today = new Date();
        for (let offset = days - 1; offset >= 0; offset--) {
            const date = new Date(today);
            date.setDate(today.getDate() - offset);
            dates.push(date);
        }
        const logs = await Promise.all(dates.map((date) => this.forDay(date)));
        const out = new Map<string, ReviewLog[]>();
        dates.forEach((date, index) => out.set(dayKey(date), logs[index]));
        return out;
    }

    /**
     * Every day that has a log file, oldest first.
     *
     * The heatmap shows the whole history, so it cannot walk a fixed window of
     * days: it lists the folder instead and reads only the days that exist.
     */
    async all(): Promise<Map<string, ReviewLog[]>> {
        const folder = this.app.vault.getAbstractFileByPath(this.reviewsFolder);
        if (!(folder instanceof TFolder)) return new Map();

        const days = folder.children
            .filter((child): child is TFile => (
                child instanceof TFile && /^\d{4}-\d{2}-\d{2}\.json$/.test(child.name)
            ))
            .map((child) => child.name.slice(0, 10))
            .sort();

        const loaded = await Promise.all(days.map(async (day): Promise<[string, ReviewLog[]] | null> => {
            const file = this.app.vault.getAbstractFileByPath(this.dayPath(day));
            if (!(file instanceof TFile)) return null;
            try {
                const parsed = JSON.parse(await this.app.vault.cachedRead(file)) as ReviewLog[];
                return Array.isArray(parsed) ? [day, parsed] : null;
            } catch {
                // An unreadable day is skipped rather than failing the page.
                return null;
            }
        }));

        const out = new Map<string, ReviewLog[]>();
        for (const entry of loaded) {
            if (entry) out.set(entry[0], entry[1]);
        }
        return out;
    }

    /**
     * The last `limit` reviews of one card, newest first (used by the child
     * card checks).
     *
     * Walks back day by day and stops as soon as enough ratings are found, so a
     * wide `maxDays` costs nothing for cards that were reviewed recently.
     */
    async recentForCard(cardId: string, limit: number, maxDays = 30): Promise<ReviewLog[]> {
        const logs: ReviewLog[] = [];
        const today = new Date();
        for (let offset = 0; offset < maxDays && logs.length < limit; offset++) {
            const date = new Date(today);
            date.setDate(today.getDate() - offset);
            const entries = await this.forDay(date);
            for (let i = entries.length - 1; i >= 0 && logs.length < limit; i--) {
                if (entries[i].cardId === cardId) logs.push(entries[i]);
            }
        }
        return logs;
    }

}

/**
 * The last `days` day keys, oldest first, filled from a history map.
 *
 * Derived from a map that is already in memory: the statistics page needs the
 * whole history anyway, so nothing is read a second time to build its window.
 */
export function lastDays(
    history: Map<string, ReviewLog[]>,
    days: number,
): Map<string, ReviewLog[]> {
    const out = new Map<string, ReviewLog[]>();
    const today = new Date();
    for (let offset = days - 1; offset >= 0; offset--) {
        const date = new Date(today);
        date.setDate(today.getDate() - offset);
        const key = dayKey(date);
        out.set(key, history.get(key) ?? []);
    }
    return out;
}

/** Consecutive days with at least one review, counting back from today. */
export function dayStreak(history: Map<string, ReviewLog[]>): number {
    let streak = 0;
    const today = new Date();
    for (let offset = 0; offset < 3650; offset++) {
        const date = new Date(today);
        date.setDate(today.getDate() - offset);
        if ((history.get(dayKey(date)) ?? []).length === 0) break;
        streak++;
    }
    return streak;
}
