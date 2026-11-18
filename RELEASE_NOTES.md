# 1.0.33

## 中文

### 修复：浏览页搜索框按空格之后输不进去

浏览页每敲一个字符都会整块重绘，搜索框的 DOM 节点被删掉重建。旧代码虽然用 `focus()` 把焦点塞回去，但每换一个节点就会丢光标、丢选区，也会打断中文输入法的组合——空格正是上屏键，所以一到空格就表现为「输入结束」，之后再也敲不进去。

现在工具栏和搜索框只创建一次，按键只重绘下面的结果区（快捷筛选、批量按钮、表格、预览、补全列表）：

- 空格、多条件查询（`deck:方剂 tag:麻黄 is:due`）都能正常输入
- 光标停在敲字的位置，不会每次按键跳到末尾
- 中文输入法：拼音组合不再被打断，空格上屏正常
- 从 `⌄` 菜单插入条件、点快捷筛选时，光标落到插入内容的末尾

顺带：牌组下拉的选项会在卡片库变化时重建，新建牌组不必重开标签页。

### 说明：多条件搜索语法

README 中英文两段都补上了完整的筛选语法表，并加了组合示例（`deck:x tag:y is:due`、`tag:x -is:paused`、`prop:due<7 prop:ivl>=21`、`added:7 rated:1` 等），同时说明空格 = AND、`-` 取反、带空格的值用 `"` 包起来。

### 请测试

- 在搜索框输入 `deck:xxx tag:yyy is:due`：空格能否连续输入、光标是否停在原处
- 用中文输入法打中文再按空格上屏，能否继续输入
- 点 `⌄` 插入条件、点快捷筛选 chip：搜索框内容与光标是否正确
- 勾选多张卡：批量移动 / 暂停 / 删除按钮是否照常出现，排版有没有变
- 牌组下拉是否列出全部牌组；新建牌组后是否出现

## English

### Fixed: the browse search box stopped accepting input after a space

Every keystroke repainted the whole Browse view, so the search field was torn down and rebuilt. The old code called `focus()` on the replacement, but a new node still loses the caret and the selection, and it cuts an input method's composition short - and the space bar is the key that commits a Chinese candidate. Typing therefore ended at the first space.

The toolbar and the field are now built once; a keystroke only repaints what sits below it (quick filters, batch buttons, table, preview, completion list):

- Spaces and multi-term queries such as `deck:方剂 tag:麻黄 is:due` type normally
- The caret stays where you typed instead of jumping to the end on every key
- Chinese input methods keep their composition; the space bar commits as usual
- Inserting a term from the `⌄` menu or clicking a quick filter puts the caret after the inserted text

Also: the deck dropdown is rebuilt when the card library changes, so a new deck shows up without reopening the tab.

### Docs: multi-term search syntax

Both the Chinese and the English part of the README now carry the full filter table plus combination examples (`deck:x tag:y is:due`, `tag:x -is:paused`, `prop:due<7 prop:ivl>=21`, `added:7 rated:1`), and state that spaces mean AND, `-` negates and a value with spaces goes in quotes.

### Please test

- Type `deck:xxx tag:yyy is:due` in the search box: do the spaces go in, does the caret stay put
- Type Chinese with an input method and press space to commit, then keep typing
- Insert a term from the `⌄` menu, click a quick filter: is the field content and caret right
- Tick several cards: do the batch move / pause / delete buttons still appear, is the layout unchanged
- Does the deck dropdown list every deck, including one created just now
