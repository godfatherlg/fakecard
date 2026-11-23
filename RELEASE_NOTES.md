# 1.0.48

## 中文

### 保存失败不再“假装成功”

- 卡片的保存/删除现在明确返回成功或失败，失败时不会再继续关闭面板或推进流程
- 问答、填空、导图面板保存失败会**保留面板和已填内容**，可以直接重试
- 评分保存失败会恢复卡片并停留在当前卡，不会翻页或写一条没成功的复习记录
- 填空/导图的整组同步（新增组、删除组、牌组和标签）失败时同样中止，不会只写了一半就关窗
- 导入、批量暂停/埋藏/移动/删除、孤儿卡/毕业卡清理都按**实际成功数量**提示
- 失败提示做了节流：一次导入坏了很多文件，不会弹出几十条 Notice

### 复习日志缓存

- 解析过的日文件保存在内存里，评分、状态栏、统计反复读取同一天时不再重复读盘和 JSON.parse
- `append` / `appendMany` / `remove` 写完同步更新缓存；批量导入仍按 `cardId + at` 去重
- 读不出来的日志文件**不会进入缓存**，之后追加时仍会先隔离坏文件
- 「重建索引」会一并清空日志缓存

### 发布工具（不影响插件功能）

- `release.ps1` 新增 `-NoWait`：推送 tag 后立即返回，发布在后台进行
- 资产下载最多等 45 秒，超时不再无限挂起
- 测试库直接从已验证的主库复制，避免第二次网络下载

### 请测试

- 新建问答/填空/导图卡：保存后面板是否正常关闭
- 正常评分：是否照常翻页、状态栏数字更新
- 导入一份 JSON 或 APKG：提示数量是否与实际写入一致
- 大批量暂停/埋藏/删除：提示数量是否正确

## English

### A failed save no longer pretends to succeed

- `save` and `remove` return success/failure; a failed write stops the action instead of closing over it
- The Q&A, cloze and map panels **stay open with the content** when the card could not be written, so it can be retried
- A failed rating save restores the card and stays on it; no review is logged for a write that did not happen
- Cloze/map group sync (new groups, removed groups, deck and tags) aborts on failure instead of closing over a half-written group
- Imports, bulk pause/bury/move/delete and orphan/graduated cleanup report the number that actually succeeded
- Failure notices are throttled, so a broken import cannot flood the screen

### Review log cache

- Parsed day files stay in memory for the session; rating, status bar and stats no longer re-read and re-parse the same day
- `append`, `appendMany` and `remove` update the cache after the write; batch import still deduplicates by `cardId + at`
- An unreadable file is deliberately not cached, so a later append can still quarantine it
- Rebuild index clears the review cache too

### Release tooling (not part of the plugin)

- `release.ps1 -NoWait` returns right after the tag is pushed
- Asset downloads have a 45s limit instead of hanging
- The test vault is copied from the verified main vault instead of downloading twice

### Please test

- Create Q&A / cloze / map cards: does the panel close after a successful save
- Rate a card: does it advance and update the status bar
- Import JSON or APKG: does the reported count match what was written
- Bulk pause/bury/delete: is the count correct
