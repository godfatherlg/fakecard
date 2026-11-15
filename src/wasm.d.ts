/**
 * esbuild's binary loader inlines the file and exports the bytes as a
 * Uint8Array, which is a valid WebAssembly `BufferSource`. Declaring it as an
 * ArrayBuffer keeps the sql.js config typed without a cast; sql.js accepts both
 * forms at runtime.
 */
declare module '*.wasm' {
    const data: ArrayBuffer;
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
