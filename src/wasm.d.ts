/** esbuild's binary loader inlines the file and exports it as a Uint8Array. */
declare module '*.wasm' {
    const data: Uint8Array;
    export default data;
}
