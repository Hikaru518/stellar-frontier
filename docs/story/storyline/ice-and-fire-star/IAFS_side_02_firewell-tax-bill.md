# IAFS side 02: Firewell Tax Bill

## Meta

- event_id: `iafs_side_02_firewell_tax_bill`
- line_type: `side`
- unique_id: `02`
- source_anchor: `IAFS_story.md` -> `### 支线 02：火井税单（烬炉）`
- target_file: `IAFS_side_02_firewell-tax-bill.md`
- tone: `哲思（制度正义与生存效率的冲突）`

## Narrative Intent

- 让玩家直面“制度秩序与生存效率”的结构性冲突。
- 通过税单执行路径，制造短期战力与长期治理信誉的取舍。
- 把政治选择写回热端关系与后续社会线成本。

## Tone Narrative

烬炉给你递来的是一张税单，看起来像行政文书，读起来像生存判决。想用主锻造炉，就先缴高危区材料和清剿凭证。字句非常规整，代价非常不规整。

从制度角度看，这份税单有它的逻辑：矿道在塌，热流在涨，谁要先用公共产能，谁就先交风险成本。可从主线角度看，这又像在你最缺资源的时候，要求你先把血抽出来再谈修船。

你去查档案、进矿道、问当事人。越查越像一团纠缠：有人真在维持秩序，也有人借秩序拿配额；有人想保全多数人，也有人只想让账本看起来干净。

最后你必须表态：缴足、保留份额，还是公开质询。你选的不是一条税务路径，而是“你愿意让哪种代价先落地”。

## Event Journey (Story-Driven)

### Prologue: 税单下达

- Trigger
  - `trigger.type`: `action_complete`
  - recommended source action: 完成一次烬炉主线或委托后触发
  - required_context:
    - `trigger_type`
    - `occurred_at`
    - `source`
    - `payload.action_type`
    - `payload.location_id`
- Condition
  - 当前位于 `[烬炉城寨]` 或烬炉相关工作区
  - 至少有 1 名可通讯队员
  - `world_history` 不存在本支线活跃实例（或 cooldown 已结束）
- Event Node
  - `n_call_tax_briefing` (`call`): 说明税单规则与时限
- Choice
  - `opt_accept_audit_first` -> `n_audit_wait`
  - `opt_skip_audit_pay_now` -> `n_call_tax_verdict`
  - `opt_reject_tax` -> `n_end_reject`
- Consequence
  - 进入取证链、直接裁决或拒缴结局

### Task 1: 查税与实勘

- Trigger
  - `n_call_tax_briefing` 进入查证流程
- Condition
  - 矿道处于可进入状态
- Event Node
  - `n_audit_wait` (`wait`): 调阅税档与事故簿
  - `n_field_check` (`check`): 对照 A 段与 B 段现场证据
  - `n_accounting_check` (`check`): 判定是否存在异常配额流向
- Choice
  - 本阶段无额外显式选项（`N/A`）
- Consequence
  - 进入问责与执行裁决

### Task 2: 问责与裁决

- Trigger
  - `n_accounting_check` 完成
- Condition
  - 可进入公开或私下谈判窗口
- Event Node
  - `n_call_tax_verdict` (`call`)
  - `n_verdict_wait` (`wait`): 执行分配与交付
- Choice
  - `opt_pay_full_tax` -> `n_end_full_tax`
  - `opt_pay_min_keep_mainline` -> `n_end_keep_mainline`
  - `opt_public_hearing_first` -> `n_end_public_hearing`
- Consequence
  - 触发完整缴税、保留主线份额、公开质询三类结局

### Endings & Mainline Coupling

- `result_full_tax`
  - 收益：立即解锁 `[耐热锻造许可]` 与高等级锻造通道
  - 主线耦合：短期主线材料紧缺，但烬炉官方信任上升
- `result_keep_mainline`
  - 收益：保留关键材料，主线推进更快
  - 主线耦合：烬炉物资价格上调、通行审查加强
- `result_public_hearing`
  - 收益：有机会重置税制为“事故率联动配额”
  - 主线耦合：短期收益低，但长期治理结构可改善
- `result_reject`
  - 收益：无额外奖励
  - 主线耦合：热端信任下降，后续谈判与协作成本提高

### Event Graph Reference (for JSON mapping)

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_call_tax_briefing` | `call` | 税单规则说明与前置抉择 | option mapping to `n_audit_wait` / `n_call_tax_verdict` / `n_end_reject` |
| `n_audit_wait` | `wait` | 调阅税档与事故簿 | `n_field_check` |
| `n_field_check` | `check` | 矿道实勘证据对照 | `n_accounting_check` |
| `n_accounting_check` | `check` | 判定异常配额 | `n_call_tax_verdict` |
| `n_call_tax_verdict` | `call` | 最终税单执行裁决 | option mapping to `n_end_full_tax` / `n_end_keep_mainline` / `n_end_public_hearing` |
| `n_verdict_wait` | `wait` | 裁决执行占位节点（可选） | terminal mapping |
| `n_end_full_tax` | `end` | 完整缴税结局 | terminal |
| `n_end_keep_mainline` | `end` | 保留主线份额结局 | terminal |
| `n_end_public_hearing` | `end` | 公开质询结局 | terminal |
| `n_end_reject` | `end` | 直接拒缴结局 | terminal |

terminal_node_ids:

- `n_end_full_tax`
- `n_end_keep_mainline`
- `n_end_public_hearing`
- `n_end_reject`

graph_rules:

- `acyclic: true`
- `max_active_nodes: 1`
- `allow_parallel_nodes: false`

### Effects Registry (for JSON mapping)

| effect_id | effect_type | target | summary | failure_policy | record_policy |
| --- | --- | --- | --- | --- | --- |
| `ef_add_log_tax_bill` | `add_event_log` | `event_log` | 记录火井税单与执行路径 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_full_tax` | `set_world_flag` | `world_flags` | 标记完整缴税 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_keep_mainline` | `set_world_flag` | `world_flags` | 标记保留主线份额 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_public_hearing` | `set_world_flag` | `world_flags` | 标记公开质询路径 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_tax_reject` | `set_world_flag` | `world_flags` | 标记拒缴路径 | `skip_effect` | write log=true, history=true |
| `ef_add_item_heat_forge_permit` | `add_item` | `base_inventory` | 发放 `[耐热锻造许可]`（完整缴税） | `skip_effect` | write log=true, history=true |
| `ef_add_resource_mainline_materials` | `add_resource` | `base_resources` | 保留主线关键材料（保留份额） | `skip_effect` | write log=true, history=true |
| `ef_increment_trade_pressure` | `increment_world_counter` | `world_flags` | 增加热端交易压力计数 | `skip_effect` | write log=true, history=true |

## Call Template Notes

- suggested call_template_id: `iafs_side_02_firewell_tax_bill_call`
- `n_call_tax_briefing` option keys:
  - `opt_accept_audit_first`
  - `opt_skip_audit_pay_now`
  - `opt_reject_tax`
- `n_call_tax_verdict` option keys:
  - `opt_pay_full_tax`
  - `opt_pay_min_keep_mainline`
  - `opt_public_hearing_first`
- `option_lines` key set must be identical to node `options[].id`.

## Schema Draft

### event_definition skeleton

```json
{
  "event_definitions": [
    {
      "schema_version": "1.0.0",
      "id": "iafs_side_02_firewell_tax_bill",
      "version": 1,
      "domain": "iafs_side",
      "title": "火井税单",
      "summary": "税单执行、取证与制度抉择",
      "status": "draft",
      "trigger": {
        "type": "action_complete",
        "required_context": ["trigger_type", "occurred_at", "source", "payload.action_type", "payload.location_id"]
      },
      "candidate_selection": {
        "priority": 45,
        "weight": 1,
        "mutex_group": "iafs_governance_ops",
        "max_instances_per_trigger": 1,
        "requires_blocking_slot": true
      },
      "repeat_policy": {
        "scope": "world",
        "cooldown_seconds": 1800,
        "history_key_template": "iafs.side02.tax",
        "allow_while_active": false
      },
      "event_graph": {
        "entry_node_id": "n_call_tax_briefing",
        "nodes": [],
        "edges": [],
        "terminal_node_ids": ["n_end_full_tax", "n_end_keep_mainline", "n_end_public_hearing", "n_end_reject"],
        "graph_rules": {"acyclic": true, "max_active_nodes": 1, "allow_parallel_nodes": false}
      },
      "effect_groups": [],
      "log_templates": [],
      "content_refs": {
        "call_template_ids": ["iafs_side_02_firewell_tax_bill_call"]
      }
    }
  ]
}
```

## Open Questions

- `[耐热锻造许可]` 是否已有 item 定义；若无需补内容资产。
- 公开质询路径触发的“听证防卫战”是否拆分为独立 side event。
