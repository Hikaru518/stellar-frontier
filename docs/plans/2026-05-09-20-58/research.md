---
topic: quest-system-journal-main-side-node-event-progression-ui
date: 2026-05-09
research_scope:
  codebase: true
  internet: true
source:
  initial: docs/plans/2026-05-09-20-58/initial.md
  research_topics: docs/plans/2026-05-09-20-58/research-topics.md
---

# Research: stellar-frontier 的任务系统 / 任务日志 / 主线支线 / 节点与事件推进 / 任务 UI

## 1. Research Summary（研究摘要）

本次研究聚焦 `stellar-frontier` 是否需要独立任务系统，以及它应如何与现有事件图、objective、通讯台、地图和日志协作。项目内资料显示，当前已有 `objective`、`event_logs`、`world_history`、`world_flags` 等事实与日志基础，但文档明确 `objective` 不是完整 quest system。任务系统更适合成为事件系统之上的长期目标聚合层，而不是替代事件图。

外部资料的共同建议是：任务日志只记录“下一步行动 + 已发生关键事实”，不要变成百科全书或项目管理工具。推荐信息结构为 Category -> Quest -> Objective -> Step，必要时加入一层 Subquest。对本项目而言，MVP 应优先做通讯台入口、任务列表、任务详情、当前目标、相关日志、地图 marker 与通话入口；任务 UI 只能导航和解释，不能绕过通讯台直接下达行动。

核心冲突在于：外部 CRPG 惯例常要求一个 quest 只有一个 active objective，但 `stellar-frontier` 的多队员、地图探索、紧急来电和事件 objective 可能天然并行。建议在 MVP 中显示一个“推荐当前目标”，同时允许任务详情列出可选推进方式，避免过早扩展事件图的 parallel / join 能力。

## 2. Project Findings（项目内发现，未做项目内调研则跳过本节）

### 2.1 已有玩法系统（Existing Gameplay Systems）

- **事件系统 / Objective / 世界历史**：`objective` 已存在，能由事件创建世界目标，并记录 `status`、`parent_event_id`、`title`、`summary`、`target_tile_id`、`eligible_crew_conditions`、`required_action_type`、`assigned_crew_id`、`deadline_at`、`result_key` 等字段；但文档明确它不是完整任务系统。任务层应聚合长期目标，规则事实仍来自事件与 objective。（证据：`docs/gameplay/event-system/event-system.md`、`docs/game_model/event.md`、`docs/game_model/event-integration.md`）
- **通讯台与通话系统**：移动、待命、停止、调查四类基础行动必须经通讯台 / 通话；剧情动作由结构化地点事件、事件选项、`action_request` 或 `objective` 提供。任务 UI 不能直接执行队员行动。（证据：`docs/gameplay/communication-table/communication-table.md`、`docs/game_model/call-action.md`）
- **地图系统**：地图是只读态势图，可展示目标位置、地块对象和调查反馈，但不直接下达指令或结算事件。任务 marker 与“查看地图位置”适合放在地图，执行仍回到通话。（证据：`docs/core-ideas.md`、`docs/gameplay/map-system/map-system.md`、`docs/game_model/map.md`）
- **队员行动系统**：`GameState.crew_actions` 是当前角色行动唯一 runtime 事实源；同一队员同一时间只能执行一个主行动。任务节点若需要队员行动，应桥接到事件 objective / action_request / 通话行动模型。（证据：`docs/gameplay/crew/crew.md`、`docs/game_model/crew.md`）
- **时间系统**：deadline / node timeout 必须基于 `elapsedGameSeconds` 和运行中 tick；关闭游戏后不离线补算。限时任务和错过状态应沿用这一规则。（证据：`docs/gameplay/time-system/time-system.md`）

### 2.2 现存叙事设定与角色（Existing Narrative & Crew）

- **主线概念尚未模型化**：“主线”目前只在“游戏主线完整可玩”的语境中出现，没有正式数据模型。任务系统需要定义主线、支线、个人任务、紧急任务之间的分类边界。（来源：`docs/gameplay/dual-device-play/dual-device-play.md`）
- **队员是行动媒介**：Mike、Amy、Garry 等队员通过通话和行动参与事件推进；任务详情应展示关联队员、可用队员条件和阻塞原因，但不能把队员行动状态复制成页面私有状态。（来源：`docs/gameplay/crew/crew.md`、`docs/game_model/crew.md`）
- **日志已有多层概念**：`event_log` 是玩家可见摘要，不承担规则判定 source of truth；`world_history`、`world_flags` 和全局日志可支撑“已发生关键事实”。任务日志应引用相关日志摘要，规则判定读取结构化 facts。（来源：`docs/game_model/event-integration.md`、`docs/game_model/event.md`）

### 2.3 现存 UI 设计（Existing UI Design）

- **通讯台是首选入口**：UI 总览把通讯台定义为“角色通讯与任务入口”；UI 原则也把通讯台描述为任务、事件、交易、紧急消息和情报来源的聚合地。任务列表、任务详情和下一步提示应优先放在通讯台。（来源：`docs/ui-designs/ui.md`、`docs/ui-designs/ui-design-principles.md`、`docs/ui-designs/pages/通讯台.md`）
- **控制中心适合轻量提示**：控制中心可用设备块显示待处理任务、紧急来电或未读日志，但不应承载完整任务管理。（来源：`docs/ui-designs/ui.md`）
- **通话页适合承载推进选择**：通话页面可显示关联任务上下文与剧情选项，但选项仍属于 runtime call，不属于任务详情页直接执行。（来源：`docs/ui-designs/ui-design-principles.md`、`docs/game_model/call-action.md`）
- **地图页适合展示 marker**：任务详情可以跳转到关联地块；地图默认高亮当前追踪目标，并可提供显示所有任务标记开关。仍需补充从任务进入地图后的返回规则。（来源：`docs/gameplay/map-system/map-system.md`、`docs/ui-designs/ui.md`）

### 2.4 设计原则（Design Principles）

- **低保真控制台美学**：任务 UI 应使用控制台风格列表、面板、日志聚合和状态标签，避免现代任务清单式管理软件观感。（来源：`docs/ui-designs/ui-design-principles.md`）
- **通讯是指令通道**：任务系统只能解释、导航、提醒和聚合；所有移动、调查、停止、待命仍必须通过通讯台 / 通话发出。（来源：`docs/core-ideas.md`、`docs/gameplay/communication-table/communication-table.md`）
- **PC 是唯一权威端**：手机 companion 可承载私密通讯或提醒，但任务关键选择不能只在手机端发生。（来源：`docs/gameplay/dual-device-play/dual-device-play.md`）

### 2.5 最近 commits（Recent Changes）

- **近期主题概览**：最近 git log 聚焦 IAFS 坠毁点探索流、手机通讯终端、事件编辑器、IAFS story/event/map、全局日志、Phaser 地图、worldbuilding foundation、系统去 mock、地图对象与行动系统、Yuan 双设备文档。没有给出具体 hash；此项为项目内扫描摘要，需要后续实现前用 `git log` 复核。

### 2.6 项目约束（Project Constraints）

- **内容与规则分离**：若新增任务内容，需要明确使用 `content/quests` 还是复用 `content/events`，并补 schema 与 `validate-content` 校验。（证据：`content/` 结构、`scripts/validate-content.mjs`、`docs/game_model/event.md`）
- **任务日志不是事实源**：玩家可见日志不能承担规则判定；完成、失败、过期和解锁应读取结构化 facts、objective、event state、flags 或 history。（证据：`docs/game_model/event-integration.md`）
- **事件图暂不支持 parallel / join**：若主线任务需要多个子任务并行完成后汇合，需要决定由 quest 层聚合，还是扩展事件图。该点尚未定案。（证据：`docs/gameplay/event-system/event-system.md`、`docs/game_model/event.md`）
- **手机端不能阻断主线**：PC 仍是唯一权威 `GameState`，手机 companion 是可选增强。（证据：`docs/gameplay/dual-device-play/dual-device-play.md`）

## 3. Best Practice Findings（互联网发现，未做互联网调研则跳过本节）

### 3.1 参考游戏作品（Reference Games）

- **Baldur's Gate 3 Journal**：Journal 记录 known、factual、relevant、reactive 的信息，定位为“下一目标”和“关键事件提醒”，不是百科或秘密清单。借鉴点：任务日志只写可行动、已知、相关的信息。可信度：高，官方文档。参考：https://docs.baldursgate3.game/index.php?title=Journal_Design_Guidelines
- **Baldur's Gate 3 Journal Structure**：推荐 Category -> Quest -> Objective -> Step，左侧 categories / quests / optional subquests，右侧 objectives / steps。借鉴点：可作为任务数据与 UI 的基础层级。可信度：高，官方文档。参考：https://docs.baldursgate3.game/index.php?title=Journal_Structure_Overview
- **The Long Dark Survival Menu / Journal**：生存叙事游戏常把任务、日志、资料、统计分开。借鉴点：任务日志、队员日记 / 通讯记录、资料库 / 地图笔记应分工。可信度：官方 Survival Mode 页面高；Fandom 页面中低，属于二手资料。参考：https://www.thelongdark.com/survival-mode 、https://thelongdark.fandom.com/wiki/Survival_Menu 、https://thelongdark.fandom.com/wiki/Journal
- **Subnautica PDA**：PDA Data Bank 记录扫描信息、行为假设和生存建议，Message Log 记录语音消息。借鉴点：适合低指令、高探索的提示方式。可信度：高，官方更新说明。参考：https://unknownworlds.com/subnautica/h2o-update/
- **Disco Elysium Tasks**：弱化主线 / 支线边界，把任务视为人生和调查事项。借鉴点：可按来源、紧急性和调查线索组织任务；但本项目仍应标出关键 / 可选 / 紧急。可信度：Steam 官方新闻高；IGN / Fandom 为二手资料，中低可信。参考：https://store.steampowered.com/news/posts/?appids=632470&enddate=1570032057 、https://au.ign.com/wikis/disco-elysium/Walkthrough 、https://discoelysium.fandom.com/wiki/Tasks

### 3.2 玩法模式与设计惯例（Patterns & Conventions）

- **一个 quest 应有明确 end goal 与 call to action**：任务至少从一个行动号召开始，经 meaningful actions 推进，并有 closure / end goal。可信度：高，BG3 官方文档。参考：https://docs.baldursgate3.game/index.php?title=Journal_Design_Guidelines
- **一个 quest 通常只有一个当前 active objective**：由最高优先级的已解锁 objective 决定当前目标。可信度：高，BG3 官方文档。参考：https://docs.baldursgate3.game/index.php?title=Journal_Structure_Overview
- **Subquest 只表达可选链、分支、矛盾目标或独立失败条件**：subquest 有 parent，但不再嵌套 subquest。可信度：高，BG3 官方文档。参考：https://docs.baldursgate3.game/index.php?title=Journal_Structure_Overview
- **任务 UI 常拆成列表、详情、节点、需求进度**：Quest List 可按状态、hidden、tracked、Global / Local 过滤；HUD 可显示任务节点和需求进度。可信度：中高，商业工具文档。参考：https://docs.gamecreator.io/quests/ui/ 、https://orkframework.com/guide/documentation/features/quests 、https://orkframework.com/guide/non-knowledgebase/ui-system/huds-quests/
- **开发工具搜索可支持分类 / 任务 / 状态范围过滤**：对编辑器有价值，玩家端不宜暴露技术化前缀。可信度：高，Larian 工具文档。参考：https://docs.larian.game/Journal_editor
- **任务推进可用节点图表达，但玩家 UI 不必暴露图结构**：节点图适合设计与运行时，玩家只需要当前目标、事实和后果。可信度：中，开源 README。参考：https://github.com/the-tale/questgen/blob/master/README.rst

### 3.3 已知陷阱（Known Pitfalls）

- **任务日志过度克制会让玩家忘记线索**：只记录关键事实是对的，但 `stellar-frontier` 的异步通讯和多队员探索需要足够上下文。参考：https://docs.baldursgate3.game/index.php?title=Journal_Design_Guidelines
- **CRPG 结构对 MVP 过重**：Category -> Quest -> Objective -> Step 可借鉴，但不应一次实现大量分类、subquest 和筛选。参考：https://docs.baldursgate3.game/index.php?title=Journal_Structure_Overview
- **多目标导航会制造 UI 噪声**：部分 RPG 需要“只显示当前目标 / 显示所有目标”切换。Starfield 相关资料来自 IGN 与 DualShockers，属非官方二手资料，中低可信。参考：https://www.ign.com/wikis/starfield/How_to_Turn_Off_Multiple_Waypoints_and_Only_Show_Active_Quest 、https://www.dualshockers.com/starfield-how-to-track-quest-objectives/
- **数字进度条会削弱叙事感**：ORK / Game Creator 的需求进度适合材料、击杀、收集类任务；本项目应优先用事实日志和行动建议表达进展。参考：https://orkframework.com/guide/non-knowledgebase/ui-system/huds-quests/ 、https://docs.gamecreator.io/quests/ui/
- **支线不只是独立小任务**：支线也可以是主任务中的 optional side stub。可信度：中，行业文章。参考：https://www.gamedeveloper.com/design/the-quest-for-the-custom-quest-system

### 3.4 SOTA / 新趋势（可选）

- **从任务清单转向叙事操作台**：Subnautica、The Long Dark、Disco Elysium 等案例显示，探索 / 生存 / 叙事游戏更常把任务、通讯、日志、资料库分开，但在关键时刻给出可执行下一步。可信度：混合；官方资料可信度高，Fandom / IGN 为二手资料，应谨慎使用。参考：https://unknownworlds.com/subnautica/h2o-update/ 、https://www.thelongdark.com/survival-mode 、https://store.steampowered.com/news/posts/?appids=632470&enddate=1570032057

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：独立 Quest 系统 vs 复用 Objective / Event

- **独立 Quest 系统的优势**：能清晰表达主线 / 支线 / 个人任务、任务日志、追踪、失败和 UI 分类；也能把多个事件 objective 聚合成长期目标。
- **复用 Objective / Event 的优势**：实现更小，直接沿用现有事件图、flags、history、deadline 和行动桥接，避免新增并行事实源。
- **建议**：MVP 不替代事件图。先定义轻量 quest 聚合层：Quest 负责分类、标题、当前目标、日志引用和 UI 状态；Objective / Event 继续负责规则推进和完成判定。

### Trade-off 2：单一 active objective vs 多个并行推进目标

- **单一 active objective 的优势**：UI 清楚，地图 marker 少，符合 BG3 等成熟任务日志惯例。
- **多个并行推进目标的优势**：更贴合多队员探索、紧急来电、可选地点调查和主线中的 side stub。
- **建议**：列表层只显示一个“推荐当前目标”；详情层可列出“可选推进方式”或“相关 objective”。不要在 MVP 扩展事件图 parallel / join，除非主线设计明确需要。

### Trade-off 3：任务 UI 可直接行动 vs 只做导航和解释

- **直接行动的优势**：操作短，玩家可从任务详情一键派遣、调查或修复。
- **只做导航和解释的优势**：符合项目核心约束：通讯台 / 通话是唯一指令通道，地图只读，队员行动受 `crew_actions` 约束。
- **建议**：任务详情只提供“呼叫相关队员”“查看地图位置”“查看相关通讯 / 日志”等入口；真正行动必须进入通话流程。

## 5. Key References（关键参考）

### 5.1 项目文件（Project Files）

- `docs/core-ideas.md` — 核心原则：通讯是指令通道，地图只读，任务 UI 需遵守这些边界。
- `docs/gameplay/event-system/event-system.md` — 事件节点、objective、剧情推进边界。
- `docs/game_model/event.md` — objective runtime 字段与 out_of_scope，明确排除完整 quest system。
- `docs/game_model/event-integration.md` — `objectives`、`event_logs`、`world_history`、`world_flags` 在 save state 中的位置。
- `docs/gameplay/communication-table/communication-table.md` — 通讯台 / 通话作为行动入口。
- `docs/game_model/call-action.md` — 基础行动、剧情动作和 action_request 边界。
- `docs/gameplay/map-system/map-system.md` — 地图只读、marker 和地块反馈边界。
- `docs/game_model/map.md` — 地图数据契约与地块目标引用背景。
- `docs/gameplay/crew/crew.md` — 队员行动、日记和角色表达。
- `docs/game_model/crew.md` — 队员数据模型与行动事实源相关约束。
- `docs/gameplay/time-system/time-system.md` — deadline / timeout 依赖运行中时间，不做离线补算。
- `docs/gameplay/dual-device-play/dual-device-play.md` — PC 权威端与手机 companion 边界。
- `docs/ui-designs/ui.md` — 通讯台作为任务入口，页面职责与跳转关系。
- `docs/ui-designs/ui-design-principles.md` — 低保真控制台、任务 / 事件 / 日志聚合方向。
- `docs/ui-designs/pages/通讯台.md` — 通讯台页面级职责。

### 5.2 外部链接（External Links）

- https://docs.baldursgate3.game/index.php?title=Journal_Design_Guidelines — BG3 Journal 设计原则；可信度高，官方文档。
- https://docs.baldursgate3.game/index.php?title=Journal_Structure_Overview — BG3 Journal 层级结构；可信度高，官方文档。
- https://docs.gamecreator.io/quests/ui/ — Game Creator Quest UI 筛选与追踪；可信度中高，商业工具文档。
- https://docs.larian.game/Journal_editor — Larian Journal Editor 搜索与结构；可信度高，官方工具文档。
- https://orkframework.com/guide/documentation/features/quests — ORK Quest 功能；可信度中高，商业工具文档。
- https://orkframework.com/guide/non-knowledgebase/ui-system/huds-quests/ — ORK Quest HUD 与进度显示；可信度中高，商业工具文档。
- https://www.thelongdark.com/survival-mode — The Long Dark 官方 Survival Mode；可信度高。
- https://thelongdark.fandom.com/wiki/Survival_Menu — The Long Dark Survival Menu；可信度中低，Fandom 二手资料。
- https://thelongdark.fandom.com/wiki/Journal — The Long Dark Journal；可信度中低，Fandom 二手资料。
- https://unknownworlds.com/subnautica/h2o-update/ — Subnautica H2.0 官方更新说明；可信度高。
- https://store.steampowered.com/news/posts/?appids=632470&enddate=1570032057 — Disco Elysium 官方 / 开发者文本；可信度高。
- https://au.ign.com/wikis/disco-elysium/Walkthrough — Disco Elysium Walkthrough；可信度中低，二手资料。
- https://discoelysium.fandom.com/wiki/Tasks — Disco Elysium Tasks；可信度中低，Fandom 二手资料。
- https://www.ign.com/wikis/starfield/How_to_Turn_Off_Multiple_Waypoints_and_Only_Show_Active_Quest — Starfield waypoint UX 资料；可信度中低，非官方二手资料。
- https://www.dualshockers.com/starfield-how-to-track-quest-objectives/ — Starfield objective tracking 资料；可信度中低，非官方二手资料。
- https://github.com/the-tale/questgen/blob/master/README.rst — questgen 节点图思路；可信度中，开源 README。
- https://www.gamedeveloper.com/design/the-quest-for-the-custom-quest-system — custom quest system 与 side stub；可信度中，行业文章。

## 6. Open Questions for Design

- **Q1：Quest 与 Objective 的边界是什么？** Quest 是否只聚合现有 objectives，还是也拥有自己的完成条件、失败条件和 deadline？
- **Q2：主线 / 支线 / 个人任务 / 紧急任务如何分类？** 分类是内容标签、UI 分组，还是影响优先级和通知规则？
- **Q3：任务节点与事件图如何连接？** 多节点任务是否复用 event nodes，还是新增 quest node；并行子任务和汇合由 quest 层处理还是事件图扩展？
- **Q4：任务日志与 event_log / global log 的关系是什么？** 任务详情是引用日志条目，还是复制一份可编辑摘要？
- **Q5：任务 UI 允许哪些快捷入口？** 是否可以追踪、置顶、跳转地图、呼叫队员、打开通话记录；是否明确禁止从任务详情直接下达行动？
- **Q6：失败、过期、放弃和错过如何表达？** 哪些任务可失败，是否允许玩家主动放弃，错过的内容是否进入历史日志？
- **Q7：任务内容放在哪里？** 新增 `content/quests`，还是把 quest 定义嵌入 `content/events`；对应 schema 和 `validate-content` 规则如何设计？
- **Q8：手机 companion 与任务的关系是什么？** 手机是否只显示提醒 / 私密通讯，还是可查看任务日志；任务关键选择是否一律保留在 PC？

---

**Research Completed:** 2026-05-09 20:58  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
