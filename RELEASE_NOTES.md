# 1.0.9

## 中文

### 维护版本

相对 1.0.8 只有一处内部清理，界面和行为完全一致。

Anki 导入器以前在读 revlog 时先用 `ease >= 1 && ease <= 4` 过滤，再靠一个 `as Grade` 断言把数字交给 FSRS 重放。那个断言其实什么都没做（TS 允许任意 `number` 赋给数字枚举），真正挡脏数据的是前面的比较。现在改成查表：`ease` 在读取时就被映射成 FSRS 的 Again / Hard / Good / Easy，越界的记录直接丢弃，重放阶段不再有断言，类型和运行时的约束一致了。

实际效果：损坏或手改过的 apkg 不会再把非法评分传进调度器；正常 apkg 的结果与 1.0.8 逐字节一致。

### 1.0.8 的内容保持不变

Anki 导入携带完整复习历史、子卡失败分数、GitHub 风格热力图、可配置的评分快捷键与复习布局、淡色评分按钮——都还在。

### 请测试

- 导入一个 apkg，确认到期日期、复习次数和建子卡弹窗里的分数与 1.0.8 相同
- 其余界面不需要测试，没有改动

## English

### Maintenance release

Exactly one internal cleanup since 1.0.8, with no change in behaviour or UI.

The Anki importer used to filter revlog rows with `ease >= 1 && ease <= 4` and then hand the number to FSRS through an `as Grade` assertion. That assertion did nothing - TypeScript lets any `number` stand in for a numeric enum - so the comparison was the only real guard. The value is now looked up in a table while reading: `ease` becomes FSRS's Again / Hard / Good / Easy on the spot, anything out of range is dropped, and the replay path carries no assertion at all. The type and the runtime check now agree.

In practice a damaged or hand-edited .apkg can no longer push an unknown rating into the scheduler, and a healthy one imports exactly as it did in 1.0.8.

### Everything from 1.0.8 stays

Anki imports with the full review history, the child-card failing score, the GitHub-style heatmap, configurable rating keys and review layout, and the pale rating buttons - all unchanged.

### Please test

- Import an apkg and confirm due dates, review counts and the child-card score match 1.0.8
- Nothing else needs testing, the rest is untouched
