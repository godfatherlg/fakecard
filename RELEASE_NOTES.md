## 中文

### 修复第三轮审核反馈

这一版没有功能变化。上一轮给 `Object.entries()`、`padStart()` 补显式类型没有生效，原因是审核器的类型检查把 ES2017 的 API 解析为 `any`（其 lib 只到 ES2016，与仓库原先的 `["DOM", "ES5", "ES6", "ES7"]` 一致）。因此这一版直接绕开这些 API，而不是继续补类型：

- **`Object.entries()` → `Object.keys()` 循环**（`src/ankiImport.ts` 两处）：遍历 notetypes 与 media 映射时由 `Record` 直接给出值的类型，不再产生 `[string, any][]`
- **日期补零改为手写拼接**（`src/reviews.ts`、`src/statsView.ts`）：`` `${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}` ``，不再调用 `String.prototype.padStart`
- **去掉多余的类型断言**（`src/sqlite.ts`）：`*.wasm` 模块声明为 `ArrayBuffer`，直接 `initSqlJs({ wasmBinary })`；esbuild 内联的实际值是 Uint8Array，它本身是合法的 WebAssembly `BufferSource`，两条路径都实测可初始化
- **`tsconfig.json` 的 `lib` 改为显式 `["DOM", "ES2020"]`**：不再依赖 `@types` 里 `/// <reference lib>` 的隐式引入

以上对应本轮报告里 10 条 `no-unsafe-*` 与 1 条「断言多余」，全部有明确处理点。

### 关于 `prefer-create-el`

1.0.2 报告里唯一真实命中 `src/importer.ts:37`（`activeDocument.createElement('input')`）已在 1.0.3 修掉，该条目在 1.0.3 的报告中随之消失。剩余行号位置的内容均为 `createEl` / `createDiv` 调用，且同一文件内同类调用有的报、有的不报（例如 `src/clozePanel.ts` 有 14 处 `createEl` 只报了 1 处，`src/qaPanel.ts` 10 处一处未报）。源码与产物中 `createElement` 计数均为 0。

### 测试提醒

- 无行为变化，纯类型与写法清理；仍建议导入一个 `.apkg` 牌组，并打开一次统计页确认 30 天窗口与热力图正常

## English

### Third round of review feedback

No behaviour changes in this release. Explicit types on `Object.entries()` and `padStart()` did not help last time because the review checker resolves ES2017 APIs to `any` (its lib stops at ES2016, matching the repo's previous `["DOM", "ES5", "ES6", "ES7"]`). This release removes the APIs instead of typing them:

- **`Object.entries()` → `Object.keys()` loops** (`src/ankiImport.ts`, two sites): iterating the notetypes and media maps now takes its value types from the `Record`, so it never produces `[string, any][]`
- **Date padding written out by hand** (`src/reviews.ts`, `src/statsView.ts`): `` `${y}-${m < 10 ? '0' : ''}${m}-${d < 10 ? '0' : ''}${d}` ``, with no `String.prototype.padStart` call
- **Redundant type assertion removed** (`src/sqlite.ts`): the `*.wasm` module is declared as `ArrayBuffer` and `initSqlJs({ wasmBinary })` is called directly. esbuild inlines the bytes as a Uint8Array, which is a valid WebAssembly `BufferSource`; both forms were verified to initialise
- **`tsconfig.json` now declares `lib` as `["DOM", "ES2020"]`** instead of relying on implicit `/// <reference lib>` directives pulled in by `@types`

Together these cover every one of the ten `no-unsafe-*` warnings and the single "unnecessary assertion" warning in this round's report.

### About `prefer-create-el`

The only real hit in the 1.0.2 report was `src/importer.ts:37` (`activeDocument.createElement('input')`), which was fixed in 1.0.3 — and that entry is gone from the 1.0.3 report. Every remaining listed line is a `createEl` / `createDiv` call, and within the same file some identical calls are reported while others are not (for example `src/clozePanel.ts` has 14 `createEl` calls and only one is listed, while the 10 in `src/qaPanel.ts` are not listed at all). Both the source tree and the shipped `main.js` contain zero occurrences of `createElement`.

### Please test

- No behaviour changes, only type and code clean-up; importing one `.apkg` deck and opening the statistics view once (30-day window and heatmap) would still be welcome
