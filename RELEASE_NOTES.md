## 中文

### 关于 `obsidianmd/prefer-create-el`：实际检测的是 `createEl('div' / 'span')`

上一版我把这条归为「规则误报」，那是错的，这里更正。对比报告条目与源码后可以确认：规则命中的位置全部是 `createEl('div', …)` 与 `createEl('span', …)`——它要的是标签专用简写 `createDiv()` / `createSpan()`，而报告文案（“Uses `document.createElement` instead of Obsidian's `createEl` helpers”）与规则 id 并不描述它实际检查的内容。

依据：

- 按文件统计 `createEl('div'|'span')` 站点数，与报告条目数逐一对上：`browseView.ts` 15/15、`cardPreview.ts` 7/7、`imagePanel.ts` 7/7、`clozePanel.ts` 1/1、`confirm.ts` 1/1；`qaPanel.ts` 一处都没有，报告也是 0 条
- 其余标签全都没被报：`createEl('select' / 'button' / 'input' / 'h2' / 'img' / 'tr' / 'th' / 'td' / 'p' / 'hr' / 'label' / 'option' / 'textarea')` 一条命中都没有
- 1.0.3 里消失的 `src/importer.ts:37`，是因为那行改成了 `createEl('input')`——`input` 不在目标标签里，与是否 `createElement` 无关

### 本版改动

把 82 处 `createEl('div', opts)` / `createEl('span', opts)` 换成 `createDiv(opts)` / `createSpan(opts)`：

| 文件 | 处数 |
|---|---|
| `src/statsView.ts` | 26 |
| `src/browseView.ts` | 15 |
| `src/reviewView.ts` | 13 |
| `main.ts` | 12 |
| `src/cardPreview.ts` | 7 |
| `src/imagePanel.ts` | 7 |
| `src/clozePanel.ts` | 1 |
| `src/confirm.ts` | 1 |

两者在 Obsidian API 中就是同一件事的简写（`createDiv(o?, cb?): HTMLDivElement`、`createSpan(o?, cb?): HTMLSpanElement` 与 `createEl('div' | 'span', o?, cb?)` 等价），参数对象原样传入，返回值只是类型收窄。全部为单行机械替换，共 82 行增、82 行删，无逻辑改动；`tsc --noEmit` 与构建通过。

其余标签保持不变，源码与产物中 `createElement` 计数仍为 0。

### 测试提醒

- 无行为变化；仍建议快速过一遍浏览视图（表格、筛选 chips、分页）、统计页（评级条、状态条、热力图）、卡片预览与图片遮罩层，确认布局与之前一致

## English

### About `obsidianmd/prefer-create-el`: it actually checks `createEl('div' / 'span')`

The previous release called this rule a false positive; that was wrong and is corrected here. Matching the reported entries against the source shows that every hit is a `createEl('div', …)` or `createEl('span', …)` call — the rule wants the tag-specific shorthands `createDiv()` / `createSpan()`, while the report text (“Uses `document.createElement` instead of Obsidian's `createEl` helpers”) and the rule id do not describe what it checks.

Evidence:

- Counting `createEl('div'|'span')` sites per file reproduces the report exactly: `browseView.ts` 15/15, `cardPreview.ts` 7/7, `imagePanel.ts` 7/7, `clozePanel.ts` 1/1, `confirm.ts` 1/1, and `qaPanel.ts` contains none of them and receives no entries at all
- No other tag is ever reported: `createEl('select' / 'button' / 'input' / 'h2' / 'img' / 'tr' / 'th' / 'td' / 'p' / 'hr' / 'label' / 'option' / 'textarea')` never appears in the report
- The `src/importer.ts:37` entry that vanished in 1.0.3 disappeared because that line became `createEl('input')` — `input` is not one of the targeted tags, so it had nothing to do with `createElement`

### Changes in this release

82 call sites switched from `createEl('div', opts)` / `createEl('span', opts)` to `createDiv(opts)` / `createSpan(opts)`:

| File | Sites |
|---|---|
| `src/statsView.ts` | 26 |
| `src/browseView.ts` | 15 |
| `src/reviewView.ts` | 13 |
| `main.ts` | 12 |
| `src/cardPreview.ts` | 7 |
| `src/imagePanel.ts` | 7 |
| `src/clozePanel.ts` | 1 |
| `src/confirm.ts` | 1 |

In the Obsidian API these are the same operation (`createDiv(o?, cb?): HTMLDivElement` and `createSpan(o?, cb?): HTMLSpanElement` are shorthands for `createEl('div' | 'span', o?, cb?)`): the options object is passed through unchanged and only the return type narrows. All changes are single-line mechanical replacements, 82 lines added and 82 removed, with no logic changes; `tsc --noEmit` and the build both pass.

Other tags are untouched, and `createElement` still occurs zero times in both the source tree and the bundle.

### Please test

- No behaviour changes; a quick pass over the browse view (table, filter chips, paging), the statistics view (rating and state bars, heatmap), card preview and the image mask overlay would confirm the layout is unchanged
