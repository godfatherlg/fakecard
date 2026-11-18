# 1.0.28

## 中文

### 导图卡的计时改成和填空卡完全一致

上一版给导图卡单独写了一套算法（洞里的字 + 8 个字符的上下文），导致同一句话在填空卡上是 11 秒、在导图卡上是 19 秒。

现在两者走同一条路径：只统计**这张卡所问的那一组洞里的文字**，不含节点标签，也不含整份大纲。整节点遮罩在语法上本来就是一个洞，因此自动按洞的内容计时；一组洞跨多个节点时按总字数计算。

实测：

| 卡片 | 洞内容 | 建议用时 |
|---|---|---|
| 填空 c1 | 客观规律 | 11 秒 |
| 导图 整节点 c1 | 客观规律 | 11 秒 |
| 导图 词级 c1 | 客观规律 | 11 秒 |
| 导图（正文很长、洞很短） | 核心要求 | 11 秒 |

### 请测试

- 复习一张导图卡与一张内容相同的填空卡：建议用时是否一致
- 一张正文很长、但只挖了两个词的导图卡：用时是否仍在一分钟以内

## English

### A map card is timed exactly like a cloze card

The previous release gave map cards their own formula (the hidden words plus 8 characters of context), so the same sentence took 11 seconds as a cloze card and 19 as a map card.

Both now go through one path: only **the words of the hole group this card asks about** are counted - no node labels, no outline. A whole-node mask is a hole in the syntax, so it is measured by its content; a group spread over several nodes adds up.

Measured:

| Card | Hole | Suggested time |
|---|---|---|
| cloze c1 | 客观规律 | 11s |
| map, whole node c1 | 客观规律 | 11s |
| map, word-level c1 | 客观规律 | 11s |
| map with a long label, short hole | 核心要求 | 11s |

### Please test

- Review a map card and an equivalent cloze card: are the suggested times the same
- A map card whose body is long but only two words are masked: is the budget still under a minute
