# 1.0.24

## 中文

### 第四种卡片：思维导图

把大纲粘进来，标题和列表项会变成节点，画成向右生长的导图：

- 层级来自标题级别或列表缩进（1/2/4 空格与 Tab 都能识别，自动判断单位）
- 列表项的续行并进同一节点
- 节点内容由 Obsidian 自己渲染：加粗、高亮、公式、表格、链接都和笔记一致
- 一组建一张卡，和填空卡一样进同一个队列、走 FSRS、参与统计与搜索

### 在导图上直接操作

- **拖动**平移，**Ctrl+滚轮**缩放，双击空白处回到挖空位置
- **双击节点**改字：先把该节点摆到正中并恢复到 100%，输入框随内容长高，回车保存、Esc 取消
- **划选文字** → 浮动按钮「遮罩选中」，选中的字变成 `[___]`
- 选中节点后点工具条「遮住整节点」：整块遮罩；子树里没有别的挖空时，整支一起隐藏（设置里可关）
- 选中已有 `[___]` → 按钮变成「移除挖空」

### 三个新建面板统一成“同区域两阶段”

```
输入（占满）  →  完成  →  渲染后的卡片（同一块区域、同一尺寸）
```

- 导图：大纲 → 导图
- 填空：源码 → 渲染后的卡片，**完成页里可以直接划选挖空**（跨行时每行一个洞，序号留在洞外）
- 问答：问题/答案 → 与之相同的版式（问题、分隔线、答案），字号跟随你的笔记设置
- 因为外框尺寸不变，点「完成」不再闪动

### 编辑与显示

- 浏览视图右栏的导图预览同样可拖动缩放
- `✎ 编辑导图` 打开分栏编辑器改整份大纲，关闭时同步增删对应的卡片
- 笔记里选中若干行 → 右键「用选中的笔记内容新建思维导图」
- 统计页右上角新增「新建卡片」
- 浏览视图：类型列显示「思维导图」，搜索能搜到大纲文本

### 其他

- 填空卡分组切换时，其他组的洞变暗，只突出当前组
- 图片遮挡卡的答题时间按遮罩面积估算（1.0.23 已发布，这里一并说明）

### 请测试

- 新建导图卡：粘贴多行大纲（含标题与列表）→ 是否成树、层级正确
- 双击节点改字、划选文字遮罩、点选整节点遮罩、移除挖空
- 复习该卡：是否居中到挖空、拖动/缩放、翻面后遮罩消失
- 填空卡完成页：划选挖空（含加粗/高亮、跨行）是否准确；其他组是否变暗
- 问答卡完成页：问题/答案版式与字号

## English

### A fourth card type: mind map

Paste an outline, and headings and list items become nodes of a right-growing map:

- Depth comes from heading level or list indentation (1/2/4 spaces and tabs are all detected, the unit is inferred)
- Wrapped lines of a list item join the same node
- Node text is rendered by Obsidian itself: bold, highlight, math, tables and links look like the note
- One card per hole group, in the same queue, FSRS, stats and search as everything else

### Working directly on the map

- **Drag** to pan, **Ctrl+wheel** to zoom, double-click empty space to return to the question
- **Double-click a node** to edit it: the node is centred at 100% first, the box grows with the text, Enter saves, Esc cancels
- **Select words** → the floating "Mask selection" button turns them into `[___]`
- With a node selected, "Mask whole node" hides it entirely; a subtree with no other holes is hidden with it (switchable in settings)
- Selecting an existing `[___]` turns the button into "Remove mask"

### The three new-card panels share one two-stage layout

```
input (fills the box)  →  Done  →  the rendered card (same box, same size)
```

- Mind map: outline → map
- Cloze: source → rendered card, and **words can be selected on that card to mask them** (across lines, one hole per line, list markers kept outside)
- Q&A: question/answer → the same shape as review (question, divider, answer), at your note font size
- The box keeps its size, so pressing "Done" no longer flickers

### Editing and display

- The browse preview pans and zooms the same way
- `✎ Edit mind map` opens the outline in a split editor and rewrites the matching cards on close
- Select lines in a note → right-click → "New mind map from the selection"
- A "New card" button on the statistics page
- Browse shows the type as "Mind map" and search covers the outline text

### Also

- Switching cloze groups dims the holes of the other groups
- Occlusion cards estimate their answer time from the masked area (shipped in 1.0.23, noted here)

### Please test

- Create a mind map from a pasted outline and check the tree and its levels
- Double-click editing, selection masking, whole-node masking, removing a mask
- Review the card: centring on the hole, panning, zooming, and the mask disappearing on reveal
- Cloze stage: wrapping by selection (bold/highlight, several lines) and dimming of other groups
- Q&A stage: layout and font size
