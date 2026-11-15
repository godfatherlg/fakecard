## 中文

### 修复第二轮审核反馈

这一版没有功能变化，只做类型与写法上的清理：

- **`sql.js` 深层导入补上模块声明**：删掉 `@ts-ignore` 和 `any`，`initSqlJs()` 现在有完整签名，`wasmBinary` 也按官方类型传入
- **`Object.entries()` 显式标注元组类型**：`src/ankiImport.ts` 里读取 notetypes 与 media 映射不再产生 `any`
- **日期补零不再调用 `String(...)`**：`reviews.ts`、`statsView.ts` 改用模板字符串
- **统计视图不再依赖 `flatMap`**：`last30Keys` 用显式循环归并，并标注 `ReviewLog[]`，避免在 `lib: ES7` 下被解析为 `any[]`
- **枚举比较改为纯数字比较**：`reviewView.ts` 先取 `const hardGrade: number = Rating.Hard`，既不需要断言，也不跨枚举比较
- **`activeDocument.createElement('input')` → `createEl('input')`**：`src/importer.ts` 里唯一真实存在的原生建元素调用

### 关于 `prefer-create-el` 报错

报告里列出的 89 个行号位置，实际内容都是 `createEl` / `createDiv` / `createSpan` 调用。源码中 `.createEl(` 共 181 处、`createElement` 仅 1 处（本版已改），线上 `main.js` 中 `createElement` 出现次数为 0。这条规则疑似误报，欢迎复核。

### 测试提醒

- 无行为变化；仍建议导入一个 `.apkg` 牌组，确认基本、填空、图片遮挡三类笔记与媒体正常

## English

### Second round of review feedback

No behaviour changes in this release, only type and code clean-up:

- **Proper module declaration for the deep `sql.js` import**: the `@ts-ignore` and the `any` are gone, `initSqlJs()` is fully typed and `wasmBinary` is passed with the official type
- **Explicit tuple types for `Object.entries()`**: reading the notetypes and media maps in `src/ankiImport.ts` no longer produces `any`
- **Date padding no longer calls `String(...)`**: `reviews.ts` and `statsView.ts` use template strings instead
- **Statistics no longer relies on `flatMap`**: `last30Keys` is merged with an explicit loop typed as `ReviewLog[]`, so it cannot degrade to `any[]` under `lib: ES7`
- **Enum comparison replaced by a plain number comparison**: `reviewView.ts` takes `const hardGrade: number = Rating.Hard` first, which needs neither an assertion nor a cross-enum comparison
- **`activeDocument.createElement('input')` → `createEl('input')`**: the only real raw element creation left in `src/importer.ts`

### About the `prefer-create-el` finding

Every line listed in that report is a `createEl` / `createDiv` / `createSpan` call. The source has 181 `.createEl(` call sites and exactly one `createElement` (fixed in this release), and the shipped `main.js` contains zero occurrences of `createElement`. This looks like a false positive and is worth a second look.

### Please test

- No behaviour changes; importing one `.apkg` deck to confirm basic, cloze and image-occlusion notes and their media still come through would be great
