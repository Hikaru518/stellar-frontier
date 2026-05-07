# IAFS main 3B: Strategy Fork and Evidence Conflict

## Meta

- event_id: `iafs_main_3B_strategy_fork_and_evidence_conflict`
- line_type: `main`
- unique_id: `3B`
- source_anchor: `IAFS_story.md` -> `## 第三阶段：门域接触与分歧` / `### 情境（后半）/### 冲突`
- target_file: `IAFS_main_3B_strategy-fork-and-evidence-conflict.md`
- tone: `拉扯（证据冲突下的连续取舍）`

## Narrative Intent

- 让玩家在互相矛盾的证据与资源压力下做连续抉择。
- 将策略分流成本显性化，避免“无代价多线并进”。
- 为 3C 的组合结算准备可追踪前置状态。

## Tone Narrative

3A 的首次接触结束后，你拿到的不是方向，而是三套都自洽却彼此冲突的解释。聚落口述、技术测绘、现场反馈各说各话，谁都能自圆其说，谁也都可能把队伍带进坑里。

时间在压、物资在掉、队员在疲劳。你不再能假装“先都试试”，因为每推进一条，另外两条的成本都会上升。3B 的核心不是选哪条路，而是承认每条路都要付钱。

## Event Journey (Story-Driven)

### Prologue: 证据冲突浮现

- Trigger
  - `trigger.type`: `action_complete`
  - recommended source action: 3A 结算后触发
  - required_context:
    - `trigger_type`
    - `occurred_at`
    - `source`
    - `payload.action_type`
- Condition
  - 已写入 3A 倾向标记之一
- Event Node
  - `n_call_conflict_briefing` (`call`): 汇总口述/技术/现场三类冲突证据
- Choice
  - `opt_prioritize_lore_testimony` -> `n_path_lore`
  - `opt_prioritize_technical_scan` -> `n_path_tech`
  - `opt_prioritize_field_pressure` -> `n_path_field`
- Consequence
  - 进入对应证据优先路径

### Task 1: 策略分流推进

- Trigger
  - 来自 `n_call_conflict_briefing` 的证据优先级选择
- Condition
  - 当前资源可支持至少一条主路线
- Event Node
  - `n_path_lore` (`check`) -> `n_branch_cost_update`
  - `n_path_tech` (`check`) -> `n_branch_cost_update`
  - `n_path_field` (`check`) -> `n_branch_cost_update`
  - `n_branch_cost_update` (`check`): 抬升未选路线成本
- Choice
  - 本阶段无额外显式选项（`N/A`）
- Consequence
  - 写入“主路线 + 备选路线”成本状态

### Endings & Mainline Coupling

- `result_3B_lore_priority`
  - 收益：神谕口述链完整度提升
  - 主线耦合：沟通线解释一致性上升，技术线可信度受压
- `result_3B_tech_priority`
  - 收益：技术测绘链稳定度提升
  - 主线耦合：潜入/驱逐参数更稳，沟通线语义容错下降
- `result_3B_field_priority`
  - 收益：执行效率与即时生存容错提升
  - 主线耦合：中长期解释深度下降，终局真相层可能变薄

### Event Graph Reference (for JSON mapping)

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_call_conflict_briefing` | `call` | 证据冲突简报与优先级选择 | option mapping to `n_path_lore` / `n_path_tech` / `n_path_field` |
| `n_path_lore` | `check` | 神谕口述优先路径 | `n_branch_cost_update` |
| `n_path_tech` | `check` | 技术测绘优先路径 | `n_branch_cost_update` |
| `n_path_field` | `check` | 现场压力优先路径 | `n_branch_cost_update` |
| `n_branch_cost_update` | `check` | 更新未选路线成本 | terminal mapping |
| `n_end_3B_lore_priority` | `end` | 3B 口述优先结算 | terminal |
| `n_end_3B_tech_priority` | `end` | 3B 技术优先结算 | terminal |
| `n_end_3B_field_priority` | `end` | 3B 执行优先结算 | terminal |

terminal_node_ids:

- `n_end_3B_lore_priority`
- `n_end_3B_tech_priority`
- `n_end_3B_field_priority`

graph_rules:

- `acyclic: true`
- `max_active_nodes: 1`
- `allow_parallel_nodes: false`

### Effects Registry (for JSON mapping)

| effect_id | effect_type | target | summary | failure_policy | record_policy |
| --- | --- | --- | --- | --- | --- |
| `ef_set_flag_3B_lore_priority` | `set_world_flag` | `world_flags` | 写入口述优先标记 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_3B_tech_priority` | `set_world_flag` | `world_flags` | 写入技术优先标记 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_3B_field_priority` | `set_world_flag` | `world_flags` | 写入执行优先标记 | `skip_effect` | write log=true, history=true |
| `ef_increment_branch_cost_pressure` | `increment_world_counter` | `world_flags` | 抬升未选路线成本计数 | `skip_effect` | write log=true, history=true |
| `ef_add_log_evidence_conflict` | `add_event_log` | `event_log` | 记录证据冲突与裁决依据 | `skip_effect` | write log=true, history=true |

## Call Template Notes

- suggested call_template_id: `iafs_main_3B_strategy_fork_call`
- `n_call_conflict_briefing` option keys:
  - `opt_prioritize_lore_testimony`
  - `opt_prioritize_technical_scan`
  - `opt_prioritize_field_pressure`

## Schema Draft

```json
{
  "event_definitions": [
    {
      "id": "iafs_main_3B_strategy_fork_and_evidence_conflict",
      "trigger": {"type": "action_complete"},
      "event_graph": {"entry_node_id": "n_call_conflict_briefing"}
    }
  ]
}
```

## Open Questions

- 3B 成本抬升是否按固定值，还是按 3A 倾向动态加权。
