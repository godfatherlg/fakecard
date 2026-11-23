# 1.0.41

## 中文

### 导图卡改在自己的面板里编辑

以前点「编辑思维导图」会临时建一个 md 笔记，里面 `{{c1::…}}` 只是一串纯文本：看不到挖空、注释和树形，改起来很别扭。

- 浏览页选中导图卡 → `✎ 编辑思维导图`，直接打开新建时用的那个面板
- 复习界面的编辑按钮，遇到导图卡也走同一个面板
- 打开时默认选中卡片自己的分组，并居中该组的第一处挖空
- 保存会更新整张图的所有分组，牌组和标签也一起写入

### 挖空注释的输入框修好了

- 输入框移进弹窗内部，光标不再被弹窗抢走、不再闪烁
- 输入框旁新增 **「删除挖空」**：去掉标记、保留原文字
- 单击挖空写注释；拖选仍然是选中文字（可以点悬浮按钮移除）

### 打开面板不再闪，切分组会居中

- 导图首次绘制先隐藏，定位完成后再整体显示，不再闪一下
- 切换 c1 / c2 / c3 会居中该组的第一处挖空，而不是保留上一组的视口

### 术语统一

- 中文界面：`遮罩` / `遮挡` / `蒙版` / `遮住` 全部改为 **挖空**（图片卡也一样）
- 英文界面：`mask` / `hole` / `occlusion` / `box` 混用改为 **mask** 表示被藏起来的部分；`Image occlusion` 只作为卡型名称保留

### 请测试

- 浏览页编辑一张导图卡：是否直接打开导图面板、是否显示挖空和注释
- 编辑后保存：同一张图的 c1/c2/c3 是否一起更新
- 点挖空写注释：光标是否稳定、能否输入；「删除挖空」是否保留原文字
- 打开新导图面板：是否不再闪；切换分组是否居中到该组
- 中文/英文界面各看一遍：是否只剩「挖空」/「mask」一套说法

## English

### A mind map is edited in its own panel

"Edit mind map" used to open a temporary note, where `{{c1::...}}` was plain text - no masks, no notes, no tree.

- Browse → `✎ Edit mind map` now opens the same panel that creates maps
- The review edit button does the same for map cards
- It opens on the card's own group, centred on that group's first mask
- Saving updates every group of the map, deck and tags included

### The mask note field works

- The field now lives inside the dialog, so the modal cannot take the caret back and it no longer flickers
- A **Remove mask** button beside it drops the markers and keeps the words
- A click writes a note; dragging still selects text (the floating button removes a mask)

### No flash on open, and a group switch centres

- The first paint stays hidden until the map is measured and centred
- Switching c1 / c2 / c3 centres that group's first mask instead of keeping the previous view

### One word for a hidden area

- English used `mask`, `hole`, `occlusion` and `box` for the same thing; the area and the verb are **mask** everywhere now, and `Image occlusion` stays as the card type name
- Chinese uses 挖空 throughout, image cards included

### Please test

- Edit a map from Browse: does the map panel open with masks and notes
- Save: do all groups of that map update together
- Click a mask: does the caret stay, can you type, and does Remove mask keep the words
- Open a new map panel: is the flash gone; does a group switch centre that group
- Check both languages: is there only one term left
