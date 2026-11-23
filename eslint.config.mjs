import { fileURLToPath } from 'node:url';
import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
    ...obsidianmd.configs.recommended,
    {
        files: ['**/*.ts'],
        languageOptions: {
            parserOptions: {
                project: ['./tsconfig.json'],
                tsconfigRootDir: fileURLToPath(new URL('.', import.meta.url)),
            },
        },
    },
    {
        ignores: ['node_modules/**', 'main.js', 'scripts/**', 'tests/**'],
    },
];
