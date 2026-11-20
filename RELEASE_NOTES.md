# 1.0.35

## 中文

### 建议用时按"真的记住了"来算

原来的预算只够"看一眼、想一下"，而且只有一条历史权重。这一版把作答和记忆拆开：

```
一遍   = (基础秒数 + 答案字数 ÷ 40 × 每段秒数) × 作答系数
首遍   = (首遍基础秒数 + 答案字数 ÷ 40 × 每段秒数) × 作答系数
总预算 = (一遍 × 记忆遍数 + 首遍) × 记忆系数
```

- **记忆遍数**（新设置，默认 3）：一遍过关要完整回忆几次，就乘几份预算。
- **首遍基础秒数**（新设置，默认 20）：第一遍要理清结构，所以有自己的基础时间；它的阅读时间和一遍预算一样按字数增加。只加一次、不参与乘法——后面的遍数照着已经理好的结构走。
- **两条权重分开**：作答权重默认 **−20%**（越难给得越少，避免在一个词上过度纠结），记忆权重默认 **+20%**（越难给得越多）。原来的「评分历史权重」行变成「作答时间：评分历史权重」，另加一行「记忆时间：评分历史权重」。

默认值下的变化（基础 10s、每 40 字 10s、3 遍、首遍 20s）：

| 卡片 | 原来 | 现在 |
|---|---|---|
| 20 字短问答 | 15s | 70s |
| 100 字方剂组成 | 35s | 150s |
| 400 字条文 | 110s | 450s |

### 问题面与答案面共用同一个胶囊

- 问题面上方现在是同一个胶囊：`记忆 0:28 / 1:10`，右侧 ↻ 重新计时。位置从工具栏挪到问题这一行，和答案面的胶囊读起来是同一个测量。
- 揭示后同一个胶囊冻结成 `记忆 28s / 1:10`：刚才真实回忆用时对比建议预算，颜色分档（≤1× 灰、1–1.5× 橙、≥1.5× 红）。两边的 tooltip 都有公式拆解。
- **超时判定倍数**（新设置，默认 2.0）：用时达到预算的这个倍数，算一次失败回忆。
- **超时给失败分 +1**（新设置，默认开）：超时的那次复习在 `fakecard/reviews/` 里记 `slow: true`，给这张卡的失败连击加 1 分——和 Hard 记 1 分同一个计数器。累计到「失败分阈值」（默认 4）时「建子卡」按钮变红，点它才进入建卡流程，不会弹窗打断。
- 评分 Good/Easy 但超时：失败连击不中断，但只保留这 1 分慢记分；正常 Good 仍然清零。
- 按 ↻ 重置计时后从新起点计算；没揭示就评分（跳过）不记分；关闭「显示建议作答时间」时整个机制不启用。

### 请测试

- 问题面：胶囊是否在问题上方、数字是否每半秒跳动
- 点 ↻ 重置：是否从 0 重新走，揭示后的数字是否对应新起点
- 揭示后：胶囊是否换成冻结的 `记忆 x / y`，位置和样式与问题面一致
- 设置里分别改「作答时间：评分历史权重」和「记忆时间：评分历史权重」，预算是否一边变少一边变多
- 改「记忆几遍算过关」「首遍基础秒数」，预算是否按公式变化（可对照 tooltip）
- 把「超时判定倍数」调到 1.2，故意停久一点再揭示：是否出现「超时 · 失败分 +1」
- 连点几次超时后，「+ Child」按钮是否变红
- 关掉「超时：失败分 +1」：答案面仍显示时间，但不再记为超时

## English

### The suggested time now covers an actual recall

The old budget only paid for one quick look, and it had a single history weight. Answering and recall are now separate:

```
one pass   = (base + answer characters / 40 × seconds per chunk) × answering factor
first pass = (first-pass base + characters / 40 × seconds per chunk) × answering factor
budget     = (one pass × passes + first pass) × recall factor
```

- **Passes** (new setting, default 3): how many full recalls count as knowing the card; each gets its own budget, so the time is multiplied by it.
- **First-pass base seconds** (new setting, default 20): the first pass has to sort the structure out, so it has a base of its own, with its reading time growing by length just like a pass. It is added once and not multiplied - later passes follow a structure that is already there.
- **Two weights, separately set**: the answering weight defaults to **-20%** (a hard card gets less time, so overthinking is flagged), the recall weight to **+20%** (a hard card gets more time). The old "rating history weight" row is now "Answer time: rating history weight", with "Recall time: rating history weight" beside it.

With the defaults (10s base, 10s per 40 characters, 3 passes, 20s first pass):

| Card | Before | Now |
|---|---|---|
| 20-character question | 15s | 70s |
| 100-character answer | 35s | 150s |
| 400-character passage | 110s | 450s |

### One pill on both sides

- The question side now carries the same pill: `Recall 0:28 / 1:10` with a ↻ reset. It moved from the toolbar to the question's own row, so the two sides read as one measurement.
- After revealing, the same pill freezes into `Recall 28s / 1:10`: the real time spent recalling next to the suggested budget, colour-coded (≤1× muted, 1–1.5× orange, ≥1.5× red). Both tooltips break the formula down.
- **Slow-recall limit** (new setting, default 2.0): a reveal at this multiple of the budget counts as a failed recall.
- **Add one failing point** (new setting, on by default): the review is logged with `slow: true` in `fakecard/reviews/`, adding one point to the card's failing run - the same counter Hard feeds. At the failing-score threshold (default 4) the "Child" button turns red; clicking it opens the child-card flow. Nothing pops up on its own.
- A Good/Easy that was slow keeps the run alive with that one point; a normal Good still resets it.
- Resetting the clock with ↻ measures from the new start; skipping the card without revealing scores nothing; turning off "Show suggested answer time" disables the whole mechanism.

### Please test

- Question side: is the pill above the question, do the digits move every half second
- Press ↻: does it restart from zero, and does the answer show the new measurement
- After revealing: does the pill become the frozen `Recall x / y`, in the same place and style as the question side
- Change the answering weight and the recall weight separately: does one shrink the budget and the other grow it
- Change passes / first-pass base seconds: does the budget follow the formula shown in the tooltip
- Set the slow limit to 1.2 and wait a little longer: does `Too slow · +1 failing point` appear
- Do that a few times: does the "+ Child" button turn red
- Turn "Slow recall: add one failing point" off: the time still shows, but nothing is scored
