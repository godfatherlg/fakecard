import { State } from 'ts-fsrs';
import type FakeCardPlugin from '../main';
import type { CardRecord } from './card';
import { pruneExpiredExamPlans } from './examPlan';

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
    /** Cards in this deck filter that could be scheduled at all. */
    total: number;
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
    const limit = plugin.settings.maxReviewsPerDay + plugin.reviewLimitBoost;
    // Reviews made ahead of schedule are extra practice: they must not eat the
    // allowance that today's due cards still need.
    const spentToday = todayLogs.filter((log) => !log.ahead).length;
    const remainingReviews = Math.max(0, limit - spentToday);
    const remainingNew = Math.max(0, plugin.settings.newCardsPerDay
        - todayLogs.filter((log) => log.wasNew).length);

    const now = Date.now();
    const waiting = all
        .filter((card) => card.fsrs
            && card.fsrs.state !== State.New
            && new Date(card.fsrs.due).getTime() <= now)
        .sort((a, b) => new Date(a.fsrs!.due).getTime() - new Date(b.fsrs!.due).getTime());
    const due = waiting.slice(0, remainingReviews);

    // Behind on due cards, a new card only adds tomorrow's work - and its first
    // day costs several passes of its own. Hold them until the queue fits again.
    // Nothing is rescheduled: a new card has no FSRS state to change yet.
    const behind = waiting.length > limit;
    const newAllowance = plugin.settings.pauseNewWhenBacklogged && behind ? 0 : remainingNew;

    const fresh = all
        .filter((card) => !card.fsrs || card.fsrs.state === State.New)
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
        total: all.length,
    };
}
