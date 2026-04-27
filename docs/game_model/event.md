# 事件模型

本文描述事件生产与事件运行时的核心 game model。它服务后续 implementation plan、事件编辑器 route 设计和批量事件生产；运行时资产、内容资产、编辑器元数据和玩家存档需要保持清晰边界。

事件会读写的队员、行动、地块、背包、历史和存档状态边界见 `docs/game_model/event-integration.md`。

## 1. 模型范围与命名

| 规则 | 说明 |
| --- | --- |
| `scope` | 覆盖静态内容资产、runtime `event`、runtime `call`、`objective`、`trigger_context`、候选选择、事件图、节点、condition、effect、handler registry、校验和样例 dry-run。 |
| `out_of_scope` | 不定义事件编辑器 UI，不定义编辑器元数据文件格式，不保存完整长期通话记录，不设计完整 quest system，不兼容旧事件 JSON 或旧 `localStorage` 存档。 |
| `field_naming` | JSON / TypeScript 字段使用英文 `snake_case`；文档用中文解释字段语义。 |
| `id_naming` | 全局资产 ID 使用稳定字符串，例如 `forest_beast_encounter`；运行时实例 ID 使用带类型前缀的生成 ID，例如 `evt_...`、`call_...`、`obj_...`。 |
| `content_source_of_truth` | 静态内容资产来自 `content/` 下的全局资产库；运行时实例不复制完整静态定义，只保存 ID、版本和运行时状态。 |
| `runtime_source_of_truth` | 运行时状态来自 `GameState` / `save_state`；事件引擎只通过结构化 condition/effect 读写这些状态。 |
| `editor_metadata_policy` | 运行时资产禁止包含 `editor_layout`、`editor_notes`、`review_status`、`preview_cases`、节点坐标、折叠状态等编辑器字段。 |
| `compatibility_policy` | 项目仍处研发期，不要求旧内容和旧存档兼容；旧 `localStorage` save 遇到新模型可以硬失败。 |
| `player_history_policy` | 玩家长期可见历史只有事件摘要；玩家存档不长期保存完整 call transcript、隐藏选项原因、debug trace 或编辑器模拟记录。 |
| `concurrency_policy` | 同一队员可被多个后台事件引用；同一时间最多只有一个 blocking event / call / action_request 占用该队员行动或通讯。 |

## 2. 资产库布局

静态内容资产是全局资产库，按类型分目录，按 domain 拆文件，不打成单一大 bundle。

| 路径 | 内容 |
| --- | --- |
| `content/events/definitions/<domain>.json` | 保存 `event_definition`。`<domain>` 可按地形、章节、剧情线、队员或系统拆分。 |
| `content/events/call_templates/<domain>.json` | 保存 `call_template`。模板通过 ID 被事件节点引用，不能反向决定事件逻辑。 |
| `content/events/handler_registry.json` | 保存白名单 `handler_type`、用途、参数 schema 引用和测试样例。 |
| `content/events/presets/<domain>.json` | 保存可复用 condition/effect/handler preset；加载后仍展开为受 schema 约束的结构化字段。 |
| `content/schemas/events/*.schema.json` | 保存事件定义、事件图、节点、condition、effect、call template、handler params 等 schema。 |
| `content/items/`、`content/crew/`、`content/resources/` | 保存事件可引用的 item、crew、resource 静态定义。 |
| `content/generated/event_index.json` | 构建步骤生成的触发索引、ID 索引和反向引用索引；不是手写 source of truth。 |

资产组织规则：

- `event_definition` 和 `call_template` 逻辑分离，但都属于全局资产库。
- 物理文件按 domain 拆分，便于人工 review 和批量生产。
- 运行时加载时建立全局索引：`by_event_definition_id`、`by_call_template_id`、`by_trigger_type`、`by_domain`、`by_tag`、`by_mutex_group`。
- 静态资产不得保存运行时实例字段，例如 `current_node_id`、`selected_options`、`active_call_id`。
- 静态资产不得保存编辑器字段，例如节点坐标、注释、review 状态、覆盖率报告。

## 3. 静态内容模型

### 3.1 `event_definition`

`event_definition` 是可触发、可实例化、可静态校验的事件内容资产。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schema_version` | `string` | 内容结构版本；校验器用它选择 schema。 |
| `id` | `string` | 全局唯一事件定义 ID。 |
| `version` | `number` | 事件定义版本；runtime event 记录创建时使用的版本。 |
| `domain` | `string` | 资产所属 domain，例如 `forest`、`volcano`、`crew_kael`。 |
| `title` | `string` | 内部与内容生产可读标题；是否展示给玩家由 UI 决定。 |
| `summary` | `string` | 事件意图摘要，用于 review、日志模板选择和 dry-run 说明。 |
| `tags` | `string[]` | 搜索、筛选、触发索引用标签。 |
| `status` | `draft` / `ready_for_test` / `approved` / `disabled` | 内容生产状态。 |
| `trigger` | `trigger_definition` | 结构化触发声明。 |
| `candidate_selection` | `object` | 多个事件满足同一 trigger 时的筛选字段。 |
| `repeat_policy` | `object` | 重复、冷却和历史过滤规则。 |
| `event_graph` | `event_graph` | 事件内部节点、边和终点。 |
| `effect_groups` | `effect_group[]` | 可复用效果组，供节点通过 ref 引用。 |
| `log_templates` | `event_log_template[]` | 玩家可见事件摘要模板；禁止存放完整通话文本。 |
| `content_refs` | `object` | 跨资产引用集合，例如 call template、item、resource、crew。 |
| `sample_contexts` | `sample_trigger_context[]` | 生产级 dry-run 的最小样例输入；approved 事件至少一个。 |

`candidate_selection` 字段：`priority`、`weight`、`mutex_group`、`max_instances_per_trigger`、`requires_blocking_slot`。

`repeat_policy` 字段：`scope`、`max_trigger_count`、`cooldown_seconds`、`history_key_template`、`allow_while_active`。

`event_definition` 不包含编辑器布局、节点坐标、注释、review 状态、运行时字段、长期 debug transcript 或完整 call transcript。

### 3.2 `trigger_definition`

`trigger_definition` 决定事件何时进入候选池。

固定 `trigger.type`：`arrival`、`proximity`、`action_complete`、`idle_time`、`call_choice`、`event_node_finished`、`objective_created`、`objective_completed`、`world_flag_changed`、`time_wakeup`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | `enum` | 触发类型，必须来自白名单。 |
| `conditions` | `condition[]` | 触发前置条件；全部通过后才进入候选池。 |
| `probability` | `object` | 触发概率声明，含 `base`、`modifiers`、`min`、`max`。 |
| `required_context` | `string[]` | 要求 `trigger_context` 必须提供的字段路径。 |
| `dedupe_key_template` | `string` | 同一 tick 或同一动作完成时去重的 key 模板。 |

### 3.3 `event_graph`

`event_graph` 是事件内部状态机。当前同一事件实例只有一个 `current_node_id`。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `entry_node_id` | `string` | 事件实例创建后进入的第一个节点。 |
| `nodes` | `event_node[]` | 节点列表；`node.id` 在当前事件定义内唯一。 |
| `edges` | `event_edge[]` | 节点间允许的有向边。 |
| `terminal_node_ids` | `string[]` | 合法终点节点 ID；每条运行路径必须能到达其中之一。 |
| `graph_rules.acyclic` | `boolean` | 当前固定为 `true`。 |
| `graph_rules.max_active_nodes` | `number` | 当前固定为 `1`。 |
| `graph_rules.allow_parallel_nodes` | `boolean` | 当前固定为 `false`。 |

`event_edge` 字段：`from_node_id`、`to_node_id`、`via`。`via` 可为 `option_id`、`branch_id` 或 `auto_next`。

### 3.4 `event_node` 通用字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 当前事件定义内唯一节点 ID。 |
| `type` | `enum` | `call`、`wait`、`check`、`random`、`action_request`、`objective`、`spawn_event`、`log_only`、`end`。 |
| `title` | `string` | 节点可读标题。 |
| `description` | `string` | 节点用途说明，属于内容说明，不是编辑器注释。 |
| `requirements` | `condition[]` | 进入节点前必须满足的条件。 |
| `enter_effect_refs` / `exit_effect_refs` | `string[]` | 进入或离开节点时执行的 `effect_group.id`。 |
| `inline_effects` | `effect[]` | 节点专属效果；批量生产时优先用效果组复用。 |
| `event_log_template_id` | `string | null` | 节点完成后写入玩家可见摘要的模板 ID。 |
| `history_writes` | `history_write[]` | 节点完成时写入的结构化历史 key。 |
| `blocking` | `blocking_requirement` | 节点是否占用队员行动或通讯。 |
| `timeout` | `timeout_rule | null` | 等待玩家选择、通话接听或行动完成的超时规则。 |
| `auto_next_node_id` | `string | null` | 无分支时的默认下游节点。 |

### 3.5 节点类型字段

| 节点 | 关键字段 | 说明 |
| --- | --- | --- |
| `call` | `call_template_id`、`speaker_crew_ref`、`urgency`、`delivery`、`options`、`option_node_mapping`、`on_missed`、`expires_in_seconds` | 创建 runtime call。通话只展示文本和收集 `option_id`，不直接结算事件。 |
| `wait` | `duration_seconds`、`wake_trigger_type`、`next_node_id`、`set_next_wakeup_at`、`crew_action_during_wait`、`interrupt_policy`、`on_interrupted` | 把事件推进交给时间系统，可占用队员行动或只后台计时。 |
| `check` | `branches`、`default_next_node_id`、`evaluation_order` | 执行确定性条件分支，当前按 `first_match`。 |
| `random` | `seed_scope`、`branches`、`default_next_node_id`、`store_result_as` | 执行受控随机分支，随机结果保存到 `event.random_results`。 |
| `action_request` | `request_id`、`action_type`、`target_crew_ref`、`target_tile_ref`、`action_params`、`completion_trigger`、`on_*_node_id`、`expires_in_seconds` | 请求或等待一个具体队员行动；行动仍由 crew action state 执行。 |
| `objective` | `objective_template`、`mode`、`on_created_node_id`、`on_completed_node_id`、`on_failed_node_id`、`expires_in_seconds`、`parent_event_link` | 创建独立运行时目标，完成后回写 parent event。 |
| `spawn_event` | `event_definition_id`、`spawn_policy`、`context_mapping`、`parent_event_link`、`dedupe_key_template`、`next_node_id` | 创建另一个 runtime event。 |
| `log_only` | `event_log_template_id`、`effect_refs`、`history_writes`、`next_node_id` | 只写玩家可见摘要、world history 或轻量效果。 |
| `end` | `resolution`、`result_key`、`final_effect_refs`、`event_log_template_id`、`history_writes`、`cleanup_policy` | 结束 runtime event，释放 blocking claim，删除 active call 细节，保留玩家摘要。 |

### 3.6 `call_template`

`call_template` 把节点逻辑选项渲染成角色化通话。模板只决定展示，不决定分支。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `schema_version` | `string` | 模板结构版本。 |
| `id` | `string` | 全局唯一模板 ID。 |
| `version` | `number` | 模板版本。 |
| `domain` | `string` | 所属 domain。 |
| `event_definition_id` | `string` | 服务的事件定义 ID。 |
| `node_id` | `string` | 服务的 `call` 节点 ID。 |
| `render_context_fields` | `string[]` | 模板会读取的上下文字段。 |
| `opening_lines` | `text_variant_group` | 通话开场文本变体。 |
| `body_lines` | `text_variant_group[]` | 补充描述文本变体。 |
| `option_lines` | `Record<option_id, text_variant_group>` | 每个 key 必须匹配节点 `options[].id`。 |
| `fallback_order` | `string[]` | 文案匹配优先级。 |
| `default_variant_required` | `boolean` | 当前固定为 `true`。 |

变体匹配规则：先过滤 `when` 全部通过的 variant，再按 `priority`、`fallback_order` 匹配精度和 `id` 稳定顺序选择；没有命中时必须使用 `default` variant。`option_lines` 缺少节点 `option_id` 或出现节点不存在的 `option_id` 时校验失败。

### 3.7 `condition`

`condition` 使用结构化 JSON 表达常见规则；复杂情况只能通过白名单 `handler_type + params` 扩展。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `type` | `enum` | condition 类型。 |
| `target` | `target_ref | null` | 读取对象，例如 `primary_crew`、`event_tile`、`world_flags`。 |
| `field` | `string | null` | 目标字段路径，例如 `attributes.perception`。 |
| `op` | `enum | null` | 比较操作，例如 `equals`、`not_equals`、`gt`、`gte`、`lt`、`lte`、`includes`。 |
| `value` | `unknown` | 比较值；schema 按 `field` 和 `op` 校验类型。 |
| `conditions` | `condition[]` | 组合条件使用。 |
| `handler_type` | `string | null` | 白名单 handler 类型。 |
| `params` | `object` | handler 或特定 condition 的参数。 |
| `description` | `string` | 给内容生产者的规则说明；不参与运行时判定。 |

常见 `condition.type`：`all_of`、`any_of`、`not`、`compare_field`、`has_tag`、`lacks_tag`、`has_condition`、`attribute_check`、`inventory_has_item`、`resource_amount`、`tile_discovery_state`、`tile_survey_state`、`world_flag_equals`、`world_history_exists`、`world_history_count`、`objective_status`、`event_status`、`event_current_node`、`crew_action_status`、`time_compare`、`handler_condition`。

### 3.8 `effect`

`effect` 是结构化结算动作，必须声明目标、参数、失败策略和记录策略。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 当前 effect group 内唯一。 |
| `type` | `enum` | 效果类型。 |
| `target` | `target_ref` | 写入对象。 |
| `params` | `object` | 效果参数；schema 由 `type` 决定。 |
| `failure_policy` | `fail_event` / `skip_effect` / `skip_group` / `retry_later` | 失败策略。 |
| `record_policy` | `object` | 是否写 event_log、world_history，以及 `history_key_template`。 |
| `idempotency_key_template` | `string | null` | 防止重复执行同一效果。 |
| `handler_type` | `string | null` | 复杂效果的白名单 handler。 |

常见 `target.type`：`primary_crew`、`related_crew`、`crew_id`、`event_tile`、`tile_id`、`active_event`、`parent_event`、`child_event`、`objective_id`、`crew_inventory`、`base_inventory`、`base_resources`、`tile_resources`、`world_flags`、`world_history`、`event_log`。

常见 `effect.type`：更新队员状态/属性/标签、创建或取消队员行动、更新地块字段、添加危险标签、设置发现/调查状态、添加事件标记、增减物品或资源、创建/更新/完成/失败 objective、设置 world flag、递增 world counter、写 world history、写 event log、追加日记、生成后续事件、解锁事件定义、调用白名单 handler。

### 3.9 `handler_registry` 与 preset

handler 只用于结构化字段难以表达的复杂规则，不是任意脚本入口。

`handler_definition` 字段：`handler_type`、`kind`、`description`、`params_schema_ref`、`allowed_target_types`、`deterministic`、`uses_random`、`failure_policy`、`sample_fixtures`。

`preset` 字段：`id`、`kind`、`expands_to`、`params`、`description`。preset 是内容生产便利层，构建或加载后仍应展开为受 schema 约束的结构化字段。

## 4. 运行时模型

### 4.1 Runtime `event`

runtime `event` 是某个 `event_definition` 在一局游戏中的实例。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 事件实例 ID。 |
| `event_definition_id` | `string` | 静态事件定义 ID。 |
| `event_definition_version` | `number` | 创建时使用的定义版本。 |
| `status` | `enum` | `active`、`waiting_call`、`waiting_time`、`waiting_action`、`waiting_objective`、`resolving`、`resolved`、`cancelled`、`expired`、`failed`。 |
| `current_node_id` | `string` | 当前节点 ID；resolved 后保存最终节点或清空由实现决定。 |
| `primary_crew_id` / `related_crew_ids` | `string | null` / `string[]` | 主要与相关队员。 |
| `primary_tile_id` / `related_tile_ids` | `string | null` / `string[]` | 主要与相关地块。 |
| `parent_event_id` / `child_event_ids` | `string | null` / `string[]` | 父子事件关系。 |
| `objective_ids` | `string[]` | 本事件创建或等待的目标。 |
| `active_call_id` | `string | null` | 当前未结束的 call。 |
| `selected_options` | `Record<node_id, option_id>` | 玩家在各 call 节点选择的逻辑选项。 |
| `random_results` | `Record<key, random_result>` | 随机节点结果。 |
| `blocking_claim_ids` | `string[]` | 本事件持有的行动/通讯占用锁。 |
| `created_at` / `updated_at` | `number` | 创建与最后推进时的游戏秒。 |
| `deadline_at` / `next_wakeup_at` | `number | null` | 事件最终期限和下次时间唤醒点。 |
| `trigger_context_snapshot` | `trigger_context` | 创建或推进事件时的关键上下文快照。 |
| `history_keys` | `string[]` | 本事件已写入的长期历史 key。 |
| `result_key` / `result_summary` | `string | null` | 最终结果 key 与玩家可见摘要。 |

### 4.2 Runtime `call`

runtime `call` 是一次通讯表现。玩家存档只保存活跃 call；事件结束后删除完整 call 细节。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | call 实例 ID。 |
| `event_id` | `string` | 来源事件实例。 |
| `event_node_id` | `string` | 来源 call 节点。 |
| `call_template_id` | `string` | 使用的通话模板。 |
| `crew_id` | `string` | 发起或参与通话的队员。 |
| `status` | `incoming` / `connected` / `awaiting_choice` / `ended` / `missed` / `expired` / `cancelled` | 通话状态。 |
| `created_at` / `connected_at` / `ended_at` / `expires_at` | `number | null` | 生命周期时间。 |
| `render_context_snapshot` | `object` | 渲染时读取的关键上下文摘要。 |
| `rendered_lines` | `rendered_line[]` | 已经展示的台词。 |
| `available_options` | `call_option_runtime[]` | 玩家可选的逻辑选项。 |
| `selected_option_id` | `string | null` | 玩家选择的逻辑 `option_id`。 |
| `blocking_claim_id` | `string | null` | 占用通讯或行动时的锁 ID。 |

`rendered_line` 字段：`template_variant_id`、`text`、`speaker_crew_id`。

`call_option_runtime` 字段：`option_id`、`template_variant_id`、`text`、`is_default`。

长期保留规则：active call 可保存渲染结果；event resolved 后删除完整 call；player save 可通过 `event_log.summary` 说明关键选择，但不保存完整台词、隐藏选项或调试记录。

### 4.3 Runtime `objective`

`objective` 是事件创建的独立运行时目标，用于玩家主动安排后续行动。它不是完整 quest system。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 目标实例 ID。 |
| `status` | `available` / `assigned` / `in_progress` / `completed` / `failed` / `expired` / `cancelled` | 目标状态。 |
| `parent_event_id` | `string` | 创建目标的事件实例。 |
| `created_by_node_id` | `string` | 创建目标的节点。 |
| `title` / `summary` | `string` | 玩家可见标题和说明。 |
| `target_tile_id` | `string | null` | 目标地块。 |
| `eligible_crew_conditions` | `condition[]` | 可接目标的队员条件。 |
| `required_action_type` / `required_action_params` | `string` / `object` | 完成目标需要的行动。 |
| `assigned_crew_id` / `action_id` | `string | null` | 分配队员和关联行动。 |
| `created_at` / `assigned_at` / `completed_at` / `deadline_at` | `number | null` | 生命周期时间。 |
| `completion_trigger_type` | `enum` | 通常为 `objective_completed` 或 `action_complete`。 |
| `result_key` | `string | null` | 完成或失败结果。 |

### 4.4 `trigger_context`

`trigger_context` 是事件候选筛选和事件推进的输入快照。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `trigger_type` | `enum` | 固定触发类型之一。 |
| `occurred_at` | `number` | 触发发生的游戏秒。 |
| `source` | `crew_action` / `tile_system` / `call` / `event_node` / `objective` / `world_flag` / `time_system` | 触发来源。 |
| `crew_id`、`tile_id`、`action_id` | `string | null` | 队员、地块和行动上下文。 |
| `event_id`、`event_definition_id`、`node_id`、`call_id`、`objective_id` | `string | null` | 事件图推进上下文。 |
| `selected_option_id` | `string | null` | 通话选择触发时的逻辑选项。 |
| `world_flag_key`、`previous_value`、`new_value` | `unknown` | world flag 变化上下文。 |
| `proximity` | `object | null` | 邻近触发信息：origin、nearby tiles、distance。 |
| `payload` | `object` | 触发类型专属补充字段；必须由 schema 约束。 |

### 4.5 候选选择结果

`event_candidate_selection_result` 用于 dry-run 和调试输出，不要求长期保存完整候选报告。

字段：`trigger_context`、`candidate_event_definition_ids`、`passed_condition_ids`、`filtered_by_history_ids`、`filtered_by_mutex_ids`、`filtered_by_blocking_ids`、`selected_event_definition_ids`、`roll_seed`、`created_event_ids`。

选择规则：先按 `trigger_type` 取候选，再执行 conditions、history、cooldown、mutex、blocking slot 和 priority/weight 筛选。

## 5. 生命周期规则

- **trigger intake**：系统在抵达、邻近、行动完成、长时间待命、通话选择、节点完成、目标创建、目标完成、world flag 变化、时间唤醒时创建 `trigger_context`。
- **candidate selection**：事件引擎根据 `trigger_type` 取候选，执行 condition、history、cooldown、mutex、blocking slot 和 priority/weight 筛选。
- **event creation**：选中事件后创建 runtime `event`，写入定义 ID、版本、触发上下文、主队员、主地块和 `entry_node_id`。
- **node entry**：进入节点时先检查 `requirements`，再申请 blocking claim，再执行 `enter_effect_refs`。
- **call node**：创建 runtime `call`，渲染文本和可见选项；玩家选择回写 `selected_option_id`，event 按 `option_node_mapping` 推进。
- **wait node**：写入 `next_wakeup_at`；时间系统到点后发出 `time_wakeup` 或 `event_node_finished`。
- **check node**：按顺序执行确定性分支；命中第一条进入下游，否则进入默认节点。
- **random node**：按条件过滤分支，再按权重抽取；结果写入 `event.random_results`。
- **action_request node**：创建或等待 `crew_action_state`；行动完成后由 `action_complete` 推进事件。
- **objective node**：创建独立 `objective`；玩家可派任意符合条件的队员完成，完成后用 `objective_completed` 推进 parent event。
- **spawn_event node**：创建 child event，并按 `parent_event_link` 写入父子关系。
- **log_only node**：只写玩家摘要、历史或轻量效果，然后自动推进。
- **end node**：执行最终效果，写玩家摘要和 world history，释放 blocking claim，删除 active call 细节，事件进入终态。

## 6. 校验规则

生产级静态校验覆盖以下层级。编辑器级覆盖率、质量评分和概率报告属于后续扩展。

### Schema 校验

- 所有资产必须通过对应 JSON Schema。
- Schema 使用 discriminated union：先读 `type`，再校验该类型必填字段。
- 禁止未声明字段，尤其禁止运行时资产出现 editor metadata。
- `schema_version` 必须被当前工具支持。

### ID / ref 校验

- `event_definition.id` 全局唯一。
- `call_template.id` 全局唯一。
- `event_graph.nodes[].id` 在当前事件定义内唯一。
- `event_graph.edges` 引用的节点必须存在。
- `terminal_node_ids` 必须引用合法终点节点。
- `call_template.event_definition_id` 和 `node_id` 必须能解析。
- `effect_refs`、`event_log_template_id`、`item_id`、`resource_id`、`crew_id`、`tile_id` 必须能解析。

### Graph 校验

- `entry_node_id` 必须存在。
- 图必须无环。
- 所有节点必须可从 entry 到达，除非显式标记为 disabled。
- 每个非终点节点必须至少有一条退出路径。
- 每个可达路径必须能到达 terminal node。
- `call.options[].id` 必须全部出现在 `option_node_mapping`。
- `check.branches[].next_node_id`、`random.branches[].next_node_id`、`auto_next_node_id` 必须存在。
- 当前禁止 `parallel` 和 `join` 节点。

### Template 校验

- `call_template.option_lines` 的 key 必须与对应 call 节点 `options[].id` 完全匹配。
- 每个 `option_id` 至少有一个默认 variant。
- `fallback_order` 引用的字段必须来自 `render_context_fields` 或标准 render context。
- 模板条件使用合法 `condition`。
- 模板文本占位符必须能从 render context 解析。

### Condition / effect 校验

- `condition.type`、`effect.type` 必须来自白名单。
- `target.type` 必须支持对应读写。
- `field` 必须存在于目标模型的事件可访问字段。
- `op` 必须支持该字段类型。
- `value` 类型必须匹配字段和 op。
- `effect.params` 必须符合该 `effect.type` 的 schema。
- `failure_policy` 必须显式声明。
- 写长期历史的 effect 必须声明 `history_key_template`。

### Handler 校验

- `handler_type` 必须存在于 `handler_registry`。
- handler `kind` 必须匹配使用位置。
- `params` 必须通过 `params_schema_ref`。
- handler 只能访问 `allowed_target_types`。
- `uses_random = true` 的 handler 必须接入 runtime random source，不能调用外部随机。
- 每个 approved handler 必须有 sample fixture。

### Sample dry-run 校验

- 每个 `approved` event_definition 至少包含一个 `sample_contexts`。
- dry-run 必须能从 trigger 进入 entry node。
- dry-run 必须覆盖至少一条 terminal path。
- dry-run 必须解析所有 call template 和 option mapping。
- dry-run 必须验证 effect target、handler params、history writes 和 event_log 输出。
- dry-run 不要求覆盖所有 variant；variant 覆盖率报告属于编辑器级后续扩展。

## 7. 五个样例事件覆盖矩阵

五个样例事件用于验证模型覆盖面，不要求在本文写成完整 JSON。

| 样例 | 触发与节点 | 覆盖模型 | 验证点 |
| --- | --- | --- | --- |
| `forest_trace_small_camp` 普通发现不打断 | `action_complete`；`log_only -> end`，可选非阻塞 `call` 作为自动回报。 | `tile_state.event_marks`、`event_log`、`world_history`、非 blocking event。 | 事件可作为世界反馈存在，不抢占队员行动或通讯。 |
| `forest_beast_encounter` 紧急多通话 | `action_complete` 或 `proximity`；`call -> wait -> call -> random -> end`。 | blocking event、blocking call、`selected_options`、`random_results`、`crew_state.condition_tags`、`tile_state.danger_tags`。 | 一个 event 可生成多次 call；call 文案不决定分支，`option_id` 决定分支。 |
| `mountain_signal_probe` 等待节点与时间压力 | `arrival` 或 `action_complete`；`call -> wait -> check/random -> call -> end`。 | `next_wakeup_at`、`time_wakeup`、`event_node_finished`、`crew_action_state.event_waiting`。 | 等待是事件图一等节点，时间系统能推进事件。 |
| `volcanic_ash_trace` 跨队员 objective | `action_complete`；`call -> objective -> wait/waiting_objective -> end`。 | runtime `objective`、任意符合条件队员执行、`objective_completed`、parent event 回写。 | 事件能生成独立目标；Kael 完成行动后推进 Lin Xia 的 parent event。 |
| `lost_relic_argument` 长期角色和世界后果 | `arrival` 或 `action_complete`；`call -> wait -> call -> check -> 多个 end`。 | `call_template` 变体、`personality_tags` 改变、`site_objects` 删除、`world_flags`、`spawn_event` / `unlock_event_definition`、日记追加。 | 最终选项能改变角色、地图、后续事件池和玩家可见摘要。 |

## 8. 模型边界与后续扩展

运行时事件资产不包含事件编辑器 web route、图编辑 UI、预览面板、资产管理页面、编辑器元数据文件格式、玩家长期完整通讯档案、完整 debug trace、隐藏选项原因回放、旧事件 JSON 兼容层、旧 `localStorage` 迁移、完整 quest system、奖励系统、任务优先级 UI、关系/士气/天气/昼夜/生态扩散/势力控制等更大模拟系统。

后续模型扩展记录：

- **Runtime / Model**：`parallel` 和 `join` 节点。当前固定 9 类节点，不支持多活跃节点和汇合；未来若要支持并行事件阶段，需要扩展 `event_graph.graph_rules`、runtime `current_node_ids` 和 join 校验。
- **Editor Quality**：编辑器级覆盖率、质量、概率和 variant 报告。包括 variant 命中率、隐藏选项报告、事件池概率分析、不可见分支报告、文本长度报告和质量评分；这些不进入运行时资产。

## 来源

| 日期 | 来源 |
| --- | --- |
| 2026-04-27 | `docs/plans/2026-04-27-15-33/event-program-model-player-journey-game-model-spec.md` |
