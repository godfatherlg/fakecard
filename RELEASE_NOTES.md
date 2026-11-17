# 1.0.22

## 中文

### 图片：就地缩放，并且记住你放多大

- 卡片里的图片有高度上限：居中布局 62vh、铺满布局 74vh、浏览预览 44vh；问答卡与填空卡正文里的图片同样限高 62vh，一张长截图不再把答案挤出屏幕
- **Ctrl/Cmd + 滚轮**就地缩放（50%–400%），**双击**回到自适应大小；普通滚轮仍然滚动卡片
- 三处是同一套手势：复习界面、浏览视图右栏、卡片正文里的嵌入图片
- 图片遮挡卡的缩放会**存进卡片**（`card.image.zoom`，停手 0.5 秒后写入，回到 100% 时删除该字段），复习和预览都按它渲染；改蒙版不会重置这个值
- 问答卡、填空卡的嵌入图片仍是临时缩放：它们的尺寸属于笔记正文（`![[图片|300]]`），滚一下滚轮就改你的笔记并不合适

### 去掉了单击弹窗

单击图片不再打开放大弹窗——它和“就地缩放”重复，而且很容易误触（想点遮罩、想选文字，结果弹出盖住整个界面的框）。`ImageZoomModal` 及其样式一并删除；需要看大图时，Ctrl+滚轮缩放即可，放大后容器会出现横向滚动条。

### 答题计时

- 按墙钟时间计算：切到别的窗口不再“暂停”，回来就是真实的停留时长
- 位置在「2 / 10」之后，从 0 开始走；胶囊左侧是已用时间，中间是建议用时，右侧 `⟳` 可归零重算
- 分档变色：超过 1 倍转橙、1.5 倍转红、**2 倍定格**（不再计时，等你自己决定继续还是跳过）
- **回答面不再显示**：那是读答案的时间，跟“回想花了多久”无关

### 请测试

- 复习一张图片遮挡卡，Ctrl+滚轮放大到 150%，翻到下一张再翻回来——应保持 150%，且卡片 JSON 里有 `"zoom": 1.5`；双击后该字段消失
- 复习一张带图片的填空卡或问答卡：Ctrl+滚轮同样能放大，双击还原
- 停在问题面等 1 倍、1.5 倍、2 倍时间，看胶囊颜色变化与定格；翻面后胶囊应立即消失
- 浏览视图右栏的图片同样可缩放，且不会写回卡片

## English

### Pictures: zoom in place, and stay that size

- Pictures inside a card are height-capped: 62vh in the centred layout, 74vh wide, 44vh in the browse preview; pictures embedded in a cloze or Q&A card get 62vh too, so a tall screenshot no longer pushes the answer off screen
- **Ctrl/Cmd + wheel** zooms in place (50%–400%), **double-click** fits again, and a plain wheel still scrolls the card
- One gesture everywhere: review, the browse preview, and pictures embedded in card text
- An occlusion card's zoom is **saved on the card** (`card.image.zoom`, written half a second after the wheel stops, removed again at 100%), so review and the preview draw it that size; editing the masks keeps it
- Pictures embedded in cloze/Q&A cards zoom temporarily: their size belongs to the note text (`![[image|300]]`), and a scroll gesture should not rewrite your note

### The click-to-enlarge dialog is gone

A single click on a picture no longer opens a dialog - it duplicated the in-place zoom and was easy to trigger by accident (reaching for a mask or for the text). `ImageZoomModal` and its styles were removed; Ctrl+wheel is the way to read small print, and the container gains a horizontal scrollbar when zoomed.

### Answer-time chip

- Wall-clock time: switching away no longer pauses it, so the number is the real time the card was on screen
- It sits after the `2 / 10` counter and starts at zero: elapsed on the left, the suggested budget next to it, a `⟳` on the right to restart it
- Tiers: orange past 1x, red past 1.5x, and **frozen at 2x** (no more counting - the decision is yours)
- **Not shown on the answer side**: that is reading time, not recall time

### Please test

- Review an occlusion card, Ctrl+wheel to 150%, go to the next card and back - it should still be 150%, and the card JSON should carry `"zoom": 1.5`; double-click clears it
- Review a cloze or Q&A card with a picture: Ctrl+wheel zooms it too, double-click fits
- Stay on the question side past 1x, 1.5x and 2x and watch the chip change colour and freeze; revealing the answer should remove it immediately
- The browse preview zooms as well, and never writes the size back
