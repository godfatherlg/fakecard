# 1.0.11

## 中文

### 修复：重启后复习界面「闪一下」

重启 Obsidian 后，复习界面会先短暂露出一块「Loading…」占位，紧接着整张卡替换上去，看起来就是闪一下。

那段窗口里窗格还在组装，占位其实没有读者；等能看见它的时候，卡片只差一瞬——占位唯一的作用就是被卡片替换。现在布局就绪前不再绘制任何东西，窗格保持空白，卡片出现即是最终状态，和 Obsidian 其它延迟加载的视图一致。

### 优化：等布局的那两秒先读队列

读卡片队列本来就不依赖布局，现在恢复中的视图在等布局的同时就开始读，布局一就绪直接同步绘制。磁盘空闲时卡片会和其余界面同帧出现，不再晚一步补上来。

### 补上上一版漏掉的说明

1.0.10 的「更新说明」弹窗因为版本号没同步而没有弹出，这次一并补上那两版的改动：重启后首屏卡片的内链不再变成不可点击的纯文本；统计页首次打开更快（卡片文件与复习日志并发读取，只扫一次全量日志）。

### 请测试

- 重启 Obsidian，确认复习界面开场不再有「占位换成整张卡」，卡片直接出现
- 首屏卡片里的 `[[双链]]` 仍然可点、有链接样式（1.0.10 修的，不要回归）
- 手动从侧边栏打开复习界面，确认没有回归

## English

### Fixed: the review view flashing on startup

When Obsidian started, the review view briefly showed a "Loading…" placeholder and the whole card then replaced it - a visible flash.

The pane is still being assembled during that window, so the placeholder has no reader; by the time it is visible the card is a moment away, which makes the placeholder nothing but a thing to be replaced. Nothing is painted before the layout is ready now: the pane stays empty and the card is the first and final state, like any other deferred view in Obsidian.

### The queue is read while the layout is still loading

Reading the card queue never depended on the layout, so a restored view now starts it while it waits, and paints straight away once the layout is ready. When the disk is idle the card lands in the same frame as the rest of the workspace instead of a step behind it.

### Notes that the previous release never showed

The 1.0.10 "what is new" dialog was skipped because its version constant was not updated, so the changes from those two releases are listed here as well: wiki links in the first card after a restart are clickable again, and the statistics page opens faster (card files and review logs are read in parallel, and the full history is read once).

### Please test

- Restart Obsidian and confirm the review view no longer swaps a placeholder for the card - the card simply appears
- Check that wiki links in the first card are still clickable and styled (fixed in 1.0.10, must not regress)
- Open the review view from the ribbon and confirm nothing regressed
