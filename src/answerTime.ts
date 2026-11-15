import type { CardRecord } from './card';

/**
 * Suggested answer time, following the same idea as the TR PR: a base budget
 * plus reading time for the answer, nudged by how hard the card has been.
 *
 * - base: 20 seconds
 * - length: 3 seconds per 40 visible characters of the answer
 * - history: FSRS difficulty 1..10, neutral at 5.5 (±30% at the extremes)
 * - clamped to 5..600 seconds
 */
const BASE_SECONDS = 20;
const SECONDS_PER_CHUNK = 3;
const CHARS_PER_CHUNK = 40;
const MIN_SECONDS = 5;
const MAX_SECONDS = 600;
const NEUTRAL_DIFFICULTY = 5.5;
const DIFFICULTY_SPAN = 9;
const MIN_HISTORY_FACTOR = 0.3;

export function suggestedAnswerSeconds(card: CardRecord, baseSeconds = BASE_SECONDS): number {
    const answer = (card.back ?? card.front ?? '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\{\{c\d+::([^}]+?)(?:::[^}]+)?\}\}/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
    const lengthSeconds = (answer.length / CHARS_PER_CHUNK) * SECONDS_PER_CHUNK;

    const reps = card.fsrs?.reps ?? 0;
    const difficulty = card.fsrs?.difficulty ?? 0;
    const spread = Math.min(1, Math.max(-1, (difficulty - NEUTRAL_DIFFICULTY) / DIFFICULTY_SPAN));
    const factor = reps > 0 ? Math.max(MIN_HISTORY_FACTOR, 1 + spread * 0.3) : 1;

    const base = Math.max(MIN_SECONDS, baseSeconds);
    const total = (base + lengthSeconds) * factor;
    return Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, Math.round(total)));
}
