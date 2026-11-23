# 1.0.45

## 中文

### 评审项修正：`createEl('div')` → `createDiv()`

1.0.44 的评审仍在 `src/hintEditor.ts:27` 报 `prefer-create-el`，但那一行已经是 `createEl`。查过规则实现后确认：这条规则不只检查 `document.createElement`，也会把**带 `div` / `span` 标签参数的 `createEl`** 视为可替换调用（`createEl('div')` 应写成 `createDiv()`，`createEl('span')` 应写成 `createSpan()`）。所以它报的是"这一行还能再简化"，文案却仍写着 `document.createElement`。

- 容器改用 `createDiv({ cls: ... })`
- 全仓已无 `createEl('div' | 'span')`
- 外观和行为不变

### 请测试

- 点挖空打开注释框：位置、输入、删除挖空是否都正常

## English

### Review fix: `createEl('div')` → `createDiv()`

The 1.0.44 review still pointed at `src/hintEditor.ts:27`, a line that was already `createEl`. The rule also treats `createEl` with a `div` or `span` tag as replaceable (`createEl('div')` → `createDiv()`, `createEl('span')` → `createSpan()`), while the message keeps naming `document.createElement`.

- The container uses `createDiv({ cls: ... })`
- No `createEl('div' | 'span')` remains in the source
- No visible change

### Please test

- Click a mask to open the note field: position, typing and Remove mask should all work as before
