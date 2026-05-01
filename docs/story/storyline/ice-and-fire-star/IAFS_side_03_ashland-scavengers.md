# IAFS side 03: Ashland Scavengers

## Meta

- event_id: `iafs_side_03_ashland_scavengers`
- line_type: `side`
- unique_id: `03`
- source_anchor: `IAFS_story.md` -> `### 支线 03：灰烬拾荒者（交界带）`
- target_file: `IAFS_side_03_ashland-scavengers.md`
- tone: `幽默（灾难场景中的人间闹剧）`

## Narrative Intent

- 在高压主线中提供一条“轻喜剧 + 真救援”支线，缓解节奏但不削弱风险。
- 让玩家在有限时间内权衡“救援效率、资源回收、主线窗口损耗”。
- 用讽刺反转强化世界观中的民间叙事：结果不只由行动效率决定，也由传播叙事决定。

## Trigger Contract

- trigger.type: `action_complete`
- recommended source action: 交界带调查/侦察完成后触发
- required_context:
  - `trigger_type`
  - `occurred_at`
  - `source`
  - `payload.tile_id`
  - `payload.action_type`
- trigger conditions (semantic):
  - 当前地块位于 `['灰烬霜带']` 或带交界标签
  - 聚落关系不为完全敌对（允许发出求援）
  - `world_history` 不存在本支线活跃实例（或 cooldown 已结束）

## Preconditions

- 至少有 1 名可通讯队员（可进入 call）。
- 当前主线不处于不可打断的终局执行窗口。
- 地图/地块状态允许交界带行动（未被全局封锁）。
- 若已有同 mutex_group 的救援事件活跃，则本事件不进入候选。

## Node Flow

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_call_distress` | `call` | 求救来电，呈现失联拾荒队的胡闹现场与救援请求 | option mapping to `n_mode_hold` / `n_mode_move` / `n_mode_flare` |
| `n_mode_hold` | `check` | 指令 A：原地保温；判定是否触发补给见底倒计时 | `n_wait_rescue` or `n_fail_supply` |
| `n_mode_move` | `check` | 指令 B：沿蹄印慢移；判定路线正确与否 | `n_wait_rescue` or `n_loop_reroute` |
| `n_mode_flare` | `check` | 指令 C：点火求援；快速定位但抬升遭遇风险 | `n_encounter_hot` |
| `n_wait_rescue` | `wait` | 等待玩家接应队伍抵达窗口 | `n_arrival_check` |
| `n_encounter_hot` | `random` | 高风险接应战，决定损耗等级 | `n_arrival_check` |
| `n_loop_reroute` | `log_only` | 记录“人形罗盘绕路”闹剧并回到待接应状态 | `n_wait_rescue` |
| `n_arrival_check` | `check` | 抵达后处理“超导汤底湿滑”并选择救援强度 | option mapping to `n_full_rescue_end` / `n_limited_rescue_end` |
| `n_fail_supply` | `end` | 因拖延导致救援失败或收益大幅降低 | terminal |
| `n_full_rescue_end` | `end` | 全力救援结算 | terminal |
| `n_limited_rescue_end` | `end` | 有限救援结算 | terminal |
| `n_abandon_end` | `end` | 玩家在首通话中直接放弃救援 | terminal |

terminal_node_ids:

- `n_fail_supply`
- `n_full_rescue_end`
- `n_limited_rescue_end`
- `n_abandon_end`

graph_rules:

- `acyclic: true`
- `max_active_nodes: 1`
- `allow_parallel_nodes: false`

## Choice Matrix

### Call 1 (`n_call_distress`) options

- `opt_hold_position`：原地保温
  - branch: `n_mode_hold`
  - expected tradeoff: 生存率高，时间损耗高
- `opt_follow_hoofprints`：沿蹄印慢移
  - branch: `n_mode_move`
  - expected tradeoff: 中风险中收益，可能绕回原地
- `opt_flare_now`：立刻点火求援
  - branch: `n_mode_flare`
  - expected tradeoff: 定位快，战斗风险高
- `opt_abandon`：放弃救援
  - branch: `n_abandon_end`
  - expected tradeoff: 主线节奏最好，舆情惩罚

### Arrival choice (`n_arrival_check`) options

- `opt_full_rescue`：全力救援（救人 + 救货）
  - branch: `n_full_rescue_end`
- `opt_limited_rescue`：有限救援（只救人）
  - branch: `n_limited_rescue_end`

## Effects Matrix

| effect_id | effect_type | target | summary | failure_policy | record_policy |
| --- | --- | --- | --- | --- | --- |
| `ef_add_log_comedy_signal` | `add_event_log` | `event_log` | 写入求救频道喜剧摘要 | `skip_effect` | write log=true, history=true |
| `ef_mark_safe_path_hint` | `add_event_mark` | `event_tile` | 标记交界安全路径提示 | `skip_effect` | write log=true, history=true |
| `ef_item_signal_mirror` | `add_item` | `base_inventory` | 发放 `[锅盖反光镜]`（全力救援） | `skip_effect` | write log=true, history=true |
| `ef_storyline_tag_stingy_rank` | `set_world_flag` | `world_flags` | 设置“最抠救援榜”状态（有限救援） | `skip_effect` | write log=true, history=true |
| `ef_storyline_tag_abandon_rumor` | `set_world_flag` | `world_flags` | 设置“见死不救流言”状态（放弃救援） | `skip_effect` | write log=true, history=true |
| `ef_reward_partial_supplies` | `add_resource` | `base_resources` | 发放中量补给（有限救援） | `skip_effect` | write log=true, history=true |
| `ef_penalty_time_loss` | `increment_world_counter` | `world_flags` | 增加主线窗口损耗计数 | `skip_effect` | write log=true, history=true |

## Outcome & Mainline Coupling

- `result_full_rescue`
  - 收益：`[相变膜]`线索 + 旧航图碎片 + `[锅盖反光镜]`
  - 主线耦合：增加交界通路可读性，降低后续一次跨界判定难度
  - 讽刺反转：完整记录里夹杂大量火锅配方与检举信
- `result_limited_rescue`
  - 收益：部分线索 + 中量补给
  - 主线耦合：主线时间损耗中等
  - 讽刺反转：被写入“最抠救援榜”，却被当成精算指挥范本传播
- `result_abandon`
  - 收益：主线窗口损耗最低
  - 主线耦合：聚落舆情惩罚；社会线谈判初始信任下降
  - 讽刺反转：拾荒队自救成“热锅传奇”
- `result_fail_supply`
  - 收益：极低
  - 主线耦合：留下“救援迟滞”负面历史键，影响后续民生类支线容错

## Call Template Notes

- suggested call_template_id: `iafs_side_03_ashland_scavengers_call`
- call node `n_call_distress` options must map to these exact keys:
  - `opt_hold_position`
  - `opt_follow_hoofprints`
  - `opt_flare_now`
  - `opt_abandon`
- arrival node `n_arrival_check` option keys:
  - `opt_full_rescue`
  - `opt_limited_rescue`
- `option_lines` key set must be identical to node `options[].id`.

## Schema Draft

### event_definition skeleton

```json
{
  "event_definitions": [
    {
      "schema_version": "1.0.0",
      "id": "iafs_side_03_ashland_scavengers",
      "version": 1,
      "domain": "iafs_side",
      "title": "灰烬拾荒者",
      "summary": "交界带失联拾荒队救援与讽刺反转",
      "status": "draft",
      "trigger": {
        "type": "action_complete",
        "required_context": ["trigger_type", "occurred_at", "source", "payload.tile_id", "payload.action_type"]
      },
      "candidate_selection": {
        "priority": 40,
        "weight": 1,
        "mutex_group": "iafs_rescue_ops",
        "max_instances_per_trigger": 1,
        "requires_blocking_slot": true
      },
      "repeat_policy": {
        "scope": "world",
        "cooldown_seconds": 1800,
        "history_key_template": "iafs.side03.rescue",
        "allow_while_active": false
      },
      "event_graph": {
        "entry_node_id": "n_call_distress",
        "nodes": [],
        "edges": [],
        "terminal_node_ids": ["n_fail_supply", "n_full_rescue_end", "n_limited_rescue_end", "n_abandon_end"],
        "graph_rules": {"acyclic": true, "max_active_nodes": 1, "allow_parallel_nodes": false}
      },
      "effect_groups": [],
      "log_templates": [],
      "content_refs": {
        "call_template_ids": ["iafs_side_03_ashland_scavengers_call"]
      },
      "sample_contexts": [
        {
          "trigger_type": "action_complete",
          "occurred_at": 12000,
          "source": "crew_action",
          "payload": {"action_type": "survey", "tile_id": "ash_frost_border_01"}
        }
      ]
    }
  ]
}
```

### call_template skeleton

```json
{
  "call_templates": [
    {
      "schema_version": "1.0.0",
      "id": "iafs_side_03_ashland_scavengers_call",
      "version": 1,
      "domain": "iafs_side",
      "event_definition_id": "iafs_side_03_ashland_scavengers",
      "node_id": "n_call_distress",
      "render_context_fields": ["crew_id", "event_pressure", "previous_choices"],
      "opening_lines": {"variants": [], "selection": "best_match"},
      "option_lines": {
        "opt_hold_position": {"variants": [], "selection": "best_match"},
        "opt_follow_hoofprints": {"variants": [], "selection": "best_match"},
        "opt_flare_now": {"variants": [], "selection": "best_match"},
        "opt_abandon": {"variants": [], "selection": "best_match"}
      },
      "fallback_order": ["crew_id", "event_pressure", "default"],
      "default_variant_required": true
    }
  ]
}
```

## Open Questions

- `[锅盖反光镜]` 作为道具是否已有 item 定义；若无，需要新增 item 资产。
- “最抠救援榜/热锅传奇”是否以 `world_flags` 还是 `world_history` 为主要判定源。
- 该支线与第三阶段策略分支是否共享 `mutex_group`，需根据实际节奏决定。
