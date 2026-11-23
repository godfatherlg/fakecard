/**
 * The few Obsidian runtime pieces the testable modules touch.
 *
 * `obsidian` ships types only (`main` is empty), so Node cannot import it.
 * Vitest aliases the package here; the real plugin keeps using the real API.
 */
export class TFile {
    path: string;
    name: string;

    constructor(path: string) {
        this.path = path;
        this.name = path.split('/').pop() ?? path;
    }
}

export class TFolder {
    path: string;
    name: string;
    children: unknown[] = [];

    constructor(path: string) {
        this.path = path;
        this.name = path.split('/').pop() ?? path;
    }
}

export class Notice {
    static messages: string[] = [];

    constructor(message: string) {
        Notice.messages.push(message);
    }
}

export class Menu {}

export class Component {}

export function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function getLanguage(): string {
    return 'en';
}

export const moment = {
    locale: () => 'en',
};
