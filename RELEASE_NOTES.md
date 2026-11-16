# 1.0.17

## 中文

### 修复：「更新说明」永远不会弹出

触发条件里，`lastSeenVersion` 为空被当成「全新安装」。但设置文件如果是在这个功能之前写的，它本来就没有这个字段——于是永远为空、永远被当成新安装、永远不弹，也不会把值写回去，形成死锁。凡是装过旧版本的库，这个功能等于一直关着。

现在区分两种情况：

- **设置文件存在但没有版本号** → 视为一次升级，弹出当前版本的说明，并把版本号写回去
- **真正的全新安装**（没有设置文件）→ 仍然静默，不给新用户看历史更新

### 请测试

- 如果之前一直没弹过：重载插件，约 1.5 秒后应看到本次说明
- 之后再重载不应重复弹出（`data.json` 里的 `lastSeenVersion` 会等于当前版本）
- 想再验一次：把 `lastSeenVersion` 改成任意旧版本号，重载即可

## English

### Fixed: the "what is new" dialog could never appear

An empty `lastSeenVersion` was read as "fresh install". A settings file written before that field existed is empty by definition - so it stayed empty, looked like a new install every time, never showed the notes and never wrote the version back. For any vault that had the plugin before the feature, the dialog was effectively off for good.

The two cases are now told apart:

- **A settings file without a version** counts as an upgrade: the notes for the current version are shown and the version is stored
- **A real fresh install** (no settings file) stays quiet, so new users are not shown release history

### Please test

- If you never saw one: reload the plugin and, about 1.5 s later, the notes should appear
- Reloading again must not repeat it (`lastSeenVersion` in `data.json` now equals the running version)
- To try it again: set `lastSeenVersion` to any older version and reload
