import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, Notice, TFile, TFolder } from 'obsidian';

import type { CardRecord } from '../src/card';
import { CardStore } from '../src/store';

// The test stub has runtime constructors and a message log; the shipped type
// definitions deliberately expose neither, so reach them through a cast.
const RuntimeNotice = Notice as unknown as { messages: string[] };
const NewTFile = TFile as unknown as new (path: string) => TFile;
const NewTFolder = TFolder as unknown as new (path: string) => TFolder;

const FAILURE = 'disk is full';

function card(id = 'c1'): CardRecord {
    return {
        id,
        type: 'qa',
        front: 'question',
        back: 'answer',
        deck: 'default',
        tags: [],
        source: { path: 'note.md' },
        created: '2026-01-01T00:00:00.000Z',
        updated: '2026-01-01T00:00:00.000Z',
    };
}

/**
 * The library folders are in place, but every write fails the way a full disk
 * does. `onDisk` is a card file already present, for the delete path.
 */
function failingApp(onDisk: string | null): App {
    const root = new NewTFolder('fakecard');
    const cards = new NewTFolder('fakecard/cards');
    if (onDisk) cards.children.push(new NewTFile(onDisk));
    const folders = new Map<string, TFolder>([
        [root.path, root],
        [cards.path, cards],
    ]);
    const fail = async (): Promise<never> => {
        throw new Error(FAILURE);
    };
    return {
        vault: {
            getAbstractFileByPath: (path: string): TFile | TFolder | null => {
                if (path === onDisk) return new NewTFile(path);
                return folders.get(path) ?? null;
            },
            createFolder: fail,
            create: fail,
            modify: fail,
            cachedRead: async (): Promise<string> => JSON.stringify(card('c1')),
        },
        fileManager: { trashFile: fail },
    } as unknown as App;
}

beforeEach(() => {
    RuntimeNotice.messages.length = 0;
    // The store logs the failure before reporting it; the test only cares
    // about what the caller sees, and the noise hides real errors.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('CardStore failure reporting', () => {
    it('returns false and explains when a card cannot be written', async () => {
        const store = new CardStore(failingApp(null), 'fakecard');
        expect(await store.save(card())).toBe(false);
        // A failed write must not be indexed as if it had landed.
        expect(store.cardsForPath('note.md')).toHaveLength(0);
        expect(RuntimeNotice.messages.join('\n')).toContain(FAILURE);
    });

    it('keeps the card when deleting its file fails', async () => {
        const store = new CardStore(failingApp('fakecard/cards/c1.json'), 'fakecard');
        expect(await store.list()).toHaveLength(1);
        expect(await store.remove('c1')).toBe(false);
        // The file is still there, so the card must stay visible.
        expect(store.cardsForPath('note.md')).toHaveLength(1);
        expect(await store.list()).toHaveLength(1);
    });
});
