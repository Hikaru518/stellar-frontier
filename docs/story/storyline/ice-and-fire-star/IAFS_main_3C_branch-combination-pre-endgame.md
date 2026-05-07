# IAFS main 3C: Branch Combination Pre-Endgame

## Meta

- event_id: `iafs_main_3C_branch_combination_pre_endgame`
- line_type: `main`
- unique_id: `3C`
- source_anchor: `IAFS_story.md` -> `## 第三阶段：门域接触与分歧` / `### 后果/阶段收束`
- target_file: `IAFS_main_3C_branch-combination-pre-endgame.md`
- tone: `收束（带着代价组合进入终局）`

## Narrative Intent

- 将第三阶段多线推进结果收敛为可执行的终局前置。
- 明确组合优劣，不让“任意组合”显得同质化。
- 把未完成支线带来的短板显性写入风险面板。

## Tone Narrative

到 3C 时，你手里已经有答案的形状了：不是“哪条路正确”，而是“你最后带了哪两条路去赌”。每一组组合都有可行性，也都有欠款。

有的组合稳，有的组合快，有的组合灵活但昂贵。你不是在选最完美方案，而是在选“你愿意把哪种代价留给第四阶段”。

## Event Journey (Story-Driven)

### Prologue: 组合结算

- Trigger
  - `trigger.type`: `action_complete`
  - recommended source action: 第三阶段策略支线推进后触发
  - required_context:
    - `trigger_type`
    - `occurred_at`
    - `source`
    - `payload.completed_branches`
- Condition
  - 已完成至少两条策略支线（A/B/C）
- Event Node
  - `n_check_branch_combo` (`check`): 识别 A+B / A+C / B+C
- Choice
  - 本阶段无额外显式选项（`N/A`）
- Consequence
  - 进入对应组合结局并生成终局前置清单

### Endings & Mainline Coupling

- `result_3C_combo_AB`
  - 收益：潜入 + 沟通协同，整体风险更可控
  - 主线耦合：第四阶段可优先走低冲突方案
- `result_3C_combo_AC`
  - 收益：执行力强，夺取窗口能力高
  - 主线耦合：第四阶段波动上升，失败惩罚更重
- `result_3C_combo_BC`
  - 收益：可谈可打，策略弹性最高
  - 主线耦合：资源消耗压力最大，容错窗口更窄
- `result_3C_incomplete`
  - 收益：无额外组合加成
  - 主线耦合：带短板进入终局，高风险状态常驻

### Event Graph Reference (for JSON mapping)

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_check_branch_combo` | `check` | 识别策略支线组合 | combo mapping to terminal |
| `n_end_3C_combo_AB` | `end` | A+B 组合结算 | terminal |
| `n_end_3C_combo_AC` | `end` | A+C 组合结算 | terminal |
| `n_end_3C_combo_BC` | `end` | B+C 组合结算 | terminal |
| `n_end_3C_incomplete` | `end` | 未满足两线完成结算 | terminal |

terminal_node_ids:

- `n_end_3C_combo_AB`
- `n_end_3C_combo_AC`
- `n_end_3C_combo_BC`
- `n_end_3C_incomplete`

graph_rules:

- `acyclic: true`
- `max_active_nodes: 1`
- `allow_parallel_nodes: false`

### Effects Registry (for JSON mapping)

| effect_id | effect_type | target | summary | failure_policy | record_policy |
| --- | --- | --- | --- | --- | --- |
| `ef_set_flag_3C_combo_AB` | `set_world_flag` | `world_flags` | 写入 A+B 组合标签 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_3C_combo_AC` | `set_world_flag` | `world_flags` | 写入 A+C 组合标签 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_3C_combo_BC` | `set_world_flag` | `world_flags` | 写入 B+C 组合标签 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_3C_incomplete` | `set_world_flag` | `world_flags` | 写入未完成组合标签 | `skip_effect` | write log=true, history=true |
| `ef_add_log_pre_endgame_bundle` | `add_event_log` | `event_log` | 记录终局前置清单 | `skip_effect` | write log=true, history=true |

## Call Template Notes

- 本文件核心为 `check -> end` 收束节点，默认无 `call` 节点。

## Schema Draft

```json
{
  "event_definitions": [
    {
      "id": "iafs_main_3C_branch_combination_pre_endgame",
      "trigger": {"type": "action_complete"},
      "event_graph": {"entry_node_id": "n_check_branch_combo"}
    }
  ]
}
```

## Open Questions

- `payload.completed_branches` 是否已有统一字段约定，或需在 integration 文档补定义。
