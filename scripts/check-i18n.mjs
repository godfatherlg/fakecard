import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

/**
 * Every `tt('...')` / `ttf('...')` in the source must exist in UI_ZH.
 *
 * `tt` falls back to the English key, so a missing translation is invisible in
 * review and shows up as English in the middle of a Chinese UI. This check
 * turns that into a build failure instead.
 */
const root = fileURLToPath(new URL('..', import.meta.url));
const i18nPath = join(root, 'src', 'i18n.ts');
const source = ts.createSourceFile(
    i18nPath,
    readFileSync(i18nPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
);

const translated = new Set();
source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'UI_ZH') continue;
        if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) continue;
        for (const property of declaration.initializer.properties) {
            if (!ts.isPropertyAssignment(property)) continue;
            const name = property.name;
            if (ts.isIdentifier(name)) translated.add(name.text);
            else if (ts.isStringLiteral(name)) translated.add(name.text);
        }
    }
});

const files = [
    join(root, 'main.ts'),
    ...readdirSync(join(root, 'src'))
        .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
        .map((name) => join(root, 'src', name)),
];

const used = new Map();
for (const file of files) {
    const parsed = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
    const visit = (node) => {
        if (ts.isCallExpression(node)
            && ts.isIdentifier(node.expression)
            && (node.expression.text === 'tt' || node.expression.text === 'ttf')
            && node.arguments.length > 0
            && ts.isStringLiteral(node.arguments[0])) {
            const key = node.arguments[0].text;
            const at = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
            if (!used.has(key)) used.set(key, `${file}:${at.line + 1}`);
        }
        node.forEachChild(visit);
    };
    visit(parsed);
}

const missing = [...used].filter(([key]) => !translated.has(key));
if (missing.length > 0) {
    console.error('Missing UI_ZH entries (they would fall back to English):');
    for (const [key, at] of missing) console.error(`  ${key}\n    ${at}`);
    process.exit(1);
}

console.log(`i18n: ${used.size} UI strings, all translated.`);
