---
title: 事件系统
scope: system
last_updated: 2026-04-28
maintained_by: organize-wiki
---

<!--
本文件由 organize-wiki skill 维护。
请不要直接手工修改本文件；改动应当通过：
1. 用 game-design-brainstorm skill 写一份新的策划案
2. 用 organize-wiki skill 把策划案合入本文件
-->

# 事件系统

## 1. 概述（What & Why）

事件系统负责把队员行动、地块状态、时间推进和玩家通话选择转化为可验证、可推进、可结算的世界反馈。它不只是“行动完成后掷一次事件表”，而是一套面向批量内容生产的程序模型：静态事件资产定义触发、条件、事件图、通话模板和效果；运行时事件保存节点进度、通话实例、等待时间、目标和长期历史。

事件系统支撑探索反馈、紧急来电、多段通话、等待节点、跨队员目标和长期世界后果。内容生产者可以用结构化 JSON 生产事件，程序通过白名单 condition/effect handler 和生产级静态校验保证事件能被运行时安全执行。

事件系统不承载所有普通玩家指令。通讯台 / 通话层负责创建移动、原地待命、停止当前行动、调查当前区域四类基础行动；事件系统消费 `arrival`、`action_complete`、`idle_time` 和 `call_choice` 等事实信号，并把世界反馈表现为日志、runtime call、objective、行动请求或状态变化。取样、修复、交易、使用道具和撤离等剧情动作由结构化事件提供专属选项。

## 2. 设计意图（Design Intent）

事件系统的核心体验是“世界会对玩家派出去的人产生具体回应”。玩家派队员移动、调查、待命、停止当前行动或处理通话后，事件把环境、人物、风险和资源变化反馈给玩家，让地图探索不只是静态格子。

事件应当形成三类张力：普通发现提供持续反馈，紧急事件制造通话压力，长期后果改变角色、地块、事件池或世界状态。系统要允许大批量事件被独立 review、校验和复用，同时避免任意脚本把状态写坏。

通话是事件表现层，不是事件逻辑本身。通话模板根据队员、标签、状态和事件压力渲染台词；玩家点击的展示文本最终回写为稳定的 `option_id`，由事件图决定下游节点和结算。

## 3. 核心概念与术语（Core Concepts & Terminology）

- **事件定义（event_definition）**：静态内容资产，声明触发入口、候选选择、重复策略、事件图、通话模板、效果组、日志模板和样例上下文。
- **事件图（event_graph）**：事件内部状态机，由节点和边组成。运行时事件通过 `current_node_id` 推进。
- **事件节点（event_node）**：事件图中的执行单元，类型包括 `call`、`wait`、`check`、`random`、`action_request`、`objective`、`spawn_event`、`log_only`、`end`。
- **运行时事件（runtime event）**：某个事件定义在一局游戏中的实例，保存当前节点、相关队员/地块、选择、随机结果、目标、唤醒时间和最终结果。
- **运行时通话（runtime call）**：一次通讯表现，来源于 `call` 节点，只负责展示文本、可选项和玩家选择。
- **通话模板（call_template）**：把逻辑选项渲染成角色化台词的静态资产；模板不能反向决定事件分支。
- **触发上下文（trigger_context）**：事件候选筛选和推进的输入快照，例如行动完成、抵达地块、通话选择、目标完成或时间唤醒。
- **条件（condition）**：结构化规则表达，用于筛选事件、显示选项、进入节点和分支判断。
- **效果（effect）**：结构化结算动作，通过声明 target、params、失败策略和记录策略写入游戏状态。
- **目标（objective）**：事件创建的独立运行时目标，允许玩家安排任意符合条件的队员完成后续行动并回写 parent event。
- **世界历史（world_history）**：结构化长期事实，用于冷却、一次性事件、后续事件解锁和历史条件判断。
- **玩家可见事件日志（event_log）**：玩家长期可见摘要，解释发生了什么和造成了什么后果，不保存完整通话细节。
- **blocking 占用**：同一队员同一时间最多只有一个事件、通话或行动请求占用行动或通讯；后台事件只能记录引用。

## 4. 核心循环与玩家体验（Core Loop & Player Experience）

### 4.1 玩家旅程

1. 玩家通过通讯台或通话给队员下达移动、待命、停止、调查四类基础行动；撤离等特殊处理可以由事件选项桥接为真实行动。
2. 队员行动、地块变化、通话选择、目标完成或时间唤醒生成 `trigger_context`。
3. 事件系统按触发类型、条件、历史、冷却、互斥、blocking slot、优先级和权重筛选候选事件。
4. 选中的事件创建或推进 runtime event，并进入当前事件节点。
5. `call` 节点生成 runtime call，玩家在通话里看到角色化文本和选项；选择被写回为 `option_id`。
6. `wait`、`check`、`random`、`action_request`、`objective` 等节点把事件推进给时间系统、条件分支、随机分支、队员行动或独立目标。
7. 事件 effects 写入队员、地块、背包/资源、目标、世界 flag/history 和玩家可见事件日志。
8. 事件结束后，完整 call/debug 细节不长期保存；存档保留活跃事件/通话、目标、event_log、world_history 和 world_flags。

### 4.2 典型情境

- **高光时刻**：队员完成森林调查后，事件写入地块痕迹、玩家日志和后续危险标记；玩家感觉地图正在记住他的行动。
- **压力时刻**：森林野兽事件先来电，再等待，再二次来电，玩家必须在时间压力和信息不足下选择撤离、隐藏或冒险处理。
- **调度时刻**：Amy 发现火山灰线索后创建 objective，玩家可以派 Mike、Garry 或其他符合条件的队员去完成采样并推进 parent event。
- **长期后果时刻**：Mike 发现旧世界遗物后，最终选择改变队员标签、地块对象、世界 flag、后续事件池和个人日记。
- **摩擦点**：内容校验失败时，事件不会进入运行时；错误需要定位到字段路径、引用 ID、图节点、handler 参数或样例 dry-run。

## 5. 机制与规则（Mechanics & Rules）

### 5.1 状态与状态机

事件定义是静态内容，runtime event 是运行时状态。事件创建后从 `entry_node_id` 进入事件图，当前仅允许一个活跃节点。

runtime event 状态包括：

| 状态 | 含义 |
| --- | --- |
| `active` | 事件正在同步进入或离开节点。 |
| `waiting_call` | 事件等待玩家接听、选择或 call 超时。 |
| `waiting_time` | 事件等待 `next_wakeup_at`。 |
| `waiting_action` | 事件等待一个队员行动完成。 |
| `waiting_objective` | 事件等待独立 objective 完成。 |
| `resolving` | 事件正在执行 end 节点效果。 |
| `resolved` | 事件正常结束，只长期保留摘要、history 和 event_log。 |
| `cancelled` | 事件被玩家或系统取消。 |
| `expired` | 事件超过 deadline 或 timeout。 |
| `failed` | 内容错误或运行时不可恢复错误。 |

节点类型和职责：

| 节点类型 | 职责 |
| --- | --- |
| `call` | 创建 runtime call，展示台词和逻辑选项，选择后按 `option_node_mapping` 推进。 |
| `wait` | 写入等待时间或唤醒条件，由时间系统到点推进。 |
| `check` | 执行确定性条件分支。 |
| `random` | 执行受控随机分支，并把结果写入 runtime event。 |
| `action_request` | 请求或等待具体队员行动，行动完成后推进事件。 |
| `objective` | 创建独立目标，允许玩家安排符合条件的队员完成后续行动。 |
| `spawn_event` | 创建 child event，用于连锁事件或世界后果。 |
| `log_only` | 只写玩家摘要、世界历史或轻量效果，然后自动推进。 |
| `end` | 执行最终结算、释放 blocking、删除 active call 细节并结束事件。 |

### 5.2 触发与候选选择

事件系统在以下触发类型上创建 `trigger_context`：

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

候选选择流程：

1. 按 `trigger_type` 从全局索引取候选事件定义。
2. 执行 `trigger.conditions` 和 required context 校验。
3. 按 `repeat_policy`、`world_history` 和 `cooldown_seconds` 过滤。
4. 按 `mutex_group` 去重。
5. 检查 blocking slot；后台非阻塞事件可以继续生成。
6. 按 `priority` 分层，再用 `weight` 抽取。
7. 在单次 trigger 上遵守 `max_instances_per_trigger`。

#### 调查与重复事件

调查是事件系统的主要入口之一。队员可以在地点开展调查，每轮调查完成时生成 `action_complete` trigger，并由事件系统检查普通发现、资源发现、危险迹象、见闻记录、地块描述变化或紧急事态。

当前通话行动内容把普通调查和对象调查都配置为 `120 秒`。事件系统读取调查完成后的 `action_complete` trigger，不自行决定调查耗时；若后续内容需要快速、标准、深度等调查层级，应先扩展通话行动内容或队员行动模型，再让事件条件读取对应上下文。

| 行动入口 | 当前耗时 | 事件关系 |
| --- | --- | --- |
| 调查当前区域 | `120 秒` | 完成后发出 `action_complete`，可揭示 `onInvestigated` 对象并触发事件候选。 |
| 调查当前区域 | `120 秒` | 完成后以当前地块、可见对象和对象 tags 进入 trigger payload。 |

重复调查需要避免无限刷高价值结果：

- 地块记录调查历史或结构化 `world_history` key。
- 高价值事件通常不可重复。
- 资源发现事件触发后，应更新地块状态，避免重复发现同一资源点。
- 低价值普通事件可以重复，但需要冷却时间。
- 每次调查后，普通见闻类事件权重可以下降。
- 如果地块已经完全调查，调查结果更倾向于低价值资源、见闻或无明显发现。

### 5.3 结构化条件与效果

`condition` 使用结构化 JSON 表达常见规则，复杂规则只能通过白名单 `handler_condition` 扩展。常见条件包括字段比较、标签检查、队员属性、背包物品、资源数量、地块发现/调查状态、world flag、world history、objective 状态、事件状态、队员行动状态和时间比较。

`effect` 是结构化结算动作，必须声明目标、参数、失败策略和记录策略。常见效果包括更新队员状态/标签/属性、创建或取消队员行动、更新地块字段和标记、增减物品或资源、创建/更新/完成 objective、写 world flag/history、写 event_log、追加日记、创建后续事件和解锁事件定义。

handler registry 只允许预先声明的 handler 类型。handler 需要声明 kind、用途、参数 schema、可读写 target、是否确定性、是否使用随机、失败策略和 sample fixture。

### 5.4 静态资产与运行时边界

静态内容资产位于 `content/` 下的全局资产库，按类型分目录、按 domain 拆文件。事件定义、通话模板、handler registry、preset 和 schema 分离保存；运行时加载时建立 ID、trigger、domain、tag、mutex_group 等索引。

静态资产不能保存运行时实例字段，例如当前节点、玩家选择、active call、随机结果或 blocking claim。静态资产也不能保存编辑器布局、节点坐标、注释、review 状态、预览用例或覆盖率报告。

运行时状态由 `GameState` / save state 维护。事件引擎只通过结构化 condition/effect 读写队员、行动、地块、背包/资源、目标、世界 flag/history 和事件日志。

### 5.5 通话规则

`call` 节点创建 runtime call；runtime call 保存渲染后的台词和可见选项，避免刷新页面后重新随机出不同文本。

通话模板规则：

- `call_template.option_lines` 的 key 必须与 `call` 节点 `options[].id` 完全匹配。
- 每个展示选项至少有默认 variant。
- 文案匹配可以读取队员 ID、语气、性格标签、专长标签、状态、事件压力和此前选择。
- 玩家点击任何展示文案，运行时都只回写稳定 `option_id`。
- 事件结束后，完整通话台词、隐藏选项原因和 debug trace 不长期进入玩家存档。

### 5.6 Objective 规则

`objective` 是事件创建的世界目标，不是完整任务系统。它负责把事件后续行动显式化：事件可以创建目标，玩家派符合条件的队员执行指定行动，行动完成后以 `objective_completed` 推进 parent event。

objective 保存父事件、创建节点、标题、摘要、目标地块、可执行队员条件、所需行动、分配队员、关联行动、deadline 和结果。目标完成、失败、过期或取消时，按节点规则推进或结束 parent event。

### 5.7 保存与历史保留

玩家长期历史分两层：

- `event_log` 保存玩家可见摘要，解释发生了什么、涉及哪些队员/地块/目标、结果重要性和相关 history keys。
- `world_history` 保存结构化事实，供冷却、一次性事件、后续事件解锁和历史条件查询。

保存时保留活跃 event/call、objective、event_log、world_history、world_flags、队员行动、地块和背包/资源状态。不长期保存完整静态事件定义、已结束 call 的完整台词、隐藏选项原因、debug trace 或编辑器模拟记录。

### 5.8 生产级校验

事件资产进入运行时前必须通过生产级静态校验：

- **Schema 校验**：所有资产通过 JSON Schema；按 `type` 做 discriminated union；禁止未声明字段和编辑器元数据进入运行时资产。
- **ID / ref 校验**：事件定义、通话模板、节点、边、终点、效果引用、日志模板、item/resource/crew/tile 引用必须可解析。
- **Graph 校验**：入口存在，图无环，节点可达，非终点有退出路径，每条可达路径能到达终点，通话选项映射完整。
- **Template 校验**：通话模板选项与 call 节点逻辑选项完全匹配，默认 variant 存在，占位符可解析。
- **Condition / effect 校验**：类型、target、field、op、value、params、failure policy、history key 都必须合法。
- **Handler 校验**：handler 类型存在、kind 匹配、params 通过 schema、访问 target 合法，使用随机时接入 runtime random source。
- **Sample dry-run 校验**：approved 事件至少有一个样例上下文，dry-run 能进入入口节点、覆盖终点路径、解析模板和 option mapping，并验证效果、历史和日志输出。

### 5.9 参数与默认值

| 参数 | 当前规则 |
| --- | --- |
| `event_graph.graph_rules.max_active_nodes` | `1` |
| `event_graph.graph_rules.allow_parallel_nodes` | `false` |
| `event_graph.graph_rules.acyclic` | `true` |
| `call_template.default_variant_required` | `true` |
| `end.cleanup_policy.delete_active_calls` | `true` |
| `end.cleanup_policy.keep_player_summary` | `true` |
| 关闭游戏后的事件推进 | 不推进，重新进入后从保存的游戏秒继续。 |
| 同一队员 blocking 占用 | 同一时间最多一个 blocking event / call / action_request / current action。 |
| 紧急事件首次等待时间 | `30 秒`，可由具体事件覆盖。 |
| 紧急事件危险升级间隔 | `30 秒`，可由具体事件覆盖。 |
| 普通紧急事件最终期限 | `120 秒`，可由具体事件覆盖。 |
| 高危紧急事件最终期限 | `60 秒`，可由具体事件覆盖。 |

### 5.10 通讯台行动与事件边界

普通通话中的基础行动由 `content/call-actions/*.json` 和 App 层行动结算创建，不要求每个普通按钮都建成事件图节点。当前事件系统的职责是监听这些行动的结果信号，并在满足触发条件时创建或推进 runtime event。

事件选项可以通过结构化 effect、`action_request` 节点或 objective 桥接回真实队员行动。桥接时需要遵守队员主行动互斥规则；普通非 blocking 事件可以作为后台反馈存在，紧急或 blocking 事件才占用队员行动或通讯。

## 6. 系统交互（System Interactions）

- **依赖于**：时间系统、队员系统、队员行动状态、地图/地块状态、背包/资源系统、通讯台行动信号、通话模板、内容资产库和 schema 校验。
- **被依赖于**：通讯台 gameplay、通话页面、地图标记、系统日志、队员日记、后续事件解锁和未来事件编辑器。
- **共享对象 / 状态**：`GameState`、runtime event、runtime call、objective、crew state、crew action state、tile state、inventory/resource、event_log、world_history、world_flags。
- **事件 / 信号**：抵达、邻近、行动完成、长时间待命、通话选择、节点完成、目标创建、目标完成、world flag 变化、时间唤醒。

事件系统不直接推进全局时间，也不直接绘制 UI。它读取统一状态，在触发点创建或推进事件实例，并把结果同步回相关系统。地图只读，不直接下达行动；正式行动仍通过通讯 / 通话流程进入队员行动状态。

## 7. 关键场景（Key Scenarios）

### 7.1 典型场景

- **S1：普通发现不打断**：队员完成森林地块调查后触发 `forest_trace_small_camp`，事件走 `log_only -> end`，写入地块标记、event_log 和 world_history，不抢占队员行动或通讯。
- **S2：紧急多通话**：森林危险满足时触发 `forest_beast_encounter`，事件走 `call -> wait -> call -> random -> end`，多次通话共用一个 runtime event，玩家选择以 `option_id` 决定分支。
- **S3：等待节点与时间压力**：山地异常反光事件走 `call -> wait -> check/random -> call -> end`，`next_wakeup_at` 由时间系统推进。
- **S4：跨队员 objective**：Amy 发现火山灰线索后创建目标，Mike 或 Garry 完成行动后触发 `objective_completed` 并推进 parent event。
- **S5：长期角色和世界后果**：Mike 发现旧世界遗物后，最终结果改变 personality/expertise tag、地块对象、world flag、后续事件池和日记。

#### 普通事件池方向

普通事件池应覆盖资源、见闻、危险提示和地块变化。以下方向可作为批量生产事件的内容池输入：

| 事件方向 | 触发地块 / 触发点 | 结果 |
| --- | --- | --- |
| 散落的可用木材 | 森林调查 | 获得少量木材，写入玩家可见摘要。 |
| 裸露的矿石碎片 | 丘陵或山地调查 | 获得少量铁矿石。 |
| 潮湿的沙层 | 沙漠调查 | 发现浅层水源或写入水源线索。 |
| 旧营地痕迹 | 平原或森林调查 | 增加见闻记录，更新地块描述。 |
| 岩面划痕 | 山地调查 | 地图增加危险提示。 |
| 短暂的信号杂音 | 任意地块待命 | 增加通讯见闻记录，不直接产生危险。 |
| 可疑植物群 | 森林或平原调查 | 获得少量食物。 |
| 干涸水道 | 沙漠或平原调查 | 地图标记可能的水源方向。 |
| 低空飞行阴影 | 平原或沙漠待命 | 增加见闻记录，不产生直接效果。 |
| 松动碎石 | 山地或丘陵抵达 | 地块危险提示，低概率造成轻伤。 |
| 废弃工具箱 | 旧营地或平原调查 | 获得基础工具或少量铁矿石。 |
| 不明反光点 | 山地或沙漠调查 | 解锁深度调查提示。 |

### 7.2 边界 / 失败场景

- **F1：内容校验失败**：资产不能进入运行时；错误定位到字段路径、引用 ID、图节点或 handler 参数。
- **F2：触发候选为空**：系统不生成事件，当前行动正常完成或继续。
- **F3：旧存档加载失败**：研发期旧 save schema 可以硬失败，不做兼容或迁移。
- **F4：事件运行到非法节点或缺失引用**：视为内容错误，应在测试或 dry-run 阶段失败。
- **F5：队员已有 blocking 占用**：新的后台事件可以记录引用，但不能再抢占该队员行动或通讯。

## 8. 取舍与反模式（Design Trade-offs & Anti-patterns）

- **取舍：生产级模型优先于兼容旧实现**。事件系统可以重建旧 JSON、旧紧急事件字段、旧通话硬编码和旧存档路径，避免新模型被旧结构牵制。
- **取舍：结构化 JSON + 白名单 handler 优先于任意脚本**。这会让部分规则写法更长，但能让校验、编辑器和 review 明确知道事件读写了什么。
- **取舍：通话细节不长期入玩家存档**。玩家长期只保留事件摘要和结构化历史，减少存档膨胀和隐性状态耦合。
- **取舍：objective 不是完整任务系统**。它只承担事件生成的后续行动目标，不扩展奖励、任务链、优先级 UI 或正式 quest system。
- **要避免的反模式**：让通话文案决定逻辑分支、在事件资产里保存编辑器字段、让 effect 任意改写 GameState、依赖运行时兜底修复不可达事件图、在玩家存档里保存完整 debug trace。

## 9. 参考与灵感（References & Inspiration）

- **事件核心模型**：`docs/game_model/event.md`。借鉴点：事件资产、事件图、runtime event/call/objective、condition/effect、handler、生命周期与校验规则。
- **事件集成状态边界**：`docs/game_model/event-integration.md`。借鉴点：事件系统读写队员、行动、地块、库存、历史和存档的边界。
- **项目内策划案**：`docs/plans/2026-04-27-15-33/event-program-model-player-journey-design.md`。借鉴点：全局资产库、事件图运行时、结构化 condition/effect、生产级校验和五个样例事件覆盖矩阵。
- **现有实现**：`content/events/definitions/*.json`、`content/events/call_templates/*.json`、`src/eventSystem.ts`、`src/pages/CallPage.tsx`。借鉴点：已有结构化触发、紧急来电、通话选择和效果结算路径。

## 10. Open Questions

- **Q1：样例事件的具体题材与文本如何展开？** 当前已固定覆盖能力，具体剧情文本可以在实施或内容生产任务中展开。
- **Q2：handler registry 的第一批白名单如何落到 schema 与测试 fixture？** game model 已定义 registry 字段，实施时需要把最低集合拆成可测试任务。
- **Q3：事件编辑器元数据文件格式如何设计？** 当前只确认它与运行时资产分离；layout、notes、review、preview cases 和质量报告需要独立设计。
- **Q4：存档是否需要迁移或提示策略？** 研发期允许旧存档硬失败；稳定面向玩家的存档后需要重新评估版本升级体验。
- **Q5：普通事件来电如果玩家长期不接通，是否需要过期、自动归档或一直保留？** 当前 active call 可保留，但 UI 行为和清理策略仍需确认。
- **Q6：事件选项桥接真实行动时，队员已有行动的冲突处理是否总是事件优先？** 当前实现可由事件桥接层替换行动；正式规则需要明确哪些事件允许强制替换，哪些必须让玩家先确认停止。

---

## 变更记录 / 来源策划案

| 日期 | 来源策划案 | 变更摘要 |
| --- | --- | --- |
| 2026-04-27 | docs/plans/2026-04-27-15-33/event-program-model-player-journey-design.md | 重建事件系统 wiki 为事件图运行时模型，新增 9 类节点、结构化 condition/effect、运行时 event/call/objective、生产级校验和 5 个样例覆盖场景。 |
| 2026-04-28 | docs/plans/2026-04-27-22-56/communication-table-gameplay-design.md | 补充通讯台行动与事件系统边界，按当前实现更新调查触发耗时，并记录普通来电保留与行动桥接冲突两个未决问题。 |
