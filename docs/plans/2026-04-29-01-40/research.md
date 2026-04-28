---
topic: action-system-refactor
date: 2026-04-29
research_scope:
  codebase: true
  internet: true
source:
  initial: docs/plans/2026-04-29-01-40/initial.md
  research_topics: docs/plans/2026-04-29-01-40/research-topics.md
---

# Research: action-system-refactor

## 1. Research Summary

本次重构同时触及三个相互绑定的层：地图对象的数据模型、行动 (action) 候选表的生成机制、以及事件 (event) 与行动之间的条件归属边界。项目内调研显示三处现状均已存在但都偏静态：地图对象目前是 `tile_object_definition` 直接挂在 `default-map.json` 的 tile 上，仅含 `id/kind/name/visibility/candidateActions` 等字段，**无 `status_enum`**；通话行动由 `apps/pc-client/src/callActions.ts` 静态过滤生成，无任何条件 DSL；事件 (`events/types.ts`) 反而拥有完整 20+ 类型的 `Condition` 接口。换言之，事件层"过厚"，action 层"过薄"，期望的方向是把 event 的条件能力下放到 action 层，并以独立的 map-object 表承载状态。

业界范式上，Caves of Qud / RimWorld / Crusader Kings 3 的"entity + tag + condition + action"表驱动模式是最贴近的参考；UI 层的"基础动词常驻 + 条件动词上下文出现"已是从 SCUMM 15-verb 一路收敛到现代 contextual 设计的共识；Disco Elysium 的"passive 隐藏 + active 显示带 [SKILL X] 标签"为不可用行动的展示提供了成熟解。这三条线索可以直接转译成本项目的设计骨架。

## 2. Project Findings

### 2.1 已有玩法系统

- **地图对象当前模型**：`tile_object_definition` 含 `id / kind / name / description / visibility / tags / candidateActions`，存储于 `content/maps/default-map.json` 的 tile.objects 数组（证据：`docs/game_model/map.md:68-84`、`apps/pc-client/src/content/contentData.ts`）。**无 status_enum**。
- **状态被分流**：tile 层另有 `tile_special_state_definition` 表达"特殊状态"，但是 tile 级别而不是 object 级别（`docs/game_model/map.md:85-99`）。
- **运行时已揭示对象**：`RuntimeTileState.revealedObjectIds[]` 记录玩家调查后看到了哪些对象（`docs/game_model/map.md:144-155`）；这是 visibility 的运行时表达，但仍然没有"对象级别状态机"。
- **当前 action 设计**：`CallActionDef` (`apps/pc-client/src/callActions.ts:44-52`) 含 `id / label / category / availableWhenBusy / applicableObjectKinds`；分两类 `category = "universal"` 与 `"object_action"`。`buildObjectActionGroups` (同文件 71-86 行) 按"队员是否忙碌 + 对象 kind 是否匹配"做静态过滤，**没有调用任何 condition checker**。
- **事件条件机制（厚的部分）**：`Condition` 接口 (`apps/pc-client/src/events/types.ts:74-95`) 定义 20+ 种 `condition_type`：`compare_field / has_tag / inventory_has_item / tile_discovery_state / crew_action_status / handler_condition` 等（也见 `docs/game_model/event.md:157-173`）。事件的 `call` 节点选项条件在事件运行时 (`eventEngine.ts`) 检查（`docs/game_model/event.md:343-352`）。
- **通话流程**：玩家主动通话或事件来电 → `CallPage.tsx` + 事件系统 `RuntimeCall` 协作 → 显示基础行动（调查 / 移动 / 待命 / 停止）+ 已揭示对象按钮（`docs/gameplay/communication-table/communication-table.md:43-50`）。

### 2.2 现存叙事设定与角色

- **队员属性**：`physical / agility / intellect / perception / luck` 五维 + `tags`（`apps/pc-client/src/content/contentData.ts:47-53`）。
- **技能/标签**：事件条件 `has_tag` 已支持检查 crew tags（`apps/pc-client/src/events/types.ts:80`）；wiki 提及 `expertise` 与 `condition_tags` 两类（`docs/game_model/event.md:189-191`）。
- **道具模型**：`crew.inventory: Record<string, number>`，事件条件 `inventory_has_item` 已支持（`docs/gameplay/communication-table/communication-table.md:36-37`、`events/types.ts:82`）。

### 2.3 现存 UI 设计

- **通话页**：含头像、台词气泡、行动按钮、地图二级菜单、通讯录浮层（`docs/ui-designs/pages/通话.md:23-30`）。
- **行动按钮生成现状**：直接从 `CallActionDef` 数组与 `tile_object_definition.candidateActions` 映射，**无条件控制**（`docs/ui-designs/pages/通话.md:26`）。
- **地图详情页**：展示区域名 / 坐标 / 地形 / 天气 / 已揭示对象 / 特殊状态（`docs/gameplay/map-system/map-system.md:50-55`）。

### 2.4 设计原则

- 文本驱动、低保真"控制台感"，避免过度装饰（`docs/ui-designs/ui-design-principles.md:1-20`）。
- "检查、选择、等待、反馈"为核心节奏；不强迫频繁点击（同文件 26-44）。
- 每个瓶颈应有多种解决路径，且看起来属于同一体系（同文件 46-55）—— 这条直接支持"条件式 action 暴露多解法"。

### 2.5 最近 commits

- **b589ba6** (2026-04-29) Add minimal return-home MVP flow：新增主线事件 (crash_site / village / medical / hive / ending)、主线条件检查、受伤移动机制、handler registry 扩展。**事件层加厚，action 层未动**。
- **25cbaf9** (2026-04-28) docs: editor planning + wiki：新增通讯台 wiki、事件编辑器设计文档。
- **f59a1db** (2026-04-28) Rush + pnpm 双端基础：monorepo 划分 `apps/pc-client` / `apps/mobile-client`。

### 2.6 项目约束

- **技术栈**：Rush + pnpm monorepo；pc-client 为 Vite + React + TypeScript。
- **核心模块**：`mapSystem.ts`（地图状态/可见窗口）、`callActions.ts`（行动视图生成）、`events/eventEngine.ts`（事件触发/节点推进）、`events/callRenderer.ts`（通话模板渲染）、`events/conditions.ts`（条件求值）。
- **关键缺陷复述**：
  1. `MapObjectDefinition` 无 `status` 字段；状态被错放到 tile 级 `tile_special_state_definition`。
  2. `CallActionDef` 无 `conditions` 字段；过滤逻辑硬编码在 `callActions.ts`。
  3. `events/conditions.ts` 已有完整条件求值器，但 `callActions.ts` **未引用**它 —— 是当前最大的浪费点，重构时直接复用即可。

## 3. Best Practice Findings

### 3.1 参考游戏作品

- **Caves of Qud**：XML `ObjectBlueprints.xml` + ECS `IActivePart`，蓝图层叠加。借鉴点：tag/part 组合 → 状态 + 行动的承载方式。<https://wiki.cavesofqud.com/wiki/Modding:Objects>
- **RimWorld**：`ThingDef` / `JobDef` 全 XML，`Abstract` + `ParentName` 继承。借鉴点：策划只用数据层就能加新对象/新行动。<https://rimworldwiki.com/wiki/Modding_Tutorials/ThingDef>
- **Crusader Kings 3**：`trigger / effect / scripted_effect` DSL，AND/OR/NOT 嵌套块 + scope 引用。借鉴点：行动条件 DSL 的工业级范例。<https://ck3.paradoxwikis.com/Triggers>
- **Wildermyth**：encounter / event JSON 化；action 用 outcome id 引用 event，多 action 可指同一 event。借鉴点：**action ↔ event 解耦应该用 id 引用，不内联**。<https://wildermyth.com/wiki/Modding_Guide>
- **Sunless Sea / StoryNexus (QBN)**：storylet 浮动 + quality 阈值解锁 → 把"行动"当成条件式 storylet。<https://emshort.blog/category/quality-based-narrative/>
- **Disco Elysium**：active/passive skill check 双轨；passive 决定显隐，active 永远显示但骰子定结果。借鉴点：**条件不只筛"显隐"，也可影响"行动文案/概率"**。<https://discoelysium.com/devblog/2016/10/06/active-skill-checks>

### 3.2 玩法模式与设计惯例

- **entity + tag + condition 表驱动**：Qud 的 part 叠加 / RimWorld 的 ThingDef 继承是两种主流形态；共识是"数据 = 蓝图 + 标签 + 抽象继承"，行为代码尽量泛化。
- **action ↔ event 解耦**：用 event id 引用，不内联。这能让一个 event 复用于多种触发 action（"打开机箱"和"撬开机箱"指向同一个 event 的不同入口）。
- **动词菜单 vs 上下文动作**：从 SCUMM 15-verb → Monkey Island 9-verb → verb coin 3-icon → 现代 contextual。共识：**基础动词常驻 + 条件动词上下文出现**。Ron Gilbert 偏好显式动词以制造组合趣味，但主流已收敛。
- **条件 DSL 写法**：CK3 的嵌套块是干净范本 —— 前缀谓词 + scope 引用 + 短路求值。<https://ck3.paradoxwikis.com/Triggers>
- **隐藏 vs 灰显**：Disco Elysium 用"passive 隐藏 + active 显示带 [SKILL X] 标签"混合策略；Mass Effect 灰显但用色分类降低认知负担。

### 3.3 已知陷阱

- **行动列表过长 → choice overload**：研究建议默认 4-6 项；超出触发 analysis paralysis。<https://www.gamedeveloper.com/design/spoiled-for-choice-the-psychology-of-choice-overload-in-games-and-how-to-avoid-it>
- **隐藏 vs 灰显的玩家心理坑**：玩家系统性**低估**隐藏选项 → 会以为作者偷懒。共识折中：**stat-based 用灰显（带提示），personality/narrative 用隐藏**。<https://forum.choiceofgames.com/t/hidden-or-greyed-out/2182>
- **数据驱动行动表的可维护性**：RimWorld 社群多次警告 PatchOperation 改 tag → 条件爆炸。解法：严格命名空间 + abstract 继承 + 条件白名单。
- **跨对象耦合**：Sunless Sea postmortem 提到 quality 维度增多后 storylet 触发条件难以静态校验，**需要工具链 lint**。<https://www.gamedeveloper.com/audio/postmortem-failbetter-games-i-sunless-sea-i->
- **动词菜单退化陷阱**：全量动词列表对现代玩家是负担。

### 3.4 SOTA / 新趋势

- **QBN + JSON storylet** 在 Citizen Sleeper、Roadwarden 等近作复活：action = 条件式 storylet，作者工具与脚本 DSL 分离。
- **混合显隐 + 条件文案**：Disco Elysium 的 `[ENDURANCE: Medium 11]` 标签已成新一代叙事 RPG 标配 *(unverified — 趋势观察)*。
- **可视化条件编辑器**：ink / Yarn Spinner / Articy:draft 把 DSL 节点化 —— 长期 editor 路线参考。

## 4. Trade-offs Analysis

### Trade-off 1：地图对象状态 status_enum 用枚举 vs 用 tag set

- **枚举 (`status: "intact" | "broken" | "collected" | "locked"`) 优势**：单字段、互斥、易于条件判断、editor 下拉框友好。
- **Tag set (`tags: ["broken", "discovered"]`) 优势**：可同时表达多维度状态（如"已发现 + 已损坏 + 上锁"）；与现有 `tags` 字段同构。
- **建议**：**主状态用 `status_enum`（互斥的"对象生命周期阶段"），辅助状态用现有 `tags`**。理由：用户原话明确说 "status_enum"；与 RimWorld `ThingDef.state` 思路一致；对玩家来说"对象现在的核心状态"应该唯一可读。

### Trade-off 2：action 不满足条件时的展示策略

- **隐藏不可用 action 的优势**：列表短、认知负担低、避免幽灵选项焦虑。
- **灰显不可用 action 的优势**：玩家知道"还有别的解法存在"、提供学习信号、激励探索道具/技能。
- **建议**：**采用 Disco Elysium 混合策略** —— 与具体物品/技能门槛相关的 action 灰显（带"需要 [电焊枪]"提示），与剧情/角色关系相关的 action 隐藏。本项目大多数条件是"道具 + 技能 + 对象状态"，应**默认灰显带门槛提示**，让玩家感受到 "每个瓶颈应有多解法"（已写在设计原则）。

### Trade-off 3：action 与 event 的耦合方式

- **action 内联事件流程**：写起来快，但同一事件无法被多个 action 入口复用。
- **action 引用 event id（Wildermyth / Sunless Sea 模式）**：一个 event 可有多种触发 action（"修理"vs"暴力拆解"指向同一 event 不同入口节点）；action 仅承担"前置条件 + 入口选择"。
- **建议**：**action 引用 event id**，并允许传入入口节点 id 或 context（如 `event_id: "machine_repair", entry: "with_toolkit"`）。这与现状最兼容 —— event 已是独立资源，action 只需在选项级别加引用字段。

### Trade-off 4：条件 DSL 是新写还是复用 events/conditions.ts

- **新写一套 action 专属条件**：可针对 action 场景做剪裁，schema 更简单。
- **复用 `events/conditions.ts` 现有的 20+ Condition 类型**：零新代码、editor 一致、`has_tag / inventory_has_item / compare_field` 已经覆盖了所有用户提到的场景。
- **建议**：**直接复用 `Condition[]`**。理由：项目最大的浪费就是 action 层不调用 conditions.ts；不复用就是再造一遍。如果后续发现 action 场景需要专属谓词（如"对象状态 = X"），就向现有枚举里加 `condition_type: "object_status"` 即可。

## 5. Key References

### 5.1 项目文件

- `apps/pc-client/src/callActions.ts` — 当前静态行动过滤；本次重构主战场。
- `apps/pc-client/src/events/types.ts` — `Condition` 接口定义，将被 action 复用。
- `apps/pc-client/src/events/conditions.ts` — 条件求值器，可直接被 callActions 引用。
- `apps/pc-client/src/content/contentData.ts` — `MapObjectDefinition` / `CallActionDef` 类型；要扩字段。
- `content/maps/default-map.json` — 当前 tile.objects 数据；抽离后要迁移到独立表。
- `docs/game_model/map.md` — 地图数据模型 wiki，需同步。
- `docs/game_model/event.md` — 事件数据模型 wiki，条件机制描述。
- `docs/gameplay/communication-table/communication-table.md` — 通话行动现状。
- `docs/ui-designs/pages/通话.md` — 通话 UI 设计；行动按钮渲染规则需更新。
- `docs/ui-designs/ui-design-principles.md` — "多解法应同体系"原则支持灰显方案。

### 5.2 外部链接

- <https://wiki.cavesofqud.com/wiki/Modding:Objects> — Qud Object Blueprint XML
- <https://rimworldwiki.com/wiki/Modding_Tutorials/ThingDef> — RimWorld ThingDef 体系
- <https://ck3.paradoxwikis.com/Triggers> — CK3 trigger DSL（条件 DSL 范本）
- <https://wildermyth.com/wiki/Modding_Guide> — Wildermyth event/encounter 解耦
- <https://discoelysium.com/devblog/2016/10/06/active-skill-checks> — Disco Elysium active/passive 双轨
- <https://forum.choiceofgames.com/t/hidden-or-greyed-out/2182> — 隐藏 vs 灰显玩家心理
- <https://www.gamedeveloper.com/design/spoiled-for-choice-the-psychology-of-choice-overload-in-games-and-how-to-avoid-it> — choice overload

## 6. Open Questions for Design

- **Q1**：地图对象抽离成独立表后，对象与 tile 的关联是放在 object 上（`object.tileId`）还是 tile 上（`tile.objectIds[]`）？运行时状态（`status_enum`、运行时附加 tag）写在 definition 还是 runtime 表？
- **Q2**：`status_enum` 的初始枚举集合是什么？（候选：`pristine / discovered / interacting / disabled / depleted / destroyed`？还是更抽象的 `active / inactive / consumed`？）状态机的转换由谁触发 —— 事件 effect、action 默认效果、还是两者都行？
- **Q3**：基础行动（移动、调查地图块）是否也走同一套 action 表（`category: "universal"`），还是硬编码在 UI？现状是混合，目标是统一吗？
- **Q4**：action 的条件失败时，按 Trade-off 2 的建议默认"灰显 + 门槛提示" —— 这个提示文案谁来写？是 action 自己声明 `unavailable_hint`，还是从 condition 自动生成（"需要电焊枪"）？
- **Q5**：action 引用 event 时是否允许传入 context（如 entry node id、参数）？还是 action 只是单纯的 "event_id" 引用？
- **Q6**：现有 `candidateActions: string[]`（写在 tile_object_definition 上）的过渡策略是什么？是直接迁移到独立 action 表 + object 引用 action_id，还是保留这个字段做候选过滤、再叠加条件？
- **Q7**：MVP 里要不要做 condition DSL 的可视化编辑器，还是仍然手写 JSON？（参考 25cbaf9 的 editor planning）

---

**Research Completed:** 2026-04-29 01:45  
**Next Step:** 进入 Step 4（用户访谈），用本 research 作为输入。
