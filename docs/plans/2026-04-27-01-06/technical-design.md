# 背包与道具系统技术设计

---
topic: inventory-item-system
date: 2026-04-27
status: draft
source:
  product_design: docs/plans/2026-04-27-01-06/inventory-item-system-design.md
  research: docs/plans/2026-04-27-01-06/research.md
target_scope:
  - content/items/items.json
  - content/events/events.json
  - content/crew/crew.json
  - scripts/validate-content.mjs
  - src/content/contentData.ts
  - src/data/gameData.ts
  - src/eventSystem.ts
  - src/App.tsx
  - src/pages/CommunicationStation.tsx
  - src/pages/CrewDetail.tsx
  - src/pages/CallPage.tsx
  - src/App.test.tsx
  - tests/e2e/app.spec.ts
---

## 1. 目标与非目标

### 1.1 目标

本轮实现背包与道具系统的 MVP，使道具从静态展示数据变成可由事件、行动与通话响应读写的运行时状态。

- 队员背包与基地库存都使用结构化 `itemId + quantity` 表示。
- 事件/采集获得道具默认进入触发队员背包。
- 事件显式声明送基地时，道具进入 `baseInventory`。
- 玩家只能在事件/通话响应中选择是否使用标签道具。
- 背包窗口只查看，不提供主动使用、转移、丢弃、拆分、交易等操作。
- 道具是否可用于响应由 `usableInResponse` 显式控制。
- 道具使用后是否消耗由 `consumedOnUse` 显式控制。
- 多个同标签可用道具按 `itemId` 升序选择第一个，保证结果稳定。
- MVP 标签在内容数据中使用英文稳定 ID：`food`、`light`、`medical`、`signal`、`clue`。
- UI 负责把英文标签映射为中文显示名。
- 不执行 `maxStack`，同 `itemId` 只合并数量。
- 覆盖四个验收切片：采矿获得矿石、森林获得木材、洞穴使用照明、信号辅助通讯。

### 1.2 非目标

本轮不实现以下能力，也不在技术设计中为其预留复杂流程：

- 背包负重、容量、格子、超重惩罚。
- 队员之间交换物品。
- 队员背包与基地库存之间的自由上交、回收、分配流程。
- 合成、拆解、买卖、交易价格。
- 耐久、腐坏、维护费、定期损耗。
- 背包界面的主动使用按钮。
- 复杂多标签表达式、配方、组合消耗、权重评分。
- 通用 item `effects` 自动解释器。
- 把 Debug toolbox、地图页面或控制中心变成道具操作入口。

## 2. 当前实现基线

### 2.1 内容数据现状

- `content/items/items.json` 已有 `itemId`、`name`、`category`、`stackable`、`maxStack`、`description`、`tags`、`effects`。
- 当前 item tags 已使用英文字符串，例如 `food`、`medical`、`signal`、`resource`、`survey`。
- 当前缺少 `light` 与 `clue` MVP 标签的有效样本道具。
- 当前缺少 `usableInResponse` 与 `consumedOnUse` 两个显式布尔字段。
- 当前 `content/schemas/items.schema.json` 不要求也不允许上述两个新字段。
- `content/crew/crew.json` 已为每名队员配置 `inventory: [{ itemId, quantity }]`。
- `content/schemas/crew.schema.json` 已定义 `inventoryEntry`，只包含 `itemId` 与 `quantity`。
- `content/events/events.json` 已有 `inventory.has(basic_tool)` 与 `inventory.has(scanner)` 条件/修正。
- 当前事件效果使用 `addResource` 把木材、铁矿石写入基地资源汇总，而不是队员背包。
- 当前 `content/schemas/events.schema.json` 不支持 `addItem`、`useItemByTag`、`usesItemTag`。

### 2.2 运行时代码现状

- `src/content/contentData.ts` 导出 `itemDefinitionById`，运行时可以按 `itemId` 查道具定义。
- `src/content/contentData.ts` 的 `ItemDefinition` 没有 `usableInResponse` 与 `consumedOnUse`。
- `src/content/contentData.ts` 的 `EventEffectDefinition` 没有背包/基地库存相关 effect。
- `src/data/gameData.ts` 的 `CrewMember` 同时保存结构化 `inventory` 与派生展示字段 `bag`。
- `src/data/gameData.ts` 的 `ResourceSummary` 保存基地资源数值，包括 `iron`、`wood`、`food`、`water`。
- `src/eventSystem.ts` 的 `applyEventEffects` 当前把 `addResource` / `removeResource` 结算到 `ResourceSummary`。
- `src/eventSystem.ts` 的 `evaluateCondition` 支持 `inventory.has(item_id)`，不支持按标签检查。
- `src/eventSystem.ts` 的 `resolveEmergencyChoice` 当前只抽取少数 effect 生成 `EventDecisionResult`，没有通用执行所有 choice effects。
- `src/App.tsx` 的 `GameState` 没有 `baseInventory`。
- `src/App.tsx` 的 `settleCrewAction` 对 Garry 采矿硬编码增加 `resources.iron`。
- `src/App.tsx` 的 `applySurveyExpertiseBonus` 对 `iron_ore` 特判进入 `resources.iron`，其它道具才走 `addInventoryItem`。
- `src/App.tsx` 内部已有 `addInventoryItem`，会按同 `itemId` 合并数量，但不执行 `maxStack`。
- `src/pages/CommunicationStation.tsx` 当前队员卡按钮是“查看档案”，没有独立“查看背包”。
- `src/pages/CrewDetail.tsx` 当前“携带物”只展示 `member.bag.join(" / ")`，没有 tags、description、是否消耗。
- `src/pages/CallPage.tsx` 紧急事件 choices 来自事件配置，普通通话选项仍有硬编码路径。

### 2.3 测试现状与冲突

- `src/App.test.tsx` 当前测试 “settles Garry mining from the time system” 断言 Garry 采矿后基地铁资源从 `1240` 变为 `1245`。
- 该断言与本轮“采矿获得矿石默认进入触发队员背包”的产品规则冲突，后续实现时必须更新测试预期。
- `tests/e2e/app.spec.ts` 当前只覆盖 Amy 紧急事件，没有背包查看、获得道具或使用标签道具流程。

## 3. 与旧代码的明确冲突点

| 冲突点 | 旧代码现状 | 新设计要求 | 处理方式 |
| --- | --- | --- | --- |
| Garry 采矿 | `src/App.tsx` 直接增加 `resources.iron`，测试断言 `1245` | 采矿获得 `iron_ore` 默认进入 Garry 背包 | 修改结算与测试，若需要基地资源必须显式 `target: baseInventory` |
| `addResource` | `src/eventSystem.ts` 只修改 `ResourceSummary` | 新增 `addItem` + `target`，支持 `crewInventory` / `baseInventory` | `addResource` 保留为兼容或逐步迁移，新增内容优先用 `addItem` |
| `bag` | `CrewMember.bag` 是派生展示并进入 state/save | 移除 `bag`，UI 动态从 `inventory` + item definitions 渲染 | 更新类型、初始化、normalize、UI 与测试 |
| items 字段 | item 缺少 `usableInResponse`、`consumedOnUse` | 两个字段为显式布尔值 | 更新 schema、类型与全部 item 内容 |
| events effect | schema 不支持 `addItem` / `useItemByTag` | 新增通用库存 effect 与标签使用 effect | 更新 schema、类型、validator、eventSystem |
| choice UI | choice 没有 `usesItemTag` | choice 用 `usesItemTag` 控制显示/可用性 | 更新 schema、类型、CallPage 显示逻辑 |
| 基地库存 | `resources` 是唯一结构化基地物资状态 | 新增 `baseInventory` 作为 itemId/quantity 库存状态 | 从 `resources` normalize 生成，逐步迁移事实来源 |

## 4. 数据模型设计

### 4.1 InventoryEntry

队员背包与基地库存共用同一结构。

```ts
interface InventoryEntry {
  itemId: string;
  quantity: number;
}
```

规则：

- `quantity` 必须为正整数。
- 添加同 `itemId` 时合并数量。
- 扣减到 0 时移除条目。
- MVP 不执行 `maxStack`。
- MVP 不检查容量、重量或格子。

### 4.2 ItemDefinition

在现有字段基础上新增两个显式字段。

```ts
interface ItemDefinition {
  itemId: string;
  name: string;
  category: "tool" | "weapon" | "consumable" | "resource" | "quest" | "misc";
  stackable: boolean;
  maxStack?: number;
  description: string;
  tags: string[];
  usableInResponse: boolean;
  consumedOnUse: boolean;
  effects: Array<{ type: string; target?: string; value?: number; condition?: string }>;
}
```

字段语义：

- `usableInResponse`：是否允许在事件/通话响应中被 `usesItemTag` / `useItemByTag` 使用。
- `consumedOnUse`：使用后是否扣除 1 个数量。
- `category` 不再隐式决定消耗规则。消耗品通常为 `consumedOnUse: true`，但最终以字段为准。
- `effects` 本轮继续作为内容描述或未来扩展，不做通用自动解释器。

### 4.3 MVP Item Tags

内容数据中的 MVP 功能标签使用英文稳定 ID。

| tag id | 中文显示 | 语义 |
| --- | --- | --- |
| `food` | 食物 | 补给、饥饿、疲劳、安抚类响应 |
| `light` | 照明 | 洞穴、黑暗、能见度风险响应 |
| `medical` | 医疗 | 轻伤、急救、病痛响应 |
| `signal` | 信号 | 通讯、定位、失联、广播塔响应 |
| `clue` | 线索 | 任务线索、证据、异常信息响应 |

约束：

- UI 负责中文显示映射，不把中文标签写入内容数据。
- 内容可以保留非 MVP 标签，例如 `resource`、`survey`、`tool`、`mining`，但只有 MVP 五类参与本轮标签道具响应。
- validator 应至少校验 `usesItemTag` / `useItemByTag` 使用的标签属于 MVP 词表。

### 4.4 GameState

新增 `baseInventory`。

```ts
interface GameState {
  elapsedGameSeconds: number;
  crew: CrewMember[];
  tiles: MapTile[];
  logs: SystemLog[];
  resources: ResourceSummary;
  baseInventory: InventoryEntry[];
  eventHistory: EventHistory;
}
```

关系说明：

- `crew[].inventory` 是队员个人背包事实来源。
- `baseInventory` 是基地库存事实来源。
- 本轮逐步以 `baseInventory` 作为道具库存事实来源。
- `resources` 暂时保留，用于兼容旧 UI、旧测试、已有控制中心资源展示或逐步移除过程。
- 实现任务需要明确每个资源展示读 `resources`、`baseInventory`，还是二者同步后的派生值。

### 4.5 CrewMember

移除 `bag`。

```ts
interface CrewMember {
  id: CrewId;
  name: string;
  inventory: InventoryEntry[];
  // no bag
}
```

规则：

- UI 不再读取 `member.bag`。
- UI 通过 `member.inventory` 与 `itemDefinitionById` 动态渲染名称、数量、标签、描述、是否消耗。
- 存档中若仍存在 `bag`，normalize 时忽略即可。

## 5. Schema 变更

### 5.1 `content/schemas/items.schema.json`

新增字段：

- `usableInResponse`: boolean，required。
- `consumedOnUse`: boolean，required。

建议规则：

- `required` 增加两个字段，确保内容作者显式表态。
- `additionalProperties: false` 继续保留。
- `stackable: true` 仍要求 `maxStack`，但运行时不执行 `maxStack`。

示例：

```json
{
  "itemId": "signal_flare",
  "name": "信号弹",
  "category": "consumable",
  "stackable": true,
  "maxStack": 5,
  "description": "可在失联或救援相关事件中提供定位帮助。",
  "tags": ["signal", "emergency"],
  "usableInResponse": true,
  "consumedOnUse": true,
  "effects": []
}
```

### 5.2 `content/schemas/events.schema.json`

新增 effect 类型：

- `addItem`
- `useItemByTag`

新增 effect 字段：

- `itemId`: id，用于 `addItem`。
- `itemTag`: id，用于 `useItemByTag`。
- `target`: enum，至少支持 `crewInventory`、`baseInventory`。
- `amount`: integer，`addItem` 时必须大于等于 1。

建议 effect 约束：

```json
{ "type": "addItem", "itemId": "wood", "amount": 2, "target": "crewInventory" }
{ "type": "addItem", "itemId": "iron_ore", "amount": 5, "target": "baseInventory" }
{ "type": "useItemByTag", "itemTag": "light" }
```

新增 choice 字段：

- `usesItemTag`: id，可选。
- `unavailableHint`: localizedText，可选。

choice 语义：

- 有 `usesItemTag` 的 choice 是“使用某标签道具”的玩家响应选项。
- UI 根据 `usesItemTag` 查当前队员背包，决定按钮启用或禁用。
- 没有可用道具时按钮仍显示为 disabled，并展示 `unavailableHint` 或默认原因。
- 结算时 effect 中必须存在同标签 `useItemByTag`，实际使用与消耗由 effect 执行。

### 5.3 `content/schemas/crew.schema.json`

MVP 不需要改动。

现有 `inventoryEntry` 已满足队员初始背包需求。

### 5.4 Validator 变更

`scripts/validate-content.mjs` 需要新增以下校验：

- 所有 `addItem.itemId` 必须存在于 `items`。
- 所有 `useItemByTag.itemTag` 必须属于 MVP 标签词表。
- 所有 `choice.usesItemTag` 必须属于 MVP 标签词表。
- 若 choice 声明 `usesItemTag`，则该 choice 的 `effects` 或成功/失败 effects 中必须存在同标签 `useItemByTag`。
- 若 effect 使用 `useItemByTag`，建议同 choice 声明 `usesItemTag`，避免 UI 无法预览。
- `addItem.target` 必须为 `crewInventory` 或 `baseInventory`。
- 可以继续校验 `addResource` / `removeResource` / `discoverResource` 的 `resource` 引用，直到这些旧 effect 被移除或完全迁移。

## 6. 运行时 Helper 设计

建议新增 `src/inventorySystem.ts`，集中处理背包与基地库存逻辑，避免 `App.tsx`、`eventSystem.ts`、UI 各自实现。

### 6.1 核心类型

```ts
export interface InventoryEntry {
  itemId: string;
  quantity: number;
}

export interface InventoryItemView {
  itemId: string;
  name: string;
  quantity: number;
  category: ItemDefinition["category"];
  tags: string[];
  tagLabels: string[];
  description: string;
  usableInResponse: boolean;
  consumedOnUse: boolean;
  missingDefinition: boolean;
}
```

### 6.2 添加道具

```ts
function addInventoryItem(inventory: InventoryEntry[], itemId: string, amount: number): InventoryEntry[]
```

规则：

- `amount <= 0` 时返回原库存或由调用方避免传入。
- 已存在同 `itemId` 时叠加数量。
- 不执行 `maxStack`。
- 不根据 `stackable` 拒绝重复获得。

### 6.3 移除道具

```ts
function removeInventoryItem(inventory: InventoryEntry[], itemId: string, amount: number): InventoryEntry[]
```

规则：

- 只扣现有数量。
- 数量降到 0 或以下时移除条目。
- 不允许产生负数。

### 6.4 查找标签道具

```ts
function findUsableInventoryItemByTag(inventory: InventoryEntry[], tag: string): InventoryEntry | null
```

筛选条件：

- `quantity > 0`。
- item definition 存在。
- `item.tags.includes(tag)`。
- `item.usableInResponse === true`。

排序规则：

- 按 `itemId` 升序。
- 返回第一个匹配项。

### 6.5 使用标签道具

```ts
function useInventoryItemByTag(inventory: InventoryEntry[], tag: string): {
  inventory: InventoryEntry[];
  usedItem: ItemDefinition | null;
  consumed: boolean;
  unavailableReason?: string;
}
```

规则：

- 没有可用道具时不修改库存，返回不可用原因。
- 找到道具后，若 `consumedOnUse` 为 true，则扣除 1。
- 若 `consumedOnUse` 为 false，则库存不变。
- 返回实际使用的 item definition，用于日志与 UI 反馈。

### 6.6 UI 格式化

```ts
function getInventoryView(inventory: InventoryEntry[]): InventoryItemView[]
```

用途：

- 通讯台背包窗口。
- 人物详情携带物摘要。
- 通话页道具使用选项 hint。

规则：

- 缺失 item definition 时仍展示 `itemId` 与数量，并标记 `missingDefinition: true`。
- 标签中文显示由统一映射函数处理。

## 7. 事件系统接入

### 7.1 `addItem` effect

语义：

- `target: "crewInventory"`：添加到触发事件/当前 choice 的队员背包。
- `target: "baseInventory"`：添加到 `GameState.baseInventory`。
- 若未来需要其他 target，另开设计，不在本轮实现。

执行位置：

- 自动事件触发：`triggerEvents` -> `applyEventEffects`。
- 玩家 choice 结算：`resolveEmergencyChoice` 或改造后的通用 choice 结算流程。
- 普通通话若需要使用事件配置，也应复用同一 effect executor。

日志：

- 若事件显式配置 `addLog`，使用配置日志。
- 若没有配置日志，可由 effect executor 追加默认日志，例如：`Garry 获得 铁矿石 x5，已加入个人背包。`
- 是否默认生成日志需要实现时统一，避免重复日志。

### 7.2 `useItemByTag` effect

语义：

- 从当前队员背包查找符合 `itemTag` 的可响应道具。
- 按 `itemId` 升序选择一个。
- 根据该道具 `consumedOnUse` 决定是否扣 1。
- 记录使用结果供日志和 choice result 使用。

执行失败：

- UI 正常情况下会禁用无可用道具的 choice。
- 运行时仍必须防御：如果结算时没有可用道具，不修改库存，并返回失败结果或忽略 effect。
- 推荐返回明确日志：`未找到可用的照明道具，选项无法执行。`

### 7.3 Choice 结算改造

当前 `resolveEmergencyChoice` 返回 `EventDecisionResult`，只抽取部分 effects。为了支持背包变化，需要改造为以下两种方式之一：

- 方案 A：`resolveEmergencyChoice` 仍返回 decision patch，但新增 `inventory` / `baseInventory` / `logs` patch 字段。
- 方案 B：将 effect executor 提升为可同时返回 `member`、`resources`、`baseInventory`、`tiles`、`logs` 的通用结果，`App.tsx` 直接接收并合并。

推荐方案 B。

理由：

- 自动事件与 choice 事件可以复用同一套 effect 结算。
- `addItem`、`useItemByTag`、`updateTile`、`addLog` 不需要在 `resolveEmergencyChoice` 中逐个抽取。
- 后续若增加更多 effect，扩展点集中在一个 executor。

### 7.4 条件与标签检查

MVP 不要求必须新增字符串条件 `inventory.hasTag(tag)`。

本轮按以下优先级实现：

- `choice.usesItemTag` 控制 UI 可用性。
- `effect.useItemByTag` 控制实际结算。
- 现有 `inventory.has(itemId)` 保留，用于旧事件 modifier。
- 若后续内容确实需要按标签影响概率，再新增 `inventory.hasTag(tag)`。

## 8. 通话与响应 UI

### 8.1 Choice 显示规则

`CallPage` 渲染 choice 时，如果 action/choice 带 `usesItemTag`：

- 查询当前通话队员 inventory。
- 使用 `findUsableInventoryItemByTag` 得到将被使用的具体道具。
- 若存在可用道具，按钮启用。
- 若不存在可用道具，按钮 disabled。
- disabled 时显示 `unavailableHint` 或默认文案：`需要可用的{标签中文名}道具。`

启用按钮 hint 建议包含：

- 标签中文名。
- 将使用的具体道具名称。
- 是否会消耗。

示例：

- `使用照明：将使用 手电筒；使用后消耗。`
- `使用信号：将使用 扫描器；使用后不消耗。`

### 8.2 玩家确认边界

- 玩家点击 choice 即代表确认使用该标签道具。
- 背包窗口不提供主动使用。
- 系统不得在玩家未点击使用道具 choice 的情况下自动消耗道具。
- 如果 choice 只是检查是否拥有道具但不使用，应避免配置 `usesItemTag` / `useItemByTag`，另行使用普通条件或文案。

### 8.3 多个同标签道具

UI 只展示系统将按规则选中的第一个道具。

规则：

- 过滤可用道具。
- 按 `itemId` 升序。
- 使用第一个。

不提供具体道具选择器。

### 8.4 反馈

结算后反馈至少覆盖：

- 使用了什么道具。
- 是否消耗。
- 事件结果如何改变。
- 相关日志写入系统日志。

## 9. 通讯台背包窗口

### 9.1 入口

在 `CommunicationStation` 的队员卡操作区新增“查看背包”按钮。

建议按钮规则：

- 普通状态：显示“查看背包”和“通话”。
- 有来电状态：仍优先显示“接通”，但可以保留“查看背包”作为次要按钮，不能替代紧急决策。
- 队员 unavailable 时仍可查看最后已知背包，具体是否锁定由后续失联设计决定；MVP 可只读显示。

### 9.2 背包弹窗内容

弹窗标题：`{队员名} / 背包`

字段：

- 道具名称。
- 数量。
- 分类。
- 标签中文显示。
- 描述。
- 可用于响应：是/否。
- 使用后消耗：是/否。

空背包文案：

- `未记录携带物。`

### 9.3 人物详情中的携带物

`CrewDetail` 可以保留“携带物”面板，但必须改为动态渲染：

- 不再读取 `member.bag`。
- 可展示简短摘要，例如 `铁矿石 x4 / 矿镐 / 水银温度计`。
- 详细信息由通讯台背包窗口承担。

## 10. `baseInventory` 与 `resources` 关系及迁移策略

### 10.1 本轮定位

本轮新增 `baseInventory`，基地库存也使用 `itemId + quantity` 表示。

长期方向：

- `baseInventory` 成为基地道具库存事实来源。
- `resources` 保留为 UI 兼容层、派生展示层，或在后续任务中逐步移除。

本轮不要求一次性删除 `resources`，因为控制中心和现有测试仍依赖资源摘要。

### 10.2 初始状态

`createInitialGameState` 应从现有 `initialResources` 生成初始 `baseInventory`。

建议映射：

| resources 字段 | baseInventory itemId |
| --- | --- |
| `iron` | `iron_ore` |
| `wood` | `wood` |
| `food` | 需要确认是否已有 itemId；若无则暂不映射或新增对应 item |
| `water` | 需要确认是否已有 itemId；若无则暂不映射或新增对应 item |

注意：当前 `content/items/items.json` 有 `iron_ore`、`wood`，没有 `food`、`water` 对应 itemId。实现时必须选择以下处理之一：

- 新增 `food`、`water` item 定义后完整映射。
- 暂时只映射已有 item，`resources.food` / `resources.water` 继续留在 `resources`。

### 10.3 运行时同步策略

推荐本轮采用“库存事实来源 + 兼容同步”的渐进策略：

- 新增内容和新系统写入优先使用 `baseInventory`。
- 控制中心若仍展示 `resources`，实现任务需要决定是否从 `baseInventory` 派生显示值。
- 旧 `addResource` 可以暂时继续修改 `resources`，但新增背包/基地库存内容应使用 `addItem`。
- 若某个 `addItem target: baseInventory` 添加的是 `iron_ore` / `wood`，可以同步更新 `resources.iron` / `resources.wood` 以保持旧 UI 不断裂。
- 同步逻辑必须集中在 helper 或 effect executor，避免多个模块各自映射。

### 10.4 逐步移除事项

以下不要求本轮全部完成，但需要作为后续任务记录：

- 控制中心资源面板改为从 `baseInventory` 或派生 selector 读取。
- `ResourceSummary` 中可由 item 表达的字段逐步转为派生值。
- 明确 `energy`、`baseIntegrity`、`sol`、`power`、`commWindow` 这类非物品状态是否继续留在 `resources` 或拆分为基地状态。

## 11. 存档迁移与兼容策略

### 11.1 旧 localStorage 存档 normalize

当前存档 key 为 `stellar-frontier-save-v1`，保存完整 `GameState`。

读取旧存档时：

- 如果缺少 `baseInventory`，从 `resources` 映射生成。
- 如果 `resources` 也缺失，使用初始 `resources` 再生成。
- 如果 crew member 缺少 `inventory`，用对应 `initialCrew` 的 inventory 补齐。
- 如果 crew member 存在旧 `bag` 字段，忽略即可。
- 如果 crew member 缺少 `bag`，不需要补，因为新模型不再使用。
- 如果 item 新增了 `usableInResponse` / `consumedOnUse`，不需要迁移存档，因为这些字段来自内容定义，不存在存档里。

### 11.2 版本化

可以继续使用现有 save key，不强制 bump。

如果实现中发现旧存档结构差异导致 normalize 复杂，允许后续任务讨论是否 bump save version。但本技术设计推荐先通过 normalize 兼容旧存档。

### 11.3 派生展示字段移除

移除 `bag` 后：

- 不再保存 `bag`。
- 不再同步 `bag`。
- UI 每次渲染时从 `inventory` 和 `itemDefinitionById` 动态生成展示。
- 测试不应断言 `member.bag`，只断言 UI 展示或 `inventory` 结果。

## 12. 内容数据改造

### 12.1 items 改造

所有 item 必须补齐：

- `usableInResponse`
- `consumedOnUse`

建议初始取值：

| itemId | 建议 usableInResponse | 建议 consumedOnUse | 说明 |
| --- | --- | --- | --- |
| `signal_flare` | true | true | 信号标签一次性消耗 |
| `ration` | true | true | 食物标签消耗 |
| `chocolate` | true | true | 食物标签消耗 |
| `medical_injector` | true | true | 医疗标签消耗 |
| `scanner` | true | false | 信号工具，可重复使用 |
| `iron_ore` | false | false | 资源类，不在响应中使用 |
| `wood` | false | false | 资源类，不在响应中使用 |
| `basic_tool` | false 或 true | false | 若本轮无标签响应用途，建议 false |
| 其它工具/武器/任务物 | 按内容用途显式填写 | 按内容用途显式填写 | 不依赖 category 推导 |

需要新增或调整的 MVP 道具：

- 至少一个 `light` 标签道具，用于洞穴使用照明切片。
- 至少一个 `clue` 标签道具，用于词表完整性或后续线索事件；若本轮无验收场景，可新增但不强制使用。
- 如需完整映射 `resources.food` / `resources.water`，需要新增 `food` / `water` item 定义或明确暂不映射。

### 12.2 events 改造

森林木材事件：

- 当前：`{ "type": "addResource", "resource": "wood", "amount": 2 }`
- 目标：`{ "type": "addItem", "itemId": "wood", "amount": 2, "target": "crewInventory" }`

矿石获得：

- Garry 采矿硬编码应改为给 Garry `iron_ore`。
- 若通过事件表达 gatherComplete，则使用 `addItem target: crewInventory`。

洞穴照明：

- 新增或改造一个事件 choice：`usesItemTag: "light"`。
- 对应 effects 中包含 `{ "type": "useItemByTag", "itemTag": "light" }`。
- 成功文本与日志说明照明改变风险或奖励。

信号辅助通讯：

- 新增或改造一个事件 choice：`usesItemTag: "signal"`。
- 对应 effects 中包含 `{ "type": "useItemByTag", "itemTag": "signal" }`。
- 结果体现通讯改善、倒计时压力降低或获得额外信息。

### 12.3 crew 改造

队员初始 inventory 结构可保留。

可能需要调整：

- 给某名队员初始携带 `light` 标签道具，以便洞穴验收可稳定触发。
- 保证至少一名可参与信号事件的队员携带 `signal` 标签且 `usableInResponse: true` 的道具。

## 13. 测试策略

### 13.1 内容校验

必须通过：

- `npm run validate:content`

覆盖点：

- items 新字段存在且类型正确。
- events `addItem.itemId` 引用存在。
- events `addItem.target` 合法。
- events `usesItemTag` / `useItemByTag.itemTag` 属于 MVP 标签词表。
- choice `usesItemTag` 与 effect `useItemByTag` 一致。

### 13.2 Inventory helper 单元测试

建议覆盖：

- 添加新 item。
- 添加已有 item 合并数量。
- 不执行 `maxStack`。
- 移除 item 到 0 后删除条目。
- 查找标签道具只返回 `usableInResponse: true`。
- 多个同标签道具按 `itemId` 升序选择。
- `consumedOnUse: true` 使用后数量 -1。
- `consumedOnUse: false` 使用后数量不变。
- 无可用道具时返回不可用原因且不修改库存。

### 13.3 组件测试

需要更新/新增 `src/App.test.tsx`：

- Garry 采矿测试从“基地铁资源增加”改为“Garry 背包 `iron_ore` 数量增加”。
- 通讯台可以打开队员背包窗口。
- 背包窗口展示名称、数量、标签、描述、是否消耗。
- 森林调查获得木材后，触发队员背包新增或叠加 `wood`。
- 有 `light` 标签道具时，通话/事件选项可点击，使用后按道具字段消耗或保留。
- 无标签道具时，选项 disabled 并显示不可用原因。
- `signal` 标签道具使用后日志/结果体现通讯改善。

### 13.4 E2E 测试

建议新增或扩展 `tests/e2e/app.spec.ts`：

- 打开通讯台，查看某队员背包，确认预设道具可见。
- 完成一个获得道具流程后，再打开背包确认数量变化。
- 完成一个使用标签道具的通话/事件流程，确认结果文本与日志。

### 13.5 回归测试

实现后必须运行：

- `npm run validate:content`
- `npm run lint`
- `npm run test`

若修改 E2E 或流程稳定性允许，运行：

- `npm run test:e2e`

## 14. 风险与缓解

| 风险 | 表现 | 缓解 |
| --- | --- | --- |
| `resources` 与 `baseInventory` 双状态不一致 | 控制中心显示与库存窗口数量不同 | 用集中 selector 或 effect executor 同步，避免散落映射 |
| choice 声明与 effect 不一致 | UI 显示使用照明，结算却消耗信号 | validator 校验 `usesItemTag` 与 `useItemByTag` 一致 |
| 道具被静默消耗 | 玩家没有意识到使用了关键物 | 只有点击带 `usesItemTag` 的 choice 才使用；按钮 hint 与日志写明消耗 |
| `bag` 移除影响旧 UI | CrewDetail 或测试读取不存在字段 | 全局搜索替换为动态 inventory view，并通过类型检查捕捉 |
| 旧存档缺少 `baseInventory` | 读取旧 save 后基地库存为空 | normalize 时从 `resources` 映射生成 |
| 标签词表失控 | 内容出现 `lighting`、`lamp`、`med` 等近义标签 | validator 限制响应标签为 MVP 五类，非响应标签不参与本轮规则 |
| effect executor 改造过大 | 紧急事件、普通通话、自动事件路径回归 | 分阶段迁移，先保留现有行为测试，再为新 effect 加覆盖 |
| Garry 采矿旧测试失败 | `1245` 断言失效 | 明确更新测试，以背包 `iron_ore` 为新验收 |

## 15. 开发任务拆分建议

### 15.1 内容与 schema

- 扩展 `items.schema.json`，增加 `usableInResponse` 与 `consumedOnUse`。
- 扩展 `events.schema.json`，增加 `addItem`、`useItemByTag`、`usesItemTag`、`unavailableHint`、`target`。
- 更新 `items.json` 全量 item 字段。
- 新增或调整 `light`、`clue` 相关 item。
- 改造木材、矿石、洞穴照明、信号辅助通讯相关事件内容。
- 更新 `validate-content.mjs` 跨文件引用与标签一致性校验。

### 15.2 类型与状态

- 更新 `src/content/contentData.ts` 类型。
- 在 `src/data/gameData.ts` 增加 `InventoryEntry` 或从 inventory helper 导入。
- 从 `CrewMember` 移除 `bag`。
- 在 `GameState` 增加 `baseInventory`。
- 更新初始状态与存档 normalize。

### 15.3 Inventory helper

- 新增 `src/inventorySystem.ts`。
- 实现 add/remove/find/use/view helper。
- 增加标签中文显示映射。
- 为 helper 添加单元测试。

### 15.4 事件系统

- 改造 effect executor 支持 `addItem` 与 `useItemByTag`。
- 让自动事件与 choice 结算复用库存 effect。
- 处理 `baseInventory` 与 `resources` 的兼容同步。
- 保留旧 `addResource` 路径，直到内容迁移完成。

### 15.5 App 行动结算

- 改造 Garry 采矿，把 `iron_ore` 加入 Garry 背包。
- 改造 `applySurveyExpertiseBonus`，移除 `iron_ore` 进基地资源的特判或转为显式 target 逻辑。
- 移除 `App.tsx` 私有 `addInventoryItem`，改用统一 helper。

### 15.6 UI

- 通讯台新增背包窗口入口。
- 背包窗口展示富信息。
- CrewDetail 改为动态 inventory 摘要。
- CallPage 根据 `usesItemTag` 显示可用/disabled 状态与 hint。
- 结算结果与日志显示使用、消耗、获得信息。

### 15.7 测试

- 更新 Garry 采矿组件测试。
- 新增背包窗口组件测试。
- 新增获得木材/矿石测试。
- 新增照明/信号使用测试。
- 新增或扩展 E2E 覆盖背包查看和标签道具使用。

## 16. 已确认技术决策

| 编号 | 决策 | 结果 |
| --- | --- | --- |
| 1 | MVP 标签在内容数据中的形式 | 使用英文稳定 ID：`food`、`light`、`medical`、`signal`、`clue`；UI 负责中文显示映射 |
| 2 | 道具响应可用性与消耗规则 | 使用两个显式布尔字段：`usableInResponse: boolean` 与 `consumedOnUse: boolean` |
| 3 | 事件获得道具/送基地 effect | 新增通用 effect：`addItem` + `target`，`target` 至少支持 `crewInventory` 与 `baseInventory` |
| 4 | 使用标签道具的配置方式 | choice 声明 `usesItemTag` 控制 UI 显示与可用性，effect 声明 `useItemByTag` 执行结算；validator 校验一致 |
| 5 | 无可用标签道具时的 UI | 显示 disabled 选项和不可用原因 |
| 6 | 基地库存状态 | 本轮新增 `baseInventory`，基地库存也使用 `itemId/quantity`，作为 `GameState` 的结构化状态 |
| 7 | 队员背包展示字段 | 移除 `CrewMember.bag` 派生展示字段，UI 动态从 `inventory` + item definitions 渲染，不再持久化/同步 `bag` |
