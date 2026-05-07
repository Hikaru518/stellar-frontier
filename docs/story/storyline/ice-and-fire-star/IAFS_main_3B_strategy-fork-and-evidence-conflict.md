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
- 为后续组合结算准备可追踪前置状态。

## Tone Narrative

首次接触结束后的第一个夜班，指挥舱像临时搭起来的法庭。聚落使者摊开口述记录，坚持“神谕顺序不能打乱”；技术组把热图投到墙上，强调“只有测绘值能复现”；外勤队员把头盔往桌上一放，只问一句“下一次出去，到底先保命还是先取证”。三套说法都自洽，三套说法也都互相否定。

你很快意识到，这不是“谁更有道理”的问题，而是“谁先承担代价”的问题。若先走口述链，沟通线会更完整，但技术证据会滞后；若先走技术链，参数更稳，却可能错过对方可对话窗口；若先按现场压力推进，短期最实用，却会把长期解释空间一点点压缩掉。每推进一条，另外两条都会变贵。

冲突最尖锐的时刻，不在简报会，而在资源分配表落地的那一分钟：你批准哪支小队先动，哪条线路就拿走更多电量、药品和可用窗口。有人会因此觉得你在“押注真相”，也有人会觉得你在“放弃真相”。但你很清楚，这一段路没有不偏不倚，只有偏向之后能不能付清账单。

所以这一段分流的核心，从来不是漂亮地选一条路，而是诚实地承认：每条路都要付钱，而且账不会在今天结清。你当下写进系统的优先级，会在后续组合收束时变成真实的阻力与筹码。

## Event Journey (Story-Driven)

### Prologue: 证据冲突浮现

- Trigger
  - `trigger.type`: `action_complete`
  - recommended source action: 首次接触倾向结算后触发
  - required_context:
    - `trigger_type`
    - `occurred_at`
    - `source`
    - `payload.action_type`
- Condition
  - 已写入首次接触倾向标记之一
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
| `n_end_3B_lore_priority` | `end` | 口述优先结算 | terminal |
| `n_end_3B_tech_priority` | `end` | 技术优先结算 | terminal |
| `n_end_3B_field_priority` | `end` | 执行优先结算 | terminal |

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

- 成本抬升是否按固定值，还是按首次接触倾向动态加权。
