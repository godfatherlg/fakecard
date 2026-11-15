# 1.0.6

## 中文

### 默认卡片库文件夹改为 `fakecard`

新建的卡片库现在放在 vault 的 `fakecard/` 文件夹（原来是 `Fake Cards/`）。

- 全新安装、或在保存过设置之前就升级的安装，会直接使用新默认值
- 已经在 `data.json` 里保存过 `libraryFolder` 的安装行为不变：插件照旧读写原来那个文件夹，不会自动移动或改名任何文件。想切换的话，把设置里的「卡片库文件夹」改成 `fakecard`，或先用文件管理器把 `Fake Cards/` 重命名为 `fakecard/` 再改设置

### 修复：打开插件设置页时整窗卡死

症状：进入 fakecard 的设置标签页后整个窗口无响应，切标签、按 Esc 都没反应，只能强杀进程。

原因是 `src/settings.ts` 里这一行：

```ts
void this.plugin.store.loadDecks().then((decks) => area.setValue(decks.join('\n')));
```

箭头函数是表达式体，返回了 `area.setValue(...)` 的返回值，也就是文本组件本身。Obsidian 的声明式设置里 `Setting` 和它创建的组件都带一个 `then` 方法（`then(t){ return t(this), this }`），于是这个 Promise 用「带 `then` 的对象」去 resolve；按规范解析时会再调用它的 `then`，它又把自己 resolve 出去——微任务无限自我调度，主线程再也回不到事件循环，界面因此彻底冻死。设置页一渲染就会执行这段代码，所以一进去就卡。

修复：回调改成语句体、只做 DOM 赋值不返回值，并补上 `.catch()`。牌组下拉框里同样的写法一并加固。设置页在 28 个设置项全部渲染的情况下打开耗时 6ms（修复前是无限挂起）。

### 新增：更新后的「更新内容」弹窗

升级到新版本后，第一次启动会弹一次更新说明，按钮可以跳到这一版的 GitHub 发布页。

- 只在版本真的变了时弹一次；全新安装不弹（对没有历史可言的安装没有意义）
- 文案随 Obsidian 的界面语言在中文与英文之间切换，内容内置在插件里，不联网、离线可用

### 测试提示

- 设置页应能正常打开，牌组文本框显示当前的牌组列表
- 从 1.0.5 升级（`data.json` 里已有 `lastSeenVersion`）时才会看到更新弹窗；想复测可以删掉 `data.json` 里的 `lastSeenVersion`，或把它改成旧版本号

## English

### The default card library folder is now `fakecard`

A new library lives in the vault's `fakecard/` folder (it used to be `Fake Cards/`).

- A fresh install, or an install that had never saved settings, picks up the new default directly
- Installs that already store `libraryFolder` in `data.json` behave exactly as before: the plugin keeps reading and writing that same folder, and nothing is moved or renamed for you. To switch, set "Card library folder" to `fakecard`, or rename `Fake Cards/` to `fakecard/` in your file manager first and then update the setting

### Fixed: the whole window froze when opening the plugin settings tab

Symptom: entering the fakecard settings tab made the entire window unresponsive - switching tabs and Esc did nothing, only killing the process helped.

The cause was this line in `src/settings.ts`:

```ts
void this.plugin.store.loadDecks().then((decks) => area.setValue(decks.join('\n')));
```

The arrow function has an expression body, so it returned whatever `area.setValue(...)` returns - the text component itself. In Obsidian's declarative settings both `Setting` and the components it creates carry a `then` method (`then(t){ return t(this), this }`), so the promise was resolved with a thenable: resolving it calls that `then`, which resolves itself again, and the microtask queue schedules itself forever. The main thread never returns to the event loop, hence the frozen UI. That render callback runs as soon as the tab is drawn, which is why opening the tab was enough.

Fix: the callback is now a statement body that only assigns to the DOM and returns nothing, with a `.catch()` added. The same pattern in the deck dropdown was hardened too. The tab now opens in 6ms with all 28 rows rendered (it used to hang indefinitely).

### New: a "what is new" dialog after each update

The first start after an upgrade shows the release notes once, with a button that opens this version's GitHub release page.

- It appears once and only when the version really changed; it is skipped on a fresh install, where notes about past releases mean nothing
- The text follows Obsidian's UI language (English or Chinese), ships inside the plugin and needs no network access

### Please test

- The settings tab should open normally and the decks box should show the current deck list
- The dialog only shows when upgrading from 1.0.5 (where `data.json` already has `lastSeenVersion`); to re-test, delete `lastSeenVersion` from `data.json` or set it to an older version
