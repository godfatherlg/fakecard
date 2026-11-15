import { App, TFile, normalizePath } from 'obsidian';

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

    private static dayKey(date: Date): string {
        const y = date.getFullYear();
        const m = `${date.getMonth() + 1}`.padStart(2, '0');
        const d = `${date.getDate()}`.padStart(2, '0');
        return `${y}-${m}-${d}`;
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
        const day = ReviewStore.dayKey(new Date(log.at));
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

    async forDay(date: Date): Promise<ReviewLog[]> {
        const path = this.dayPath(ReviewStore.dayKey(date));
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) return [];
        try {
            const parsed = JSON.parse(await this.app.vault.cachedRead(file)) as ReviewLog[];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    /** Last `days` days, oldest first, grouped by day key. */
    async recent(days: number): Promise<Map<string, ReviewLog[]>> {
        const out = new Map<string, ReviewLog[]>();
        const today = new Date();
        for (let offset = days - 1; offset >= 0; offset--) {
            const date = new Date(today);
            date.setDate(today.getDate() - offset);
            const key = ReviewStore.dayKey(date);
            out.set(key, await this.forDay(date));
        }
        return out;
    }

    /**
     * The last `limit` reviews of one card, newest first (used by the child
     * card graduation check).
     */
    async recentForCard(cardId: string, limit: number): Promise<ReviewLog[]> {
        const days = await this.recent(30);
        const logs: ReviewLog[] = [];
        const keys = Array.from(days.keys()).reverse();
        for (const key of keys) {
            const entries = days.get(key) ?? [];
            for (let i = entries.length - 1; i >= 0; i--) {
                const log = entries[i];
                if (log.cardId !== cardId) continue;
                logs.push(log);
                if (logs.length >= limit) return logs;
            }
        }
        return logs;
    }

    /** Consecutive days with at least one review, counting back from today. */
    async streak(): Promise<number> {
        const recent = await this.recent(365);
        const keys = Array.from(recent.keys()).reverse();
        let streak = 0;
        for (const key of keys) {
            const logs = recent.get(key) ?? [];
            if (logs.length === 0) break;
            streak++;
        }
        return streak;
    }
}
