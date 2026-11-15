import { ItemView, WorkspaceLeaf } from 'obsidian';
import { State } from 'ts-fsrs';
import type { CardRecord } from './card';
import type { ReviewLog } from './reviews';
import { tt, ttf } from './i18n';
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
    /** Every day on record, for the heatmap. */
    private history = new Map<string, ReviewLog[]>();
    private streak = 0;
    private loading = true;

    constructor(leaf: WorkspaceLeaf, private plugin: FakeCardPlugin) {
        super(leaf);
    }

    getViewType(): string {
        return STATS_VIEW_TYPE;
    }

    getDisplayText(): string {
        return tt('Statistics');
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
        // The ratings / retention sections use the last 30 days; the heatmap
        // shows the whole history.
        this.recent = await this.plugin.reviews.recent(90);
        this.history = await this.plugin.reviews.all();
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
            container.createEl('p', { text: tt('Loading…') });
            return;
        }

        container.createEl('h2', { text: tt('Statistics') });

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
        this.statCard(cards, tt('Reviewed today'), String(todayReviews));
        this.statCard(cards, tt('New today'), String(todayNew));
        this.statCard(cards, tt('Accuracy today'), `${todayAccuracy}%`);
        this.statCard(cards, tt('Time today'), ttf('{count} min', { count: todayMinutes }));
        this.statCard(cards, tt('Streak'), ttf('{count} day(s)', { count: this.streak }));
        this.statCard(cards, tt('All cards'), String(this.cards.length));

        // --- Ratings (last 30 days) ---
        container.createEl('h3', { text: tt('Ratings, last 30 days') });
        const ratingCounts = [0, 0, 0, 0];
        for (const log of allLogs) {
            if (log.rating >= 1 && log.rating <= 4) ratingCounts[log.rating - 1]++;
        }
        const ratingTotal = allLogs.length;
        const ratingRow = container.createDiv({ cls: 'fakecard-stats-ratings' });
        const ratingLabels = ['Again', 'Hard', 'Good', 'Easy'].map((label) => tt(label));
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
        container.createEl('h3', { text: tt('True retention, last 30 days') });
        container.createDiv({
            cls: 'fakecard-stats-retention',
            text: ttf('{percent}%  ({passed} / {total} reviews rated Hard, Good or Easy)', {
                percent: retention,
                passed: ratingTotal - ratingCounts[0],
                total: ratingTotal,
            }),
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

        container.createEl('h3', { text: tt('Card states') });
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
            chip.createSpan({ cls: 'fakecard-stat-chip-label', text: tt(label) });
        }

        // --- Maturity (Anki style: < 21 days = young, >= 21 = mature) ---
        let young = 0;
        let mature = 0;
        for (const card of this.cards) {
            if (!card.fsrs) continue;
            if ((card.fsrs.scheduled_days ?? 0) >= 21) mature++;
            else young++;
        }
        container.createEl('h3', { text: tt('Maturity') });
        const maturityRow = container.createDiv({ cls: 'fakecard-stats-states' });
        for (const [label, value] of [['Young (< 21 days)', young], ['Mature (≥ 21 days)', mature]] as Array<[string, number]>) {
            const chip = maturityRow.createDiv({ cls: 'fakecard-stat-chip' });
            chip.createSpan({ cls: 'fakecard-stat-chip-value', text: String(value) });
            chip.createSpan({ cls: 'fakecard-stat-chip-label', text: tt(label) });
        }

        // --- Heatmap, every day on record ---
        container.createEl('h3', { text: tt('Review heatmap') });
        this.renderHeatmap(container, this.heatmapSeries());

        // --- Reviews, last 30 days ---
        container.createEl('h3', { text: tt('Reviews, last 30 days') });
        this.barChart(container, last30Keys.map((day) => ({
            label: day.slice(5),
            value: (this.recent.get(day) ?? []).length,
        })));

        // --- Due forecast, next 30 days ---
        container.createEl('h3', { text: tt('Due forecast, next 30 days') });
        const today = new Date();
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
            text: ttf('Average {average}/day · Peak {peak} ({peakDay}) · {busy} day(s) above 2x average', {
                average: forecastAverage,
                peak: peakValue,
                peakDay: peakDay.slice(5),
                busy: busyDays,
            }),
        });

        this.barChart(container, Array.from(forecast.entries()).map(([day, value]) => ({
            label: day.slice(5),
            value,
        })));

        // --- Hardest cards ---
        container.createEl('h3', { text: tt('Hardest cards') });
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
            container.createEl('p', { cls: 'fakecard-stats-empty', text: tt('No struggling cards yet.') });
        } else {
            const list = container.createDiv({ cls: 'fakecard-stats-hardest' });
            for (const { card, misses } of hardest) {
                const row = list.createDiv({ cls: 'fakecard-stats-hardest-row' });
                row.createSpan({ cls: 'fakecard-stats-hardest-front', text: card.front.slice(0, 70) });
                row.createSpan({ cls: 'fakecard-stats-hardest-count', text: ttf('{count} miss(es)', { count: misses }) });
            }
        }
    }

    /** One entry per day from the first day on record up to today. */
    private heatmapSeries(): Array<[string, number]> {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const start = new Date(today);
        const first = Array.from(this.history.keys()).sort()[0];
        if (first) {
            const recorded = new Date(`${first}T00:00:00`);
            if (recorded < start) start.setTime(recorded.getTime());
        }
        // A year of squares, so the strip reads as a calendar even when the
        // library is fresh; older records extend it further back.
        const earliest = new Date(today);
        earliest.setDate(today.getDate() - 364);
        if (start > earliest) start.setTime(earliest.getTime());

        const series: Array<[string, number]> = [];
        const cursor = new Date(start);
        while (cursor <= today) {
            const key = this.dayKey(cursor);
            series.push([key, this.history.get(key)?.length ?? 0]);
            cursor.setDate(cursor.getDate() + 1);
        }
        return series;
    }

    /**
     * GitHub-style contribution strip: one 12px square per day, seven rows per
     * column, scrolling sideways instead of shrinking, so the whole history
     * stays readable however wide the pane is.
     */
    private renderHeatmap(parent: HTMLElement, entries: Array<[string, number]>): void {
        const wrap = parent.createDiv({ cls: 'fakecard-heatmap-wrap' });
        const earlier = wrap.createEl('button', {
            cls: 'fakecard-heatmap-page',
            text: '‹',
            attr: { 'aria-label': tt('Earlier days') },
        });
        const scroll = wrap.createDiv({ cls: 'fakecard-heatmap-scroll' });
        const grid = scroll.createDiv({ cls: 'fakecard-heatmap' });

        // Pad the first column so every column holds Sunday..Saturday.
        const firstDay = new Date(`${entries[0]?.[0] ?? this.dayKey(new Date())}T00:00:00`);
        for (let pad = 0; pad < firstDay.getDay(); pad++) {
            grid.createDiv({ cls: 'fakecard-heatmap-cell is-empty' });
        }

        const max = Math.max(1, ...entries.map(([, value]) => value));
        for (const [day, value] of entries) {
            const cell = grid.createDiv({
                cls: 'fakecard-heatmap-cell',
                attr: { 'aria-label': `${day}: ${value}` },
            });
            if (value > 0) {
                cell.style.opacity = String(0.35 + (value / max) * 0.65);
                cell.addClass('is-active');
            }
        }

        const used = firstDay.getDay() + entries.length;
        for (let pad = used % 7; pad > 0 && pad < 7; pad++) {
            grid.createDiv({ cls: 'fakecard-heatmap-cell is-empty' });
        }

        const later = wrap.createEl('button', {
            cls: 'fakecard-heatmap-page',
            text: '›',
            attr: { 'aria-label': tt('Later days') },
        });

        this.enableDragScroll(scroll);
        const page = (direction: 1 | -1): void => {
            scroll.scrollBy({ left: direction * scroll.clientWidth * 0.9, behavior: 'smooth' });
        };
        earlier.addEventListener('click', () => page(-1));
        later.addEventListener('click', () => page(1));

        window.requestAnimationFrame(() => {
            // Open at the present instead of the oldest day on record.
            scroll.scrollLeft = scroll.scrollWidth;
            // Paging only matters when the strip is wider than the pane.
            const overflows = scroll.scrollWidth > scroll.clientWidth + 1;
            earlier.toggleClass('is-hidden', !overflows);
            later.toggleClass('is-hidden', !overflows);
        });
    }

    /** Drag the strip with the mouse; the wheel and the buttons still work. */
    private enableDragScroll(el: HTMLElement): void {
        let startX = 0;
        let startLeft = 0;
        let dragging = false;

        el.addEventListener('pointerdown', (event) => {
            // A press on the scrollbar itself belongs to the native drag.
            if (event.target === el) return;
            dragging = true;
            startX = event.clientX;
            startLeft = el.scrollLeft;
            el.addClass('is-dragging');
        });
        el.addEventListener('pointermove', (event) => {
            if (!dragging) return;
            el.scrollLeft = startLeft - (event.clientX - startX);
        });
        const stop = (): void => {
            if (!dragging) return;
            dragging = false;
            el.removeClass('is-dragging');
        };
        el.addEventListener('pointerup', stop);
        el.addEventListener('pointerleave', stop);
        el.addEventListener('pointercancel', stop);
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
