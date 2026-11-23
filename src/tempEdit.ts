import { type Editor, type EventRef, MarkdownView, Notice, TFile, TFolder, type WorkspaceLeaf, normalizePath } from 'obsidian';
import type { CardRecord } from './card';
import type FakeCardPlugin from '../main';
import { clozeGroups, parseCloze, wrapBlockLines, wrapSelection } from './cloze';
import { joinQa, splitQa } from './qaDoc';
import { syncClozeGroup } from './sourceSync';
import { tt, ttf } from './i18n';

/** The card fields an editor split can hold. `qa` is both sides at once. */
export type EditableField = 'front' | 'back' | 'clozeText' | 'qa';

/** File name suffix per field: `<card id>-<suffix>.md`. */
const SUFFIX: Record<EditableField, string> = {
    front: 'front',
    back: 'back',
    clozeText: 'cloze',
    qa: 'qa',
};

/** Pause after the last keystroke before the text is written into the card. */
const WRITE_DELAY_MS = 600;

/**
 * Leftovers younger than this may be another window's live draft: every
 * keystroke refreshes mtime, so only genuinely dead files look this old.
 */
const STALE_AFTER_MS = 10 * 60 * 1000;

interface Session {
    card: CardRecord;
    field: EditableField;
    file: TFile;
    timer: number | null;
    /** Our bar in the view header: the field name and the cloze tools. */
    header: HTMLElement | null;
    /** The view container carrying the "hide the card id" class. */
    shell: HTMLElement | null;
    modifyRef: EventRef;
    deleteRef: EventRef;
    renameRef: EventRef;
    /** Registered once the file is actually open; null before that. */
    layoutRef: EventRef | null;
    /** Opens the card panel again when the user asks to go back. */
    returnToPanel: (() => void) | null;
    /** Keeps a missing Q&A divider from producing a notice on every keystroke. */
    missingSeparatorNotified: boolean;
}

/**
 * Edit one card field in a real Obsidian editor.
 *
 * The field is written to a scratch note inside the plugin's own folder and
 * opened in a split, so the editor is Obsidian's own: live preview, wiki links,
 * math, embeds, other plugins - everything a note gets, which a textarea in a
 * modal can never have. Keystrokes flow back into the JSON card a moment later,
 * and the note is deleted when the split closes.
 *
 * The card stays the source of truth: the note is scratch space, never part of
 * the library, and everything left behind by a crash is swept on startup.
 */
export class TempEditor {
    private sessions = new Map<string, Session>();
    /** The split the previous field was opened in, reused while it holds one. */
    private lastLeaf: WorkspaceLeaf | null = null;

    constructor(private plugin: FakeCardPlugin) {}

    private get app() {
        return this.plugin.app;
    }

    private get folderPath(): string {
        // A dot-folder would keep these out of sight, but Obsidian does not put
        // hidden paths in the vault index - and `openFile` needs a file from
        // that index. So the folder is visible and simply short-lived.
        return normalizePath(`${this.plugin.store.folder}/editing`);
    }

    /**
     * Open `field` of `card` in a split. The caller has already persisted the
     * panel's current text into the card, so the file starts from what was on
     * screen rather than from something older.
     */
    /** `line` walks the caret to that source line once the split is up. */
    async open(
        card: CardRecord,
        field: EditableField,
        line?: number,
        returnToPanel?: () => void,
    ): Promise<void> {
        try {
            await this.openField(card, field, line, returnToPanel);
        } catch (error) {
            // Nothing else would report this: the split simply never appears.
            console.error('[fakecard] could not open the editor', error);
            new Notice(ttf('Could not open the editor: {message}', { message: `${error}` }));
        }
    }

    private async openField(
        card: CardRecord,
        field: EditableField,
        line?: number,
        returnToPanel?: () => void,
    ): Promise<void> {
        const folder = this.folderPath;
        if (!(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
            await this.app.vault.createFolder(folder);
        }

        const path = normalizePath(`${folder}/${card.id}-${SUFFIX[field]}.md`);

        // Already open: focus it instead of starting a second session for it. A
        // session without a leaf yet is still opening - leave it alone.
        if (this.sessions.has(path)) {
            const session = this.sessions.get(path);
            if (session && returnToPanel) session.returnToPanel = returnToPanel;
            const leaf = this.findLeaf(path);
            if (leaf) this.app.workspace.setActiveLeaf(leaf, { focus: true });
            return;
        }

        const text = this.read(card, field);
        const existing = this.app.vault.getAbstractFileByPath(path);
        let opened: TFile;
        if (existing instanceof TFile) {
            // A crashed session's draft: the card is the truth, not the corpse.
            await this.app.vault.modify(existing, text);
            opened = existing;
        } else {
            opened = await this.app.vault.create(path, text);
        }

        const session: Session = {
            card,
            field,
            file: opened,
            timer: null,
            header: null,
            shell: null,
            modifyRef: this.app.vault.on('modify', (changed) => {
                if (changed.path === path) this.schedule(session);
            }),
            deleteRef: this.app.vault.on('delete', (gone) => {
                if (gone.path === path) void this.finish(path, false);
            }),
            renameRef: this.app.vault.on('rename', (file, oldPath) => {
                if (oldPath !== path) return;
                // The name is ours; a rename means the session is over. Save
                // what is in the file, then drop it under its new name.
                void this.finish(path, true, file.path);
            }),
            layoutRef: null,
            returnToPanel: returnToPanel ?? null,
            missingSeparatorNotified: false,
        };
        this.sessions.set(path, session);

        const leaf = await this.leafFor(opened);
        // Land on the line that was clicked in the preview, not line 1.
        if (line !== undefined && leaf.view instanceof MarkdownView) {
            const editor = leaf.view.editor;
            const at = Math.max(0, Math.min(line, editor.lineCount() - 1));
            editor.setCursor({ line: at, ch: 0 });
            editor.scrollIntoView({ from: { line: at, ch: 0 }, to: { line: at, ch: 0 } }, true);
        }
        this.attachHeader(session, leaf, path);

        // Watch for the split going away only now: the layout-changing events
        // that opening it fires would otherwise look like a close.
        session.layoutRef = this.app.workspace.on('layout-change', () => {
            if (!this.findLeaf(path)) void this.finish(path, true);
        });
    }

    /**
     * Delete scratch files a crash left behind. Runs once after the layout is
     * up - that is the check a timer would be doing, at the only moment it is
     * both safe and sufficient.
     */
    async sweep(): Promise<void> {
        const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
        if (!(folder instanceof TFolder)) return;
        const cutoff = Date.now() - STALE_AFTER_MS;
        for (const child of [...folder.children]) {
            if (!(child instanceof TFile)) continue;
            // Only our own naming; anything else in there is the user's.
            if (!/-(front|back|cloze|qa)\.md$/.test(child.name)) continue;
            if (this.sessions.has(child.path)) continue;
            if (child.stat.mtime > cutoff) continue;
            try {
                // Trash rather than delete: it honours the user's deletion
                // preference, and a scratch note is disposable either way.
                await this.app.fileManager.trashFile(child);
            } catch {
                // Locked or already gone - the next startup tries again.
            }
        }
    }

    /**
     * The bar at the top of the note being edited.
     *
     * It says which field this is - the file name is a card id, so the big
     * inline title is hidden, nothing on screen invites renaming it - and for a
     * cloze body it carries the tools that are not typing: wrap the selection
     * in a hole, open a new group, take a hole out again. They act on the
     * editor's own selection, exactly like the panel's buttons did.
     */
    private attachHeader(session: Session, leaf: WorkspaceLeaf, path: string): void {
        const view = leaf.view;
        if (!(view instanceof MarkdownView)) return;

        view.containerEl.addClass('fakecard-scratch');
        session.shell = view.containerEl;

        const bar = createDiv({ cls: 'fakecard-editor-toolbar' });
        bar.createSpan({
            cls: 'fakecard-editor-title',
            text: session.field === 'clozeText'
                ? tt('Cloze text')
                : session.field === 'qa'
                    ? tt('Q&A')
                    : session.field === 'front' ? tt('Question') : tt('Answer'),
        });

        if (session.field === 'clozeText') this.addClozeTools(bar, view, path);
        if (session.field === 'qa') {
            bar.createSpan({
                cls: 'fakecard-editor-hint',
                text: tt('Question above the divider, answer below it. Keep the divider.'),
            });
        }
        if (session.returnToPanel) {
            const back = bar.createEl('button', {
                cls: 'fakecard-editor-back',
                text: tt('Back to panel'),
                attr: { type: 'button' },
            });
            back.addEventListener('click', () => {
                void this.returnToPanel(session, path);
            });
        }

        // A row of its own, right under the view header: part of the layout, so
        // it never floats over the text or hides behind anything.
        const header = view.containerEl.querySelector<HTMLElement>('.view-header');
        if (header) header.insertAdjacentElement('afterend', bar);
        else view.containerEl.prepend(bar);
        session.header = bar;
    }

    /** Wrap / new group / remove, acting on the editor's current selection. */
    private addClozeTools(bar: HTMLElement, view: MarkdownView, path: string): void {
        const select = bar.createEl('select', { cls: 'dropdown' });

        const fill = (keep?: number): void => {
            const max = Math.max(1, ...clozeGroups(view.editor.getValue()));
            select.empty();
            for (let group = 1; group <= max; group++) {
                const option = select.createEl('option');
                option.value = String(group);
                option.textContent = `c${group}`;
            }
            select.value = String(keep && keep <= max ? keep : max);
        };
        fill();

        // The leaf can be switched to another note before this bar is removed,
        // so every action re-checks what it is pointing at.
        const editor = (): Editor | null => (view.file?.path === path ? view.editor : null);

        const read = (target: Editor): { from: number; to: number; value: string } => ({
            from: target.posToOffset(target.getCursor('from')),
            to: target.posToOffset(target.getCursor('to')),
            value: target.getValue(),
        });

        const wrap = (group: number | 'new'): void => {
            const target = editor();
            if (!target) return;
            const { from, to, value } = read(target);
            if (from === to) {
                new Notice(tt('Select some text first.'));
                return;
            }
            const wanted = group === 'new' ? Math.max(0, ...clozeGroups(value)) + 1 : group;

            if (value.slice(from, to).includes('\n')) {
                // Several blocks: one hole per line, or the markers end up
                // inside the braces and neither the list nor the hole renders.
                const block = wrapBlockLines(value, from, to, wanted);
                target.replaceRange(block.text, target.offsetToPos(block.from), target.offsetToPos(block.to));
                target.setCursor(target.offsetToPos(block.from + block.text.length));
            } else {
                const result = wrapSelection(value, from, to, wanted);
                target.replaceSelection(result.text.slice(from, result.caret));
                target.setCursor(target.offsetToPos(result.caret));
            }
            fill(wanted);
        };

        bar.createEl('button', { text: tt('Wrap selection') })
            .addEventListener('click', () => wrap(Number.parseInt(select.value, 10) || 1));
        bar.createEl('button', { text: tt('New group') })
            .addEventListener('click', () => wrap('new'));
        bar.createEl('button', { text: tt('Remove cloze') })
            .addEventListener('click', () => {
                const target = editor();
                if (!target) return;
                const { from, to, value } = read(target);
                const holes = parseCloze(value).filter((hole) => hole.to > from && hole.from < to);
                if (holes.length === 0) {
                    new Notice(tt('No cloze mask at the cursor.'));
                    return;
                }
                target.transaction({
                    changes: holes.map((hole) => ({
                        from: target.offsetToPos(hole.from),
                        to: target.offsetToPos(hole.to),
                        text: hole.text,
                    })),
                });
                fill();
            });
    }

    /**
     * Delete scratch notes that no live session owns - the manual version of
     * the startup sweep, without its age guard (the user asked for this one).
     * Returns how many files went away.
     */
    async cleanup(): Promise<number> {
        const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
        if (!(folder instanceof TFolder)) return 0;
        let removed = 0;
        for (const child of [...folder.children]) {
            if (!(child instanceof TFile)) continue;
            if (!/-(front|back|cloze|qa)\.md$/.test(child.name)) continue;
            if (this.sessions.has(child.path)) continue;
            try {
                await this.app.fileManager.trashFile(child);
                removed++;
            } catch {
                // Locked or already gone - the startup sweep tries again.
            }
        }
        return removed;
    }

    /** Plugin unload: persist every draft, then drop the scratch files. */
    async flushAll(): Promise<void> {
        for (const path of [...this.sessions.keys()]) await this.finish(path, true);
    }

    /** Save, close the split, then let the caller reopen the card panel. */
    private async returnToPanel(session: Session, path: string): Promise<void> {
        const callback = session.returnToPanel;
        if (!callback) return;
        session.returnToPanel = null;
        await this.finish(path, true);
        callback();
    }

    private read(card: CardRecord, field: EditableField): string {
        if (field === 'qa') {
            return joinQa(
                typeof card.front === 'string' ? card.front : '',
                typeof card.back === 'string' ? card.back : '',
            );
        }
        const value = card[field];
        return typeof value === 'string' ? value : '';
    }

    private findLeaf(path: string): WorkspaceLeaf | null {
        // Every window, not just the main one: a note dragged into a popout is
        // still being edited there.
        const leaves: WorkspaceLeaf[] = [];
        this.app.workspace.iterateAllLeaves((leaf) => {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file?.path === path) leaves.push(leaf);
        });
        return leaves[0] ?? null;
    }

    /** A split holding a scratch note - reused instead of piling up panes. */
    private async leafFor(file: TFile): Promise<WorkspaceLeaf> {
        const prefix = `${this.folderPath}/`;
        const current = this.lastLeaf;
        const view = current?.view;
        if (current && view instanceof MarkdownView && (view.file?.path ?? '').startsWith(prefix)) {
            await current.openFile(file);
            return current;
        }
        const leaf = this.app.workspace.getLeaf('split');
        await leaf.openFile(file);
        this.lastLeaf = leaf;
        return leaf;
    }

    private schedule(session: Session): void {
        if (session.timer !== null) window.clearTimeout(session.timer);
        session.timer = window.setTimeout(() => {
            session.timer = null;
            void this.write(session);
        }, WRITE_DELAY_MS);
    }

    private async write(session: Session): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(session.file.path);
        if (!(file instanceof TFile)) return;
        const text = await this.app.vault.read(file);
        await this.apply(session, text, false);
        this.plugin.notifyCardEdited();
    }

    /**
     * Put the editor's text into the card - the only place data is stored.
     *
     * `final` is false while typing: a cloze body is then only copied over,
     * because half-typed braces are not a cloze body and building group cards
     * from them would create and delete siblings on every keystroke. The full
     * sync runs once editing stops.
     */
    private async apply(session: Session, raw: string, final: boolean): Promise<void> {
        const text = raw.replace(/\r\n/g, '\n');
        const { field } = session;

        // The card may have moved on since the split opened (rated in another
        // pane, synced from elsewhere). Write into the stored copy, never into
        // the snapshot, or an old FSRS state would come back with the text.
        const card = (await this.plugin.store.list()).find((entry) => entry.id === session.card.id);
        if (!card) return;

        if (field === 'qa') {
            const parts = splitQa(text);
            if (!parts) {
                if (!session.missingSeparatorNotified) {
                    session.missingSeparatorNotified = true;
                    new Notice(tt('The Q&A divider is missing; the answer was not saved.'));
                }
                return;
            }
            session.missingSeparatorNotified = false;
            if (card.front === parts.front && card.back === parts.back) return;
            card.front = parts.front;
            card.back = parts.back;
            card.updated = new Date().toISOString();
            await this.plugin.store.save(card);
            return;
        }

        if (field === 'clozeText') {
            if (final) {
                await syncClozeGroup(this.plugin, card, text);
                return;
            }
            if (card.clozeText === text) return;
            card.clozeText = text;
            card.updated = new Date().toISOString();
            await this.plugin.store.save(card);
            return;
        }

        if (card[field] === text) return;
        card[field] = text;
        card.updated = new Date().toISOString();
        await this.plugin.store.save(card);
    }

    /**
     * End a session. `at` is the file's current path when it no longer matches
     * the session key - a renamed scratch note is still the same draft.
     */
    private async finish(path: string, removeFile: boolean, at?: string): Promise<void> {
        const session = this.sessions.get(path);
        if (!session) return;
        this.sessions.delete(path);

        if (session.timer !== null) {
            window.clearTimeout(session.timer);
            session.timer = null;
        }
        this.app.vault.offref(session.modifyRef);
        this.app.vault.offref(session.deleteRef);
        this.app.vault.offref(session.renameRef);
        if (session.layoutRef) this.app.workspace.offref(session.layoutRef);
        session.header?.remove();
        const shell = session.shell;
        if (shell) {
            // The same split can already be holding the next field (the leaf is
            // reused): only clear the class when no session still needs it.
            const shared = [...this.sessions.values()].some((other) => other.shell === shell);
            if (!shared) shell.removeClass('fakecard-scratch');
        }

        const file = this.app.vault.getAbstractFileByPath(at ?? path);
        const live = this.findLeaf(at ?? path);
        let text: string | null = null;
        if (live?.view instanceof MarkdownView && live.view.file?.path === (at ?? path)) {
            // The editor buffer is newer than the file while a keystroke is
            // still waiting for Obsidian's own save - closing must not drop it.
            text = live.view.editor.getValue();
        } else if (file instanceof TFile) {
            try {
                text = await this.app.vault.read(file);
            } catch {
                // Already gone; the last debounced write is the newest we have.
            }
        }
        if (text !== null) await this.apply(session, text.trim(), true);
        if (removeFile && live) {
            // Drop the view before the scratch file disappears. Obsidian's
            // delete handler still walks the view's parents; trashing a file
            // that is open there throws before the panel can open.
            live.detach();
            if (this.lastLeaf === live) this.lastLeaf = null;
            // Let the workspace finish removing the leaf before deleting the
            // file; otherwise that same handler still sees the closing view.
            await new Promise((resolve) => window.setTimeout(resolve, 100));
        }
        if (file instanceof TFile && removeFile) {
            try {
                // A scratch note is disposable. Remove it through the adapter
                // instead of the trash UI: trashing a file that was just open
                // makes Obsidian's onDelete walk a detached view and throw.
                await this.app.vault.adapter.remove(file.path);
            } catch {
                // The startup sweep owns it now.
            }
        }
        this.plugin.notifyCardEdited();
    }
}
