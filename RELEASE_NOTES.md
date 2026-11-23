# 1.0.47

## 中文

### 浏览页

- 表格设置**最小宽度 640px**：窗口变窄时不再把每一列挤成「一个字一行」，而是让列表横向滚动
- 正面列保留 220px 并正常换行；类型、牌组、复习、到期等标签列单行显示
- 批量操作后的刷新保持当前页数，只有改搜索词或牌组筛选才回到第一页

### 界面与搜索

- 状态栏标签改为中文：**到期 / 新卡 / 学习中**
- 阅读视图卡片角标的 `aria-label` 也走中文
- 新增 `is:buried` 搜索词：正向筛选已埋藏的卡，`-is:buried` 反向排除
- 清理旧的 `fakecards-*` 类名，统一为 `fakecard-*`，重复的 `paused` 文案合并

### 导图面板

- **修复首开偏右、右侧被裁切**：居中逻辑以前把「挖空」这个行内标签当成定位基准，它没有自己的位置，于是整张图被平移了半个面板。现在会向上找到挖空所在的节点再居中
- 忽略上一轮渲染的延迟定位：重绘已经替换节点后，旧计时器不会再覆盖新视口
- 节点尚未完成 Markdown 渲染时先等待，不再用「宽度为 0」的测量结果定位
- 切换 c1 / c2 / c3 会居中该组真正提问的节点；打开已有卡时按卡片的 `mapGroup` 选中并居中（例如 c2 卡默认打开 c2）
- 首次绘制先隐藏，定位完成后一次显示，不再闪

### 工程

- 每日复习上限抽成纯函数 `dailyReviewLimit()`，队列与状态栏共用，新增 4 个单测
- 测试总数 20，覆盖 cloze / outline / answerTime / childStreak / search / 每日上限
- 官方评审 lint 保持 0

### 请测试

- 把浏览页拖窄：表格是否横向滚动，正面文字是否不再一字一行
- 搜索 `is:buried`：是否只显示埋藏卡；`is:due` 是否排除它们
- 打开一张有 c1/c2 的导图卡：是否按卡片分组打开，且该组节点居中、不再偏右
- 在面板里切换 c1 / c2 / c3：视口是否跳到各自节点
- 打开导图时是否还有闪动

## English

### Browse

- The table keeps a **640px minimum width**: a narrow pane scrolls sideways instead of squeezing every column into a one-character line
- The front column keeps 220px and wraps normally; type, deck, reviews and due stay on one line
- A reload after a bulk action keeps the current page; only changing the query or deck filter goes back to the first page

### UI and search

- Status-bar labels are translated: **Due / New / Learning** in English, 到期 / 新卡 / 学习中 in Chinese
- The note badge's `aria-label` is translated too
- New `is:buried` search term, with `-is:buried` as its negation
- The old `fakecards-*` class family is renamed to `fakecard-*`, and the duplicate `paused` string is gone

### Mind map panel

- **Fixed the first open being shifted right and clipped**: centring used the inline mask span as its reference; that span has no position of its own, so the map was translated by half a pane. It now walks up to the node that holds the mask
- A settle from a render that has already been replaced can no longer overwrite the new view
- If Markdown has not measured the node yet, centring waits instead of using a zero width
- Switching c1 / c2 / c3 centres the node that group actually asks about; opening a card follows its `mapGroup` (a c2 card opens on c2)
- The first paint is hidden until placed, so the map no longer flashes

### Engineering

- The daily review limit is a pure `dailyReviewLimit()` shared by the queue and the status bar, with 4 new tests
- 20 tests across cloze / outline / answerTime / childStreak / search / daily limit
- The official review lint stays at 0

### Please test

- Narrow the browse pane: does the table scroll sideways, and does the front stop wrapping per character
- Search `is:buried`: only buried cards; `is:due` excludes them
- Open a map with c1/c2: does it open on the card's group, centred, without the right side clipped
- Switch c1 / c2 / c3: does the view move to the right node
- Does opening a map still flash
