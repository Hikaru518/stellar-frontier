# IAFS side 03: Ashland Scavengers

## Meta

- event_id: `iafs_side_03_ashland_scavengers`
- line_type: `side`
- unique_id: `03`
- source_anchor: `IAFS_story.md` -> `### 支线 03：灰烬拾荒者（交界带）`
- target_file: `IAFS_side_03_ashland-scavengers.md`
- tone: `幽默（灾难场景中的人间闹剧）`

## Narrative Intent

- 在高压主线中提供一条“黑色幽默 + 生存协作”的支线，缓解节奏但不削弱风险。
- 把支线重心从“救不救人”改为“找什么食材、怎么带回来、如何处理食材”。
- 通过队长/副队长不同诉求让玩家体验资源取舍，并把结果回写到舆情与后续协作。

## Tone Narrative

探险队抵达交界带内的拾荒营地时，先闻到的是“差一点就能吃”的焦糊味，后听到的才是“差一点就要打起来”的争执。灰烬拾荒队刚拼出一台“冰火鸳鸯锅车”：左胆能冻住鲜货，右胆能滚煮硬料，技术说明书写满了，锅铲还在冒烟。问题是锅有了，人卡在极端窗口里不敢远行。队长 [寒栓] 来自 [霜湾聚落]，却是个一点就炸的急脾气；副队长 [炽砧] 来自 [烬炉城寨]，却总是冷静到近乎寡言。两人的性格都和原生村庄期待相反，长期受冷眼排斥，最终先后离开故地，在交界带凑成了这支拾荒队。他们想做的不只是活下去，而是在灰烬霜带搭一个松散乌托邦，收纳所有和他们一样被主流秩序排斥的离经叛道者。

他们不是正规编制，而是一群被两地边缘化后凑在一起过活的人：记账员 [簿灰] 只认配比，少一撮盐都要登记；路痴猎手 [回针] 每次带队都要多绕半圈，然后坚称这是“补充地形数据”；锅具技师 [铆铃] 讲话像在报维修单，连吵架都能分成四个工序；观察员 [白噪] 会把任何危机总结成段子。营地里像闹剧，地面上却很现实：本地人一旦错过窗口就会困在原地，谁都可能被天气拖死。

你和队员穿宇航服，温度本身不直接伤人，但每一次跨区搜集都会吃掉宇航服能量，像把电池当柴火在烧。第一任务很快变成双线取舍：去冷端采 [霜脊菌]、[冻湖薄片]，还是去热端取 [熔井根茎]、[赤灰腺盐]。你能先保一边，也能冒险双线全拿，前提是别把自己跑成“会走路的低电量提示”。

食材回收后，第二任务是做菜。拾荒队把“高端厨艺”定义为“别炸锅”，你则要在有限时间里决定处理顺序，再给出一份“地球家乡菜”方案：川味麻辣锅（中餐）、法式红酒炖牛肉锅（法餐）或墨西哥辣可可炖锅（墨西哥风味）。无论你选哪一种，他们都会先安静三秒，然后集体露出一种介于敬畏、困惑和本能后退之间的复杂表情。

第三任务是火锅派对。篝火边笑声很密，紧张感却没消失。若你让大家只吃热锅或只吃冰锅，夜里会平稳收束；若贪心混吃，拾荒队和队员会在凌晨集体腹泻，补给和状态一并下滑，还会被写进“交界饮食反面教材”，并附注“此案例不建议模仿”。

这条支线的喜剧感不是为了取消风险，而是强调另一件事：在这颗星球上，活下来的人同样需要吃、需要笑、也会为一口锅争得面红耳赤。民间生活本身，就是世界观的一部分。

## Event Journey (Story-Driven)

### Prologue: 抵达拾荒营地

- Trigger
  - `trigger.type`: `arrival`
  - recommended source action: 探险队到达交界带内的拾荒营地时触发
  - required_context:
    - `trigger_type`
    - `occurred_at`
    - `source`
    - `payload.tile_id`
    - `payload.location_id`
- Condition
  - 当前到达点为拾荒营地（建议 location alias: `loc_scavenger_camp_ashfrost`）
  - 当前地块位于 `['灰烬霜带']` 或带交界标签
  - 聚落关系不为完全敌对（允许发出求援）
  - 至少有 1 名可通讯队员
  - 当前主线不处于不可打断的终局执行窗口
  - `world_history` 不存在本支线活跃实例（或 cooldown 已结束）
- Event Node
  - `n_call_briefing` (`call`)：在营地内当面简报冰火鸳鸯锅车与食材争执
- Choice
  - `opt_route_ice_first` -> `n_route_ice`
  - `opt_route_fire_first` -> `n_route_fire`
  - `opt_abort` -> `n_abort_end`
- Consequence
  - 进入任务 1（找食材）或直接终止任务

### Task 1: 找食材（冷端/热端）

- Trigger
  - 来自 `n_call_briefing` 的路线选择
- Condition
  - 地图/地块状态允许交界带行动（未被全局封锁）
  - 若已有同 `mutex_group` 交界采集事件活跃，则本事件不进入候选
- Event Node
  - `n_route_ice` (`check`) -> `n_collect_ice_wait` (`wait`)
  - `n_route_fire` (`check`) -> `n_collect_fire_wait` (`wait`)
  - `n_t1_quality_check` (`check`)：判定是否双线食材齐备
- Choice
  - 路线选择已在前置节点完成，此阶段按执行结果分流
- Consequence
  - 双线齐备：进入任务 2
  - 仅冷端齐备：`n_captain_only_end`
  - 仅热端齐备：`n_deputy_only_end`
  - 写回重点：
    - `ef_consume_suit_energy`
    - `ef_reward_captain_bundle` / `ef_reward_deputy_bundle`

### Task 2: 做菜（地球家乡菜）

- Trigger
  - `n_t1_quality_check` 判定通过（可继续烹饪）
- Condition
  - 至少有一组可用食材
- Event Node
  - `n_call_cook_menu` (`call`) -> `n_cook_wait` (`wait`)
- Choice
  - `opt_cuisine_sichuan`
  - `opt_cuisine_cantonese`
  - `opt_cuisine_northern_stew`
- Consequence
  - 烹饪完成后进入任务 3
  - 写回重点：
    - `ef_add_log_scavenger_roster`
    - `ef_worldflag_culinary_rumor`

### Task 3: 火锅派对与反转

- Trigger
  - `n_cook_wait` 完成
- Condition
  - 派对节点开启，等待最终进食策略
- Event Node
  - `n_party_call` (`call`) -> `n_party_safe_end` or `n_party_diarrhea_end`
- Choice
  - `opt_party_hot_only` -> `n_party_safe_end`
  - `opt_party_cold_only` -> `n_party_safe_end`
  - `opt_party_mix_hot_cold` -> `n_party_diarrhea_end`
- Consequence
  - 安全结局：`result_dual_reward_safe`
  - 腹泻结局：`result_party_diarrhea`
  - 写回重点：
    - `ef_item_dualpot_toolkit`
    - `ef_worldflag_party_diarrhea`
    - `ef_penalty_party_stamina_loss`

### Endings & Mainline Coupling

- `result_dual_reward_safe`
  - 收益：队长线 + 副队线奖励全拿，追加 `[便携式小鸳鸯锅]`
  - 主线耦合：交界补给协作关系提升，后续一次交界采集判定容错提高
- `result_captain_reward_only`
  - 收益：队长 [寒栓] 冷端奖励包（`[霜脊菌样本] x1`、`[冻湖薄片] x1`、`低温补给券 x1`）
  - 主线耦合：冷端关系小幅提升，热端无变化
- `result_deputy_reward_only`
  - 收益：副队 [炽砧] 热端奖励包（`[熔井根茎] x1`、`[赤灰腺盐] x1`、`高温滤片券 x1`）
  - 主线耦合：热端关系小幅提升，冷端无变化
- `result_party_diarrhea`
  - 收益：基础奖励仍发放
  - 主线耦合：新增短期状态惩罚与舆情笑柄标签
- `result_abort`
  - 收益：无
  - 主线耦合：主线窗口损耗最低，但交界民间信任下降

### Event Graph Reference (for JSON mapping)

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_call_briefing` | `call` | 营地现场简报，介绍冰火鸳鸯锅车与食材争执 | option mapping to `n_route_ice` / `n_route_fire` / `n_abort_end` |
| `n_route_ice` | `check` | 先执行冷端食材采集计划，并记录宇航服能耗 | `n_collect_ice_wait` |
| `n_route_fire` | `check` | 先执行热端食材采集计划，并记录宇航服能耗 | `n_collect_fire_wait` |
| `n_collect_ice_wait` | `wait` | 冷端采集窗口推进 | `n_collect_fire_wait` or `n_captain_only_end` |
| `n_collect_fire_wait` | `wait` | 热端采集窗口推进 | `n_t1_quality_check` or `n_deputy_only_end` |
| `n_t1_quality_check` | `check` | 判定是否同时回收队长线与副队线食材 | `n_call_cook_menu` |
| `n_call_cook_menu` | `call` | 任务 2：决定地球家乡菜做法与烹饪节奏 | option mapping to `n_cook_wait` |
| `n_cook_wait` | `wait` | 处理食材、备料、烹煮 | `n_party_call` |
| `n_party_call` | `call` | 任务 3：火锅派对进食策略 | option mapping to `n_party_safe_end` / `n_party_diarrhea_end` |
| `n_party_safe_end` | `end` | 派对顺利结束，按食材回收情况结算奖励 | terminal |
| `n_party_diarrhea_end` | `end` | 冷热混吃触发腹泻事故结算 | terminal |
| `n_captain_only_end` | `end` | 仅完成队长食材线结算 | terminal |
| `n_deputy_only_end` | `end` | 仅完成副队食材线结算 | terminal |
| `n_abort_end` | `end` | 放弃本支线 | terminal |

terminal_node_ids:

- `n_party_safe_end`
- `n_party_diarrhea_end`
- `n_captain_only_end`
- `n_deputy_only_end`
- `n_abort_end`

graph_rules:

- `acyclic: true`
- `max_active_nodes: 1`
- `allow_parallel_nodes: false`

### Effects Registry (for JSON mapping)

| effect_id | effect_type | target | summary | failure_policy | record_policy |
| --- | --- | --- | --- | --- | --- |
| `ef_add_log_scavenger_roster` | `add_event_log` | `event_log` | 记录拾荒队成员与任务分工 | `skip_effect` | write log=true, history=true |
| `ef_consume_suit_energy` | `increment_world_counter` | `world_flags` | 增加宇航服能源消耗计数 | `skip_effect` | write log=true, history=true |
| `ef_reward_captain_bundle` | `add_resource` | `base_resources` | 完成队长食材线奖励（冷端资源包） | `skip_effect` | write log=true, history=true |
| `ef_reward_deputy_bundle` | `add_resource` | `base_resources` | 完成副队食材线奖励（热端资源包） | `skip_effect` | write log=true, history=true |
| `ef_item_dualpot_toolkit` | `add_item` | `base_inventory` | 发放 `[便携式小鸳鸯锅]`（可用于后续户外做饭） | `skip_effect` | write log=true, history=true |
| `ef_worldflag_culinary_rumor` | `set_world_flag` | `world_flags` | 设置“地球菜很怪但能吃”流言标签 | `skip_effect` | write log=true, history=true |
| `ef_worldflag_party_diarrhea` | `set_world_flag` | `world_flags` | 设置“冷热混吃腹泻事故”标签 | `skip_effect` | write log=true, history=true |
| `ef_penalty_party_stamina_loss` | `increment_world_counter` | `world_flags` | 腹泻导致短期状态惩罚计数 +1 | `skip_effect` | write log=true, history=true |

## Call Template Notes

- suggested call_template_id: `iafs_side_03_ashland_scavengers_call`
- call node `n_call_briefing` options must map to these exact keys:
  - `opt_route_ice_first`
  - `opt_route_fire_first`
  - `opt_abort`
- call node `n_call_cook_menu` option keys:
  - `opt_cuisine_sichuan`
  - `opt_cuisine_cantonese`
  - `opt_cuisine_northern_stew`
- call node `n_party_call` option keys:
  - `opt_party_hot_only`
  - `opt_party_cold_only`
  - `opt_party_mix_hot_cold`
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
      "summary": "交界拾荒队的食材搜集、烹饪协作与派对反转",
      "status": "draft",
      "trigger": {
        "type": "arrival",
        "required_context": ["trigger_type", "occurred_at", "source", "payload.tile_id", "payload.location_id"]
      },
      "candidate_selection": {
        "priority": 40,
        "weight": 1,
        "mutex_group": "iafs_borderline_ops",
        "max_instances_per_trigger": 1,
        "requires_blocking_slot": true
      },
      "repeat_policy": {
        "scope": "world",
        "cooldown_seconds": 1800,
        "history_key_template": "iafs.side03.hotpot",
        "allow_while_active": false
      },
      "event_graph": {
        "entry_node_id": "n_call_briefing",
        "nodes": [],
        "edges": [],
        "terminal_node_ids": ["n_party_safe_end", "n_party_diarrhea_end", "n_captain_only_end", "n_deputy_only_end", "n_abort_end"],
        "graph_rules": {"acyclic": true, "max_active_nodes": 1, "allow_parallel_nodes": false}
      },
      "effect_groups": [],
      "log_templates": [],
      "content_refs": {
        "call_template_ids": ["iafs_side_03_ashland_scavengers_call"]
      },
      "sample_contexts": [
          {
          "trigger_type": "arrival",
          "occurred_at": 12000,
          "source": "map_arrival",
          "payload": {"tile_id": "ash_frost_border_01", "location_id": "loc_scavenger_camp_ashfrost"}
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
      "node_id": "n_call_briefing",
      "render_context_fields": ["crew_id", "event_pressure", "previous_choices", "suit_energy_state"],
      "opening_lines": {"variants": [], "selection": "best_match"},
      "option_lines": {
        "opt_route_ice_first": {"variants": [], "selection": "best_match"},
        "opt_route_fire_first": {"variants": [], "selection": "best_match"},
        "opt_abort": {"variants": [], "selection": "best_match"}
      },
      "fallback_order": ["crew_id", "event_pressure", "default"],
      "default_variant_required": true
    }
  ]
}
```

## Open Questions

- `[便携式小鸳鸯锅]` 是否作为独立 item 落地，还是仅作为 narrative 奖励。
- “腹泻事故”应写入单次状态惩罚，还是可叠加短期 debuff 计数。
- 队长/副队奖励是否需要绑定聚落关系值（冷端/热端分轴）。
