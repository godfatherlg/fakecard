# 1.0.32

## 中文

### 撤回：触屏拖动与捏合缩放

1.0.31 给导图加了 `pointerdown` / `pointermove` 那一套触屏手势。这一版把它撤掉了，导图回到只认鼠标：

- 按住拖动 = 平移，`Ctrl` + 滚轮 = 缩放，双击 = 回中，和 1.0.30 完全一致
- 触摸板仍然可用：双指滑动产生的是滚轮事件，所以照样能平移和缩放
- 样式表里的 `touch-action: none` 一并删除，页面不再因此禁用触屏滚动

### 修复：社区审核报的两个问题

审核在 `src/mapView.ts` 报了两条，来源都是同一处：

- **Error**：Unsafe assignment to innerHTML（第 247 行）
- **Warning**：Do not write to DOM directly using innerHTML/outerHTML

原因是节点文本的渲染缓存：为了在遮罩切换时少解析一遍 Markdown，之前把 `MarkdownRenderer.render` 的结果存进 `span.innerHTML`，下次同一个词直接写回去。现在整块缓存已经删掉，节点文本每次重绘都交给 `MarkdownRenderer.render` 重新渲染——不再有任何 `innerHTML` / `outerHTML` 赋值。

代价是：遮罩切换、连线重算这类重绘会把可见节点的文本重新渲染一次，超大导图上会略慢。换来的是审核可以过，而且没有把外部 HTML 拼进 DOM 的路径。

### 请测试

- 鼠标：拖动平移、`Ctrl` + 滚轮缩放、双击回中是否正常
- 触摸板：双指滑动是否还能平移、`Ctrl` + 双指滑动是否还能缩放
- 遮罩切换（点击节点、按住 `Alt` 点选）：文字是否仍然正确显示、是否出现闪烁
- 导图节点宽度：短标签是否仍是窄框、长句是否在 420px 处折行

## English

### Reverted: touch panning and pinching

1.0.31 added a `pointerdown` / `pointermove` gesture layer to the mind map. This release takes it out again, so the map is back to being mouse-only:

- Drag to pan, `Ctrl`+wheel to zoom, double-click to re-centre - exactly as in 1.0.30
- A trackpad still works: two-finger scrolling arrives as wheel events, so it pans and zooms as before
- `touch-action: none` is gone from the stylesheet, so the page no longer blocks touch scrolling for the map

### Fixed: the two issues from the community review

The review reported two things in `src/mapView.ts`, both from the same place:

- **Error**: Unsafe assignment to innerHTML (line 247)
- **Warning**: Do not write to DOM directly using innerHTML/outerHTML

The cause was the node render cache: to avoid re-parsing the same Markdown on every mask toggle, the output of `MarkdownRenderer.render` was copied into `span.innerHTML` and written back for repeated text. That cache is now removed entirely - every repaint hands the node text to `MarkdownRenderer.render`, and no `innerHTML` / `outerHTML` assignment remains anywhere.

The cost: a repaint (mask toggle, edge re-layout) re-renders the visible labels, which is a little slower on a very large map. In exchange the plugin is clean under review and no external HTML is ever spliced into the DOM.

### Please test

- Mouse: drag to pan, `Ctrl`+wheel to zoom, double-click to re-centre
- Trackpad: does two-finger scrolling still pan, and `Ctrl`+two-finger still zoom
- Mask toggling (clicking a node, `Alt`-clicking): do labels still show correctly, is there any flicker
- Node widths: short labels still narrow, long sentences still wrap at 420px
