# 1.0.10

## 中文

### 修复：重启后复习首屏的内链不渲染

重启 Obsidian 后，如果复习界面是随工作区一起恢复的，首屏卡片里的 `[[双链]]` 和嵌入会显示成不可点击的纯文本；把那张卡翻面再翻回来，或者关掉复习界面重新打开，就正常了。

原因是视图在布局恢复阶段就开始绘制卡片，此刻它在文档里还没挂好，链接那层样式和点击处理还没跟上；而手动打开的视图是在布局就绪后才画的，所以从来碰不到。现在恢复的视图会先显示「Loading…」，等布局就绪再画第一张卡，和手动打开的时序一致。

同时 `onOpen` 不再等待布局，否则整个恢复过程会卡到 Obsidian 的 deferred view 超时（之前那版能看到 `Failed to load deferred view Error: Timeout`）。

### 优化：统计页首次打开更快

卡片文件和复习日志都改成并发读取，统计页只读一次全量日志，「近 90 天」窗口与连击数从同一份内存数据里推导，不再逐天、逐份重复扫盘。冷启动（系统缓存为空）时差别最明显。

### 请测试

- 重启 Obsidian，直接看复习界面首屏卡片里的链接能不能点、有没有链接样式
- 首次进统计页，确认速度与数字都正常
- 手动从侧边栏打开复习界面，确认没有回归

## English

### Fixed: links in the first review card after a restart

When Obsidian started with the review view restored, wiki links and embeds in the first card came out as plain, unclickable text. Flipping the card or reopening the view made them render, because those paths painted the card later.

The view was painting while the workspace was still assembling, before its leaf was attached; Obsidian adds the link styling and click handling after that point. A restored view now shows "Loading…" and paints once the layout is ready, the same timing a manually opened view always had.

`onOpen` no longer waits for that, which previously stalled the whole restore until Obsidian gave up on the view (`Failed to load deferred view Error: Timeout`).

### Faster statistics page

Card files and review logs are read in parallel, the page reads the full history once, and the 90-day window and the streak are derived from that single in-memory map instead of scanning the disk day by day. The gain is largest on a cold start, when the OS cache is empty.

### Please test

- Restart Obsidian and check that links in the first review card are clickable and styled
- Open the statistics page once and confirm it is fast and the numbers are right
- Open the review view from the ribbon and confirm nothing regressed
