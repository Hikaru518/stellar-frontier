---
topic: communication-table-gameplay
date: 2026-04-27
research_scope:
  codebase: true
  internet: false
source:
  initial: docs/plans/2026-04-27-22-56/initial.md
  research_topics: docs/plans/2026-04-27-22-56/research-topics.md
---

# Research: communication-table-gameplay

## 1. Research Summary（研究摘要）

本轮研究服务于“把通讯台、地图、事件和人物行动串成可玩的基础 gameplay”。用户要求普通通话由玩家主动发起，所有队员都具备调查当前区域、前往另一区域、原地休息三类基础动作；紧急情况下才由角色主动 call 玩家，并且事件选项必须反馈到真实行动、地块状态或队员状态。

项目内已有的方向相当明确：通讯是唯一指令通道，地图是只读态势图，事件是世界反馈，地图和事件都已转向配置 / runtime model。当前主要缺口不是底层模型，而是“普通通话行动菜单”和“事件选项到真实行动”的桥接仍混在 `CallPage` / `resolveDecision` 的角色硬编码里。

本轮按用户选择跳过互联网研究，因此后续策划案应优先围绕项目内一致性做取舍：普通动作生成归 App 层还是事件图；对象交互是直接动态按钮还是固定子菜单；休息是 standby 还是独立 idle。

## 2. Project Findings（项目内发现，未做项目内调研则跳过本节）

### 2.1 已有玩法系统（Existing Gameplay Systems）

- **通讯 / 地图 / 时间 / 事件的核心约束已成文**：移动、调查、采集、建设、撤离、紧急处理都应经由通讯台与通话；地图只展示态势，不直接发指令；时间持续推进并制造行动代价；事件连接探索、行动、等待和通话选择（证据：`docs/core-ideas.md`）。
- **地图系统已升级为可配置 8x8**：当前地图是配置驱动，默认 `8 x 8`，显示“已发现区域 + 外围未探索区域”的外接矩形；对象与特殊状态有 `onDiscovered` / `onInvestigated` 可见性，候选行动声明存在但对象级通话菜单尚未定型（证据：`docs/gameplay/map-system/map-system.md`、`docs/game_model/map.md`、`content/maps/default-map.json`）。
- **`GameState.map` 是地图事实源**：运行时探索、调查、揭示对象、揭示状态和调查报告都来自 `GameState.map`，legacy `MapTile` 只是投影；`src/mapSystem.ts` 已能计算可见窗口并派生 legacy tile（证据：`docs/game_model/map.md`、`src/mapSystem.ts`）。
- **事件系统已有 runtime call / graph runner**：事件模型包含 `runtime call`、`blocking`、`objective`、事件图节点与稳定 `option_id`；触发类型已覆盖 `arrival`、`action_complete`、`idle_time`、`call_choice`；UI 侧只提交 `call_id` 与 `option_id`（证据：`docs/gameplay/event-system/event-system.md`、`docs/game_model/event.md`、`src/events/eventEngine.ts`、`src/events/graphRunner.ts`）。
- **行动结算已有可复用片段**：移动链路 `confirmMove` -> `createMovePreview` / `startCrewMove` -> 时间推进 -> `arrival` 已存在；调查完成可调用 `completeInvestigation()` 揭示 `onInvestigated` 对象并写入调查报告（证据：`src/App.tsx`、`src/crewSystem.ts`）。

### 2.2 现存叙事设定与角色（Existing Narrative & Crew）

- **队员是通讯 gameplay 的主体**：核心理念强调队员不是工具人，人物有背景、语气、标签、专长和日记；因此普通动作统一化不能把角色差异抹成纯按钮，应至少保留角色台词 / 反馈层（来源：`docs/core-ideas.md`、`content/crew/crew.json`）。
- **MVP 已明确前 3 名队员**：本轮需求要求 Mike、Amy、Garry 都有稳定事件，并且所有队员都满足普通通话三动作；当前实现中 Garry 普通通话最完整，Amy 更偏紧急选项，Mike 是湖边状态占位（来源：`docs/plans/2026-04-27-22-56/initial.md`、`src/pages/CallPage.tsx`、`src/App.tsx`）。

### 2.3 现存 UI 设计（Existing UI Design）

- **页面路径已固定**：控制中心进入通讯台，通讯台通过“通话 / 接通”进入通话页；通话页可打开地图查看坐标信息，地图只读，最终指令仍回通话页确认（来源：`docs/ui-designs/ui.md`、`docs/ui-designs/pages/通讯台.md`、`docs/ui-designs/pages/通话.md`）。
- **普通联系与主动来电的文案边界清楚**：队员未主动联系时卡片显示“通话”，队员主动联系或紧急事件时显示“接通”；这与用户提出“紧急才由角色 call 玩家”的边界一致（来源：`docs/ui-designs/pages/通讯台.md`）。
- **`CallPage` 已能渲染事件 runtime call**：事件通话读取 `rendered_lines` 与 `available_options`，按钮提交稳定 `option_id`；普通通话则仍由本地动作数组和角色分支生成（来源：`src/pages/CallPage.tsx`）。

### 2.4 设计原则（Design Principles）

- **低保真控制台体验优先**：玩家通过文本、列表、网格、状态和日志推断现场；这支持把“对象交互”设计成清晰的通话选项 / 子菜单，而不是地图上的直接操作按钮（来源：`docs/core-ideas.md`、`docs/ui-designs/ui-design-principles.md`）。
- **内容与规则分离**：地图、事件、队员、物品内容应在 `content/`，设计意图写在 `docs/`；通话动作生成应尽量读取地图对象 `candidateActions` 与事件内容，而不是继续扩写角色硬编码（来源：`docs/core-ideas.md`、`AGENTS.md`、`src/content/contentData.ts`）。

### 2.5 最近 commits（Recent Changes）

- **本轮未取得可靠最近 commit 信息**：探索反馈中 `git log` 在环境里无可见输出，因此本 research 不基于最近 commit 做判断。后续如果需要变更实现，应在 coding 阶段重新检查 `git status` / `git log`。

### 2.6 项目约束（Project Constraints）

- **文档陈旧风险**：根 `AGENTS.md` 仍描述 4x4 网格，但当前地图文档、crew/time 文档与 `content/maps/default-map.json` 已指向默认 8x8；后续设计应以 map docs / default-map 为准，并把 AGENTS 视作待更新风险。
- **不要扩展旧事件接口**：`src/eventSystem.ts` 中 `getEmergencyEventDefinition()`、`getEmergencyChoices()`、`triggerEvents()` 基本是空/旧接口；新玩法应接入 `src/events/eventEngine.ts`、`src/events/graphRunner.ts`、`src/events/effects.ts` 与 `src/content/contentData.ts` 的事件资产入口。
- **硬编码 tile id 是维护风险**：`resolveDecision()` 中 Garry / Mike / Amy 分支写死 `2-1`、`2-3`、`3-3` 等 tile id；在 8x8、对象可见性和配置地图下，这会让普通通话动作难以扩展到全员。
- **`candidateActions` 尚未接通 UI**：`content/maps/default-map.json` 已在黑松木材带、铁矿床等对象上声明 `survey` / `gather`，但通话页尚未据此生成按钮；这是本轮最直接的可玩性缺口。

## 3. Best Practice Findings（互联网发现，未做互联网调研则跳过本节）

本轮用户选择 `skip_web`，未做互联网研究；本节不提供外部案例、链接或行业惯例结论。

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：App 层普通指令 vs 事件图 `action_request`

- **App 层普通指令的优势**：更适合“调查当前区域 / 去往另一区域 / 原地休息”这类全员基础动作，链路短，容易复用已有 `createMovePreview`、`startCrewMove`、`completeInvestigation()`。
- **事件图 `action_request` 的优势**：适合紧急事件或剧情事件要求队员执行某个目标，并能通过 objective / blocking / runtime call 保持事件上下文。
- **建议**：MVP 将普通三动作放在 App 层通用行动生成；事件选项若要改变真实行动，则桥接到同一套行动创建 API，而不是在事件图里复制移动 / 调查规则。

### Trade-off 2：对象交互动态按钮 vs 固定“与对象互动”子菜单

- **动态按钮的优势**：当地块已揭示对象少时最直观，例如“采集木材”“采矿”，也能直接验证 `candidateActions`。
- **固定子菜单的优势**：对象多、行动多时更稳定，不会让通话主界面按钮爆炸，也更符合控制台信息分层。
- **建议**：MVP 可先把已揭示对象的 `candidateActions` 映射成少量动态按钮；一旦同地块对象/行动数量变多，再收敛为“与当前地块对象互动”子菜单。

### Trade-off 3：休息作为 `standby` vs 独立 `idle`

- **`standby` 的优势**：符合已有队员行动语义，能表达“停止当前行动并待命”，实现成本低。
- **独立 `idle` 的优势**：更适合触发 `idle_time` 事件、表示玩家主动让队员休整，而不是单纯没有任务。
- **建议**：MVP 文案用“原地休息”，状态先落到 `standby`；规则上记录进入待命的时间，使其可被 `idle_time` 触发器稳定读取。

## 5. Key References（关键参考）

### 5.1 项目文件（Project Files）

- `docs/core-ideas.md` — 全局原则：通讯指令通道、地图只读、时间代价、事件反馈、内容与规则分离。
- `docs/gameplay/map-system/map-system.md` — 可配置 8x8 地图、发现窗口、对象可见性与对象级通话菜单待定。
- `docs/game_model/map.md` — `GameState.map` 事实源、legacy tile 投影、`candidateActions` 当前不驱动通话菜单。
- `docs/gameplay/event-system/event-system.md` — 事件系统玩法约束与触发边界。
- `docs/game_model/event.md` — 事件图、runtime call、blocking、objective、稳定 `option_id`。
- `docs/ui-designs/ui.md` — 控制中心、通讯台、通话、地图页面关系。
- `docs/ui-designs/pages/通讯台.md` — “通话”与“接通”的 UI 文案边界。
- `docs/ui-designs/pages/通话.md` — 通话页确认行动、地图只读辅助。
- `content/maps/default-map.json` — 地图对象、特殊状态、可见性与 `candidateActions` 数据。
- `src/pages/CallPage.tsx` — runtime call 渲染已接入；普通通话仍角色硬编码。
- `src/App.tsx` — `startCall`、`confirmMove`、`settleCrewAction`、`completeInvestigation`、`resolveDecision` 的现有能力与缺口。
- `src/events/eventEngine.ts`、`src/events/graphRunner.ts`、`src/events/effects.ts` — 新事件运行时主线。
- `src/eventSystem.ts` — 旧事件接口，不宜继续作为新玩法扩展点。
- `AGENTS.md` — 协作约束与当前陈旧 4x4 描述风险。

### 5.2 外部链接（External Links）

- 本轮无外部链接；用户选择不做互联网研究。

## 6. Open Questions for Design

- **Q1**：普通通话三动作的最终责任边界是什么？由 App 层通用行动生成，还是将普通动作也建成事件图 `action_request`？
- **Q2**：当前地块对象交互在 MVP 中是直接生成动态按钮，还是统一进入“与对象互动”子菜单？
- **Q3**：原地休息是否只等于停止行动并 `standby`，还是需要独立 `idle/rest` 状态以支持恢复、风险或 `idle_time` 事件？
- **Q4**：`RuntimeCall.delivery` 中 `incoming_call`、`queued_message`、`auto_report` 在通讯台的视觉和交互差异如何定义，才能满足“只有紧急才由角色 call 玩家”？
- **Q5**：Mike / Amy / Garry 的 MVP 稳定事件分别用哪些 tile、对象、触发器和 repeat policy，才能确保网页上可重复验证且不依赖硬编码 tile 分支？

---

**Research Completed:** 2026-04-27 23:00  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
