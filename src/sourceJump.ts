import { App, Notice, TFile } from 'obsidian';
import type { CardRecord } from './card';

/**
 * Jump from a card back to the block it came from - without writing anything
 * into the note.
 *
 * The line is resolved at click time from the note's CURRENT content, so an
 * edited note still lands correctly as long as the anchor text survives:
 *
 *   Q&A   -> the heading that contains source.heading
 *   Cloze -> the list item that starts with the snapshot's first line
 *            (exact line first, then a 20-character prefix match), or the
 *            %%fakecard:id%% marker when sync is enabled
 *   Image -> the ![[image]] embed line
 *
 * If nothing matches (the text was rewritten or deleted), the note is opened
 * without moving the cursor and the user is told why.
 */
export interface JumpTarget {
    path: string;
    /** 0-based line. */
    line: number;
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_RE = /^\s*(?:[-*+]|\d+\.)\s+/;

export async function findCardLine(app: App, card: CardRecord): Promise<JumpTarget | null> {
    const file = app.vault.getAbstractFileByPath(card.source.path);
    if (!(file instanceof TFile)) return null;

    const content = await app.vault.cachedRead(file);
    const lines = content.split('\n');

    // Q&A: the heading text.
    if (card.type === 'qa' && card.source.heading) {
        const needle = card.source.heading.trim();
        if (needle) {
            const index = lines.findIndex((line) => {
                const match = HEADING_RE.exec(line);
                return match !== null && match[2].includes(needle);
            });
            if (index >= 0) return { path: file.path, line: index };
        }
    }

    // Cloze: the list block recorded at creation time.
    if (card.type === 'cloze' && card.source.snapshot) {
        const firstLine = card.source.snapshot.split('\n').find((line) => LIST_RE.test(line));
        if (firstLine) {
            // 1. exact line, 2. a short prefix (later edits inside the line
            //    must not break the jump).
            const exact = firstLine.trim();
            let index = lines.findIndex((line) => line.trim() === exact);
            if (index < 0) {
                const needle = firstLine.replace(LIST_RE, '').trim().slice(0, 20);
                if (needle) index = lines.findIndex((line) => LIST_RE.test(line) && line.includes(needle));
            }
            if (index >= 0) return { path: file.path, line: index };
        }
        // 3. the marker, if "sync back" inserted one.
        if (card.source.marker) {
            const index = lines.findIndex((line) => line.includes(card.source.marker!));
            if (index >= 0) return { path: file.path, line: index };
        }
    }

    // Image: the embed line.
    if (card.type === 'image' && card.image?.path) {
        const name = card.image.path.split('/').pop() ?? '';
        if (name) {
            const index = lines.findIndex((line) => line.includes(name));
            if (index >= 0) return { path: file.path, line: index };
        }
    }

    return null;
}

/** Open the card's source note and put the cursor on the resolved line. */
export async function jumpToCardSource(app: App, card: CardRecord): Promise<void> {
    const target = await findCardLine(app, card);

    if (!target) {
        new Notice('Could not locate the source block - the note may have been edited. Opening the note instead.');
        const file = app.vault.getAbstractFileByPath(card.source.path);
        if (file instanceof TFile) await app.workspace.getLeaf('tab').openFile(file);
        return;
    }

    // Opening with a line in the view state scrols straight to it; nothing is
    // written to the note.
    await app.workspace.getLeaf('tab').setViewState({
        type: 'markdown',
        state: { file: target.path, line: target.line },
        active: true,
    });
}
