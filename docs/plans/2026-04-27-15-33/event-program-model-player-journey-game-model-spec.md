---
topic: event-program-model-player-journey-game-model-spec
date: 2026-04-27
status: approved
source:
  design: docs/plans/2026-04-27-15-33/event-program-model-player-journey-design.md
  interview: docs/plans/2026-04-27-15-33/event-program-model-player-journey-interview.md
  research: docs/plans/2026-04-27-15-33/research.md
  initial: docs/plans/2026-04-27-15-33/initial.md
---

# 事件程序模型与玩家旅程 Game Model Spec

本文固定事件生产相关的字段级 game model。它服务三件事：后续 implementation plan、事件编辑器 route 设计、批量事件生产。本文只描述运行时与内容模型；编辑器布局、注释、review、预览用例和质量报告属于独立编辑器元数据，不进入运行时资产，不进入玩家存档。

## 1. Model Scope and Naming

- **scope**：覆盖事件生产会读写的静态内容资产、运行时 `event`、运行时 `call`、`objective`、trigger context、候选选择、crew action、tile、inventory/resource、event log、world history、world flags 和 save state。
- **out_of_scope**：不设计事件编辑器 UI，不定义编辑器元数据文件格式，不保存完整长期通话记录，不设计完整 quest system，不兼容旧事件 JSON 或旧 `localStorage` 存档。
- **field_naming**：所有 JSON / TypeScript 字段使用英文 `snake_case`；本文用中文解释字段含义。
- **id_naming**：全局资产 ID 使用稳定字符串，例如 `forest_beast_encounter`；运行时实例 ID 使用带类型前缀的生成 ID，例如 `evt_...`、`call_...`、`obj_...`。
- **content_source_of_truth**：静态内容资产来自 `content/` 下的全局资产库；运行时实例不复制完整静态定义，只保存 ID、版本和运行时状态。
- **runtime_source_of_truth**：运行时状态来自 `GameState` / `save_state`；事件引擎只通过结构化 condition/effect 读写这些状态。
- **editor_metadata_policy**：运行时资产禁止包含 `editor_layout`、`editor_notes`、`review_status`、`preview_cases`、节点坐标、折叠状态等编辑器字段。
- **compatibility_policy**：当前仍处研发期，不要求旧内容和旧存档兼容；旧 `localStorage` save 遇到新模型可以硬失败。
- **player_history_policy**：玩家长期可见历史只有事件摘要；玩家存档不长期保存完整 call transcript、隐藏选项原因、debug trace 或编辑器模拟记录。
- **concurrency_policy**：同一队员可被多个后台事件引用；同一时间最多只有一个 blocking event / call / action_request 占用该队员行动或通讯。

## 2. Asset Library Layout

静态内容资产是全局资产库。它按类型分目录，按 domain 拆文件，不打成单一大 bundle。

- `content/events/definitions/<domain>.json`
  - 保存 `event_definition`。
  - `<domain>` 可按地形、章节、剧情线、队员或系统拆分，例如 `forest.json`、`volcano.json`、`crew_kael.json`。
- `content/events/call_templates/<domain>.json`
  - 保存 `call_template`。
  - 模板通过 `id` 被事件节点引用，不能反向决定事件逻辑。
- `content/events/handler_registry.json`
  - 保存白名单 `handler_type`、用途、参数 schema 引用和测试样例。
  - 运行时只能调用 registry 中声明过的 condition/effect handler。
- `content/events/presets/<domain>.json`
  - 保存可复用 condition/effect/handler preset。
  - preset 只是内容生产便利层；构建或加载后仍应展开为受 schema 约束的结构化字段。
- `content/schemas/events/*.schema.json`
  - 保存事件定义、事件图、节点、condition、effect、call template、handler params 等 schema。
- `content/items/`、`content/crew/`、`content/resources/`
  - 保存事件可引用的 item、crew、resource 静态定义。
  - 事件资产只保存引用 ID，不内嵌这些系统的完整定义。
- `content/generated/event_index.json`
  - 可由构建步骤生成触发索引、ID 索引、反向引用索引。
  - 这是派生产物，不是手写 source of truth。

资产组织规则：

- `event_definition` 和 `call_template` 逻辑分离，但都属于全局资产库。
- 物理文件按 domain 拆分，便于人工 review 和批量生产。
- 运行时加载时建立全局索引：`by_event_definition_id`、`by_call_template_id`、`by_trigger_type`、`by_domain`、`by_tag`、`by_mutex_group`。
- 静态资产不得保存运行时实例字段，例如 `current_node_id`、`selected_options`、`active_call_id`。
- 静态资产不得保存编辑器字段，例如节点坐标、注释、review 状态、覆盖率报告。

## 3. Static Content Models

### 3.1 `event_definition` Fields

`event_definition` 是一个可触发、可实例化、可静态校验的事件内容资产。

- `schema_version`：`string`，必填。内容结构版本；校验器用它选择 schema。
- `id`：`string`，必填。全局唯一事件定义 ID。
- `version`：`number`，必填。事件定义版本；运行时实例记录创建时使用的版本。
- `domain`：`string`，必填。资产所属 domain，例如 `forest`、`volcano`、`crew_kael`。
- `title`：`string`，必填。内部与内容生产可读标题；是否展示给玩家由 UI 决定。
- `summary`：`string`，必填。事件意图摘要，用于 review、日志模板选择和样例 dry-run 说明。
- `tags`：`string[]`，可选。搜索、筛选、触发索引用标签，例如 `forest`、`beast`、`emergency`。
- `status`：`enum`，必填。内容生产状态：`draft`、`ready_for_test`、`approved`、`disabled`。
- `trigger`：`trigger_definition`，必填。结构化触发声明；`trigger.type` 必须来自固定触发白名单。
- `candidate_selection`：`object`，必填。多个事件满足同一 trigger 时的筛选字段。
  - `priority`：`number`，必填。高优先级先进入候选池。
  - `weight`：`number`，必填。相同优先级和互斥过滤后的抽取权重。
  - `mutex_group`：`string | null`，可选。互斥组；同一 trigger 内同组通常只允许选一个事件。
  - `max_instances_per_trigger`：`number`，必填。单次 trigger 最多创建或推进的实例数。
  - `requires_blocking_slot`：`boolean`，必填。是否需要检查队员 blocking 占用。
- `repeat_policy`：`object`，必填。重复、冷却和历史过滤规则。
  - `scope`：`enum`，必填。`world`、`crew`、`tile`、`crew_tile`、`objective`。
  - `max_trigger_count`：`number | null`，可选。给定 scope 内最多触发次数。
  - `cooldown_seconds`：`number`，必填。给定 scope 内再次触发前的冷却时间。
  - `history_key_template`：`string`，必填。写入 `world_history` 的 key 模板。
  - `allow_while_active`：`boolean`，必填。同一 scope 已有活跃实例时是否允许再触发。
- `event_graph`：`event_graph`，必填。事件内部节点、边和终点。
- `effect_groups`：`effect_group[]`，可选。可复用效果组，供节点通过 `effect_group_refs` 引用。
- `log_templates`：`event_log_template[]`，可选。玩家可见事件摘要模板；禁止存放完整通话文本。
- `content_refs`：`object`，可选。跨资产引用集合。
  - `call_template_ids`：`string[]`，可选。事件图节点引用的通话模板 ID。
  - `item_ids`：`string[]`，可选。事件条件或效果引用的物品 ID。
  - `resource_ids`：`string[]`，可选。事件条件或效果引用的资源 ID。
  - `crew_ids`：`string[]`，可选。事件绑定的特定队员 ID；泛用事件可为空。
- `sample_contexts`：`sample_trigger_context[]`，必填。生产级 dry-run 的最小样例输入；每个 approved 事件至少一个。

`event_definition` 不包含：

- 编辑器布局、节点坐标、注释、review 状态。
- 运行时字段，例如 active event id、当前节点、玩家选择、随机结果。
- 长期 debug transcript 或完整 call transcript。

### 3.2 `trigger_definition` Fields

`trigger_definition` 决定事件何时进入候选池。第一版固定以下 `trigger.type`：

- `arrival`
- `proximity`
- `action_complete`
- `idle_time`
- `call_choice`
- `event_node_finished`
- `objective_created`
- `objective_completed`
- `world_flag_changed`
- `time_wakeup`

字段：

- `type`：`enum`，必填。触发类型，必须来自上方白名单。
- `conditions`：`condition[]`，可选。触发前置条件；全部通过后才进入候选池。
- `probability`：`object`，可选。触发概率声明。
  - `base`：`number`，必填。基础概率，范围 `0..1`。
  - `modifiers`：`probability_modifier[]`，可选。按 condition 调整概率。
  - `min`：`number`，可选。修正后的最低概率。
  - `max`：`number`，可选。修正后的最高概率。
- `required_context`：`string[]`，可选。要求 `trigger_context` 必须提供的字段路径，例如 `crew_id`、`tile_id`。
- `dedupe_key_template`：`string`，可选。同一 tick 或同一动作完成时去重的 key 模板。

### 3.3 `event_graph` Fields

`event_graph` 是事件内部状态机。MVP 不支持 `parallel` / `join`，因此第一版同一事件实例只有一个 `current_node_id`。

- `entry_node_id`：`string`，必填。事件实例创建后进入的第一个节点。
- `nodes`：`event_node[]`，必填。节点列表；`node.id` 在当前事件定义内唯一。
- `edges`：`event_edge[]`，必填。节点间允许的有向边。
  - `from_node_id`：`string`，必填。
  - `to_node_id`：`string`，必填。
  - `via`：`string | null`，可选。边来源，例如 `option_id`、`branch_id`、`auto_next`。
- `terminal_node_ids`：`string[]`，必填。合法终点节点 ID；每条运行路径必须能到达其中之一。
- `graph_rules`：`object`，必填。
  - `acyclic`：`boolean`，必填。MVP 必须为 `true`。
  - `max_active_nodes`：`number`，必填。MVP 固定为 `1`。
  - `allow_parallel_nodes`：`boolean`，必填。MVP 固定为 `false`。

### 3.4 `event_node` Common Fields

所有节点共享以下字段：

- `id`：`string`，必填。当前事件定义内唯一节点 ID。
- `type`：`enum`，必填。固定 9 类：`call`、`wait`、`check`、`random`、`action_request`、`objective`、`spawn_event`、`log_only`、`end`。
- `title`：`string`，必填。节点可读标题。
- `description`：`string`，可选。节点用途说明，属于内容说明，不是编辑器注释。
- `requirements`：`condition[]`，可选。进入节点前必须满足的条件。
- `enter_effect_refs`：`string[]`，可选。进入节点时执行的 `effect_group.id`。
- `exit_effect_refs`：`string[]`，可选。离开节点时执行的 `effect_group.id`。
- `inline_effects`：`effect[]`，可选。节点专属效果；批量生产时优先用 `effect_group_refs` 复用。
- `event_log_template_id`：`string | null`，可选。节点完成后写入玩家可见摘要的模板 ID。
- `history_writes`：`history_write[]`，可选。节点完成时写入的结构化历史 key。
- `blocking`：`blocking_requirement`，必填。节点是否占用队员行动或通讯。
  - `occupies_crew_action`：`boolean`，必填。
  - `occupies_communication`：`boolean`，必填。
  - `blocking_key_template`：`string | null`，可选。占用锁 key。
- `timeout`：`timeout_rule | null`，可选。等待玩家选择、通话接听或行动完成的超时规则。
- `auto_next_node_id`：`string | null`，可选。无分支时的默认下游节点。

### 3.5 `call` Node Fields

`call` 节点创建一次运行时通话。通话只展示文本和收集 `option_id`，不直接结算事件。

- `call_template_id`：`string`，必填。引用 `call_template.id`。
- `speaker_crew_ref`：`target_ref`，必填。发起通话的队员，通常是 `primary_crew`。
- `urgency`：`enum`，必填。`normal`、`urgent`、`emergency`。
- `delivery`：`enum`，必填。`incoming_call`、`auto_report`、`queued_message`。
- `options`：`call_option[]`，必填。实质选项列表。
  - `id`：`string`，必填。稳定逻辑选项 ID。
  - `requirements`：`condition[]`，可选。决定本次 call 是否展示该选项。
  - `effect_refs`：`string[]`，可选。选择该选项后先执行的效果组。
  - `is_default`：`boolean`，可选。超时或自动选择时是否作为默认选项。
- `option_node_mapping`：`Record<option_id, node_id>`，必填。玩家选择到下游节点的映射。
- `on_missed`：`object`，可选。未接或过期后的处理。
  - `next_node_id`：`string | null`，可选。
  - `effect_refs`：`string[]`，可选。
- `expires_in_seconds`：`number | null`，可选。来电过期时间；空值表示不自动过期。

### 3.6 `wait` Node Fields

`wait` 节点把事件推进交给时间系统。等待期可以占用队员行动，也可以只是后台计时。

- `duration_seconds`：`number`，必填。等待持续的游戏秒数。
- `wake_trigger_type`：`enum`，必填。MVP 使用 `time_wakeup` 或 `event_node_finished`。
- `next_node_id`：`string`，必填。等待结束后进入的节点。
- `set_next_wakeup_at`：`boolean`，必填。是否写入 runtime event 的 `next_wakeup_at`。
- `crew_action_during_wait`：`crew_action_patch | null`，可选。等待期间将队员行动改为 `event_waiting`、`guarding_event_site` 等。
- `interrupt_policy`：`enum`，必填。`not_interruptible`、`player_can_cancel`、`event_can_cancel`。
- `on_interrupted`：`object | null`，可选。中断后的下游节点和效果。

### 3.7 `check` Node Fields

`check` 节点执行确定性条件分支，不掷随机数。

- `branches`：`check_branch[]`，必填。
  - `id`：`string`，必填。分支 ID。
  - `conditions`：`condition[]`，必填。全部通过则命中。
  - `next_node_id`：`string`，必填。命中后的下游节点。
  - `effect_refs`：`string[]`，可选。命中时执行的效果组。
- `default_next_node_id`：`string`，必填。没有分支命中时的下游节点。
- `evaluation_order`：`enum`，必填。MVP 固定为 `first_match`。

### 3.8 `random` Node Fields

`random` 节点执行受控随机分支。随机结果需要保存在 runtime event 中，便于解释同一次事件。

- `seed_scope`：`enum`，必填。`event_instance`、`node_entry`、`trigger_context`。
- `branches`：`random_branch[]`，必填。
  - `id`：`string`，必填。随机分支 ID。
  - `weight`：`number`，必填。抽取权重。
  - `conditions`：`condition[]`，可选。分支可参与抽取的前置条件。
  - `next_node_id`：`string`，必填。抽中后的下游节点。
  - `effect_refs`：`string[]`，可选。抽中后执行的效果组。
- `default_next_node_id`：`string | null`，可选。所有分支权重为 0 时的下游节点；缺失则校验失败。
- `store_result_as`：`string`，必填。写入 `event.random_results` 的 key。

### 3.9 `action_request` Node Fields

`action_request` 节点请求或等待一个具体队员行动。它不把行动逻辑并入事件图；行动仍由 crew action state 负责执行。

- `request_id`：`string`，必填。当前节点内的行动请求 ID。
- `action_type`：`enum`，必填。`move`、`survey`、`gather`、`build`、`extract`、`return_to_base`、`custom_handler_action`。
- `target_crew_ref`：`target_ref`，必填。请求哪个队员执行；可为 `primary_crew` 或满足条件的队员。
- `target_tile_ref`：`target_ref | null`，可选。行动目标地块。
- `action_params`：`object`，必填。行动参数；字段由 `action_type` 决定。
- `acceptance_conditions`：`condition[]`，可选。队员能否接受该行动的条件。
- `completion_trigger`：`trigger_definition`，必填。通常为 `action_complete`。
- `on_accepted_node_id`：`string | null`，可选。玩家接受或系统创建行动后的节点。
- `on_completed_node_id`：`string`，必填。行动完成后的节点。
- `on_failed_node_id`：`string`，必填。行动失败、中断或过期后的节点。
- `expires_in_seconds`：`number | null`，可选。行动请求过期时间。
- `occupies_crew_action`：`boolean`，必填。通常为 `true`。

### 3.10 `objective` Node Fields

`objective` 节点创建独立运行时目标，支撑玩家主动派人完成后续行动。它与自动环境触发并存：森林熊、火山喷发这类事件仍可由 arrival/proximity/action_complete 自动触发。

- `objective_template`：`objective_template`，必填。要创建的目标内容。
  - `title`：`string`，必填。玩家可见短标题。
  - `summary`：`string`，必填。玩家可见目标说明。
  - `target_tile_ref`：`target_ref | null`，可选。
  - `eligible_crew_conditions`：`condition[]`，可选。哪些队员可执行。
  - `required_action_type`：`enum`，必填。完成目标需要的行动类型。
  - `required_action_params`：`object`，必填。行动参数。
- `mode`：`enum`，必填。`create_and_wait`、`create_and_continue`。
- `on_created_node_id`：`string | null`，可选。目标创建后的下游节点。
- `on_completed_node_id`：`string`，必填。目标完成后原事件进入的节点。
- `on_failed_node_id`：`string | null`，可选。目标失败或过期后的节点。
- `expires_in_seconds`：`number | null`，可选。目标过期时间。
- `parent_event_link`：`boolean`，必填。MVP 固定为 `true`，让目标完成能回写 parent event。

### 3.11 `spawn_event` Node Fields

`spawn_event` 节点创建另一个 runtime event，用于后续事件、连锁事件或世界后果。

- `event_definition_id`：`string`，必填。要创建的事件定义 ID。
- `spawn_policy`：`enum`，必填。`immediate`、`deferred_until_trigger`。
- `context_mapping`：`Record<string, string>`，必填。把当前 event/context 字段映射到新事件 `trigger_context`。
- `parent_event_link`：`boolean`，必填。是否写入 `parent_event_id` / `child_event_ids`。
- `dedupe_key_template`：`string | null`，可选。防止重复生成同一后续事件。
- `next_node_id`：`string`，必填。生成后当前事件进入的节点。

### 3.12 `log_only` Node Fields

`log_only` 节点只写玩家可见摘要、world history 或轻量效果，不创建 call，不要求玩家选择。

- `event_log_template_id`：`string`，必填。玩家可见摘要模板。
- `effect_refs`：`string[]`，可选。轻量效果组，例如标记地块、写世界 flag。
- `history_writes`：`history_write[]`，可选。
- `next_node_id`：`string`，必填。写完后自动进入下游节点。

### 3.13 `end` Node Fields

`end` 节点结束 runtime event，并执行最终结算。

- `resolution`：`enum`，必填。`resolved`、`cancelled`、`expired`、`failed`。
- `result_key`：`string`，必填。最终结果 key，用于 `world_history.last_result` 和 event summary。
- `final_effect_refs`：`string[]`，可选。最终效果组。
- `event_log_template_id`：`string`，必填。玩家可见最终摘要。
- `history_writes`：`history_write[]`，必填。事件发生、完成、结果等长期事实。
- `cleanup_policy`：`object`，必填。
  - `release_blocking_claims`：`boolean`，必填。结束时释放队员行动/通讯占用。
  - `delete_active_calls`：`boolean`，必填。MVP 固定为 `true`。
  - `keep_player_summary`：`boolean`，必填。MVP 固定为 `true`。

### 3.14 `call_template` Fields

`call_template` 把节点逻辑选项渲染成角色化通话。模板只决定展示，不决定分支。

- `schema_version`：`string`，必填。
- `id`：`string`，必填。全局唯一模板 ID。
- `version`：`number`，必填。
- `domain`：`string`，必填。
- `event_definition_id`：`string`，必填。服务的事件定义 ID。
- `node_id`：`string`，必填。服务的 `call` 节点 ID。
- `render_context_fields`：`string[]`，必填。模板会读取的上下文字段，例如 `crew_id`、`crew_voice_type`、`personality_tags`。
- `opening_lines`：`text_variant_group`，必填。通话开场文本变体。
- `body_lines`：`text_variant_group[]`，可选。补充描述文本变体。
- `option_lines`：`Record<option_id, text_variant_group>`，必填。每个 key 必须匹配节点 `options[].id`。
- `fallback_order`：`string[]`，必填。文案匹配优先级；MVP 支持 `crew_id`、`crew_voice_type`、`personality_tags`、`expertise_tags`、`crew_conditions`、`event_pressure`、`previous_choices`、`default`。
- `default_variant_required`：`boolean`，必填。MVP 固定为 `true`，每组文本必须能落到默认 variant。

`text_variant_group` 字段：

- `variants`：`text_variant[]`，必填。
- `max_lines`：`number`，可选。最多选几条文本。
- `selection`：`enum`，必填。`best_match`、`first_match`、`weighted_random`。

`text_variant` 字段：

- `id`：`string`，必填。当前模板内唯一。
- `text`：`string`，必填。展示给玩家的文本，可使用受限占位符。
- `when`：`condition[]`，可选。命中条件。
- `priority`：`number`，必填。多个 variant 命中时先按 priority 排序。
- `weight`：`number`，可选。`weighted_random` 时使用。

变体匹配与 fallback 规则：

- 先过滤 `when` 全部通过的 variant。
- 再按 `priority`、`fallback_order` 的匹配精度、`id` 稳定顺序选择。
- 没有 variant 命中时，必须使用 `default` variant。
- `option_lines` 中缺少节点 `option_id` 时校验失败。
- `option_lines` 中出现节点不存在的 `option_id` 时校验失败。
- 玩家点击任何展示文案，运行时都回写稳定 `option_id`。

### 3.15 `condition` Fields

`condition` 使用结构化 JSON 表达常见规则；复杂情况只能通过白名单 `handler_type + params` 扩展。

通用字段：

- `type`：`enum`，必填。condition 类型。
- `target`：`target_ref | null`，可选。读取对象，例如 `primary_crew`、`event_tile`、`world_flags`。
- `field`：`string | null`，可选。目标字段路径，例如 `attributes.perception`。
- `op`：`enum | null`，可选。比较操作，例如 `equals`、`not_equals`、`gt`、`gte`、`lt`、`lte`、`includes`、`not_includes`。
- `value`：`unknown`，可选。比较值；schema 按 `field` 和 `op` 校验类型。
- `conditions`：`condition[]`，可选。组合条件使用。
- `handler_type`：`string | null`，可选。白名单 handler 类型。
- `params`：`object`，可选。handler 或特定 condition 的参数。
- `description`：`string`，可选。给内容生产者的规则说明；不参与运行时判定。

常见 `condition.type`：

- `all_of`：全部子条件通过。
- `any_of`：任意子条件通过。
- `not`：子条件取反。
- `compare_field`：读取目标字段并比较。
- `has_tag`：目标标签集合包含指定 tag。
- `lacks_tag`：目标标签集合不包含指定 tag。
- `has_condition`：队员具有指定状态，例如 `light_wound`。
- `attribute_check`：队员属性达到阈值。
- `inventory_has_item`：指定 inventory 拥有物品。
- `resource_amount`：基地、队员或地块资源数量满足条件。
- `tile_discovery_state`：地块发现状态满足条件。
- `tile_survey_state`：地块调查状态满足条件。
- `world_flag_equals`：世界 flag 等于指定值。
- `world_history_exists`：指定历史 key 已存在。
- `world_history_count`：指定历史 key 触发次数满足条件。
- `objective_status`：目标处于指定状态。
- `event_status`：事件实例处于指定状态。
- `event_current_node`：事件当前节点匹配。
- `crew_action_status`：队员行动状态匹配。
- `time_compare`：当前游戏时间与给定时间或 deadline 比较。
- `handler_condition`：调用白名单 condition handler。

### 3.16 `effect` Fields

`effect` 是结构化结算动作。它必须声明目标、参数、失败策略和记录策略。

通用字段：

- `id`：`string`，必填。当前 effect group 内唯一。
- `type`：`enum`，必填。效果类型。
- `target`：`target_ref`，必填。写入对象。
- `params`：`object`，必填。效果参数；schema 由 `type` 决定。
- `failure_policy`：`enum`，必填。`fail_event`、`skip_effect`、`skip_group`、`retry_later`。
- `record_policy`：`object`，必填。
  - `write_event_log`：`boolean`，必填。是否写玩家可见摘要。
  - `write_world_history`：`boolean`，必填。是否写结构化历史。
  - `history_key_template`：`string | null`，可选。
- `idempotency_key_template`：`string | null`，可选。防止重复执行同一效果。
- `handler_type`：`string | null`，可选。复杂效果的白名单 handler。

常见 `target.type`：

- `primary_crew`
- `related_crew`
- `crew_id`
- `event_tile`
- `tile_id`
- `active_event`
- `parent_event`
- `child_event`
- `objective_id`
- `crew_inventory`
- `base_inventory`
- `base_resources`
- `tile_resources`
- `world_flags`
- `world_history`
- `event_log`

常见 `effect.type`：

- `add_crew_condition`：给队员添加状态。
- `remove_crew_condition`：移除队员状态。
- `update_crew_attribute`：修改体能、敏捷、智力、感知、运气等属性。
- `add_personality_tag`：添加性格标签。
- `remove_personality_tag`：移除或弱化性格标签。
- `add_expertise_tag`：添加或解锁专长标签。
- `update_crew_location`：改变队员所在地块。
- `create_crew_action`：创建队员行动。
- `cancel_crew_action`：取消队员行动。
- `update_crew_action`：更新行动状态、进度或关联事件。
- `update_tile_field`：更新地块字段。
- `add_tile_tag`：给地块添加标签。
- `add_danger_tag`：给地块添加危险标签。
- `set_discovery_state`：设置地块发现状态。
- `set_survey_state`：设置地块调查状态。
- `add_event_mark`：给地块添加事件标记。
- `add_item`：向 inventory 添加物品。
- `remove_item`：从 inventory 移除物品。
- `transfer_item`：在两个 inventory 间转移物品。
- `add_resource`：增加资源。
- `remove_resource`：减少资源。
- `update_tile_resource`：更新地块资源节点。
- `create_objective`：创建运行时目标。
- `update_objective`：更新目标状态或可见性。
- `complete_objective`：完成目标并触发 `objective_completed`。
- `fail_objective`：让目标失败或过期。
- `set_world_flag`：设置世界 flag。
- `increment_world_counter`：递增世界计数器。
- `write_world_history`：写结构化历史。
- `add_event_log`：写玩家可见事件摘要。
- `add_diary_entry`：追加队员日记。
- `spawn_event`：创建后续事件实例。
- `unlock_event_definition`：解锁后续事件定义或事件池。
- `handler_effect`：调用白名单 effect handler。

### 3.17 `handler_registry` and Presets

handler 只用于结构化字段难以表达的复杂规则。handler 不是任意脚本入口。

`handler_definition` 字段：

- `handler_type`：`string`，必填。全局唯一 handler 名。
- `kind`：`enum`，必填。`condition`、`effect`、`candidate_weight`、`action_params`。
- `description`：`string`，必填。handler 做什么、何时使用。
- `params_schema_ref`：`string`，必填。参数 schema 引用。
- `allowed_target_types`：`string[]`，必填。允许读写的 target 类型。
- `deterministic`：`boolean`，必填。相同输入是否必须产生相同输出。
- `uses_random`：`boolean`，必填。是否需要 runtime random source。
- `failure_policy`：`enum`，必填。默认失败策略。
- `sample_fixtures`：`string[]`，必填。dry-run 样例引用。

`preset` 字段：

- `id`：`string`，必填。全局唯一 preset ID。
- `kind`：`enum`，必填。`condition`、`effect`、`effect_group`、`probability_modifier`。
- `expands_to`：`object`，必填。展开后的结构化字段或 handler 调用。
- `params`：`object`，可选。生产时可填的少量参数。
- `description`：`string`，必填。

## 4. Runtime Models

### 4.1 Runtime `event` Fields

runtime `event` 是某个 `event_definition` 在一局游戏中的实例。

- `id`：`string`，必填。事件实例 ID。
- `event_definition_id`：`string`，必填。静态事件定义 ID。
- `event_definition_version`：`number`，必填。创建时使用的定义版本。
- `status`：`enum`，必填。`active`、`waiting_call`、`waiting_time`、`waiting_action`、`waiting_objective`、`resolving`、`resolved`、`cancelled`、`expired`、`failed`。
- `current_node_id`：`string`，必填。当前节点 ID；resolved 后保存最终节点或清空由实现决定。
- `primary_crew_id`：`string | null`，可选。主要关联队员。
- `related_crew_ids`：`string[]`，必填。其他关联队员。
- `primary_tile_id`：`string | null`，可选。主要关联地块。
- `related_tile_ids`：`string[]`，必填。其他关联地块。
- `parent_event_id`：`string | null`，可选。来源事件实例。
- `child_event_ids`：`string[]`，必填。由本事件创建的子事件实例。
- `objective_ids`：`string[]`，必填。本事件创建或等待的目标。
- `active_call_id`：`string | null`，可选。当前未结束的 call。
- `selected_options`：`Record<node_id, option_id>`，必填。玩家在各 call 节点选择的逻辑选项。
- `random_results`：`Record<key, random_result>`，必填。随机节点结果。
- `blocking_claim_ids`：`string[]`，必填。本事件持有的行动/通讯占用锁。
- `created_at`：`number`，必填。创建时游戏秒。
- `updated_at`：`number`，必填。最后推进时游戏秒。
- `deadline_at`：`number | null`，可选。事件最终期限。
- `next_wakeup_at`：`number | null`，可选。下次由时间系统唤醒的游戏秒。
- `trigger_context_snapshot`：`trigger_context`，必填。创建或推进事件时的关键上下文快照。
- `history_keys`：`string[]`，必填。本事件已写入的长期历史 key。
- `result_key`：`string | null`，可选。最终结果 key。
- `result_summary`：`string | null`，可选。resolved 后的玩家可见摘要。

状态生命周期：

- `active`：事件正在同步进入或离开节点。
- `waiting_call`：事件等待玩家接听、选择或 call 超时。
- `waiting_time`：事件等待 `next_wakeup_at`。
- `waiting_action`：事件等待一个 crew action 完成。
- `waiting_objective`：事件等待独立 objective 完成。
- `resolving`：事件正在执行 end 节点效果。
- `resolved`：事件正常结束；长期只保留摘要、history 和 event_log。
- `cancelled`：事件被玩家或系统取消。
- `expired`：事件超过 deadline 或 timeout。
- `failed`：内容错误或运行时不可恢复错误；研发期可硬失败。

### 4.2 Runtime `call` Fields

runtime `call` 是一次通讯表现。玩家存档只保存活跃 call；事件结束后删除完整 call 细节。

- `id`：`string`，必填。call 实例 ID。
- `event_id`：`string`，必填。来源事件实例。
- `event_node_id`：`string`，必填。来源 call 节点。
- `call_template_id`：`string`，必填。使用的通话模板。
- `crew_id`：`string`，必填。发起或参与通话的队员。
- `status`：`enum`，必填。`incoming`、`connected`、`awaiting_choice`、`ended`、`missed`、`expired`、`cancelled`。
- `created_at`：`number`，必填。
- `connected_at`：`number | null`，可选。
- `ended_at`：`number | null`，可选。
- `expires_at`：`number | null`，可选。
- `render_context_snapshot`：`object`，必填。渲染时读取的关键上下文摘要。
- `rendered_lines`：`rendered_line[]`，必填。已经展示的台词。
- `available_options`：`call_option_runtime[]`，必填。玩家可选的逻辑选项。
- `selected_option_id`：`string | null`，可选。玩家选择的逻辑 `option_id`。
- `blocking_claim_id`：`string | null`，可选。占用通讯或行动时的锁 ID。

`rendered_line` 字段：

- `template_variant_id`：`string`，必填。命中的文本 variant。
- `text`：`string`，必填。展示文本。
- `speaker_crew_id`：`string`，必填。

`call_option_runtime` 字段：

- `option_id`：`string`，必填。逻辑选项 ID。
- `template_variant_id`：`string`，必填。命中的按钮文本 variant。
- `text`：`string`，必填。展示给玩家的按钮文案。
- `is_default`：`boolean`，必填。

长期保留规则：

- active call 可保存渲染结果，避免页面刷新后重渲染出不同文本。
- event resolved 后，player save 删除完整 call。
- player save 可通过 `event_log.summary` 说明玩家做过的关键选择，但不保存完整台词、隐藏选项或调试记录。

### 4.3 Runtime `objective` Fields

`objective` 是事件创建的独立运行时目标，用于玩家主动安排后续行动。它不是完整 quest system。

- `id`：`string`，必填。目标实例 ID。
- `status`：`enum`，必填。`available`、`assigned`、`in_progress`、`completed`、`failed`、`expired`、`cancelled`。
- `parent_event_id`：`string`，必填。创建目标的事件实例。
- `created_by_node_id`：`string`，必填。创建目标的节点。
- `title`：`string`，必填。玩家可见短标题。
- `summary`：`string`，必填。玩家可见目标说明。
- `target_tile_id`：`string | null`，可选。
- `eligible_crew_conditions`：`condition[]`，必填。可接目标的队员条件。
- `required_action_type`：`string`，必填。
- `required_action_params`：`object`，必填。
- `assigned_crew_id`：`string | null`，可选。
- `action_id`：`string | null`，可选。执行该目标的 crew action。
- `created_at`：`number`，必填。
- `assigned_at`：`number | null`，可选。
- `completed_at`：`number | null`，可选。
- `deadline_at`：`number | null`，可选。
- `completion_trigger_type`：`enum`，必填。通常为 `objective_completed` 或 `action_complete`。
- `result_key`：`string | null`，可选。完成或失败结果。

生命周期：

- `available`：目标已出现，玩家尚未派人。
- `assigned`：玩家已选择队员，但行动尚未开始。
- `in_progress`：关联 crew action 正在执行。
- `completed`：行动完成并触发 parent event 推进。
- `failed` / `expired` / `cancelled`：目标不能再完成；按节点规则推进或结束 parent event。

### 4.4 `trigger_context` Fields

`trigger_context` 是事件候选筛选和事件推进的输入快照。

- `trigger_type`：`enum`，必填。固定触发类型之一。
- `occurred_at`：`number`，必填。触发发生的游戏秒。
- `source`：`enum`，必填。`crew_action`、`tile_system`、`call`、`event_node`、`objective`、`world_flag`、`time_system`。
- `crew_id`：`string | null`，可选。
- `tile_id`：`string | null`，可选。
- `action_id`：`string | null`，可选。
- `event_id`：`string | null`，可选。
- `event_definition_id`：`string | null`，可选。
- `node_id`：`string | null`，可选。
- `call_id`：`string | null`，可选。
- `objective_id`：`string | null`，可选。
- `selected_option_id`：`string | null`，可选。
- `world_flag_key`：`string | null`，可选。
- `previous_value`：`unknown`，可选。
- `new_value`：`unknown`，可选。
- `proximity`：`object | null`，可选。
  - `origin_tile_id`：`string`，必填。
  - `nearby_tile_ids`：`string[]`，必填。
  - `distance`：`number`，必填。
- `payload`：`object`，可选。触发类型专属补充字段；必须由 schema 约束。

### 4.5 `event_candidate_selection` Fields

候选选择分两层：静态定义提供筛选规则，运行时记录一次选择结果。MVP 不要求长期保存完整候选报告，但 dry-run 必须能输出。

静态 `candidate_selection` 字段见 `event_definition`。

运行时 `event_candidate_selection_result` 字段：

- `trigger_context`：`trigger_context`，必填。
- `candidate_event_definition_ids`：`string[]`，必填。按 trigger 索引取出的候选。
- `passed_condition_ids`：`string[]`，可选。通过条件的事件定义 ID。
- `filtered_by_history_ids`：`string[]`，可选。因历史/冷却被过滤的 ID。
- `filtered_by_mutex_ids`：`string[]`，可选。因互斥组被过滤的 ID。
- `filtered_by_blocking_ids`：`string[]`，可选。因队员 blocking slot 不可用被过滤的 ID。
- `selected_event_definition_ids`：`string[]`，必填。最终创建或推进的事件定义。
- `roll_seed`：`string | null`，可选。权重抽取使用的种子。
- `created_event_ids`：`string[]`，必填。创建出的 runtime event。

选择规则：

- 先按 `trigger_type` 取候选，再执行 `trigger.conditions`。
- 再按 `repeat_policy`、`world_history`、`cooldown_seconds` 过滤。
- 再按 `mutex_group` 去重。
- 再检查 blocking slot；后台非阻塞事件可继续生成。
- 最后按 `priority` 分层，用 `weight` 抽取。

## 5. Related Game Models

### 5.1 `crew_state` Event-facing Fields

事件系统只依赖以下队员字段；其他角色表现字段可由 crew 系统自行维护。

- `id`：`string`，必填。
- `display_name`：`string`，必填。
- `tile_id`：`string`，必填。当前所在地块。
- `status`：`enum`，必填。`idle`、`moving`、`acting`、`in_event`、`unavailable`、`lost_contact`。
- `attributes`：`object`，必填。`strength`、`agility`、`intelligence`、`perception`、`luck`。
- `personality_tags`：`string[]`，必填。
- `expertise_tags`：`string[]`，必填。
- `condition_tags`：`string[]`，必填。受伤、疲劳、恐惧等状态标签。
- `communication_state`：`enum`，必填。`available`、`busy_call`、`blocked`、`lost_contact`。
- `current_action_id`：`string | null`，可选。
- `blocking_event_id`：`string | null`，可选。占用行动的事件。
- `blocking_call_id`：`string | null`，可选。占用通讯的 call。
- `background_event_ids`：`string[]`，必填。引用该队员但不占用行动/通讯的事件。
- `inventory_id`：`string`，必填。队员背包 inventory。
- `diary_entry_ids`：`string[]`，必填。
- `event_history_keys`：`string[]`，必填。队员级历史索引。

### 5.2 `crew_action_state` Fields

队员行动是独立状态机。事件通过 `action_request` 或 `objective` 请求行动，不直接吞并行动模型。

- `id`：`string`，必填。
- `crew_id`：`string`，必填。
- `type`：`enum`，必填。`move`、`survey`、`gather`、`build`、`extract`、`return_to_base`、`event_waiting`、`guarding_event_site`。
- `status`：`enum`，必填。`queued`、`active`、`paused`、`completed`、`failed`、`interrupted`、`cancelled`。
- `source`：`enum`，必填。`player_command`、`event_action_request`、`objective`、`system`。
- `parent_event_id`：`string | null`，可选。
- `objective_id`：`string | null`，可选。
- `action_request_id`：`string | null`，可选。
- `from_tile_id`：`string | null`，可选。
- `to_tile_id`：`string | null`，可选。
- `target_tile_id`：`string | null`，可选。
- `path_tile_ids`：`string[]`，可选。
- `started_at`：`number | null`，可选。
- `ends_at`：`number | null`，可选。
- `progress_seconds`：`number`，必填。
- `duration_seconds`：`number`，必填。
- `can_interrupt`：`boolean`，必填。
- `interrupt_duration_seconds`：`number`，必填。
- `blocking_claim_id`：`string | null`，可选。
- `completion_trigger_context`：`trigger_context | null`，可选。完成时发出的 trigger 输入。

### 5.3 `tile_state` Event-facing Fields

地块模型需要支撑环境触发、可见性、资源、危险和历史标记。

- `id`：`string`，必填。
- `coordinates`：`object`，必填。`x`、`y`。
- `terrain_type`：`string`，必填。
- `tags`：`string[]`，必填。地形、生态、剧情标签。
- `danger_tags`：`string[]`，必填。危险来源标签，例如 `large_beast_activity`、`volcanic_activity`。
- `discovery_state`：`enum`，必填。`unknown`、`known`、`visited`、`mapped`。
- `survey_state`：`enum`，必填。`unsurveyed`、`surveying`、`surveyed`、`depleted`。
- `visibility`：`enum`，必填。`hidden`、`visible`、`revealed_by_event`。
- `current_crew_ids`：`string[]`，必填。
- `resource_nodes`：`tile_resource_node[]`，必填。
- `site_objects`：`site_object[]`，必填。遗物、营地痕迹、异常设备等可交互对象。
- `buildings`：`building_state[]`，必填。
- `event_marks`：`event_mark[]`，必填。事件写入的地块标记。
- `history_keys`：`string[]`，必填。地块级历史索引。
- `proximity_radius`：`number`，可选。用于 proximity trigger 的默认邻近范围。

### 5.4 `item`, `resource`, and `inventory` Fields

事件系统区分三类 target：`crew_inventory`、`base_inventory` / `base_resources`、`tile_resources`。

`item_definition` 字段：

- `id`：`string`，必填。
- `name`：`string`，必填。
- `tags`：`string[]`，必填。
- `stackable`：`boolean`，必填。
- `event_use_tags`：`string[]`，可选。事件条件和效果可引用的用途标签。

`inventory_state` 字段：

- `id`：`string`，必填。
- `owner_type`：`enum`，必填。`crew`、`base`、`tile`。
- `owner_id`：`string`，必填。
- `items`：`inventory_item_stack[]`，必填。
- `resources`：`Record<resource_id, number>`，必填。

`inventory_item_stack` 字段：

- `item_id`：`string`，必填。
- `quantity`：`number`，必填。
- `instance_tags`：`string[]`，可选。

`tile_resource_node` 字段：

- `id`：`string`，必填。
- `resource_id`：`string`，必填。
- `amount`：`number`，必填。
- `state`：`enum`，必填。`hidden`、`discovered`、`depleted`。
- `event_tags`：`string[]`，可选。

### 5.5 `event_log` Fields

`event_log` 是玩家可见历史。它保存摘要，不保存完整通话。

- `id`：`string`，必填。
- `event_id`：`string`，必填。
- `event_definition_id`：`string`，必填。
- `occurred_at`：`number`，必填。游戏秒。
- `summary`：`string`，必填。玩家可见短文本。
- `crew_ids`：`string[]`，必填。
- `tile_ids`：`string[]`，必填。
- `objective_ids`：`string[]`，可选。
- `result_key`：`string | null`，可选。
- `importance`：`enum`，必填。`minor`、`normal`、`major`、`critical`。
- `visibility`：`enum`，必填。`player_visible`、`hidden_until_resolved`。
- `history_keys`：`string[]`，必填。与该摘要相关的结构化历史 key。

### 5.6 `world_history` and `world_flags` Fields

`world_history` 保存可查询事实；`world_flags` 保存当前世界状态。

`world_history_entry` 字段：

- `key`：`string`，必填。结构化历史 key。
- `scope`：`enum`，必填。`world`、`crew`、`tile`、`crew_tile`、`objective`、`event`。
- `event_definition_id`：`string | null`，可选。
- `event_id`：`string | null`，可选。
- `crew_id`：`string | null`，可选。
- `tile_id`：`string | null`，可选。
- `objective_id`：`string | null`，可选。
- `first_triggered_at`：`number`，必填。
- `last_triggered_at`：`number`，必填。
- `trigger_count`：`number`，必填。
- `last_result`：`string | null`，可选。
- `cooldown_until`：`number | null`，可选。
- `value`：`unknown`，可选。少量结构化事实值。

`world_flag` 字段：

- `key`：`string`，必填。
- `value`：`boolean | number | string`，必填。
- `value_type`：`enum`，必填。`boolean`、`number`、`string`。
- `created_at`：`number`，必填。
- `updated_at`：`number`，必填。
- `source_event_id`：`string | null`，可选。
- `tags`：`string[]`，可选。

### 5.7 `save_state` Fields

`save_state` 保存运行时状态，不保存完整静态内容资产。

- `schema_version`：`string`，必填。新模型版本；旧版本可以硬失败。
- `created_at_real_time`：`string`，必填。
- `updated_at_real_time`：`string`，必填。
- `elapsed_game_seconds`：`number`，必填。
- `crew`：`Record<crew_id, crew_state>`，必填。
- `crew_actions`：`Record<action_id, crew_action_state>`，必填。
- `tiles`：`Record<tile_id, tile_state>`，必填。
- `inventories`：`Record<inventory_id, inventory_state>`，必填。
- `active_events`：`Record<event_id, event>`，必填。只保存未结束事件。
- `active_calls`：`Record<call_id, call>`，必填。只保存未结束 call。
- `objectives`：`Record<objective_id, objective>`，必填。保存未完成和已完成但仍影响 UI 的目标。
- `event_logs`：`event_log[]`，必填。玩家可见事件摘要。
- `world_history`：`Record<history_key, world_history_entry>`，必填。
- `world_flags`：`Record<flag_key, world_flag>`，必填。
- `rng_state`：`object | null`，可选。运行时随机状态；具体实现决定。

`save_state` 禁止保存：

- 完整 `event_definition` 或 `call_template`。
- 已结束 call 的完整台词和按钮文本。
- 长期 debug trace、隐藏选项原因、编辑器模拟记录。
- 编辑器布局、注释、review、覆盖率或质量报告。

## 6. Lifecycle Rules

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
- **blocking rule**：同一队员的 `blocking_event_id`、`blocking_call_id` 或 blocking `current_action_id` 同时只能有一个；后台事件只能写入 `background_event_ids`。
- **history rule**：冷却、一次性事件和后续事件解锁依赖 `world_history`，不依赖玩家可读长文本。
- **save rule**：保存时只保留活跃 event/call、objective、玩家摘要、world history 和 world flags；旧 save schema 可直接失败。

## 7. Validation Rules

生产级静态校验是 MVP 必须完成的内容。编辑器级覆盖率、质量评分和概率报告是 TODO。

Schema 校验：

- 所有资产必须通过对应 JSON Schema。
- Schema 使用 discriminated union：先读 `type`，再校验该类型必填字段。
- 禁止未声明字段；尤其禁止运行时资产出现 editor metadata。
- `schema_version` 必须被当前工具支持。

ID / ref 校验：

- `event_definition.id` 全局唯一。
- `call_template.id` 全局唯一。
- `event_graph.nodes[].id` 在当前事件定义内唯一。
- `event_graph.edges` 引用的节点必须存在。
- `terminal_node_ids` 必须引用 `end` 节点或合法终点节点。
- `call_template.event_definition_id` 和 `node_id` 必须能解析。
- `effect_refs`、`event_log_template_id`、`item_id`、`resource_id`、`crew_id`、`tile_id` 必须能解析。

Graph 校验：

- `entry_node_id` 必须存在。
- 图必须无环。
- 所有节点必须可从 entry 到达，除非显式标记为 disabled。
- 每个非终点节点必须至少有一条退出路径。
- 每个可达路径必须能到达 terminal node。
- `call.options[].id` 必须全部出现在 `option_node_mapping`。
- `check.branches[].next_node_id`、`random.branches[].next_node_id`、`auto_next_node_id` 必须存在。
- MVP 禁止 `parallel` 和 `join` 节点。

Template 校验：

- `call_template.option_lines` 的 key 必须与对应 call 节点 `options[].id` 完全匹配。
- 每个 `option_id` 至少有一个默认 variant。
- `fallback_order` 引用的字段必须来自 `render_context_fields` 或标准 render context。
- 模板条件使用合法 `condition`。
- 模板文本占位符必须能从 render context 解析。

Condition / effect 校验：

- `condition.type`、`effect.type` 必须来自白名单。
- `target.type` 必须支持对应读写。
- `field` 必须存在于目标模型的事件可访问字段。
- `op` 必须支持该字段类型。
- `value` 类型必须匹配字段和 op。
- `effect.params` 必须符合该 `effect.type` 的 schema。
- `failure_policy` 必须显式声明。
- 写长期历史的 effect 必须声明 `history_key_template`。

Handler 校验：

- `handler_type` 必须存在于 `handler_registry`。
- handler `kind` 必须匹配使用位置。
- `params` 必须通过 `params_schema_ref`。
- handler 只能访问 `allowed_target_types`。
- `uses_random = true` 的 handler 必须接入 runtime random source，不能调用外部随机。
- 每个 approved handler 必须有 sample fixture。

Sample dry-run 校验：

- 每个 `approved` event_definition 至少包含一个 `sample_contexts`。
- dry-run 必须能从 trigger 进入 entry node。
- dry-run 必须覆盖至少一条 terminal path。
- dry-run 必须解析所有 call template 和 option mapping。
- dry-run 必须验证 effect target、handler params、history writes 和 event_log 输出。
- dry-run 不要求覆盖所有 variant；variant 覆盖率报告属于编辑器级 TODO。

## 8. Five Sample Event Coverage Matrix

五个样例事件用于验证模型覆盖面。它们不要求在本文写成完整 JSON。

- **S1：`forest_trace_small_camp`，普通发现不打断**
  - 触发：`action_complete`，队员完成森林地块调查。
  - 节点：`log_only` -> `end`，可选非阻塞 `call` 作为自动回报。
  - 覆盖模型：`tile_state.event_marks`、`event_log`、`world_history`、非 blocking event。
  - 验证点：事件可作为世界反馈存在，不抢占队员行动或通讯。

- **S2：`forest_beast_encounter`，紧急多通话**
  - 触发：`action_complete` 或 `proximity`，森林危险条件满足。
  - 节点：`call` -> `wait` -> `call` -> `random` -> `end`。
  - 覆盖模型：blocking event、blocking call、`selected_options`、`random_results`、`crew_state.condition_tags`、`tile_state.danger_tags`。
  - 验证点：一个 event 可生成多次 call；call 文案不决定分支，`option_id` 决定分支。

- **S3：`mountain_signal_probe`，等待节点与时间压力**
  - 触发：`arrival` 或 `action_complete`，山地异常反光被发现。
  - 节点：`call` -> `wait` -> `check` / `random` -> `call` -> `end`。
  - 覆盖模型：`next_wakeup_at`、`time_wakeup`、`event_node_finished`、`crew_action_state.event_waiting`。
  - 验证点：等待是事件图一等节点，时间系统能推进事件。

- **S4：`volcanic_ash_trace`，跨队员 objective**
  - 触发：`action_complete`，Lin Xia 在沙漠发现火山灰沉积。
  - 节点：`call` -> `objective` -> `wait` 或 `waiting_objective` -> `end`。
  - 覆盖模型：runtime `objective`、任意符合条件队员执行、`objective_completed`、parent event 回写。
  - 验证点：事件能生成独立目标；Kael 完成行动后推进 Lin Xia 的 parent event。

- **S5：`lost_relic_argument`，长期角色和世界后果**
  - 触发：`arrival` 或 `action_complete`，Kael 发现旧世界遗物。
  - 节点：`call` -> `wait` -> `call` -> `check` -> 多个 `end`。
  - 覆盖模型：`call_template` 变体、`personality_tags` 改变、`site_objects` 删除、`world_flags`、`spawn_event` / `unlock_event_definition`、日记追加。
  - 验证点：最终选项能改变角色、地图、后续事件池和玩家可见摘要。

## 9. Out of Scope / TODO

本轮不做：

- 事件编辑器 web route、图编辑 UI、预览面板、资产管理页面。
- 编辑器元数据文件格式：layout、notes、review、preview cases、编辑器筛选状态。
- 玩家长期完整通讯档案、完整 debug trace、隐藏选项原因回放。
- 旧事件 JSON 兼容层、旧 `localStorage` 迁移、生产环境版本升级提示。
- 完整 quest system、奖励系统、任务优先级 UI。
- 关系、士气、天气、昼夜、生态扩散、势力控制等更大模拟系统。

需要记录到项目 TODO 的两类后续工作：

- **Runtime / Model TODO**：`parallel` 和 `join` 节点。MVP 固定 9 类节点，不支持多活跃节点和汇合；未来若要支持并行事件阶段，需要扩展 `event_graph.graph_rules`、runtime `current_node_ids` 和 join 校验。
- **Editor Quality TODO**：编辑器级覆盖率、质量、概率和 variant 报告。包括 variant 命中率、隐藏选项报告、事件池概率分析、不可见分支报告、文本长度报告和质量评分；这些不进入运行时资产。
