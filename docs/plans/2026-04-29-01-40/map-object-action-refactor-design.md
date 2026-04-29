---
topic: map-object-action-refactor
date: 2026-04-29
status: approved
scope: system
source:
  initial: docs/plans/2026-04-29-01-40/initial.md
  research: docs/plans/2026-04-29-01-40/research.md
  interview: docs/plans/2026-04-29-01-40/map-object-action-refactor-interview.md
target_wiki:
  - docs/game_model/map.md
  - docs/gameplay/map/
  - docs/gameplay/event/
  - docs/gameplay/communication-table/communication-table.md
  - docs/ui-designs/pages/通话.md
---

# 地图对象与行动系统重构

## 1. 概述

本系统把"地图对象"与"行动 (action)"两条数据脉络打散重建，让通话页上"队员现在能做什么"成为一个**纯数据驱动的可选清单**：

- **地图对象**从 `tile_object_definition` 内联在 tile 里的形态升级为一张**独立的对象表**，按 definition / runtime 分层；每个对象有 `id`、`status_enum`（运行时状态）以及一组该对象 definition 上声明的合法 `status_options`。
- **行动 (action)** 由当前 `callActions.ts` 里写死的过滤逻辑升级为**条件驱动的候选清单**；条件 DSL 直接复用事件系统已有的 `Condition[]`；选中行动后通过 `event_id` 跳进对应事件流程。
- **基础行动**（移动、调查地图块、待命、停止）与对象行动同 schema、同管线，只用 `category = universal` 区分。

简而言之：通话页上看到的所有按钮都是一份"通过条件过滤的 action 列表"，列表项指向一个事件 id；事件本身仍然承担分支与结局，但"我现在能不能选这一项"这个判断从事件入口前置到了 action 层。

## 2. 设计意图

- **让"指挥感"成立**：玩家是远端指挥者，通话时看到的可选行动应该如实反映"该队员所在地图块上的对象 + 该队员持有道具 + 该队员技能 + 该队员当前状态"的真实交集。任何行动若不可执行，要么直接不出现，要么显式告知所缺前提（"需要电焊枪"），不能出现"按下去才发现做不了"的幽灵选项。
- **让设计师与系统解耦**：新增对象、新增行动、新增条件不再需要改 UI 代码或 `callActions.ts` 的硬编码过滤；只改 JSON 数据。
- **让事件层卸下重量**：现状是事件层"过厚"承担了所有条件判断，行动层"过薄"只是字符串。重构后事件层专注分支与剧情，"能不能进来"这件事在行动层处理。
- **想避免的体验**：选项列表过长导致 choice overload；隐藏选项让玩家以为作者偷懒；同一个事件被多个 action 入口绕来绕去导致剧情复用难追溯。

## 3. 核心概念与术语

- **MapObject Definition**：一个地图对象的内容定义；含 `id`、`kind`、`name`、`description`、`tags`、`status_options: string[]`、`initial_status: string`、`actions: ActionDef[]`、`visibility` 等字段。是只读资源，由 `content/map-objects/*.json` 提供。
- **MapObject Runtime**：地图对象的运行时实体；含 `id`（与 definition 一致）、`status_enum: string`（取自 definition 的 `status_options`）、运行时 `tags`、其他玩家进度数据。是 save / load 的承载。
- **Tile**：地图块；保留原有坐标 / 地形 / 天气等字段，新增 `objectIds: string[]` 列出所在对象的 id。Tile 不再内联对象内容。
- **Action**：玩家在通话页选择给队员的"一件事"。结构：`id`、`category`（`universal` | `object`）、`label`、`conditions: Condition[]`、`event_id: string`、`display_when_unavailable?`、`unavailable_hint?` 等。
- **ActionDef（内联）**：直接写在 `MapObject Definition.actions` 里的 action 定义；只对该对象出现。
- **Universal Action**：不被任何 object 拥有的全局行动（移动、调查地图块、待命、停止）；定义在 `content/universal-actions/*.json`。
- **Condition**：行动可见性的判断条件，直接复用 `apps/pc-client/src/events/types.ts` 中的 `Condition` 接口（`compare_field` / `has_tag` / `inventory_has_item` / `tile_discovery_state` / `crew_action_status` 等）。
- **set_object_status**：新增的事件 effect 原语；事件分支结束时调用，将某个 MapObject Runtime 的 `status_enum` 改写为 `status_options` 中的另一个值。
- **门槛提示 (unavailable_hint)**：当 action 标记为 `display_when_unavailable: "disabled"` 且条件不满足时，UI 灰显按钮旁显示的一句话提示。

## 4. 核心循环与玩家体验

### 4.1 玩家旅程

1. 玩家选中地图上的某个队员，进入通话页。
2. 系统根据队员所在 tile：
   - 拉出 tile 上所有"已揭示"的 object（即 `RuntimeTileState.revealedObjectIds[]`）。
   - 收集这些 object 的 `actions`（内联 ActionDef）+ 全部 universal_actions。
3. 系统对每个 action 求值 `conditions`：
   - 全部条件通过 → 列入"可选清单"。
   - 至少一个条件失败：
     - 若 action 未声明 `display_when_unavailable` → 不出现。
     - 若声明为 `"disabled"` → 灰显，按钮旁挂门槛提示文案。
4. 通话页按 category 分组渲染按钮（universal 一组、各 object 一组）。
5. 玩家点击某个 action → 加载 `event_id` 对应事件 → 进入事件流程（沿用现有 `eventEngine.ts` / `callRenderer.ts`）。
6. 事件走完某个分支后，effect 链可能调用 `set_object_status` 改写对象状态。
7. 通话回到对象/行动列表（或事件结束返回主界面），下一次通话时新的 status 已生效，可选清单随之变化。

### 4.2 典型情境

- **高光时刻**：玩家给一个队员配上电焊枪后，再次通话发现"切割舱门"行动从灰显（"需要电焊枪"）变成可选；点击后队员真的进入"切割"事件。这一刻玩家感受到道具→行动→世界的闭环。
- **低谷 / 摩擦点**：玩家进入通话却看到只有"调查地图块"和"移动"两条 universal 行动 —— 必须先调查 tile 揭示对象，循环才会展开。这是设计上想要的"探索摩擦"，不是 bug。

## 5. 机制与规则

### 5.1 状态与状态机

**MapObject 状态**：

- 每个 MapObject Definition 声明 `status_options: string[]`（例：`["pristine", "broken", "repaired", "depleted"]`）与 `initial_status: string`（必须属于 `status_options`）。
- 运行时 `MapObjectRuntime.status_enum: string` 只能取 `status_options` 之一（运行时不强制 lint，但 schema 上是字符串）。
- 状态转换**只**由事件 effect `set_object_status({object_id, status})` 触发。Action 自身不直接改状态。
- 不同对象 kind 可有完全不同的 `status_options`，互不干涉。

**Action 显隐状态机**：

```
┌──────────────────────────────────┐
│  action.conditions 全部通过      │ → visible & enabled
├──────────────────────────────────┤
│  conditions 失败 +               │
│  display_when_unavailable=undef  │ → 不出现
├──────────────────────────────────┤
│  conditions 失败 +               │
│  display_when_unavailable=       │
│    "disabled"                    │ → visible & disabled + 门槛提示
└──────────────────────────────────┘
```

### 5.2 规则与公式

**条件求值**：直接调用 `events/conditions.ts` 现有求值器，输入参数包含：

- `crew`：当前通话队员的运行时数据（含 `inventory`、`tags`、`attributes`）。
- `tile`：队员所在 tile 的运行时数据（含 `revealedObjectIds`、`special_state`）。
- `objects`：tile 上所有对象的 `MapObjectRuntime` 索引。
- `world`：游戏全局状态（已完成主线节点、全局 flags 等）。

**门槛提示生成**：

- Action 评估失败时，记录失败的 condition 列表。
- 优先级：`action.unavailable_hint`（手写文案）> 自动生成（按 condition 类型映射模板）。
- 自动生成模板举例：
  - `inventory_has_item: "welder"` → `"需要 [电焊枪]"`
  - `has_tag: "engineer"` → `"需要 工程师 标签"`
  - `compare_field: object.status === "unlocked"` → `"对象需先解锁"`
- 多条件同时失败 → 默认只显示第一条（按 action 中声明顺序），让 action 作者通过排序控制提示偏好。

### 5.3 参数与默认值

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `MapObjectDefinition.status_options` | 必填 | 至少 1 项 |
| `MapObjectDefinition.initial_status` | 必填 | 必须属于 status_options |
| `MapObjectDefinition.visibility` | `"hidden"` | 与现有语义一致 |
| `ActionDef.category` | 内联在 object.actions 里的默认为 `"object"` | universal 表里的固定为 `"universal"` |
| `ActionDef.conditions` | `[]` | 空数组 = 无条件可见 |
| `ActionDef.display_when_unavailable` | `undefined` | undefined = 隐藏 |

## 6. 系统交互

- **依赖于**：
  - 事件系统 `Condition` 接口与 `events/conditions.ts` 求值器（不修改，只调用）。
  - 事件系统 effect 总线（新增 `set_object_status` effect handler）。
  - 现有 `RuntimeTileState.revealedObjectIds[]`（决定通话页能看到哪些对象 → 哪些 action 进入候选）。
  - `crew.inventory` / `crew.tags` / `crew.attributes` / `crew.activeAction`。
- **被依赖于**：
  - 通话页 `CallPage.tsx`（按新数据源重写按钮渲染）。
  - 地图编辑器 / 内容工具（未来；本轮不做）。
- **共享对象 / 状态**：
  - `MapObjectRuntime.status_enum` 既被 action 条件读，也被事件 effect 写；唯一改写点是 `set_object_status`。
  - 队员 `inventory` / `tags` 的写权仍属事件 effect，本轮不动。
- **事件 / 信号**：
  - `set_object_status({object_id, status})`：事件 effect 新原语。
  - UI 层无新事件总线信号；通话页每次进入时重算可选 action 即可。

## 7. 关键场景

### 7.1 典型场景

- **S1：基础探索流**
  - 触发：玩家与位于 tile A 的队员通话；tile A 当前 `revealedObjectIds` 为空。
  - 关键动作：通话页只显示 universal 行动；玩家选"调查地图块"→ 进入调查事件 → 事件 effect 把 tile A 上的对象加入 `revealedObjectIds`。
  - 期望结果：再次通话或事件结束返回时，对象按钮出现。

- **S2：道具门槛行动**
  - 触发：tile B 上有对象"被锁的舱门"，状态 `locked`；队员未持电焊枪。
  - 关键动作：通话页显示"切割舱门"为灰显，提示"需要 [电焊枪]"。玩家把电焊枪交给该队员（通过别的事件 / 系统），再次通话 → 按钮变可选；点击进入切割事件 → 事件 effect 调用 `set_object_status({舱门, "unlocked"})`。
  - 期望结果：舱门状态变更后，下一轮通话出现"穿过舱门"等新 action（其条件依赖 status=unlocked）。

- **S3：技能门槛行动**
  - 触发：tile C 上有对象"破损的扫描仪"；队员有 `engineer` 标签但缺零件。
  - 关键动作：通话显示"维修扫描仪"灰显，提示"需要 备用零件"；显示"拆解扫描仪"可选（只需 engineer tag）。
  - 期望结果：玩家可在"修复"与"破坏性获取材料"之间二选一，体现设计原则的"多解法"。

### 7.2 边界 / 失败场景

- **F1：condition 引用了不存在的 object_id**
  - 异常源：JSON 拼写错误或对象被废弃。
  - 玩家看到：该 action 永远不出现（condition 求值时 object 不存在 → 视为失败）。
  - 恢复：开发期靠 console warn；运行期以"隐藏"为安全默认。

- **F2：set_object_status 试图把状态改为不在 status_options 里的值**
  - 异常源：事件作者笔误。
  - 玩家看到：状态被实际写入但 UI 上后续 action 行为可能错乱（运行时不 lint）。
  - 恢复：本轮明确为 Out of Scope —— 不做 lint，靠开发自律 + console warn。

- **F3：tile 上有对象但 `revealedObjectIds` 不含它**
  - 这是设计预期，不是异常 —— 该对象的 action 不出现于通话。

- **F4：universal action 与 object action 同 id**
  - 不允许；id 应在各自表中唯一。MVP 不做 cross-table lint，靠命名约定（universal action id 加 `universal:` 前缀）规避。

## 8. 取舍与反模式

- **取舍 1：object.actions 全部内联，而非引用共享 action 表。**
  - 理由：用户偏好"每个 object id 直接拥有自己的 action 集合"；可读性与单文件自包含优先；本游戏对象量级有限，重复成本低于跨表查询心智成本。
  - 代价：相同行为（如"调查 / 采样"）在多个对象间会重复声明；后续若发现严重重复，可演化为可选的 `action_ref: "shared:examine"` 字段（不阻塞当前 schema）。

- **取舍 2：基础行动也走 action 表（universal_actions）。**
  - 理由：UI 渲染与 condition 求值统一管线；未来"受伤时不能移动"等约束可数据化。
  - 代价：移动 / 调查这种 UI 高度耦合的行动也要走数据驱动；UI 不能再绑死按钮文案。

- **取舍 3：condition DSL 完全复用 events/types.ts 的 Condition[]。**
  - 理由：现有 `events/conditions.ts` 求值器已覆盖所有用户提到的判断维度；复用零新代码，editor 与 schema 一致。
  - 代价：Condition 接口里有些谓词（如 `crew_action_status`）在 action 场景上语义略勉强，但不是错误；后续可剪裁。

- **取舍 4：不可用 action 默认隐藏，标记后才灰显（display_when_unavailable: "disabled"）。**
  - 理由：与项目"控制台感、低保真、列表短"的 UI 原则一致；隐藏是默认安全态。但允许设计师在重要行动上手动声明灰显，让玩家知道"还有别的解法"——这是设计原则中"每个瓶颈应有多解法"的承载。
  - 代价：与 Disco Elysium 的"passive 隐藏 / active 灰显带 [SKILL]"业界折中略不同；玩家可能漏掉某些 personality 隐藏选项。但这正好是设计目标。

- **取舍 5：MapObject 用 definition + runtime 分层，而非合并表。**
  - 理由：与现有 `RuntimeTileState.revealedObjectIds` 的分层同构；存档干净；definition 是只读资源可被多存档共用。
  - 代价：editor / loader 要写两个 reader；object 抽离时需迁移现有 `default-map.json`。

- **取舍 6：状态转换只由事件 effect 驱动 `set_object_status`，action 不直写。**
  - 理由：状态变更点单一可追溯；调试时只看事件 effect 链就能解释"为什么这个对象现在是 broken"。
  - 代价：极轻量的"只是看一眼"交互也要走事件——但这不是问题，事件可以是单节点立即返回。

- **要避免的反模式**：
  - 在 UI 层做 condition 判断（已经被废除一次的硬编码过滤，不要再来一次）。
  - 让 action 直接修改对象 status（绕开事件 effect 链路）。
  - 内联事件流程到 action（事件就是事件，action 只引用 event_id）。
  - 把 object.actions 与 candidateActions 同时保留 —— 必须二选一，本轮选 object.actions。

## 9. 参考与灵感

- **Caves of Qud**：<https://wiki.cavesofqud.com/wiki/Modding:Objects>。借鉴点：对象 blueprint 内联组件 + 行为；本轮的 `object.actions: ActionDef[]` 内联思路与 Qud 的 `<part Name=...>` 内联同形。
- **RimWorld ThingDef**：<https://rimworldwiki.com/wiki/Modding_Tutorials/ThingDef>。借鉴点：JSON / XML 数据驱动的对象定义结构，definition 与 runtime 分层。
- **Crusader Kings 3 trigger DSL**：<https://ck3.paradoxwikis.com/Triggers>。借鉴点：条件 DSL 的工业级范例，本项目的 `Condition[]` 是其精简版。
- **Wildermyth encounter**：<https://wildermyth.com/wiki/Modding_Guide>。借鉴点：action → event_id 引用而非内联事件流程。
- **Disco Elysium**：<https://discoelysium.com/devblog/2016/10/06/active-skill-checks>。借鉴点：可用 / 不可用选项的展示策略 —— 本轮采用"默认隐藏 + 标记灰显 + 门槛提示"是 Disco passive/active 双轨的精简版。
- **Choice overload research**：<https://www.gamedeveloper.com/design/spoiled-for-choice-the-psychology-of-choice-overload-in-games-and-how-to-avoid-it>。设计参考：默认 4-6 项；超出触发 analysis paralysis —— 支持本轮"默认隐藏"的取舍。

---

## 10. 本轮范围与阶段拆分

### 10.1 MVP（本轮必做）

- **数据模型**
  - 新增 `MapObjectDefinition` 类型（独立于 tile）：`id` / `kind` / `name` / `description` / `tags` / `status_options: string[]` / `initial_status: string` / `actions: ActionDef[]` / `visibility`。
  - 新增 `MapObjectRuntime` 类型：`id` / `status_enum: string` / 运行时 `tags?`。
  - `Tile` 增加 `objectIds: string[]`，移除原内联 `objects` 字段。
- **Action 模型**
  - `ActionDef`：`id` / `category: "universal" | "object"` / `label` / `conditions: Condition[]` / `event_id: string` / `display_when_unavailable?: "disabled"` / `unavailable_hint?: string`。
  - 内联存于 `MapObjectDefinition.actions[]`；universal 存于 `content/universal-actions/*.json`。
- **运行时管线**
  - `callActions.ts` 重构为：从 `revealedObjectIds` + tile + universal_actions 收集候选 action → 调用 `events/conditions.ts` 求值 → 按显隐状态机过滤 / 标记 → 输出渲染数据。
  - 不再含任何硬编码过滤逻辑。
- **事件 effect**
  - 新增 `set_object_status({object_id, status})` 原语；接入现有 effect 派发。
- **UI**
  - 通话页按 category 分组渲染：universal 一组在顶 / 底（位置另定）、每个 object 一组。
  - 灰显按钮支持"门槛提示"挂载（按 condition 失败信息生成 / action.unavailable_hint 重写）。
- **数据迁移**
  - 把现有 `content/maps/default-map.json` 的 tile.objects 内联结构迁移到独立 `content/map-objects/` 表 + tile.objectIds[] 引用。
  - 现有 `tile_object_definition.candidateActions: string[]` 转化为 `MapObjectDefinition.actions[]` 内联 ActionDef（每个旧 candidate 映射为一个 ActionDef，其 event_id 暂指向占位事件或保留旧 effect 链路）。
  - 现有 `apps/pc-client/src/callActions.ts` 中 `content/call-actions/*.json` 的现有 action 数据按 category 拆分到 universal_actions 表 / 各 object.actions 列表。

### 10.2 Later（未来再做，明确本轮不做）

- 可视化 action / condition / object 编辑器（沿用 25cbaf9 editor planning 路线另起一轮）。
- 跨对象联动作为主动语义（"打开门 → 另一对象状态自动变化"，本轮通过 event effect 手动写）。
- action_id 的"共享 action 表"机制（如果未来发现重复严重，可加 `action_ref: string` 引用全局）。
- 状态机"合法转换"声明与 lint。
- 多语言文案与门槛提示模板国际化。

### 10.3 不做（Out of Scope，避免范围膨胀）

- 状态机合法转换静态检查（lint）。
- 跨对象联动的主动语义。
- action 选择后的动画 / 音效 / 运行时说明面板等额外反馈。
- 重写事件系统本身 —— 事件层的代码与 schema 不动，只新增 `set_object_status` effect。
- 重做通话页视觉样式（仅按数据驱动重渲，不调样式 token）。

## 11. 本轮验收与风险

### 11.1 Player Stories / Play Scenarios

#### PS-001：探索一个全新 tile 的对象 → 行动闭环

- **作为**：开局玩家
- **我能**：与队员通话 → 选 universal "调查地图块" → tile 上的对象被揭示 → 再次通话看到针对这些对象的 action 列表
- **以便**：感受到"探索 → 发现 → 行动"的核心循环
- **验收标准**：
  - [ ] 通话页在 tile 未调查时只显示 universal 行动。
  - [ ] 调查事件结束后 `revealedObjectIds` 增加该 tile 的对象 id。
  - [ ] 再次通话时，对象按钮按 object 分组出现，每组的 action 由该对象的 `actions[]` 经 `Condition[]` 求值后产生。
- **不包含**：动画 / 音效 / 关卡剧情新增。
- **优先级**：P0

#### PS-002：道具门槛 action 的可见性切换

- **作为**：拥有"切割舱门"行动需求的玩家
- **我能**：在队员未携带电焊枪时看到该 action 灰显（带"需要 [电焊枪]"提示），交付电焊枪后再次通话看到该 action 变可选
- **以便**：清楚知道"还差一步什么"
- **验收标准**：
  - [ ] 队员 inventory 不含 welder 时，action 灰显且 hint 显示"需要 [电焊枪]"或类似。
  - [ ] inventory 加入 welder 后，再次进入通话时该 action 启用。
  - [ ] 不依赖 page reload；从其他页返回通话即应刷新。
- **不包含**：自动门槛检测的多语言文案。
- **优先级**：P0

#### PS-003：行动选择后状态变化反映回 action 列表

- **作为**：选择"切割舱门"的玩家
- **我能**：进入切割事件 → 事件结束 → 舱门 status 从 locked → unlocked → 下一次通话此对象的可选 action 集合变化（新增"穿过舱门"，"切割舱门"消失或转为不可选）
- **以便**：感受到行动 → 世界 → 后续行动的因果链
- **验收标准**：
  - [ ] 事件 effect 调用 `set_object_status({door, "unlocked"})` 后，`MapObjectRuntime.status_enum` 写入 `unlocked`。
  - [ ] 依赖 `status === locked` 的 action 在条件求值时失败 → 隐藏。
  - [ ] 依赖 `status === unlocked` 的 action 出现。
- **不包含**：跨对象联动（"开门时整层警报"等）。
- **优先级**：P0

#### PS-004：基础行动走同一管线

- **作为**：使用"待命 / 停止 / 移动 / 调查"的玩家
- **我能**：这些 universal 行动也按 condition 决定可见性（例：未来"受伤无法移动"由 condition 表达）
- **以便**：行为一致、未来扩展无需改 UI 代码
- **验收标准**：
  - [ ] universal 行动数据来自 `content/universal-actions/*.json`，不再硬编码于 `CallPage.tsx`。
  - [ ] 至少一个 universal 行动声明 `conditions: []` 验证空条件路径正常。
  - [ ] 选中 universal 行动后正常进入对应事件 / 操作（沿用现有逻辑）。
- **不包含**：现有移动 / 调查事件本身的玩法改动。
- **优先级**：P1

#### PS-005：现有内容无回归

- **作为**：QA / 玩家
- **我能**：跑完 b589ba6 已有的 minimal return-home 主线
- **以便**：确认重构没破坏既有玩法
- **验收标准**：
  - [ ] 旧 `default-map.json` 内容迁移后，所有 tile 与对象在新 schema 下行为等价。
  - [ ] 主线事件（crash_site / village / medical / hive / ending）触发条件不变、效果不变。
  - [ ] 通话页旧有可见行为对一名"不知情"玩家而言不可见地等价（按钮位置可调，但功能集合相同）。
- **不包含**：性能基准。
- **优先级**：P0

### 11.2 成功标准

- [ ] PS-001 ~ PS-005 全部通过验收。
- [ ] `apps/pc-client/src/callActions.ts` 不再含任何硬编码的对象 kind / busy 过滤逻辑（全部由 `Condition[]` 表达）。
- [ ] `content/maps/default-map.json` 不再内联 `tile.objects`，改为 `tile.objectIds[]` + `content/map-objects/` 独立资源。
- [ ] `events/types.ts` 的 `EffectType` 增加 `set_object_status`，配套 handler 接入派发。
- [ ] 现有事件层代码、`Condition` 接口与 `events/conditions.ts` 求值器**未修改**（除新增 effect 外）。
- [ ] TypeScript 编译通过；现有自动化测试通过；新增至少 1 条覆盖 `set_object_status` 的单元测试。

### 11.3 风险与缓解

- **R1：迁移现有 default-map.json 时漏字段或语义偏移**
  - 缓解：写一个一次性迁移脚本（甚至手工），跑完后人工校对一遍 tile / object / action 三方一致性；保留旧文件 git 历史以便回滚。
- **R2：condition 求值器在 action 场景下行为与 event 场景不一致**
  - 缓解：进入 callActions 重构时立即跑通最小用例（has_tag / inventory_has_item / object_status 三个高频条件），验证求值入参语义一致；不一致就在 callActions 侧适配 context 而非动求值器。
- **R3：object.actions 内联导致重复声明严重，前期就感到痛**
  - 缓解：本轮接受重复；在 schema 上**预留** `action_ref?: string` 字段位置但本轮不实现，让未来引入共享表无 schema break。
- **R4：UI 在按 category 分组时按钮顺序与玩家期望不符**
  - 缓解：universal 行动固定置顶（按既有视觉惯性），object 行动按 `revealedObjectIds` 顺序渲染；本轮不做"按重要性排序"。
- **R5：set_object_status 写到不在 status_options 的值导致后续 action 错乱**
  - 缓解：handler 内 `console.warn` 但不阻断；本轮明确不做 lint，靠测试与 PR review 兜底。
- **R6：玩家因"默认隐藏"觉得选项太少**
  - 缓解：上线后 1-2 个版本观察反馈；任何"应该让玩家知道还有别的路"的 action 由设计师手动加 `display_when_unavailable: "disabled"`。

## 12. Open Questions

- **Q1**：universal 行动在通话页视觉上是置顶还是置底？（本轮先选置顶，可调）
- **Q2**：当一个 action 同时挂在多个 object 上（同 label 不同 conditions），UI 是否合并按钮？MVP 默认按 object 分组分别展示，等内容量上来后再决定。
- **Q3**：未来若引入"共享 action 表"，过渡路径是 `action_ref: string` 字段还是把 `actions[]` 整体替换？schema 上预留 `action_ref` 但行为本轮不实现。
- **Q4**：门槛提示自动生成时的文案模板放在哪里管理？（建议放 `apps/pc-client/src/conditions/hintTemplates.ts`，本轮先就近实现。）
- **Q5**：`MapObjectRuntime` 的 `tags?` 是否本轮就启用？（建议字段保留但 MVP 不写入，等具体玩法用例出现再启用。）
- **Q6**：set_object_status 是否需要 `silent` 参数（不通知 UI 刷新等）？本轮默认无 silent，每次状态变化触发 UI 重算。
