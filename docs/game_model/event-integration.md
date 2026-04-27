# 事件集成状态边界

本文描述事件系统会读写的外部 game model 边界。事件核心资产、事件图、runtime event/call/objective、condition/effect 和校验规则见 `docs/game_model/event.md`。地图配置、运行时地图状态、坐标与 legacy tile 投影见 `docs/game_model/map.md`。

事件引擎只通过结构化 condition/effect 读写这些状态；它不直接绕过目标模型任意修改 `GameState`。

## 1. 边界原则

| 规则 | 说明 |
| --- | --- |
| `runtime_source_of_truth` | 运行时状态来自 `GameState` / `save_state`。 |
| `target_policy` | effect 必须声明 target、params、失败策略和记录策略，不能隐式改写任意字段。 |
| `history_policy` | 冷却、一次性事件和后续事件解锁依赖 `world_history`，不依赖玩家可读长文本。 |
| `player_history_policy` | 玩家长期可见历史只有事件摘要；玩家存档不长期保存完整 call transcript、隐藏选项原因、debug trace 或编辑器模拟记录。 |
| `concurrency_policy` | 同一队员可被多个后台事件引用；同一时间最多只有一个 blocking event / call / action_request 占用该队员行动或通讯。 |
| `save_policy` | 保存时只保留活跃 event/call、objective、玩家摘要、world history 和 world flags；旧 save schema 可直接失败。 |

## 2. `crew_state` 事件可访问字段

事件系统只依赖以下队员字段；其他角色表现字段可由 crew 系统自行维护。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 队员标识。 |
| `display_name` | `string` | 玩家可见队员名。 |
| `tile_id` | `string` | 当前所在地块。 |
| `status` | `idle` / `moving` / `acting` / `in_event` / `unavailable` / `lost_contact` | 队员事件相关状态。 |
| `attributes` | `object` | `strength`、`agility`、`intelligence`、`perception`、`luck`。 |
| `personality_tags` | `string[]` | 性格标签，可被通话模板和事件条件引用。 |
| `expertise_tags` | `string[]` | 专长标签，可被通话模板和事件条件引用。 |
| `condition_tags` | `string[]` | 受伤、疲劳、恐惧等状态标签。 |
| `communication_state` | `available` / `busy_call` / `blocked` / `lost_contact` | 通讯状态。 |
| `current_action_id` | `string | null` | 当前行动。 |
| `blocking_event_id` | `string | null` | 占用行动的事件。 |
| `blocking_call_id` | `string | null` | 占用通讯的 call。 |
| `background_event_ids` | `string[]` | 引用该队员但不占用行动/通讯的事件。 |
| `inventory_id` | `string` | 队员背包 inventory。 |
| `diary_entry_ids` | `string[]` | 队员日记索引。 |
| `event_history_keys` | `string[]` | 队员级历史索引。 |

事件可读写关系：

- condition 可以读取队员位置、状态、属性、标签、通讯状态、当前行动、背包和历史 key。
- effect 可以更新队员状态、增删状态标签、增删性格/专长标签、写入 blocking 关联、追加日记或更新背包。
- background event 只能写入 `background_event_ids`，不能抢占行动或通讯。

## 3. `crew_action_state`

队员行动是独立状态机。事件通过 `action_request` 或 `objective` 请求行动，不直接吞并行动模型。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 行动实例 ID。 |
| `crew_id` | `string` | 执行动作的队员。 |
| `type` | `move` / `survey` / `gather` / `build` / `extract` / `return_to_base` / `event_waiting` / `guarding_event_site` | 行动类型。 |
| `status` | `queued` / `active` / `paused` / `completed` / `failed` / `interrupted` / `cancelled` | 行动状态。 |
| `source` | `player_command` / `event_action_request` / `objective` / `system` | 行动来源。 |
| `parent_event_id` | `string | null` | 请求该行动的事件。 |
| `objective_id` | `string | null` | 关联目标。 |
| `action_request_id` | `string | null` | 关联事件节点中的行动请求 ID。 |
| `from_tile_id` / `to_tile_id` / `target_tile_id` | `string | null` | 移动和行动目标地块。 |
| `path_tile_ids` | `string[]` | 移动路径。 |
| `started_at` / `ends_at` | `number | null` | 行动开始和结束游戏秒。 |
| `progress_seconds` | `number` | 已推进秒数。 |
| `duration_seconds` | `number` | 行动总耗时。 |
| `can_interrupt` | `boolean` | 是否可中断。 |
| `interrupt_duration_seconds` | `number` | 中断耗时。 |
| `blocking_claim_id` | `string | null` | 关联 blocking claim。 |
| `completion_trigger_context` | `trigger_context | null` | 完成时发出的 trigger 输入。 |

事件与行动的关系：

- `action_request` 节点可以创建或等待 `crew_action_state`。
- `objective` 可以要求某类行动完成后推进 parent event。
- 行动完成后用 `action_complete` 或 `objective_completed` 触发事件推进。
- 事件不能把行动执行进度藏在事件节点内部；行动耗时、路径、中断和完成状态由行动系统维护。

## 4. `tile_state` 事件可访问字段

事件系统访问地块时读取的是地图模型提供的事件投影，而不是直接绕过地图系统写入任意 `GameState.map` 字段。地图模型负责把静态配置、运行时发现 / 调查状态、已揭示对象和特殊状态合成为事件可读的 `tile_state`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 地块 ID。 |
| `coordinates` | `object` | 玩家显示坐标 `x`、`y`，以坠毁点 / 玩家开始点为 `(0,0)`。 |
| `terrain_type` | `string` | 地形类型。 |
| `area_name` | `string` | 区域名。未配置时由地图系统提供“野外”等 fallback。 |
| `weather` | `string` | 已发现地块可见的天气。当前事件投影可读取，但天气是否参与结算由事件定义决定。 |
| `tags` | `string[]` | 地形、生态、剧情、对象和状态标签。 |
| `danger_tags` | `string[]` | 已揭示且 active 的危险来源标签，例如 `large_beast_activity`、`volcanic_activity`。 |
| `discovery_state` | `unknown` / `frontier` / `discovered` | 发现状态。 |
| `survey_state` | `unsurveyed` / `surveyed` | 调查状态。 |
| `visibility` | `hidden` / `frontier` / `visible` | 地块可见性。 |
| `current_crew_ids` | `string[]` | 当前在地块上的队员。 |
| `resource_nodes` | `tile_resource_node[]` | 由已可见 / 已揭示的 `resourceNode` 地块对象派生。 |
| `site_objects` | `site_object[]` | 由已可见 / 已揭示的地块对象派生，例如遗物、营地痕迹、异常设备。 |
| `buildings` | `building_state[]` | 由玩家设施或 legacy building 投影派生。 |
| `environment` | `object | null` | 调查报告中的环境读数；未调查时不可直接泄露。 |
| `event_marks` | `event_mark[]` | 事件写入的地块标记。 |
| `history_keys` | `string[]` | 地块级历史索引。 |
| `proximity_radius` | `number` | 用于 proximity trigger 的默认邻近范围。 |

事件可读写关系：

- condition 可以读取地形、区域名、天气、标签、危险、发现 / 调查状态、资源点、site object、环境报告和历史 key。
- effect 可以通过结构化目标更新发现 / 调查状态、揭示对象 / 特殊状态、添加危险标签、写入 event mark、更新资源节点、删除或新增 site object。
- 地图只展示事件影响，不直接结算事件，也不直接下达正式行动。

## 5. `item`、`resource` 与 `inventory`

事件系统区分三类 target：`crew_inventory`、`base_inventory` / `base_resources`、`tile_resources`。

### 5.1 `item_definition`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 物品 ID。 |
| `name` | `string` | 显示名。 |
| `tags` | `string[]` | 规则和内容标签。 |
| `stackable` | `boolean` | 是否可堆叠。 |
| `event_use_tags` | `string[]` | 事件条件和效果可引用的用途标签。 |

### 5.2 `inventory_state`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | inventory ID。 |
| `owner_type` | `crew` / `base` / `tile` | 归属类型。 |
| `owner_id` | `string` | 归属对象 ID。 |
| `items` | `inventory_item_stack[]` | 物品堆叠。 |
| `resources` | `Record<resource_id, number>` | 资源数量。 |

`inventory_item_stack` 字段：`item_id`、`quantity`、`instance_tags`。

### 5.3 `tile_resource_node`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 资源点 ID。 |
| `resource_id` | `string` | 资源 ID。 |
| `amount` | `number` | 数量。 |
| `state` | `hidden` / `discovered` / `depleted` | 资源点状态。 |
| `event_tags` | `string[]` | 事件可引用标签。 |

事件可读写关系：

- condition 可以检查队员、基地或地块 inventory 是否拥有物品或资源。
- effect 可以增减物品、转移物品、增减资源或更新地块资源点。
- 资源相关事件应明确 target，避免“获得资源”默认写入错误 inventory。

## 6. `event_log`

`event_log` 是玩家可见历史，保存摘要，不保存完整通话。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 日志 ID。 |
| `event_id` | `string` | 来源 runtime event。 |
| `event_definition_id` | `string` | 来源事件定义。 |
| `occurred_at` | `number` | 游戏秒。 |
| `summary` | `string` | 玩家可见短文本。 |
| `crew_ids` | `string[]` | 涉及队员。 |
| `tile_ids` | `string[]` | 涉及地块。 |
| `objective_ids` | `string[]` | 涉及目标。 |
| `result_key` | `string | null` | 结果 key。 |
| `importance` | `minor` / `normal` / `major` / `critical` | 重要性。 |
| `visibility` | `player_visible` / `hidden_until_resolved` | 可见性。 |
| `history_keys` | `string[]` | 相关结构化历史 key。 |

`event_log` 解释玩家需要知道的事实，例如“发生了什么”和“造成了什么后果”。它不承担冷却、解锁或规则判定的 source of truth；这些长期事实由 `world_history` 保存。

## 7. `world_history` 与 `world_flags`

`world_history` 保存可查询事实；`world_flags` 保存当前世界状态。

### 7.1 `world_history_entry`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | `string` | 结构化历史 key。 |
| `scope` | `world` / `crew` / `tile` / `crew_tile` / `objective` / `event` | 历史作用范围。 |
| `event_definition_id` | `string | null` | 来源事件定义。 |
| `event_id` | `string | null` | 来源 runtime event。 |
| `crew_id` | `string | null` | 关联队员。 |
| `tile_id` | `string | null` | 关联地块。 |
| `objective_id` | `string | null` | 关联目标。 |
| `first_triggered_at` | `number` | 首次触发游戏秒。 |
| `last_triggered_at` | `number` | 最近触发游戏秒。 |
| `trigger_count` | `number` | 触发次数。 |
| `last_result` | `string | null` | 最近结果。 |
| `cooldown_until` | `number | null` | 冷却截止游戏秒。 |
| `value` | `unknown` | 少量结构化事实值。 |

### 7.2 `world_flag`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `key` | `string` | flag key。 |
| `value` | `boolean | number | string` | 当前值。 |
| `value_type` | `boolean` / `number` / `string` | 值类型。 |
| `created_at` | `number` | 创建游戏秒。 |
| `updated_at` | `number` | 更新游戏秒。 |
| `source_event_id` | `string | null` | 来源事件。 |
| `tags` | `string[]` | 搜索或规则标签。 |

使用规则：

- `world_history` 适合记录发生过的事实、次数、结果和冷却。
- `world_flags` 适合记录当前世界开关或少量状态值。
- 事件条件应优先查询结构化 key，而不是解析玩家可见日志文本。

## 8. `save_state`

`save_state` 保存运行时状态，不保存完整静态内容资产。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schema_version` | `string` | 新模型版本；旧版本可以硬失败。 |
| `created_at_real_time` | `string` | 存档创建现实时间。 |
| `updated_at_real_time` | `string` | 存档更新现实时间。 |
| `elapsed_game_seconds` | `number` | 已经过的游戏秒。 |
| `crew` | `Record<crew_id, crew_state>` | 队员状态。 |
| `crew_actions` | `Record<action_id, crew_action_state>` | 队员行动状态。 |
| `map` | `map_state` | 地图运行时事实源，包含发现 / 调查状态、对象 / 状态揭示和调查报告索引。 |
| `tiles` | `Record<tile_id, tile_state>` | 兼容投影，可由 `map` 派生；不应作为长期事实源。 |
| `inventories` | `Record<inventory_id, inventory_state>` | 背包与资源容器。 |
| `active_events` | `Record<event_id, event>` | 只保存未结束事件。 |
| `active_calls` | `Record<call_id, call>` | 只保存未结束 call。 |
| `objectives` | `Record<objective_id, objective>` | 保存未完成和已完成但仍影响 UI 的目标。 |
| `event_logs` | `event_log[]` | 玩家可见事件摘要。 |
| `world_history` | `Record<history_key, world_history_entry>` | 结构化历史事实。 |
| `world_flags` | `Record<flag_key, world_flag>` | 世界状态 flag。 |
| `rng_state` | `object | null` | 运行时随机状态；具体实现决定。 |

`save_state` 禁止保存：

- 完整 `event_definition` 或 `call_template`。
- 已结束 call 的完整台词和按钮文本。
- 长期 debug trace、隐藏选项原因、编辑器模拟记录。
- 编辑器布局、注释、review、覆盖率或质量报告。

## 9. 集成生命周期规则

- **blocking rule**：同一队员的 `blocking_event_id`、`blocking_call_id` 或 blocking `current_action_id` 同时只能有一个；后台事件只能写入 `background_event_ids`。
- **history rule**：冷却、一次性事件和后续事件解锁依赖 `world_history`，不依赖玩家可读长文本。
- **save rule**：保存时只保留活跃 event/call、objective、玩家摘要、world history 和 world flags；旧 save schema 可直接失败。
- **call cleanup rule**：event resolved 后删除完整 call；玩家可通过 `event_log.summary` 理解关键选择。
- **objective completion rule**：objective 完成后通过 `objective_completed` 或 `action_complete` 回写 parent event，并保留必要玩家摘要和历史 key。

## 来源

| 日期 | 来源 |
| --- | --- |
| 2026-04-27 | `docs/plans/2026-04-27-15-33/event-program-model-player-journey-game-model-spec.md` |
| 2026-04-27 | `docs/plans/2026-04-27-17-37/configurable-map-system-design.md` |
