import { ItemView, WorkspaceLeaf } from 'obsidian';
import { State } from 'ts-fsrs';
import type { CardRecord } from './card';
import type { ReviewLog } from './reviews';
import { renderViewNav } from './viewNav';
import type FakeCardPlugin from '../main';

export const STATS_VIEW_TYPE = 'fakecard-stats';

/**
 * Statistics view.
 *
 * All numbers are generic spaced-repetition metrics (review counts, retention,
 * card states, maturity, due forecast) - implemented from scratch, drawn with
 * CSS bars and a grid heatmap so nothing extra is bundled.
 */
export class StatsView extends ItemView {
    private cards: CardRecord[] = [];
    private recent = new Map<string, ReviewLog[]>();
    private streak = 0;
    private loading = true;

    constructor(leaf: WorkspaceLeaf, private plugin: FakeCardPlugin) {
        super(leaf);
    }

    getViewType(): string {
        return STATS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'fakecard: statistics';
    }

    getIcon(): string {
        return 'bar-chart-2';
    }

    async onOpen(): Promise<void> {
        await this.reload();
    }

    async reload(): Promise<void> {
        this.loading = true;
        this.cards = await this.plugin.store.list();
        // 90 days for the heatmap; the ratings / retention sections use the
        // last 30 of those.
        this.recent = await this.plugin.reviews.recent(90);
        this.streak = await this.plugin.reviews.streak();
        this.loading = false;
        this.render();
    }

    private render(): void {
        const container = this.contentEl;
        container.empty();
        container.addClass('fakecard-stats');
        renderViewNav(container, this.plugin, this.leaf, 'stats');

        if (this.loading) {
            container.createEl('p', { text: 'Loading…' });
            return;
        }

        container.createEl('h2', { text: 'Statistics' });

        const todayKey = this.dayKey(new Date());
        const todayLogs = this.recent.get(todayKey) ?? [];
        // Ratings / retention are windowed to the last 30 days.
        const last30Keys = Array.from(this.recent.keys()).slice(-30);
        const allLogs: ReviewLog[] = [];
        for (const key of last30Keys) allLogs.push(...(this.recent.get(key) ?? []));

        // --- Today ---
        const todayReviews = todayLogs.length;
        const todayNew = todayLogs.filter((log) => log.wasNew).length;
        const todayCorrect = todayLogs.filter((log) => log.rating >= 3).length;
        const todayAccuracy = todayReviews > 0 ? Math.round((todayCorrect / todayReviews) * 100) : 0;
        const todayMinutes = Math.round(todayLogs.reduce((sum, log) => sum + (log.durationMs ?? 0), 0) / 60000);

        const cards = container.createDiv({ cls: 'fakecard-stats-cards' });
        this.statCard(cards, 'Reviewed today', String(todayReviews));
        this.statCard(cards, 'New today', String(todayNew));
        this.statCard(cards, 'Accuracy today', `${todayAccuracy}%`);
        this.statCard(cards, 'Time today', `${todayMinutes} min`);
        this.statCard(cards, 'Streak', `${this.streak} day(s)`);
        this.statCard(cards, 'All cards', String(this.cards.length));

        // --- Ratings (last 30 days) ---
        container.createEl('h3', { text: 'Ratings, last 30 days' });
        const ratingCounts = [0, 0, 0, 0];
        for (const log of allLogs) {
            if (log.rating >= 1 && log.rating <= 4) ratingCounts[log.rating - 1]++;
        }
        const ratingTotal = allLogs.length;
        const ratingRow = container.createDiv({ cls: 'fakecard-stats-ratings' });
        const ratingLabels = ['Again', 'Hard', 'Good', 'Easy'];
        const ratingClasses = ['is-again', 'is-hard', 'is-good', 'is-easy'];
        ratingLabels.forEach((label, index) => {
            const chip = ratingRow.createDiv({ cls: `fakecard-rating-chip ${ratingClasses[index]}` });
            chip.createSpan({ cls: 'fakecard-stat-chip-value', text: String(ratingCounts[index]) });
            const percent = ratingTotal > 0 ? Math.round((ratingCounts[index] / ratingTotal) * 100) : 0;
            chip.createSpan({ cls: 'fakecard-stat-chip-label', text: `${label} ${percent}%` });
        });

        // --- True retention ---
        const retention = ratingTotal > 0
            ? Math.round(((ratingTotal - ratingCounts[0]) / ratingTotal) * 100)
            : 0;
        container.createEl('h3', { text: 'True retention, last 30 days' });
        container.createDiv({
            cls: 'fakecard-stats-retention',
            text: `${retention}%  (${ratingTotal - ratingCounts[0]} / ${ratingTotal} reviews rated Hard, Good or Easy)`,
        });

        // --- Card states ---
        const states = new Map<number, number>([
            [State.New, 0],
            [State.Learning, 0],
            [State.Review, 0],
            [State.Relearning, 0],
        ]);
        for (const card of this.cards) {
            const state = card.fsrs ? card.fsrs.state : State.New;
            states.set(state, (states.get(state) ?? 0) + 1);
        }

        container.createEl('h3', { text: 'Card states' });
        const stateRow = container.createDiv({ cls: 'fakecard-stats-states' });
        const stateLabels: Array<[State, string]> = [
            [State.New, 'New'],
            [State.Learning, 'Learning'],
            [State.Review, 'Reviewing'],
            [State.Relearning, 'Relearning'],
        ];
        for (const [state, label] of stateLabels) {
            const chip = stateRow.createDiv({ cls: 'fakecard-stat-chip' });
            chip.createSpan({ cls: 'fakecard-stat-chip-value', text: String(states.get(state) ?? 0) });
            chip.createSpan({ cls: 'fakecard-stat-chip-label', text: label });
        }

        // --- Maturity (Anki style: < 21 days = young, >= 21 = mature) ---
        let young = 0;
        let mature = 0;
        for (const card of this.cards) {
            if (!card.fsrs) continue;
            if ((card.fsrs.scheduled_days ?? 0) >= 21) mature++;
            else young++;
        }
        container.createEl('h3', { text: 'Maturity' });
        const maturityRow = container.createDiv({ cls: 'fakecard-stats-states' });
        for (const [label, value] of [['Young (< 21 days)', young], ['Mature (≥ 21 days)', mature]] as Array<[string, number]>) {
            const chip = maturityRow.createDiv({ cls: 'fakecard-stat-chip' });
            chip.createSpan({ cls: 'fakecard-stat-chip-value', text: String(value) });
            chip.createSpan({ cls: 'fakecard-stat-chip-label', text: label });
        }

        // --- Heatmap, last 90 days ---
        container.createEl('h3', { text: 'Review heatmap, last 90 days' });
        const heat = new Map<string, number>();
        const today = new Date();
        for (let offset = 89; offset >= 0; offset--) {
            const date = new Date(today);
            date.setDate(today.getDate() - offset);
            heat.set(this.dayKey(date), 0);
        }
        for (const [day, logs] of this.recent) {
            if (heat.has(day)) heat.set(day, logs.length);
        }
        // Also fill days older than the 30-day window from disk, if present.
        this.renderHeatmap(container, Array.from(heat.entries()));

        // --- Reviews, last 30 days ---
        container.createEl('h3', { text: 'Reviews, last 30 days' });
        this.barChart(container, last30Keys.map((day) => ({
            label: day.slice(5),
            value: (this.recent.get(day) ?? []).length,
        })));

        // --- Due forecast, next 30 days ---
        container.createEl('h3', { text: 'Due forecast, next 30 days' });
        const forecast = new Map<string, number>();
        for (let offset = 0; offset < 30; offset++) {
            const date = new Date(today);
            date.setDate(today.getDate() + offset);
            forecast.set(this.dayKey(date), 0);
        }
        for (const card of this.cards) {
            if (!card.fsrs || card.fsrs.state === State.New) continue;
            const key = this.dayKey(new Date(card.fsrs.due));
            if (forecast.has(key)) forecast.set(key, (forecast.get(key) ?? 0) + 1);
        }

        const forecastValues = Array.from(forecast.values());
        const forecastTotal = forecastValues.reduce((sum, value) => sum + value, 0);
        const forecastAverage = Math.round(forecastTotal / forecastValues.length);
        const peakValue = Math.max(0, ...forecastValues);
        const peakDay = Array.from(forecast.entries()).find(([, value]) => value === peakValue)?.[0] ?? '';
        const busyDays = forecastValues.filter((value) => value > forecastAverage * 2).length;

        container.createDiv({
            cls: 'fakecard-stats-forecast-summary',
            text: `Average ${forecastAverage}/day · Peak ${peakValue} (${peakDay.slice(5)}) · ${busyDays} day(s) above 2× average`,
        });

        this.barChart(container, Array.from(forecast.entries()).map(([day, value]) => ({
            label: day.slice(5),
            value,
        })));

        // --- Hardest cards ---
        container.createEl('h3', { text: 'Hardest cards' });
        const hardest = this.cards
            .filter((card) => (card.reviews ?? 0) > 0)
            .map((card) => ({
                card,
                misses: (card.reviews ?? 0) - (card.correct ?? 0),
            }))
            .filter((entry) => entry.misses > 0)
            .sort((a, b) => b.misses - a.misses)
            .slice(0, 5);

        if (hardest.length === 0) {
            container.createEl('p', { cls: 'fakecard-stats-empty', text: 'No struggling cards yet.' });
        } else {
            const list = container.createDiv({ cls: 'fakecard-stats-hardest' });
            for (const { card, misses } of hardest) {
                const row = list.createDiv({ cls: 'fakecard-stats-hardest-row' });
                row.createSpan({ cls: 'fakecard-stats-hardest-front', text: card.front.slice(0, 70) });
                row.createSpan({ cls: 'fakecard-stats-hardest-count', text: `${misses} miss(es)` });
            }
        }
    }

    private renderHeatmap(parent: HTMLElement, entries: Array<[string, number]>): void {
        const max = Math.max(1, ...entries.map(([, value]) => value));
        const grid = parent.createDiv({ cls: 'fakecard-heatmap' });
        for (const [day, value] of entries) {
            const cell = grid.createDiv({ cls: 'fakecard-heatmap-cell', attr: { 'aria-label': `${day}: ${value}` } });
            if (value > 0) {
                cell.style.opacity = String(0.25 + (value / max) * 0.75);
                cell.addClass('is-active');
            }
        }
    }

    private dayKey(date: Date): string {
        const y = date.getFullYear();
        const m = date.getMonth() + 1;
        const d = date.getDate();
        return `${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}`;
    }

    private statCard(parent: HTMLElement, label: string, value: string): void {
        const card = parent.createDiv({ cls: 'fakecard-stat-card' });
        card.createDiv({ cls: 'fakecard-stat-value', text: value });
        card.createDiv({ cls: 'fakecard-stat-label', text: label });
    }

    private barChart(parent: HTMLElement, data: Array<{ label: string; value: number }>): void {
        const max = Math.max(1, ...data.map((entry) => entry.value));
        const chart = parent.createDiv({ cls: 'fakecard-chart' });
        for (const entry of data) {
            const bar = chart.createDiv({
                cls: 'fakecard-chart-bar',
                attr: { 'aria-label': `${entry.label}: ${entry.value}` },
            });
            bar.style.height = `${Math.max(2, Math.round((entry.value / max) * 100))}%`;
            bar.style.opacity = entry.value === 0 ? '0.25' : '1';
        }
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }
}
