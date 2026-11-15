## 中文

### 修复审核反馈

- **设置页改用 1.13 声明式 API**：设置项现在会出现在 Obsidian 的设置搜索里，所有开关、数字、滑块、文本框由官方控件渲染，行为与之前一致
- **插件体积从 8.7 MB 降到 1.2 MB**：`sql.js` 改用浏览器版 WebAssembly 构建并内联 wasm，不再打包 8 MB 的 asm.js 版本。使用 Sync Standard 方案的用户现在可以正常同步 `main.js`
- **不再包含 Node.js 文件系统调用**：产物中 `node:fs`、`node:crypto` 引用为 0，Anki 导入不再借用 Node 分支
- **语言检测改用 `getLanguage()`**：不再读取 `localStorage`
- **删除卡片改用 `FileManager.trashFile()`**：遵循你在 Obsidian 里设置的删除偏好
- **去掉多余的 `Rating.Hard as number` 断言**
- **README 补全英文说明**：定位、功能、安装、快速开始、数据与隐私

### 其他改动

- 发布流程迁到 GitHub Actions：推送 tag 后自动构建、生成 [构建来源证明](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds) 并创建 Release

### 测试提醒

- Anki 导入（`.apkg`）底层从 asm.js 换成 WebAssembly，建议导入一个牌组确认基本、填空、图片遮挡三类笔记及其媒体都正常

## English

### Review feedback fixes

- **Settings tab moves to the 1.13 declarative API**: every setting is now indexed by Obsidian's settings search, and controls are rendered by the official components with the same behaviour as before
- **Bundle size down from 8.7 MB to 1.2 MB**: `sql.js` now uses the browser WebAssembly build with the wasm binary inlined instead of the 8 MB asm.js build. Users on the Sync Standard plan can sync `main.js` again
- **No Node.js filesystem calls left**: the bundle contains zero references to `node:fs` and `node:crypto`, and Anki import no longer pulls in the Node code paths
- **Language detection uses `getLanguage()`** instead of reading `localStorage`
- **Card deletion uses `FileManager.trashFile()`**, so your Obsidian deletion preference is respected
- **Removed the redundant `Rating.Hard as number` assertion**
- **README now has a full English section**: positioning, features, install, quick start, data and privacy

### Other changes

- Releases now run on GitHub Actions: pushing a tag builds the plugin, generates [build provenance attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations/using-artifact-attestations-to-establish-provenance-for-builds) and publishes the release

### Please test

- Anki import (`.apkg`) now runs on WebAssembly instead of asm.js; importing one deck to confirm basic, cloze and image-occlusion notes plus their media still come through would be great
