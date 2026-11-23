import { Rating, State } from 'ts-fsrs';

import type { AnswerTimeBreakdown } from './answerTime';
import type { CardRecord } from './card';
import { tt, ttf } from './i18n';
import { formatClock } from './reviewClock';
import type { FakeCardSettings } from './settings';

export interface NudgeOptions {
    settings: FakeCardSettings;
    /** False on the question side: nothing has been measured yet. */
    revealed: boolean;
    /** Seconds the answer took, frozen when the card was revealed. */
    answeredSeconds: number;
    /** The clock was switched off, so the seconds mean nothing. */
    clockHidden: boolean;
    /** Budget the answer side of this card ran against. */
    breakdown: AnswerTimeBreakdown;
    /** Rate from a nudge button; `mixed` marks the "answers fought" case. */
    rate: (rating: Rating, mixed?: boolean) => void;
}

/**
 * A single line between the card and the buttons, shown only when the timing
 * is unusual.
 *
 * It never blocks anything: ignoring it leaves the four buttons and their
 * shortcuts exactly as they were, and only a click on the line changes the
 * rating. The row is dismissed per card.
 */
export function renderRatingNudge(
    container: HTMLElement,
    card: CardRecord,
    opts: NudgeOptions,
): void {
    const { settings } = opts;
    if (!settings.antiMiddleNudges || !opts.revealed) return;
    const fsrsCard = card.fsrs;
    if (!fsrsCard || fsrsCard.state !== State.Review) return;
    // Learning cards live in minutes, where "fast" means nothing.
    if ((fsrsCard.scheduled_days ?? 0) < 1) return;

    const breakdown = opts.breakdown;
    // A fast recall can mean "too easy" or "no idea at all", so both are
    // offered. The mixed-up mark does not depend on timing: two answers can
    // fight at any speed, and it is the only way to say so.
    const measured = settings.answerTimeHint && !opts.clockHidden
        && opts.answeredSeconds >= 1 && breakdown.onePass > 0;
    const ratio = measured ? opts.answeredSeconds / breakdown.onePass : 1;
    const fast = measured && ratio <= 0.5;
    const slow = measured && ratio >= 1.5;

    const row = container.createDiv({ cls: 'fakecard-nudge' });
    if (fast || slow) {
        const elapsed = formatClock(opts.answeredSeconds);
        const budget = formatClock(Math.round(breakdown.onePass));
        row.createSpan({
            cls: 'fakecard-nudge-text',
            text: fast
                ? ttf('Quick: {elapsed} / {budget}', { elapsed, budget })
                : ttf('Slow: {elapsed} / {budget}', { elapsed, budget }),
        });
    }

    const add = (label: string, rating: Rating, mixed = false): void => {
        row.createEl('button', { cls: 'fakecard-nudge-button', text: label })
            .addEventListener('click', (event) => {
                event.stopPropagation();
                opts.rate(rating, mixed);
            });
    };
    if (fast) {
        add(tt('Too easy (Easy)'), Rating.Easy);
        add(tt('No idea (Again)'), Rating.Again);
    } else if (slow) {
        add(tt('Stuck (Again)'), Rating.Again);
        add(tt('Mixed up (Hard)'), Rating.Hard, true);
    } else {
        add(tt('Mixed up (Hard)'), Rating.Hard, true);
    }
}
