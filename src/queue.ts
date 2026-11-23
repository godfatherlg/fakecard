import { forgetting_curve, State } from 'ts-fsrs';
import type FakeCardPlugin from '../main';
import { isBuried, type CardRecord } from './card';
import { pruneExpiredExamPlans } from './examPlan';
import { dailyReviewLimit } from './limit';

/**
 * Today's review limit, after "study more today" and the adaptive size.
 *
 * One function so the real queue and the status-bar counts cannot drift:
 * yesterday's success rate changes how much is queued today, never a schedule.
 */
export async function effectiveReviewLimit(plugin: FakeCardPlugin): Promise<number> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const logs = plugin.settings.adaptiveDailyLoad
        ? (await plugin.reviews.forDay(yesterday)).filter((log) => !log.ahead)
        : [];
    return dailyReviewLimit({
        base: plugin.settings.maxReviewsPerDay,
        boost: plugin.reviewLimitBoost,
        adaptive: plugin.settings.adaptiveDailyLoad,
        yesterday: logs,
    });
}

/**
 * Today's counts, without building the queue.
 *
 * The status bar repaints after every rating and only needs four numbers.
 * Building the real queue there sorted every card and measured retrievability
 * for the recovery order - work that is thrown away.
 */
export async function buildQueueCounts(
    plugin: FakeCardPlugin,
    deckFilter = 'all',
): Promise<{ due: number; fresh: number; learning: number; backlog: number }> {
    const every = await plugin.store.list();
    const all = (deckFilter === 'all'
        ? every
        : every.filter((card) => card.deck === deckFilter))
        .filter((card) => !card.suspended && !card.graduated);

    const todayLogs = await plugin.reviews.forDay(new Date());
    const limit = await effectiveReviewLimit(plugin);

    const now = Date.now();
    const waiting = all.filter((card) => card.fsrs
        && card.fsrs.state !== State.New
        && new Date(card.fsrs.due).getTime() <= now
        && !isBuried(card, now));
    const remaining = Math.max(0, limit - todayLogs.filter((log) => !log.ahead).length);
    const due = Math.min(waiting.length, remaining);
    const learning = Math.min(due, waiting.filter((card) => card.fsrs
        && (card.fsrs.state === State.Learning || card.fsrs.state === State.Relearning)).length);
    const fresh = all
        .filter((card) => (!card.fsrs || card.fsrs.state === State.New) && !isBuried(card, now))
        .slice(0, plugin.settings.pauseNewWhenBacklogged && waiting.length > limit
            ? 0
            : Math.max(0, plugin.settings.newCardsPerDay
                - todayLogs.filter((log) => log.wasNew).length))
        .length;

    return {
        due: due - learning,
        learning,
        fresh,
        backlog: waiting.length - due,
    };
}

/** Retrievability of a card right now; 1 for a card that was never seen. */
function retrievability(card: CardRecord, now: number): number {
    const fsrs = card.fsrs;
    if (!fsrs || fsrs.state === State.New) return 1;
    const last = fsrs.last_review ? new Date(fsrs.last_review).getTime() : new Date(fsrs.due).getTime();
    const elapsed = Math.max(0, (now - last) / 86400000);
    const stability = fsrs.stability ?? 0;
    return stability > 0 ? forgetting_curve(elapsed, stability) : 0;
}

/**
 * Today's review session, split the way Anki splits it: cards due for review,
 * cards still inside their learning steps, and cards that were never seen.
 * The two due groups are a subset of the same list, so `due + learning + fresh`
 * is exactly `cards.length`.
 */
export interface ReviewQueue {
    decks: string[];
    cards: CardRecord[];
    /** Exam plans dropped because their day has passed. */
    expired: number;
    /** Due cards that are past their learning steps. */
    due: number;
    /** Due cards still inside the learning steps (minutes, not days). */
    learning: number;
    /** Never-seen cards, capped by the daily limit. */
    fresh: number;
    /** Due cards the daily limit kept out of today's session. */
    backlog: number;
    /** Cards hidden until tomorrow by a bury - not rescheduled, just held back. */
    buried: number;
    /** Cards in this deck filter that could be scheduled at all. */
    total: number;
    /** Today's queue is ordered for coming back after a long gap. */
    recovery: boolean;
}

/**
 * Builds the queue for one deck filter.
 *
 * Shared by the review view and the status bar so the pane and the bar can
 * never disagree about what "today" holds.
 */
export async function buildReviewQueue(
    plugin: FakeCardPlugin,
    deckFilter: string,
    // Pruning saves the settings, which reloads every view: only the caller
    // that can show the "a plan has passed" notice asks for it.
    options: { prune?: boolean } = {},
): Promise<ReviewQueue> {
    // Plans whose exam day is over are dropped; card data (stability,
    // difficulty, history) is never touched, cards just go back to FSRS.
    const expired = options.prune === false ? 0 : await pruneExpiredExamPlans(plugin);
    const decks = await plugin.store.loadDecks();
    const everyCard = await plugin.store.list();
    const scoped = deckFilter === 'all'
        ? everyCard
        : everyCard.filter((card) => card.deck === deckFilter);
    // Suspended parents wait for their children; graduated children are done
    // and stay only for their history.
    const all = scoped.filter((card) => !card.suspended && !card.graduated);

    // Today's queue: due cards first (oldest due first), then new cards, both
    // capped by the daily limits in settings. `reviewLimitBoost` is the extra
    // allowance "study more today" adds; it lives for this session only.
    const todayLogs = await plugin.reviews.forDay(new Date());
    const limit = await effectiveReviewLimit(plugin);

    // Reviews made ahead of schedule are extra practice: they must not eat the
    // allowance that today's due cards still need.
    const spentToday = todayLogs.filter((log) => !log.ahead).length;
    const remainingReviews = Math.max(0, limit - spentToday);
    const remainingNew = Math.max(0, plugin.settings.newCardsPerDay
        - todayLogs.filter((log) => log.wasNew).length);

    const now = Date.now();
    // Buried cards stay in the library with their schedule untouched; the view
    // tells how many are held back instead of leaving the user wondering where
    // a card they saw a minute ago went.
    const buried = all.filter((card) => isBuried(card, now)).length;
    const waiting = all
        .filter((card) => card.fsrs
            && card.fsrs.state !== State.New
            && new Date(card.fsrs.due).getTime() <= now
            && !isBuried(card, now))
        .sort((a, b) => new Date(a.fsrs!.due).getTime() - new Date(b.fsrs!.due).getTime());

    // Recovery: while a large share of the due cards is well past its stability,
    // the oldest-due-first order would open every day with the worst cards.
    // Show the ones still remembered first and drip the weak ones in.
    const weak = plugin.settings.recoveryMode
        ? waiting.filter((card) => retrievability(card, now) < 0.5)
        : [];
    const recovery = weak.length >= Math.max(10, Math.floor(waiting.length * 0.2));
    let due: CardRecord[];
    if (recovery) {
        const weakIds = new Set(weak.map((card) => card.id));
        const familiar = waiting
            .filter((card) => !weakIds.has(card.id))
            .sort((a, b) => retrievability(b, now) - retrievability(a, now));
        const fragile = weak.sort((a, b) => retrievability(b, now) - retrievability(a, now));
        const take = Math.min(remainingReviews, waiting.length);
        const familiarTake = Math.min(familiar.length, Math.ceil(take * 0.8));
        const weakTake = Math.min(fragile.length, take - familiarTake);
        due = [
            ...familiar.slice(0, familiarTake),
            ...fragile.slice(0, weakTake),
        ];
        // One bucket short: fill from the other instead of showing a short day.
        const left = take - due.length;
        if (left > 0) {
            const unused = familiarTake < familiar.length ? familiar.slice(familiarTake) : fragile.slice(weakTake);
            due.push(...unused.slice(0, left));
        }
    } else {
        due = waiting.slice(0, remainingReviews);
    }

    // Behind on due cards, a new card only adds tomorrow's work - and its first
    // day costs several passes of its own. Hold them until the queue fits again.
    // Nothing is rescheduled: a new card has no FSRS state to change yet.
    const behind = waiting.length > limit;
    const newAllowance = plugin.settings.pauseNewWhenBacklogged && behind ? 0 : remainingNew;

    const fresh = all
        // A bury works for new cards too: they are hidden until tomorrow like
        // any other card the user put away for the day.
        .filter((card) => (!card.fsrs || card.fsrs.state === State.New) && !isBuried(card, now))
        .sort((a, b) => a.created.localeCompare(b.created))
        .slice(0, newAllowance);

    const learning = due.filter((card) => card.fsrs
        && (card.fsrs.state === State.Learning || card.fsrs.state === State.Relearning)).length;

    return {
        decks,
        cards: [...due, ...fresh],
        expired,
        due: due.length - learning,
        learning,
        fresh: fresh.length,
        // Due cards the daily limit kept out of the session: they are today's
        // work, just not reached yet.
        backlog: waiting.length - due.length,
        buried,
        total: all.length,
        recovery,
    };
}
