# 1.0.7

## 中文

### 统计页成为入口

左侧功能区图标不再直接进 Browse，而是打开**统计**界面。统计页和浏览页顶部多了一行 `Statistics / Browse / Review`，在三个界面之间切换：

- 已经有同名标签时直接跳过去并刷新，不会开出第二个相同标签
- 没有时原地替换当前标签，所以来回点不会堆一排页签
- 正在进行的复习在自己的标签里，不会被导航顶掉
- 命令面板照旧可以单独打开任意一页：**Open statistics** / **Browse and edit cards** / **Start reviewing**

### 考试计划重做：多个计划、天数、牌组勾选、每日数量预估

**多个计划**：设置 → 考试计划 里可以一次建多个计划（一科一个）。每个计划有自己的名称、剩余天数、牌组和参与比例，右上角 `×` 删除。命令 **Build an exam plan** 在有多个计划时会先弹菜单让你选一个。

**用天数代替日期**：「还有多久考试」直接填天数（默认 30），不用再算日期：

- 填 `0` 表示今天考，卡片全部排在今天
- 数字按自然日计算，填多少就是多少，不会因为当前时刻而漂移；每天自动递减
- 旧版保存过的考试日期在升级后自动变成第一个计划，不会丢配置
- 考试当天过后，该计划自动消失（设置页先隐藏，下次打开复习时正式移除），卡片回到常规 FSRS 排程，数据全部保留

**牌组改为勾选**：直接列出库里已有的牌组，勾哪个就纳入哪个；一个都不勾表示全部牌组。

**比例下方实时显示负荷**：拖动滑块、改天数或改牌组后，下面立刻算出这个计划每天要复习多少张：

- `≈ 每天 2 张，共 3 天`
- `选中的 6 张里有 6 张排在考试之后，会被铺到考前（每日上限 200）`
- 超过每日复习上限时追加一行红字提醒降低比例

生成前照旧自动备份到 `fakecard/backup/exam-plan-<计划 id>-<时间>.json`。

### 建议作答时间可以调了

复习时「已用 / 建议」的预估改成 True Recall 那版算法：基础秒数 + 答案阅读时间，再按这张卡的评分历史加权。设置里多出三项：

- **作答时间：基础秒数**（默认 10，范围 5–120）
- **作答时间：每 40 字增加的秒数**（默认 10，设为 0 忽略答案长度）
- **作答时间：评分历史权重 %**（默认 -20：反复失败的卡更早提示，避免过度纠结；正数则相反）

只有卡片停留超过建议时长后才显示计时，提前显示反而会增加压力。

### 子卡失败判定可调

把子卡的连击判定抽成了纯函数，并开放两个设置：

- **Hard 连击阈值**：2–10（默认 4），即最近多少次 Hard 及以上算「卡住了」
- **Again 记分**：0–3（默认 2），Again 在一次失败连击里算几分，设为 0 则 Again 不再推动阈值

### 测试提示

- 点功能区应进入统计页；点 Browse / Review 原地切换，标签数量保持 1
- 设置里建两个计划（比如一个 3 天、一个 10 天），勾选一个牌组，看预估是否随滑块变化；点「生成」后检查卡片被均匀铺到考前
- 从 1.0.6 升级时，旧的考试日期应该自动出现在计划列表里
- 复习一张卡停留超过建议时长后，计时才出现

## English

### Statistics is now the entry point

The ribbon icon opens **Statistics** instead of Browse, and both Statistics and Browse now carry a `Statistics / Browse / Review` strip at the top:

- An already-open tab of that page is revealed and refreshed instead of opening a second one
- Otherwise the current tab is replaced, so clicking back and forth never piles up tabs
- A review session in its own tab is not displaced by the navigation
- The command palette still opens any page on its own: **Open statistics** / **Browse and edit cards** / **Start reviewing**

### Exam plans reworked: several plans, countdowns in days, ticked decks, a live daily estimate

**Several plans**: Settings → Exam plan now holds any number of plans (one per subject). Each has its own name, countdown, decks and share, and a `×` to delete it. The command **Build an exam plan** asks which plan to build when more than one exists.

**Days instead of a date**: "Days until the exam" is a plain number (default 30), so there is no date to work out:

- `0` means the exam is today and every card lands today
- The number is calendar-based, so what you typed is what you see; it decreases by itself every day
- A single exam date saved by an older version is migrated into the first plan on upgrade, nothing is lost
- Once the exam day is over the plan disappears (hidden in Settings, removed for good the next time review opens) and its cards return to the normal FSRS schedule with all their data intact

**Decks are ticked now**: the decks you already have are listed; tick the ones the plan covers, tick none for every deck.

**The load is shown under the share slider**: dragging the slider, changing the countdown or ticking a deck immediately recomputes what the plan means per day:

- `≈ 2 card(s) per day, over 3 day(s)`
- `6 of the 6 selected cards are due after the exam and get spread out (daily cap 200)`
- When it exceeds the daily review limit, a red line suggests lowering the share

Building still writes a backup to `fakecard/backup/exam-plan-<plan id>-<time>.json` first.

### The suggested answer time is configurable

The "used / suggested" timer in review now uses the True Recall algorithm: a base budget plus reading time for the answer, weighted by the card's rating history. Three new settings:

- **Answer time: base seconds** (default 10, range 5–120)
- **Answer time: seconds per 40 characters** (default 10; 0 ignores answer length)
- **Answer time: rating history weight (%)** (default -20, so cards you keep failing are flagged earlier instead of making you dwell on them; use a positive value for the opposite)

The timer only appears once a card stays past its suggested time - showing it earlier turns it into pressure.

### Child-card failure scoring is configurable

The child-card streak logic now lives in pure helpers, and two settings are exposed:

- **Hard streak threshold**: 2–10 (default 4) - how many recent Hard-or-worse ratings count as "stuck"
- **Again score**: 0–3 (default 2) - what an Again contributes to a failing run; 0 makes Again part of the run but never push the threshold on its own

### Please test

- The ribbon icon should open Statistics; Browse / Review should switch in place and keep the tab count at 1
- Create two plans (say 3 days and 10 days), tick a deck, and check the estimate follows the slider; press Build and confirm cards are spread over the days before the exam
- Upgrading from 1.0.6 should show the old exam date as the first plan
- The review timer should only appear after a card stays past its suggested time
