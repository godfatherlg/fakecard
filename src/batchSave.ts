/**
 * Save a batch of new cards, or undo the ones that landed.
 *
 * A set of image cards is one card creation: half of it in the vault while the
 * panel still holds every group would read as finished, and pressing Save
 * again would duplicate the groups that did land. So the first failure rolls
 * back what this attempt wrote and the panel stays open for a clean retry.
 */
export interface BatchSaveResult {
    /** Cards that reached the vault; 0 when the attempt was rolled back. */
    saved: number;
    /** Cards from this attempt that the rollback could not remove. */
    leftover: number;
}

export async function saveAllOrRollback<T extends { id: string }>(
    items: ReadonlyArray<T>,
    save: (item: T) => Promise<boolean>,
    remove: (item: T) => Promise<boolean>,
): Promise<BatchSaveResult> {
    const written: T[] = [];
    for (const item of items) {
        if (await save(item)) {
            written.push(item);
            continue;
        }
        let leftover = 0;
        for (const done of written) {
            if (!await remove(done)) leftover++;
        }
        return { saved: 0, leftover };
    }
    return { saved: items.length, leftover: 0 };
}
