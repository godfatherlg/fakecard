import { describe, expect, it } from 'vitest';

import { joinQa, QA_SEPARATOR, splitQa } from '../src/qaDoc';

describe('Q&A scratch document', () => {
    it('round-trips both fields', () => {
        const front = 'Question with **bold** and a link';
        const back = '1. First\n2. Second\n\n> A callout';
        expect(splitQa(joinQa(front, back))).toEqual({ front, back });
    });

    it('writes one visible rule and nothing else', () => {
        expect(joinQa('Question', 'Answer')).toBe(`Question\n\n${QA_SEPARATOR}\nAnswer`);
    });

    it('handles empty fields', () => {
        expect(splitQa(joinQa('', ''))).toEqual({ front: '', back: '' });
    });

    it('uses the first bare rule as the divider', () => {
        expect(splitQa('question\n---\nanswer')).toEqual({
            front: 'question',
            back: 'answer',
        });
        expect(splitQa('question\n\n---\n\nanswer\n\n---\n\nmore')).toEqual({
            front: 'question',
            back: 'answer\n\n---\n\nmore',
        });
    });

    it('refuses to guess when there is no divider', () => {
        expect(splitQa('question only')).toBeNull();
    });

    it('still reads the old hidden marker', () => {
        expect(splitQa('question\n\n<!-- fakecard:answer -->\n---\nanswer')).toEqual({
            front: 'question',
            back: 'answer',
        });
    });
});
