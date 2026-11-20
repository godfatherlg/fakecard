# 1.0.37

## 中文

### 修正：关闭计时后一直保持，不再换卡自动恢复

1.0.36 里点眼睛只会关掉当前这张卡的计时，换到下一张卡就自己回来了。实际用起来，干扰往往持续不止一张卡，所以改成：

- 关闭后**一直保持关闭**，换卡、评完一张又一张都不恢复
- 同一位置留一个小时钟按钮，点它才重新打开；打开后从那一刻重新计时
- 关闭期间不测量、不记分，不会留下错误的 Hard 分
- 重载插件（或重开 Obsidian）后恢复默认显示

### 请测试

- 点眼睛关闭，连续复习三张卡：胶囊是否一直不出现，位置是否一直留着小时钟按钮
- 点小时钟：胶囊是否在该卡当前位置出现，并从 0 开始跑
- 关闭状态下评一张卡：是否不产生任何超时分

## English

### Fixed: switching the clock off now lasts

In 1.0.36 the eye button only switched off the current card, and the clock came back on the next one. A distraction usually outlasts one card, so:

- Once off, it **stays off** across cards and ratings
- A small clock button stays in the same spot; pressing it turns the clock back on, timing from that moment
- While off, nothing is measured and nothing is scored, so no wrong Hard point can be left behind
- Reloading the plugin (or Obsidian) brings the clock back

### Please test

- Press the eye, then review three cards in a row: does the pill stay away, with the small clock button still in place
- Press the clock: does the pill appear on that card and count from zero
- Rate a card while the clock is off: does it score nothing
