/**
 * Today's review limit, from settings plus yesterday's result.
 *
 * Pure so the rule can be tested without Obsidian, and shared so the real
 * queue and the status-bar counts cannot drift apart.
 */
export interface DailyLimitInput {
    /** The configured reviews per day. */
    base: number;
    /** "Study more today" allowance for this session. */
    boost: number;
    adaptive: boolean;
    /** Yesterday's reviews, already filtered to the ones that count. */
    yesterday: ReadonlyArray<{ rating: number }>;
}

export function dailyReviewLimit(input: DailyLimitInput): number {
    let limit = input.base + input.boost;
    if (!input.adaptive || input.yesterday.length < 10) return limit;
    const success = input.yesterday.filter((log) => log.rating >= 3).length
        / input.yesterday.length;
    if (success < 0.7) return Math.max(10, Math.round(limit * 0.8));
    if (success > 0.9) return Math.round(limit * 1.1);
    return limit;
}
