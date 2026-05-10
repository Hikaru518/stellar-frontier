# Quest System Implementation Tasks

## 执行顺序

本实现按 `T1 -> T2 -> T3 -> T4 -> T5 -> T6 -> T7 -> T8 -> T9` 串行推进。每个任务应由一个 subagent 完成、验收并单独 commit。后续任务不得绕过前置依赖；若前置任务的接口需要调整，应先回到对应任务修正并补测。

## T1: 建立任务内容、Schema、加载与基础内容校验

### 任务目标

建立 `content/quests` 作为任务静态定义的唯一来源，新增任务 JSON schema，并让 PC content loader 能读取任务定义。该任务只落地内容结构、示例任务和静态校验，不接入运行时状态或 UI。

### 范围/涉及文件

- `content/quests/quests.json`
- `content/schemas/quests.schema.json`
- `content/events/handler_registry.json`
- `scripts/validate-content.mjs`
- `apps/pc-client/src/content/contentData.ts`
- 可能涉及 `apps/pc-client/src/content` 现有类型或导出文件

### 前置依赖

无。该任务是任务系统实现的第一步。

### 开发说明

任务内容必须采用 `quests.v1`，固定表达任务、子任务、待办事项三层结构。每个任务必须有 `category`、`initial_node_id` 和 `nodes`；`nodes` 只作为隐藏描述节点，不作为 UI 第四层展示。新增少量 MVP 示例任务，优先服务后续事件推进闭环。`handler_registry.json` 中新增 `quest_progress` effect handler，使用现有合法 target 类型作为占位；实现说明中必须明确任务状态不保存在 `world_flags`。`validate-content` 需要校验 quest/subquest/todo ID 唯一性、`initial_node_id` 引用、navigation 中的 crew/tile 引用，以及基础结构合法性。

### 验收标准

- [ ] `content/quests/quests.json` 存在，并通过 `quests.v1` schema 校验。
- [ ] 任务内容只包含静态定义，不包含 `status`、`updated_at`、`completed_at` 等 runtime 字段。
- [ ] `nodes` 与 `current_node_id` 的设计被保留为隐藏技术层，UI 层不需要展示节点列表。
- [ ] `quest_progress` 已加入 handler registry，且不会被描述为一等 `update_quest` effect。
- [ ] `validate-content` 能发现重复 quest/subquest/todo ID 和无效 `initial_node_id`。
- [ ] `validate-content` 能发现 navigation 中不存在的 `crew_id` 或 `tile_id`。
- [ ] `contentData.ts` 能导出任务定义，后续代码无需在 UI 或事件代码中硬编码任务文案。

### 建议验证命令

```bash
npm run validate:content
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint
```

## T2: 实现 `questSystem.ts` 纯领域逻辑与单元测试

### 任务目标

实现任务系统的纯逻辑模块，负责初始状态创建、存档状态 normalize、显式任务推进、幂等处理、筛选与 UI view model 生成。该任务不修改 `GameState` 保存流程，不接入事件 handler，不写 React UI。

### 范围/涉及文件

- `apps/pc-client/src/questSystem.ts`
- `apps/pc-client/src/questSystem.test.ts`
- `apps/pc-client/src/data/gameData.ts` 或现有共享类型文件
- 可能涉及 `apps/pc-client/src/content/contentData.ts` 的类型导出

### 前置依赖

依赖 T1。需要可加载的 quest definitions 和稳定的静态内容契约。

### 开发说明

新增 `QuestRuntimeState`、`QuestProgress`、`SubquestProgress`、`TodoProgress`、`QuestSidebarView` 等类型。实现 `createInitialQuestState`、`normalizeQuestState`、`applyQuestProgress` 和 view model 构建函数。`applyQuestProgress` 只支持 `complete_quest`、`complete_subquest`、`complete_todo`、`set_quest_node`、`set_subquest_node`、`mark_updated`。完成子项不得自动完成父项；重复完成不得刷新 `completed_at`；重复设置同一 node 不得刷新 `updated_at`，除非显式 `mark_updated`。筛选只影响 view model，不修改 runtime state。

### 验收标准

- [ ] 新任务状态默认全部为 `incomplete`。
- [ ] `normalizeQuestState` 能补齐新增任务、子任务、待办事项，并回退无效 `current_node_id` 到 `initial_node_id`。
- [ ] `complete_todo` 只完成待办事项，不自动完成子任务或任务。
- [ ] `complete_subquest` 只完成子任务，不自动完成任务。
- [ ] `complete_quest` 只完成任务本体。
- [ ] 重复完成同一条目保持幂等，不刷新 `completed_at`。
- [ ] `set_quest_node` 与 `set_subquest_node` 能切换当前描述节点，并拒绝不存在的 node。
- [ ] view model 支持全部/未完成/已完成和全部/主要/次要筛选。
- [ ] `updated_quest_ids` 只用于最近更新提示，不参与事件或任务规则判定。

### 建议验证命令

```bash
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test -- questSystem
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint
```

## T3: 接入 `GameState.quest_state`、初始状态与存档恢复

### 任务目标

把任务 runtime state 接入 PC 权威 `GameState`，让新游戏创建任务状态，让存档恢复时恢复或 normalize 任务状态。该任务不实现 UI，也不接入事件推进。

### 范围/涉及文件

- `apps/pc-client/src/data/gameData.ts`
- `apps/pc-client/src/App.tsx`
- 现有 save/load 兼容性检查相关文件
- `apps/pc-client/src/*test.ts` 中覆盖 `GameState` 初始化和存档恢复的测试

### 前置依赖

依赖 T2。需要 `createInitialQuestState` 与 `normalizeQuestState` 可用。

### 开发说明

在 `GameState` 中新增 `quest_state: QuestRuntimeState`。新游戏初始化调用 `createInitialQuestState(questDefinitions, 0)`。存档恢复时调用 `normalizeQuestState(saved.quest_state, questDefinitions, saved.elapsedGameSeconds)`。本轮允许研发期旧存档失效，因此 `isCompatibleGameSaveState` 可以要求 `quest_state` 存在并结构基本合法。不得把侧边栏折叠、筛选、选中任务、滚动位置或 navigation hint 写入存档。

### 验收标准

- [ ] 新建游戏时 `GameState.quest_state` 存在，并包含当前任务定义的初始状态。
- [ ] 存档恢复后已完成任务、子任务、待办事项不会回退。
- [ ] 当前定义新增任务时，normalize 能为缺失任务补初始 runtime state。
- [ ] 无效或缺失 `current_node_id` 会回退到对应 definition 的 `initial_node_id`。
- [ ] 旧存档无 `quest_state` 时按已确认研发策略判定不兼容或重建新游戏，不实现迁移器。
- [ ] 侧边栏 UI 状态、筛选条件、选中任务和 navigation hint 不进入 `GameState` 或 localStorage save payload。

### 建议验证命令

```bash
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint
```

## T4: 实现 `handler_effect: quest_progress` 运行时推进

### 任务目标

让结构化事件通过 `handler_effect` 的 `quest_progress` handler 显式推进 `GameState.quest_state`。该任务只做 handler 和事件系统集成，不改任务 UI。

### 范围/涉及文件

- `apps/pc-client/src/eventSystem.ts` 或现有 effect handler 实现文件
- `apps/pc-client/src/*effects*.test.ts` 或新增 quest handler 测试
- `apps/pc-client/src/questSystem.ts`
- `scripts/validate-content.mjs`
- `content/events/handler_registry.json`

### 前置依赖

依赖 T1、T2、T3。需要任务定义、runtime state 和 GameState 集成可用。

### 开发说明

复用现有 `handler_effect` 机制，新增 `handler_type: "quest_progress"`，不得新增一等 `update_quest` effect。handler params 使用 `operation`、`quest_id`、`subquest_id`、`todo_id`、`node_id`。handler 需调用 `applyQuestProgress` 并把错误转为 effect error，遵守现有 `failure_policy`。`target: { "type": "world_flags" }` 仅作为现有 handler_effect 结构占位，不代表任务状态写入 world flags。扩展 `validate-content`，对事件内容中的 `quest_progress` payload 做 operation 必填字段和 quest/subquest/todo/node 跨引用校验。

### 验收标准

- [ ] `handler_effect` + `handler_type: "quest_progress"` 能更新 `GameState.quest_state`。
- [ ] 无效 `operation`、`quest_id`、`subquest_id`、`todo_id`、`node_id` 会返回 effect error。
- [ ] 缺少 operation 必填字段会返回 effect error。
- [ ] `failure_policy: "fail_event"` 下，任务推进错误会中止对应 effect group。
- [ ] handler 不直接修改 `crew_actions`、`objectives`、`event_logs` 或 `world_flags`，除非事件另有独立 effect。
- [ ] `validate-content` 能发现事件内容中的无效 `quest_progress` 引用和缺失字段。
- [ ] 代码中不存在新增一等 `update_quest` effect 类型。

### 建议验证命令

```bash
npm run validate:content
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test -- effects
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint
```

## T5: 接入一条最小可测事件任务闭环

### 任务目标

选择一条现有稳定事件链，加入最小 `quest_progress` 内容，使玩家通过既有通话或事件选项推进一个待办事项，并能在后续 UI 任务中观察状态变化。

### 范围/涉及文件

- `content/events/definitions/*.json`
- `content/events/call_templates/*.json` 或相关事件内容文件
- `content/quests/quests.json`
- `scripts/validate-content.mjs` 测试覆盖或 fixture
- 可能涉及现有内容测试

### 前置依赖

依赖 T4。需要 `quest_progress` handler 和内容校验已经可用。

### 开发说明

选择一个现有、短路径、可在测试中稳定触发的事件闭环。事件推进必须使用 `handler_effect` 与 `handler_type: "quest_progress"`，建议先完成一个 todo，再按需要设置任务或子任务的 `current_node_id`。父任务和子任务不得因待办事项完成而自动完成；如需要完成父项，必须增加独立显式 payload。内容文案应避免复制大段事件对白，只写行动目标、当前事实和下一步提示。

### 验收标准

- [ ] 至少一条现有事件链能显式触发 `quest_progress`。
- [ ] 该事件链完成后，相关待办事项状态变为 `completed`。
- [ ] 父子任务状态只在收到显式 payload 时改变。
- [ ] 事件内容通过 `validate-content` 的 quest 引用校验。
- [ ] 新增任务文案集中在 `content/quests/quests.json`，没有散落到 UI 代码。
- [ ] 事件推进不会创建移动、调查、通话接通或其他非事件本身已有的 gameplay action。

### 建议验证命令

```bash
npm run validate:content
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test
```

## T6: 实现 `QuestSidebar` 展示组件与组件测试

### 任务目标

实现 PC 任务侧边栏组件，展示折叠摘要、任务列表、任务详情、筛选控件、三层任务结构和导航按钮。该任务只实现可复用组件，不把侧边栏接入所有页面。

### 范围/涉及文件

- `apps/pc-client/src/components/QuestSidebar.tsx`
- `apps/pc-client/src/components/QuestSidebar.test.tsx`
- `apps/pc-client/src/components/Layout.tsx` 或现有布局原子
- 相关 CSS 文件

### 前置依赖

依赖 T2。需要稳定的 `QuestSidebarView` 或等价 view model。

### 开发说明

组件必须以 view model 为输入，不直接遍历 raw `quest_state`。展开态显示全部/未完成/已完成筛选、全部/主要/次要筛选、任务列表和详情。折叠态显示未完成任务数、未完成主要任务数和最近更新任务标题。任务详情只展示任务、子任务、待办事项三层结构；不得展示 handler payload、debug ID 或 `nodes` 列表。导航按钮只调用 `onNavigate`，不得直接执行页面跳转、移动、调查、通话或事件选择。已完成待办应有明确完成样式，不再作为当前行动建议突出显示。

### 验收标准

- [ ] 折叠态显示未完成任务数、未完成主要任务数和最近更新摘要。
- [ ] 展开态显示任务列表、任务详情、状态筛选和主/次筛选。
- [ ] 任务详情只展示任务、子任务、待办事项三层，不展示 `nodes` 技术层。
- [ ] 完成状态筛选和主/次筛选只改变展示，不触发状态修改回调。
- [ ] 已完成待办显示完成样式。
- [ ] 导航按钮只调用 `onNavigate`，不执行任何 gameplay action。
- [ ] 空任务和筛选后为空都有明确文案。
- [ ] 缺少当前节点描述时显示兜底文案，不让组件崩溃。

### 建议验证命令

```bash
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test -- QuestSidebar
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint
```

## T7: 在 PC 主要页面接入常驻任务侧边栏布局

### 任务目标

把 `QuestSidebar` 常驻接入控制中心、通讯台、通话页和地图页，并由 `App.tsx` 管理 UI-only 的折叠、筛选和选中状态。该任务不实现 crew/tile 高亮导航细节。

### 范围/涉及文件

- `apps/pc-client/src/App.tsx`
- `apps/pc-client/src/components/QuestSidebar.tsx`
- `apps/pc-client/src/pages/ControlCenter.tsx`
- `apps/pc-client/src/pages/CommunicationStation.tsx`
- `apps/pc-client/src/pages/CallPage.tsx`
- `apps/pc-client/src/pages/MapPage.tsx`
- 相关 CSS 和 App 集成测试

### 前置依赖

依赖 T3 和 T6。需要 `GameState.quest_state` 已接入存档，且 `QuestSidebar` 可用。

### 开发说明

在 `App.tsx` 或相邻组件中新增统一 `QuestLayout`。控制中心、通讯台、通话页和地图页必须包裹该布局；Ending 页可不显示。`App.tsx` 根据 `quest_state` 和 `questDefinitions` 生成 view model，并管理侧边栏折叠、筛选、选中任务等 UI-only 状态。刷新页面后 UI 状态可回到默认，任务进度必须来自存档恢复。布局应遵循现有低保真控制台风格，地图页和通话页必须保留核心操作空间，并提供手动折叠。

### 验收标准

- [ ] 控制中心、通讯台、通话页和地图页显示常驻任务侧边栏。
- [ ] 玩家可手动折叠和展开侧边栏。
- [ ] 侧边栏筛选和选中任务由 React UI state 管理，不写入 `GameState`。
- [ ] 刷新后任务进度保留，侧边栏 UI 状态可回到默认。
- [ ] 地图页侧边栏不会永久遮挡地图核心操作，玩家可折叠释放空间。
- [ ] 通话页侧边栏不会遮挡通话选项或结束通话入口。
- [ ] Ending 页不被任务 UI 干扰。

### 建议验证命令

```bash
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint
```

## T8: 实现任务导航入口与禁止自动行动的集成测试

### 任务目标

实现任务导航入口的 App 集成，让 `page`、`tile`、`crew` 导航只改变页面或选中上下文，不自动接通队员、不创建移动或调查行动、不选择事件选项。

### 范围/涉及文件

- `apps/pc-client/src/App.tsx`
- `apps/pc-client/src/pages/CommunicationStation.tsx`
- `apps/pc-client/src/pages/MapPage.tsx`
- `apps/pc-client/src/components/QuestSidebar.tsx`
- App 集成测试或页面测试

### 前置依赖

依赖 T7。需要侧边栏已在主要页面常驻显示。

### 开发说明

新增 UI-only `questNavigationHint` 或等价状态。`page: "control"`、`page: "station"`、`page: "map"` 只切换页面。`tile` 导航切换到地图页，并尽可能选中或提示对应地块；不创建移动行动。`crew` 导航切换到通讯台，并高亮或提示对应队员；不得调用 `onStartCall`，不得进入通话页。若高亮动画成本过高，MVP 可只跳转页面并显示顶部提示，但必须保持“不执行行动”的边界。

### 验收标准

- [ ] `page` 导航只切换到目标页面。
- [ ] `tile` 导航进入地图页，并不创建 `crew_actions` 或移动路线。
- [ ] `crew` 导航进入通讯台，并不自动接通队员或进入通话页。
- [ ] 导航不会执行调查、通话选项、事件选择或任务完成。
- [ ] 无效导航目标会禁用按钮或显示不可用提示，不执行任何行动。
- [ ] `questNavigationHint` 或等价状态不进入 `GameState` 或存档。
- [ ] 测试能证明 crew 导航不调用 `onStartCall`。

### 建议验证命令

```bash
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint
```

## T9: 补齐端到端验收、视觉回归检查与最终验证

### 任务目标

补齐任务系统 MVP 的端到端覆盖，验证从进入页面、查看侧边栏、筛选、事件推进、存档恢复到导航不自动行动的完整闭环。该任务不新增产品范围，只补测试、修正小型集成缺口和记录验证结果。

### 范围/涉及文件

- `apps/pc-client/tests/e2e/app.spec.ts`
- `apps/pc-client/src` 中为通过测试所需的小型修正
- 可能涉及测试 fixture 或测试辅助函数
- 计划目录中的实现记录或最终说明，不改本 `tasks.md` 的任务边界

### 前置依赖

依赖 T8。需要内容、运行时、handler、UI、导航均已完成。

### 开发说明

新增或扩展 Playwright e2e。覆盖玩家进入控制中心看到侧边栏、折叠/展开、切换筛选、通过现有事件链触发 `quest_progress`、刷新后完成状态仍保留、crew 导航不自动进入通话页、tile 导航不创建行动。若 e2e 暴露布局遮挡问题，可做最小 CSS 修正。若本地 Playwright 浏览器环境阻塞，必须记录阻塞原因和已执行的替代验证。

### 验收标准

- [ ] e2e 覆盖控制中心显示任务侧边栏。
- [ ] e2e 覆盖侧边栏折叠和展开。
- [ ] e2e 覆盖完成状态筛选和主/次筛选。
- [ ] e2e 覆盖事件推进后待办事项完成。
- [ ] e2e 覆盖刷新后任务完成状态保留。
- [ ] e2e 覆盖 crew 导航不自动进入通话页。
- [ ] e2e 覆盖 tile 导航不创建移动行动。
- [ ] 手动或自动视觉检查覆盖控制中心、通讯台、通话页和地图页，确认侧边栏不阻挡核心操作。
- [ ] 完整验证命令通过，或最终说明记录环境阻塞原因。

### 建议验证命令

```bash
npm run validate:content
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test
cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test:e2e
```
