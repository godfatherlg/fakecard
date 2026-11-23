import { beforeEach, describe, expect, it } from 'vitest';
import { App, Notice, TFile, TFolder } from 'obsidian';
import { ReviewStore, type ReviewLog } from '../src/reviews';

// The test stub has runtime constructors and a message log; the shipped type
// definitions deliberately expose neither, so reach them through a cast.
const RuntimeNotice = Notice as unknown as { messages: string[] };
const NewTFile = TFile as unknown as new (path: string) => TFile;
const NewTFolder = TFolder as unknown as new (path: string) => TFolder;

class FakeVault {
    files = new Map<string, string>();
    folders = new Set<string>(['fakecard', 'fakecard/reviews']);
    reads = 0;
    writes = 0;

    getAbstractFileByPath(path: string): TFile | TFolder | null {
        if (this.files.has(path)) return new NewTFile(path);
        if (this.folders.has(path)) return new NewTFolder(path);
        return null;
    }

    async createFolder(path: string): Promise<void> {
        this.folders.add(path);
    }

    async cachedRead(file: TFile): Promise<string> {
        this.reads++;
        return this.files.get(file.path) ?? '';
    }

    async read(file: TFile): Promise<string> {
        return this.files.get(file.path) ?? '';
    }

    async modify(file: TFile, text: string): Promise<void> {
        this.writes++;
        this.files.set(file.path, text);
    }

    async create(path: string, text: string): Promise<void> {
        this.writes++;
        this.files.set(path, text);
    }

    async rename(file: TFile, target: string): Promise<void> {
        const text = this.files.get(file.path);
        if (text === undefined) throw new Error('no such file');
        this.files.delete(file.path);
        this.files.set(target, text);
    }
}

const log = (at: string, rating = 3): ReviewLog => ({
    cardId: 'c1',
    at,
    rating,
    wasNew: false,
});

function setup(): { vault: FakeVault; store: ReviewStore; path: string } {
    const vault = new FakeVault();
    const store = new ReviewStore({ vault } as unknown as App, 'fakecard');
    return { vault, store, path: 'fakecard/reviews/2026-11-23.json' };
}

beforeEach(() => {
    RuntimeNotice.messages.length = 0;
});

describe('review log corruption', () => {
    it('moves a bad day aside and recreates the real file', async () => {
        const { vault, store, path } = setup();
        vault.files.set(path, '{not json');

        await store.append(log('2026-11-23T10:00:00.000'));

        expect(vault.files.has(path)).toBe(true);
        const written = JSON.parse(vault.files.get(path)!) as ReviewLog[];
        expect(written).toHaveLength(1);
        expect(written[0].rating).toBe(3);

        const backups = [...vault.files.keys()].filter((key) => key.includes('.corrupt-'));
        expect(backups).toHaveLength(1);
        expect(RuntimeNotice.messages).toHaveLength(1);
    });

    it('does the same for a batch, without writing through the old handle', async () => {
        const { vault, store, path } = setup();
        vault.files.set(path, 'broken');

        const added = await store.appendMany([
            log('2026-11-23T10:00:00.000', 3),
            log('2026-11-23T10:01:00.000', 1),
            log('2026-11-23T10:01:00.000', 1),
        ]);

        expect(added).toBe(2);
        const written = JSON.parse(vault.files.get(path)!) as ReviewLog[];
        expect(written).toHaveLength(2);
        expect([...vault.files.keys()].filter((key) => key.includes('.corrupt-'))).toHaveLength(1);
    });
});

describe('review log cache', () => {
    it('reads a day once, then keeps appends and removes in memory', async () => {
        const { vault, store } = setup();
        const day = new Date('2026-11-23T12:00:00');
        const path = 'fakecard/reviews/2026-11-23.json';

        await store.append(log('2026-11-23T10:00:00.000'));
        await store.append(log('2026-11-23T10:01:00.000'));

        // Start from a cold cache, the way a fresh session does.
        store.invalidate();
        vault.reads = 0;
        expect(await store.forDay(day)).toHaveLength(2);
        expect(vault.reads).toBe(1);
        expect(await store.forDay(day)).toHaveLength(2);
        expect(vault.reads).toBe(1);

        vault.reads = 0;
        await store.append(log('2026-11-23T10:02:00.000'));
        expect(await store.forDay(day)).toHaveLength(3);
        expect(vault.reads).toBe(0);

        vault.reads = 0;
        await store.remove('c1', '2026-11-23T10:01:00.000');
        expect(await store.forDay(day)).toHaveLength(2);
        expect(vault.reads).toBe(0);
        expect(JSON.parse(vault.files.get(path)!)).toHaveLength(2);
    });

    it('only reads again after invalidate', async () => {
        const { vault, store } = setup();
        const day = new Date('2026-11-23T12:00:00');
        await store.append(log('2026-11-23T10:00:00.000'));

        vault.reads = 0;
        await store.forDay(day);
        store.invalidate();
        await store.forDay(day);
        expect(vault.reads).toBe(1);
    });

    it('lets our own writes keep the cache, but only once each', async () => {
        const { store, path } = setup();
        await store.append(log('2026-11-23T10:00:00.000'));
        expect(store.consumeWrite(path)).toBe(true);
        expect(store.consumeWrite(path)).toBe(false);
    });
});
