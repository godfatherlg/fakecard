# fakecard

在 Obsidian 里从笔记生成间隔重复卡片，卡片独立存放在 vault 的 `Fake Cards/` 文件夹，**不修改你的笔记**。

Spaced-repetition flashcards for Obsidian, built from your notes and stored as plain JSON in their own folder. Notes are never modified.

## English

**fakecard** turns your notes into spaced-repetition flashcards inside Obsidian. Cards live as plain JSON in a `Fake Cards/` folder in your vault; your notes are only ever read, never edited.

Features:

- Three ways to create cards: rules over a note, a manual editing panel, or JSON from any external tool
- Q&A, cloze (Anki `{{c1::...}}` syntax) and image-occlusion cards
- FSRS scheduling (`ts-fsrs`) with four grades
- Daily queue: due cards first, with separate caps for new cards and reviews
- Multi-group cloze and image cards, every group scheduled on its own
- Child cards: a card you keep failing is paused and studied through easier stand-ins; the parent comes back once they graduate
- Exam plan: spreads the selected cards over the days before an exam, hardest first
- Statistics: today, rating distribution, true retention, maturity, heatmap, due forecast, hard cards
- Anki import (`.apkg`): basic, cloze and image-occlusion notes plus their media
- Read-only towards your notes: any card can jump back to the exact spot it came from

Install:

1. Community plugins: Settings -> Community plugins -> Browse -> search `fakecard` (submission pending)
2. Manual: download `main.js`, `manifest.json` and `styles.css` from [Releases](https://github.com/godfatherlg/fakecard/releases) into `<vault>/.obsidian/plugins/fakecard/`, then enable the plugin

Quick start:

1. Put a `*` marker in a heading (`## Ginkgo biloba *`); the heading is the question and the text below it is the answer. Run **Generate Q&A cards from the whole note**.
2. Highlight text inside a list block; every `==highlight==` becomes a cloze deletion. Run **Generate cloze cards from the whole note**.
3. Review with **Start reviewing** or the ribbon icon; grade with Again / Hard / Good / Easy (space bar shows the answer).

The settings tab follows the Obsidian language and switches between English and Chinese automatically.

Data and privacy: cards are stored in `Fake Cards/cards/`, review logs in `Fake Cards/reviews/`, backups in `Fake Cards/backup/`. Everything is local and the plugin makes no network requests. The system clipboard is read only when you run one of the import commands that takes cards from it, and the plugin never writes to it.

The rest of this document is in Chinese.

---

## 功能

- **三种制卡方式**：规则批量生成、手动编辑面板、外部 AI / 工具导入
- **问答、挖空、图片蒙板** 三种卡片类型
- **FSRS** 调度（`ts-fsrs`），四档评分
- **每日队列**：到期优先 + 新卡/复习双上限
- **多组卡片**：一张挖空/图片卡按组拆分，每组独立调度
- **子卡**：卡住了就拆成更简单的替身，全部毕业父卡自动恢复
- **考试计划**：按难度排序，把卡片均匀铺到考试前的每一天
- **统计**：今日、评分分布、真实保持率、成熟度、热力图、到期预测、难卡
- **Anki 导入**（`.apkg`）：Basic / Cloze / 图片蒙板 + 媒体文件
- **读而不写**：卡片可跳回原笔记位置（按内容实时定位），阅读模式显示来源徽标

## 安装

### 社区插件（提交审核中）

上架后：设置 → 第三方插件 → 浏览 → 搜索 `fakecard`。

提交方式是 Obsidian 的社区目录（<https://community.obsidian.md>），不再是 GitHub PR。

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

## 复习

命令 **Start reviewing** 或左侧 ribbon 图标 → 主区域打开复习界面。

- 问答卡：问题 → Show answer → 答案
- 挖空/图片卡：**原地揭示**，没有单独的答案块
- 四档评分：Again / Hard / Good / Easy
- 空格键显示答案
- 工具栏：牌组筛选、进度、建议答题时长、考试倒计时、`+ Child`、`↗ Source`、`✎ Edit`

## 浏览与筛选

命令 **Browse and edit cards** → 主区域标签：搜索框 + 快捷筛选 + 表格 + 右侧预览。

搜索语法（空格分隔 = AND）：

| 语法 | 含义 |
|---|---|
| `deck:方剂` / `tag:麻黄` / `type:qa` | 牌组 / 标签 / 类型 |
| `is:new` `is:learning` `is:review` `is:relearning` | FSRS 状态 |
| `is:due` | 已到期 |
| `is:child` `is:paused` `is:graduated` | 子卡 / 挂起父卡 / 已毕业 |
| `is:orphan` | 来源笔记已删除 |
| `added:7` | 7 天内创建 |
| `rated:7` | 7 天内复习过 |
| `prop:due<7` `prop:ivl>=21` `prop:difficulty>=7` | 到期 / 间隔 / 难度 |
| `front:x` `back:x` | 字段搜索 |
| `-tag:x` | 排除 |
| 普通词 | 全文 |

支持批量勾选 → 移动牌组 / 删除。

## 图片蒙板

- **Alt + 点击**编辑器里的图片 → 打开蒙版面板（可在设置关闭）
- **右键图片** → Obsidian 原生菜单保持不变
- 命令 **Make occlusion card from the image at the cursor**（光标放在 `![[图片]]` 行）
- 命令 **New image occlusion card (from clipboard)**（先复制截图）

编辑面板：矩形/椭圆、多遮罩组、缩放（`+`/`-`/Ctrl+滚轮）、平移、方向键微调、Ctrl+Z 撤销。保存时**每组一张卡**。

## 考试计划

设置里填考试日期后：

- 命令 **Build the exam plan**（或设置页按钮）
- 只纳入指定牌组（留空 = 全部），**按难度从高到低**排序
- 滑块控制参与比例（10%~100%），越少每天越轻松
- 到期日在考试之后的卡，会被均匀铺到考试前的每一天，**不超过每日复习上限**
- 修改前自动备份
- **考试日期过后自动清除**，回到正常 FSRS 调度，数据全部保留

## 数据与隐私

- 卡片：`Fake Cards/cards/<id>.json`（纯 JSON，可手改）
- 牌组：`Fake Cards/decks.json`
- 复习记录：`Fake Cards/reviews/YYYY-MM-DD.json`
- 备份/导出：`Fake Cards/backup/`、`Fake Cards/export/`
- 导入的图片：`Fake Cards/images/`

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
| Build the exam plan | 生成考试计划 |
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
