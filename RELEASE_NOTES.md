# 1.0.36

## 中文

### 修正：超时的 Good / Easy 不再累计失败连击

原来「评了 Good / Easy 但超时」会让失败连击保持不断、只保留超时那几分。现在改成：

- 超时分只在 **Again / Hard** 上折算
- Good / Easy 无论用时多少，一律结束这一轮失败连击
- 理由：用对了就是记住了；超时的 Good 多半是中途分心，不该让它留在失败连击里，否则分心反而能"攒"到建子卡

### 新增：计时胶囊可以关掉

两个胶囊（问题面「作答」、答案面「记忆」）右侧都多了一个眼睛按钮：

- 点它 = 关闭这张卡的计时：**不测、也不记分**，本次复习不会因为关闭前的时间留下任何 Hard 分
- 关闭后同一位置留一个小时钟按钮，点它重新打开；打开后从**那一刻**重新计时，关闭期间的时间不计入
- 关闭是「按卡」的：换到下一张卡自动恢复显示，不需要手动再开

### 请测试

- 把「每步记几个 Hard」设为 1，停到 2 倍预算，评 Good：失败连击是否清零（`+ Child` 不因此变红）
- 同样停到 2 倍，评 Hard：是否记 1 分（`超时：Hard +2`）
- 问题面点眼睛：胶囊是否消失、出现小时钟按钮；揭示后再点小时钟，是否从 0 重新跑
- 答案面点眼睛再评分：是否不产生任何超时分
- 关闭后进入下一张卡：胶囊是否自动回来

## English

### Fixed: a slow Good or Easy no longer keeps the failing run

A Good/Easy that ran long used to keep the failing run alive with only its overtime points. Now:

- Overtime points only count on **Again / Hard**
- Any Good or Easy ends the run, however long it took
- The reason: getting it right is remembering it; a slow Good is usually a distraction, and letting it feed the run would reward wandering off

### New: the clock pills can be switched off

Both pills (Answering on the question side, Recalling on the answer side) carry an eye button:

- It turns the clock off for that card: **nothing measured, nothing scored**, so the time before switching it off cannot leave a Hard point
- A small clock button stays in the same spot to turn it back on; timing restarts from that moment, and the hidden stretch is not counted
- The switch is per card: the next card shows its clock again without any action

### Please test

- Set "Hard points per step" to 1, wait until twice the budget, rate Good: does the failing run reset (the "+ Child" button stays calm)
- Wait the same, rate Hard: does it score 1 point (`Too slow: +2 Hard`)
- Press the eye on the question side: does the pill disappear and a small clock button appear; after revealing, does pressing the clock restart from 0
- Press the eye on the answer side, then rate: does it score nothing
- After switching off, move to the next card: does its clock come back
