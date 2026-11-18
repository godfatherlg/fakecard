# 1.0.34

## 中文

### 修复：CSS lint 警告 `css-display-contents`

审核在 `styles.css:1287` 报：

- **Warning**：Unexpected browser feature "css-display-contents" is only partially supported by Obsidian 1.11.4

这条规则是 1.0.33 给浏览页批量操作加的那层容器用的——当时为了让「移动牌组 / 暂停 / 删除」既能在自己节点里单独重绘，又能在工具栏里和别的控件排成一行，用了 `display: contents`。现在改成普通的 `display: flex`（`gap: 8px`，与工具栏自身的间距一致，所以视觉上没有任何变化），没有勾选时用 `:empty` 把它整个收起，不留空隙。

样式表里已无 `display: contents`。

### 请测试

- 浏览页勾选几张卡：批量按钮出现的位置与间距是否和之前一样
- 取消全部勾选：工具栏是否正常收拢、没有多出来的空白
- 搜索框、牌组下拉、`New card` 按钮的排列是否正常

## English

### Fixed: the `css-display-contents` lint warning

The review reported this in `styles.css:1287`:

- **Warning**: Unexpected browser feature "css-display-contents" is only partially supported by Obsidian 1.11.4

The rule belonged to the container added for the Browse batch actions in 1.0.33: it had to be repainted on its own while still sitting in the toolbar row, and `display: contents` did both in one declaration. It is now a plain `display: flex` row with `gap: 8px`, matching the toolbar's own gap, so nothing moves on screen; when nothing is ticked the node is hidden with `:empty` instead of leaving an empty gap.

The stylesheet no longer contains `display: contents`.

### Please test

- Tick a few cards in Browse: do the batch buttons appear in the same place with the same spacing
- Untick everything: does the toolbar collapse cleanly, with no leftover gap
- Do the search box, deck dropdown and `New card` button still line up
