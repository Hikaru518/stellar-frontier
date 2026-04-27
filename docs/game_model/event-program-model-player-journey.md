# 事件程序模型与玩家旅程模型索引

本文保留为兼容旧引用的索引页。事件相关 game model 已拆分为两份更聚焦的文档：

- `docs/game_model/event.md`：事件核心模型，包含资产库、静态事件定义、事件图、节点、runtime event/call/objective、condition/effect、handler、生命周期、校验和样例覆盖矩阵。
- `docs/game_model/event-integration.md`：事件集成状态边界，包含事件系统会读写的 `crew_state`、`crew_action_state`、`tile_state`、item/resource/inventory、`event_log`、`world_history`、`world_flags` 和 `save_state`。

## 阅读顺序

1. 需要实现事件引擎、事件编辑器或批量事件资产时，先读 `docs/game_model/event.md`。
2. 需要确认事件如何影响队员、行动、地块、库存、历史和存档时，再读 `docs/game_model/event-integration.md`。

## 来源

| 日期 | 来源 |
| --- | --- |
| 2026-04-27 | `docs/plans/2026-04-27-15-33/event-program-model-player-journey-game-model-spec.md` |
