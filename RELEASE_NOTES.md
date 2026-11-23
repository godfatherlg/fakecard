# 1.0.40

## 中文

### 新增：点遮罩写注释

- 导图面板和挖空面板里，**单击**蓝色遮罩就会在它下面弹出一个输入框
- 写的内容存成 Anki 的挖空提示：`{{c1::答案::注释}}`，遮罩上显示 `[注释]`，复习时也显示
- Enter 保存，Esc 取消，点别处保存；留空即删除注释
- 拖选遮罩仍然是选中文字（用来取消挖空），不会误弹输入框

### 新增：两个面板都有「显示答案」

- 导图面板：工具栏「显示答案 / 收起答案」，遮罩还原成原文，当前组用绿色标出
- 挖空面板：预览默认隐藏当前组，所以遮罩可见、可点；「显示答案」把整段还原
- 两边操作一致：选中文字 → 悬浮按钮挖空；点遮罩 → 写注释；显示答案 → 核对全文

### 修正：导图遮罩不再单独占一行

Obsidian 的 Markdown 渲染会把每段文字包进 `<p>`，于是节点里"文字 / 遮罩 / 文字"变成了三个块，遮罩被挤到单独一行。现在单段渲染会把 `<p>` 拆掉、内容留在行内，`夏季洪[___]满为患` 回到同一行。顺带：

- 节点文字恢复正常换行与选中
- 遮罩宽度不再撑高行盒
- 挖空卡的换行紧贴标记时会被归一化，不再把洞推到单独一行

### 修正：问答面板的问题框按内容自适应

问题只有一行时就只有一行高，内容变长才变高；答案框同理。

### 请测试

- 导图/挖空面板点遮罩：输入框是否出现；输入后遮罩是否显示 `[注释]`
- 注释留空再保存：注释是否被删除
- 导图面板「显示答案」：遮罩是否还原、绿色标记是否对应所选分组
- 挖空面板切换分组：遮罩与绿色答案是否跟着换
- 长段落里挖一个短词：遮罩是否留在原句中间，不再独占一行
- 新建问答卡：问题框是否随输入自动伸缩

## English

### New: click a mask to write its note

- In the mind map and cloze panels, a **single click** on a blue mask opens a small field under it
- The text is stored as the Anki cloze hint: `{{c1::answer::note}}`; the mask shows `[note]`, in review too
- Enter saves, Escape cancels, clicking elsewhere saves; an empty note removes it
- Dragging across a mask still selects text (for removing the hole) and does not open the field

### New: both panels have "Show answer"

- Mind map: a toolbar switch restores every mask; the current group is marked green
- Cloze: the preview hides the current group, so masks are visible and clickable; the switch shows everything
- One set of gestures on both sides: select text → floating button; click a mask → note; show answer → check the whole text

### Fixed: a map mask no longer sits on its own line

Obsidian's Markdown renderer wraps each text run in `<p>`, so "text / mask / text" became three blocks and the mask was pushed onto a line by itself. A single-paragraph render is now unwrapped back into the line, so `夏季洪[___]满为患` stays together. Also: node text wraps and selects normally again, the mask no longer changes the line height, and a newline touching a cloze marker is normalised so it cannot push the hole onto its own line.

### Fixed: Q&A fields size to their content

A one-line question is one line high, and grows with the text; the answer field behaves the same.

### Please test

- Click a mask in either panel: does the field appear, and does the mask show `[note]` after saving
- Save an empty note: is the note removed
- Mind map "Show answer": are the words restored with the green marking on the selected group
- Switch groups in the cloze panel: do the mask and green answer follow
- Mask a short word inside a long paragraph: does it stay in the middle of its sentence
- New Q&A card: does the question field grow with the text only
