---
source_design: docs/plans/2026-04-27-15-33/event-program-model-player-journey-design.md
target_wiki: docs/gameplay/event-system/event-system.md
target_models:
  - docs/game_model/event.md
  - docs/game_model/event-integration.md
backup: docs/plans/2026-04-27-15-33/wiki-backup-20260427-212154.md
date: 2026-04-27 21:21
---

# Wiki Merge Diff: event-program-model-player-journey

## 1. 新增（Added）

- [事件系统 / 核心概念] 新增 `event_definition`、`event_graph`、runtime `event`、runtime `call`、`call_template`、`trigger_context`、`objective`、`world_history`、`event_log`、blocking 占用等术语。
- [事件系统 / 机制与规则] 新增 9 类事件节点：`call`、`wait`、`check`、`random`、`action_request`、`objective`、`spawn_event`、`log_only`、`end`。
- [事件系统 / 机制与规则] 新增结构化 condition/effect、白名单 handler registry、静态资产与运行时边界、通话模板规则、objective 规则、保存与历史保留规则。
- [事件系统 / 生产级校验] 新增 schema、ID/ref、graph、template、condition/effect、handler、sample dry-run 校验要求。
- [事件系统 / 关键场景] 新增 5 个样例事件覆盖场景：普通发现、紧急多通话、等待节点、跨队员 objective、长期角色和世界后果。
- [game_model] 新增 `docs/game_model/event.md`，承接事件资产、事件图、runtime event/call/objective、condition/effect、handler、生命周期、校验和样例矩阵。
- [game_model] 新增 `docs/game_model/event-integration.md`，承接事件可读写的队员、行动、地块、库存、历史和存档状态边界。

## 2. 更新（Updated）

- [事件系统 / 概述] 从旧的“触发后立即执行 effects + 紧急事件挂队员状态”更新为“全局资产库 + 事件图 runtime + 结构化 condition/effect + 生产级校验”。
- [事件系统 / 通话关系] 从 `selectedChoiceId` 驱动旧紧急事件结算，更新为 runtime call 回写稳定 `option_id`，由 event graph 决定下游节点。
- [事件系统 / 数据模型] 从旧 camelCase 字段示例更新为 snake_case 字段体系，详细字段拆分到 `docs/game_model/event.md` 与 `docs/game_model/event-integration.md`。
- [事件系统 / 候选选择] 从简单 priority/chance 流程更新为 trigger index、condition、history/cooldown、mutex、blocking slot、priority/weight 的候选选择流程。
- [事件系统 / 保存策略] 从紧急事件倒计时字段绑定队员状态，更新为活跃 event/call/objective + event_log/world_history/world_flags 的长期保存策略。
- [策划案状态] `event-program-model-player-journey-design.md` 与 `event-program-model-player-journey-game-model-spec.md` 从 `approved` 更新为 `merged`。

## 3. 冲突（Conflicts）

*（无需要用户澄清的冲突。旧 wiki 描述的是已实现原型和旧字段；本次策划案明确允许研发期 cutover，不要求兼容旧事件 JSON、旧紧急事件字段或旧存档，因此按“更新”处理。）*

## 4. 保持（Kept as-is）

- [事件系统 / 游戏关闭后不推进] 保留旧 wiki 中“关闭游戏后事件时间不继续推进”的约束，并映射为 save rule。
- [事件系统 / 地图只读] 保留地图只读、行动必须经通讯 / 通话链路下达的约束。
- [事件系统 / 普通事件与紧急事件体验] 保留普通发现提供低强度反馈、紧急事件制造通话压力的体验目标。
- [事件系统 / 调查与重复事件] 保留快速观察、标准调查、深度调查耗时，以及重复调查避免刷高价值结果的规则。
- [事件系统 / 参数] 保留紧急事件首次等待、危险升级间隔、普通/高危最终期限的默认数值。
- [事件系统 / 普通事件池方向] 保留资源、见闻、危险提示和地块变化的普通事件方向，并改写为新事件模型可承接的内容池输入。
- [docs/game_model/crew.md] 保持不动；新增事件相关模型文档，不覆盖既有 crew model。

## 5. 冲突决议

*（暂无）*

## 6. 失败记录

*（暂无）*
