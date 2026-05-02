# IAFS side 01: Frozen Vow

## Meta

- event_id: `iafs_side_01_frozen_vow`
- line_type: `side`
- unique_id: `01`
- source_anchor: `IAFS_story.md` -> `### 支线 01：失温婚约（霜湾）`
- target_file: `IAFS_side_01_frozen-vow.md`
- tone: `浪漫（极端环境下的承诺与共同体）`

## Narrative Intent

- 在高压生存叙事中提供一条“私人承诺撞上公共秩序”的情感支线。
- 让玩家在“短期安全、长期关系、制度和解”之间做价值排序。
- 把跨聚落信任转化为可写回的主线耦合状态。

## Tone Narrative

你在任意一个聚落走访时，会先遇到 [岚脊] 或 [曜砂] 本人。对方不会直接提“婚约”这个词，而是先递来那枚被火烫出暗纹的誓物，再低声说一句：“请把春天送到另一半冬天里。”当你顺着线索继续问下去，才知道这是两人的秘密婚约请求。

他们并不是任性私奔的恋人。两人第一次相识是在交界救援中：窗口崩塌、信号失灵、路线断裂，[曜砂] 修好中继，[岚脊] 把队伍从塌边拉回。那次之后，他们靠共享救援日志维持联系，在互相写给对方的信里，一边讨论活命，一边讨论如何让两地不再把“同源”当作笑话。

问题是，两地保守派都把这段关系当成挑衅。封锁令写着“安全管制”，但每一条附注都在告诉你：真正被封锁的是婚约本身。你必须决定，是公开见证，把冲突摆上桌；还是秘密送达，只保全两个人。

无论你怎么选，都不是纯浪漫结局。你救的是一段关系，也是在给未来的共同体试探边界。

## Event Journey (Story-Driven)

### Prologue: 聚落偶遇

- Trigger
  - `trigger.type`: `arrival`
  - recommended source action: 探险队到达任一聚落并在当地遇到 [岚脊] 或 [曜砂] 后触发
  - required_context:
    - `trigger_type`
    - `occurred_at`
    - `source`
    - `payload.tile_id`
    - `payload.location_id`
- Condition
  - 当前位于 `[霜湾聚落]` 或 `[烬炉城寨]`
  - 至少有 1 名可通讯队员
  - `world_history` 不存在本支线活跃实例（或 cooldown 已结束）
- Event Node
  - `n_call_anonymous_relay` (`call`): 聚落现场接触并确认婚约请求
- Choice
  - `opt_take_frost_to_cinder` -> `n_route_frost_to_cinder`
  - `opt_take_cinder_to_frost` -> `n_route_cinder_to_frost`
  - `opt_defer_vow` -> `n_end_defer`
- Consequence
  - 进入护送线或暂缓婚约

### Task 1: 接单与取证

- Trigger
  - 来自 `n_call_anonymous_relay` 的路线选择
- Condition
  - 对侧聚落通路未完全封死
- Event Node
  - `n_route_frost_to_cinder` (`check`) -> `n_evidence_wait`
  - `n_route_cinder_to_frost` (`check`) -> `n_evidence_wait`
  - `n_evidence_wait` (`wait`): 调取巡逻记录与封锁令版本
  - `n_evidence_check` (`check`): 判定封锁是否“人为加码”
- Choice
  - 本阶段无额外显式选项（`N/A`）
- Consequence
  - 进入破局阶段

### Task 2: 破局与会合

- Trigger
  - `n_evidence_check` 完成
- Condition
  - 当前存在可执行窗口
- Event Node
  - `n_call_breakthrough_plan` (`call`)
  - `n_meeting_wait` (`wait`): 会合推进
  - `n_meeting_check` (`check`): 进入结算分支
- Choice
  - `opt_public_witness` -> `n_end_public_witness`
  - `opt_secret_delivery` -> `n_end_secret_delivery`
  - `opt_delay_vow` -> `n_end_defer`
- Consequence
  - 触发公开见证、秘密送达或暂缓婚约三类结局

### Endings & Mainline Coupling

- `result_public_witness`
  - 收益：`[双环境补给包]` + 双边信任提升线索
  - 主线耦合：第四阶段“友好”标签概率上升
- `result_secret_delivery`
  - 收益：`[霜湾信物]` 或 `[烬炉信物]`（依路线）
  - 主线耦合：短期稳定，长期和解推进有限
- `result_defer`
  - 收益：无即时额外奖励
  - 主线耦合：即时冲突降低，但情感线受损并留下后续补偿需求

### Event Graph Reference (for JSON mapping)

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_call_anonymous_relay` | `call` | 聚落现场接触并确认婚约请求 | option mapping to `n_route_frost_to_cinder` / `n_route_cinder_to_frost` / `n_end_defer` |
| `n_route_frost_to_cinder` | `check` | 霜湾 -> 烬炉路线 | `n_evidence_wait` |
| `n_route_cinder_to_frost` | `check` | 烬炉 -> 霜湾路线 | `n_evidence_wait` |
| `n_evidence_wait` | `wait` | 调取封锁证据 | `n_evidence_check` |
| `n_evidence_check` | `check` | 判定封锁性质 | `n_call_breakthrough_plan` |
| `n_call_breakthrough_plan` | `call` | 破局与会合方案决策 | option mapping to `n_end_public_witness` / `n_end_secret_delivery` / `n_end_defer` |
| `n_meeting_wait` | `wait` | 会合推进占位节点（可选） | `n_meeting_check` |
| `n_meeting_check` | `check` | 结算前条件判定（可选） | terminal mapping |
| `n_end_public_witness` | `end` | 公开见证结局 | terminal |
| `n_end_secret_delivery` | `end` | 秘密送达结局 | terminal |
| `n_end_defer` | `end` | 暂缓婚约结局 | terminal |

terminal_node_ids:

- `n_end_public_witness`
- `n_end_secret_delivery`
- `n_end_defer`

graph_rules:

- `acyclic: true`
- `max_active_nodes: 1`
- `allow_parallel_nodes: false`

### Effects Registry (for JSON mapping)

| effect_id | effect_type | target | summary | failure_policy | record_policy |
| --- | --- | --- | --- | --- | --- |
| `ef_add_log_vow_origin` | `add_event_log` | `event_log` | 记录婚约来源与誓物线索 | `skip_effect` | write log=true, history=true |
| `ef_add_item_frost_token` | `add_item` | `base_inventory` | 发放 `[霜湾信物]` | `skip_effect` | write log=true, history=true |
| `ef_add_item_cinder_token` | `add_item` | `base_inventory` | 发放 `[烬炉信物]` | `skip_effect` | write log=true, history=true |
| `ef_add_resource_dual_supply` | `add_resource` | `base_resources` | 发放双环境补给包 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_public_witness` | `set_world_flag` | `world_flags` | 标记公开见证结局 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_secret_delivery` | `set_world_flag` | `world_flags` | 标记秘密送达结局 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_vow_deferred` | `set_world_flag` | `world_flags` | 标记婚约暂缓结局 | `skip_effect` | write log=true, history=true |

## Call Template Notes

- suggested call_template_id: `iafs_side_01_frozen_vow_call`
- `n_call_anonymous_relay` option keys:
  - `opt_take_frost_to_cinder`
  - `opt_take_cinder_to_frost`
  - `opt_defer_vow`
- `n_call_breakthrough_plan` option keys:
  - `opt_public_witness`
  - `opt_secret_delivery`
  - `opt_delay_vow`
- `option_lines` key set must be identical to node `options[].id`.

## Schema Draft

### event_definition skeleton

```json
{
  "event_definitions": [
    {
      "schema_version": "1.0.0",
      "id": "iafs_side_01_frozen_vow",
      "version": 1,
      "domain": "iafs_side",
      "title": "失温婚约",
      "summary": "跨聚落婚约护送与公开/隐秘见证抉择",
      "status": "draft",
      "trigger": {
        "type": "arrival",
        "required_context": ["trigger_type", "occurred_at", "source", "payload.tile_id", "payload.location_id"]
      },
      "candidate_selection": {
        "priority": 45,
        "weight": 1,
        "mutex_group": "iafs_social_ops",
        "max_instances_per_trigger": 1,
        "requires_blocking_slot": true
      },
      "repeat_policy": {
        "scope": "world",
        "cooldown_seconds": 1800,
        "history_key_template": "iafs.side01.vow",
        "allow_while_active": false
      },
      "event_graph": {
        "entry_node_id": "n_call_anonymous_relay",
        "nodes": [],
        "edges": [],
        "terminal_node_ids": ["n_end_public_witness", "n_end_secret_delivery", "n_end_defer"],
        "graph_rules": {"acyclic": true, "max_active_nodes": 1, "allow_parallel_nodes": false}
      },
      "effect_groups": [],
      "log_templates": [],
      "content_refs": {
        "call_template_ids": ["iafs_side_01_frozen_vow_call"]
      }
    }
  ]
}
```

## Open Questions

- `[霜湾信物]` 与 `[烬炉信物]` 是否已有 item 定义；若无需补内容资产。
- 公开见证对第四阶段“友好/紧张/破碎”标签的具体权重待定。
