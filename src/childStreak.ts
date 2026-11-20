/**
 * Pure decision helpers for child cards, ported from the True Recall PR and
 * kept free of Obsidian imports so they stay easy to reason about.
 *
 * Ratings arrive newest first, as returned by `ReviewStore.recentForCard()`:
 * 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.
 */

/** The last `streak` ratings are all Good or Easy. */
export function isGraduatable(
    ratings: readonly number[],
    streak: number,
): boolean {
    if (streak <= 0 || ratings.length < streak) return false;
    return ratings.slice(0, streak).every((rating) => rating >= 3);
}

/**
 * How badly the recent reviews went. Hard adds 1 and Again adds `againScore`
 * (0..3), so both keep the failing run going; any Good or Easy ends it.
 *
 * `againScore` is a setting on purpose: Again is the "did not recall it at
 * all" rating, so it normally weighs more than Hard. With 0 an Again still
 * counts as part of the run but never pushes the score towards the threshold.
 */
export function hardStreakScore(
    ratings: readonly number[],
    againScore = 2,
): number {
    let score = 0;
    for (const rating of ratings) {
        if (rating === 2) score += 1;
        else if (rating === 1) score += againScore;
        else break;
    }
    return score;
}

/** The recent failing run scores at least `streak`. */
export function hasHardStreak(
    ratings: readonly number[],
    streak: number,
    againScore = 2,
): boolean {
    return streak > 0 && hardStreakScore(ratings, againScore) >= streak;
}

/** One review as the child-card score needs it. */
export interface ScoredReview {
    rating: number;
    /** Hard points earned by recalling too slowly (fractional by design). */
    slowPoints?: number;
    /** Older entries: a slow recall counted as one whole point. */
    slow?: boolean;
}

/**
 * The failing score, with slow recalls counted.
 *
 * Overtime is worth a fraction of a Hard per step past the budget, so it adds
 * to the run instead of replacing the rating. A Good or Easy normally ends the
 * run; a slow one keeps it alive with just its overtime points - the card was
 * slow, so it is still part of the trouble.
 */
export function childScore(
    logs: readonly ScoredReview[],
    againScore = 2,
): number {
    let score = 0;
    for (const log of logs) {
        const slowPoints = log.slowPoints ?? (log.slow ? 1 : 0);
        if (log.rating === 2) score += 1;
        else if (log.rating === 1) score += againScore;
        else if (slowPoints <= 0) break;
        score += slowPoints;
    }
    return score;
}
