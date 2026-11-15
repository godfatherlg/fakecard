/** esbuild's binary loader inlines the file and exports it as a Uint8Array. */
declare module '*.wasm' {
    const data: Uint8Array;
    export default data;
}

/**
 * The single-file browser build of sql.js has no declaration of its own;
 * borrow the types shipped by @types/sql.js.
 */
declare module 'sql.js/dist/sql-wasm-browser.js' {
    import type { SqlJsConfig, SqlJsStatic } from 'sql.js';
    export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}
