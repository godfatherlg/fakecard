# 1.0.15

## 中文

### 修复：卡片里冒出「这一段有卡片」的角标

那个 📇 本来只该出现在**笔记的阅读视图**里，标记“这一段生成过卡片”。但 `MarkdownRenderer` 也会触发 Markdown 后处理器，而复习时我们传给它的正是源笔记路径，于是角标被当成笔记内容注入了卡片，正面、反面各出现一次。

现在后处理器会先看自己渲染在哪个容器里：只要在复习正文、浏览预览或字段预览之内就直接返回，角标只留在真正的笔记里。

### 修复：点角标只打开浏览视图，不指向那张卡

原来点击角标只是打开浏览视图，停在列表第一行。现在：

- 角标知道自己对应哪张卡，点击时带上卡片 id
- 浏览视图会先清空搜索词与牌组筛选（否则卡片可能被上次的筛选挡住，退化成“选中第一行”），再选中该卡
- 列表会滚动到那一行并高亮，右栏同时显示它的预览

同一段有多张卡时（填空的 c1/c2、一张图的多个蒙版组），落到第一张。

### 请测试

- 阅读视图里点某段的 📇：浏览视图应打开、筛选被清空、对应行被选中并滚动到视野中央
- 打开任何一张卡复习：正反面都不该再出现 📇
- 浏览视图右栏预览里也不该出现 📇

## English

### Fixed: a "this block has cards" chip inside the cards themselves

The 📇 badge belongs in the **reading view of a note**, where it marks a block that produced cards. But `MarkdownRenderer` also runs markdown post-processors, and review renders a card with its source note's path - so the badge was injected into the card itself, once on each side.

The post-processor now checks where it is rendering: inside the review body, a browse preview or a field preview it returns straight away, and the badge stays in real notes only.

### Fixed: clicking the badge opened the browse view without the card

The click used to just open the view, which then sat on the first row. Now:

- the badge carries the id of the card it belongs to
- the browse view clears its search and deck filters first (a leftover filter could hide that card and the view would fall back to its first row), then selects it
- the row is scrolled into view and highlighted, with its preview on the right

When one block produced several cards (cloze groups c1/c2, masks of one image), it lands on the first.

### Please test

- In a note's reading view, click a block's 📇: the browse view should open with filters cleared, the row selected and scrolled into the middle
- Review any card: no 📇 on either side
- The browse view's own preview should not show a 📇 either
