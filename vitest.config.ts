import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            // The published package is types-only; tests need a small runtime.
            obsidian: fileURLToPath(new URL('./tests/obsidian-stub.ts', import.meta.url)),
        },
    },
    test: {
        include: ['tests/**/*.test.ts'],
    },
});
