# 1.0.14

## 中文

### 修复：卡片的列表编号被裁掉一位

以三位数开头的卡片（`298. …`）在复习界面里会显示成 `98. …`：Obsidian 把有序列表的编号画在内容框之外，靠阅读视图的大边距容纳，而卡片区域的边距更窄，三位数的标记就超出了可视范围。

现在卡片区域（复习、浏览预览、面板预览）里的列表有自己的缩进，编号完整显示。一位数、两位数列表不受影响，只是整体略向右一点。

### 调整：撤掉卡片底部那行「来源」

1.0.13 在卡片底部加了一行「来源：笔记名」。这次改回更接近原来的做法：来源以**块链接**的形式写进卡片答案正文本身，形如

```
[《最后一遍疯狂刷题：科目二心理学单选题》·第 28 块](obsidian://adv-uri?…)
```

- 230 张卡已带上这条链接（问答卡在答案面，填空卡在正文末尾）
- 链接由 fakelink 接管 `obsidian://adv-uri`，点击可跳回源笔记的对应块
- 原来底部那行提示已删除，不会再出现两份来源

### 请测试

- 复习一张以三位数编号开头的填空卡（如 298 题），确认编号完整显示为 `298.`
- 答案面末尾应有一条蓝色的 `《笔记名》·第 N 块` 链接，点击能跳回源笔记对应位置
- 问答卡的答案面同样有这条链接，问题面没有

## English

### Fixed: a card's list number lost its first digit

Cards that start with a three-digit number (`298. …`) were shown as `98. …` in the review view: Obsidian draws ordered-list markers outside the content box and relies on the reading view's margins to hold them, while a card pane has much less room - the marker ended up outside the visible area.

Lists inside a card (review, browse preview, panel preview) now have their own indent, so the number is printed in full. One- and two-digit lists are unaffected apart from a slightly wider indent.

### Changed: the "source" line under the card is gone

1.0.13 added a "Source: note name" line below the card. This release goes back to what the cards used to carry: the source is a **block link** written into the answer text itself, like

```
[《最后一遍疯狂刷题：科目二心理学单选题》·第 28 块](obsidian://adv-uri?…)
```

- 230 cards now carry that link (Q&A in the answer, cloze at the end of the body)
- fakelink handles `obsidian://adv-uri`, so clicking jumps back to the block in the source note
- the extra line below the card is removed - there are no two copies of the same source any more

### Please test

- Review a cloze card that starts with a three-digit number (e.g. 298) and check the number is complete
- The answer should end with a blue `《note》· block N` link that jumps to the right place in the note
- A Q&A card has the same link on its answer side, and none on the question side
