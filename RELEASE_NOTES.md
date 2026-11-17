# 1.0.20

## 中文

### 浏览视图：搜索会补全，也能从菜单里挑

搜索框现在认识自己的语法：

- 打 `de` → 提示 `deck:`；打 `deck:` → 列出牌组；打 `deck:科` → 只剩「科二」
- `is:` → new / due / learning / review / relearning / child / paused / graduated / orphan，右侧附中文含义
- `tag:` → 库里出现过的标签；`type:` → qa / cloze / image
- `prop:due` → `<`、`<=`、`>`、`>=`；再往后 → 1 / 7 / 30 / 90
- `-tag:` 这类负向条件同样补全，带空格的牌组名自动加引号
- `↑↓` 选择、`Tab`/`Enter` 采用、`Esc` 关闭；`front:` / `back:` 后面是自由文本，不打扰

搜索框左侧新增 `⌄` 菜单，按用途列出同一批条件（仅题目 / 仅答案、七个状态、三种类型、每个牌组、每个标签、到期 / 间隔 / 难度 / 添加时间 / 复习时间）。选中只往框里插入文本，可以继续手工修改——不是切换成“某种模式”。

### 修复：搜索框每输入一次就丢光标

浏览视图每次输入都会重绘整页，输入框随之被重建。现在会记录焦点与光标位置，重绘后放回去，连续打字不再中断。

### 请测试

- 在搜索框输入 `is:du`，看候选是否出现、按回车是否补成 `is:due`
- 输入 `deck:`，候选里是否列出你的牌组
- 点 `⌄`，选「已暂停 is:paused」，再看列表是否只剩暂停的卡
- 输入一段较长的搜索词，确认光标不会跳到开头

## English

### Browse: the search box completes, and a menu lists the terms

The box knows its own syntax now:

- Typing `de` suggests `deck:`; `deck:` lists your decks; `deck:Cor` narrows to the matching one
- `is:` → new / due / learning / review / relearning / child / paused / graduated / orphan, each with a one-line explanation
- `tag:` → tags used in the library; `type:` → qa / cloze / image
- `prop:due` → `<`, `<=`, `>`, `>=`, and then 1 / 7 / 30 / 90
- Negated terms (`-tag:`) complete the same way, and deck names with spaces are quoted for you
- `↑↓` moves, `Tab`/`Enter` accepts, `Esc` closes; `front:` and `back:` take free text and stay quiet

A `⌄` menu on the left of the field lists the same terms by purpose (question only / answer only, the seven states, three types, every deck, every tag, due / interval / difficulty / added / reviewed). Choosing one only inserts text, so the query stays editable by hand - it does not switch the box into a mode.

### Fixed: the caret no longer jumps out of the search box

The view repaints on every keystroke, which replaced the input. Focus and caret position are now restored after the repaint, so typing is continuous.

### Please test

- Type `is:du` and check the suggestion appears and Enter completes it to `is:due`
- Type `deck:` and check your decks are listed
- Open `⌄`, pick "Paused is:paused", and check only paused cards remain
- Type a longer query and confirm the caret does not jump to the start
