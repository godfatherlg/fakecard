# 1.0.46

## 中文

### 大库不再一次性渲染

- 浏览页一次只建 300 行，底部「再显示」继续加载；屏外的行跳过布局和绘制
- 搜索输入合并为 100ms 一次，输入时不再每敲一个字重建整张表
- 批量操作后刷新会保持当前页数，只有改搜索词或牌组筛选才回到第一页
- 状态栏改用只算数字的计数，不再在每次评分后排一遍整条队列

### 新增

- **CSV 导出**：命令 `Export all cards (CSV)`，含正反面、挖空原文、牌组、标签、到期、间隔、复习次数、来源；以 `= + - @` 开头的内容会加前导 `'`，防止表格软件当公式执行
- **埋藏**：浏览页预览里 `Bury / Unbury`，批量栏也可埋藏所选；只隐藏到今天结束，不改 FSRS 排期；`is:due` 搜索会排除已埋藏的卡，Due 列显示「已埋藏」

### 修复

- **复习日志隔离**：坏掉的当天日志改名为 `.corrupt-*` 后会**真正新建**当天文件；之前会把新记录写回备份，当天文件反而丢失。隔离失败时不再覆盖原文件
- **评分保存失败**：恢复卡片并停留在当前卡，不会在没保存成功时翻页或写日志
- **撤销**：按卡片 id 定位，切换牌组或重新载入后也能正确回到那张卡；重新载入会清空旧撤销栈
- **窗口监听**：挖空/导图/图片面板和注释框在打开时记住所属窗口，关闭时从同一个 document 移除监听器
- **评审规范**：官方 `eslint-plugin-obsidianmd` 从 23 条问题降到 **0**（`activeDocument`、`instanceOf`、样式类化等）

### 工程

- 新增 `npm run lint`、`npm run check:i18n`、`npm test` 和 `npm run check`
- i18n 校验会拦住「代码里有、中文表里没有」的文案（这次就抓到一条）
- vitest 覆盖 cloze / outline / answerTime / childStreak / search，共 15 个用例
- GitHub Actions：push / PR 跑 build + lint + i18n + test

### 请测试

- 浏览页有几百张卡时输入搜索，是否仍流畅；「再显示」是否继续加载
- 批量暂停/埋藏后，是否停在原来的页数而不是跳回顶部
- 复习时评一张卡，状态栏数字是否立即变化
- 浏览页选一张卡 → `Bury`，`is:due` 是否不再包含它，Due 列是否显示「已埋藏」，明天是否自动回来
- 命令面板执行 `Export all cards (CSV)`，用 Excel 打开是否列对齐

## English

### Large libraries render in pages

- Browse builds 300 rows at a time with a "show more" button; off-screen rows skip layout and paint
- Search input is coalesced to one pass per 100ms instead of rebuilding the table per keystroke
- Bulk actions keep the current page; only changing the query or deck filter resets to the first page
- The status bar uses a count-only path instead of rebuilding the queue after every rating

### New

- **CSV export** (`Export all cards (CSV)`): front/back, raw cloze text, deck, tags, due, interval, reviews, source. Cells starting with `= + - @` get a leading `'` so spreadsheets do not run them as formulas
- **Bury**: `Bury / Unbury` in the browse preview and the bulk bar. It hides a card until the end of the day without touching FSRS; `is:due` excludes buried cards and the Due column says "Buried"

### Fixed

- **Review log quarantine**: after a corrupt day file is renamed to `.corrupt-*`, a new day file is really created. Before, the new entry was written back into the renamed backup and the day file was lost. If the file cannot be moved, it is left untouched
- **Failed rating save**: the card is restored and the view stays on it, instead of advancing and logging a review the disk never received
- **Undo**: finds the card by id, so a deck switch or reload still returns to the right card; reload clears the old stack
- **Window listeners**: the cloze/map/image panels and the note field capture their document and remove listeners from the same one
- **Review lint**: the official `eslint-plugin-obsidianmd` set goes from 23 findings to **0**

### Engineering

- `npm run lint`, `npm run check:i18n`, `npm test` and `npm run check`
- The i18n check fails when a `tt('...')` key is missing from the Chinese table (it caught one)
- 15 vitest cases across cloze / outline / answerTime / childStreak / search
- GitHub Actions runs build + lint + i18n + test on push and pull requests

### Please test

- Type in a large browse library: does it stay smooth, and does "show more" keep loading
- Bulk pause/bury: does the page stay where it was instead of jumping to the top
- Rate a card: do the status-bar numbers change immediately
- Bury a card: is it gone from `is:due`, does the Due column say "Buried", and does it return tomorrow
- Run `Export all cards (CSV)` and open it in a spreadsheet
