import { type ClozeHole, parseCloze } from './cloze';

/**
 * An outline read as a tree.
 *
 * The card's text stays plain Markdown - headings, list items, and the same
 * `{{c1::...}}` holes a cloze card uses - because that is what can be edited in
 * a note, searched, diffed and pasted in from elsewhere. The tree is a reading
 * of it, not another format to keep in sync.
 */
export interface OutlineNode {
    /** Path id: "0", "0.2", "0.2.1" - stable while the structure is. */
    id: string;
    /** The line's text, still carrying its `{{cN::...}}` markers. */
    text: string;
    depth: number;
    children: OutlineNode[];
    /** Holes parsed out of `text`. */
    holes: ClozeHole[];
    /** Set when the whole text sits inside one hole: that is a node-level mask. */
    wholeHole?: number;
    /** First and last source line of this node (continuations included). */
    line: number;
    endLine: number;
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function makeNode(text: string, depth: number, line: number, id = ''): OutlineNode {
    return { id, text, depth, children: [], holes: parseCloze(text), line, endLine: line };
}

/** A node is fully masked when its text is exactly one hole, nothing else. */
function detectWholeHole(node: OutlineNode): void {
    const match = /^\s*\{\{c(\d+)::([\s\S]*)\}\}\s*$/.exec(node.text);
    if (match) node.wholeHole = Number(match[1]);
}

/**
 * Parse an outline into a tree.
 *
 * Depth comes from heading level for headings, and from indentation for list
 * items (two spaces or one tab per level), offset under the last heading. Lines
 * that are neither (and are not blank) continue the previous node: a node's
 * text may span several lines.
 */
export function parseOutline(source: string): OutlineNode {
    const root = makeNode('', 0, 0);
    const stack: Array<{ depth: number; node: OutlineNode }> = [{ depth: 0, node: root }];
    const lines = source.replace(/\r\n?/g, '\n').split('\n');
    let headingDepth = 0;
    let previous: OutlineNode | null = null;

    const attach = (node: OutlineNode): void => {
        while (stack.length > 1 && stack[stack.length - 1].depth >= node.depth) stack.pop();
        const parent = stack[stack.length - 1].node;
        node.id = parent.id ? `${parent.id}.${parent.children.length}` : String(parent.children.length);
        parent.children.push(node);
        stack.push({ depth: node.depth, node });
        previous = node;
    };

    // One indent step is whatever the outline actually uses. Pasted outlines
    // come with two spaces, four spaces, a tab or a single space, and assuming
    // two collapsed the deeper levels into one flat row.
    const widths = lines
        .map((raw) => LIST.exec(raw.replace(/\s+$/, '')))
        .map((match) => (match ? match[1].replace(/\t/g, '  ').length : 0))
        .filter((width) => width > 0);
    let unit = widths.length > 0 ? Math.min(...widths) : 2;
    if (unit > 0 && Math.max(...widths, 0) / unit > 8) unit = 2;

    for (const [index, raw] of lines.entries()) {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) continue;

        const heading = HEADING.exec(line);
        if (heading) {
            headingDepth = heading[1].length;
            attach(makeNode(heading[2], headingDepth, index));
            continue;
        }

        const list = LIST.exec(line);
        if (list) {
            const indent = list[1].replace(/\t/g, '  ').length;
            const depth = headingDepth + 1 + Math.floor(indent / unit);
            attach(makeNode(list[3], depth, index));
            continue;
        }

        // A plain line belongs to the node above it - usually a list item that
        // wrapped in the source. Before any node exists it is the map's centre.
        if (previous) {
            const target = previous as OutlineNode;
            target.text = `${target.text} ${line.trim()}`;
            target.holes = parseCloze(target.text);
            target.endLine = index;
        } else {
            root.text = root.text ? `${root.text} ${line.trim()}` : line.trim();
            root.endLine = index;
        }
    }

    const visit = (node: OutlineNode): void => {
        detectWholeHole(node);
        node.children.forEach(visit);
    };
    visit(root);
    root.holes = parseCloze(root.text);
    return root;
}

/**
 * The node a card asks about: the first one carrying a hole of that group, or
 * the one whose whole text is that hole. Used to centre the map on the question
 * - and on the same node again once the answer is showing.
 */
export function findQuestionNode(root: OutlineNode, group: number): OutlineNode | null {
    let found: OutlineNode | null = null;
    const visit = (node: OutlineNode): void => {
        if (found) return;
        if (node.wholeHole === group || node.holes.some((hole) => hole.group === group)) {
            found = node;
            return;
        }
        node.children.forEach(visit);
    };
    visit(root);
    return found;
}

/** Every hole group used anywhere in the tree, ascending. */
export function outlineGroups(root: OutlineNode): number[] {
    const groups = new Set<number>();
    const visit = (node: OutlineNode): void => {
        for (const hole of node.holes) groups.add(hole.group);
        node.children.forEach(visit);
    };
    visit(root);
    return [...groups].sort((a, b) => a - b);
}

/** One node's text split into plain and masked pieces, for rendering. */
export interface TextPiece {
    text: string;
    masked: boolean;
    /** The hole's group, when this piece is a hole. */
    group?: number;
    /** Offsets in the node's raw text, so a selection can be mapped back. */
    from: number;
    to: number;
}

/**
 * Split a node's text into pieces, masking the given groups.
 *
 * `maskGroups` empty means "nothing hidden" - the answer side.
 */
export function splitNodeText(text: string, maskGroups: ReadonlySet<number>): TextPiece[] {
    const holes = parseCloze(text);
    const pieces: TextPiece[] = [];
    let at = 0;
    for (const hole of holes) {
        if (hole.from > at) {
            pieces.push({ text: text.slice(at, hole.from), masked: false, from: at, to: hole.from });
        }
        const masked = maskGroups.has(hole.group);
        pieces.push({ text: hole.text, masked, group: hole.group, from: hole.from, to: hole.to });
        at = hole.to;
    }
    if (at < text.length) pieces.push({ text: text.slice(at), masked: false, from: at, to: text.length });
    return pieces;
}
