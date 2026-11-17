# 1.0.18

## 中文

### 新功能：提前复习

今日队列清空后，完成页会出现「提前复习 10 张」：从**还没到期**的卡里按你设定的顺序挑一批来练（默认最难：先看累计错次，再看 FSRS 难度）。数量可在设置里改。

评分照常走 FSRS，但会按「提前了多少天」把新间隔缩短：

```
新间隔 = FSRS 给的间隔 − 提前的天数（不早于原定到期日）
```

所以提前练一张 44 天间隔的卡 20 天，它不会从 90 天跳到 90 天，而是落在 70 天。提前复习的评分也**不占用当天的复习额度**（日志里单独标记），不会挤掉今天真正到期的卡。

关掉设置里的「提前复习时折算间隔」后，这个功能整体停用——不折算的提前复习只会把间隔虚高，留着没意义。

### 新功能：今天多学一点、积压提示

- 今天到期卡超过每日上限时，复习界面工具栏会出现红底小标「47 张待复习」，完成页出现「今天多学一点（还剩 47 张）」
- 点一次放开今天的额度，清完还会再次出现，可以反复续
- 每次放开的数量默认是每日上限的十分之一（最少 10 张）；设置里填数字就是固定值，**留空表示自动**
- 新增「积压时暂停新卡」：到期卡超过上限时先不放新卡，队列降下来自动恢复。它不改动任何排程，新卡只是晚点开始

### 新功能：统计页的困难卡片可以直接学

「最难的卡」不再只显示前 5 张，改为可滚动列出所有出错过的卡，按错次排序。点一行（键盘可 Tab 聚焦后回车）就在复习界面里开始学这一张，不用先去浏览视图找。

### 设置页重新分组

库与牌组 / 新建卡片 / 每日节奏 / 提前复习 / 复习界面 / 考试冲刺 / 导入与导出 / 维护。

原来「复习」一组塞了 15 项，现在按用途拆开。新增的「维护」组补上了此前没有入口的操作：清理编辑临时文件、删除备份文件（带确认）、重建卡片索引——都不用再重启 Obsidian。

### 文案

所有设置项的标题、说明、占位符都过了一遍，中英文都有，按界面语言显示。

### 请测试

- 复习到清空 → 完成页点「提前复习 10 张」→ 顶部出现「提前复习中」，评几张后看这些卡的到期日是否只被推后了“该推后那么多”
- 有积压时（临时把每日上限调小即可造出来）→ 工具栏红标 + 完成页「今天多学一点」，连点两次能否续
- 设置里把「提前复习时折算间隔」关掉 → 完成页应显示“提前复习已关闭”，且不再出现按钮
- 统计页滚到最下面「最难的卡」，点一行 → 复习界面开始学这一张
- 设置页八组分类是否顺眼，「维护」三项是否可用

## English

### New: study ahead

When today's queue is empty, the finish page offers "Study 10 cards ahead": a batch pulled from cards that are **not due yet**, in the order you choose (hardest first by default: most misses, then FSRS difficulty). The batch size is a setting.

Ratings still go through FSRS, but the new interval is shortened by how early you were:

```
new interval = what FSRS says − days gained early (never earlier than the original due date)
```

A 44-day card studied 20 days early lands on 70 days instead of 90. Those ratings also **do not consume the day's allowance** (they are marked in the log), so they cannot push out cards that are due today.

Turning off "scale intervals for early reviews" disables study ahead entirely - borrowing future cards without that correction would only inflate their intervals.

### New: "study more today", and a backlog badge

- When due cards exceed the daily limit, the review toolbar shows a red "47 more due" chip and the finish page offers "Study more today (47 left)"
- Each press raises today's allowance; finish the batch and it appears again, so it can be continued
- The default step is a tenth of the daily limit (at least 10); a number in settings fixes it, leaving the field **empty** means automatic
- New "hold new cards while behind": while due cards exceed the limit, no new cards are introduced; they come back automatically when the queue fits. Nothing is rescheduled - new cards just wait

### New: the struggling cards on the stats page can be studied

"Hardest cards" no longer stops at five: every card with a miss is listed, scrollable, worst first. Clicking a row (or focusing it and pressing Enter) starts reviewing that card right there.

### Settings page reorganised

Library / Card creation / Daily pace / Study ahead / Review screen / Exam plan / Import and export / Maintenance.

The old "Review" group held 15 rows; it is now split by purpose. The new Maintenance group covers operations that had no home: clean up editing scratch files, delete backups (with a confirmation), rebuild the card index - no restart needed.

### Wording

Every setting title, description and placeholder was reviewed, in both languages, following the interface language.

### Please test

- Clear today's queue → press "Study 10 cards ahead" → the "studying ahead" badge appears; rate a few and check their due dates moved out only by what was earned
- With a backlog (lower the daily limit to create one) → red chip in the toolbar and "study more today" on the finish page; pressing it twice should continue
- Turn off "scale intervals for early reviews" → the finish page says study ahead is off and no button appears
- Scroll to "Hardest cards" on the stats page and click a row → review starts on that card
- Check the eight settings groups and that the three maintenance actions work
