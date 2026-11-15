import { setIcon, WorkspaceLeaf } from 'obsidian';
import type FakeCardPlugin from '../main';

/** The three main-area pages, in the order the nav bar shows them. */
export type FakeCardPage = 'stats' | 'browse' | 'review';

const ITEMS: Array<{ page: FakeCardPage; label: string; icon: string }> = [
    { page: 'stats', label: 'Statistics', icon: 'bar-chart-2' },
    { page: 'browse', label: 'Browse', icon: 'table' },
    { page: 'review', label: 'Review', icon: 'play' },
];

/**
 * One row of tabs above the page content, the way the dashboard / browse /
 * stats screens of True Recall share a single navigation strip.
 *
 * Clicking an entry swaps the current leaf to that view rather than opening a
 * fourth tab, but an already-open page is revealed instead, so a review
 * session in another tab is never thrown away.
 */
export function renderViewNav(
    container: HTMLElement,
    plugin: FakeCardPlugin,
    leaf: WorkspaceLeaf,
    active: FakeCardPage,
): void {
    const nav = container.createDiv({ cls: 'fakecard-nav', attr: { role: 'tablist' } });
    for (const item of ITEMS) {
        const isActive = item.page === active;
        const button = nav.createEl('button', {
            cls: isActive ? 'fakecard-nav-item is-active' : 'fakecard-nav-item',
            attr: isActive ? { 'aria-selected': 'true', role: 'tab' } : { 'aria-selected': 'false', role: 'tab' },
        });
        setIcon(button.createSpan({ cls: 'fakecard-nav-icon' }), item.icon);
        button.createSpan({ cls: 'fakecard-nav-label', text: item.label });
        button.addEventListener('click', () => {
            if (isActive) return;
            void plugin.navigateTo(item.page, leaf);
        });
    }
}
