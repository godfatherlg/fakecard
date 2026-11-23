# 1.0.56

## 中文

这一版新增四个可绑定快捷键的命令，把录音入口放到复习答案面，并收紧了问答草稿与预览。

- **四个新命令**：用选中内容新建问答卡、用选中内容新建填空卡、录制答案（开始/停止）、编辑当前卡片。可以在「设置 → 快捷键」里绑定，也可以直接从命令面板执行。
- **答案面直接录音**：复习翻到答案后，答案下方会多一个紧凑的「录音」按钮；录完立即保存并刷新上方的播放条，不需要先打开编辑面板。录音进行中评分、撤销或切换牌组会提示先停止录音，避免录音被翻卡打断。
- **问答草稿只留一条可见分隔线**：不再写隐藏的 `<!-- fakecard:answer -->`，只保留一条 `---`；问题与分隔线之间自动留一个空行，避免 `问题` 紧跟 `---` 被 Markdown 当成标题。旧格式的草稿仍能正常读取。
- **问答预览更紧凑**：问题区按内容高度收缩，最多占预览框的一半；长问题在问题区内滚动，不再把答案推下去。
- **文本卡直接从编辑器改**：从浏览页编辑问答/填空卡时打开 Obsidian 的真实编辑器，并保留「回到面板」；图片和导图仍打开各自面板。面板的预览/编辑切换只显示当前阶段可用的操作。

**请测试**

1. 选中一段笔记，执行两个选区建卡命令，确认问答卡的问题/答案和填空卡的 `{{c1::...}}` 正确。
2. 复习一张问答卡：在问题面执行「录制答案」应先显示答案再开始录音；再执行一次停止并保存，播放条出现；录音中按评分应提示先停止。
3. 编辑一张旧问答卡并回到面板：草稿里应只有一条 `---`，问题在上、答案在下；预览里短问题紧贴分隔线，长问题最多占一半并滚动。
4. 在浏览页编辑问答/填空卡：应打开真实编辑器，并可以用「回到面板」返回。

## English

This release adds four hotkey-bindable commands, puts recording on the review answer side, and tightens the Q&A draft and preview.

- **Four new commands**: New Q&A card from selection, New cloze card from selection, Record the answer (start/stop), and Edit this card. Bind them in **Settings -> Hotkeys** or run them from the command palette.
- **Record on the answer side**: once a review answer is visible, a compact Record button sits below it. The clip is saved and the player strip refreshes immediately; opening an edit panel first is no longer necessary. Ratings, undo and deck switching are blocked while a recording is running, so a take cannot be lost by flipping the card.
- **One visible divider in Q&A drafts**: the hidden `<!-- fakecard:answer -->` marker is gone. The draft keeps a single `---`, with a blank line above it so `Question` followed by `---` is not parsed as a Markdown heading. Drafts written by older versions still load.
- **Tighter Q&A preview**: the question area now shrinks to its content, capped at half the preview. A long question scrolls inside its own area instead of pushing the answer down.
- **Text cards edit in the real editor**: editing a Q&A or cloze card from Browse now opens Obsidian's editor with a "Back to panel" button; pictures and maps keep their panels. Panel preview/edit controls only show the actions available in the current stage.

**Please test**

1. Select some note text and run both selection commands; check the Q&A fields and the cloze `{{c1::...}}` output.
2. Review a Q&A card: Record the answer on the question side should reveal the answer and start recording; run it again to stop and save, and confirm the player strip appears. Rating while recording should ask you to stop first.
3. Edit an older Q&A card and return to the panel: the draft should contain one `---`, question above and answer below; in preview a short question should sit right above the divider, while a long one should stop at half and scroll.
4. Edit a Q&A or cloze card from Browse: the real editor should open and "Back to panel" should return you to the card.
