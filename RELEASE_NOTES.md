# 1.0.29

## 中文

### 只有代码规范改动，功能与 1.0.28 完全一致

社区评审提出的三条：

- **不再直接传 `new Component()`**：问答面板与地图渲染都改为先保存到变量，在重绘前和关闭时调用 `unload()`，嵌入笔记的监听器不会累积
- **跨窗口安全判断**：`instanceof Element` 改为 Obsidian 的 `instanceOf(Element)`，在弹出窗口里也能正确识别节点
- **SVG 用 Obsidian 的构造方法**：连线层与连线改用 `createSvg()`，不再直接调用 `document.createElementNS`

同类写法已全文排查：仓库里不再有 `document.createElement`、`instanceof Element`、直接传 `new Component()` 这三类写法。

### 请测试

- 打开问答卡的新建面板，在输入与「完成」之间来回切换若干次：渲染是否正常、关闭后是否有异常
- 复习一张地图卡：连线是否照常绘制（这轮改了 SVG 的创建方式）
- 在弹出窗口（把标签页拖出主窗口）里打开复习或浏览视图，地图节点是否仍可点击、遮罩定位是否正常

## English

### Code-style fixes only; behaviour is identical to 1.0.28

Three community-review items:

- **No `new Component()` passed inline**: the Q&A panel and the map renderer keep it in a field and call `unload()` before a repaint and on close, so embedded notes do not pile up listeners
- **Cross-window safe check**: `instanceof Element` became Obsidian's `instanceOf(Element)`, which also holds in a popped-out window
- **SVG through Obsidian's helper**: the link layer and its paths use `createSvg()` instead of `document.createElementNS`

The same patterns were swept across the repository: no `document.createElement`, no `instanceof Element`, no inline `new Component()`.

### Please test

- Open the Q&A panel, switch between input and "Done" a few times: does it render, and does closing stay clean
- Review a map card: are the connectors still drawn (their creation changed)
- Open review or browse in a popped-out window: are map nodes still clickable and the mask focus still correct
