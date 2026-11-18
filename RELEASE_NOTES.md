# 1.0.26

## 中文

### 三个新建面板都能「铺满」

问答、填空、导图的面板工具条现在都有 `铺满` 按钮：

- 点一下：弹窗放大到接近整个窗口（`96vw × 92vh`），输入区与预览区一起变高
- 再点（此时显示 `退出铺满`）：恢复默认尺寸
- 三个面板共用同一个实现（`panelFill.ts`），行为完全一致

上一版只有导图面板有这个按钮，这版补齐。

### 请测试

- 新建问答卡 → 点 `铺满`：弹窗是否变大、两个输入框是否跟着变高
- 新建填空卡 → 同样验证，并在「完成」页确认放大后预览也变大
- 三个面板的按钮文字是否在 `铺满` / `退出铺满` 之间切换
- 退出铺满后是否恢复原来的大小

## English

### All three new-card panels can fill the screen

The Q&A, cloze and mind-map panels each have a `Fill screen` button now:

- Press once: the dialog grows to nearly the whole window (`96vw × 92vh`), and the input and preview grow with it
- Press again (it reads `Exit fill screen`): back to the normal size
- All three share one implementation (`panelFill.ts`), so they behave identically

The previous release only had it on the map panel; this one completes the set.

### Please test

- New Q&A card → `Fill screen`: does the dialog grow, and do both fields grow with it
- New cloze card → the same, and check that the rendered stage grows too
- Does the button label switch between `Fill screen` and `Exit fill screen`
- Does leaving fill mode restore the original size
