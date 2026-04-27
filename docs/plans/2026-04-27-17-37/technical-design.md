# 可配置地图系统技术设计

---
topic: configurable-map-system
date: 2026-04-27
status: draft
source:
  design: docs/plans/2026-04-27-17-37/configurable-map-system-design.md
  research: docs/plans/2026-04-27-17-37/research.md
---

## 1. 目标与非目标

### 1.1 目标

- 将地图从代码内固定 `4 x 4`、硬编码 `initialTiles` 迁移为内容数据驱动，默认地图为 `8 x 8`。
- 新增 `content/maps/default-map.json`，并新增 `content/schemas/maps.schema.json` 或等价 schema，接入 `npm run validate:content`。
- 保持内部 tile id 为现有 `row-col` 格式，降低 `crewSystem.ts`、`eventSystem.ts`、测试和旧 UI 的迁移成本。
- 玩家可见坐标由内部 `row-col` 派生，以坠毁点 / 初始点为原点 `(0,0)`，允许显示负数坐标，避免通过坐标范围暴露完整地图尺寸。
- 在 `GameState` 中新增 `map` runtime state，逐步淘汰当前直接暴露的 `tiles` 兼容视图。
- 实现地图可见范围：已发现地块 + 外围一圈未探索合法地块，并渲染两者外接矩形；外接矩形内未发现且不在外围一圈内的空洞统一显示为“未探索信号”。
- 外围未探索格允许作为移动目标，但仍必须通过“通讯台 → 通话”确认，不在地图页直接下令。
- 建立地块分层模型：区域名、地形、天气、特殊状态、环境属性、地块对象。
- 修正队员位置显示语义：位置摘要优先显示区域名，不再使用 `tile.resources[0] ?? tile.terrain` 作为地点名。
- 环境属性调查报告本轮实现为结构化报告，并在日志中提供按钮弹窗查看报告详情。
- 对旧事件系统做最小兼容，让现有事件仍能依赖旧 `terrain/resources/danger` 条件运行。
- 明确旧 `stellar-frontier-save-v1` 固定 `4 x 4` 存档 reset 策略，使用新 save key 或 `saveVersion` 防止旧数据污染新地图状态。

### 1.2 非目标

- 本轮不重构事件系统语义，不让天气、特殊状态、环境属性、地块对象全面参与事件触发、概率修正或事件分支。
- 本轮不实现对象级通话二级菜单，例如“矿床 → 采矿 / 勘测 / 使用道具调查”。
- 本轮不实现地图页直接下令、地图页路径规划确认或地图页行动菜单。
- 本轮不实现随机地图生成、地图编辑器、程序化区域生成。
- 本轮不实现天气变化模拟、气候系统、特殊状态自动生成或复杂持续时间 UI。
- 本轮不保留旧 `4 x 4` 存档的无损迁移；旧存档统一 reset 或进入新 save key。

## 2. 当前实现发现

- `src/data/gameData.ts` 中 `initialTiles` 硬编码 16 个地块，固定 `4 x 4`，同时把地形、资源、建筑、仪器、危险、状态混合在 `MapTile` 内。
- `MapPage.tsx` 的页面文案、`aria-label`、CSS grid `repeat(4)` 均写死 `4 x 4`，无法适配配置尺寸或局部可见矩形。
- 当前 tile id 为 `row-col`，`coord` 为 `(row,col)` 且从 1 开始；该内部结构可保留，但玩家坐标需要从 origin 派生。
- `getTileLocation(tile)` 使用 `tile.resources[0] ?? tile.terrain`，导致“木材”等资源名被显示为位置，需要改为区域名优先。
- `MapTile` 当前包含 `terrain/resources/buildings/instruments/danger/status/investigated`，模型边界混乱；技术迁移应保留旧兼容字段的派生能力，但新增清晰地图模型。
- `crewSystem.ts` 使用 row/col 曼哈顿邻接，移动耗时依赖中文地形字符串；本轮可继续复用，但需要从地图配置读取合法范围与地形。
- `eventSystem.ts` 通过 tile `terrain/resources/danger` 判断条件；本轮不重构事件语义，需要从新地图 state 派生旧兼容 tile。
- `timeSystem.ts` 使用 `stellar-frontier-save-v1`；新地图结构与旧 `4 x 4` 存档不兼容，需要 reset/new save key 或 `saveVersion`。
- `scripts/validate-content.mjs` 目前只校验 crew/events/items；新增地图内容后必须纳入 schema 校验与跨文件基础校验。
- 测试中引用旧 `tiles` 和 `4 x 4` 假设，需要更新为默认 `8 x 8`、局部可见范围、区域名显示和新存档策略。

## 3. 总体架构

### 3.1 数据流

1. `content/maps/default-map.json` 定义默认地图：尺寸、origin、tiles、区域名、地形、天气、特殊状态、环境属性、地块对象。
2. `content/schemas/maps.schema.json` 校验地图 JSON 的结构、必填字段、枚举 / ID 格式和尺寸边界。
3. `scripts/validate-content.mjs` 增加地图 schema 校验，并执行地图专属跨字段检查。
4. `src/content/contentData.ts` import 并导出默认地图内容、TypeScript 类型与查询 helper。
5. `src/data/gameData.ts` 使用地图内容生成 `initialGameState.map`，并提供 `tiles` 兼容视图或初始化兼容字段。
6. `src/App.tsx`、`crewSystem.ts`、`eventSystem.ts`、`MapPage.tsx` 改为优先读取 `GameState.map`。
7. `timeSystem.ts` 使用新 save key 或 `saveVersion`，遇到旧 save 自动丢弃并创建新初始状态。

### 3.2 模块边界

- `content/maps/default-map.json`：静态设计数据，不保存玩家发现进度、调查结果、对象揭示状态或状态剩余时间。
- `GameState.map`：运行时地图状态，保存发现状态、对象揭示、状态揭示、调查报告索引等随游玩变化的数据。
- `GameState.tiles`：过渡期兼容视图，用于旧事件和少量旧组件；不作为长期事实源。
- `crewSystem.ts`：负责移动合法性、路径推进、地块队员同步；读取地图尺寸和地形耗时。
- `eventSystem.ts`：本轮通过兼容 tile 继续工作，不直接理解新地图对象 / 天气 / 环境属性。
- `MapPage.tsx`：只读展示，根据可见范围算法渲染动态矩形，不直接发行动。
- 日志 / 调查报告 UI：系统日志中保留简短文本，报告详情用结构化 payload + 弹窗展示。

### 3.3 建议新增 helper

为避免把坐标和可见范围逻辑散落到页面，可新增或集中以下纯函数。函数位置可在 `src/data/gameData.ts`、新建 `src/mapSystem.ts`，或按现有文件组织决定；推荐新建 `src/mapSystem.ts`，让 `crewSystem.ts`、`MapPage.tsx`、`eventSystem.ts` 共享。

- `getTileId(row: number, col: number): string`：返回内部 id `${row}-${col}`。
- `parseTileId(tileId: string): { row: number; col: number }`：解析内部 id。
- `getDisplayCoord(tileId, mapConfig): { x: number; y: number }`：以 origin 派生玩家坐标。
- `getTileAreaName(tileId, state): string`：返回区域名 fallback，未配置时为“野外”或“未知区域”。
- `getTileLocationLabel(tileId, state): string`：队员摘要使用的地点文案，优先区域名。
- `getVisibleTileWindow(mapState): VisibleTileCell[]`：计算地图页需要渲染的外接矩形及每格显示状态。
- `deriveLegacyTiles(mapState): MapTile[]`：从新地图模型派生旧事件 / 旧测试兼容 tile。
- `canMoveToTile(tileId, mapState): boolean`：已发现和外围未探索合法格均可作为移动目标。

## 4. 内容数据与 Schema 设计

### 4.1 新增文件

- 新增 `content/maps/default-map.json`。
- 新增 `content/schemas/maps.schema.json` 或在同等 schema 体系中新增地图 schema。
- 修改 `scripts/validate-content.mjs`，把 maps schema 纳入 `npm run validate:content`。
- 修改 `src/content/contentData.ts`，导入 `default-map.json` 并导出类型 / 查询 helper。

### 4.2 默认地图内容结构

默认地图尺寸为 `8 x 8`。内部 row/col 建议继续从 `1` 开始，与当前 `row-col` id 兼容。origin 配置为坠毁点所在内部 tile，例如 `4-4` 或设计指定的实际坠毁格；该格玩家显示坐标为 `(0,0)`。

示例结构：

```json
{
  "id": "default-map",
  "name": "坠毁星球雷达图",
  "version": 1,
  "size": { "rows": 8, "cols": 8 },
  "originTileId": "4-4",
  "initialDiscoveredTileIds": ["4-4"],
  "tiles": [
    {
      "id": "4-4",
      "row": 4,
      "col": 4,
      "areaName": "坠毁区域",
      "terrain": "平原",
      "weather": "阴天",
      "environment": {
        "temperatureCelsius": 18,
        "humidityPercent": 42,
        "magneticFieldMicroTesla": 61,
        "radiationLevel": "low"
      },
      "objects": [
        {
          "id": "crash-site-wreckage",
          "kind": "structure",
          "name": "坠毁残骸",
          "visibility": "onDiscovered",
          "legacyResource": null,
          "legacyBuilding": "残骸"
        }
      ],
      "specialStates": []
    }
  ]
}
```

### 4.3 字段说明

- `id`：地图配置稳定 ID。
- `version`：地图内容版本，用于未来内容迁移；不等同于存档版本。
- `size.rows` / `size.cols`：地图边界。默认 `8` 和 `8`，所有合法性校验从这里读取。
- `originTileId`：坠毁点 / 玩家开始点。玩家显示坐标由此派生。
- `initialDiscoveredTileIds`：开局已发现地块，至少包含 `originTileId`。
- `tiles[].id`：内部 tile id，继续使用 `row-col`。
- `tiles[].row` / `tiles[].col`：内部坐标，从 `1` 开始；必须与 `id` 一致。
- `tiles[].areaName`：区域名。多个 tile 可使用同一区域名。缺失或空值时 UI fallback 为“野外”。
- `tiles[].terrain`：地形中文名，短期继续沿用当前 `crewSystem.ts` 地形耗时表需要的中文字符串。
- `tiles[].weather`：发现后显示的天气，本轮不参与事件结算。
- `tiles[].environment`：环境属性读数，本轮地图页不常驻显示，调查报告使用。
- `tiles[].objects`：地块对象列表，承载矿床、生物巢穴、遗迹、医疗舱、玩家设施等。
- `tiles[].specialStates`：特殊状态列表，承载湖泊沸腾、火山爆发、高威胁生物活动等异常。

### 4.4 地块对象 schema

地块对象建议字段：

- `id`：对象稳定 ID，地图内唯一。
- `kind`：对象类型，建议枚举 `resourceNode`、`structure`、`signal`、`hazard`、`facility`、`ruin`、`landmark`。
- `name`：玩家可见名称。
- `description`：详情描述，可选。
- `visibility`：`onDiscovered` 或 `onInvestigated`。
- `tags`：可选标签，供未来事件 / 行动条件使用。
- `legacyResource`：可选，供旧事件系统派生 `resources`。
- `legacyBuilding`：可选，供旧 UI / 旧事件派生 `buildings`。
- `legacyInstrument`：可选，供旧 UI 派生 `instruments`。
- `candidateActions`：可选，仅作为未来扩展声明，本轮不接通话菜单。

### 4.5 特殊状态 schema

特殊状态建议字段：

- `id`：状态稳定 ID。
- `name`：玩家可见名称。
- `description`：详情描述，可选。
- `visibility`：`onDiscovered`、`onInvestigated` 或 `hidden`。
- `severity`：`low`、`medium`、`high`、`critical`。
- `tags`：可选标签，供未来事件联动。
- `startsActive`：是否开局 active。
- `durationGameSeconds`：可选持续时间。本轮只保存 / 显示已知状态，不做复杂自动生成。
- `legacyDanger`：可选，供旧事件系统派生 `danger`。

### 4.6 环境属性 schema

环境属性本轮用于调查报告，建议保持结构化并允许后续扩展：

- `temperatureCelsius`：数字。
- `humidityPercent`：数字，范围 `0-100`。
- `magneticFieldMicroTesla`：数字。
- `radiationLevel`：`none`、`low`、`medium`、`high`、`critical`。
- `toxicityLevel`：可选枚举。
- `atmosphericPressureKpa`：可选数字。
- `notes`：可选设计备注或叙事短句。

### 4.7 validate-content 校验要求

`npm run validate:content` 需新增以下检查：

- `content/maps/default-map.json` 必须符合 `maps.schema.json`。
- `size.rows`、`size.cols` 为正整数，默认内容为 `8 x 8`。
- `originTileId` 必须存在于 `tiles`。
- `initialDiscoveredTileIds` 中所有 id 必须存在，且包含 `originTileId`。
- 每个 tile 的 `id` 必须等于 `${row}-${col}`。
- tile `row`、`col` 必须在 `1..rows`、`1..cols` 范围内。
- `tiles` 需覆盖默认地图所有 `8 x 8` 格，避免运行时出现未定义 tile；如果未来允许稀疏地图，需要另行设计 blocked / void 规则。
- 地块对象 `id` 在地图内唯一。
- 特殊状态 `id` 在单 tile 内唯一；如未来要全地图唯一可再收紧。
- `legacyResource`、`legacyBuilding`、`legacyInstrument` 如引用内容 ID，应校验对应内容存在；本轮若仍使用中文显示名，至少校验为字符串并记录后续内容 ID 化 TODO。

## 5. 运行时状态设计

### 5.1 GameState 新增 map

新增 `GameState.map` 作为地图事实源。建议结构：

```ts
type GameMapState = {
  configId: string;
  configVersion: number;
  rows: number;
  cols: number;
  originTileId: string;
  tilesById: Record<string, RuntimeTileState>;
  discoveredTileIds: string[];
  investigationReportsById: Record<string, InvestigationReport>;
};

type RuntimeTileState = {
  id: string;
  discovered: boolean;
  investigated: boolean;
  revealedObjectIds: string[];
  revealedSpecialStateIds: string[];
  activeSpecialStateIds: string[];
  specialStateExpiresAt?: Record<string, number>;
  lastInvestigationReportId?: string;
};
```

### 5.2 静态配置与运行时状态分离

- 地形、区域名、天气、环境属性基础值、对象定义、特殊状态定义来自 `default-map.json`。
- 是否发现、是否调查、哪些对象已揭示、哪些状态已揭示、调查报告历史保存在 `GameState.map`。
- 渲染时通过 `config tile + runtime tile` 合成 view model。
- 旧 `tile.investigated` 由 `RuntimeTileState.investigated` 派生。

### 5.3 tiles 兼容视图

过渡期可保留 `GameState.tiles`，但应明确它是派生 / 兼容层，不再作为地图真实状态。两种实现都可接受：

- 推荐：不在 state 中持久保存 `tiles`，在需要旧事件结算时调用 `deriveLegacyTiles(gameState.map)`。
- 保守：初始化和每次地图状态变化后同步 `state.tiles`，降低修改面，但需记录 TODO 逐步删除。

兼容 tile 派生规则：

- `id`、`coord` 保持旧格式，`coord` 仍可为内部 `(row,col)`，玩家坐标不得从该字段直接显示。
- `terrain` 来自 config tile `terrain`。
- `resources` 来自 visible / revealed objects 的 `legacyResource`，以及本轮仍需兼容的资源对象。
- `buildings` 来自 visible / revealed objects 的 `legacyBuilding`。
- `instruments` 来自 visible / revealed objects 的 `legacyInstrument`。
- `danger` 来自 active 且 revealed 的 special state `legacyDanger`，或旧危险字段映射。
- `status` 可由 discovered / investigated / special state 简化派生。
- `investigated` 来自 runtime。

## 6. 坐标系统

### 6.1 内部坐标

- 内部 tile id 继续为 `row-col`。
- `row` 和 `col` 继续从 `1` 开始。
- 内部边界由 `map.rows`、`map.cols` 决定，不再写死 `4`。
- 移动、路径、事件兼容层优先使用内部 `row`、`col`，避免大范围改动。

### 6.2 玩家显示坐标

玩家坐标以 `originTileId` 为 `(0,0)` 派生：

```ts
displayX = tile.col - origin.col;
displayY = origin.row - tile.row;
```

说明：

- `x` 向右为正，向左为负。
- `y` 向上为正，向下为负。
- 若采用屏幕 row 向下递增，上述公式可让北侧显示为正 y。
- 地图 UI 文案显示为 `(${displayX},${displayY})`。
- 任何玩家可见文案不得直接显示内部 `(row,col)`，除 Debug toolbox 可选显示。

### 6.3 origin 默认值

- 默认地图为 `8 x 8`。
- origin 为坠毁点 `(0,0)` 的内部 tile，由 `originTileId` 指定。
- 建议默认 `originTileId` 位于地图中部附近，例如 `4-4` 或 `5-5`，以便开局四周有探索空间；具体值以 `default-map.json` 内容为准。

## 7. 可见范围算法

### 7.1 显示状态

地图页每个渲染 cell 有以下显示状态：

- `discovered`：已发现，显示区域名、地形、天气、已揭示对象 / 状态、队员位置。
- `frontier`：外围未探索，合法地图内、与任一已发现格相邻一圈，但尚未发现；显示“未探索信号”，可作为移动目标。
- `unknownHole`：位于外接矩形内，但既非已发现也非外围未探索；统一显示“未探索信号”，不可显示真实地形 / 天气 / 对象。

注意：策划要求“可见外接矩形内空洞统一显示未探索信号”。因此 `unknownHole` 视觉上与 `frontier` 类似，但行动规则可不同：只有 `frontier` 明确允许移动目标；如后续希望空洞也可移动，需要另行确认。

### 7.2 邻接规则

外围一圈按 8 邻域计算，即包含上下左右和四个斜向相邻格。移动仍使用曼哈顿路径，不允许斜向移动；可见扩张和移动路径是两个不同规则。

### 7.3 算法步骤

1. 从 `GameState.map.discoveredTileIds` 取得已发现 tile 集合。
2. 对每个已发现 tile，枚举 `row + dr`、`col + dc`，其中 `dr`、`dc` 属于 `[-1,0,1]`，排除 `(0,0)`。
3. 仅保留 `1 <= row <= rows` 且 `1 <= col <= cols` 的合法 tile。
4. 未发现的合法邻居加入 `frontier` 集合。
5. 对 `discovered ∪ frontier` 求 `minRow/maxRow/minCol/maxCol`。
6. 渲染外接矩形内所有合法 tile。
7. 对每格判定：在 discovered 中为 `discovered`；否则在 frontier 中为 `frontier`；否则为 `unknownHole`。
8. 若开局发现集合异常为空，fallback 为只发现 `originTileId`，并在初始化或校验中修复。

### 7.4 移动目标合法性

- 已发现格允许作为移动目标。
- 外围未探索格允许作为移动目标。
- `unknownHole` 默认不允许作为移动目标，因为它不是由已发现边界直接推导出的外围一圈。
- 所有移动指令仍从“通讯台 → 通话”发出；地图页最多显示目标是否可请求前往，不提供执行按钮。
- 路径生成仍按曼哈顿相邻推进。若目标是外围未探索格，抵达时应将目标格标记为 discovered，并触发现有抵达事件检查。

## 8. 地块对象 / 天气 / 特殊状态 / 环境属性模型

### 8.1 地形

- 地形是底层环境，例如平原、荒野、森林、水域、丘陵、山地、沙漠。
- 地形用于基础展示和移动耗时。
- 矿床、巢穴、设施、医疗舱不得再塞入地形字段。
- 本轮继续允许 `crewSystem.ts` 用中文地形字符串计算耗时；后续可改为 terrain id + displayName。

### 8.2 天气

- 天气来自地图配置，已发现即显示。
- 本轮天气不参与事件结算、移动耗时和行动可用性。
- UI 在已发现地块详情中展示天气。
- TODO：后续展开天气与事件系统、地图对象、环境属性联调。

### 8.3 特殊状态

- 特殊状态代表异常或事件态，例如湖泊沸腾、火山爆发、高威胁生物活动。
- 状态可配置 `visibility`。`onInvestigated` 状态未揭示前不显示真实名称。
- 状态可配置持续时间，但本轮只做最小运行时字段，避免复杂生命周期 UI。
- active 且 revealed 的状态可派生旧 `danger` 或 `status`，供旧事件兼容。
- 状态过期后的显示建议为“无已知特殊状态”或不显示，不自动展示隐藏真实状态。

### 8.4 环境属性

- 环境属性是结构化读数，例如温度、湿度、磁场、辐射、毒性、气压。
- 地图页不常驻显示环境属性，避免详情面板过载。
- 调查完成时生成环境属性调查报告，记录当时读数、地点、队员、游戏时间。
- 报告写入 `GameState.map.investigationReportsById`，系统日志写入简短摘要和 `reportId`。

### 8.5 地块对象

- 地块对象统一承载矿床、生物巢穴、废弃医疗舱、旧医疗前哨、玩家设施、异常信号等。
- 对象可见性分为 `onDiscovered` 和 `onInvestigated`。
- 已揭示对象在地图详情中按对象类型分组或按列表展示。
- 对象可声明 `candidateActions`，但本轮不接通话菜单；仅作为后续设计位。
- 旧 `resources/buildings/instruments` 从对象 legacy 字段派生，不再手写在 runtime tile 上。

## 9. 调查报告与日志 UI 设计

### 9.1 调查完成流程

调查行动完成时执行：

1. 找到队员所在地 tile。
2. 标记 `RuntimeTileState.investigated = true`。
3. 将该 tile 中 `visibility = onInvestigated` 的对象 id 加入 `revealedObjectIds`。
4. 将该 tile 中 `visibility = onInvestigated` 且 active 的特殊状态 id 加入 `revealedSpecialStateIds`。
5. 读取 config tile `environment`，生成结构化 `InvestigationReport`。
6. 将报告写入 `GameState.map.investigationReportsById`。
7. 向系统日志追加一条调查摘要，包含 `reportId`，UI 渲染为“查看报告”按钮。
8. 保持现有 `investigation_complete` 事件触发逻辑。

### 9.2 InvestigationReport 结构

```ts
type InvestigationReport = {
  id: string;
  tileId: string;
  crewId: string;
  createdAtGameSeconds: number;
  areaName: string;
  displayCoord: { x: number; y: number };
  terrain: string;
  weather: string;
  environment: {
    temperatureCelsius?: number;
    humidityPercent?: number;
    magneticFieldMicroTesla?: number;
    radiationLevel?: string;
    toxicityLevel?: string;
    atmosphericPressureKpa?: number;
    notes?: string;
  };
  revealedObjects: Array<{ id: string; name: string; kind: string }>;
  revealedSpecialStates: Array<{ id: string; name: string; severity?: string }>;
};
```

### 9.3 日志模型兼容

若当前日志项只是字符串，需要新增轻量结构化能力。建议：

```ts
type GameLogEntry = {
  id: string;
  message: string;
  gameSeconds: number;
  kind?: string;
  reportId?: string;
};
```

如当前代码大范围依赖字符串数组，可采用过渡方案：保留 `logs: string[]`，另增 `logActionsByIndex` 或 `reports` 引用。但长期建议把日志改为对象数组，便于按钮、筛选和跳转。

### 9.4 弹窗 UI

- 控制中心或系统日志中，带 `reportId` 的日志项显示按钮：“查看报告”。
- 点击按钮打开复用 `Modal` 的报告弹窗。
- 弹窗标题：`环境调查报告 - ${areaName} (${x},${y})`。
- 第一组显示：队员、时间、区域、坐标、地形、天气。
- 第二组显示：温度、湿度、磁场、辐射、毒性、气压。
- 第三组显示：本次揭示对象和特殊状态。
- 若没有新揭示对象，显示“未确认新的地块对象”。
- 弹窗只读，不提供行动按钮。

## 10. 旧事件兼容策略与 TODO

### 10.1 最小兼容原则

本轮事件系统只做适配，不做语义重构。现有事件条件仍可读取旧式 tile 字段：`terrain`、`resources`、`danger`、`status`、`investigated`。

### 10.2 兼容实现

- 在事件结算前，从 `GameState.map` 派生 legacy tile。
- `terrain` 直接映射新 config terrain。
- `resources` 从已可见对象的 `legacyResource` 派生。
- `danger` 从已揭示且 active 的特殊状态 `legacyDanger` 派生。
- `status` 从 investigated / active special state 派生为旧系统可理解的短文本。
- 旧事件 effects 若修改 `tile.status`、`tile.danger`，短期可写回 runtime special state 的兼容状态或保留在 legacy overlay 中；不建议新增更多硬编码。

### 10.3 必须记录的 TODO

- TODO：后续展开事件系统与地图对象联调，让事件条件可直接引用 `object.kind`、`object.tags`、`object.id`。
- TODO：后续展开事件系统与天气联调，让天气参与事件触发、概率修正或行动风险。
- TODO：后续展开事件系统与特殊状态联调，明确状态来源、持续时间、过期、刷新、揭示和日志规则。
- TODO：后续展开事件系统与环境属性联调，让温度、湿度、磁场、辐射等结构化读数可进入事件条件。
- TODO：移除旧 `resources/buildings/instruments/danger/status` 作为事实源，统一由地图配置和 runtime state 派生。

## 11. 旧存档重置策略

### 11.1 推荐策略

使用新 save key：`stellar-frontier-save-v2`。`timeSystem.ts` 读取存档时只读取 v2；若只有 `stellar-frontier-save-v1`，视为无可用存档，创建新游戏。

优点：

- 实现最清晰。
- 避免旧 `4 x 4` `tiles`、队员位置和行动目标污染新 `8 x 8` 地图。
- 符合已确认“旧存档需要重置”。

### 11.2 备选策略

保留 key `stellar-frontier-save-v1`，但在存档内新增 `saveVersion: 2`。读取时若缺失 `saveVersion` 或版本小于 2，则丢弃旧存档并创建新状态。

### 11.3 需要 reset 的内容

- 旧 `tiles` 固定 16 格数据。
- 队员旧位置。新游戏应把队员放到默认地图定义的初始 tile 或初始队员位置配置。
- 旧行动目标。旧 `destinationTileId` 可能不存在于新地图语义中。
- 旧事件队列和紧急事件。它们可能引用旧 tile 状态。
- 旧日志。若保留会出现旧坐标和旧资源地点文案，建议 reset。

### 11.4 用户可见行为

- Debug toolbox 的重置入口继续清理当前 save key。
- 如实现自动 reset 提示，可在新游戏第一条系统日志写入：“雷达地图配置已更新，旧行动记录已归档，新探索从坠毁点重新开始。”
- 本轮不需要实现复杂迁移 UI。

## 12. 页面 / UI 改动

### 12.1 MapPage

- 移除 `repeat(4)`，改为根据可见外接矩形列数设置 CSS grid，例如 inline style `gridTemplateColumns: repeat(${visibleCols}, minmax(...))`。
- 页面文案从“4x4”改为“雷达可见区域”或“局部探索矩阵”。
- `aria-label` 不再写死 `4x4`，改为包含可见矩形尺寸或 tile 显示坐标。
- 已发现 tile 显示区域名、玩家坐标、地形、天气、队员标记、已揭示对象 / 状态摘要。
- 外围未探索和空洞 tile 显示“未探索信号”，不泄露真实区域名、地形、天气或对象。
- 详情面板选择未知格时，显示“信号未确认”，并说明需通过通讯派遣队员抵达 / 调查。
- 地图页不提供移动按钮；如显示行动提示，文案必须指向“请通过通讯台联系队员确认移动”。

### 12.2 CommunicationStation

- 队员卡片位置使用 `getTileLocationLabel`，优先区域名。
- 需要显示坐标时使用玩家坐标，例如“灰熊丘陵（-1,2）”。
- 不再调用 `resources[0]` 作为地点名。

### 12.3 CallPage

- 移动目标列表应包含已发现格和外围未探索格。
- 外围未探索格显示为“未探索信号（x,y）”，不显示真实地形和区域名。
- 确认移动仍走现有通话 choice。
- 调查完成后写入结构化报告，并在日志中提供弹窗按钮。
- 本轮不新增对象级行动菜单。

### 12.4 CrewDetail / 控制中心日志

- 若显示队员当前地点，使用区域名和玩家坐标。
- 系统日志支持 report 按钮弹窗。
- 日记系统不需要因地图重构改规则，但日志文案需避免旧内部坐标。

### 12.5 CSS

- 地图 grid 需要适配动态列数和移动端宽度。
- 对 `8 x 8` 默认地图，由于实际只渲染可见外接矩形，移动端压力可控。
- tile 内容要保留低保真控制台风格：短标签、等宽数字、状态色，不引入复杂拟物地图。

## 13. 测试策略

### 13.1 内容校验测试

- `npm run validate:content` 成功校验 crew/events/items/maps。
- 地图 schema 缺失 `originTileId` 时失败。
- tile id 与 row/col 不一致时失败。
- origin 不存在时失败。
- 默认地图不是 `8 x 8` 时失败或至少在地图专属校验中报错。
- `initialDiscoveredTileIds` 不包含 origin 时失败。

### 13.2 单元测试

- `getDisplayCoord`：origin tile 显示 `(0,0)`；origin 左右上下 tile 分别派生正确正负坐标。
- `getVisibleTileWindow`：单个已发现 tile 生成最多 `3 x 3` 外接矩形，边界处不会越界。
- `getVisibleTileWindow`：多个已发现 tile 形成外接矩形，内部空洞显示为 `unknownHole`。
- `canMoveToTile`：已发现和 frontier 返回 true，unknownHole 和地图外返回 false。
- `deriveLegacyTiles`：新对象 legacy 字段正确派生 `resources/buildings/instruments/danger`。
- 调查完成：生成报告、揭示对象 / 状态、日志包含 `reportId`。

### 13.3 组件测试

- 地图页不出现写死 `4x4` 文案。
- 地图 grid 列数随可见矩形变化。
- 已发现格显示区域名、显示坐标、地形、天气。
- 未探索格显示“未探索信号”，不显示真实地形。
- 通讯台队员位置显示区域名，不显示资源名作为地点。
- 日志项带 `reportId` 时渲染“查看报告”按钮，点击后弹出结构化报告。

### 13.4 E2E 测试

- 新游戏打开地图，只看到坠毁点及外围一圈 / 可见外接矩形，不直接暴露完整 `8 x 8`。
- 通过通讯台进入通话，选择外围未探索格作为移动目标，确认后队员开始移动。
- 队员抵达外围未探索格后，该格变为已发现，地图可见范围扩张。
- 执行调查后，控制中心或日志中出现调查报告按钮，弹窗显示环境属性。
- 清理旧 v1 存档后新游戏仍正常；存在旧 v1 存档时不会加载旧 `4 x 4` 状态。

### 13.5 回归命令

涉及内容和源码修改后必须运行：

- `npm run validate:content`
- `npm run lint`
- `npm run test`

若修改 Playwright 覆盖流程，还应运行：

- `npm run test:e2e` 或项目实际 e2e 命令

## 14. 风险与缓解

### 14.1 地图状态双源风险

- 风险：`GameState.map` 和旧 `GameState.tiles` 同时存在，可能不同步。
- 缓解：明确 `map` 是事实源；`tiles` 只允许派生，不允许业务逻辑直接写入。若短期必须同步，集中在单个 helper 内完成。

### 14.2 事件兼容遗漏

- 风险：旧事件条件依赖 `resources/danger/status`，迁移后触发异常。
- 缓解：先实现 `deriveLegacyTiles` 并补单元测试；本轮不改事件 schema，不扩大事件语义。

### 14.3 坐标符号混乱

- 风险：内部 row 向下递增，玩家 y 轴可能显示反向。
- 缓解：固定公式 `displayY = origin.row - row`，并用单元测试覆盖 origin 上下左右。

### 14.4 可见范围与移动范围混淆

- 风险：8 邻域用于显示，曼哈顿用于移动，玩家可能误解斜向可直达。
- 缓解：通话确认时显示预计路径 / 耗时；文案避免承诺斜向移动。实现上路径仍按 row/col 曼哈顿推进。

### 14.5 日志结构迁移牵动过大

- 风险：日志从字符串改对象会影响大量 UI 和测试。
- 缓解：可先用兼容结构或最小扩展，只对调查报告日志渲染按钮；后续再统一日志模型。

### 14.6 旧存档污染

- 风险：localStorage 中旧 v1 存档导致队员位置、tile 数量、行动目标不一致。
- 缓解：采用 `stellar-frontier-save-v2` 或 `saveVersion: 2` 严格 reset；测试覆盖旧 v1 存在场景。

### 14.7 内容配置过细导致实现拖慢

- 风险：对象、状态、环境属性字段过多，MVP 复杂度上升。
- 缓解：schema 支持扩展字段，但 UI 和规则只使用 MVP 字段；candidateActions 等仅保留为可选设计位。

## 15. 已确认技术决策

- tile id 继续使用内部 `row-col`，玩家坐标由 origin 派生显示。
- 事件系统本轮最小适配，不重构事件语义；必须记录 TODO，随后展开事件系统与地图对象 / 天气 / 状态 / 环境属性联调。
- 外围未探索格允许作为移动目标，但仍通过“通讯台 → 通话”确认。
- 可见外接矩形内空洞统一显示“未探索信号”。
- `GameState` 新增 `map` runtime state，逐步淘汰 / 派生 `tiles` 兼容视图。
- 环境属性调查报告本轮实现为结构化报告 + 日志按钮弹窗。
- 默认地图为 `8 x 8`。
- origin 为坠毁点 `(0,0)` 的派生坐标原点。
- 旧固定 `4 x 4` 存档需要 reset；实现可选新 save key `stellar-frontier-save-v2` 或 `saveVersion: 2`。

## 16. 建议实施顺序

1. 新增地图内容 JSON、schema、validate-content 校验。
2. 在 `contentData.ts` 导出地图内容和基础查询 helper。
3. 新增 `GameState.map` 初始化，并引入新 save key 或 `saveVersion` reset。
4. 实现坐标、可见范围、legacy tile 派生 helper。
5. 改 `MapPage.tsx` 为动态可见矩形和新信息层级。
6. 改通讯台 / 队员位置文案，移除资源名地点 fallback。
7. 改通话移动目标列表，允许 frontier 作为目标。
8. 改调查完成流程，生成环境属性报告和日志按钮弹窗。
9. 补充单元、组件、E2E 和内容校验测试。
10. 运行 `npm run validate:content`、`npm run lint`、`npm run test`，必要时运行 e2e。
