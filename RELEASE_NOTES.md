# 1.0.19

## 中文

### 图片卡：看得清，也放得大

- 卡片里的图片不再撑满整屏：居中布局最高 62vh、铺满布局 74vh、浏览预览 44vh，等比缩小、遮罩跟着走
- **点击图片**打开放大查看：Ctrl+滚轮缩放（50%–600%）、双击还原、`重置` 回到适配大小，放大后出现滚动条可平移；遮罩一并带上，蒙版卡不会因此泄露答案
- **Ctrl+滚轮**在复习界面里直接就地放大，图片可超出窗格宽度并出现横向滚动条，双击还原

### 蒙版编辑器

- **拖动**选框即可移动；选中后四边四角出现**8 个把手**，拖动改大小；`Ctrl`/`Cmd` 点击可多选，多选可一起移动
- 切换分组下拉会**自动选中该组所有框**，配合 `把选中的框移到 cN` 可以自由改归属
- 保存时丢弃没有框的分组，并重编号为 c1…cn，不留空号
- 按组核对卡片：还在的组保留原卡 id 与 FSRS 进度；新增组只新建自己那张卡（继承牌组、标签与 FSRS 状态，到期日拉到今天）；整组删空才删除对应的卡
- **修复**：编辑一张图片卡的蒙版时，同图其他组的卡会被误删。面板现在会载入这张图的全部组，保存不再牵连兄弟卡

### 计时提示

- 不再因为切到别的窗口而暂停：从卡片出现那一刻按墙钟时间计算
- 样式改为工具栏里的胶囊，跟在「2 / 10」之后；未超时灰色、**超过建议用时变橙色**
- **填空卡只按挖空文字计算预算**（原来按整段正文，动辄两三分钟才提示）
- **链接不再计入答案长度**：`pdf`、`视频`、块链接的文字标签都不算，问答卡预算随之回落到合理区间

### 复习完成页

- 点「刷新」后有回执：「已刷新 · 还有 N 张待复习」或「已刷新 · 今天已清空」，2.5 秒后淡出
- 队列为空（今天学完）时显示完成页与「今天多学一点 / 提前复习 / 刷新」，不再误显示「还没有卡片」

### 浏览视图

- **列可排序**：类型、牌组、复习次数、到期；新增「到期」列（`MM-DD`，悬停看完整时间），正面不参与排序
- **子卡显示父卡**：右栏出现「父卡」一行，点击跳到父卡（自动清空筛选并滚动到位）
- **Shift 连选**：勾第一行后按住 Shift 点另一行，中间整段一起勾选/取消
- **暂停 / 恢复**：右栏按钮作用于当前卡，勾选后顶部出现「暂停所选 / 恢复所选」；暂停只移出队列，不改任何排程

### 请测试

- 复习一张图片卡：Ctrl+滚轮就地放大、双击还原；点图片打开大图
- 编辑图片卡的蒙版：拖动、拖把手改大小、Ctrl 多选、切换分组自动全选、保存后回看同图其他组的卡是否还在
- 翻一张问答卡，看左上角计时器是否从 0 开始走、超时是否变橙
- 复习完点「刷新」，是否出现「已刷新 · …」的回执
- 浏览视图：点表头排序、勾两行按 Shift 连选、暂停后到 `is:paused` 里能找到

## English

### Image cards: readable, and zoomable

- A picture no longer takes over the pane: at most 62vh in the centred layout, 74vh wide, 44vh in the browse preview - scaled down proportionally, masks following
- **Click a picture** to open it large: Ctrl+wheel zooms (50%–600%), double-click fits again, `Reset` returns to fit; the frame scrolls when zoomed, and the masks come along so an occlusion card cannot leak its answer
- **Ctrl+wheel** zooms in place inside the card: the picture grows past the pane and the body gains a horizontal scrollbar; double-click restores it

### Mask editor

- **Drag** a box to move it; a selected box grows eight **handles** for resizing from any edge or corner; `Ctrl`/`Cmd`+click selects several and they move together
- Switching the group dropdown **selects every box of that group**, so `Move selected to cN` can reassign them freely
- Saving drops groups with no boxes and renumbers them c1…cn, with no gaps
- Cards are reconciled group by group: a surviving group keeps its card id and FSRS progress; a new group creates only its own card (inheriting deck, tags and FSRS state, due today); a group that lost every box takes its card with it
- **Fixed**: editing the masks of one image card deleted the cards of the picture's other groups. The panel now loads every group of the picture, so a save cannot touch its siblings

### Answer-time hint

- No longer pauses when you switch windows: it counts wall-clock time from when the card appeared
- It is a chip in the toolbar now, right after the `2 / 10` counter; grey within the budget, **orange once past it**
- **Cloze cards are measured by the hidden words only** (the whole body used to be measured, so the reminder arrived minutes later)
- **Links no longer count as answer text**: the `pdf`, video and block-link labels are stripped, which brings QA budgets back to a sane size

### Finish page

- Pressing `Refresh` now leaves a receipt: "Refreshed - 47 due cards are waiting" or "Refreshed - nothing else is due today", fading after 2.5 seconds
- An empty queue (everything rated) shows the finish page with "study more today / study ahead / refresh" instead of the misleading "No cards yet"

### Browse view

- **Sortable columns**: type, deck, reviews, due; a new `Due` column (`MM-DD`, full time on hover); the front is not sortable
- **A child card shows its parent**: a "Parent card" row in the preview jumps to the parent (clearing filters and scrolling it into view)
- **Shift range select**: tick one row, Shift+click another, and the stretch between them is ticked or unticked together
- **Pause / resume**: a button in the preview for the current card, and "Pause selected / Resume selected" once rows are ticked; pausing only removes cards from the queue and touches no schedule

### Please test

- In review, Ctrl+wheel on a picture to zoom in place and double-click to restore; click it to open the large view
- Edit an image card's masks: drag, resize by a handle, Ctrl+multi-select, switch groups to select them all, save, then check the picture's other groups are still there
- Open a QA card and watch the timer start at 0 and turn orange past the budget
- Finish a session and press `Refresh` - the receipt line should appear
- Browse: sort by a column header, tick a row and Shift+click another, pause a card and find it under `is:paused`
