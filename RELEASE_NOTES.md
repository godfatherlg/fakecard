# 1.0.42

## 中文

### 导图里所有组的挖空都会显示

以前导图只挖当前组，其他组直接露出答案；cloze 卡则是全部挖空，只有所问组是蓝色。

- 编辑面板：所有组都显示挖空，当前组蓝色、其他组灰色
- 复习界面：与 cloze 一样由「正面挖空所有分组」控制；开启（默认）时全部挖空、所问组蓝色、其余灰色，关闭时只挖所问组
- 「显示答案」仍然整段还原，当前组标绿

### 切换分组会居中到该组

- 用该组真正提问的节点（`findQuestionNode`）定位，不再依赖"渲染时遇到的第一个挖空"
- 选 c1 / c2 / c3 分别居中到各自的第一处挖空

### 地图滚轮到边界后交给面板

- 内容已经到底（或到顶）时，滚轮不再被地图吞掉，而是滚动外层，可以滚到牌组、标签和保存按钮
- 内容还没看完时仍然平移地图；`Ctrl/Cmd + 滚轮` 仍然缩放

### 请测试

- 一张图里 c1、c2 各挖一个空：复习时两组是否都是挖空，且颜色不同
- 关掉「正面挖空所有分组」：是否只挖所问组，其他组显示答案
- 编辑面板切换 c1 / c2 / c3：蓝色和居中是否都跟着换
- 在地图上向下滚到底：继续滚是否能滚到面板下方；向上滚到顶是否能滚回上方

## English

### Every group's masks show in a map

A map used to mask only the asked group and show the others as answers; a cloze card masks them all and colours only the asked one.

- Editor: all groups are masked, the current one blue, the others neutral
- Review: follows "Mask all groups on the front" like cloze; on (the default) masks everything with the asked group in the accent, off masks only the asked group
- Show answer still unmasks everything and marks the current group green

### A group switch centres on that group

- The node the group actually asks (`findQuestionNode`) is the focus, not "the first mask the renderer meets"
- c1 / c2 / c3 each centre on their own first mask

### The wheel leaves the map at its edges

- When there is nothing more to reveal, the wheel scrolls the panel instead, so deck, tags and Save can be reached from the map
- While there is more map to see it still pans; `Ctrl/Cmd + wheel` still zooms

### Please test

- Mask one word in c1 and one in c2: in review, are both masked and differently coloured
- Turn "Mask all groups" off: is only the asked group masked, the others shown as answers
- Switch c1 / c2 / c3 in the editor: do the blue accent and the centre follow
- Scroll to the bottom of the map: does the wheel continue into the panel; back to the top the same
