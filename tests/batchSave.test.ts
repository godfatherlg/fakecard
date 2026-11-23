import { describe, expect, it, vi } from 'vitest';

import { saveAllOrRollback } from '../src/batchSave';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('saveAllOrRollback', () => {
    it('reports every card when all of them save', async () => {
        const remove = vi.fn(async () => true);
        const result = await saveAllOrRollback(items, async () => true, remove);
        expect(result).toEqual({ saved: 3, leftover: 0 });
        expect(remove).not.toHaveBeenCalled();
    });

    it('rolls back the cards written before the first failure', async () => {
        const removed: string[] = [];
        const result = await saveAllOrRollback(
            items,
            async (item) => item.id !== 'b',
            async (item) => {
                removed.push(item.id);
                return true;
            },
        );
        expect(result).toEqual({ saved: 0, leftover: 0 });
        expect(removed).toEqual(['a']);
    });

    it('reports cards the rollback could not remove', async () => {
        const result = await saveAllOrRollback(
            items,
            async (item) => item.id !== 'b',
            async () => false,
        );
        expect(result).toEqual({ saved: 0, leftover: 1 });
    });

    it('does not try to remove anything when the first save fails', async () => {
        const remove = vi.fn(async () => true);
        const result = await saveAllOrRollback(items, async () => false, remove);
        expect(result).toEqual({ saved: 0, leftover: 0 });
        expect(remove).not.toHaveBeenCalled();
    });

    it('handles an empty batch', async () => {
        expect(await saveAllOrRollback([], async () => true, async () => true))
            .toEqual({ saved: 0, leftover: 0 });
    });
});
