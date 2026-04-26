# 背包与道具系统开发任务拆分

> 每个任务完成并通过 AC 后，由主 agent 统一检查 diff，并执行一次独立 commit。subagent 不直接提交 commit。

## T1 内容契约、schema 与 validator 基础

- **先置任务**：无
- **任务描述**：扩展道具与事件内容契约，使内容层可以表达“可用于响应 / 使用后消耗 / 获得道具 / 按标签使用道具 / choice 道具需求”。同步更新 validator 的跨文件校验，为后续运行时代码与内容切片提供稳定输入。
- **涉及文件**：
  - `content/schemas/items.schema.json`
  - `content/schemas/events.schema.json`
  - `content/items/items.json`
  - `scripts/validate-content.mjs`
- **验收标准 AC**：
  - AC1：`items.schema.json` 要求所有 item 显式声明 `usableInResponse` 与 `consumedOnUse`，并保持 `additionalProperties: false` 约束。
  - AC2：`events.schema.json` 支持 `addItem`、`useItemByTag`、`choice.usesItemTag`、`choice.unavailableHint`、`addItem.target` 与 `addItem.amount`。
  - AC3：`items.json` 中所有现有 item 都补齐 `usableInResponse` 与 `consumedOnUse`，且不依赖 `category` 推导消耗规则。
  - AC4：validator 校验 `addItem.itemId` 必须存在、`addItem.target` 只能是 `crewInventory` 或 `baseInventory`、`useItemByTag.itemTag` 与 `choice.usesItemTag` 必须属于 `food/light/medical/signal/clue`。
  - AC5：validator 校验带 `usesItemTag` 的 choice 至少有同标签 `useItemByTag` effect；若发现不一致，应输出明确错误。
  - AC6：运行 `npm run validate:content` 通过。
  - AC7：运行 `npm run lint` 通过，确认 schema / validator 改动没有破坏项目静态检查。
  - AC8：任务完成后通知主 agent 执行 commit。

## T2 Inventory helper、运行时类型与单元测试

- **先置任务**：T1
- **任务描述**：新增集中式库存 helper，统一处理队员背包与基地库存的添加、移除、按标签查找、按标签使用和 UI 展示格式化；同步更新内容运行时类型，使事件与 UI 后续只依赖这一套 helper。
- **涉及文件**：
  - `src/inventorySystem.ts`
  - `src/content/contentData.ts`
  - `src/**/*.test.ts` 或项目现有测试文件
- **验收标准 AC**：
  - AC1：导出通用 `InventoryEntry` 类型，以及 `InventoryItemView` 或等价展示结构。
  - AC2：实现 `addInventoryItem`，同 `itemId` 合并数量，不执行 `maxStack`，`amount <= 0` 时不产生非法数量。
  - AC3：实现 `removeInventoryItem`，扣减到 0 时移除条目，且不产生负数。
  - AC4：实现 `findUsableInventoryItemByTag`，只返回 `quantity > 0`、定义存在、包含目标 tag、`usableInResponse === true` 的道具；多个候选按 `itemId` 升序取第一个。
  - AC5：实现 `useInventoryItemByTag`，根据 `consumedOnUse` 决定是否扣 1；无可用道具时返回不可用原因并保持库存不变。
  - AC6：实现 `getInventoryView` 与标签中文显示映射，缺失定义时仍能展示 `itemId` 和数量并标记缺失。
  - AC7：`src/content/contentData.ts` 的 `ItemDefinition` 包含 `usableInResponse` 与 `consumedOnUse`，事件 effect / choice 类型预留 `addItem`、`useItemByTag`、`usesItemTag`、`unavailableHint`。
  - AC8：新增或更新单元测试覆盖添加、合并、不执行 `maxStack`、移除、按标签查找、消耗 / 不消耗、无可用道具原因。
  - AC9：运行 `npm run validate:content`、`npm run lint`、`npm run test` 通过。
  - AC10：任务完成后通知主 agent 执行 commit。

## T3 GameState、baseInventory、移除 bag 与存档 normalize

- **先置任务**：T2
- **任务描述**：把库存状态接入全局游戏状态。新增 `baseInventory`，移除 `CrewMember.bag` 派生字段，初始化与旧存档 normalize 都以 `inventory` / `baseInventory` 为事实来源，同时修复现有 UI / 测试中的 `bag` 引用以保持可编译。
- **涉及文件**：
  - `src/data/gameData.ts`
  - `src/timeSystem.ts`
  - `src/App.tsx`
  - `src/pages/CrewDetail.tsx`
  - 受类型影响的现有测试文件
- **验收标准 AC**：
  - AC1：`GameState` 新增 `baseInventory: InventoryEntry[]`。
  - AC2：`CrewMember` 不再包含 `bag`；初始队员只保存结构化 `inventory`。
  - AC3：`createInitialGameState` 或等价初始化逻辑能从现有 `resources.iron` / `resources.wood` 生成 `baseInventory` 中的 `iron_ore` / `wood`；`food` / `water` 若没有对应 item，应明确继续留在 `resources`。
  - AC4：读取旧存档时，缺少 `baseInventory` 能从 `resources` 生成；缺少队员 `inventory` 能从初始队员补齐；旧存档里的 `bag` 被忽略且不会再次保存。
  - AC5：项目内不存在运行时读取 `member.bag` 的代码；人物详情改为基于 `getInventoryView(member.inventory)` 生成携带物摘要。
  - AC6：运行 `npm run validate:content`、`npm run lint`、`npm run test` 通过。
  - AC7：任务完成后通知主 agent 执行 commit。

## T4 事件系统库存 effect 与 choice 结算

- **先置任务**：T3
- **任务描述**：将库存 helper 接入事件系统，支持 `addItem`、`useItemByTag` 与 choice 道具可用性所需的结算结果。自动事件与玩家 choice 应尽量复用同一套 effect executor，并保留旧 `addResource` / `removeResource` 路径。
- **涉及文件**：
  - `src/eventSystem.ts`
  - `src/App.tsx`
  - `src/content/contentData.ts`
  - 相关测试文件
- **验收标准 AC**：
  - AC1：`addItem target: crewInventory` 会把道具加入当前触发队员背包。
  - AC2：`addItem target: baseInventory` 会把道具加入 `GameState.baseInventory`；若 item 是 `iron_ore` 或 `wood`，兼容同步 `resources.iron` / `resources.wood` 的逻辑集中在同一处，不散落到多个模块。
  - AC3：`useItemByTag` 会从当前队员背包按 helper 规则选择道具，并根据 `consumedOnUse` 决定是否扣除。
  - AC4：无可用标签道具时，运行时防御性地不修改库存，并返回或记录明确不可用结果。
  - AC5：`resolveEmergencyChoice` 或替代 choice executor 能执行 choice effects 中的库存 effect，而不是只抽取少数旧 effect。
  - AC6：现有 `inventory.has(itemId)` 条件继续可用；本轮若未实现 `inventory.hasTag(tag)`，需由 `choice.usesItemTag` 完成 UI 可用性判断。
  - AC7：新增或更新测试覆盖 `addItem` 进队员背包、`addItem` 进基地库存、`useItemByTag` 消耗 / 不消耗、无可用道具防御。
  - AC8：运行 `npm run validate:content`、`npm run lint`、`npm run test` 通过。
  - AC9：任务完成后通知主 agent 执行 commit。

## T5 行动结算迁移：采矿、调查与旧资源兼容

- **先置任务**：T4
- **任务描述**：把现有行动结算中硬编码写入基地资源的道具获取迁移到结构化库存。重点处理 Garry 采矿与调查专长奖励，确保“默认进入触发队员背包，显式 target 才进基地库存”。
- **涉及文件**：
  - `src/App.tsx`
  - `src/crewSystem.ts`（如行动结果类型需要调整）
  - `src/eventSystem.ts`（如复用 effect executor）
  - `src/App.test.tsx`
- **验收标准 AC**：
  - AC1：Garry 采矿完成后，不再硬编码增加 `resources.iron` 作为主要结果，而是给 Garry 背包增加 `iron_ore`。
  - AC2：`applySurveyExpertiseBonus` 不再把 `iron_ore` 特判写入基地 `resources.iron`；道具奖励默认进入队员 `inventory`，除非事件 / effect 明确声明 `baseInventory`。
  - AC3：旧控制中心依赖的 `resources` 展示不因本任务崩溃；必要的兼容同步只保留在 T4 建立的集中逻辑中。
  - AC4：更新 Garry 采矿组件测试，断言 Garry 背包中的 `iron_ore` 数量变化，而不是断言基地铁资源从 `1240` 到 `1245`。
  - AC5：新增或更新测试覆盖调查 / 采集获得道具进入触发队员背包。
  - AC6：运行 `npm run validate:content`、`npm run lint`、`npm run test` 通过。
  - AC7：任务完成后通知主 agent 执行 commit。

## T6 内容切片：矿石、木材、照明与信号

- **先置任务**：T5
- **任务描述**：落地四个 MVP 验收切片的内容数据：采矿获得矿石、森林获得木材、洞穴使用照明、信号辅助通讯。内容应尽量使用 T1-T5 已建立的数据契约和运行时能力，不新增硬编码玩法路径。
- **涉及文件**：
  - `content/items/items.json`
  - `content/events/events.json`
  - `content/crew/crew.json`
  - `src/App.test.tsx` 或内容驱动流程测试
- **验收标准 AC**：
  - AC1：至少存在一个带 `light` 标签且 `usableInResponse: true` 的照明道具，并有队员可稳定持有或可通过验收流程获得。
  - AC2：至少存在一个带 `clue` 标签的道具，以保证 MVP 词表有有效样例；若本轮没有线索流程，可只作为内容样本不接入事件。
  - AC3：森林木材事件从旧 `addResource wood` 迁移为 `addItem itemId: wood target: crewInventory`。
  - AC4：矿石获得流程最终体现为触发队员背包获得 `iron_ore`。
  - AC5：洞穴照明 choice 声明 `usesItemTag: "light"`，并在 effects 中执行同标签 `useItemByTag`。
  - AC6：信号辅助通讯 choice 声明 `usesItemTag: "signal"`，并在 effects 中执行同标签 `useItemByTag`，结果文本或日志体现通讯改善 / 定位帮助 / 额外信息。
  - AC7：内容新增 / 调整不引入无效 item 引用、无效 tag 或 choice/effect 标签不一致。
  - AC8：运行 `npm run validate:content`、`npm run lint`、`npm run test` 通过。
  - AC9：任务完成后通知主 agent 执行 commit。

## T7 通讯台背包窗口与人物详情动态携带物

- **先置任务**：T6
- **任务描述**：在通讯台提供只读背包窗口入口，并把人物详情中的携带物展示统一改为库存 view。背包窗口只查看，不提供主动使用、转移、丢弃、拆分或交易。
- **涉及文件**：
  - `src/pages/CommunicationStation.tsx`
  - `src/pages/CrewDetail.tsx`
  - `src/components/Layout.tsx`（仅当需要复用现有 Modal / Panel）
  - `src/App.test.tsx`
- **验收标准 AC**：
  - AC1：通讯台每个队员卡有“查看背包”入口；有来电时“接通”仍是主要紧急操作，背包入口不能替代紧急决策。
  - AC2：背包弹窗标题为 `{队员名} / 背包` 或等价中文表达。
  - AC3：背包弹窗展示道具名称、数量、分类、中文标签、描述、可用于响应、使用后消耗。
  - AC4：空背包展示 `未记录携带物。`。
  - AC5：背包窗口不出现主动使用、转移、丢弃、拆分、交易等操作按钮。
  - AC6：人物详情“携带物”不读取 `bag`，而是从 `inventory` + item definitions 动态生成简短摘要。
  - AC7：新增或更新组件测试覆盖打开背包窗口、展示富信息、空背包文案。
  - AC8：运行 `npm run validate:content`、`npm run lint`、`npm run test` 通过。
  - AC9：任务完成后通知主 agent 执行 commit。

## T8 通话页道具 choice 可用性与 disabled 原因

- **先置任务**：T7
- **任务描述**：让通话页根据 `choice.usesItemTag` 展示道具响应选项的启用 / 禁用状态和原因。玩家只有点击该 choice 才会使用道具；没有可用道具时仍展示 disabled 选项和提示。
- **涉及文件**：
  - `src/pages/CallPage.tsx`
  - `src/App.tsx`
  - `src/inventorySystem.ts`
  - `src/App.test.tsx`
- **验收标准 AC**：
  - AC1：`CallPage` 渲染 choice 时，如果存在 `usesItemTag`，会使用当前通话队员背包调用 `findUsableInventoryItemByTag`。
  - AC2：存在可用道具时，按钮可点击，并展示标签中文名、将使用的具体道具名、是否消耗。
  - AC3：不存在可用道具时，按钮 disabled，并展示 `unavailableHint` 或默认文案 `需要可用的{标签中文名}道具。`。
  - AC4：多个同标签可用道具时，UI 展示与运行时结算使用同一个按 `itemId` 升序选出的道具。
  - AC5：点击带 `usesItemTag` 的 choice 后，事件结果 / 系统日志至少能体现使用了什么道具以及是否消耗。
  - AC6：不带 `usesItemTag` 的普通 choice 行为不发生回归。
  - AC7：新增或更新组件测试覆盖有 `light` 道具可点击、无 `light` 道具 disabled、有 `signal` 道具使用后日志 / 结果体现通讯改善。
  - AC8：运行 `npm run validate:content`、`npm run lint`、`npm run test` 通过。
  - AC9：任务完成后通知主 agent 执行 commit。

## T9 端到端覆盖与全量回归验证

- **先置任务**：T8
- **任务描述**：补齐从玩家视角可验证的端到端流程，并执行全量回归。该任务不应再引入新的系统能力，只修正测试暴露的集成问题。
- **涉及文件**：
  - `tests/e2e/app.spec.ts`
  - `src/App.test.tsx`（仅补充集成断言或修复前序遗漏）
  - 必要的内容 / UI 文件（仅限修复测试暴露的问题）
- **验收标准 AC**：
  - AC1：E2E 覆盖打开通讯台并查看某队员背包，确认预设道具可见。
  - AC2：E2E 或组件集成测试覆盖完成一次获得道具流程后，再打开背包确认数量变化。
  - AC3：E2E 或组件集成测试覆盖完成一次带 `usesItemTag` 的通话 / 事件流程，确认结果文本与系统日志。
  - AC4：所有旧的关键流程测试仍通过，包括紧急来电、通话决策、移动 / 行动结算、存档读取。
  - AC5：运行 `npm run validate:content` 通过。
  - AC6：运行 `npm run lint` 通过。
  - AC7：运行 `npm run test` 通过。
  - AC8：运行 `npm run test:e2e` 通过；若因本地浏览器依赖或环境限制无法运行，需要记录具体失败原因和已完成的替代验证。
  - AC9：任务完成后通知主 agent 执行 commit。
