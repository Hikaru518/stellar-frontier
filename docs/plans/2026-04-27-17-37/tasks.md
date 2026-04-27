# 可配置地图系统开发任务拆分

---
topic: configurable-map-system
date: 2026-04-27
status: draft
source: docs/plans/2026-04-27-17-37/technical-design.md
---

## 任务 1：新增地图内容数据、Schema 与内容校验

- 编号：T1
- 依赖关系：无
- 任务描述：新增默认 `8 x 8` 地图内容配置、地图 JSON Schema，并把地图内容接入 `npm run validate:content`。本任务只处理内容层与校验层，不改运行时 `GameState` 与 UI。
- 涉及文件：`content/maps/default-map.json`、`content/schemas/maps.schema.json`、`scripts/validate-content.mjs`、必要时 `package.json` 中已有 validate 命令引用的相关文件
- 明确 AC：
  - `content/maps/default-map.json` 存在，默认地图为 `8 x 8`，包含 `id`、`name`、`version`、`size`、`originTileId`、`initialDiscoveredTileIds`、完整 `tiles`。
  - 所有 tile 使用内部 `row-col` id，`row` / `col` 与 id 一致，覆盖 `1..8`、`1..8` 全部 64 格。
  - 地图配置包含区域名、地形、天气、环境属性、对象、特殊状态的 MVP 字段；对象支持 `legacyResource` / `legacyBuilding` / `legacyInstrument`；特殊状态支持 `legacyDanger`。
  - `content/schemas/maps.schema.json` 能校验地图结构、字段类型、基础枚举和必填项。
  - `scripts/validate-content.mjs` 校验 maps schema，并执行地图专属跨字段检查：origin 存在、初始发现包含 origin、tile 覆盖完整、tile 坐标合法、对象 id 地图内唯一、单 tile 内特殊状态 id 唯一。
  - 默认地图不是 `8 x 8`、origin 缺失、tile id 与坐标不一致、初始发现不包含 origin 时，校验会失败并输出可读错误。
  - 不修改 `src/` 运行时代码。
  - 本任务完成并验收后，主 agent 执行一次独立 commit。
- 建议验证命令：`npm run validate:content`

## 任务 2：导出地图内容并实现 `mapSystem` 纯函数

- 编号：T2
- 依赖关系：依赖 T1
- 任务描述：在内容入口导出默认地图配置和类型，新建地图系统纯函数模块，集中处理 tile id、玩家显示坐标、区域地点文案、可见范围、移动目标合法性和 legacy tile 派生。本任务不接 UI，不改调查流程。
- 涉及文件：`src/content/contentData.ts`、`src/mapSystem.ts`、`src/data/gameData.ts` 类型引用处、`src/App.test.tsx` 或新增/既有单元测试文件
- 明确 AC：
  - `src/content/contentData.ts` import 并导出 `default-map.json`，提供可复用 TypeScript 类型或类型推导。
  - 新增 `src/mapSystem.ts`，至少提供 `getTileId`、`parseTileId`、`getDisplayCoord`、`getTileAreaName`、`getTileLocationLabel`、`getVisibleTileWindow`、`deriveLegacyTiles`、`canMoveToTile`。
  - `getDisplayCoord` 使用公式 `displayX = tile.col - origin.col`、`displayY = origin.row - tile.row`，origin 显示为 `(0,0)`。
  - `getVisibleTileWindow` 按已发现格的 8 邻域计算 frontier，并输出外接矩形内 cell，区分 `discovered`、`frontier`、`unknownHole`。
  - `canMoveToTile` 对已发现和 frontier 返回 true，对 unknownHole、地图外、未知 id 返回 false。
  - `deriveLegacyTiles` 从地图配置和 runtime map state 派生旧 `MapTile` 字段，保留 `terrain/resources/buildings/instruments/danger/status/investigated` 兼容能力。
  - `getTileLocationLabel` 优先返回区域名和玩家坐标，不使用 `resources[0]` 作为地点名。
  - 单元测试覆盖显示坐标、可见窗口、边界不越界、unknownHole、移动合法性和 legacy 字段派生。
  - 本任务完成并验收后，主 agent 执行一次独立 commit。
- 建议验证命令：`npm run test -- mapSystem`、`npm run lint`

## 任务 3：接入 `GameState.map`、初始化与旧存档 reset

- 编号：T3
- 依赖关系：依赖 T1、T2
- 任务描述：把新地图运行时状态接入 `GameState`，让初始游戏从地图配置生成 runtime map state，并采用新 save key 或 `saveVersion: 2` 丢弃旧固定 `4 x 4` 存档。本任务保持 UI 可先使用兼容层，不做完整页面改版。
- 涉及文件：`src/data/gameData.ts`、`src/timeSystem.ts`、`src/App.tsx`、`src/crewSystem.ts`、`src/eventSystem.ts`、`src/App.test.tsx`
- 明确 AC：
  - `GameState` 新增 `map` 字段，包含 `configId`、`configVersion`、`rows`、`cols`、`originTileId`、`tilesById`、`discoveredTileIds`、`investigationReportsById`。
  - 初始状态从 `default-map.json` 生成 runtime map state，`originTileId` 和 `initialDiscoveredTileIds` 正确写入 discovered / runtime tile。
  - 地图事实源为 `GameState.map`；如保留 `GameState.tiles`，必须由 helper 派生或集中同步，并在代码注释中标明兼容用途。
  - 队员初始位置、移动目标和地块队员同步不再依赖固定 `4 x 4` 边界。
  - 移动抵达 frontier 未探索格时，该目标格会标记为 discovered，并可触发现有抵达事件检查。
  - 事件系统在结算前能使用 `deriveLegacyTiles` 或等价兼容层，现有事件条件仍可读取旧式 tile 字段。
  - 存档策略采用 `stellar-frontier-save-v2` 或 `saveVersion: 2`；存在旧 `stellar-frontier-save-v1` 时不会加载旧 `4 x 4` 状态。
  - Debug toolbox 重置入口会清理当前有效存档 key。
  - 测试覆盖新初始地图状态、旧 v1 存档不污染新游戏、移动发现 frontier、事件兼容不崩溃。
  - 本任务完成并验收后，主 agent 执行一次独立 commit。
- 建议验证命令：`npm run validate:content`、`npm run test -- App`、`npm run lint`

## 任务 4：改造地图 UI 为动态可见矩形

- 编号：T4
- 依赖关系：依赖 T2、T3
- 任务描述：改造地图页面，使用 `GameState.map` 和 `getVisibleTileWindow` 渲染局部探索矩阵，移除所有固定 `4 x 4` 文案与布局假设。本任务不提供地图页直接下令。
- 涉及文件：`src/pages/MapPage.tsx`、`src/styles.css`、`src/App.test.tsx`、必要时 `tests/e2e/app.spec.ts`
- 明确 AC：
  - 地图页文案不再出现写死 `4x4` / `4 x 4`，改为“雷达可见区域”或“局部探索矩阵”等语义。
  - CSS grid 列数根据可见外接矩形动态设置，不再使用 `repeat(4)`。
  - 已发现格显示区域名、玩家显示坐标、地形、天气、队员标记、已揭示对象 / 特殊状态摘要。
  - frontier 和 unknownHole 均显示“未探索信号”，不得泄露真实区域名、地形、天气、对象或特殊状态。
  - 选择未知格时详情面板显示“信号未确认”，并提示需通过通讯台联系队员前往 / 调查。
  - 地图页没有移动按钮、确认按钮或直接行动菜单；如展示行动提示，必须指向通讯台。
  - 页面 `aria-label` 不再写死 `4x4`，应包含可见矩形或玩家显示坐标语义。
  - 移动端布局不横向溢出，保持低保真控制台风格。
  - 组件测试覆盖无 `4x4` 文案、动态 grid、已发现格展示、未探索格不泄露真实信息。
  - 本任务完成并验收后，主 agent 执行一次独立 commit。
- 建议验证命令：`npm run test -- App`、`npm run lint`

## 任务 5：更新通讯台、通话页与队员位置文案

- 编号：T5
- 依赖关系：依赖 T2、T3、T4
- 任务描述：统一队员位置显示语义，通讯台和队员详情优先显示区域名与玩家坐标；通话移动目标列表允许选择已发现格和 frontier 未探索格，但不泄露未知格真实信息。
- 涉及文件：`src/pages/CommunicationStation.tsx`、`src/pages/CallPage.tsx`、`src/pages/CrewDetail.tsx`、`src/crewSystem.ts`、`src/App.tsx`、`src/App.test.tsx`
- 明确 AC：
  - 通讯台队员卡片使用 `getTileLocationLabel` 或等价 helper 显示地点，优先区域名和玩家坐标。
  - 队员详情若显示当前位置，同样使用区域名和玩家坐标，不显示内部 row/col。
  - 所有队员位置文案不再使用 `tile.resources[0] ?? tile.terrain` 作为地点名。
  - 通话页移动目标列表包含已发现格和 frontier 未探索格。
  - 已发现目标显示区域名、玩家坐标和必要的地形摘要。
  - frontier 目标显示“未探索信号（x,y）”，不显示真实区域名、地形、天气、对象或特殊状态。
  - 移动确认仍走现有通话 choice 流程，不新增地图页或通话外的直接下令入口。
  - 组件测试覆盖通讯台位置不显示资源名、通话页可选择 frontier、未知目标不泄露真实信息。
  - 本任务完成并验收后，主 agent 执行一次独立 commit。
- 建议验证命令：`npm run test -- App`、`npm run lint`

## 任务 6：实现结构化调查报告与日志弹窗

- 编号：T6
- 依赖关系：依赖 T2、T3、T5
- 任务描述：改造调查完成流程，生成环境属性调查报告，揭示 `onInvestigated` 对象 / 特殊状态，并在系统日志中提供“查看报告”按钮和只读弹窗。本任务只做报告与日志 UI，不扩展事件语义。
- 涉及文件：`src/data/gameData.ts`、`src/App.tsx`、`src/crewSystem.ts`、`src/pages/ControlCenter.tsx`、`src/components/Layout.tsx`、`src/pages/CallPage.tsx`、`src/App.test.tsx`、必要时 `src/styles.css`
- 明确 AC：
  - 新增或扩展 `InvestigationReport` 类型，字段包含报告 id、tileId、crewId、创建游戏时间、区域名、玩家坐标、地形、天气、环境属性、本次揭示对象、本次揭示特殊状态。
  - 调查完成时标记 runtime tile `investigated = true`。
  - 调查完成时将 `visibility = onInvestigated` 的对象加入 `revealedObjectIds`。
  - 调查完成时将 active 且 `visibility = onInvestigated` 的特殊状态加入 `revealedSpecialStateIds`。
  - 调查完成时把结构化报告写入 `GameState.map.investigationReportsById`，并记录到 tile 的 `lastInvestigationReportId`。
  - 系统日志保留简短摘要，并能关联 `reportId`；若日志结构迁移影响过大，可采用最小兼容结构，但必须支持按钮渲染。
  - 控制中心或系统日志区域中，带 `reportId` 的日志项显示“查看报告”按钮。
  - 点击按钮打开复用 `Modal` 的报告弹窗，展示队员、时间、区域、坐标、地形、天气、温度、湿度、磁场、辐射、毒性、气压、揭示对象和特殊状态。
  - 没有新揭示对象时显示“未确认新的地块对象”。
  - 调查完成后仍保持现有 `investigation_complete` 事件触发逻辑。
  - 测试覆盖报告生成、对象 / 状态揭示、日志按钮、弹窗内容。
  - 本任务完成并验收后，主 agent 执行一次独立 commit。
- 建议验证命令：`npm run test -- App`、`npm run lint`

## 任务 7：补齐回归测试、E2E 与最终验证

- 编号：T7
- 依赖关系：依赖 T1、T2、T3、T4、T5、T6
- 任务描述：补齐内容校验、单元、组件和 E2E 覆盖，执行最终回归命令，修复前序任务遗漏的测试与类型问题。本任务不应引入新功能，只做测试、修复和最终验收。
- 涉及文件：`src/App.test.tsx`、`tests/e2e/app.spec.ts`、必要时新增测试文件、前序任务涉及文件中的小修复
- 明确 AC：
  - 内容校验覆盖 maps：schema 成功路径和关键失败路径至少在 `validate-content` 实现中可被错误信息明确区分。
  - 单元测试覆盖 `getDisplayCoord`、`getVisibleTileWindow`、`canMoveToTile`、`deriveLegacyTiles`、调查报告生成。
  - 组件测试覆盖地图页动态可见矩形、无 `4x4` 文案、未探索格不泄露真实信息、通讯台区域名位置、报告按钮与弹窗。
  - E2E 覆盖新游戏地图只显示坠毁点及外围可见范围，不暴露完整 `8 x 8`。
  - E2E 覆盖通过通讯台选择 frontier 未探索格移动，抵达后该格变为 discovered，地图可见范围扩张。
  - E2E 覆盖调查后日志出现报告按钮，弹窗显示环境属性。
  - E2E 或组件测试覆盖旧 v1 存档存在时不会加载旧 `4 x 4` 状态。
  - `npm run validate:content`、`npm run lint`、`npm run test` 全部通过。
  - 如项目 e2e 命令可用，`npm run test:e2e` 通过；若命令不存在或环境缺失，需在验收说明中记录原因。
  - 确认没有修改本任务范围外的设计文档或无关源码。
  - 本任务完成并验收后，主 agent 执行一次独立 commit。
- 建议验证命令：`npm run validate:content`、`npm run lint`、`npm run test`、`npm run test:e2e`
