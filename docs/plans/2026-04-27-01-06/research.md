---
topic: inventory-item-event-economy
date: 2026-04-27
research_scope:
  codebase: true
  internet: true
source:
  initial: docs/plans/2026-04-27-01-06/initial.md
  research_topics: docs/plans/2026-04-27-01-06/research-topics.md
---

# Research: inventory-item-event-economy

## 1. Research Summary（研究摘要）

本次研究聚焦“背包 / 道具如何参与事件与通话决策”。项目内调研显示：当前设计文档已经多次预留背包与物品在事件条件、概率修正、奖励归属中的位置；代码也已经具备物品 JSON、队员 inventory、`inventory.has(item_id)` 条件解析、部分事件效果结算和人物详情携带物展示。但背包仍不是独立系统，事件奖励默认进入基地资源，通用的添加 / 移除 / 消耗队员背包物品效果尚未建立。

互联网调研显示，叙事驱动游戏更适合把道具视为剧情状态、行动机会和事件分支条件，而不是先做完整库存经济。参考 Failbetter 的 quality-based narrative、Sunless Sea 的主题化资源管理、80 Days 的“just enough gameplay”，本轮后续设计需要优先澄清：事件奖励进入哪里、标签判定如何工作、消耗是否自动、UI 如何告知玩家，以及 MVP 是否执行 `stackable` / `maxStack`。

## 2. Project Findings（项目内发现，未做项目内调研则跳过本节）

### 2.1 已有玩法系统（Existing Gameplay Systems）

- **通讯与指令链路**：核心定位要求玩家通过通讯台、通话、地图信息、资源状态和事件日志理解现场并下达指令；地图只读，移动、调查、采集、建设、撤离、紧急处理等队员指令应经通讯台与通话发出。（来源：`docs/core-ideas.md`、`docs/gameplay/crew/crew.md`、`docs/ui-designs/pages/地图.md`）
- **队员行动规则**：队员是地图、资源、事件互动的主要媒介；同一时间只能执行一个主行动，状态包括 `idle`、`moving`、`working`、`inEvent`、`lost`、`dead`；紧急事件中不能接收普通移动指令，需要先处理事件。（来源：`docs/gameplay/crew/crew.md`）
- **事件系统预留背包关系**：事件可根据队员属性、携带物品、状态、技能和随机性决定结果；紧急事件通过通讯台来电和通话处理；事件系统关系图已经预留“背包系统”，用于提供携带物品、工具和任务物品，参与事件条件和概率修正。（来源：`docs/gameplay/event-system/event-system.md`）
- **事件数据模型**：事件已设计 `conditions`、`modifiers`、`effects`、`choices`、`tags` 等字段；条件示例包括 `inventory.has(scanner)`，修正来源包括携带物品。（来源：`docs/gameplay/event-system/event-system.md`）
- **事件效果范围**：事件效果字段已设计 `addResource`、`removeResource`、`discoverResource`、`updateTile`、`updateCrewStatus`、`addCrewCondition`、`startEmergency`、`addLog`；文档说明 `addResource` 可增加资源或队员背包物品。（来源：`docs/gameplay/event-system/event-system.md`）
- **资源归属规则**：资源相关事件规则写明，获得少量零散资源时可以直接进入基地库存；如果背包系统已实现，优先进入队员背包；事件造成资源损失时应明确资源来源，例如队员背包或基地库存。（来源：`docs/gameplay/event-system/event-system.md`）
- **时间系统边界**：查看队员背包、打开弹窗、通话、地图等普通 UI 不暂停时间；队员行动、事件处理、通话选择可消耗时间；关闭游戏后不推进时间、不离线补算。“整理背包”被列为未来扩展行动，耗时 `30 秒`，MVP 可不实现。（来源：`docs/gameplay/time-system/time-system.md`）
- **内容数据能力**：物品内容已经 JSON 化，字段包括 `itemId`、`name`、`category`、`stackable`、`maxStack`、`description`、`tags`、`effects`；分类包括 `tool`、`weapon`、`consumable`、`resource`、`quest`、`misc`；效果类型 schema 包括 `chanceModifier`、`yieldModifier`、`unlockChoice`、`restoreCondition`、`combatBonus`、`communicationBonus`。（来源：`content/items/items.json`、`content/schemas/items.schema.json`）
- **队员 inventory 能力**：队员内容已有 `inventory` 数组，结构为 `{ itemId, quantity }`，Mike、Amy、Garry、林夏、Kael 均有预设携带物；内容校验会检查队员 `inventory.itemId` 是否存在于 items。（来源：`content/crew/crew.json`、`content/schemas/crew.schema.json`、`scripts/validate-content.mjs`）
- **运行时背包展示**：`CrewMember` 类型包含 `inventory` 和格式化后的 `bag`；初始化时从 `content/crew/crew.json` 读取 inventory，并用 `formatInventory` 转成展示文本。（来源：`src/data/gameData.ts`、`src/content/contentData.ts`）
- **事件运行时能力**：事件内容已使用 `inventory.has(basic_tool)`、`inventory.has(scanner)` 作为概率修正条件；事件条件解析已实现 `inventory.has(item_id)`；事件系统已实现基于属性、技能、队员状态、地块状态、事件历史、携带物品的条件 / 概率修正的一部分。（来源：`content/events/events.json`、`src/eventSystem.ts`）
- **事件效果运行时能力**：`addResource` / `removeResource` 当前修改基地资源汇总，支持 `iron_ore` 映射到 `resources.iron`，以及 `wood`、`food`、`water`；`discoverResource`、`updateTile`、`updateCrewStatus`、`addCrewCondition`、`startEmergency`、`addLog` 已有基础结算。（来源：`src/eventSystem.ts`）
- **专长与背包写入路径**：`surveyBonus` 可在调查完成时按概率给资源或加入队员 inventory；`basic_tool` 会加入队员背包，`iron_ore` 目前进入基地资源；`addInventoryItem` 已能把新物品加入队员 inventory，已有同 `itemId` 时叠加数量。（来源：`src/App.tsx`）

### 2.2 现存叙事设定与角色（Existing Narrative & Crew）

- **队员表达范围**：队员能力采用体能、敏捷、智力、感知、运气 5 维轻量属性；自由性格标签只用于展示与写作依据，不直接参与规则判定；专长标签可在手工定义情境中产生规则效果。（来源：`docs/gameplay/crew/crew.md`）
- **当前不纳入核心范围的角色系统**：背包负重、关系 / 士气、角色成长、程序生成角色不属于当前人物表达规则核心范围；背包负重明确是搁置方向。（来源：`docs/gameplay/crew/crew.md`）

### 2.3 现存 UI 设计（Existing UI Design）

- **通讯台背包入口**：UI 总览中通讯台的队员卡片可“查看背包”；背包二级窗口显示对应队员携带物。（来源：`docs/ui-designs/ui.md`）
- **通讯台页面要求**：“查看背包”应打开队员背包二级窗口，显示携带的资源、工具和任务物品；若队员正在紧急事件中，查看背包不应替代接通决策。（来源：`docs/ui-designs/pages/通讯台.md`）
- **当前实现差异**：当前实现中队员卡片按钮是“查看档案”；携带物在档案弹窗里的“携带物”面板展示，没有独立背包二级窗口。（来源：`src/pages/CommunicationStation.tsx`、`src/pages/CrewDetail.tsx`）
- **通话页面职责**：通话页面承载剧情选择和紧急事件决策；选择结果影响角色状态、资源状态或地图地块状态；通话选项不宜提供无成本最优解。（来源：`docs/ui-designs/pages/通话.md`）
- **人物详情携带物面板**：人物详情页已有“携带物”面板，展示 `member.bag`，并提示“背包容量与负重规则不属于本轮人物系统”。（来源：`src/pages/CrewDetail.tsx`）

### 2.4 设计原则（Design Principles）

- **内容与规则分离**：游戏文本、队员、事件和物品配置属于 `content/`；设计意图与系统规则属于 `docs/`。（来源：`docs/core-ideas.md`）
- **低摩擦 UI 扩展**：UI 设计原则强调文本优先、高信息密度、日志反馈、折叠 / 弹窗优先于复杂导航、新功能从既有模块中生长出来。（来源：`docs/ui-designs/ui-design-principles.md`）
- **地图只读原则**：地图页面只读展示地形、资源、建筑、仪器、手下状态和危险，不提供采集、调查、建设、联系、移动等指令。（来源：`docs/ui-designs/pages/地图.md`）

### 2.5 最近 commits（Recent Changes）

- **N/A：未提供具体 commit hash**：输入调研结果仅说明近期 `git log --oneline -n 12` 显示项目最近重点是核心理念文档、AGENTS/README、人物系统、内容 JSON 化事件系统、队员移动、时间系统和 React UI MVP；背包与道具还没有独立系统提交。（来源：`git log --oneline -n 12`）

### 2.6 项目约束（Project Constraints）

- **当前缺口：事件奖励归属**：事件 `addResource` 当前进入基地资源汇总，不会把获得物加入触发队员背包；这与文档中“如果背包系统已实现，优先进入队员背包”的方向尚未对齐。（来源：`src/eventSystem.ts`）
- **当前缺口：背包效果类型**：没有通用事件效果用于“给队员背包添加物品”或“从队员背包移除 / 消耗物品”；现有 schema 也没有 `addItem`、`removeItem`、`consumeItem`、`useItem` 等效果类型。（来源：`content/schemas/events.schema.json`、`src/eventSystem.ts`）
- **当前缺口：资源扣减来源**：`removeResource` 当前只扣基地资源，不扣队员 inventory。（来源：`src/eventSystem.ts`）
- **当前缺口：标签判定**：事件条件只支持 `inventory.has(itemId)` 精确道具 ID 检查，不支持按标签检查，例如 `inventory.hasTag(food)` 或 `inventory.hasTag(light)`；物品 `tags` 已存在，但事件系统没有读取 `itemDefinitionById` 的 tags 来做条件判断或分支结算。（来源：`src/content/contentData.ts`、`src/eventSystem.ts`）
- **当前缺口：物品效果解释器**：物品 `effects` 已在内容和类型中定义，但运行时没有通用结算物品效果的系统；例如 `combatBonus`、`restoreCondition`、`yieldModifier`、`communicationBonus` 目前不是自动生效规则。（来源：`content/items/items.json`、`src/eventSystem.ts`）
- **当前缺口：堆叠规则**：`stackable` / `maxStack` 只在内容 schema 中存在，`addInventoryItem` 叠加数量时没有检查 `maxStack`，也没有处理非堆叠物品重复获得。（来源：`content/schemas/items.schema.json`、`src/App.tsx`）
- **当前约束：不做负重容量**：没有背包容量、重量、负重上限字段；这与本轮“MVP 不做负重 / 容量”一致。（来源：`content/schemas/items.schema.json`、`content/schemas/crew.schema.json`）
- **当前缺口：通话与道具入口**：普通通话行动仍以硬编码为主，例如 Garry 普通通话按钮来自 `garryActions`；道具使用尚未作为通话选项或事件选项的动态来源。（来源：`src/data/gameData.ts`、`src/pages/CallPage.tsx`）
- **todo 状态**：`docs/todo.md` 当前只记录 wiki 索引页相关搁置项，没有背包 / 道具系统条目。（来源：`docs/todo.md`）

## 3. Best Practice Findings（互联网发现，未做互联网调研则跳过本节）

### 3.1 参考游戏作品（Reference Games）

- **Failbetter / StoryNexus / Fallen London**：Failbetter 明确提出 `quality-based narrative`，用 storylet 的出现条件和结果修改 `qualities` 来组织互动叙事。借鉴点：物品、状态、进度都可以被统一建模为可检查 / 可修改的状态；每次事件选择都回写状态，可降低分支爆炸和内容债。参考：https://www.failbettergames.com/storynexus-developer-diary-2-fewer-spreadsheets-less-swearing/
- **Sunless Sea**：资源管理强调 hunger、terror、light / dark，并服务“探索、生存、孤独”的主题。借鉴点：道具经济需要和主题绑定；若本项目主题是远程通讯、队员风险和探索未知，道具就应影响通话决策、事件风险、队员安全，而不是先做完整生存经济。参考：https://www.gamedeveloper.com/audio/postmortem-failbetter-games-i-sunless-sea-i-
- **80 Days**：Inkle 提到 80 Days 从叙事出发，只加入“just enough gameplay”；资源管理的时间、金钱、行李天然贴合旅行主题。借鉴点：背包系统应先找“天然贴合探索”的最小规则；MVP 不做容量是合理的，但仍可通过事件消耗和标签用途让道具产生路线选择意义。参考：https://www.gamedeveloper.com/design/road-to-the-igf-inkle-s-i-80-days-i-

### 3.2 玩法模式与设计惯例（Patterns & Conventions）

- **事件驱动物品经济**：道具适合作为剧情状态与行动机会，而不是单纯库存资产；事件可发放道具、检查道具、消耗道具、改变后续事件出现条件。参考：https://www.failbettergames.com/storynexus-developer-diary-2-fewer-spreadsheets-less-swearing/
- **奖励来源绑定探索与叙事**：奖励来源不应只来自“战利品掉落”，也可来自调查地块、采集完成、建设完成、通话选项、紧急事件补偿、队员专长带来的额外发现。参考：https://www.gamedeveloper.com/audio/postmortem-failbetter-games-i-sunless-sea-i-
- **消耗优先服务事件分支**：消耗场景应优先服务事件分支，例如照明降低风险、食物安抚队员、医疗避免伤情升级；MVP 阶段不建议引入持续饥饿、耐久、维护费等循环消耗。参考：https://www.gamedeveloper.com/design/road-to-the-igf-inkle-s-i-80-days-i-
- **标签粒度从事件需求倒推**：MVP 推荐使用少量“玩家能一眼理解”的功能标签，例如 `食物`、`照明`、`医疗`、`工具`、`样本`、`能量`、`线索`，暂不建议拆得过细。参考：https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_tags?view=minecraft-bedrock-stable
- **标签同时服务系统和 UI**：道具卡片应显示功能标签，事件选项应提示“将消耗 1 个照明道具”或“拥有照明道具：风险降低”，避免后台自动判断导致玩家觉得结果任意。参考：https://dev.epicgames.com/documentation/en-us/unreal-engine/using-gameplay-tags-in-unreal-engine
- **替代品规则保持简单可读**：事件条件宜写成“需要任意一个标签”或“优先标签 + 备选标签”，不建议 MVP 做复杂配方、权重评分或多标签组合推理。参考：https://dev.epicgames.com/documentation/en-us/unreal-engine/using-gameplay-tags-in-unreal-engine

### 3.3 已知陷阱（Known Pitfalls）

- **无意义库存**：只作为氛围文本的物品容易制造无意义库存；每个 MVP 道具至少应满足可被事件标签匹配、可在通话中主动使用、可作为明确任务物、可转化为日志 / 线索之一。参考：https://www.failbettergames.com/storynexus-developer-diary-2-fewer-spreadsheets-less-swearing/
- **一次性钥匙过多**：只出现一次的钥匙型道具容易变成谜题开关，过多会制造无意义库存。参考：https://www.failbettergames.com/storynexus-developer-diary-2-fewer-spreadsheets-less-swearing/
- **自动消耗关键道具**：高价值、唯一、剧情绑定或多标签道具不适合自动消耗；例如既是 `照明` 又是 `信号` 的道具若被自动消耗，玩家可能产生被系统偷走关键物的挫败感。参考：https://www.gamedeveloper.com/design/road-to-the-igf-inkle-s-i-80-days-i-
- **生存数值管理喧宾夺主**：MVP 阶段若过早引入持续饥饿、耐久、维护费等循环消耗，可能把叙事探索拉向生存数值管理。参考：https://www.gamedeveloper.com/audio/postmortem-failbetter-games-i-sunless-sea-i-
- **标签词表失控**：标签若不是内容作者和系统共同使用的稳定词表，容易散落成随意字符串；MVP 可先不用层级标签，但应保留命名规范。参考：https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_tags?view=minecraft-bedrock-stable、https://dev.epicgames.com/documentation/en-us/unreal-engine/using-gameplay-tags-in-unreal-engine

### 3.4 SOTA / 新趋势（可选）

- **N/A**：输入调研结果未提供足够成熟的新趋势材料；仅提供了 Failbetter / Inkle 相关叙事资源管理案例，以及 Minecraft / Unreal 官方标签系统文档。

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：事件奖励进入队员背包 vs 进入基地库存

- **队员背包的优势**：符合文档中“如果背包系统已实现，优先进入队员背包”的方向；能让道具与队员、通话、事件风险形成更直接联系。（来源：`docs/gameplay/event-system/event-system.md`）
- **基地库存的优势**：当前 `addResource` / `removeResource` 已实现为基地资源汇总结算，代码路径更成熟；木材、食物、水、铁矿石等资源已有基地资源映射。（来源：`src/eventSystem.ts`）
- **建议**：本研究不做定案；后续访谈需要澄清木材、矿石、食物、水这类资源在 MVP 中进入队员背包、基地库存，还是按来源 / 场景 / 字段指定目标。

### Trade-off 2：按具体 itemId 判定 vs 按标签判定

- **具体 itemId 的优势**：当前已有 `inventory.has(item_id)`，规则精确、实现范围明确。（来源：`content/events/events.json`、`src/eventSystem.ts`）
- **标签判定的优势**：外部调研显示标签可作为可组合的系统语言，便于让多个同类道具服务同一类事件需求，也能降低一次性钥匙物品数量。（来源：https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_tags?view=minecraft-bedrock-stable、https://dev.epicgames.com/documentation/en-us/unreal-engine/using-gameplay-tags-in-unreal-engine）
- **建议**：本研究不做定案；后续访谈需要澄清是否新增 `inventory.hasTag(tag)`，以及多个满足标签的物品如何选择和消耗。

### Trade-off 3：自动消耗道具 vs 玩家明确选择

- **自动消耗的优势**：适合低价值、同质替代的资源型道具，可降低操作摩擦；但必须明确告知，并定义选择优先级。（来源：https://www.gamedeveloper.com/design/road-to-the-igf-inkle-s-i-80-days-i-）
- **玩家明确选择的优势**：适合高价值、唯一、剧情绑定或多标签道具，可避免系统自动消耗关键物带来的挫败感。（来源：https://www.gamedeveloper.com/design/road-to-the-igf-inkle-s-i-80-days-i-）
- **建议**：本研究不做定案；后续访谈需要澄清工具类是否只持有生效、消耗品是否使用后减少，以及带 `关键` / `唯一` / `任务` 标签的道具是否禁止自动消耗。

## 5. Key References（关键参考）

### 5.1 项目文件（Project Files）

- `docs/core-ideas.md` — 核心定位、指令通道、内容与规则分离原则。
- `docs/gameplay/crew/crew.md` — 队员行动、状态、属性、标签、专长与当前不做范围。
- `docs/gameplay/event-system/event-system.md` — 事件模型、背包预留关系、事件效果与资源归属规则。
- `docs/gameplay/time-system/time-system.md` — UI 不暂停时间、整理背包作为未来扩展行动。
- `docs/ui-designs/ui.md` — 通讯台查看背包与背包二级窗口的 UI 总览。
- `docs/ui-designs/pages/通讯台.md` — 通讯台背包窗口与紧急事件优先级要求。
- `docs/ui-designs/pages/通话.md` — 通话选择、紧急决策与无成本最优解约束。
- `docs/ui-designs/pages/地图.md` — 地图只读、不下达指令。
- `docs/ui-designs/ui-design-principles.md` — 文本优先、高信息密度、日志反馈、弹窗 / 折叠优先。
- `docs/todo.md` — 当前无背包 / 道具系统条目。
- `content/items/items.json` — 物品内容、分类、标签、效果字段。
- `content/schemas/items.schema.json` — 物品 schema、分类、效果类型、堆叠字段。
- `content/crew/crew.json` — 队员预设 inventory。
- `content/schemas/crew.schema.json` — 队员 inventory schema。
- `content/events/events.json` — 事件中已有 `inventory.has(...)` 概率修正条件。
- `content/schemas/events.schema.json` — 事件 schema 当前缺少 add / remove / consume item 类效果。
- `scripts/validate-content.mjs` — 内容校验与跨文件引用检查。
- `src/content/contentData.ts` — 内容加载、物品定义查询与 inventory 格式化来源。
- `src/data/gameData.ts` — `CrewMember` inventory / bag 类型与硬编码普通通话行动。
- `src/eventSystem.ts` — 事件条件解析、概率修正、效果结算与当前缺口。
- `src/App.tsx` — `addInventoryItem` 与 `surveyBonus` 背包写入路径。
- `src/pages/CommunicationStation.tsx` — 当前队员卡片入口为“查看档案”。
- `src/pages/CrewDetail.tsx` — 人物详情携带物面板。
- `src/pages/CallPage.tsx` — 通话页普通行动与紧急选项读取 / 结算入口。
- `git log --oneline -n 12` — 近期改动摘要来源；输入未提供具体 commit hash。

### 5.2 外部链接（External Links）

- https://www.failbettergames.com/storynexus-developer-diary-2-fewer-spreadsheets-less-swearing/ — Failbetter 对 StoryNexus / Fallen London 的 quality-based narrative 开发者日志。
- https://www.gamedeveloper.com/audio/postmortem-failbetter-games-i-sunless-sea-i- — Sunless Sea postmortem，资源管理服务主题的参考。
- https://www.gamedeveloper.com/design/road-to-the-igf-inkle-s-i-80-days-i- — 80 Days 开发者访谈，叙事驱动下的 just enough gameplay 与行李 / 时间 / 金钱压力。
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_tags?view=minecraft-bedrock-stable — Minecraft Bedrock Item Tags 官方文档。
- https://dev.epicgames.com/documentation/en-us/unreal-engine/using-gameplay-tags-in-unreal-engine — Unreal Gameplay Tags 官方文档。

## 6. Open Questions for Design

- **Q1**：事件奖励进入哪里？木材、铁矿石、食物、水这类资源在事件或采集获得后，MVP 是进入队员背包、基地库存，还是按事件字段指定目标？
- **Q2**：标签道具如何选择和消耗？当事件需要某标签，若队员有多个符合标签的道具，系统是自动选择、让玩家选择，还是按配置优先级选择？
- **Q3**：事件配置需要哪些新字段？是否新增 `inventory.hasTag(tag)`、`consumeItemByTag`、`addItem`、`removeItem`、`useItem`？
- **Q4**：背包 UI 的 MVP 形态是什么？本轮是补齐通讯台独立背包弹窗，还是继续放在人物详情里但增强信息？
- **Q5**：MVP 是否执行 `stackable` / `maxStack`？如果超过上限，是拆分堆叠、拒绝获得，还是暂时忽略上限？
- **Q6**：资源与道具的边界如何统一？木材、矿石、食物、水等在 MVP 中进入队员背包、基地库存，还是按来源 / 场景区分？
- **Q7**：“使用道具”是否一定消耗道具？工具类可能只持有生效，消耗品可能使用后减少。
- **Q8**：物品效果自动化范围如何控制，避免一次性实现所有 item effects 解释器？

---

**Research Completed:** 2026-04-27 01:06  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
