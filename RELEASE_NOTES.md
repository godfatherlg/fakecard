# 1.0.23

## 中文

### 图片遮挡卡的答题时间按面积估算

以前图片卡的“建议用时”只有底数 10 秒——遮罩画多大都一样，因为那张卡没有文字可量。现在改为读**遮罩面积**：

```
等价字数 = 本组遮罩的并集面积占整图的比例 × 整图基准(默认 200 字) + 3 字 × 遮罩个数
预算     = 基础秒数 + 等价字数/40 × 每 40 字秒数，再乘历史系数
```

- **只算这张卡所问的那一组遮罩**，其他组不计入
- 面积用 20×20 网格采样求并集，重叠的遮罩不会被重复计算；椭圆按椭圆判定
- 每个遮罩额外记 3 字，代表逐个定位的注意力成本
- 用库里真实卡片验算：覆盖 56% 的卡从 10 秒变为 44 秒，覆盖 7% 的从 10 秒变为 18 秒

设置 → 复习界面 新增一项：

- **图片遮挡：整张图折合多少字**（默认 200，范围 50–2000）

调大它，所有图片遮挡卡的预估时间按比例变长；问答卡、填空卡的计算方式不变。

### 请测试

- 复习一张图片遮挡卡，等过建议用时，胶囊的 tooltip 里的“建议用时”是否与遮罩面积成比例（大面积 → 更长）
- 在设置里把“整张图折合多少字”改成 400，再重载复习界面，同一张卡的预算应大约翻倍

## English

### Occlusion cards estimate their answer time from the masked area

An image card used to get the bare 10-second base - a big mask and a small one were worth the same, because there is no text to measure. It now reads the **area of the boxes**:

```
characters = union area of this group's boxes / whole picture × characters per full image (200) + 3 per box
budget     = base seconds + characters/40 × seconds per 40 characters, times the history factor
```

- **Only the group this card asks** counts; other groups are not part of the answer
- The area is a union sampled on a 20×20 grid, so overlapping boxes are not counted twice; ellipses are tested as ellipses
- Each box adds 3 characters for the cost of finding the next one
- Measured on the library: a card covered 56% goes from 10s to 44s, one covered 7% from 10s to 18s

Settings → Review screen gains one item:

- **Masked picture: characters per full image** (default 200, range 50–2000)

Raising it lengthens the estimate of every occlusion card proportionally; Q&A and cloze cards are unchanged.

### Please test

- Review an occlusion card and pass its suggested time: the budget in the chip's tooltip should track the masked area (more area, more time)
- Set "characters per full image" to 400, reload review, and the same card's budget should roughly double
