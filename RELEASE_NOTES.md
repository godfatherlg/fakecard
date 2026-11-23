# 1.0.50

## 中文

### 浏览页真正的虚拟列表

- 表格只渲染视口内及上下各 8 行，其余用上下占位行撑出真实滚动高度
- 行高按实际内容测量，正面换行、匹配提示都不会被截断
- 选中一行、勾选复选框后**保持当前滚动位置**；只有改搜索词、牌组或排序才回到顶部
- 表头固定在顶部，滚动时列名始终可见
- 从笔记角标跳转卡片时会自动滚到该行，即使它原本不在窗口里
- 移除了「再显示 300 张」按钮：现在直接滚动即可

### 编辑入口统一

- 浏览页和复习界面里，问答卡改为打开**问答面板**，填空卡打开**填空面板**，不再进入临时 md
- 导图、图片原本就走各自面板；现在四种卡型一致
- 导图面板新增保存回调，在复习界面编辑保存后会刷新当前卡
- 编辑时能直接看到挖空、注释、导图结构和图片遮罩，不再是 `{{c1::...}}` 原文

### 导图渲染缓存

- 导图重绘时按「源文件 + 原始 Markdown」缓存节点文本的渲染结果，只重新渲染改动的行
- 缓存上限 500 条，缓存命中会先清掉同步回退内容，避免文字重复

### 请测试

- 浏览页滚动几千张卡：行是否连续、表头是否固定、选中后位置是否保持
- 搜索或切换牌组：是否回到顶部；排序是否回到顶部
- 浏览页编辑问答/填空卡：是否打开面板，保存后列表和预览是否更新
- 复习界面点编辑：是否打开对应面板
- 导图连续修改多行：文字、粗体、挖空是否都正常，无重复

## English

### A real virtual list in Browse

- Only the rows around the viewport (plus 8 above and below) are in the DOM; spacer rows give the list its full height
- Row heights are measured from the content, so wrapped fronts and match hints are not clipped
- Selecting a row or ticking a checkbox keeps the current scroll position; only a query, deck or sort change returns to the top
- The header is sticky while the rows change underneath it
- Jumping from a note badge scrolls the target row into the window even when it was not rendered
- The "Show 300 more" button is gone: scrolling is enough

### One editor per card type

- Q&A cards open the Q&A panel and cloze cards the cloze panel from Browse and Review, no longer a temporary note
- Map and image cards already used their own panels; all four types now behave the same
- MapPanelModal gained an onSaved callback, so the review card refreshes after an edit
- Editing shows masks, notes, the map tree and occlusion masks directly instead of raw `{{c1::...}}`

### Map render cache

- Repaints cache rendered node text by source path and raw Markdown, so only edited lines go through the renderer
- The cache is bounded at 500 entries; a hit clears the synchronous fallback first so text cannot duplicate

### Please test

- Scroll a few thousand cards: continuous rows, sticky header, selection keeps the position
- Search or change deck: returns to the top; sorting also returns to the top
- Edit a Q&A/cloze card from Browse: panel opens; list and preview refresh after saving
- Press edit in Review: the matching panel opens
- Edit several map lines: text, bold and masks stay correct without duplication
