---
topic: configurable-map-system
date: 2026-04-27
research_scope:
  codebase: true
  internet: true
source:
  initial: docs/plans/2026-04-27-17-37/initial.md
  research_topics: docs/plans/2026-04-27-17-37/research-topics.md
---

# Research: configurable-map-system

## 1. Research Summary（研究摘要）

本轮研究服务于地图系统改进：把当前固定 `4 x 4` 地图推进为可配置地图，并澄清地形、资源、建筑、兴趣点等概念边界，同时修正队员位置显示中“资源名被当作地点名”的问题。核心冲突是：现有文档与代码语境均把 `4 x 4` 视为当前 MVP 事实，而用户目标希望默认 `8 x 8` 且地图尺寸可配置。

项目内调研显示，地图在当前产品定位中应继续保持只读态势图，所有移动、调查、采集、建设等指令仍必须通过“通讯台 → 通话”发出。互联网调研则建议将地块拆成“底层地形 + 环境特征 + 资源节点 / 信号 / 遗迹站点 + 玩家设施 / 区域”等层，避免把所有东西塞进单一“兴趣点 / POI”字段。对后续策划案的主要影响是：本轮应优先定义数据层级、显示规则、通话动作生成规则和可见区域规则，而不是把地图页改造成直接操作界面。

## 2. Project Findings（项目内发现，未做项目内调研则跳过本节）

### 2.1 已有玩法系统（Existing Gameplay Systems）

- **通讯下令 core loop**：玩家通过“通讯台 → 通话”理解现场并下达移动、调查、采集、建设、撤离、应急等指令，地图不承担直接下令职责。（证据：`docs/core-ideas.md`、`docs/ui-designs/pages/通话.md`、`docs/ui-designs/pages/地图.md`）
- **固定网格与移动规则**：当前 MVP 多处写明地图为 `4 x 4`，坐标范围示例为 `(1,1)` 到 `(4,4)`；移动使用曼哈顿路径，按格推进，不允许斜向移动。（证据：`docs/gameplay/crew/crew.md`、`docs/gameplay/time-system/time-system.md`、`README.md`、`AGENTS.md`）
- **行动耗时与地形关联**：每格默认 `60 秒`，并已有地形耗时倾向：平原、丘陵、森林、山地、沙漠、水域分别影响可通行性与移动耗时。（证据：`docs/gameplay/crew/crew.md`、`src/crewSystem.ts`）
- **事件与地块状态**：抵达、调查完成、采集完成、建设完成、长时间待命、通话选项均可触发事件；地块状态会影响玩家可见信息与行动结果。（证据：`docs/gameplay/event-system/event-system.md`、`src/eventSystem.ts`）

### 2.2 现存叙事设定与角色（Existing Narrative & Crew）

- **队员现场感**：队员是玩家理解地图现场的主要媒介，当前位置应以“地形 + 坐标”表达，对象、资源、建筑应作为地块内容另列，避免把“木材”等资源显示成地点名。（来源：`docs/gameplay/crew/crew.md`、`docs/ui-designs/pages/通讯台.md`）
- **角色差异暂不自动判定**：属性、性格标签、专长标签当前主要用于展示与文本参考，少量专长效果例外；本轮不应默认引入复杂属性自动判定。（来源：`docs/gameplay/crew/crew.md`、`AGENTS.md`）

### 2.3 现存 UI 设计（Existing UI Design）

- **地图页只读**：地图页展示坐标、地形、资源、建筑、仪器、队员位置、危险和状态，不直接派发行动。（来源：`docs/ui-designs/pages/地图.md`）
- **通话页承载行动选择**：通话页可根据角色状态、资源和地块条件启用 / 禁用行动；需要地点信息时可打开地图查看，再回到通话确认。（来源：`docs/ui-designs/pages/通话.md`）
- **通讯台展示人员状态**：通讯台需要显示队员当前位置、行动状态和通讯入口，因此队员位置字段必须与地图坐标和地形模型一致。（来源：`docs/ui-designs/pages/通讯台.md`）

### 2.4 设计原则（Design Principles）

- **低保真控制台美学**：UI 强调信息面板、状态标签、有限交互和清晰态势，而非复杂拟物地图操作。（来源：`docs/ui-designs/ui-design-principles.md`）
- **单一 GameState**：通讯台、地图、通话页必须读取同一套 `GameState`，避免页面状态不一致。（来源：`AGENTS.md`、`src/App.tsx`）
- **内容与规则分离**：队员、事件、物品来自 `content/*.json`；稳定引用应使用 ID，展示时再转换为中文显示名。（来源：`content/README.md`、`src/content/contentData.ts`）

### 2.5 最近 commits（Recent Changes）

- **近期改动方向**：最近提交主要集中在背包 / 道具系统、事件 effect、通话 choice 可用性、inventory modal，未观察到针对地图尺寸、地图对象模型或坐标显示的明显近期提交。（来源：recent git log 调研摘要）

### 2.6 项目约束（Project Constraints）

- **地图尺寸冲突**：当前文档和实现以固定 `4 x 4` 为基线；可配置尺寸与默认 `8 x 8` 会影响坐标范围、路径生成、可达性、UI 渲染和存档兼容。（来源：`README.md`、`AGENTS.md`、`src/data/gameData.ts`）
- **指令入口约束**：地图不得变成直接操作入口；即使显示建议行动或可通话指令预览，执行仍应回到通讯 / 通话流程。（来源：`docs/core-ideas.md`、`docs/ui-designs/pages/地图.md`）
- **语义约束**：旧医疗前哨、矿床、生物巢穴、废弃医疗舱更像地块对象 / 站点 / 资源节点，而不是地形；“兴趣点”若作为万能筐会与自然资源、玩家建筑、仪器、危险等概念重叠。（来源：`docs/ui-designs/pages/地图.md`、`docs/plans/2026-04-27-17-37/initial.md`）

## 3. Best Practice Findings（互联网发现，未做互联网调研则跳过本节）

### 3.1 参考游戏作品（Reference Games）

- **Civilization VI**：官方术语区分 terrain、resources、features、improvements、districts、wonders。借鉴点：地形、资源、建筑 / 设施应是不同层级，不应混成一个显示字段。参考：https://civilization.2k.com/civ-vi/
- **The Sims 4**：interaction system 强调从“当前对象 + 当前角色 + 当前状态”生成可用互动。借鉴点：通话页行动菜单可按地块对象聚合，并结合队员状态、道具和地块状态启用或置灰。参考：https://www.gdcvault.com/play/1020190/concurrent-interactions-in-the-sims
- **RimWorld**：菜单用于承载情境命令，但常用命令需要保持可发现。借鉴点：不宜让所有地图互动都藏进深层菜单。参考：https://rimworldwiki.com/wiki/Menus

### 3.2 玩法模式与设计惯例（Patterns & Conventions）

- **分层 tile model**：地图地块可拆为 terrain、features、resourceNodes、structures、discoveries / signals、zones / areas 等层。参考：https://doc.mapeditor.org/en/stable/manual/layers/
- **视觉层与规则层分离**：visualVariant、mapGlyph 等只负责显示，terrain、hazards、resourceNodes、availableActions 才参与规则判定，避免自动拼接视觉影响玩法。参考：https://docs.godotengine.org/en/stable/tutorials/2d/using_tilemaps.html
- **上下文菜单轻量化**：上下文菜单应相关、少量、可预测；常用动作直接露出，低频动作进入二级菜单。参考：https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/menus
- **备用入口与可发现性**：隐藏菜单需要可发现性补偿；本项目可在只读地图页显示“通讯建议 / 可请求行动预览”，但执行仍回通话页。参考：https://www.nngroup.com/articles/contextual-menus/

### 3.3 已知陷阱（Known Pitfalls）

- **单字段地块模型过载**：把地形、资源、建筑、危险、遗迹都塞进一个字段，会导致显示、规则和事件触发互相污染。参考：https://doc.mapeditor.org/en/stable/manual/introduction/
- **POI 变成万能筐**：POI 若没有边界，会同时代表地点、资源、任务目标、设施和事件触发器，后续难以扩展。参考：https://civilization.2k.com/civ-vi/update-notes/
- **隐藏不可执行动作**：直接隐藏动作会让玩家不理解缺少什么条件；更好的做法是置灰并说明原因，必要时给替代行动。参考：https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/menus
- **菜单层级过深**：对象很多时，二级菜单容易变成寻找命令的负担；MVP 应限制对象数量和常用动作数量。参考：https://www.nngroup.com/articles/contextual-menus/

### 3.4 SOTA / 新趋势（可选）

- **本轮不展开**：调研重点是稳定地块建模与情境动作菜单，未发现需要引入前沿技术或复杂编辑器的必要性。MVP 更适合采用明确、可手工配置的数据结构。

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：固定 `4 x 4` vs 可配置 `8 x 8`

- **固定 `4 x 4` 的优势**：实现稳定，现有文档、测试、坐标示例、UI 密度和存档假设都围绕它展开。
- **可配置 `8 x 8` 的优势**：更符合长期探索节奏，能支撑可见区域外接长方形、局部探索和更多地块对象。
- **建议**：策划案中明确“当前实现基线从固定 4x4 迁移到配置驱动，默认配置为 8x8”；同时列出坐标、路径、UI 和存档兼容的验收项。

### Trade-off 2：“兴趣点”统一一切 vs 分层地块对象模型

- **“兴趣点”统一一切的优势**：概念少，短期文案易懂，适合快速实现矿床、医疗舱、巢穴等对象。
- **分层模型的优势**：能区分 terrain、resourceNodes、structures、signals、discoveries，减少地形 / 资源 / 建筑 / 事件触发器混淆。
- **建议**：玩家文案可使用“信号源、异常点、遗迹站点、资源点、地标”等自然语言；数据模型避免只用 POI，建议使用 `terrain` + `features` + `resourceNodes` + `structures` + `signals/discoveries`。

### Trade-off 3：通话动作平铺 vs 对象级二级菜单


- **动作平铺的优势**：入口直观，适合少量常用动作，如前往、待命、调查、停止工作。
- **对象级二级菜单的优势**：能把“矿床 → 采矿 / 勘测 / 使用道具调查”等动作聚合到对象下，便于解释道具和条件。
- **建议**：MVP 保持常用动作一级露出；对象相关动作按对象分组，但限制层级为最多二级，并对不可执行动作置灰显示原因。

## 5. Key References（关键参考）

### 5.1 项目文件（Project Files）

- `docs/plans/2026-04-27-17-37/initial.md` — 本轮地图系统改进的原始诉求。
- `docs/plans/2026-04-27-17-37/research-topics.md` — 本轮项目内与互联网调研范围。
- `docs/core-ideas.md` — 通讯下令、非直接操控等核心定位。
- `docs/gameplay/crew/crew.md` — 队员移动、当前位置、行动状态相关规则。
- `docs/gameplay/event-system/event-system.md` — 地块行动与事件触发关系。
- `docs/gameplay/time-system/time-system.md` — 时间推进与行动耗时背景。
- `docs/ui-designs/pages/地图.md` — 地图页只读展示与地块信息结构。
- `docs/ui-designs/pages/通话.md` — 通话页行动选择与地图查看入口。
- `docs/ui-designs/pages/通讯台.md` — 队员状态与当前位置展示。
- `docs/ui-designs/ui-design-principles.md` — 低保真控制台 UI 原则。
- `README.md` — 当前原型能力摘要。
- `AGENTS.md` — 项目约束、当前能力和 out of scope。
- `content/README.md` — 内容数据与稳定 ID 使用约束。

### 5.2 外部链接（External Links）

- https://doc.mapeditor.org/en/stable/manual/introduction/ — Tiled 基础概念与地图编辑器参考。
- https://doc.mapeditor.org/en/stable/manual/layers/ — 地图分层组织参考。
- https://docs.godotengine.org/en/stable/tutorials/2d/using_tilemaps.html — TileMap 分层与规则 / 显示分离参考。
- https://docs.unity3d.com/Packages/com.unity.2d.tilemap.extras@3.1/manual/RuleTile.html — Rule Tile 与视觉拼接参考。
- https://civilization.2k.com/civ-vi/ — terrain / resources / features 等 4X 地图术语参考。
- https://civilization.2k.com/civ-vi/update-notes/ — Civilization VI 术语与系统更新参考。
- https://www.gdcvault.com/play/1020190/concurrent-interactions-in-the-sims — The Sims 情境互动系统参考。
- https://learn.microsoft.com/en-us/windows/apps/develop/ui/controls/menus — 菜单与上下文命令设计建议。
- https://www.nngroup.com/articles/contextual-menus/ — 上下文菜单可用性建议。
- https://rimworldwiki.com/wiki/Menus — 游戏内菜单与情境命令参考。

## 6. Open Questions for Design

- **Q1**：本轮是否正式把当前地图基线从固定 `4 x 4` 改为“配置驱动，默认 `8 x 8`”，还是先只写设计、代码后续再迁移？
- **Q2**：玩家文案中是否继续使用“兴趣点”，还是改为更具体的“资源点 / 遗迹站点 / 信号源 / 异常点 / 地标”？
- **Q3**：玩家建筑应归入 `structures`，还是和自然生成对象一起作为可互动对象展示？
- **Q4**：可见区域“已发现区域 + 外围一圈未探索区域 + 外接长方形”是否按所有已发现地块合并计算，还是按队员当前位置分别计算？
- **Q5**：通话页对象动作是否允许二级菜单？如果允许，是否限制为“常用动作一级露出，对象动作最多二级”？
- **Q6**：不可执行动作应全部置灰说明原因，还是部分低相关动作直接隐藏？

---

**Research Completed:** 2026-04-27 17:37  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
