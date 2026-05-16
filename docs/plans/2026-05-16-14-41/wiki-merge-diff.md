# Wiki Merge Diff

## 合入目标

- `docs/gameplay/event-system/event-system.md`
- `docs/game_model/event.md`

## 新增

- 新增 `skill_check` 节点说明：`d20 + 队员属性 >= DC`，使用确定性 seed，写入 `RuntimeEvent.check_results`。
- 新增玩家可见检定规则：判定选项可用 `display_tag` 显示 `[感知]` 等标签；结果作为下一段 runtime call 第一行进入 `LIVE TRANSCRIPT`。
- 新增 runtime call 展示扩展：`RenderedLine.animation` 可标记 d20 投掷值动画；`RuntimeCallOption` 可携带展示标签和检定预览。

## 更新

- 事件节点枚举从 9 类更新为包含 `skill_check`。
- runtime event 字段增加 `check_results`。
- runtime call option 字段增加 `display_tag` 与 `check_preview`。
- 校验规则增加 `skill_check.success_node_id`、`failure_node_id` 和 effect refs 引用校验。

## 冲突与决议

- 原 wiki 提到 `random` 负责受控随机。本轮保留该规则，并把玩家可见 d20 判定定义为独立 `skill_check`，避免把权重随机分支和属性检定混成同一节点。
- 原通话规则强调展示文本不决定逻辑。本轮保持该原则：`display_tag` 只影响 UI，推进仍提交稳定 `option_id`。
