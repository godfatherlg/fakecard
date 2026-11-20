# 1.0.35

## 中文

### 建议用时按"真的记住了"来算

原来的预算只够"看一眼、想一下"，而且只有一条历史权重。这一版把作答和记忆拆开：

```
作答     = (基础秒数 + 答案字数 ÷ 40 × 每段秒数) × 作答系数
记忆一遍 = (基础秒数 + 答案字数 ÷ 40 × 每段秒数) × 记忆系数
记忆首遍 = (基础秒数 + 首遍基础秒数 + 答案字数 ÷ 40 × 每段秒数) × 记忆系数
记忆     = 记忆一遍 × (记忆遍数 − 1) + 记忆首遍
```

- **记忆遍数**（新设置，默认 3）：一共过几遍。**首遍已经算一遍**，所以后面只再加「遍数 − 1」遍。
- **首遍基础秒数**（新设置，默认 20）：第一遍是「一遍 + 额外整理思路的时间」，所以首遍 = 基础 + 首遍额外 + 阅读时间。
- **两条权重分开**：作答系数默认 **−20%**，只用于问题面的作答时间（越难给得越少，避免过度纠结）；记忆系数默认 **+20%**，用于记忆时间的每一遍（越难给得越多）。设置里这两行就叫「作答系数（%）」和「记忆系数（%）」。

默认值下的变化（基础 10s、每 40 字 10s、3 遍、首遍 20s）：

| 卡片 | 原来 | 现在 |
|---|---|---|
| 20 字短问答 | 15s | 65s |
| 100 字方剂组成 | 35s | 125s |
| 400 字条文 | 110s | 350s |

两点说明：

- **没有上限了**。以前的 600 秒封顶会把长答案一律显示成 10:00；现在长答案记三遍就是二十几分钟，照实显示。
- 字数统计忽略 `**`、`==`、`~~` 这类强调标记和链接，只算真正要读的字。

### 作答和记忆是两个计时

- 问题面 `作答 0:28 / 4:47`：从卡片出现到揭示，量的是「一遍」的作答预算，只提醒别在一个词上耗太久；位置从工具栏挪到问题这一行。
- 揭示后答案面 `记忆 0:05 / 10:00`：**从答案出现起重新计时**，不接着用作答的时间，量的是记忆正确答案的用时。也带 ↻，点一下从当前时刻重来，评分按重来后的数字算。
- **只有记忆预算超时才记分**：作答胶囊超时只是变红，不产生 Hard 分。
- **超时记忆：每多几倍算一步**（新设置，默认 0.5）：超过预算后，每多半个预算算一步——1.5 倍一步，2 倍两步。
- **超时记忆：每步记几个 Hard**（新设置，默认 0.5）：每一步给失败连击加这么多 Hard 分。默认下 1.5 倍记 0.5、2 倍记 1、2.5 倍记 1.5；设为 0 就只显示时间、不计分。
- 这些分数写进 `fakecard/reviews/` 的 `slowPoints` 字段，和 Hard 的 1 分进同一个计数器；到「失败分阈值」（默认 4）时「建子卡」按钮变红，点它才进入建卡流程，不会弹窗打断。
- 评分 Good/Easy 但超时：失败连击不中断，但只保留超时那几分；正常 Good 仍然清零。
- 没揭示就评分（跳过）不记分；关闭「显示建议作答时间」时整个机制不启用。

### 请测试

- 问题面：胶囊是否在问题上方、是否写作「作答」、数字是否每半秒跳动
- ↻：问题面点一次是否从当前时刻重计；揭示后再点答案面的 ↻，数字是否重新开始跑
- 揭示后：答案面胶囊是否从 0 开始跑「记忆」，位置和样式与问题面一致
- 设置里分别改「作答时间：评分历史权重」和「记忆时间：评分历史权重」，预算是否一边变少一边变多
- 改「记忆几遍算过关」「首遍基础秒数」，预算是否按公式变化（可对照 tooltip）
- 把「每多几倍算一步」保持 0.5，停到 1.5 倍再揭示：是否显示 `超时：Hard +0.5`；停到 2 倍：`+1`
- 把「每步记几个 Hard」改成 1：2 倍时是否变成 `+2`
- 把它改成 0：答案面仍显示时间，但不再记分
- 连做几次超时后，「+ Child」按钮是否变红

## English

### The suggested time now covers an actual recall

The old budget only paid for one quick look, and it had a single history weight. Answering and recall are now separate:

```
Answering         = (base + characters / 40 × seconds per chunk) × answering weight
One memory pass   = (base + characters / 40 × seconds per chunk) × memory weight
First memory pass = (base + first-pass base + characters / 40 × seconds per chunk) × memory weight
Remembering       = one memory pass × (passes − 1) + first memory pass
```

- **Passes** (new setting, default 3): how many times the answer is gone over. The **first pass already counts as one**, so only `passes − 1` more are added on top.
- **First-pass base seconds** (new setting, default 20): the first pass is "one pass plus the time to sort the structure out", so it is base + first-pass base + reading time.
- **Two weights, separately set**: the answering weight defaults to **-20%** and only touches the question clock (a hard card gets less time, so overthinking is flagged); the memory weight defaults to **+20%** and touches every memory pass (a hard card needs the time). The Settings rows are "Answering weight (%)" and "Memory weight (%)".

With the defaults (10s base, 10s per 40 characters, 3 passes, 20s first pass):

| Card | Before | Now |
|---|---|---|
| 20-character question | 15s | 65s |
| 100-character answer | 35s | 125s |
| 400-character passage | 110s | 350s |

Two notes:

- **There is no upper bound any more.** The old 600-second clamp turned every long answer into 10:00; a long answer gone over three times now shows its real twenty-odd minutes.
- Answer length ignores `**`, `==`, `~~` and links, so it counts only the words to be read.

### One pill on both sides

- The question side carries a pill labelled `Answering 0:28 / 4:47`, measured against ONE pass: it is the reminder not to linger on a word, and it moved from the toolbar to the question's own row.
- After revealing, the answer side runs its own clock, `Recalling 0:05 / 10:00`: it starts when the answer appears instead of carrying the answering time over, and it measures how long the correct answer is being memorised. It has a ↻ too; a rating scores the number after the last reset.
- **Only memory overtime scores**: the answering pill turning red does not earn any Hard points.
- **Slow recall: extra budgets per step** (new setting, default 0.5): past the budget, every extra half budget is one step - 1.5x is one step, 2x is two.
- **Slow recall: Hard points per step** (new setting, default 0.5): each step adds that much to the failing run. With the defaults, 1.5x gives 0.5, 2x gives 1 and 2.5x gives 1.5. Set it to 0 to show the time without scoring it.
- Those points are logged as `slowPoints` in `fakecard/reviews/` and counted with Hard's one point. At the failing-score threshold (default 4) the "Child" button turns red; clicking it opens the child-card flow. Nothing pops up on its own.
- A Good/Easy that was slow keeps the run alive with only its overtime points; a normal Good still resets it.
- Skipping the card without revealing scores nothing; turning off "Show suggested answer time" disables the whole mechanism.

### Please test

- Question side: is the pill above the question, labelled `Answering`, with the digits moving every half second
- Press ↻ on the question side: does it restart from now; after revealing, press ↻ on the answer side: does the clock restart
- After revealing: does the answer pill start from 0 as `Recalling`, in the same place and style as the question side
- Change the answering weight and the recall weight separately: does one shrink the budget and the other grow it
- Change passes / first-pass base seconds: does the budget follow the formula shown in the tooltip
- Keep the step at 0.5 and wait until 1.5x before revealing: does `Too slow: +0.5 Hard` appear; at 2x, `+1`
- Set the points per step to 1: is 2x then `+2`
- Set it to 0: the time still shows, but nothing is scored
- Do that a few times: does the "+ Child" button turn red
