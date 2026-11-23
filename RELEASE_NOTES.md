# 1.0.55

## 中文

两项可选功能，默认关闭；在「设置 → fakecard」里开启：

- **录音**：打开已有卡片的编辑面板，点「录音」，一张卡可以保留多段。文件按时间戳命名保存在 `fakecard/media/`，默认显示名也是这个时间；改名只改显示名，不会动文件名。复习时卡片上方显示播放条，不会自动播放。
- **学习步骤**：为新卡设置如 `1m 10m`、为遗忘后的卡设置 `10m` 的 Anki 式步骤。Again 回到第一步，Good 前进一步，Hard 重复当前步，Easy 直接毕业；最后一步之后的间隔仍由 FSRS 决定。

两项关闭时，排程与 1.0.54 完全一致，升级不会改变已有卡的行为。设置项里写了中英文说明。

**请测试**

1. 设置 → fakecard → 开启录音：编辑任意已有卡片，录一段、停止、播放、改名；复习该卡时，卡片上方出现播放条。
2. 同一设置里开启学习步骤：复习一张新卡，答错后应回到 `1m`；答对前进到 `10m`；最后一步答对后进入正常复习。
3. 关闭两项开关，确认编辑面板和复习页不再出现录音入口，排程恢复 FSRS 默认。

## English

Two optional features, off by default; turn them on in **Settings -> fakecard**:

- **Audio recordings**: open an existing card's edit panel and press Record. A card keeps as many clips as you record. Files are named after the time and saved under `fakecard/media/`; the label starts as that time and can be renamed without touching the file. Review shows a player strip above the card and never plays by itself.
- **Learning steps**: set Anki-style steps such as `1m 10m` for new cards and `10m` after a lapse. Again returns to the first step, Good moves one step on, Hard repeats the current step, Easy graduates immediately; after the last step FSRS still picks the interval.

With both off, scheduling is exactly as in 1.0.54, so upgrading does not change existing cards. The settings entries carry descriptions in both languages.

**Please test**

1. Settings -> fakecard -> enable audio: edit an existing card, record, stop, play and rename a clip; reviewing that card should show a player strip above it.
2. In the same place enable learning steps: review a new card - Again should bring it back in `1m`, Good should move it to `10m`, and Good on the last step should enter normal review.
3. Turn both switches off: the audio entry points should disappear and scheduling should be back to plain FSRS.
