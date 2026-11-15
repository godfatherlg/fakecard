# 1.0.8

## 中文

### Anki 导入带上完整复习历史

以前导入 .apkg 只搬 FSRS 状态和复习次数，逐条的 Again / Hard / Good / Easy 没有进来，所以「建子卡」的失败连击一直显示 0 / 4。现在每一条评分都写进 fakecard 的按日日志：

- 统计页的热力图、评分分布、留存率和连续天数会把 Anki 的历史一起算进去
- 子卡提示里的失败分数来自真实历史，不再固定为 0
- 子卡判定往回看 365 天，几个月前的记录同样有效
- 写入按 `cardId + 时间` 去重，同一份 apkg 反复导入不会把记录翻倍
- 导入的卡如果库里已经有，会先问一次：使用 Anki 进度，还是保留当前进度

导出 apkg 时要勾选 Include scheduling information，否则文件里没有 revlog，也就没有历史可转。

### 复习界面

- **快捷键**：Again / Hard / Good / Easy 可以分别绑定按键，空格和数字（字母区或小键盘）都可以，清空输入框即取消
- **布局**：居中一栏（760px）或铺满窗格，宽屏和长答案用后者更舒服
- **撤销**：评分后可以撤销，对应的日志条目会一起删掉，不占当天的复习额度

### 子卡

反复失败的卡会在复习界面提示建子卡，弹窗里显示最近的失败分数（比如 3 / 4）。确认后按类型生成子卡，父卡自动暂停：

- 问答子卡、填空子卡、图片遮挡子卡
- Hard 连击阈值（2–10）和 Again 记分（0–3）在设置里可调

### 统计页热力图

- GitHub 风格的小方块，一列 7 天，横向滚动
- 按住拖动可以平移，两侧箭头每次翻一屏
- 从最早一条记录一直显示到今天，不再固定 90 天

### 配色

「显示答案」和 Again / Hard / Good / Easy 四个评分按钮改成淡底同色系文字，不再是大块饱和色，浅色和深色主题都适用。

### 请测试

- 导入一个带调度信息的 apkg，打开统计页，确认历史日期出现在热力图上
- 对一张卡连续评 Hard 或 Again，再点建子卡，弹窗分数不应是 0
- 改快捷键后按新键评分；清空输入框应恢复默认
- 切换布局后卡片宽度立即变化
- 评分后撤销，卡片回到上一张

## English

### Anki imports now carry the full review history

Importing an .apkg used to bring the FSRS state and the review count, but not the individual Again / Hard / Good / Easy ratings - which is why the child-card failing streak always read 0 / 4. Every rating is now written into the daily log:

- The heatmap, the rating breakdown, retention and the streak include the Anki history
- The failing score in the child-card prompt comes from real history instead of a fixed 0
- The child-card check looks back 365 days, so months-old ratings still count
- Entries are deduplicated on `cardId + time`, so importing the same deck twice cannot double the history
- A card that already exists asks once: use the Anki schedule or keep the current one

Tick Include scheduling information when exporting the apkg - without it there is no revlog in the file, and therefore no history to bring along.

### Review screen

- **Shortcuts**: Again / Hard / Good / Easy can each be bound to a key, on the number row or the numpad, Space included; clear the field to drop it
- **Layout**: a centred column (760px) or the full pane, the latter suits wide screens and long answers
- **Undo**: a rating can be undone, and its log entry is removed with it, so it no longer counts towards the daily limit

### Child cards

A card that keeps failing offers a child card right in review, with the recent failing score shown (3 / 4, for example). Confirming creates the child of that type and pauses the parent:

- Q&A, cloze and image-occlusion child cards
- The Hard streak threshold (2-10) and the Again score (0-3) are configurable

### Heatmap

- Small GitHub-style squares, seven rows, horizontal scrolling
- Drag to pan, and the arrows page one screen at a time
- Covers the whole history up to today instead of the last 90 days

### Colours

The answer button and the four rating buttons now use pale fills with matching text instead of full-strength colour blocks, in light and dark themes alike.

### Please test

- Import an apkg with scheduling information, open Statistics and confirm the old dates show up on the heatmap
- Rate a card Hard or Again a few times, then press the child-card action - the score should not be 0
- Change a shortcut, rate with the new key, then clear the field and check the default comes back
- Switch the layout and confirm the card width changes immediately
- Rate a card, undo it, and confirm the card returns to the previous one
