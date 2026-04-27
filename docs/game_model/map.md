# 地图模型

本文描述可配置地图系统的核心 game model。地图既是静态内容配置，也是运行时探索状态的事实源；UI、队员行动、调查报告和事件兼容层都应从同一套地图模型读取或派生状态。

地图的玩法规则与玩家体验见 `docs/gameplay/map-system/map-system.md`。事件可访问的地块投影边界见 `docs/game_model/event-integration.md`。

## 1. 模型范围与命名

| 规则 | 说明 |
| --- | --- |
| `scope` | 覆盖静态地图配置、地图块层级、运行时地图状态、发现 / 调查状态、坐标转换、可见窗口、调查报告、legacy tile 投影、存档 reset 边界。 |
| `out_of_scope` | 不定义地图编辑器 UI，不定义随机地图生成，不实现天气模拟，不定义对象级通话菜单，不重构事件系统语义。 |
| `content_source_of_truth` | 地图静态内容来自 `content/maps/default-map.json`。地形、区域名、天气、环境属性、地块对象与特殊状态定义不保存在运行时状态里。 |
| `runtime_source_of_truth` | 玩家发现、调查、揭示对象、揭示状态、活跃状态和调查报告索引来自 `GameState.map`。 |
| `compatibility_policy` | 旧 `GameState.tiles` / `MapTile` 只作为兼容投影存在，不再作为地图事实源。 |
| `save_policy` | 固定 `4 x 4` 旧存档与配置驱动地图不兼容；读取时应 reset 或使用新的 save 版本 / save key。 |

## 2. 模型分层

```mermaid
flowchart TD
  MapJson["content/maps/default-map.json"] --> MapConfig["MapConfig"]
  MapConfig --> InitialMap["initial GameState.map"]
  InitialMap --> GameMapState["GameMapState"]
  GameMapState --> VisibleWindow["visible tile window"]
  GameMapState --> InvestigationReport["InvestigationReport"]
  GameMapState --> LegacyTiles["legacy MapTile projection"]
  LegacyTiles --> EventCompat["eventSystem compatibility"]
  GameMapState --> CrewLocation["crew location labels"]
```

| 模型 | 代码名称 | 中文名 | 来源 | 介绍 |
| --- | --- | --- | --- | --- |
| 内容文件 | `content/maps/default-map.json` | 默认地图内容配置 | JSON | 地图编辑 / 内容生产应读写的文件，包含尺寸、origin、初始发现地块和完整地图块定义。 |
| 内容定义 | `MapConfig` | 地图配置 | `src/content/contentData.ts` | TypeScript 对地图内容的描述，运行时初始化和查询 helper 读取它。 |
| 运行时状态 | `GameMapState` | 地图运行时状态 | `GameState.map` | 保存玩家探索进度、调查状态、对象 / 状态揭示和调查报告索引。 |
| 兼容投影 | `MapTile` / `deriveLegacyTiles` | 旧地块视图 | helper 派生 | 给旧事件系统或过渡期组件读取的派生视图，不应被视为事实源。 |

## 3. 静态内容模型

### 3.1 `map_config`

`map_config` 定义一张可加载地图的静态内容。默认地图尺寸为 `8 x 8`，但代码逻辑不得假设固定尺寸。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 地图配置稳定 ID，例如 `default-map`。 |
| `name` | `string` | 地图显示名或内部可读名。 |
| `version` | `number` | 地图内容版本，用于未来内容迁移；不等同于存档版本。 |
| `size.rows` / `size.cols` | `number` | 地图内部边界。默认内容为 `8` 和 `8`。 |
| `originTileId` | `string` | 坠毁点 / 玩家开始点。玩家显示坐标由此派生为 `(0,0)`。 |
| `initialDiscoveredTileIds` | `string[]` | 新游戏开局已发现地块，至少包含 `originTileId`。 |
| `tiles` | `map_tile_definition[]` | 地图块静态定义集合。默认地图应覆盖全部合法格。 |

### 3.2 `map_tile_definition`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 内部 tile id，继续使用 `row-col`。 |
| `row` / `col` | `number` | 内部坐标，从 `1` 开始；必须与 `id` 一致。 |
| `areaName` | `string` | 区域名。多个 tile 可使用同一区域名；缺失或空值时显示为“野外”。 |
| `terrain` | `string` | 地形中文名，短期继续沿用移动耗时表需要的中文字符串。 |
| `weather` | `string` | 发现后显示的天气；当前不参与事件结算。 |
| `environment` | `tile_environment` | 结构化环境读数，调查报告使用。 |
| `objects` | `tile_object_definition[]` | 地块对象列表，承载矿床、生物巢穴、遗迹、医疗舱、玩家设施等。 |
| `specialStates` | `tile_special_state_definition[]` | 特殊状态列表，承载湖泊沸腾、火山爆发、高威胁生物活动等异常。 |

### 3.3 `tile_object_definition`

地块对象统一承载资源点、结构、信号、危险、设施、遗迹和地标。对象可以声明未来候选行动，但行动菜单如何生成仍由通话 / 行动系统单独设计。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 地图内唯一对象 ID。 |
| `kind` | `resourceNode` / `structure` / `signal` / `hazard` / `facility` / `ruin` / `landmark` | 对象类型。 |
| `name` | `string` | 玩家可见名称。 |
| `description` | `string` | 详情描述，可选。 |
| `visibility` | `onDiscovered` / `onInvestigated` | 对象在发现地块时显示，或调查后显示。 |
| `tags` | `string[]` | 规则和内容标签，供后续事件 / 行动条件使用。 |
| `legacyResource` | `string | null` | 供旧事件系统派生 `resources`。 |
| `legacyBuilding` | `string | null` | 供旧 UI / 旧事件派生 `buildings`。 |
| `legacyInstrument` | `string | null` | 供旧 UI 派生 `instruments`。 |
| `candidateActions` | `string[]` | 未来行动声明位；当前不直接驱动通话菜单。 |

### 3.4 `tile_special_state_definition`

特殊状态代表异常或事件态。状态可以由地图配置预置，也可以由事件系统生成。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 状态稳定 ID。 |
| `name` | `string` | 玩家可见名称。 |
| `description` | `string` | 详情描述，可选。 |
| `visibility` | `onDiscovered` / `onInvestigated` / `hidden` | 状态可见性。 |
| `severity` | `low` / `medium` / `high` / `critical` | 严重程度。 |
| `tags` | `string[]` | 规则和内容标签。 |
| `startsActive` | `boolean` | 是否开局 active。 |
| `durationGameSeconds` | `number | null` | 可选持续时间。 |
| `legacyDanger` | `string | null` | 供旧事件系统派生 `danger`。 |

### 3.5 `tile_environment`

环境属性是结构化读数，不在地图详情中常驻显示。调查完成时，系统可生成结构化报告并在日志里提供查看入口。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `temperatureCelsius` | `number` | 温度。 |
| `humidityPercent` | `number` | 湿度，范围 `0-100`。 |
| `magneticFieldMicroTesla` | `number` | 磁场强度。 |
| `radiationLevel` | `none` / `low` / `medium` / `high` / `critical` | 辐射等级。 |
| `toxicityLevel` | `string | null` | 毒性等级，可选。 |
| `atmosphericPressureKpa` | `number | null` | 气压，可选。 |
| `notes` | `string | null` | 设计备注或叙事短句，可选。 |

## 4. 运行时模型

### 4.1 `GameMapState`

`GameMapState` 是地图运行时事实源。静态地图内容不复制进它，只保存随玩家游玩变化的状态。

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
```

| 字段 | 说明 |
| --- | --- |
| `configId` / `configVersion` | 指向加载时使用的地图配置。 |
| `rows` / `cols` | 运行时地图边界，初始化自配置。 |
| `originTileId` | 玩家显示坐标原点。 |
| `tilesById` | 每个地图块的运行时状态。 |
| `discoveredTileIds` | 已发现地块集合。 |
| `investigationReportsById` | 调查报告索引。 |

### 4.2 `RuntimeTileState`

```ts
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

| 字段 | 说明 |
| --- | --- |
| `discovered` | 是否已发现。已发现地块可显示区域名、地形和天气。 |
| `investigated` | 是否已调查。旧 `tile.investigated` 由该字段派生。 |
| `revealedObjectIds` | 已揭示对象 ID。`onDiscovered` 对象可在初始化或发现时加入。 |
| `revealedSpecialStateIds` | 已揭示特殊状态 ID。 |
| `activeSpecialStateIds` | 当前仍活跃的特殊状态 ID。 |
| `specialStateExpiresAt` | 特殊状态过期时间，以游戏秒记录。 |
| `lastInvestigationReportId` | 最近一次调查报告 ID。 |

## 5. 坐标系统

### 5.1 内部坐标

- 内部 tile id 继续为 `row-col`。
- `row` 和 `col` 从 `1` 开始。
- 内部边界由 `GameMapState.rows` 和 `GameMapState.cols` 决定。
- 移动、路径、事件兼容层可以继续使用内部 `row` / `col`，降低迁移成本。

### 5.2 玩家显示坐标

玩家坐标以 `originTileId` 为 `(0,0)` 派生：

```ts
displayX = tile.col - origin.col;
displayY = origin.row - tile.row;
```

规则：

- `x` 向右为正，向左为负。
- `y` 向上为正，向下为负。
- 地图 UI 文案显示为 `(${displayX},${displayY})`。
- 普通玩家可见文案不得直接显示内部 `(row,col)`；Debug 工具可选择显示内部坐标。

## 6. 可见窗口模型

地图页每个渲染 cell 有三类显示状态：

| 状态 | 说明 | 是否显示真实信息 | 是否可作为移动目标 |
| --- | --- | --- | --- |
| `discovered` | 已发现地块。 | 是，显示区域名、地形、天气、已揭示对象 / 状态、队员位置。 | 是 |
| `frontier` | 合法地图内、与任一已发现格相邻一圈，但尚未发现。 | 否，显示“未探索信号”。 | 是 |
| `unknownHole` | 位于外接矩形内，但既非已发现也非外围未探索。 | 否，显示“未探索信号”。 | 否 |

可见窗口算法：

1. 从 `GameMapState.discoveredTileIds` 取得已发现 tile 集合。
2. 对每个已发现 tile 枚举 8 邻域，包含上下左右与四个斜向相邻格。
3. 仅保留 `1 <= row <= rows` 且 `1 <= col <= cols` 的合法 tile。
4. 未发现的合法邻居加入 `frontier` 集合。
5. 对 `discovered ∪ frontier` 求 `minRow/maxRow/minCol/maxCol`。
6. 渲染外接矩形内所有合法 tile。
7. 对每格判定：在 `discovered` 中为 `discovered`；否则在 `frontier` 中为 `frontier`；否则为 `unknownHole`。
8. 若开局发现集合异常为空，初始化逻辑应修复为只发现 `originTileId`。

可见扩张使用 8 邻域，移动路径仍使用上下左右相邻的曼哈顿路径。二者是不同规则。

## 7. 调查报告模型

调查完成时，地图系统将静态环境读数与本次揭示结果打包成结构化报告。

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

调查完成流程：

1. 找到队员所在地 tile。
2. 标记 `RuntimeTileState.investigated = true`。
3. 将该 tile 中 `visibility = onInvestigated` 的对象加入 `revealedObjectIds`。
4. 将该 tile 中 `visibility = onInvestigated` 且 active 的特殊状态加入 `revealedSpecialStateIds`。
5. 读取静态 tile 的 `environment`，生成 `InvestigationReport`。
6. 将报告写入 `GameMapState.investigationReportsById`。
7. 向系统日志追加一条调查摘要，日志项关联 `reportId`。
8. 保持既有调查完成事件触发逻辑。

## 8. Legacy `MapTile` 投影

过渡期可保留 `GameState.tiles`，但它应由 `GameState.map` 派生，或在单一 helper 中集中同步。业务逻辑不应把 legacy tile 当作地图事实源继续写入。

派生规则：

| Legacy 字段 | 派生来源 |
| --- | --- |
| `id` | 静态 tile `id`。 |
| `coord` | 内部 `(row,col)` 兼容字段；玩家坐标不得从该字段直接显示。 |
| `terrain` | 静态 tile `terrain`。 |
| `resources` | 已可见 / 已揭示对象的 `legacyResource`。 |
| `buildings` | 已可见 / 已揭示对象的 `legacyBuilding`。 |
| `instruments` | 已可见 / 已揭示对象的 `legacyInstrument`。 |
| `danger` | active 且 revealed 的特殊状态 `legacyDanger`。 |
| `status` | 可由 discovered、investigated 和 active special state 简化派生。 |
| `investigated` | `RuntimeTileState.investigated`。 |

旧事件 effects 若修改 `tile.status` 或 `tile.danger`，短期可以写回 runtime special state 的兼容状态或保存在 legacy overlay 中。长期应移除旧 `resources/buildings/instruments/danger/status` 作为事实源。

## 9. 系统关系

### 队员系统

- `CrewMember.currentTile` 保存队员当前所在地块 ID。
- 队员位置摘要通过地图区域名和玩家显示坐标派生，不使用资源名作为地点。
- 移动目标合法性读取地图边界、发现状态和外围未探索状态。
- 队员抵达 `frontier` 地块时，该地块应标记为 discovered，并触发现有抵达事件检查。

### 通讯台与通话

- 通讯台和队员卡片展示区域名与行动状态。
- 通话移动目标列表可包含已发现地块和 `frontier` 地块。
- 未探索目标显示为“未探索信号（x,y）”，不得泄露真实区域名、地形、天气、对象或特殊状态。
- 地块对象可声明候选行动，但候选行动如何进入通话菜单仍需要独立模型。

### 事件系统

- 当前事件系统通过 legacy tile 投影继续读取 `terrain/resources/danger/status/investigated`。
- 天气、特殊状态、环境属性和地块对象可作为后续事件条件、概率修正或分支的语义来源。
- 事件系统不应绕过地图模型任意写 `GameState.map`；应通过结构化 effect 修改发现、调查、状态、对象和历史。

### 存档

- 新地图结构与固定 `4 x 4` 旧存档不兼容。
- 推荐使用新 save key，例如 `stellar-frontier-save-v2`；若只有旧 key，视为无可用存档并创建新游戏。
- 备选策略是在存档内新增 `saveVersion: 2`；读取时若缺失或版本过低，则丢弃旧存档并创建新状态。
- reset 内容包括旧 `tiles`、队员旧位置、旧行动目标、旧事件队列、紧急事件和旧日志。

## 10. 校验规则

地图内容校验至少覆盖：

- `content/maps/default-map.json` 必须符合地图 schema。
- `size.rows` 和 `size.cols` 必须为正整数；默认内容为 `8 x 8`。
- `originTileId` 必须存在于 `tiles`。
- `initialDiscoveredTileIds` 中所有 id 必须存在，且包含 `originTileId`。
- 每个 tile 的 `id` 必须等于 `${row}-${col}`。
- tile `row`、`col` 必须在地图边界内。
- 默认地图 `tiles` 覆盖所有合法格；如果未来允许稀疏地图，需要先定义 blocked / void 规则。
- 地块对象 `id` 在地图内唯一。
- 特殊状态 `id` 在单 tile 内唯一。
- `legacyResource`、`legacyBuilding`、`legacyInstrument` 如引用内容 ID，应校验对应内容存在；如果仍使用中文显示名，至少校验为字符串并记录内容 ID 化需求。

## 11. 后续扩展记录

- 事件系统与地图对象联调：事件条件可直接引用 `object.kind`、`object.tags`、`object.id`。
- 事件系统与天气联调：天气参与事件触发、概率修正或行动风险。
- 事件系统与特殊状态联调：明确状态来源、持续时间、过期、刷新、揭示和日志规则。
- 事件系统与环境属性联调：温度、湿度、磁场、辐射等结构化读数可进入事件条件。
- 地块对象候选行动模型：对象声明采矿、勘测、道具调查、修复等行动，并由通话系统决定展示与可用性。
- 移除 legacy `MapTile` 事实源：统一由地图配置和 `GameState.map` 派生。

## 来源

| 日期 | 来源 |
| --- | --- |
| 2026-04-27 | `docs/plans/2026-04-27-17-37/configurable-map-system-design.md` |
| 2026-04-27 | `docs/plans/2026-04-27-17-37/technical-design.md` |
