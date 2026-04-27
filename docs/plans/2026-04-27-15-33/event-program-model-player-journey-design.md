---
topic: event-program-model-player-journey
date: 2026-04-27
status: approved
source:
  initial: docs/plans/2026-04-27-15-33/initial.md
  research: docs/plans/2026-04-27-15-33/research.md
  interview: docs/plans/2026-04-27-15-33/event-program-model-player-journey-interview.md
  game_model_spec: docs/plans/2026-04-27-15-33/event-program-model-player-journey-game-model-spec.md
---

## 1. 一句话总结

本轮设计要固定一套面向批量事件生产的事件程序模型：以全局内容资产库、事件图、运行时 event/call、结构化 condition/effect、生产级静态校验和事件相关 game model 为基础，让研发期可以不兼容旧实现地重建事件系统，并用 5 个覆盖不同流程的样例事件验证模型完整性。

## 2. 背景与问题（As-is）

- **当前做法**：现有事件系统以 `content/events/events.json` 为入口，按触发源、条件、概率选出事件后立即执行 effects；紧急事件挂在队员状态上，通话页面同时混有 JSON 驱动选项和硬编码行动分支。
- **痛点/成本**：当前模型缺少独立的运行时 event、运行时 call、事件节点进度、结构化世界历史和事件图校验；通话文案、逻辑选项、结算效果与行动状态边界不够清楚，难以支撑独立编辑器和大批量事件生产。
- **为什么现在做**：下一阶段要做事件编辑器路由并生产更多事件，因此需要先固定程序模型、生产模型和校验模型；当前仍是研发期，可以接受旧代码和旧存档直接失效，不为兼容性牺牲新模型。

## 3. 目标（Goals）

- 固定第一版事件程序模型，明确静态内容、运行时状态、通话展示、结算效果、历史记录和编辑器元数据的边界。
- 固定事件生产相关 game model 的字段边界，覆盖 event、call、crew action、tile、item/resource、objective、world flag/history、save state。
- 建立全局内容资产库思路：按类型分目录、按 domain 拆文件，由后续编辑器路由建立全局索引与管理 UI。
- 采用结构化 JSON + 白名单 handler 的 condition/effect 模型，保证常见规则可表单化，复杂规则可受控扩展。
- 建立生产级静态校验：schema、ID/引用、图结构、option/template 对齐、handler 参数、样例事件 dry-run。
- 用 5 个自包含样例事件验证模型，覆盖普通发现、紧急多通话、等待节点、跨队员目标和长期角色/世界后果。
- 明确研发期 cutover：旧代码、旧内容和旧存档不需要兼容，加载旧存档可以直接失败。

## 4. 非目标（Non-goals）

- 本轮不实现事件编辑器 UI；编辑器是后续独立 web 路由，本轮只保证运行时资产与编辑器元数据分离，并让模型足够支撑下一轮编辑器。
- 本轮不兼容旧事件 JSON、旧代码路径或旧 localStorage 存档；研发期遇到旧存档可以直接失败。
- 本轮不做玩家可见的完整通话档案；玩家只看事件摘要，通话细节和 debug trace 不长期进入玩家存档。
- 本轮不做完整任务系统；`objective` 只承担事件生成的后续行动目标，不扩展奖励、任务链、优先级 UI 或正式 quest system。
- 本轮不做 `parallel` / `join` 节点，也不做编辑器级覆盖率、variant 命中率、概率分析和质量评分；这些已记录到项目 TODO。
- 本轮不引入关系、士气、天气、昼夜、生态扩散、势力控制等更大的模拟系统。

## 5. 目标用户与使用场景

### 5.1 用户画像

- **P1：事件内容生产者**：需要用稳定字段批量创建事件、通话模板、条件和效果；痛点是旧模型混合了逻辑、文本和运行时状态，难以 review 和复用。
- **P2：玩法 / 程序实现者**：需要把事件系统重建成可运行、可校验、可测试的引擎；痛点是当前触发、通话、行动和存档边界不清。
- **P3：后续编辑器开发者**：需要一个清晰资产模型与校验目标，才能在独立 web 路由中做读取、模拟和创建事件。

### 5.2 典型场景

- **S1：生产一个普通发现事件**：内容生产者定义触发条件、事件图、通话模板和地图标记；校验通过后，队员完成调查时触发事件并写入玩家可见摘要。
- **S2：生产一个紧急多通话事件**：事件图包含 call、wait、random、end 节点；运行时 event 在多个节点间推进，call 只负责展示和选择回写。
- **S3：生产一个跨队员目标事件**：事件创建 objective，玩家派任意符合条件的队员完成行动；objective 完成后回写 parent event 和 world_history。

## 6. 用户旅程（To-be）

1. 内容生产者在全局资产库中创建 `event_definition`，定义触发入口、候选选择规则、事件图节点、结果引用和历史写入策略。
2. 内容生产者为需要展示的节点创建 `call_template`，用同一个逻辑 `option_id` 绑定不同队员、标签、状态和事件压力下的文案变体。
3. 校验器检查 schema、ID 唯一性、跨文件引用、图可达性、终点路径、option/template 对齐、condition/effect 字段类型和 handler 参数。
4. 运行时收到 trigger context，例如队员抵达、接近危险地块、行动完成、通话选择、objective 完成或时间唤醒。
5. 事件系统按 condition、history、cooldown、priority、mutex_group 和 weight 筛选候选事件，并在单次触发上生成受控数量的 runtime event。
6. runtime event 进入当前节点：`call` 节点生成 runtime call，`wait` 节点登记唤醒时间，`action_request` / `objective` 节点创建后续行动目标，`end` 节点执行结果。
7. 玩家在通话里看到由 `call_template` 渲染出的台词和选项；选择回写为逻辑 `option_id`，由 event graph 决定下游节点。
8. 事件 effects 通过结构化 target 写入 crew、tile、inventory/resource、objective、world flag/history 和玩家可见 event_log。
9. 事件结束后，runtime event/call 细节不长期保存；存档只保留玩家可见事件摘要和规则需要的 world_history。

### 6.1 失败路径与边界

- **F1：内容校验失败**：资产不能进入运行时；错误指出字段路径、引用 ID、图节点或 handler 参数。
- **F2：触发候选为空**：系统不生成事件，当前行动正常完成或继续。
- **F3：旧存档加载失败**：研发期直接失败，不做兼容、迁移或提示。
- **F4：事件运行到非法节点或缺失引用**：视为内容错误，应在测试 / dry-run 阶段失败，不依赖运行时兜底。
- **F5：队员已有 blocking event/action**：新的后台事件可以记录引用，但不能再抢占该队员的行动或通讯占用。

## 7. 约束与假设

### 7.1 约束（Constraints）

- **C1：研发期不兼容旧实现**：旧事件 JSON、旧事件引擎、旧通话硬编码和旧存档都可以被替换；旧存档加载失败是可接受结果。
- **C2：运行时仍是前端单机模型**：状态保存依赖浏览器本地存储，因此长期存档必须克制，不长期保存完整 call/debug 细节。
- **C3：地图只读、指令经通讯链路**：事件可以触发通话、行动请求或 objective，但玩家正式下达行动仍应通过通讯 / 通话流程。
- **C4：编辑器元数据独立于运行时资产**：编辑器 route 可以维护 layout、notes、review、preview 等数据，但运行时内容资产不依赖这些字段。
- **C5：字段命名采用英文 `snake_case`**：文档用中文解释字段语义，JSON/schema/TS 类型以英文 `snake_case` 作为模型主名。

### 7.2 假设（Assumptions）

- **A1：生产级模型比快速兼容更重要**。（验证方式：5 个样例事件能覆盖主要模型路径，且不需要回退到硬编码分支。）
- **A2：9 类节点足以支撑第一版批量生产**。（验证方式：普通发现、紧急多通话、等待、跨队员目标、长期后果都能被建模。）
- **A3：结构化 JSON + 白名单 handler 足以覆盖常见事件规则**。（验证方式：样例事件的条件和效果不需要任意脚本。）
- **A4：玩家只看事件摘要不会削弱核心体验**。（验证方式：样例事件结束后 event_log 足以解释“发生了什么”和“造成了什么后果”。）

## 8. 方案选择

### 选择的方案：全局资产库 + 事件图运行时 + 事件相关 game model 固定

- **做法**：把事件系统拆成静态资产、运行时状态、规则解释器和生产校验四层。静态资产按类型分目录、按 domain 拆文件；运行时用 `event` 和 `call` 保存当前进度；规则用结构化 JSON + 白名单 handler；相邻的 crew action、tile、inventory/resource、objective、world_history 一并定义字段边界。
- **优点**：模型清晰，适合后续独立编辑器路由和批量事件生产；普通遭遇、紧急通话、等待、跨队员目标和长期后果可以共用一套引擎。
- **缺点/风险**：重写范围大，当前 `eventSystem`、`App` 时间结算、`CallPage`、内容 schema、测试和存档结构都会被打穿；第一版模型必须靠样例事件和校验约束快速暴露字段缺口。
- **选择理由**：用户明确要求程序模型和生产模型优先，不需要兼容旧代码或旧存档；因此应避免在旧紧急事件 / 硬编码通话上叠兼容层。

### 选择与理由（Decision）

- **理由**：选择生产级模型固定，而不是体验优先的小原型，是因为下一阶段马上要做编辑器和大批量内容。放弃兼容的代价是旧实现会被替换；收益是新模型不被旧存档、旧 JSON 和旧 UI 分支绑住。

### 曾经考虑过的方案

- **玩家旅程优先**：更快看到体验，但模型字段可能反复变化。
- **单事件自包含资产**：生产一个事件更直观，但不利于全局编辑器和模板复用。
- **完整任务系统 / 完整编辑器级校验**：能力更强，但超出本轮 5 个事件验证需要。

## 9. 核心对象/数据

详细字段定义放入 `event-program-model-player-journey-game-model-spec.md`；本节只说明对象边界和 source of truth。

- **静态内容资产**：
  - **来源/归属**：`content/` 下的全局资产库，按类型分目录、按 domain 拆文件。
  - **对象**：`event_definition`、`event_graph`、`event_node`、`call_template`、`condition`、`effect`、handler registry / preset。
  - **生命周期**：由内容生产者或编辑器创建，进入运行时前必须通过生产级校验。
- **运行时事件状态**：
  - **来源/归属**：`GameState`。
  - **对象**：runtime `event`、runtime `call`、`objective`、`event_log`、`world_history`。
  - **生命周期**：trigger 创建 event；节点推进更新 event/call/objective；事件结束后删除 call 细节，只保留 event_log 和 world_history。
- **事件相关 game model**：
  - **来源/归属**：`GameState` 与内容定义共同决定。
  - **对象**：`crew_state`、`crew_action_state`、`tile_state`、`crew_inventory`、`base_inventory/resources`、`tile_resources`、`world_flags`。
  - **生命周期**：由玩家行动、时间推进和事件 effects 更新；事件不能绕过结构化 target 任意改写系统状态。
- **编辑器元数据**：
  - **来源/归属**：后续独立编辑器路由维护的 editor data。
  - **对象**：layout、notes、review、preview cases、编辑器筛选状态等。
  - **生命周期**：不进入运行时资产，不进入玩家存档，不影响事件引擎执行。

## 10. 范围与阶段拆分

### 10.1 MVP（本次必须做）

- 固定 `game-model-spec.md`：完整列出事件生产相关 game model、字段、生命周期、引用关系和结束后保留策略。
- 重建事件静态资产模型：全局资产库、按类型分目录、按 domain 拆文件；`event_definition` 与 `call_template` 通过 ID/ref 关联。
- 固定 9 类 event node：`call`、`wait`、`check`、`random`、`action_request`、`objective`、`spawn_event`、`log_only`、`end`。
- 固定 trigger 范围：`arrival`、`proximity`、`action_complete`、`idle_time`、`call_choice`、`event_node_finished`、`objective_created`、`objective_completed`、`world_flag_changed`、`time_wakeup`。
- 实现或设计到可实施的生产级校验：schema、ID / 引用、图可达、终点路径、option / template 对齐、condition / effect 字段类型、handler 参数、样例 dry-run。
- 设计 5 个自包含样例事件，用于验证普通发现、紧急多通话、等待、跨队员目标、长期角色 / 世界后果。

### 10.2 Later（未来可能做，但明确本轮不做）

- 独立事件编辑器 web route 的 UI、图编辑、预览面板和管理页面。
- `parallel` / `join` 节点。
- 编辑器级校验：覆盖率、variant 命中率、隐藏选项报告、事件池概率分析、质量评分。
- 完整 quest system、关系 / 士气系统、天气 / 生态 / 势力等更大模拟系统。
- 旧存档迁移、生产环境兼容策略和玩家友好的版本升级提示。

## 11. User Stories（MVP）

### US-001：固定事件相关 game model

- **作为**：玩法 / 程序实现者
- **我想要**：一份完整字段级 `game-model-spec.md`
- **以便**：后续实现、编辑器和内容生产共享同一套对象边界
- **验收标准**：
  - [ ] spec 覆盖静态资产、运行时事件、运行时通话、队员行动、地块、物品 / 资源、objective、world history、save state
  - [ ] 每个对象都有 source of truth、关键字段、生命周期和结束后保留策略
- **不包含**：编辑器 UI 设计
- **优先级**：P0
- **依赖**：本 design

### US-002：定义全局内容资产库

- **作为**：事件内容生产者
- **我想要**：按类型分目录、按 domain 拆文件的资产组织方式
- **以便**：批量事件可以被人工 review，也能被后续编辑器全局索引
- **验收标准**：
  - [ ] 明确 `event_definition`、`call_template`、handler / preset 的文件归属
  - [ ] 明确运行时资产不包含 editor layout / notes / review 数据
- **不包含**：编辑器数据库或图编辑 UI
- **优先级**：P0
- **依赖**：US-001

### US-003：定义事件图与节点类型

- **作为**：玩法 / 程序实现者
- **我想要**：固定 9 类 event node 和推进规则
- **以便**：事件引擎可以按节点类型调度 call、wait、check、random、action_request、objective、spawn_event、log_only、end
- **验收标准**：
  - [ ] 每类节点定义进入条件、退出方式、可引用字段、可执行结果
  - [ ] 图校验能识别无入口、孤儿节点、无终点路径、缺失 option mapping
- **不包含**：`parallel` / `join`
- **优先级**：P0
- **依赖**：US-001

### US-004：定义 condition/effect 与生产级校验

- **作为**：事件内容生产者
- **我想要**：结构化 JSON + 白名单 handler 的规则模型和校验规则
- **以便**：常见事件可表单化生产，复杂事件可受控扩展
- **验收标准**：
  - [ ] condition / effect 都有 `type`、target / field / params、handler 参数 schema
  - [ ] 校验覆盖 schema、ID / 引用、option / template 对齐、字段类型、handler 参数和样例 dry-run
- **不包含**：编辑器级覆盖率和质量评分
- **优先级**：P0
- **依赖**：US-001、US-003

### US-005：生产 5 个样例事件验证模型

- **作为**：内容生产者
- **我想要**：5 个自包含样例事件
- **以便**：证明模型能支撑普通发现、紧急多通话、等待、跨队员目标和长期后果
- **验收标准**：
  - [ ] 每个样例事件都能通过生产级校验
  - [ ] 样例事件不依赖旧硬编码通话或旧紧急事件结构
  - [ ] 样例覆盖 `event_log` 和 `world_history` 写入
- **不包含**：大量正式事件生产
- **优先级**：P1
- **依赖**：US-001 至 US-004

## 12. 成功标准（如何判断做对了）

- [ ] `game-model-spec.md` 中所有核心对象都能回答：谁创建、谁更新、谁持久化、结束后保留什么、可以引用哪些对象。
- [ ] 5 个样例事件不需要旧 `CrewMember.emergencyEvent` 或旧 `CallPage` 硬编码分支即可表达完整流程。
- [ ] 每个样例事件都能通过生产级校验，且校验错误能定位到具体字段、引用或节点。
- [ ] `call_template` 的展示文案不会决定逻辑分支；玩家选择始终回写为稳定的 `option_id`。
- [ ] 事件结束后，玩家存档只保留 event_log 与 world_history 所需信息，不长期保存完整通话和 debug trace。
- [ ] 同一队员可以被多个后台事件引用，但同一时间最多只有一个 blocking event / call / action_request 占用行动或通讯。
- [ ] 旧内容和旧存档失效不会被当作设计缺陷；研发期硬失败是可接受 cutover 行为。

## 13. 风险与缓解

- **R1：模型一次性覆盖面过大，实施时容易失焦。**
  - **缓解**：以 5 个样例事件作为验收边界；字段可以完整定义，但实现优先服务样例路径和生产级校验。
- **R2：结构化 condition / effect 变得冗长，内容生产者难以手写。**
  - **缓解**：允许白名单 handler 与 preset；后续编辑器用表单管理规则，人工 review 时保留清晰字段。
- **R3：全局资产库引用复杂，容易出现错 ref、孤儿模板或不可达节点。**
  - **缓解**：把跨文件引用、option / template 对齐、图可达性和 handler 参数 schema 纳入必跑校验。
- **R4：不保存完整 call / debug 历史会降低问题复现能力。**
  - **缓解**：运行中保留必要上下文；resolved 后只留 event_log / world_history。编辑器模拟和测试 dry-run 负责复现内容逻辑，而不是依赖玩家存档复盘。
- **R5：旧系统被整体替换，短期会破坏现有测试与页面流程。**
  - **缓解**：明确这是研发期 cutover；后续 implementation plan 需要按内容模型、引擎、UI、测试分任务拆解，而不是在旧路径上增量打补丁。

## 14. 未决问题（Open Questions）

- **Q1：9 类节点的字段细节是否在 `game-model-spec.md` 中一次性冻结？** 本设计倾向“是”，因为后续编辑器和批量生产依赖字段稳定。
- **Q2：第一批 5 个样例事件的具体题材与文本是否需要单独设计？** 本轮只定义它们覆盖的模型能力；具体剧情文本可以在实施或内容生产任务中展开。
- **Q3：handler registry 的第一批白名单有哪些？** 需要在 `game-model-spec.md` 中列出最低集合，并在 implementation plan 中拆成可测试任务。
- **Q4：事件编辑器的元数据文件格式如何设计？** 本轮只确认它与运行时资产分离；具体 editor data model 放到下一轮编辑器设计。
- **Q5：生产环境上线前是否需要迁移或提示策略？** 当前回答是不需要，因为项目仍处研发期；未来进入可玩版本前需要重新评估。
