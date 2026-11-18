# 1.0.31

## 中文

### 新增：触控板 / 触摸屏可以用手指拖动和缩放导图

之前导图只认鼠标：拖动要靠鼠标按键，缩放要 `Ctrl` + 滚轮。现在：

- **单指（或触摸板单指按住）拖动** = 平移
- **双指捏合** = 缩放（以两指中点为中心）
- 鼠标行为完全不变：按住拖动平移、`Ctrl` + 滚轮缩放、双击回中
- 页面上加了 `touch-action: none`，手指在图上滑动不会带着整页滚动

### 内部：两处整理

- **居中逻辑合并**：`focusOn` 与 `centerOn` 原本各有一份坐标换算，现在只有 `centerOn(el, scale)` 一处，`fitScale()` 单独负责“整图放得下是多大”
- **测量方式更稳**：节点宽度改用 CSS 的 `width: max-content`（受 `max-width: 420px` 约束），不再需要在测量时把画布临时撑到 8000px。这样节点尺寸不再取决于容器的临时宽度，测量和布局的耦合少了一层

### 请测试

- 触摸屏或触摸板：单指拖动是否平移、双指捏合是否缩放、松手后是否停住
- 鼠标：拖动、`Ctrl`+滚轮、双击回中是否与之前一致
- 导图节点宽度：短标签是否仍是窄框、长句是否在 420px 处折行（不应出现整块变窄或文字竖排）
- 复习与浏览视图里的导图：居中位置是否正常

## English

### New: pan and zoom a mind map with a touch screen or trackpad

The map used to be mouse-only: drag with a button, zoom with `Ctrl`+wheel. Now:

- **One finger** (or a trackpad press-and-drag) pans
- **Two fingers pinching** zooms around their midpoint
- The mouse behaves exactly as before: drag to pan, `Ctrl`+wheel to zoom, double-click to re-centre
- `touch-action: none` keeps the page from scrolling while a finger drags the map

### Internal, two tidy-ups

- **Centring merged**: `focusOn` and `centerOn` each had their own coordinate math; now there is one `centerOn(el, scale)`, with `fitScale()` answering "how big does the whole map fit"
- **Steadier measurement**: node width now comes from CSS `width: max-content` (capped by `max-width: 420px`), so the canvas no longer has to be temporarily stretched to 8000px while measuring. A node's size no longer depends on a temporary container width

### Please test

- Touch screen or trackpad: does one finger pan, do two fingers pinch, does it stop when you let go
- Mouse: drag, `Ctrl`+wheel and double-click still behave as before
- Node widths: are short labels still narrow, and do long sentences wrap at 420px (nothing should become a narrow column of characters)
- Mind maps in review and in the browse preview: is the centring still right
