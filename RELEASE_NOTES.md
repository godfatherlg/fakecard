# 1.0.27

## 中文

### 修复

- **JSON 导入不再丢掉思维导图卡和图片卡**：以前导入只认 `qa` / `cloze`，一张导图卡导出再导入会变成“问答卡”，遮罩、分组、图片全部丢失。现在按 `type` 还原四种类型（导图会重新按组切卡，图片按组还原）
- **导图卡的建议用时不再按整份大纲计算**：改为“这张卡所问的那个节点（或那组挖空）的字数 + 少量上下文”。一份 40 行的图不再显示三分钟的预算，实测从 22 秒降到 11 秒
- **编辑导图时牌组与标签同步到整张图**：之前只改当前这张卡，同组其它卡仍用旧值

### 清理

- 样式表去掉累计的重复定义：**重复选择器 11 组 → 0**，文件从 2223 行降到 1748 行（−475 行）。同时删除了已经没有对应元素的旧样式（`.fakecard-map-outline-view`、`.fakecard-map-source*`、旧的面板网格布局等）
- 删除死代码：`wrapSelectedWords()`（已无调用）

### 暂缓（需要单独一轮）

两处结构性重构我没有动，原因是它们会同时改到三个面板和地图渲染器，出错是“静默”的，无法靠构建发现：

1. **三个新建面板的“两阶段”逻辑抽成公共组件**（QA/填空/导图各写了一遍，约 40 行 × 3）
2. **地图渲染缓存**（目前每次遮罩都整图重绘并逐段跑 `MarkdownRenderer`，上百节点会卡；做缓存要处理克隆后链接点击失效的问题）

这两项要做的话，我建议一轮只做一项，并在做完后各发一版便于回退。

### 请测试

- 导出卡片 → 清空（或另建库）→ 导入：思维导图卡与图片卡是否保持原类型、遮罩与分组是否完整
- 复习导图卡：建议用时是否与实际要回忆的内容相称（不再按整份大纲）
- 编辑一张多组的导图卡，改牌组/标签后检查同组其它卡是否一起变
- 界面外观是否与上一版一致（这轮只删重复样式，不应有视觉变化）

## English

### Fixed

- **JSON import keeps mind map and occlusion cards**: import used to accept only `qa` / `cloze`, so an exported map card came back as a Q&A card with its masks, groups and picture gone. It now restores all four types by `type` (a map is cut into one card per group again, an image restores its groups)
- **A map card's suggested time is measured from what it asks**, not from the whole outline: the asked node (or that group's holes) plus a little context. A 40-line map no longer shows a three-minute budget; measured 22s → 11s
- **Deck and tags follow the whole map** when editing: they used to be written to the current card only, leaving the other groups of the same map on the old values

### Cleanup

- The stylesheet's accumulated duplicates are gone: **11 duplicated selectors → 0**, 2223 → 1748 lines (−475). Dead rules for elements that no longer exist are removed too (`.fakecard-map-outline-view`, `.fakecard-map-source*`, the old grid layout)
- Dead code removed: `wrapSelectedWords()` (no callers)

### Deferred (each needs its own round)

Two structural refactors are untouched, because they touch all three panels and the map renderer, where a mistake fails silently instead of breaking the build:

1. **Extract the two-stage panel logic** shared by the Q&A, cloze and map panels (~40 lines × 3)
2. **Cache map node rendering** (every mask toggle rebuilds the map and re-runs `MarkdownRenderer` per text span; a cache has to deal with cloned links losing their handlers)

I'd do them one per release, so either can be reverted on its own.

### Please test

- Export cards, then import them into an empty library: do map and occlusion cards keep their type, masks and groups
- Review a map card: is the suggested time in proportion to what it asks
- Edit a map card with several groups, change deck/tags, and check the sibling cards changed too
- Does the UI look the same as the previous version (only duplicate rules were removed)
