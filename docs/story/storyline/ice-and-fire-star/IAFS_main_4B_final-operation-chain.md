# IAFS main 4B: Final Operation Chain

## Meta

- event_id: `iafs_main_4B_final_operation_chain`
- line_type: `main`
- unique_id: `4B`
- source_anchor: `IAFS_story.md` -> `## 第四阶段：离场窗口与终局解释` / `### 情境/### 冲突/### 选择`
- target_file: `IAFS_main_4B_final-operation-chain.md`
- tone: `极限执行（一次窗口里的连续行动）`

## Narrative Intent

- 把终局执行拆成连续、可追踪的行动链。
- 强化“只能成功一次”的压迫感。
- 让前序所有分支在此显性结算。

## Tone Narrative

终局开始时，所有准备都不再是准备。你下达的每条命令都会立刻改变窗口剩余、队员状态和系统风险。引擎修复组、门域行动组、后撤保障组像三根被拉到极限的钢索，任何一根先断，整条链都会失稳。

最难的不是“有没有办法”，而是“先救什么”。保窗口、保队员、保数据，你永远只能在同一分钟里优先两项。你以为自己在做战术编排，实际上是在写终局代价的分配表。

## Event Journey (Story-Driven)

### Prologue: 终局链启动

- Trigger: `action_complete`（4A 立场结算后）
- Event Node: `n_call_final_chain_brief`
- Choice:
  - `opt_open_infiltration_chain`
  - `opt_open_communication_chain`
  - `opt_open_purge_chain`

### Task 1: 连续执行与二选一保全

- Event Node:
  - `n_operation_window_wait`
  - `n_forced_tradeoff_call`
  - `n_operation_resolution_check`

### Endings & Mainline Coupling

- `result_4B_chain_clean`: 行动链完整执行，终局收束条件良好
- `result_4B_chain_broken`: 行动链断裂，终局进入高损耗状态

## Open Questions

- “二选一保全”节点是否按玩家历史偏好提供预设建议。
