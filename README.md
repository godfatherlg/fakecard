# fakecard

在 Obsidian 里从笔记生成间隔重复卡片，卡片独立存放在 vault 的 `fakecard/` 文件夹，**不修改你的笔记**。

Spaced-repetition flashcards for Obsidian, built from your notes and stored as plain JSON in their own folder. Notes are never modified.

## English

**fakecard** turns your notes into spaced-repetition flashcards inside Obsidian. Cards live as plain JSON in a `fakecard/` folder in your vault; your notes are only ever read, never edited.

Features:

- Three ways to create cards: rules over a note, a manual editing panel, or JSON from any external tool
- Q&A, cloze (Anki `{{c1::...}}` syntax) and image-occlusion cards
- FSRS scheduling (`ts-fsrs`) with four grades
- Daily queue: due cards first, with separate caps for new cards and reviews
- Multi-group cloze and image cards, every group scheduled on its own
- Child cards: a card you keep failing offers to build a simpler stand-in from its own text (Hard adds 1 point, Again adds the configured score); the parent is paused only once the child exists and comes back when every child graduates
- Exam plans: several countdowns at once, each with ticked decks and a share, plus a live "cards per day" estimate before you build
- Statistics: today, rating distribution, true retention, maturity, heatmap, due forecast, hard cards
- Anki import (`.apkg`): basic, cloze and image-occlusion notes plus their media
- Read-only towards your notes: any card can jump back to the exact spot it came from

Install:

1. Community plugins: Settings -> Community plugins -> Browse -> search `fakecard`, or open its [community directory page](https://community.obsidian.md/plugins/fakecard)
2. Manual: download `main.js`, `manifest.json` and `styles.css` from [Releases](https://github.com/godfatherlg/fakecard/releases) into `<vault>/.obsidian/plugins/fakecard/`, then enable the plugin

Quick start:

1. Put a `*` marker in a heading (`## Ginkgo biloba *`); the heading is the question and the text below it is the answer. Run **Generate Q&A cards from the whole note**.
2. Highlight text inside a list block; every `==highlight==` becomes a cloze deletion. Run **Generate cloze cards from the whole note**.
3. The ribbon icon opens **Statistics**, which links to **Browse** and **Review** the way the True Recall dashboard does; grade with Again / Hard / Good / Easy (space bar shows the answer).

The settings tab follows the Obsidian language and switches between English and Chinese automatically.

Browse & filter (**Browse and edit cards**): search box, quick filters, table and preview. Terms are separated by spaces and every one of them has to match; `-` excludes a term; wrap a value in `"` when it contains a space. The `⌄` button in the box inserts a term for you.

| Term | Meaning |
|---|---|
| `deck:x` / `tag:x` / `type:qa` | deck (contains) / tag (exact) / type `qa` `cloze` `image` `map` |
| `is:new` `is:learning` `is:review` `is:relearning` `is:due` | FSRS state |
| `is:child` `is:paused` `is:graduated` `is:orphan` | child / suspended / graduated / source note gone |
| `added:7` `rated:7` | created / reviewed within N days (`rated:1` = today) |
| `prop:due<7` `prop:ivl>=21` `prop:difficulty>=7` `prop:reps>5` `prop:lapses>0` | due days / interval / FSRS difficulty / reviews / lapses |
| `front:x` `back:x` | one field only |
| `-tag:x` | exclusion |
| plain words | full text (front, back, tags, source path) |

Examples:

```text
deck:方剂 tag:麻黄 is:due      in the 方剂 deck, tagged 麻黄, due today
tag:针灸 -is:paused            tagged 针灸 and not suspended
type:cloze front:桂枝 back:芍药
prop:due<7 prop:ivl>=21        due within a week, interval already 21+ days
added:7 rated:1                added this week, reviewed today
```

Data and privacy: cards are stored in `fakecard/cards/`, review logs in `fakecard/reviews/`, backups in `fakecard/backup/`. Everything is local and the plugin makes no network requests. The system clipboard is read only when you run one of the import commands that takes cards from it, and the plugin never writes to it.

The rest of this document is in Chinese.

---

## 功能

- **三种制卡方式**：规则批量生成、手动编辑面板、外部 AI / 工具导入
- **问答、挖空、图片蒙板** 三种卡片类型
- **FSRS** 调度（`ts-fsrs`），四档评分
- **每日队列**：到期优先 + 新卡/复习双上限
- **多组卡片**：一张挖空/图片卡按组拆分，每组独立调度
- **子卡**：卡住了就拆成更简单的替身，全部毕业父卡自动恢复
- **考试计划**：可建多个倒计时，勾选牌组 + 比例，生成前先看到每天多少张
- **统计**：今日、评分分布、真实保持率、成熟度、热力图、到期预测、难卡
- **Anki 导入**（`.apkg`）：Basic / Cloze / 图片蒙板 + 媒体文件
- **读而不写**：卡片可跳回原笔记位置（按内容实时定位），阅读模式显示来源徽标

## 安装

### 社区插件

设置 → 第三方插件 → 浏览 → 搜索 `fakecard`，或直接打开[社区目录页](https://community.obsidian.md/plugins/fakecard)。

列表里暂时搜不到时重启一次 Obsidian：客户端会缓存插件清单，新上架的条目需要重新拉取后才会出现。

### 手动安装

1. 从 [Releases](https://github.com/godfatherlg/fakecard/releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 放到 `<vault>/.obsidian/plugins/fakecard/`
3. 重启 Obsidian，在第三方插件里启用

## 快速开始

### 1. 用标记批量生成

问答卡：标题里带标记（默认 `*`，可在设置改）就是一张卡，标题是问题，标题下面是答案。

```markdown
## 小青龙汤 *

组成：麻黄、桂枝、芍药、细辛、干姜、炙甘草、半夏、五味子
```

挖空卡：**一个列表块**一张卡，`==高亮==` 变成挖空（整块默认一组）。

```markdown
- 解表剂：==麻黄==、桂枝
- 主治：==外感风寒==
```

然后：

- 命令 **Generate Q&A cards from the whole note**
- 命令 **Generate cloze cards from the whole note**
- 或右键文件 → **fakecard: generate Q&A / cloze cards**
- 或选中几行后 **Generate cards from the selected lines**

会先弹出预览，勾选后才写入卡片库。

### 2. 手动面板

命令 **New card (manual)** → 选类型：

| 类型 | 面板 |
|---|---|
| Q&A | 问题 / 答案两个框（随内容自适应高度） |
| Cloze | Anki 格式 `{{c1::挖空}}`、`{{c1::挖空::注释}}`，`New group` 造 c2/c3，选中文字 `Wrap` |
| 图片蒙板 | 画矩形/椭圆，分组，缩放平移，键盘微调 |

### 3. 外部 AI

插件**不内置任何模型**。任何工具按下面的格式输出，就能把卡片推进来：

```
obsidian://fakecard?data=<URL 编码的 JSON>
```

或命令 **Import cards from clipboard (JSON)**。

```json
[
  { "type": "qa", "front": "问题", "back": "答案" },
  { "type": "cloze", "clozeText": "{{c1::挖空}} 其余文字" }
]
```

可选字段：`sourcePath`（关联笔记）、`sourceText`（定位片段）。`==高亮==` 也会自动转成挖空。

## 入口与导航

左侧 ribbon 图标打开**统计**界面，页面顶部一行 `Statistics / Browse / Review` 在三个界面之间切换（已有同名标签会直接跳过去，不会开一堆标签）。命令面板里也可以单独打开任意一个：**Open statistics** / **Browse and edit cards** / **Start reviewing**。

## 复习

命令 **Start reviewing** 或统计页顶部的 **Review** → 主区域打开复习界面。

- 问答卡：问题 → Show answer → 答案
- 挖空/图片卡：**原地揭示**，没有单独的答案块
- 四档评分：Again / Hard / Good / Easy
- 空格键显示答案
- 工具栏：牌组筛选、进度、考试倒计时、`+ Child`、`↗ Source`、`✎ Edit`
- 建议时长：卡片**超过**建议时间后才显示「已用 / 建议」，提前显示反而变成计时压力；切到别的窗口的时间不计入
- 建议用时怎么算：`一遍 × 记忆遍数 + 首遍（基础 + 同样按字数增加）`，一遍 = `基础秒数 + 答案字数 ÷ 40 × 每段秒数`。作答权重默认 −20%（越难给得越少，防纠结），记忆权重默认 +20%（越难给得越多），两者可分别设置。默认 3 遍、首遍基础 20 秒；挖空/导图只算被遮的字，图片卡按遮罩面积折算
- 问题面和答案面用同一个胶囊：问题面上方是实时计时 `作答 0:28 / 1:10`，揭示后同一个胶囊冻结成 `记忆 0:28 / 1:10`；两边都有 ↻ 重新计时
- 超时记分：超过预算后每多 0.5 倍（步长可调）记 0.5 个 Hard（每步分数可调），也就是 1.5 倍记 0.5、2 倍记 1；这些分数进子卡的失败连击，用来点亮「建子卡」。每步分数设为 0 就只显示时间、不计分
- 建子卡：Hard 记 1 分、Again 按设置记分（默认 2），累计到阈值（默认 4）时评分栏上方出现「Card keeps failing - build a child card」，可选 Q&A 或挖空子卡，内容从父卡预填；**子卡真的保存后**父卡才挂起，取消面板不会留下挂着的父卡

## 浏览与筛选

命令 **Browse and edit cards** → 主区域标签：搜索框 + 快捷筛选 + 表格 + 右侧预览。

搜索语法：空格分隔多个条件，**全部满足**才命中（AND）；`-` 取反；值里有空格时用 `"` 包起来。搜索框左侧的 `⌄` 按钮可以直接插入条件，不用背。

| 语法 | 含义 |
|---|---|
| `deck:方剂` / `tag:麻黄` / `type:qa` | 牌组（包含即可）/ 标签（完全相同）/ 类型 `qa` `cloze` `image` `map` |
| `is:new` `is:learning` `is:review` `is:relearning` | FSRS 状态 |
| `is:due` | 已到期 |
| `is:child` `is:paused` `is:graduated` | 子卡 / 挂起父卡 / 已毕业 |
| `is:orphan` | 来源笔记已删除 |
| `added:7` | 7 天内创建 |
| `rated:7` | 7 天内复习过（`rated:1` = 今天） |
| `prop:due<7` `prop:ivl>=21` `prop:difficulty>=7` | 到期天数 / 间隔 / FSRS 难度（1–10） |
| `prop:reps>5` `prop:lapses>0` | 复习次数 / 遗忘次数 |
| `front:x` `back:x` | 只在问题 / 答案里找 |
| `-tag:x` | 排除 |
| 普通词 | 全文（问题、答案、标签、来源路径） |

组合示例：

- `deck:方剂 tag:麻黄 is:due` —— 方剂牌组里、带麻黄标签、今天到期
- `tag:针灸 -is:paused` —— 有针灸标签且没有被挂起
- `type:cloze front:桂枝 back:芍药` —— 挖空卡，问题含桂枝、答案含芍药
- `prop:due<7 prop:ivl>=21` —— 一周内到期、间隔已≥21 天
- `added:7 rated:1` —— 一周内新建、今天复习过

支持批量勾选 → 移动牌组 / 暂停 / 删除。

## 图片蒙板

- **Alt + 点击**编辑器里的图片 → 打开蒙版面板（可在设置关闭）
- **右键图片** → Obsidian 原生菜单保持不变
- 命令 **Make occlusion card from the image at the cursor**（光标放在 `![[图片]]` 行）
- 命令 **New image occlusion card (from clipboard)**（先复制截图）

编辑面板：矩形/椭圆、多遮罩组、缩放（`+`/`-`/Ctrl+滚轮）、平移、方向键微调、Ctrl+Z 撤销。保存时**每组一张卡**。

## 考试计划

设置 → **考试计划** 里可以同时建**多个计划**（一科一个），每个计划有自己的名称、剩余天数、牌组和比例：

- **还有多久考试**填天数（默认 30，填 0 表示今天考），不用填日期；数字每天自动递减，考完当天该计划自动消失
- **牌组**是勾选，一个都不勾 = 全部牌组
- 比例滑块下方实时显示这个计划会产生的负荷：`≈ 每天 N 张，共 D 天`，以及「选中的 X 张里有 Y 张排在考试之后」（超过每日上限会变红提示）
- 点计划上的 **生成** 按钮，或命令 **Build an exam plan**（有多个计划时会让你选一个）
- 只统计该计划牌组里未挂起、未毕业的卡，**按难度从高到低**排序后取比例部分
- 到期日在考试之后的卡，会被均匀铺到考前每一天，**不超过每日复习上限**
- 生成前自动备份到 `fakecard/backup/exam-plan-<id>-<时间>.json`
- **考试当天过后计划自动移除**，卡片回到正常 FSRS 调度，数据全部保留

## 数据与隐私

- 卡片：`fakecard/cards/<id>.json`（纯 JSON，可手改）
- 牌组：`fakecard/decks.json`
- 复习记录：`fakecard/reviews/YYYY-MM-DD.json`
- 备份/导出：`fakecard/backup/`、`fakecard/export/`
- 导入的图片：`fakecard/images/`

**全部本地，没有任何网络请求**。插件不写你的笔记文件；阅读模式里的 📇 是渲染时插入的 DOM，不落盘。

## 命令

| 命令 | 作用 |
|---|---|
| Generate cards from the whole note | 整篇按规则生成 |
| Generate from the selected lines | 只处理选中行 |
| New card (manual) | 手动面板 |
| Start reviewing | 复习 |
| Browse and edit cards | 浏览/筛选/编辑 |
| Open statistics | 统计 |
| Import cards from Anki (.apkg) | Anki 导入 |
| Import cards from clipboard (JSON) | 外部 JSON 导入 |
| Export all cards (JSON) | 导出 |
| Clean up orphan cards | 清理来源已删的卡 |
| Remove graduated child cards | 清理已毕业子卡 |
| Build an exam plan | 生成考试计划（多个计划时选择） |
| Make occlusion card from the image at the cursor | 光标处图片制卡 |

## 第三方

| 依赖 | 许可 | 用途 |
|---|---|---|
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | MIT | FSRS 调度 |
| [fflate](https://github.com/101arrowz/fflate) | MIT | .apkg zip 解压 |
| [fzstd](https://github.com/101arrowz/fzstd) | MIT | .apkg zstd 解压 |
| [sql.js](https://github.com/sql-js/sql.js) | MIT | 读取 Anki 的 SQLite |

## 开发

```bash
npm install
npm run dev     # 监听构建
npm run build   # 类型检查 + 生产构建
```

把 `main.js`、`manifest.json`、`styles.css` 复制到 `<vault>/.obsidian/plugins/fakecard/`。

## License

MIT
