import { App, Notice, TFolder, TFile, normalizePath } from 'obsidian';
import { ttf } from './i18n';

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
     * Hard points this review earned by recalling too slowly: one step past
     * the budget is worth a fraction of a Hard (0.5 by default). The rating
     * itself is unaffected.
     */
    slowPoints?: number;
    /** Older entries: a slow recall counted as one point. */
    slow?: boolean;
    /**
     * The user said "mixed up" when a slow reveal asked: the two answers were
     * fighting, rather than nothing coming back. Used to suggest a comparison
     * child card later.
     */
    mixed?: boolean;
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
    /**
     * Parsed days, kept for the session. A rating reads today's log twice
     * (quota and stats), and the status bar reads it again; without this every
     * one of those reads re-parsed the same file.
     */
    private cache = new Map<string, ReviewLog[]>();
    /** Day files we just wrote; their vault event must keep the cache. */
    private writing = new Set<string>();

    constructor(private app: App, private libraryFolder: string) {}

    /** Drop the cached days (a vault-wide rebuild, or an external edit). */
    invalidate(): void {
        this.cache.clear();
    }

    /**
     * True when the path was written by us, so the vault watcher keeps the
     * cache instead of dropping it after every rating.
     */
    consumeWrite(path: string): boolean {
        if (!this.writing.has(path)) return false;
        this.writing.delete(path);
        return true;
    }

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

    /**
     * One day's entries, and whether the file was unusable.
     *
     * A corrupt day file must not be rewritten over: that used to leave the
     * day with only the newest entry. The caller quarantines it instead.
     */
    private async readDay(file: TFile): Promise<{ logs: ReviewLog[]; corrupt: boolean }> {
        try {
            const parsed = JSON.parse(await this.app.vault.cachedRead(file)) as ReviewLog[];
            return Array.isArray(parsed)
                ? { logs: parsed, corrupt: false }
                : { logs: [], corrupt: true };
        } catch {
            return { logs: [], corrupt: true };
        }
    }

    /**
     * Move an unreadable day file aside so a fresh one can be written.
     *
     * Returns false when it could not be moved: the caller must then leave the
     * file alone rather than write over data it could not read.
     */
    private async quarantine(file: TFile): Promise<boolean> {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const target = file.path.replace(/\.json$/i, `.corrupt-${stamp}.json`);
        try {
            await this.app.vault.rename(file, target);
            new Notice(ttf('{name} could not be read, so it was kept as {kept} and a new log started.', {
                name: file.name,
                kept: target.split('/').pop() ?? target,
            }));
            return true;
        } catch (error) {
            console.error('fakecard: could not move the review file aside', file.path, error);
            new Notice(ttf('{name} could not be read and could not be moved aside; it was left untouched.', {
                name: file.name,
            }));
            return false;
        }
    }

    async append(log: ReviewLog): Promise<void> {
        await this.ensure();
        const day = dayKey(new Date(log.at));
        const path = this.dayPath(day);
        const file = this.app.vault.getAbstractFileByPath(path);
        let logs = this.cache.get(day);
        // A cached day whose file disappeared (sync, manual delete) is stale.
        if (logs && !(file instanceof TFile)) logs = undefined;
        let movedAside = false;
        if (!logs) {
            logs = [];
            if (file instanceof TFile) {
                const read = await this.readDay(file);
                if (read.corrupt) {
                    movedAside = await this.quarantine(file);
                    // Could not move it: do not write over a file we cannot read.
                    if (!movedAside) return;
                } else {
                    logs = read.logs;
                }
            }
        }
        const next = [...logs, log];
        const json = JSON.stringify(next, null, 2);
        this.writing.add(path);
        try {
            if (file instanceof TFile && !movedAside) await this.app.vault.modify(file, json);
            else await this.app.vault.create(path, json);
        } catch (error) {
            this.writing.delete(path);
            throw error;
        }
        this.cache.set(day, next);
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
            let existing = this.cache.get(day);
            if (existing && !(file instanceof TFile)) existing = undefined;
            let movedAside = false;
            if (!existing) {
                existing = [];
                if (file instanceof TFile) {
                    const read = await this.readDay(file);
                    if (read.corrupt) {
                        movedAside = await this.quarantine(file);
                        if (!movedAside) continue;
                    } else {
                        existing = read.logs;
                    }
                }
            }

            const seen = new Set(existing.map((log) => `${log.cardId}|${log.at}`));
            const next = [...existing];
            let changed = false;
            for (const log of logs) {
                const key = `${log.cardId}|${log.at}`;
                if (seen.has(key)) continue;
                seen.add(key);
                next.push(log);
                changed = true;
                added++;
            }
            if (!changed) continue;

            // Keep the file chronological; the readers rely on it.
            next.sort((a, b) => a.at.localeCompare(b.at));
            const json = JSON.stringify(next, null, 2);
            this.writing.add(path);
            try {
                if (file instanceof TFile && !movedAside) await this.app.vault.modify(file, json);
                else await this.app.vault.create(path, json);
            } catch (error) {
                this.writing.delete(path);
                throw error;
            }
            this.cache.set(day, next);
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
        if (!(file instanceof TFile)) {
            this.cache.delete(day);
            return;
        }

        let logs = this.cache.get(day);
        if (!logs) {
            try {
                const parsed = JSON.parse(await this.app.vault.read(file)) as ReviewLog[];
                if (!Array.isArray(parsed)) return;
                logs = parsed;
            } catch {
                return;
            }
        }

        const next = logs.filter((log) => !(log.cardId === cardId && log.at === at));
        if (next.length === logs.length) return;
        this.writing.add(path);
        try {
            await this.app.vault.modify(file, JSON.stringify(next, null, 2));
        } catch (error) {
            this.writing.delete(path);
            throw error;
        }
        this.cache.set(day, next);
    }

    async forDay(date: Date): Promise<ReviewLog[]> {
        const day = dayKey(date);
        const cached = this.cache.get(day);
        if (cached) return cached;

        const path = this.dayPath(day);
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) {
            this.cache.set(day, []);
            return [];
        }
        try {
            const parsed = JSON.parse(await this.app.vault.cachedRead(file)) as ReviewLog[];
            if (!Array.isArray(parsed)) return [];
            this.cache.set(day, parsed);
            return parsed;
        } catch {
            // Unreadable: do not cache, so a later append can quarantine it.
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
