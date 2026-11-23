# 1.0.49

## 中文

这是一次**内部结构整理**版本，界面和操作没有变化，主要是把过大的复习视图拆开，并把关键路径用测试锁住。

### 代码拆分

- 新增 `src/reviewClock.ts`：计时格式、回忆预算、超时扣分计算
- 新增 `src/reviewUndo.ts`：`UndoEntry` 与撤销栈
- 新增 `src/reviewRender.ts`：问答/挖空 Markdown、导图画布、图片挖空与图片缩放写回
- `reviewView.ts` 从约 1622 行降到 1486 行，只保留会话、队列、评分和交互逻辑
- 行为不变：Ctrl+Z、计时胶囊、四种卡型渲染和图片缩放都按原逻辑工作

### 测试

- 新增 `tests/obsidian-stub.ts` 和 `vitest.config.ts`，让依赖 Obsidian API 的模块能在 Node 里测试
- 新增覆盖：
  - 坏日志文件隔离后真正重建当天文件（`append` / `appendMany`）
  - 复习日志缓存命中、追加/删除同步、`invalidate`
  - 队列计数：due / learning / new、每日上限、backlog、埋藏/暂停/毕业排除
  - CSV 逗号、引号、换行转义和公式注入防护
- 测试总数 **36**，CI 会跑 build + lint + i18n + test

### 请测试

- 正常复习一轮：问答、挖空、导图、图片各一张
- 评分后 Ctrl+Z 是否能撤销
- 图片 Ctrl+滚轮缩放后，重新打开是否保持大小
- 导图分组切换、遮罩注释是否仍正常

## English

This is an **internal refactor** release: no visible change. The oversized review view was split up, and the critical paths are now covered by tests.

### Code split

- `src/reviewClock.ts`: clock formatting, recall budget, overtime points
- `src/reviewUndo.ts`: `UndoEntry` and the undo stack
- `src/reviewRender.ts`: Q&A/cloze Markdown, the map canvas, occlusion figures and the debounced zoom write
- `reviewView.ts` drops from about 1622 to 1486 lines and keeps only session, queue, rating and interaction logic
- Behaviour is unchanged: Ctrl+Z, the clock pills, all four card types and image zoom use the same code paths

### Tests

- `tests/obsidian-stub.ts` plus `vitest.config.ts` let modules that touch the Obsidian API run in Node
- New coverage:
  - a corrupt day file is moved aside and the real file recreated for `append` / `appendMany`
  - review cache hits, append/remove updates and `invalidate`
  - queue counts: due / learning / new, daily limit, backlog, buried/suspended/graduated excluded
  - CSV commas, quotes, newlines and formula injection
- **36 tests**, CI runs build + lint + i18n + test

### Please test

- A normal review pass with one Q&A, one cloze, one map and one image card
- Rate and then press Ctrl+Z
- Ctrl+wheel zoom on a picture, then reopen the card
- Map group switching and mask notes
