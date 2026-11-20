# 1.0.35

## 中文

### 建议用时按"真的记住了"来算

原来的预算只够"看一眼、想一下"，而且历史权重默认 −20%：越难的卡给的时间越少。这正好和实际相反——越难回忆的卡越需要时间。这一版把预算改成：

```
一遍   = 基础秒数 + 答案字数 ÷ 40 × 每段秒数
首遍   = 首遍基础秒数 + 答案字数 ÷ 40 × 每段秒数
总预算 = (一遍 × 记忆遍数 + 首遍) × 难度系数
```

- **记忆遍数**（新设置，默认 3）：一遍过关要完整回忆几次，就乘几份预算。
- **首遍基础秒数**（新设置，默认 20）：第一遍要理清结构，所以有自己的基础时间；阅读时间和一遍预算一样按字数增加。它只加一次、不参与乘法——后面的遍数照着已经理好的结构走。
- **难度系数**：评分历史权重默认从 −20% 改成 **+20%**，越难给得越多。旧设置文件升级时如果还是 −20%（旧默认值），会自动迁到 +20%，不需要手动改。

默认值下的变化（基础 10s、每 40 字 10s、3 遍、首遍 20s）：

| 卡片 | 原来 | 现在 |
|---|---|---|
| 20 字短问答 | 15s | 70s |
| 100 字方剂组成 | 35s | 150s |
| 400 字条文 | 110s | 450s |

### 答案面显示回忆用时，超时给失败分

- 揭示答案后，答案上方显示 `记忆 28s / 45s`：刚才真实回忆用时对比建议预算，颜色分档（≤1× 灰、1–1.5× 橙、≥1.5× 红）。tooltip 里有公式拆解。
- **超时判定倍数**（新设置，默认 2.0）：用时达到预算的这个倍数，算一次失败回忆。
- **超时给失败分 +1**（新设置，默认开）：超时的那次复习在 `fakecard/reviews/` 里记 `slow: true`，给这张卡的失败连击加 1 分——和 Hard 记 1 分同一个计数器。累计到「失败分阈值」（默认 4）时「建子卡」按钮变红，点它才进入建卡流程，不会弹窗打断。
- 评分 Good/Easy 但超时：失败连击不中断，但只保留这 1 分慢记分；正常 Good 仍然清零。
- 按 ↻ 重置计时后从新起点计算；没揭示就评分（跳过）不记分；关闭「显示建议作答时间」时整个机制不启用。

### 请测试

- 复习一张问答卡：问题面计时器是否照常计数，揭示后答案上方是否出现 `记忆 x / y`
- 点 ↻ 重置后计时是否从 0 重新走，揭示后的数字是否对应新起点
- 设置里改「记忆几遍算过关」「首遍基础秒数」「历史权重」，预算是否按公式变化（可对照 tooltip）
- 把「超时判定倍数」调到 1.2，故意停久一点再揭示：是否出现「超时 · 失败分 +1」
- 连点几次超时后，「+ Child」按钮是否变红
- 关掉「超时：失败分 +1」：答案面仍显示时间，但不再记为超时

## English

### The suggested time now covers an actual recall

The old budget only paid for one quick look, and the history weight defaulted to -20%: the harder the card, the less time it got. That is backwards - a hard card is the one that needs the time. The budget is now:

```
one pass   = base seconds + answer characters / 40 × seconds per chunk
first pass = first-pass base + answer characters / 40 × seconds per chunk
budget     = (one pass × passes + first pass) × difficulty factor
```

- **Passes** (new setting, default 3): how many full recalls count as knowing the card; each gets its own budget, so the time is multiplied by it.
- **First-pass base seconds** (new setting, default 20): the first pass has to sort the structure out, so it has a base of its own, with reading time growing by length just like a pass does. It is added once and not multiplied - later passes follow a structure that is already there.
- **Difficulty factor**: the rating-history weight now defaults to **+20%** instead of -20%, giving hard cards more room. A settings file still carrying the old default (-20%) is migrated automatically.

With the defaults (10s base, 10s per 40 characters, 3 passes, 20s first pass):

| Card | Before | Now |
|---|---|---|
| 20-character question | 15s | 70s |
| 100-character answer | 35s | 150s |
| 400-character passage | 110s | 450s |

### The answer side shows the recall, and a slow one counts

- After revealing, the answer carries `Recall 28s / 45s`: the real time spent recalling next to the suggested budget, colour-coded (≤1× muted, 1–1.5× orange, ≥1.5× red). The tooltip breaks the formula down.
- **Slow-recall limit** (new setting, default 2.0): a reveal at this multiple of the budget counts as a failed recall.
- **Add one failing point** (new setting, on by default): the review is logged with `slow: true` in `fakecard/reviews/`, adding one point to the card's failing run - the same counter Hard feeds. At the failing-score threshold (default 4) the "Child" button turns red; clicking it opens the child-card flow. Nothing pops up on its own.
- A Good/Easy that was slow keeps the run alive with that one point; a normal Good still resets it.
- Resetting the clock with ↻ measures from the new start; skipping the card without revealing scores nothing; turning off "Show suggested answer time" disables the whole mechanism.

### Please test

- Review a Q&A card: does the question-side clock count, and does `Recall x / y` appear above the answer
- Press ↻: does the clock restart from zero, and does the answer show the new measurement
- Change passes / first-pass base seconds / history weight in Settings: does the budget follow the formula shown in the tooltip
- Set the slow limit to 1.2 and wait a little longer: does `Too slow · +1 failing point` appear
- Do that a few times: does the "+ Child" button turn red
- Turn "Slow recall: add one failing point" off: the time still shows, but nothing is scored
