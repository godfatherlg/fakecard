# 1.0.38

## 中文

### 新增：防中庸提示（默认关）

很多人长期只按 Good / Hard，另两档几乎不用。打开后：

- 用时不到「作答预算」一半、且是成熟卡（间隔 ≥ 1 天）：评分按钮上方出现 `很快：0:12 / 0:45——给 Easy？`
- 用时超过作答预算 1.5 倍：出现 `停了很久：2:30 / 0:45——是哪种？`，旁边两个按钮 `没想起来`（Again）和 `想混了`（Hard）
- 提示是卡片与评分按钮之间的一行，不弹窗、不抢焦点、不拦快捷键；不点就什么都不变，日志里仍是你实际按下的评分
- 点「想混了」会在复习日志里记 `mixed: true`，供以后建子卡时参考
- 建子卡的提示框现在会显示这张卡的历史：`复习 12 次，其中记混 3 次（25%）`

### 新增：中断处理（三个开关，默认关）

1. **恢复顺序**：今天到期的卡里有两成以上「还能想起的概率低于 50%」时，队列改成先做还记得的，最弱的每天最多掺 20%，不再一回来就是最早到期的卡；工具栏出现「恢复模式」徽标
2. **超期封顶**：复习时这张卡已经超过自身稳定度的 5 倍（大约七成把握以下），这次 Good / Easy 的新间隔不超过上次的 1.5 倍、最多 60 天
3. **自适应每日量**：昨天 Good / Easy 的比例低于 70%，今天少放 20%；高于 90%，多放 10%；复习记录少于 10 条时不动

三个开关都只改变「今天给你看什么、看多少」，不改卡片历史，也不改你按下的评分。

### 请测试

- 打开防中庸，做一张间隔 ≥ 1 天的卡：很快评完是否出现「给 Easy？」，点它是否按 Easy 记分
- 停久一点再揭示：是否出现「没想起来 / 想混了」，点「想混了」后评分是否为 Hard
- 提示出现时直接按键盘 `3`：是否正常记 Good，提示消失
- 点提示右侧 `×`：这一张卡不再提示，下一张恢复
- 打开过期封顶，找一张超期很久的卡评 Good：间隔是否被限制在上次的 1.5 倍以内
- 打开恢复顺序，看工具栏是否出现「恢复模式」徽标、队列开头是否是比较熟的卡

## English

### New: anti-middle nudges (off by default)

Many people stay on Good and Hard forever. With this on:

- A mature card (interval ≥ 1 day) recalled in under half its answering budget shows `Quick: 0:12 / 0:45 - give Easy?`
- One that took more than 1.5x shows `Slow: 2:30 / 0:45 - what happened?` with `Could not recall` (Again) and `Mixed up` (Hard)
- The suggestion is one line between the card and the buttons: no modal, no focus stealing, no blocked shortcuts. Ignoring it changes nothing, and only the rating you press is logged
- `Mixed up` writes `mixed: true` to the review log, which the child-card prompt now reads: `12 reviews, 3 of them mixed up (25%)`

### New: after a break (three switches, off by default)

1. **Recovery order**: when at least 20% of today's due cards are below 50% retrievability, the queue starts with the cards still remembered and mixes the weakest in at most 20% per day; a "Recovery mode" badge appears in the toolbar
2. **Interval cap**: a card reviewed when already 5x past its stability (roughly below 70% recall) cannot get a new interval beyond 1.5x the previous one or 60 days, even on a Good/Easy
3. **Adaptive day size**: yesterday's Good/Easy share below 70% queues 20% fewer cards today; above 90%, 10% more; waits for at least 10 reviews

All three change what is queued today, never a card's history or the rating you pressed.

### Please test

- Turn the nudge on and review a mature card quickly: does `give Easy?` appear, and does clicking it log Easy
- Wait longer before revealing: do `Could not recall / Mixed up` appear, and does `Mixed up` log Hard
- With the line showing, press `3`: does it log Good normally and the line disappear
- Press the `×`: this card stops asking, the next one asks again
- Turn the interval cap on and rate an overdue card Good: is the interval kept within 1.5x of the previous one
- Turn recovery order on: does the badge appear, and does the queue open with familiar cards
