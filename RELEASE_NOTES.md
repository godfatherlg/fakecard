# 1.0.53

## 中文

复习界面的内部拆分：界面与操作没有变化。

- `reviewView.ts` 从约 1360 行降到约 690 行，只保留会话状态、队列、评分、撤销与快捷键。卡片正文、两个计时器、完成页、链接悬停预览、评分提示、子卡流程、编辑面板和两条间隔修正规则各自独立成模块。
- 「逾期成功封顶」与「提前复习折减」两条间隔规则改为纯函数，并新增 14 项单元测试（总计 58 项），规则改动会在发布前被测试挡住。
- 在测试库用真实 UI 回归了计时器（走秒 / 重置 / 关闭 / 恢复）、Ctrl+悬停页面预览、评分提示、撤销、编辑面板、子卡流程与完成页刷新回执，行为与 1.0.52 一致。

**请测试**

1. 复习一张到期卡：计时器走秒、重置、关闭后再打开；答案侧计时与「记混卡 / 太快了」提示。
2. 按住 Ctrl 悬停卡片里的链接，应弹出页面预览；移开后再移回来只弹一次。
3. 完成当天队列：刷新按钮出现回执，约 2.5 秒后自动消失。
4. 子卡流程仍然可用：建子卡后父卡暂停，子卡连续 Good 后父卡恢复。

## English

The review screen was split up internally; what you see and press is unchanged.

- `reviewView.ts` drops from roughly 1360 to roughly 690 lines: it keeps the session, queue, rating, undo and shortcuts, while the card body, both clocks, the finish page, link hover previews, the rating nudge, child cards, edit panels and the two interval rules live in their own modules.
- The two interval rules (overdue-success cap, early-review discount) are now pure functions with 14 new unit tests (58 in total), so a change to either rule fails before a release instead of after it.
- Real-vault UI checks covered the clocks (tick, reset, off, restore), Ctrl+hover page previews, the rating nudge, undo, the edit panel, the child-card flow and the finish page's refresh receipt; behaviour matches 1.0.52.

**Please test**

1. Review a due card: the clock ticks, resets, turns off and back on; the answer-side clock and the "mixed up / too quick" nudge.
2. Hold Ctrl and hover a link inside a card: the page preview opens, and only once per hover.
3. Finish today's queue: Refresh leaves a receipt that fades after about 2.5 seconds.
4. The child-card flow still works: a new child pauses its parent, and a Good streak brings the parent back.
