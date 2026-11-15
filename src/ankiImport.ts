import { decompress } from 'fzstd';
import { unzipSync } from 'fflate';
import { normalizePath } from 'obsidian';
import type { Database, QueryExecResult, SqlValue } from 'sql.js';
import type FakeCardPlugin from '../main';
import { loadSqlJs } from './sqlite';

/**
 * Minimal .apkg importer.
 *
 * An .apkg is a zip containing an SQLite database (collection.anki2 /
 * collection.anki21b). We open it with the single-file WebAssembly build of
 * SQLite, read notes + models, and turn them into our cards:
 *
 *   - Basic models  -> Q&A card (field 0 = front, field 1 = back)
 *   - Cloze models  -> one card per cloze group (our createClozeCards)
 *
 * Media files and image-occlusion notes are skipped for now - media stays
 * referenced by path in the original Anki markup.
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
    error?: string;
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

export async function importApkg(
    plugin: FakeCardPlugin,
    buffer: ArrayBuffer,
    sourcePath: string,
): Promise<AnkiImportResult> {
    const result: AnkiImportResult = { qa: 0, cloze: 0, image: 0, skipped: 0 };

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
            const entries = Object.entries(parsed) as Array<[string, AnkiModel]>;
            for (const [id, model] of entries) models.set(id, model);
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
            const mediaNames = Object.entries(json) as Array<[string, string]>;
            for (const [index, name] of mediaNames) {
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

    let notes: SqlValue[][] = [];
    try {
        const rows: QueryExecResult[] = db.exec('SELECT id, mid, flds FROM notes');
        notes = rows[0]?.values ?? [];
    } catch {
        db.close();
        return { ...result, error: 'Could not read notes from the collection.' };
    }

    for (const row of notes) {
        const mid = String(row[1]);
        const fields = String(row[2] ?? '').split('\x1f');
        const model = models.get(mid);
        if (!model) {
            result.skipped++;
            continue;
        }

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
                        for (const card of cards) await plugin.store.save(card);
                        result.image += cards.length;
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
            const cards = plugin.createClozeCards(text, sourcePath);
            for (const card of cards) await plugin.store.save(card);
            result.cloze += cards.length;
        } else {
            const front = (fields[0] ?? '').trim();
            const back = (fields[1] ?? '').trim();
            if (!front || !back) {
                result.skipped++;
                continue;
            }
            await plugin.store.save(plugin.createQaCard(front, back, sourcePath));
            result.qa++;
        }
    }

    db.close();
    return result;
}
