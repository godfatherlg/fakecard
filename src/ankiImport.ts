import { decompress } from 'fzstd';
import { unzipSync } from 'fflate';
import { normalizePath } from 'obsidian';
import type { Database, QueryExecResult, SqlValue } from 'sql.js';
import { createEmptyCard, fsrs, State } from 'ts-fsrs';
import type { Card as FsrsCard, Grade } from 'ts-fsrs';
import type FakeCardPlugin from '../main';
import type { CardRecord } from './card';
import type { ReviewLog } from './reviews';
import { loadSqlJs } from './sqlite';

/**
 * .apkg importer.
 *
 * An .apkg is a zip containing an SQLite database (collection.anki2 /
 * collection.anki21b). We open it with the single-file WebAssembly build of
 * SQLite and turn its notes into our cards:
 *
 *   - Basic models  -> Q&A card (field 0 = front, field 1 = back)
 *   - Cloze models  -> one card per cloze group (our createClozeCards)
 *
 * Review history comes along: `cards` supplies deck, suspension and the fallback
 * interval, and `revlog` is replayed through FSRS so the imported card lands
 * with the memory state the ratings earned in Anki instead of starting over.
 * Media files are copied into the library; image-occlusion notes are converted.
 */

interface AnkiModelField {
    name: string;
    ord: number;
}

interface AnkiModel {
    name: string;
    /** 0 = basic, 1 = cloze. */
    type: number;
    flds: AnkiModelField[];
}

export interface AnkiImportResult {
    qa: number;
    cloze: number;
    image: number;
    skipped: number;
    /** Existing cards whose schedule was replaced with the Anki history. */
    updated: number;
    /** Existing cards left as they were (duplicates the user chose to keep). */
    duplicates: number;
    /** The user backed out at the duplicate prompt. */
    cancelled: boolean;
    error?: string;
}

/** What the caller wants done with cards that are already in the library. */
export interface AnkiImportOptions {
    /**
     * Asked once, before writing, when the library already holds cards with the
     * same content. `withHistory` counts the duplicates that carry a schedule.
     */
    onDuplicates?: (info: { duplicates: number; withHistory: number })
        => Promise<'overwrite' | 'skip' | 'cancel'>;
}

/** One row of Anki's `cards` table: the scheduling half of a note. */
interface AnkiCardRow {
    id: string;
    did: string;
    ord: number;
    type: number;
    queue: number;
    due: number;
    ivl: number;
    factor: number;
    reps: number;
    lapses: number;
}

interface AnkiReview {
    /** revlog.id is a millisecond timestamp. */
    time: Date;
    /** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy. */
    ease: number;
}

/** A card that has been built but not written yet. */
interface PendingCard {
    card: CardRecord;
    fsrs: FsrsCard | null;
    /** Every rating Anki has for this card, oldest first. */
    history: AnkiReview[];
    reviews: number;
    correct: number;
    suspended: boolean;
}

interface ParsedMask {
    x: number;
    y: number;
    w: number;
    h: number;
    shape: 'rect' | 'ellipse';
}

/**
 * Anki 2.1.28+ image occlusion markup inside the note text:
 *
 *   <img src="paste-xxx.png">
 *   {{c1::image-occlusion:rect:left=10:top=20:width=30:height=40}}
 *   {{c2::image-occlusion:ellipse:cx=50:cy=60:rx=10:ry=8}}
 *
 * Coordinates are image pixels. Anki's own image occlusion uses one note with
 * several masks; we import it as one image card with a single group.
 */
function parseOcclusion(text: string): { image: string | null; masks: ParsedMask[] } {
    const imgMatch = /<img[^>]+src="([^"]+)"/i.exec(text);
    const image = imgMatch ? imgMatch[1] : null;

    const masks: ParsedMask[] = [];
    const re = /\{\{c\d+::image-occlusion:(rect|ellipse):([^}]*)\}\}/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
        const shape = match[1] as 'rect' | 'ellipse';
        const attrs: Record<string, string> = {};
        for (const part of match[2].split(':')) {
            const [key, value] = part.split('=');
            if (key && value !== undefined) attrs[key.trim()] = value.trim();
        }
        if (shape === 'rect') {
            const left = Number(attrs.left);
            const top = Number(attrs.top);
            const width = Number(attrs.width);
            const height = Number(attrs.height);
            if ([left, top, width, height].every(Number.isFinite) && width > 0 && height > 0) {
                masks.push({ x: left, y: top, w: width, h: height, shape: 'rect' });
            }
        } else {
            const cx = Number(attrs.cx);
            const cy = Number(attrs.cy);
            const rx = Number(attrs.rx);
            const ry = Number(attrs.ry);
            if ([cx, cy, rx, ry].every(Number.isFinite) && rx > 0 && ry > 0) {
                masks.push({ x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, shape: 'ellipse' });
            }
        }
    }
    return { image, masks };
}

/** Image occlusion Enhanced stores its masks as SVG in separate fields. */
function parseSvgMasks(svgText: string): { masks: ParsedMask[]; viewBox: { w: number; h: number } | null } {
    const masks: ParsedMask[] = [];
    let viewBox: { w: number; h: number } | null = null;
    try {
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
        const svg = doc.querySelector('svg');
        const vb = svg?.getAttribute('viewBox');
        if (vb) {
            const parts = vb.split(/[\s,]+/).map(Number);
            if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) viewBox = { w: parts[2], h: parts[3] };
        }
        for (const rect of Array.from(doc.querySelectorAll('rect'))) {
            const x = Number(rect.getAttribute('x') ?? 0);
            const y = Number(rect.getAttribute('y') ?? 0);
            const w = Number(rect.getAttribute('width') ?? 0);
            const h = Number(rect.getAttribute('height') ?? 0);
            if (w > 0 && h > 0) masks.push({ x, y, w, h, shape: 'rect' });
        }
        for (const ellipse of Array.from(doc.querySelectorAll('ellipse'))) {
            const cx = Number(ellipse.getAttribute('cx') ?? 0);
            const cy = Number(ellipse.getAttribute('cy') ?? 0);
            const rx = Number(ellipse.getAttribute('rx') ?? 0);
            const ry = Number(ellipse.getAttribute('ry') ?? 0);
            if (rx > 0 && ry > 0) masks.push({ x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2, shape: 'ellipse' });
        }
        for (const polygon of Array.from(doc.querySelectorAll('polygon'))) {
            const points = (polygon.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
            if (points.length >= 4) {
                const xs = points.filter((_, i) => i % 2 === 0);
                const ys = points.filter((_, i) => i % 2 === 1);
                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);
                const minY = Math.min(...ys);
                const maxY = Math.max(...ys);
                if (maxX > minX && maxY > minY) {
                    masks.push({ x: minX, y: minY, w: maxX - minX, h: maxY - minY, shape: 'rect' });
                }
            }
        }
    } catch {
        // ignore - returns whatever was parsed
    }
    return { masks, viewBox };
}

async function imageSize(plugin: FakeCardPlugin, path: string): Promise<{ w: number; h: number } | null> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => resolve(null);
        img.src = plugin.app.vault.adapter.getResourcePath(path);
    });
}

function pickCollection(files: Record<string, Uint8Array>): Uint8Array | null {
    for (const name of ['collection.anki21b', 'collection.anki21']) {
        const data = files[name];
        if (!data) continue;
        try {
            return decompress(data);
        } catch {
            // Older exports keep plain SQLite under the same name.
            return data;
        }
    }
    return files['collection.anki2'] ?? null;
}

/** Seconds since epoch Anki counts review due-days from. */
function readCrt(db: Database): number {
    try {
        const rows: QueryExecResult[] = db.exec('SELECT crt FROM col LIMIT 1');
        const value = Number(rows[0]?.values[0]?.[0]);
        if (Number.isFinite(value) && value > 0) return value;
    } catch {
        // Old and new schemas both keep col.crt; a missing table is unusual.
    }
    return Math.floor(Date.now() / 1000);
}

/** Deck id -> name, from the old col.decks JSON or the new decks table. */
function readDecks(db: Database): Map<string, string> {
    const decks = new Map<string, string>();
    try {
        const rows: QueryExecResult[] = db.exec('SELECT decks FROM col LIMIT 1');
        const json = rows[0]?.values[0]?.[0];
        if (typeof json === 'string') {
            const parsed = JSON.parse(json) as Record<string, { name?: string }>;
            for (const id of Object.keys(parsed)) {
                const name = parsed[id]?.name;
                if (typeof name === 'string' && name.trim()) decks.set(id, name.trim());
            }
        }
    } catch {
        // Newer schema: fall through to the decks table.
    }
    if (decks.size === 0) {
        try {
            const rows: QueryExecResult[] = db.exec('SELECT id, name FROM decks');
            for (const row of rows[0]?.values ?? []) {
                const name = String(row[1] ?? '').trim();
                if (name) decks.set(String(row[0]), name);
            }
        } catch {
            // no deck names - the default deck is used
        }
    }
    return decks;
}

/** Note id -> its Anki cards, so a note's history can find its group. */
function readCardRows(db: Database): Map<string, AnkiCardRow[]> {
    const byNote = new Map<string, AnkiCardRow[]>();
    try {
        const rows: QueryExecResult[] = db.exec(
            'SELECT id, nid, did, ord, type, queue, due, ivl, factor, reps, lapses FROM cards',
        );
        for (const row of rows[0]?.values ?? []) {
            const card: AnkiCardRow = {
                id: String(row[0]),
                did: String(row[2] ?? ''),
                ord: Number(row[3] ?? 0),
                type: Number(row[4] ?? 0),
                queue: Number(row[5] ?? 0),
                due: Number(row[6] ?? 0),
                ivl: Number(row[7] ?? 0),
                factor: Number(row[8] ?? 0),
                reps: Number(row[9] ?? 0),
                lapses: Number(row[10] ?? 0),
            };
            const list = byNote.get(String(row[1])) ?? [];
            list.push(card);
            byNote.set(String(row[1]), list);
        }
    } catch {
        // No cards table (a notes-only export): every imported card is new.
    }
    return byNote;
}

/** Card id -> every rating it ever received, oldest first. */
function readReviews(db: Database): Map<string, AnkiReview[]> {
    const byCard = new Map<string, AnkiReview[]>();
    try {
        const rows: QueryExecResult[] = db.exec('SELECT id, cid, ease FROM revlog ORDER BY id');
        for (const row of rows[0]?.values ?? []) {
            const ease = Number(row[2] ?? 0);
            if (ease < 1 || ease > 4) continue;
            const time = new Date(Number(row[0]));
            if (!Number.isFinite(time.getTime())) continue;
            const cid = String(row[1]);
            const list = byCard.get(cid) ?? [];
            list.push({ time, ease });
            byCard.set(cid, list);
        }
    } catch {
        // No revlog: cards fall back to the interval/ease stored on the card.
    }
    return byCard;
}

/**
 * Anki's due value means different things per state: an absolute timestamp for
 * learning cards, a day number counted from the collection creation for review
 * cards.
 */
function ankiDue(row: AnkiCardRow, crt: number): Date {
    if (row.type === 1 || row.type === 3) return new Date(row.due * 1000);
    return new Date((crt + row.due * 86400) * 1000);
}

/**
 * Feed every Anki rating through the FSRS scheduler this plugin uses.
 *
 * Anki schedules with SM-2 and exports no stability/difficulty at all, so
 * replaying the log is the only way to carry the history over honestly: the
 * imported card ends up with the memory state the actual ratings earned.
 */
function replayReviews(reviews: AnkiReview[]): FsrsCard | null {
    if (reviews.length === 0) return null;
    const scheduler = fsrs();
    let card = createEmptyCard(reviews[0].time);
    for (const review of reviews) {
        try {
            card = scheduler.next(card, review.time, review.ease as Grade).card;
        } catch {
            // A rating FSRS rejects (hand-edited log, out-of-order timestamps)
            // is skipped instead of failing the whole import.
        }
    }
    return card;
}

/**
 * Fallback for exports without a revlog: approximate the memory state from the
 * card's interval and ease factor. Coarse, but far closer than "new card".
 */
function estimateFsrs(row: AnkiCardRow, crt: number): FsrsCard | null {
    if (row.reps <= 0 || row.type === 0) return null;
    const due = ankiDue(row, crt);
    const interval = Math.max(1, row.ivl);
    const lastReview = new Date(due.getTime() - interval * 86400000);
    const card = createEmptyCard(lastReview);
    card.state = State.Review;
    card.due = due;
    card.stability = interval;
    // Anki's ease factor runs 1300 (hard) to 5000 (easy); FSRS difficulty runs
    // 1 (easy) to 10 (hard), so the middle of that range lands around 6.
    card.difficulty = Math.min(10, Math.max(1, 11 - row.factor / 500));
    card.scheduled_days = interval;
    card.elapsed_days = 0;
    card.reps = row.reps;
    card.lapses = row.lapses;
    card.last_review = lastReview;
    return card;
}

/** Anki stores tags as one space separated string. */
function parseTags(raw: string): string[] {
    return raw.split(/\s+/).map((tag) => tag.trim()).filter(Boolean);
}

/** Content fingerprint, used to find a card that is already in the library. */
function cardKey(card: CardRecord): string {
    const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();
    if (card.type === 'cloze') {
        return `cloze|${normalize(card.clozeText ?? '')}|${card.clozeGroup ?? 1}`;
    }
    if (card.type === 'image') {
        return `image|${card.image?.path ?? ''}|${card.image?.groups?.[0]?.id ?? 1}`;
    }
    return `qa|${normalize(card.front)}|${normalize(card.back)}`;
}

export async function importApkg(
    plugin: FakeCardPlugin,
    buffer: ArrayBuffer,
    sourcePath: string,
    options: AnkiImportOptions = {},
): Promise<AnkiImportResult> {
    const result: AnkiImportResult = {
        qa: 0,
        cloze: 0,
        image: 0,
        skipped: 0,
        updated: 0,
        duplicates: 0,
        cancelled: false,
    };

    let files: Record<string, Uint8Array>;
    try {
        files = unzipSync(new Uint8Array(buffer));
    } catch {
        return { ...result, error: 'Not a valid .apkg (zip) file.' };
    }

    const sqlite = pickCollection(files);
    if (!sqlite) return { ...result, error: 'No collection database found in the .apkg.' };

    let db: Database;
    try {
        const SQL = await loadSqlJs();
        db = new SQL.Database(sqlite);
    } catch {
        return { ...result, error: 'Could not open the collection database.' };
    }

    // Models: old exports keep JSON in col.models, newer ones use the
    // notetypes / fields tables. Try both.
    const models = new Map<string, AnkiModel>();
    try {
        const rows: QueryExecResult[] = db.exec('SELECT models FROM col LIMIT 1');
        const json = rows[0]?.values[0]?.[0];
        if (typeof json === 'string') {
            const parsed = JSON.parse(json) as Record<string, AnkiModel>;
            for (const id of Object.keys(parsed)) models.set(id, parsed[id]);
        }
    } catch {
        // fall through to the newer schema
    }

    if (models.size === 0) {
        try {
            const notetypes: QueryExecResult[] = db.exec('SELECT id, name, config FROM notetypes');
            const fields: QueryExecResult[] = db.exec('SELECT ntid, ord, name FROM fields');
            const fieldMap = new Map<string, AnkiModelField[]>();
            for (const row of fields[0]?.values ?? []) {
                const ntid = String(row[0]);
                const list = fieldMap.get(ntid) ?? [];
                list.push({ name: String(row[2]), ord: Number(row[1]) });
                fieldMap.set(ntid, list);
            }
            for (const row of notetypes[0]?.values ?? []) {
                const id = String(row[0]);
                let type = 0;
                try {
                    const config: { type?: number } = typeof row[2] === 'string'
                        ? (JSON.parse(row[2]) as { type?: number })
                        : {};
                    type = config.type === 1 ? 1 : 0;
                } catch {
                    type = 0;
                }
                models.set(id, {
                    name: String(row[1]),
                    type,
                    flds: (fieldMap.get(id) ?? []).sort((a, b) => a.ord - b.ord),
                });
            }
        } catch {
            // ignore - handled by the empty-model check below
        }
    }

    if (models.size === 0) {
        db.close();
        return { ...result, error: 'Could not read note types from the collection.' };
    }

    // Media: the "media" entry maps index -> file name; the files themselves
    // are stored under numeric zip entries ("0", "1", ...).
    const mediaMap = new Map<string, string>();
    if (files['media']) {
        try {
            const json = JSON.parse(new TextDecoder().decode(files['media'])) as Record<string, string>;
            const dir = normalizePath(`${plugin.settings.libraryFolder}/images`);
            if (!plugin.app.vault.getAbstractFileByPath(dir)) {
                await plugin.app.vault.createFolder(dir);
            }
            for (const index of Object.keys(json)) {
                const name = json[index];
                const data = files[index];
                if (!(data instanceof Uint8Array)) continue;
                const path = normalizePath(`${dir}/${name}`);
                if (!plugin.app.vault.getAbstractFileByPath(path)) {
                    await plugin.app.vault.createBinary(path, data.slice().buffer);
                }
                mediaMap.set(name, path);
            }
        } catch {
            // no media - fine
        }
    }

    // Scheduling tables. All optional: an export made without scheduling
    // information still imports, its cards just start as new.
    const crt = readCrt(db);
    const deckNames = readDecks(db);
    const cardsByNote = readCardRows(db);
    const reviewsByCard = readReviews(db);

    const defaultDeck = plugin.settings.defaultDeck || 'default';
    const deckFor = (did: string): string => {
        const name = deckNames.get(did);
        if (!name) return defaultDeck;
        // Anki's built-in deck is called Default (默认 in Chinese builds).
        return /^(default|默认)$/i.test(name) ? defaultDeck : name;
    };

    let notes: SqlValue[][] = [];
    try {
        const rows: QueryExecResult[] = db.exec('SELECT id, mid, flds, tags FROM notes');
        notes = rows[0]?.values ?? [];
    } catch {
        try {
            // A few very old schemas have no tags column.
            const rows: QueryExecResult[] = db.exec('SELECT id, mid, flds FROM notes');
            notes = rows[0]?.values ?? [];
        } catch {
            db.close();
            return { ...result, error: 'Could not read notes from the collection.' };
        }
    }

    // Everything is built first and written at the end: the duplicate prompt
    // needs the complete picture before it can ask.
    const pending: PendingCard[] = [];

    for (const row of notes) {
        const noteId = String(row[0]);
        const mid = String(row[1]);
        const fields = String(row[2] ?? '').split('\x1f');
        const tags = parseTags(row[3] == null ? '' : String(row[3]));
        const model = models.get(mid);
        if (!model) {
            result.skipped++;
            continue;
        }

        const noteCards = cardsByNote.get(noteId) ?? [];
        const noteDeck = noteCards.length > 0 ? deckFor(noteCards[0].did) : defaultDeck;

        const prepare = (card: CardRecord, source: AnkiCardRow | undefined): void => {
            const history = source ? reviewsByCard.get(source.id) ?? [] : [];
            const fsrsCard = replayReviews(history) ?? (source ? estimateFsrs(source, crt) : null);
            card.tags = tags;
            pending.push({
                card,
                fsrs: fsrsCard,
                history,
                // revlog is the honest count; the card row covers exports that
                // carry an interval but no log.
                reviews: history.length > 0 ? history.length : source?.reps ?? 0,
                correct: history.filter((review) => review.ease >= 3).length,
                suspended: source?.queue === -1,
            });
        };

        const joined = fields.join('\n');

        // Image occlusion: Anki's pseudo-cloze markup, or the SVG fields used
        // by Image Occlusion Enhanced. One note -> one image card with one
        // mask group.
        if (joined.includes('image-occlusion') || model.name.toLowerCase().includes('image occlusion')) {
            const occlusion = parseOcclusion(joined);
            const svg = parseSvgMasks(joined);
            const masks = occlusion.masks.length > 0 ? occlusion.masks : svg.masks;
            const imageName = occlusion.image;
            if (imageName && masks.length > 0) {
                const imagePath = mediaMap.get(imageName);
                if (imagePath) {
                    const size = svg.viewBox ?? await imageSize(plugin, imagePath);
                    if (size) {
                        const normalized = masks.map((mask) => ({
                            x: mask.x / size.w,
                            y: mask.y / size.h,
                            w: mask.w / size.w,
                            h: mask.h / size.h,
                            shape: mask.shape,
                        }));
                        const cards = plugin.createImageCards(
                            { path: imagePath, groups: [{ id: 1, masks: normalized }] },
                            sourcePath,
                        );
                        for (const card of cards) {
                            card.deck = noteDeck;
                            prepare(card, noteCards[0]);
                        }
                        continue;
                    }
                }
            }
            result.skipped++;
            continue;
        }

        if (model.type === 1) {
            const text = fields[0] ?? '';
            if (!text.includes('{{c')) {
                result.skipped++;
                continue;
            }
            const cards = plugin.createClozeCards(text, sourcePath, undefined, noteDeck);
            for (const card of cards) {
                // Anki asks cloze group c1 on ord 0, c2 on ord 1 ...
                const ord = (card.clozeGroup ?? 1) - 1;
                prepare(card, noteCards.find((entry) => entry.ord === ord) ?? noteCards[0]);
            }
        } else {
            const front = (fields[0] ?? '').trim();
            const back = (fields[1] ?? '').trim();
            if (!front || !back) {
                result.skipped++;
                continue;
            }
            prepare(plugin.createQaCard(front, back, sourcePath, noteDeck), noteCards[0]);
        }
    }

    db.close();

    // Match by content against what the library already holds: importing the
    // same deck twice must update it, not duplicate every card.
    const existing = await plugin.store.list();
    const seen = new Map<string, CardRecord>();
    for (const card of existing) {
        const key = cardKey(card);
        if (!seen.has(key)) seen.set(key, card);
    }

    const fresh: PendingCard[] = [];
    const duplicates: Array<{ pending: PendingCard; existing: CardRecord }> = [];
    for (const item of pending) {
        const found = seen.get(cardKey(item.card));
        if (found) duplicates.push({ pending: item, existing: found });
        else fresh.push(item);
    }

    let mode: 'overwrite' | 'skip' = 'overwrite';
    if (duplicates.length > 0 && options.onDuplicates) {
        const withHistory = duplicates.filter((entry) => entry.pending.fsrs !== null).length;
        const choice = await options.onDuplicates({ duplicates: duplicates.length, withHistory });
        if (choice === 'cancel') return { ...result, cancelled: true };
        mode = choice;
    }

    // Each rating also goes into the daily log: the child-card failing streak
    // and the statistics read those files, not the counters on the card.
    const importedLogs: ReviewLog[] = [];
    const keepHistory = (card: CardRecord, history: AnkiReview[]): void => {
        if (history.length === 0) return;
        const sorted = [...history].sort((a, b) => a.time.getTime() - b.time.getTime());
        sorted.forEach((review, index) => {
            importedLogs.push({
                cardId: card.id,
                at: review.time.toISOString(),
                rating: review.ease,
                // The first rating on an Anki card is the one that made it.
                wasNew: index === 0,
            });
        });
    };

    const write = async (item: PendingCard, target: CardRecord | null): Promise<CardRecord> => {
        const card = target ?? item.card;
        if (item.fsrs) card.fsrs = item.fsrs;
        if (item.reviews > 0) card.reviews = item.reviews;
        if (item.correct > 0) card.correct = item.correct;
        if (item.suspended) card.suspended = true;
        if (target) {
            // Content stays as the library has it; only the schedule, deck and
            // tags come from Anki.
            card.deck = item.card.deck;
            card.tags = Array.from(new Set([...(card.tags ?? []), ...item.card.tags]));
            card.updated = new Date().toISOString();
        }
        await plugin.store.save(card);
        return card;
    };

    for (const item of fresh) {
        const card = await write(item, null);
        keepHistory(card, item.history);
        if (item.card.type === 'qa') result.qa++;
        else if (item.card.type === 'cloze') result.cloze++;
        else result.image++;
    }

    for (const entry of duplicates) {
        // An Anki card with no history cannot improve what is already here.
        if (mode === 'skip' || !entry.pending.fsrs) {
            result.duplicates++;
            continue;
        }
        const card = await write(entry.pending, entry.existing);
        keepHistory(card, entry.pending.history);
        result.updated++;
    }

    if (importedLogs.length > 0) await plugin.reviews.appendMany(importedLogs);

    return result;
}
