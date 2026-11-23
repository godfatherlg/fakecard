# 1.0.57

## 中文

这一版修正答案面录音按钮的位置。

- **录音按钮不再被长答案顶走**：它现在固定在卡片与评分按钮之间那一行，也就是「很快 / 很慢」提示行的右端；没有提示时单独靠右显示。答案再长、卡片内部滚动时，录音按钮仍然可见。
- **答题逻辑不变**：仍只在答案面出现；录制、停止、立即保存，以及录音期间阻止评分、撤销、切换牌组的行为，都和 1.0.56 相同。

## English

This patch fixes where the answer-side Record button sits.

- **No longer pushed out of view by a long answer**: it now sits in the fixed row between the card and the rating buttons, at the right end of the timing hint row (or in its own right-aligned row when no hint is showing). It stays visible while a long answer scrolls inside the card.
- **Recording behaviour is unchanged**: it still appears only on the answer side; record, stop, immediate save and the guards against rating, undo and deck switching while recording are the same as in 1.0.56.
