import { App, Menu, Notice, setTooltip } from 'obsidian';

import type { CardRecord } from './card';
import { ChildCardPromptModal } from './childPrompt';
import { childScore, isGraduatable } from './childStreak';
import { ClozePanelModal } from './clozePanel';
import { ImagePanelModal } from './imagePanel';
import { tt } from './i18n';
import { QaPanelModal } from './qaPanel';
import type FakeCardPlugin from '../main';

/**
 * The child-card flow: turning a card that keeps failing into a simpler
 * stand-in, then bringing the parent back once every child has graduated.
 *
 * Kept out of ReviewView because it is screens and panels, not session state:
 * the view only asks for the button state and hands over the clicks. The
 * reload callback is the one thing it borrows, because pausing the parent
 * changes the queue the view is showing.
 */
export class ReviewChildCards {
    constructor(
        private app: App,
        private plugin: FakeCardPlugin,
        private reload: () => void,
    ) {}

    /**
     * How badly the card has been failing lately. Every Hard adds 1 and every
     * Again adds `childAgainScore`; any Good or Easy ends the run.
     */
    private async failingScore(card: CardRecord): Promise<number> {
        const streak = Math.max(1, this.plugin.settings.childHardStreak);
        // Wide window on purpose: an imported Anki history is often months old
        // and must still count towards the failing streak.
        const logs = await this.plugin.reviews.recentForCard(card.id, streak, 365);
        return childScore(logs, this.plugin.settings.childAgainScore);
    }

    /** Colour the button once the card has failed often enough to deserve one. */
    async markArmed(button: HTMLButtonElement, card: CardRecord): Promise<void> {
        const target = Math.max(1, this.plugin.settings.childHardStreak);
        const score = await this.failingScore(card);
        if (score < target || !button.isConnected) return;

        button.addClass('is-armed');
        setTooltip(button, tt('This card keeps failing - build a child card now'));
    }

    /**
     * The button is always available, but building a child pauses the parent.
     * Below the failing threshold that is a decision, not a misclick: explain
     * it and wait for Continue before the type menu opens.
     */
    async request(parent: CardRecord, event: MouseEvent): Promise<void> {
        if (!this.plugin.settings.childCardsEnabled) return;
        const at = { x: event.clientX, y: event.clientY };
        const target = Math.max(1, this.plugin.settings.childHardStreak);
        const score = await this.failingScore(parent);

        if (score >= target) {
            this.chooseType(parent, at);
            return;
        }

        // The card's own history, so the child can be chosen with the evidence
        // in sight: a card that keeps getting "mixed up" wants a comparison,
        // not another lone cloze.
        const logs = await this.plugin.reviews.recentForCard(parent.id, 100, 730);
        const stats = {
            reviews: logs.length,
            mixed: logs.filter((log) => log.mixed).length,
        };
        new ChildCardPromptModal(this.app, score, target, () => {
            this.chooseType(parent, at);
        }, stats).open();
    }

    /**
     * Offer the shapes a child card can take. The parent's own text seeds the
     * panel, so the user trims instead of retyping. An image parent can hand
     * its picture to a new occlusion card.
     */
    private chooseType(parent: CardRecord, at: { x: number; y: number }): void {
        if (!this.plugin.settings.childCardsEnabled) return;
        const menu = new Menu();
        menu.addItem((item) => item
            .setTitle(tt('Q&A child card'))
            .setIcon('file-text')
            .onClick(() => this.openPanel(parent, 'qa')));
        menu.addItem((item) => item
            .setTitle(tt('Cloze child card'))
            .setIcon('text-cursor-input')
            .onClick(() => this.openPanel(parent, 'cloze')));
        // Every card can get an image child: a text card just starts from an
        // empty panel and takes the picture from the clipboard or a file.
        menu.addItem((item) => item
            .setTitle(tt('Image occlusion child card'))
            .setIcon('image')
            .onClick(() => this.openPanel(parent, 'image')));
        menu.showAtPosition(at);
    }

    /**
     * Open a panel prefilled from the parent. The new card is linked through
     * childOf and never touches the parent's own text.
     */
    private openPanel(parent: CardRecord, type: 'qa' | 'cloze' | 'image'): void {
        const onSaved = (): void => {
            void this.attach(parent);
        };

        if (type === 'image') {
            // An empty path opens the panel in "pick an image" mode: the
            // parent has no picture, so the user pastes or imports one.
            new ImagePanelModal(
                this.app,
                this.plugin,
                parent.image?.path ?? '',
                parent.source.path,
                undefined,
                onSaved,
                parent.id,
            ).open();
            return;
        }

        if (type === 'cloze') {
            const seed = parent.type === 'cloze' && parent.clozeText
                ? parent.clozeText
                : parent.back;
            new ClozePanelModal(
                this.app,
                this.plugin,
                parent.source.path,
                undefined,
                seed,
                onSaved,
                parent.id,
            ).open();
            return;
        }

        new QaPanelModal(
            this.app,
            this.plugin,
            parent.source.path,
            undefined,
            parent.back,
            onSaved,
            parent.front,
            parent.id,
        ).open();
    }

    /**
     * Pause the parent once a child really exists. A panel that was dismissed
     * without saving must not leave the parent suspended with nothing to
     * study it through.
     */
    private async attach(parent: CardRecord): Promise<void> {
        const all = await this.plugin.store.list();
        if (!all.some((card) => card.childOf === parent.id)) return;

        parent.suspended = true;
        await this.plugin.store.save(parent);
        new Notice(tt('Child card created - parent paused.'));
        this.reload();
    }

    /**
     * After rating a child: a run of Good ratings graduates it; once every
     * child of the parent has graduated, the parent comes back.
     */
    async checkChild(child: CardRecord): Promise<{ id: string; json: string } | null> {
        if (!child.childOf) return null;

        const streak = Math.max(1, this.plugin.settings.childGoodStreak);
        const logs = await this.plugin.reviews.recentForCard(child.id, streak);
        if (!isGraduatable(logs.map((log) => log.rating), streak)) return null;

        child.graduated = true;
        await this.plugin.store.save(child);

        const all = await this.plugin.store.list();
        const siblings = all.filter((card) => card.childOf === child.childOf);
        if (siblings.length === 0 || !siblings.every((card) => card.graduated)) return null;

        const parent = all.find((card) => card.id === child.childOf);
        if (!parent) return null;
        // Snapshot before the parent is touched: undoing the child's rating
        // must put the parent back to paused if it was.
        const snapshot = { id: parent.id, json: JSON.stringify(parent) };
        parent.suspended = false;
        await this.plugin.store.save(parent);
        return snapshot;
    }
}
