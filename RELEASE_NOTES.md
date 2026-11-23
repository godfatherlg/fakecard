# 1.0.51

## 中文

### 浏览页筛选可以保存

- 工具栏新增「保存筛选」：把当前搜索词和牌组存成一个名字，之后从下拉里一键恢复
- 保存时默认填当前搜索词；同样的搜索词 + 牌组再存一次是重命名，不会出现重复项
- 最多保存 50 个；「×」删除当前选中的筛选

### is:buried 不再只存在于语法里

- 浏览页快筛条新增「已埋藏」，和 is:new、is:due 等并列
- 筛选菜单与搜索补全会提示 is:buried
- 埋藏仍是「到明天零点」，与卡片菜单里的「今天不再出现」一致

### 修复

- 图片卡保存失败（只读库、磁盘写满）时不再提示「已保存」并关闭面板，编辑内容和面板都会保留
- 复习日志缓存遇到外部修改（同步、脚本、手改 JSON）会失效，统计、配额不再读到旧数据

### 请测试

- 保存两个筛选，重启 Obsidian 后恢复；再存一次同名筛选确认是重命名；删除筛选
- 输入 is:buried：快筛、菜单、补全是否都出现；改完埋藏时间后列表是否按预期变化
- 只读库或磁盘写满时编辑图片卡：应看到失败提示，面板不关
- 两台设备同步 reviews/*.json 后打开统计：数字应立即反映，而不是旧的一天

## English

### Saved Browse filters

- The toolbar can store the current query and deck under a name, then restore both from the dropdown
- The save dialog starts from the current query; saving the same query and deck again renames the entry instead of duplicating it
- At most 50 filters are kept; the × button deletes the selected one

### is:buried is discoverable

- The Browse chip bar offers Buried next to is:new, is:due and friends
- The filter menu and search completion mention is:buried
- Burying still means "until tomorrow": the card menu's "hidden until tomorrow" uses the same deadline

### Fixes

- A failed image-card save (read-only vault, full disk) no longer reports success or closes the panel; your masks stay editable
- The review-log cache is dropped when another writer changes reviews/*, so stats and quotas stop reading a stale day

### Please test

- Save two filters, restart Obsidian and restore them; save the same one again to confirm it renames; delete one
- Type is:buried: chip, menu and completion all offer it; changing a bury deadline updates the list
- Edit an image card in a read-only vault: a failure notice appears and the panel stays open
- Sync reviews/*.json from another device, then open Stats: the numbers must reflect it immediately
