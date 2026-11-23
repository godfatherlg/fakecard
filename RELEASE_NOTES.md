# 1.0.54

## 中文

两处修正：

- 新建图片挖空卡改为整套保存：写入中途失败时，会回滚这次已经写进去的卡片并保留面板。以前会提示「已保存 N 张」然后关面板，失败的组既没保存，再点一次还会把已经保存的组重复创建。
- 复习栏在窄面板下自动换行：牌组/进度、计时器、图标按钮各占一行，不再互相压住。此前面板很窄时，右侧图标行会盖住计时器上的「重新打开」按钮，点不到。

**请测试**

1. 把复习页拖窄：计时器和图标按钮都应可见可点；关闭计时器后还能重新打开。
2. 新建图片挖空卡：画两个分组并保存，应提示「已保存 2 张图片卡」。

## English

Two fixes:

- Creating an image-occlusion set is now all-or-nothing: when a write fails halfway, the cards already written in that attempt are rolled back and the panel stays open. Before, it showed "Saved N" and closed, losing the groups that failed - and pressing Save again duplicated the groups that had landed.
- The review toolbar wraps in a narrow pane: deck/progress, the clock and the icon buttons each get their own line instead of covering each other. Before, the icon row could sit on top of the clock's restore button and make it unclickable.

**Please test**

1. Drag the review pane narrow: the clock and the icon buttons must stay visible and clickable; switch the clock off and back on.
2. Create an image-occlusion card: draw two groups and save - expect "Saved 2 image card(s)".
