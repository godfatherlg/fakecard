# 1.0.30

## 中文

### 内部重构：三个新建面板共用一套“两阶段”逻辑

问答、填空、导图面板之前各自写了一遍“隐藏编辑器 / 显示卡片 / 换按钮文字 / 触发对应回调”，三份代码会慢慢偏离。现在共用 `createStages()`（`src/panelStages.ts`），面板之间只剩两点不同：两半各装什么、卡片出现时要做什么。

对使用者的影响：**行为不变**。上面三个面板的「完成 / 编辑」按钮、切换效果、高度都与 1.0.29 一致。

### 性能：地图节点文本渲染加了缓存

之前每次重绘都会重建所有节点，并给每段可见文字跑一次 `MarkdownRenderer`。一张上百节点的图，点一次遮罩就要重新解析整张图。

现在按“源文件 + 文本”缓存渲染出的 HTML（上限 500 条，超出即整体清空）。同一个词再次出现时直接复用，不再解析。对使用者的影响：大图在挖空、改字、拖动后重绘更快；小图感觉不出差别。

### 请测试

- 三个新建面板：`完成` / `编辑` 是否与之前一致（尤其导图面板第一次打开是否居中、编辑后回到导图是否重新居中）
- 一张较大的导图（几十个节点）：连续点几个节点遮罩、双击改字，是否比之前流畅且位置不乱
- 一张图里同一个词出现在多个节点：是否都能正常显示（缓存复用）

## English

### Internal: the three new-card panels share one two-stage switch

The Q&A, cloze and map panels each had their own copy of "hide the editor, show the card, swap the button label, run the right callback", and three copies drift. They now share `createStages()` (`src/panelStages.ts`); a panel only says what its two halves contain and what must happen when the card appears.

For you: **behaviour is unchanged**. The "Done / Edit" button, the switch and the sizes are the same as 1.0.29.

### Performance: mind map node text is cached

Every repaint rebuilt every node and ran `MarkdownRenderer` once per visible piece of text, so toggling a mask on a hundred-node map re-parsed the whole map.

The rendered HTML is now cached by source path and text (bounded at 500 entries, cleared as a whole when full). The same word appearing again is reused instead of parsed. For you: large maps repaint faster after a mask, an edit or a pan; small maps feel the same.

### Please test

- The three panels: does "Done / Edit" behave as before (the map in particular: centred on first open, and centred again when returning from the outline)
- A large map: toggle a few masks and edit a node - does it feel faster, and does the view stay put
- The same word in several nodes: do they all render (the cache is shared)
