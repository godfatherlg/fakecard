# 1.0.13

## 中文

### 新功能：用 Obsidian 自己的编辑器编辑卡片

点复习界面或浏览视图的 ✎，卡片这一面会作为一个临时笔记在分栏里打开，用的就是 Obsidian 的编辑器：`**`、`==`、`[[内链]]`、公式、图片全部按笔记的样子渲染，`[[` 有补全，其它插件也照常工作。停止输入 600ms 后回写进卡片，关掉分栏就删除临时文件（`fakecard/editing/`），崩溃残留由启动时清理。

- 问答卡：题目与答案各一个文件
- 填空卡：正文，外加顶部一条工具条（包裹选中 / 新建分组 / 移除挖空）
- 跨行选中时**逐行包裹**：`1. {{c1::…}}`，列表编号与缩进留在花括号外面，列表不会被包坏
- 图片蒙版卡：编辑 `![[图片]]` 引用
- 文件名就是卡片 id，所以那个能改标题的位置被隐藏，顶栏只标明「题目 / 答案 / 填空正文」
- 编辑完回到卡片仍是原来那一面，不会翻回问题面

### 优化：浏览视图右栏重做

- 牌组、标签改成行内编辑，改完立刻保存，「卡片信息」面板不再需要
- 问答卡：正面一块 + 分隔线 + 背面一块
- 填空卡、图片卡：只渲染一块，用「显示答案 / 收起答案」就地揭示，不再把同一段文字印两遍
- 删掉了「👁 预览」按钮和它背后的预览弹窗——右栏本身就是预览

### 新功能：卡片下方显示来源

复习翻到答案后，卡片底部多一行「来源：笔记名」，点它跳到源笔记里这张卡所在的那一块。图片卡没有可回溯的文字，不显示。

### 新功能：搜索命中在答案里时给出上下文

列表只显示正面，所以搜到只存在于答案里的词时，正面下面会多一行小字标出命中位置。

### 修复

- Anki 导入的「正确次数」改用枚举比较（`Rating.Good`），行为不变，消除枚举比较告警
- 导入的 232 张卡片补回了 `source.path`：之前为空，导致「↗ 来源」和阅读视图的卡片徽章都失效

### 请测试

- 复习一张填空卡 → 点 ✎ → 右侧出现笔记；选中几行点「包裹选中」，确认列表结构还在
- 关掉那个分栏，`fakecard/editing/` 应被清空，卡片内容已更新
- 浏览视图：改牌组/标签是否立即生效；填空卡点「显示答案」是否就地揭示
- 翻到答案面，底部「来源」行能否跳到源笔记的对应块
- 搜索一个只在答案里出现的词，列表里是否出现「命中在答案：…」

## English

### New: edit a card in Obsidian's own editor

The pencil in the review view or the browse view opens that side of the card as a scratch note in a split - Obsidian's editor, with live preview: `**`, `==`, `[[links]]`, math, images, `[[` completion and every other plugin all behave as they do in a note. Typing flows back into the card 600 ms after you stop, and the scratch note is deleted when the split closes (`fakecard/editing/`); anything a crash leaves behind is swept on startup.

- Q&A cards: one file for the question, one for the answer
- Cloze cards: the body, plus a toolbar at the top (wrap selection / new group / remove)
- A multi-line selection is wrapped **line by line** - `1. {{c1::…}}` - so list numbers and indentation stay outside the braces and the list keeps its shape
- Image cards: the `![[image]]` reference
- The file name is the card id, so the editable title is hidden; the bar at the top just says Question / Answer / Cloze text
- After editing you come back to the same side, not to the question

### Improved: the browse view's right pane was rebuilt

- Deck and tags are edited inline and saved at once; the card-info panel is gone
- Q&A: front, a rule, back
- Cloze and image cards: a single block with a "show answer" switch - the same text was being printed twice
- The "preview" button and the dialog behind it are gone: the pane is the preview

### New: the source line under a card

Once the answer is up, the card carries a line "Source: note name"; clicking it jumps to the block the card came from. Image cards have no text to trace back, so they show nothing.

### New: search says when the match was in the answer

The list only prints the front, so a card found through a word that lives in its answer now shows a small second line with the surrounding text.

### Fixed

- Anki import counts a correct review through the enum (`Rating.Good`) instead of a bare number - same behaviour, no more enum-comparison warning
- 232 imported cards got their `source.path` back: it was empty, which had left "open source" and the reading-view badges dead

### Please test

- Review a cloze card → press the pencil → the note opens on the right; select a few lines and press "wrap selection", the list must keep its numbering
- Close that split: `fakecard/editing/` should be empty and the card already updated
- Browse: does changing deck / tags take effect immediately; does "show answer" reveal a cloze card in place
- With the answer revealed, does the source line jump to the right block in the source note
- Search a word that only exists in an answer: the list should show "matched in the answer: …"
