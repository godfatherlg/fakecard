# 1.0.21

## 中文

### 只有代码评审要求的改动，没有行为变化

- 图片就地缩放与放大查看里对 `img` / 包裹层的宽度赋值，改为 Obsidian 提供的 `setCssStyles()`，不再直接写 `element.style`（提交评审时被 `obsidianmd/no-static-styles-assignment` 指出）
- 打开蒙版面板的异步方法补上 `void`，避免出现未处理的 Promise 拒绝

功能、界面、数据都与 1.0.20 一致；如果你不打算提交评审，这个版本可以不装。

## English

### Review-compliance only - nothing changes in behaviour

- The width and max-width assignments behind the in-place image zoom and the zoom dialog now go through Obsidian's `setCssStyles()` instead of writing `element.style` directly (flagged by `obsidianmd/no-static-styles-assignment` during the community review)
- The async mask-panel opener is now `void`ed, so a rejection cannot go unhandled

Features, UI and data are identical to 1.0.20; if you are not submitting for review, this release can be skipped.
