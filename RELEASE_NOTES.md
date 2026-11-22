# 1.0.38

## 中文

### 新增：防中庸提示（默认关）

很多人长期只按 Good / Hard，另两档几乎不用。打开后：

- 用时不到「作答预算」一半、且是成熟卡（间隔 ≥ 1 天）：评分按钮上方出现 `很快：0:12 / 0:45`，右边两个按钮 `太容易（简单）` 和 `没思路（重来）`——快不一定是简单，也可能一片空白
- 用时超过作答预算 1.5 倍：出现 `很慢：2:30 / 0:45`，按钮 `卡思路（重来）` 和 `记混卡（困难）`
- 正常速度也常驻一个 `记混卡（困难）`：答案记混、按错误答案回答时用它，按困难记分并打上 `mixed` 标记，直接进下一张
- 括号里就是点击后会记的评分；提示是卡片与评分按钮之间的一行，不弹窗、不抢焦点、不拦快捷键；不点就什么都不变，日志里仍是你实际按下的评分
- 建子卡的提示框现在会显示这张卡的历史：`复习 12 次，其中记混 3 次（25%）`

### 新增：中断处理（三个开关，默认关）

1. **恢复顺序**：今天到期的卡里有两成以上「还能想起的概率低于 50%」时，队列改成先做还记得的，最弱的每天最多掺 20%，不再一回来就是最早到期的卡；工具栏出现「恢复模式」徽标
2. **超期封顶**：复习时这张卡已经超过自身稳定度的 5 倍（大约七成把握以下），这次 Good / Easy 的新间隔不超过上次的 1.5 倍、最多 60 天
3. **自适应每日量**：昨天 Good / Easy 的比例低于 70%，今天少放 20%；高于 90%，多放 10%；复习记录少于 10 条时不动

三个开关都只改变「今天给你看什么、看多少」，不改卡片历史，也不改你按下的评分。

### 请测试

- 很快揭示：是否出现「太容易（简单）/ 没思路（重来）」，分别点是否记 Easy / Again
- 停久再揭示：是否出现「卡思路（重来）/ 记混卡（困难）」，点后者是否记 Hard 并直接翻页
- 正常速度：是否常驻一个「记混卡（困难）」
- 提示出现时直接按键盘 `3`：是否正常记 Good，提示随翻页消失
- 点提示右侧 `×`：这一张卡不再提示，下一张恢复
- 打开过期封顶，找一张超期很久的卡评 Good：间隔是否被限制在上次的 1.5 倍以内
- 打开恢复顺序，看工具栏是否出现「恢复模式」徽标、队列开头是否是比较熟的卡

## English

### New: anti-middle nudges (off by default)

Many people stay on Good and Hard forever. With this on:

- A mature card (interval ≥ 1 day) recalled in under half its answering budget shows `Quick: 0:12 / 0:45` with `Too easy (Easy)` and `No idea (Again)` - fast can mean easy or blank
- One that took more than 1.5x shows `Slow: 2:30 / 0:45` with `Stuck (Again)` and `Mixed up (Hard)`
- A normal-speed card still carries `Mixed up (Hard)`: for the case where two answers were confused and the wrong one was given. It logs Hard with the mixed mark and moves on
- The parenthesis names the rating the button will log; the line is between the card and the buttons, with no modal, no focus stealing and no blocked shortcuts. Ignoring it changes nothing
- `Mixed up` writes `mixed: true` to the review log, which the child-card prompt now reads: `12 reviews, 3 of them mixed up (25%)`

### New: after a break (three switches, off by default)

1. **Recovery order**: when at least 20% of today's due cards are below 50% retrievability, the queue starts with the cards still remembered and mixes the weakest in at most 20% per day; a "Recovery mode" badge appears in the toolbar
2. **Interval cap**: a card reviewed when already 5x past its stability (roughly below 70% recall) cannot get a new interval beyond 1.5x the previous one or 60 days, even on a Good/Easy
3. **Adaptive day size**: yesterday's Good/Easy share below 70% queues 20% fewer cards today; above 90%, 10% more; waits for at least 10 reviews

All three change what is queued today, never a card's history or the rating you pressed.

### Please test

- Reveal quickly: do `Too easy (Easy)` and `No idea (Again)` appear, and does each log its rating
- Reveal after a long pause: do `Stuck (Again)` and `Mixed up (Hard)` appear, and does the latter log Hard and advance
- At normal speed: is `Mixed up (Hard)` there on its own
- With the line showing, press `3`: does it log Good normally and the line go away with the card
- Press the `×`: this card stops asking, the next one asks again
- Turn the interval cap on and rate an overdue card Good: is the interval kept within 1.5x of the previous one
- Turn recovery order on: does the badge appear, and does the queue open with familiar cards
