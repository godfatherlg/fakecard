import type { CardRecord } from './card';
import { clozeToHighlight } from './cloze';

/**
 * Locate helpers shared by the reading-view badge and the JSON importer.
 * Pure functions: no plugin instance, no file writes.
 */

/**
 * Find the rendered block a card came from: the heading for Q&A cards, the
 * first list item for cloze cards, the picture for image cards.
 */
export function findSourceTarget(container: HTMLElement, card: CardRecord): HTMLElement | null {
    if (card.type === 'qa' && card.source.heading) {
        const heading = card.source.heading.trim().toLowerCase();
        if (heading) {
            for (const node of Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'))) {
                if ((node.textContent ?? '').toLowerCase().includes(heading)) return node as HTMLElement;
            }
        }
    }

    if (card.type === 'cloze' && card.source.snapshot) {
        const firstLine = card.source.snapshot
            .split('\n')
            .find((line) => /^\s*(?:[-*+]|\d+\.)\s+/.test(line));
        if (firstLine) {
            const needle = firstLine.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').slice(0, 20).trim();
            if (needle) {
                for (const node of Array.from(container.querySelectorAll('li'))) {
                    if ((node.textContent ?? '').includes(needle)) return node as HTMLElement;
                }
            }
        }
    }

    if (card.type === 'image' && card.image?.path) {
        const fileName = card.image.path.split('/').pop() ?? '';
        if (fileName) {
            for (const node of Array.from(container.querySelectorAll('img'))) {
                const img = node as HTMLImageElement;
                const src = img.getAttribute('src') ?? '';
                if (src.includes(fileName) || src.includes(encodeURIComponent(fileName))) {
                    // The badge lives next to the image, so use its wrapper.
                    return img.parentElement ?? img;
                }
            }
        }
    }

    return null;
}

/**
 * Best-effort source snippet for imported cards: AI-written questions may not
 * exist in the note, but the answer / cloze text usually does. The snippet is
 * only used to place the reading-view badge - no file is modified.
 */
export function findSourceSnapshot(content: string, card: CardRecord): string | undefined {
    if (!content) return undefined;

    if (card.type === 'cloze' && card.clozeText) {
        for (const line of clozeToHighlight(card.clozeText).split('\n')) {
            const trimmed = line.trim();
            if (trimmed && content.includes(trimmed)) return line;
        }
    }

    if (card.type === 'qa') {
        // The answer usually comes from the note; the question may be AI-written.
        for (const candidate of [card.back, card.front]) {
            const firstLine = (candidate ?? '').split('\n')[0].trim();
            if (!firstLine) continue;
            const needle = firstLine.slice(0, 30);
            if (needle && content.includes(needle)) return firstLine;
        }
    }

    return undefined;
}
