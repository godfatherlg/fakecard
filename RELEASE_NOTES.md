# 1.0.52

## 中文

### 埋藏不再“消失”

- 复习页工具栏新增「N 张已埋藏」；完成页会写「N 张卡埋藏到明天」，点「刷新」时也会说明是埋藏而不是没卡
- 统计页新增「不在队列里的卡 / N 已埋藏」，和「全部卡片」对得上
- 修复：埋藏新卡后，它仍会出现在今天的新卡队列里；现在会真正隐藏到明天

### 大导图重绘更快

- 在大纲里改一处，只重绘改动的那部分，其余节点原地保留，不再整张重建
- 复用节点的点击选中、双击编辑、挖空提示始终作用在当前内容上；节点尺寸在两次重绘之间缓存
- 修复：长时间编辑导图时，事件监听不再逐帧叠加（以前越用越重）

### 请测试

- 埋一张新卡：复习页应少一张并显示「1 张已埋藏」；两张都埋后完成页写「2 张卡埋藏到明天」；统计页显示同样数量；取消埋藏后卡片回到队列
- 打开几十个节点的大导图，在大纲里改字：只有被改的节点重画，其余不闪；点其它节点仍能选中、双击仍能编辑、挖空提示仍写对行
- 反复显示/收起答案、连续编辑大纲一段时间：体感应稳定，控制台无报错

## English

### Buried cards stay visible

- The review bar shows "N buried"; the finish page says "N card(s) are buried until tomorrow", and Refresh says the same instead of "nothing due"
- Stats gains "Hidden from the queue / N buried", so "All cards" reconciles with the queue
- Fix: burying a new card used to leave it in today's new-card queue; it is now hidden until tomorrow

### Faster repaints on large maps

- Editing a word in the outline redraws only that part; untouched nodes are reused in place instead of rebuilding the whole map
- Reused nodes keep click selection, double-click editing and cloze hints on the current content; node sizes are cached between repaints
- Fix: event listeners on the map host no longer stack up in long editing sessions

### Please test

- Bury a new card: the review pane loses it and shows "1 buried"; bury both and the finish page reads "2 card(s) are buried until tomorrow"; Stats shows the same number; unburying returns them
- Open a map with dozens of nodes and edit a word in the outline: only the edited node redraws; selecting other nodes, double-click editing and cloze hints still work
- Toggle answers and edit the outline over a long session: performance stays steady, no console errors
