# 1.0.12

## 中文

### 新功能：今日队列显示在状态栏

右下角状态栏多了三个数：**到期 / 新卡 / 学习中**，配色照 Anki 的牌组行（到期绿、新卡蓝、学习中橙），为 0 的那项变灰不抢眼。

- 点一下直接打开复习界面
- 跟随复习窗格的牌组筛选：窗格里选了某个牌组，状态栏就只算那个牌组
- 每次评分、改设置、卡片文件变动都会刷新（300ms 防抖）

三项互不重叠，`到期 + 新卡 + 学习中` 正好等于今天队列总数，和窗格里的 `x / 17` 对得上——因为两边现在是同一段「构建队列」的代码，不存在两套算法各算各的。

### 优化：复习界面的张数更醒目

`1 / 17` 原来是条灰色小字，现在是胶囊：当前张数大号加粗深色，总数小而浅跟在后面，悬停显示「第 1 / 17 张」。

### 新功能：卡片文字可以选中、复制

复习时题目和答案都能拖选、双击选词、`Ctrl+C` 或右键复制——想抄一个术语出来不用再手动打一遍。

卡片依然**不可编辑**：正文是 Markdown 渲染出来的展示内容，没有输入框也没有光标；要改还是点铅笔进编辑面板。

（为什么要专门做这一步：Obsidian 核心样式在 `body` 上关掉了选中，只对自己认识的阅读视图、编辑器、弹窗单独打开，自定义视图得自己把选中权要回来。）

### 请测试

- 状态栏三个数与复习界面 `x / 17` 是否一致，评一张卡后状态栏数字是否跟上
- 点状态栏能打开复习界面；切到某个牌组的筛选后，状态栏是否也只算那个牌组
- 复习时能否选中并复制题目、答案；确认卡片文字改不了
- 重启 Obsidian，确认「更新说明」弹窗出现一次且内容完整

## English

### New: today's queue in the status bar

The status bar now carries three numbers: **due / new / learning**, colour-coded like an Anki deck row (due green, new blue, learning orange), with zeros dimmed so they do not shout.

- Click it to open the review view
- It follows the review pane's deck filter: filter to one deck there and the bar counts only that deck
- Every rating, settings change and card-file change refreshes it (300 ms debounce)

The three numbers never overlap - `due + new + learning` is exactly the size of today's queue and matches the `x / 17` in the pane, because both now come from the same queue builder instead of two separate counts.

### Improved: the card counter is easier to read

`1 / 17` used to be a line of grey text. It is a pill now: the card you are on is large and dark, the total sits small behind it, and the tooltip spells out "Card 1 of 17".

### New: card text can be selected and copied

Questions and answers can be dragged over, double-clicked word by word, and copied with `Ctrl+C` or the right-click menu - no more retyping a term out of an answer.

The card remains **read-only**: its text is rendered Markdown, with no input field and no caret. To change it, use the pencil and the edit panel.

(Why this needed doing at all: Obsidian's core stylesheet turns selection off on `body` and re-enables it only for the panes it knows about - reading view, editors, popups - so a custom view has to ask for it.)

### Please test

- Do the three numbers in the status bar match `x / 17`, and do they follow a rating?
- Does clicking the status bar open the review view, and does the bar scope itself to a deck filter?
- Can you select and copy a question and an answer during review, and confirm the text still cannot be edited?
- Restart Obsidian and confirm the "what is new" dialog appears once with the full list
