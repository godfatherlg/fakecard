# 1.0.16

## 中文

这次没有新功能，只有两处按社区插件评审要求做的调整，行为基本不变。

### 临时笔记改为进回收站

编辑卡片时生成的临时笔记（`fakecard/editing/`），关闭分栏或启动清理时不再直接删除，改为走 Obsidian 的删除流程——会进入回收站，遵循你「删除文件」的设置。以前是绕过这个设置直接抹掉，评审不允许。

### 工具条改用 Obsidian 的 DOM helper

编辑器顶部那条工具条（「填空正文 / 包裹选中 / 新建分组 / 移除挖空」）的创建方式换成 Obsidian 提供的 `createDiv`，不再直接用 `document.createElement`。

### 请测试

- 编辑一张填空卡正文，关闭分栏后 `fakecard/editing/` 应该为空，被替换的文件按你的设置出现在回收站或系统废纸篓
- 工具条外观、位置、按钮行为与之前一致

## English

No new features this time - two changes requested by the community plugin review, with the same behaviour.

### Scratch notes now go to the trash

The temporary note made while editing a card (`fakecard/editing/`) is no longer deleted outright when the split closes or the startup sweep runs: it goes through Obsidian's deletion flow, so it lands in the trash and follows the user's "Deleted files" setting. Before, it bypassed that setting.

### The toolbar uses Obsidian's DOM helper

The bar at the top of the editor ("Cloze text / wrap selection / new group / remove") is now created with Obsidian's `createDiv` instead of `document.createElement`.

### Please test

- Edit a cloze body, close the split: `fakecard/editing/` should be empty, and the replaced file shows up in the trash / system bin according to your setting
- The toolbar looks, sits and behaves exactly as before
