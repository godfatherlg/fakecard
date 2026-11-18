# 1.0.25

## 中文

### 思维导图：复习时定位与配色

- 复习打开导图卡，自动**居中到这张卡所问的那个节点**；翻到答案后仍停在同一个节点，不会跳回根节点
- 节点框宽度从 260px 放宽到 420px，长句少折行
- 问题面的挖空改成和填空卡相同的**蓝底**（整节点遮罩也是蓝色虚线），答案面被揭示的文字标**绿底**——一蓝一绿，和填空卡的语义一致

### 问答卡答案块显色

答案块加了淡绿底与圆角，和填空卡的答案用同一个绿色系，问题、答案在视觉上分开。

### 浏览视图：先点节点再编辑

在右栏导图里点一个节点（蓝色描边），再点 `✎ 编辑导图`，分栏编辑器会**停在该节点所在行**并滚动到可见位置；不点节点时仍从头打开。

### 新建面板「铺满」

导图面板工具条新增 `铺满`，一键把弹窗放大到接近全屏，导图区域跟着变高；再点恢复。

### 从笔记生成导图

- **文件列表右键**任意 Markdown：`fakecard: 生成思维导图`（与其他生成项同一套命名）
- **编辑区选中右键**：`fakecard: 用选中内容新建思维导图`
- **命令面板**：从整篇笔记 / 从选中内容生成
- 整篇笔记现在**正文段落也进导图**（每段一个节点，自动合并折行）；标题与列表保持层级
- 转换规则与填空卡完全一致：`==高亮==` → 挖空，`==高亮== %%注释%%` → 带提示的挖空（注释归属前面最近的洞），已有的 `{{c1::x::提示}}` 原样保留
- 文件菜单里的「新建卡片」已移除（它属于新建入口，不属于文件右键）

### 筛选与搜索

- 类型筛选新增 **思维导图**：`⌄` 菜单里的「类型：思维导图」，以及 `type:` 的补全候选 `map`
- 列表的「类型」列同样显示「思维导图」

### 请测试

- 复习导图卡：打开是否居中在挖空节点、翻面是否停在原处
- 问题面 `[___]` 是否蓝色、答案面是否绿色
- 浏览：点节点后编辑是否定位到该行
- 新建导图：`铺满` 是否把面板放大
- 文件右键与选中右键的导图生成，含 `%%注释%%` 的句子是否正确带提示

## English

### Mind map: where it looks, and its colours

- Opening a map card in review centres the window on **the node that card asks about**, and revealing the answer keeps it there instead of jumping back to the root
- Node boxes are 420px wide instead of 260px, so long labels wrap less
- A hole is now the **same blue** a cloze hole uses (a whole-node mask is a blue dashed box), and the words revealed on the answer side are marked **green** - blue for the question, green for the answer, exactly like a cloze card

### Q&A answer block

The answer block gets a light green background and rounded corners, the same family as the cloze answer, so question and answer are visually distinct.

### Browse: click a node, then edit

Click a node in the preview (it gets a blue outline), then `✎ Edit mind map`: the split editor opens **at that node's line** and scrolls it into view. Without a click it opens at the top, as before.

### Fill screen in the new-card panel

The map panel's toolbar has a `Fill screen` button that grows the dialog to nearly the whole window and the map with it; press again to go back.

### Making a map from a note

- **Right-click a Markdown file** in the file list: `fakecard: generate a mind map` (same naming as the other generators)
- **Right-click a selection** in the editor: `fakecard: new mind map from selection`
- **Command palette**: from the whole note, or from the selection
- A whole note now brings its **paragraphs** into the map too (one node per paragraph, wrapped lines joined); headings and list items keep their levels
- The conversion is the cloze card's: `==highlight==` becomes a hole, `==highlight== %%note%%` becomes a hole with that hint (a note attaches to the closest hole before it), and existing `{{c1::x::hint}}` is left alone
- The "new card" item is gone from the file menu: creating a card is not a file action

### Filtering

- The type filter gained **mind map**: "Type: mind map" in the `⌄` menu, and `map` among the `type:` completions
- The Type column shows "Mind map" as well

### Please test

- Review a map card: does it centre on the hole, and stay put on reveal
- Is the question side blue and the answer side green
- Browse: click a node, edit, and check the caret lands on that line
- New map: does `Fill screen` grow the panel
- Generate from the file menu and from a selection, including a sentence with `%%note%%`
