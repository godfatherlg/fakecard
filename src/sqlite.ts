import type { SqlJsStatic } from 'sql.js';
import initSqlJs from 'sql.js/dist/sql-wasm-browser.js';
import wasmBinary from 'sql.js/dist/sql-wasm.wasm';

let pending: Promise<SqlJsStatic> | null = null;

/**
 * Browser-only SQLite build with the WebAssembly binary bundled into main.js,
 * so the plugin stays a single file and never touches the filesystem.
 */
export function loadSqlJs(): Promise<SqlJsStatic> {
    if (pending !== null) return pending;
    const created = initSqlJs({ wasmBinary });
    pending = created;
    return created;
}
