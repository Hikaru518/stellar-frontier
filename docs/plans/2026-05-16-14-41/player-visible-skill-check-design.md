# 玩家可见 d20 判定系统

## 背景

拾荒营地哨线初遇需要让玩家在通话选项中直接看见哪些选择会触发检定，并在检定后通过 `LIVE TRANSCRIPT` 看到投掷过程、属性加值、DC 和成败结果。该能力应成为事件系统的一等节点，而不是写死在某个页面或单个事件里。

## MVP

- 新增事件图节点 `skill_check`，执行 `d20 + 队员属性 >= DC`。
- `skill_check` 保存 `roll`、`modifier`、`total`、`dc`、`outcome` 和下游节点到 runtime event 的 `check_results`。
- `call.options[]` 支持 `display_tag` 和 `check_preview`。UI 只用它们展示 `[感知]` 等前缀，推进仍只提交稳定 `option_id`。
- 下一段 runtime call 的第一行插入检定结果文本：`{队员名称} 骰出了 {x}，加上 {属性} 数值 {y}，最终结果是 {x + y}. 判定要求是 {z}. 检定成功/失败。`
- `RenderedLine.animation` 支持 d20 数字动画；只对投掷值闪烁，属性值、总和和 DC 正常逐字出现。`stellar-frontier-e2e-disable-animation=1` 时直接显示最终文本。
- 改造 `iafs_scavenger_sentry_line_contact`：偷听、强硬、闲聊进入检定；表明来意保持非检定；爱丽丝且携带家徽手帕时出现专属非检定选项。

## Later

- UI 进一步展示 `check_preview.dc` 或成功率估算。
- 支持 advantage/disadvantage、额外 tag 加值、装备加值或临时状态加值。
- 让 Editor 为 `skill_check` 提供专门节点表单和图上预览。

## 不做

- 不把普通 `condition.attribute_check` 改造成自动玩家可见检定。
- 不消耗爱丽丝的 `monogrammed_handkerchief`。
- 不把 d20 动画应用到属性值、总和或 DC。

## 验收

- 内容校验通过新增 schema 和拾荒营地引用。
- PC 单元测试覆盖 graph runner、call renderer、CallPage 动画、拾荒营地判定分支和爱丽丝专属选项。
- 事件通话选项显示 `[感知]` / `[体能]` / `[智力]` / `[家族继承人候选]`，但 runtime selected option 仍是原始 `option_id`。
