# Stellar Frontier 地图编辑器第一版设计文档

## 1. 背景

`Stellar Frontier` 当前已经具备配置驱动的地图系统。地图内容主要来自 `content/maps/*.json`，游戏运行时读取这些静态 JSON 内容，并结合运行时状态展示玩家当前可见地图、队员位置、地块详情与探索边界。

当前项目中已经存在独立的 `apps/editor`，用于支持事件编辑器。事件编辑器的整体模式是：

```text
content/events/*.json
        ↓
editor helper 读取
        ↓
apps/editor React UI 展示 / 编辑
        ↓
helper 保存 JSON
        ↓
validate:content 校验
```

地图编辑器也应采用类似架构。地图编辑器的核心产物是静态地图 JSON，因此它不应该强行绑定游戏内地图页面，也不应该复用游戏运行时的 `MapPage` 或 Phaser 场景逻辑。

第一版地图编辑器的目标是：用独立的 React UI 编辑地图静态内容，生成并保存可被游戏消费的 `content/maps/*.json`。

---

## 2. 产品定位

地图编辑器是一个 **content authoring tool**，不是游戏运行时 UI。

它负责：

- 创建和维护地图静态 JSON。
- 编辑地图尺寸、地块、区域名、地形、天气、环境数值、特殊状态和地块对象引用。
- 校验 JSON schema 与引用完整性。
- 保存内容文件。

它不负责：

- 展示游戏运行时状态。
- 展示队员实时位置。
- 展示当前行动、通话、事件日志或 runtime discovered state。
- 执行移动、调查、建设等游戏指令。
- 复用游戏内地图页面布局。

---

## 3. 第一版核心结论

第一版地图编辑器建议采用：

> **独立 React 地图编辑器 + CSS Grid/SVG 地图预览 + 静态 JSON 读写校验**

第一版不使用 Phaser。

原因：

1. 第一版核心目标是编辑静态 JSON，不是做最终游戏渲染效果。
2. 默认地图规模较小，CSS Grid 或 SVG 足够完成可视化编辑。
3. React 更适合表单、字段编辑、引用选择、校验错误展示、dirty 状态、undo/redo 等 authoring tool 交互。
4. 不使用 Phaser 可以避免过早绑定游戏运行时渲染逻辑。
5. 只要状态模型设计正确，未来可以无痛替换中间预览层为 Phaser、Canvas、SVG 或 tileset preview。

---

## 4. 架构原则

### 4.1 编辑器独立于游戏地图 UI

不要这样设计：

```text
MapEditor → 复用 MapPage → 改造成可编辑
```

原因是游戏内 `MapPage` 天然绑定了大量 runtime 信息：

- crew
- active calls
- event logs
- elapsed game time
- move selection
- runtime discovered state
- return target
- 游戏页面布局

这些对静态地图 JSON 编辑器都是噪音。

应当这样设计：

```text
MapEditorPage
  ├── MapFileSidebar
  ├── MapGridPreview
  ├── TileInspectorPanel
  ├── MapMetadataPanel
  ├── ValidationPanel
  └── SaveToolbar
```

### 4.2 React 持有编辑器状态

核心状态必须存在 React reducer / state 中，而不是存在地图预览组件内部。

推荐数据流：

```text
Map JSON
  ↓ load
React draft state
  ↓ derive
Grid view model
  ↓ user action
Editor command
  ↓ reducer
React draft state
  ↓ validate / save
Map JSON
```

避免设计成：

```text
Map JSON
  ↓
Canvas / Phaser 内部状态
  ↓
保存时从 Canvas / Phaser 反向导出 JSON
```

后者会让 undo/redo、schema validation、diff、保存、测试都变复杂。

### 4.3 只共享纯数据与工具函数

地图编辑器可以和游戏地图共享：

- content schema
- TypeScript 类型
- 坐标工具函数
- 地形颜色映射
- 引用校验逻辑
- JSON 读写与格式化约定

不建议共享：

- `MapPage`
- 游戏内 `PhaserMapCanvas`
- 游戏内 `MapScene`
- crew marker rendering
- route preview
- movement tween
- 游戏内 tooltip 文案
- 游戏 runtime selection logic

---

## 5. 第一版范围

### 5.1 P0：必须完成

#### 1. 地图文件读取

- 从 editor helper 读取 `content/maps/*.json`。
- 第一版至少支持 `content/maps/default-map.json`。
- 展示地图基础信息：
  - `id`
  - `name`
  - `version`
  - `size.rows`
  - `size.cols`
  - `originTileId`
  - `initialDiscoveredTileIds`

#### 2. 地图网格展示

- 使用 React CSS Grid 或 SVG 渲染 `rows x cols` 地图网格。
- 每个 tile 显示：
  - tile id
  - areaName
  - terrain
  - weather，可选
- 支持根据 terrain 显示基础颜色。
- 支持点击选中 tile。
- 支持高亮 origin tile。
- 支持高亮 initial discovered tiles。
- 支持显示 selected tile outline。

#### 3. 单 tile Inspector

点击 tile 后，右侧 inspector 展示并编辑：

- `id`，只读
- `row`，只读
- `col`，只读
- `areaName`
- `terrain`
- `weather`
- `environment`
  - `temperatureCelsius`
  - `humidityPercent`
  - `magneticFieldMicroTesla`
  - `radiationLevel`
  - `toxicityLevel`
  - `atmosphericPressureKpa`
  - `notes`，可选
- `objectIds`
- `specialStates`

#### 4. 基础字段编辑

第一版允许修改：

- `areaName`
- `terrain`
- `weather`
- environment 各字段
- `objectIds`
- `specialStates`

第一版不需要支持新增或删除 tile。

地图尺寸第一版可以只读。

#### 5. objectIds 编辑

- 从 map object definitions 读取可选对象。
- 用下拉或搜索选择 object id。
- 支持添加 object。
- 支持删除 object。
- 保存前校验 object id 是否存在。

#### 6. specialStates 编辑

支持编辑 `specialStates` 数组：

- `id`
- `name`
- `visibility`
  - `hidden`
  - `onDiscovered`
  - `onInvestigated`
- `severity`
  - `low`
  - `medium`
  - `high`
- `startsActive`
- `dangerTags`，可选

第一版可以使用普通表单，不需要复杂可视化。

#### 7. Origin / 初始发现区编辑

- 支持把当前 tile 设为 `originTileId`。
- 支持把当前 tile 加入或移出 `initialDiscoveredTileIds`。
- 网格中有明确视觉标记。

#### 8. 保存

通过 editor helper 保存回对应 JSON 文件。

保存前必须：

- 生成格式化 JSON。
- 保留稳定字段顺序。
- schema 校验通过。
- 引用完整性校验通过。
- 写入失败时显示错误，不破坏当前 draft。

#### 9. 校验面板

底部或右侧显示 validation errors：

- schema 错误
- tile id 重复
- originTileId 不存在
- initialDiscoveredTileIds 指向不存在 tile
- objectIds 引用不存在
- row/col 超出 size
- tile 数量与 size 不匹配，可先作为 warning
- terrain 为空
- areaName 为空，可作为 warning

每个错误最好能跳转到对应 tile。

#### 10. 脏状态提示

- 修改后显示 `Unsaved changes`。
- 保存成功后清除 dirty 状态。
- 离开页面前提示未保存更改。

---

### 5.2 P1：第一版很值得做，但可视时间取舍

#### 11. Undo / Redo

支持：

- `Cmd/Ctrl + Z`
- `Cmd/Ctrl + Shift + Z` 或 `Cmd/Ctrl + Y`

至少覆盖：

- tile 字段编辑
- objectIds 修改
- specialStates 修改
- origin 修改
- initial discovered 修改

#### 12. 批量选择

支持：

- 单选 tile
- Shift 点击范围选择
- 多选后批量修改：
  - `areaName`
  - `terrain`
  - `weather`

第一版不一定需要拖拽涂抹，但多选批量编辑很有价值。

#### 13. Terrain / Weather / AreaName 预设

从现有地图数据中提取已有值，形成下拉建议：

- terrain suggestions
- weather suggestions
- areaName suggestions

允许输入新值，但给出一致性提示。

#### 14. JSON Preview

提供只读 JSON preview：

- 显示当前 draft。
- 支持复制。
- 支持折叠。
- 保存前可以看到最终 JSON。

#### 15. Diff Preview

保存前显示：

- 当前文件 vs draft 的差异。
- 至少按 tile 粒度显示 changed fields。

这对内容编辑很重要，可以避免误改大面积 JSON。

---

### 5.3 P2：后续版本再做

#### 16. 地图尺寸编辑

支持修改：

- rows
- cols
- 自动补 tile
- 自动裁剪 tile
- 检查 origin 是否仍有效
- 检查 initial discovered 是否仍有效

该功能容易引入数据迁移问题，第一版建议不做。

#### 17. 画笔模式

支持：

- terrain brush
- area brush
- weather brush
- object brush
- special state brush

第一版可以没有，P1 的多选批量编辑已足够。

#### 18. 图层开关

显示或隐藏：

- areaName layer
- terrain layer
- weather layer
- object layer
- special state layer
- origin/discovered layer

#### 19. 地图对象预览

网格 tile 上显示 object icon / badge：

- object 数量
- 高风险 special state
- mainline object 标记
- hidden object 标记

#### 20. Tileset 支持

编辑：

- `content/maps/tilesets/registry.json`
- terrain 到 sprite 的映射
- sprite preview

这属于视觉增强，不是第一版核心。

#### 21. Phaser Preview

后续如果出现以下需求，可以引入 Phaser preview：

- 大地图性能压力
- 平滑缩放和拖拽
- tileset atlas 预览
- 多图层渲染
- 更接近游戏内最终表现

即便后续引入 Phaser，也应保持 React 是编辑器状态主控，Phaser 只做 preview 和 tile interaction。

---

## 6. 第一版最终建议范围

第一版建议收敛为以下 12 个需求：

1. 读取 `content/maps/default-map.json`。
2. 独立 React Grid / SVG 地图展示。
3. 单 tile 选择。
4. 右侧 tile inspector。
5. 编辑 `areaName` / `terrain` / `weather`。
6. 编辑 `environment`。
7. 编辑 `objectIds`。
8. 编辑 `specialStates`。
9. 编辑 `originTileId` / `initialDiscoveredTileIds`。
10. 保存 JSON。
11. schema + 引用校验。
12. dirty 状态 + validation panel。

第一版明确不做：

- Phaser preview
- tileset atlas
- 拖拽画笔
- 地图尺寸编辑
- 运行时队员位置预览
- 事件运行预览
- 与游戏 `MapPage` 共用 UI

---

## 7. UI 结构

推荐布局：

```text
┌─────────────────────┬──────────────────────────────┬──────────────────────┐
│ Map Files / Tools   │ Map Grid Preview              │ Tile Inspector       │
│                     │                              │                      │
│ default-map.json    │ [ CSS Grid / SVG map ]        │ id: 4-4              │
│                     │                              │ row / col            │
│ Select              │ selected / origin / discovered│ areaName             │
│ Set Origin          │ terrain color                 │ terrain              │
│ Toggle Discovered   │ object badges                 │ weather              │
│                     │ danger badges                 │ environment          │
│                     │                              │ objectIds            │
│                     │                              │ specialStates        │
└─────────────────────┴──────────────────────────────┴──────────────────────┘
│ Validation / JSON Preview / Save Status                                    │
└────────────────────────────────────────────────────────────────────────────┘
```

### 左侧：Map Files / Tools

负责：

- 地图文件列表。
- 当前选中文件。
- 基础工具入口：
  - Select
  - Set Origin
  - Toggle Initial Discovered
- 保存按钮。
- dirty 状态展示。

### 中间：Map Grid Preview

负责：

- 渲染地图网格。
- 展示 terrain color。
- 展示 tile id / areaName / terrain。
- 展示 selected / origin / initial discovered 标记。
- 展示 object count badge。
- 展示 special state danger badge。

### 右侧：Tile Inspector

负责：

- 编辑当前 tile 的静态字段。
- 添加 / 删除 objectIds。
- 添加 / 删除 / 编辑 specialStates。
- 设置 origin tile。
- toggle initial discovered。

### 底部：Validation / JSON Preview / Save Status

负责：

- 展示校验错误。
- 跳转到对应 tile。
- 显示保存状态。
- 可选展示 JSON preview 或 diff preview。

---

## 8. 技术设计

### 8.1 新增目录结构

建议新增：

```text
apps/editor/src/map-editor/
  MapEditorPage.tsx
  MapGridPreview.tsx
  TileInspector.tsx
  MapMetadataPanel.tsx
  ValidationPanel.tsx
  JsonPreview.tsx
  mapEditorReducer.ts
  mapEditorApi.ts
  mapEditorValidation.ts
  mapEditorTypes.ts
```

Editor helper 新增：

```text
apps/editor/helper/mapContentStore.mjs
```

### 8.2 Editor helper API

新增 API：

```text
GET  /api/map-editor/library
POST /api/map-editor/validate
POST /api/map-editor/save
```

#### `GET /api/map-editor/library`

返回地图编辑器所需的静态内容库：

```ts
type MapEditorLibrary = {
  maps: Array<{
    id: string;
    file_path: string;
    data: MapContent;
  }>;
  objectDefinitions: Array<{
    id: string;
    name: string;
    visibility?: string;
  }>;
  schemas: Record<string, unknown>;
};
```

#### `POST /api/map-editor/validate`

请求：

```ts
type ValidateMapRequest = {
  file_path: string;
  data: MapContent;
};
```

响应：

```ts
type ValidateMapResponse = {
  valid: boolean;
  errors: MapValidationError[];
  warnings: MapValidationWarning[];
};
```

#### `POST /api/map-editor/save`

请求：

```ts
type SaveMapRequest = {
  file_path: string;
  data: MapContent;
};
```

响应：

```ts
type SaveMapResponse = {
  saved: boolean;
  file_path: string;
  errors?: MapValidationError[];
};
```

保存前 helper 应执行：

1. path guard，确保只能写入允许目录。
2. JSON schema validation。
3. 引用完整性校验。
4. 稳定格式化 JSON。
5. 原子写入或尽可能安全写入。

### 8.3 前端状态模型

推荐状态：

```ts
type MapEditorState = {
  filePath: string;
  original: MapContent;
  draft: MapContent;
  selectedTileId: string | null;
  selectedTileIds: string[];
  validationErrors: MapValidationError[];
  validationWarnings: MapValidationWarning[];
  dirty: boolean;
  saving: boolean;
  loading: boolean;
};
```

如果支持 undo/redo：

```ts
type MapEditorHistory = {
  past: MapContent[];
  future: MapContent[];
};
```

### 8.4 Editor command 设计

推荐将用户操作建模为 command：

```ts
type MapEditorCommand =
  | { type: "select_tile"; tileId: string }
  | { type: "select_tiles"; tileIds: string[] }
  | { type: "update_tile_field"; tileId: string; field: "areaName" | "terrain" | "weather"; value: string }
  | { type: "update_tile_environment"; tileId: string; field: string; value: string | number }
  | { type: "add_object"; tileId: string; objectId: string }
  | { type: "remove_object"; tileId: string; objectId: string }
  | { type: "add_special_state"; tileId: string; state: MapSpecialState }
  | { type: "update_special_state"; tileId: string; stateId: string; patch: Partial<MapSpecialState> }
  | { type: "remove_special_state"; tileId: string; stateId: string }
  | { type: "set_origin_tile"; tileId: string }
  | { type: "toggle_initial_discovered"; tileId: string };
```

这样做的好处：

- 易于测试。
- 易于支持 undo/redo。
- 易于支持批量编辑。
- 易于把 UI 预览层从 React Grid 替换为 Phaser preview。

---

## 9. 校验规则

### 9.1 Schema 校验

使用现有 Ajv / content schema 机制校验 `content/maps/*.json`。

### 9.2 引用完整性校验

第一版至少应校验：

- `originTileId` 必须存在于 `tiles`。
- `initialDiscoveredTileIds` 中所有 id 必须存在于 `tiles`。
- `objectIds` 中所有 id 必须存在于 map object definitions。
- tile id 必须唯一。
- tile `row` / `col` 必须在 `size.rows` / `size.cols` 范围内。
- tile id 与 row/col 规则应一致，例如 `4-4` 对应 row 4 col 4。

### 9.3 Warning 级校验

以下可以先作为 warning：

- tile 数量与 `rows * cols` 不一致。
- `areaName` 为空。
- `terrain` 为空。
- `weather` 为空。
- `environment` 部分字段缺失。
- 多个地块使用非常相似但不完全一致的 terrain / weather 文案。

---

## 10. 地图预览实现

### 10.1 第一版使用 React CSS Grid / SVG

第一版可使用 CSS Grid：

```tsx
<div
  className="map-grid"
  style={{ gridTemplateColumns: `repeat(${cols}, minmax(72px, 1fr))` }}
>
  {tiles.map((tile) => (
    <button
      key={tile.id}
      type="button"
      className="map-tile"
      data-selected={selectedTileId === tile.id}
      data-origin={originTileId === tile.id}
      data-initial-discovered={initialDiscoveredTileIds.includes(tile.id)}
      onClick={() => dispatch({ type: "select_tile", tileId: tile.id })}
      style={{ backgroundColor: getTerrainFillColor(tile.terrain) }}
    >
      <span className="tile-id">{tile.id}</span>
      <span className="tile-area">{tile.areaName}</span>
      <span className="tile-terrain">{tile.terrain}</span>
    </button>
  ))}
</div>
```

每个 tile 显示：

- id
- areaName
- terrain
- object count badge
- special state badge
- origin marker
- initial discovered marker
- selected outline

### 10.2 贴图支持的后续路径

第一版不用 Phaser，也不阻止未来贴图支持。

后续可以有两条路线：

1. React Grid 直接用 CSS background image 渲染贴图。
2. 将中间预览替换为 Phaser preview。

关键是保持数据流不变：

```text
Map JSON draft
  ↓
derive grid / preview view model
  ↓
preview component
  ↓
editor command
  ↓
draft reducer
```

只要预览组件只发出 command，不持有权威数据，就可以随时替换。

---

## 11. 不做 Phaser 的原因

第一版不使用 Phaser，并不是否定 Phaser，而是为了收敛复杂度。

Phaser 更适合：

- 大地图性能优化。
- 平滑缩放 / 拖拽。
- tileset atlas。
- 多图层渲染。
- 更接近游戏内最终视觉效果的 preview。

但第一版更需要：

- 快速形成 JSON 编辑闭环。
- 高可靠表单编辑。
- 清晰校验错误。
- 稳定保存。
- 简单测试。
- 低耦合架构。

因此第一版用 React Grid / SVG 更合适。

后续如果加入 Phaser，也应定位为：

> Phaser 只做 preview 和 tile interaction，React 仍然是编辑器主控。

---

## 12. 推荐 PR 拆分

### PR 1：Map editor data loader

目标：打通地图内容读取。

内容：

- 新增 `mapContentStore.mjs`。
- 新增 `GET /api/map-editor/library`。
- 读取 `content/maps/default-map.json`。
- 读取 map schema。
- 读取 object definitions。
- 增加 helper 单元测试。

### PR 2：React Grid Map Editor

目标：实现只读地图编辑器页面。

内容：

- 新增 `/maps` 或对应 editor route。
- 新增 `MapEditorPage`。
- 新增 `MapGridPreview`。
- 新增 `TileInspector` 只读版本。
- 点击 tile 后展示详情。

### PR 3：Tile editing

目标：支持编辑基础 tile 字段。

内容：

- 实现 reducer。
- 编辑 `areaName` / `terrain` / `weather`。
- 编辑 environment。
- dirty state。

### PR 4：Object / SpecialState editing

目标：支持地块对象与特殊状态编辑。

内容：

- objectIds 添加 / 删除。
- specialStates 添加 / 删除 / 编辑。
- 引用选择器。
- 基础校验提示。

### PR 5：Save / Validate

目标：形成完整保存闭环。

内容：

- 新增 `POST /api/map-editor/validate`。
- 新增 `POST /api/map-editor/save`。
- 保存前 schema + 引用校验。
- 保存成功提示。
- 保存失败错误展示。

### PR 6：Editor quality improvements

目标：提高可用性。

内容：

- Undo / redo。
- JSON preview。
- Validation panel 错误跳转。
- Terrain / weather / areaName suggestions。

---

## 13. 后续演进方向

### 13.1 批量编辑与画笔模式

当单 tile 编辑稳定后，可以支持：

- 多选 tile。
- 批量设置 terrain。
- 批量设置 areaName。
- 批量设置 weather。
- terrain brush。
- object brush。
- special state brush。

### 13.2 地图尺寸编辑

后续支持 rows / cols 修改时，需要处理：

- 新增 tile 的默认值。
- 裁剪 tile 的确认流程。
- originTileId 失效。
- initialDiscoveredTileIds 失效。
- objectIds / specialStates 保留。

### 13.3 Tileset preview

未来可以编辑：

- tileset registry。
- terrain 到 sprite 的映射。
- tile background preview。

### 13.4 Phaser Preview

如果地图规模扩大或贴图需求增强，可以引入独立的 `EditorMapScene`。

建议结构：

```text
shared map rendering helpers
  ├── terrain color
  ├── tile position
  ├── tileset registry loader
  ├── coordinate utils
  └── maybe base camera controls

game MapScene
  └── runtime viewer

editor EditorMapScene
  └── authoring preview
```

不要复用游戏内 `MapScene` 原样，因为游戏 scene 包含大量 runtime viewer 逻辑，例如 crew marker、route preview、movement tween、trail、游戏 tooltip 等。

---

## 14. 验收标准

第一版完成后，应满足：

1. 可以打开 editor 并进入地图编辑器页面。
2. 可以读取 `default-map.json`。
3. 可以看到完整地图网格。
4. 点击任意 tile 可以查看详情。
5. 可以修改 tile 的基础字段。
6. 可以修改 environment。
7. 可以添加 / 删除 objectIds。
8. 可以添加 / 删除 / 修改 specialStates。
9. 可以设置 origin tile。
10. 可以切换 initial discovered tile。
11. 修改后显示 dirty 状态。
12. 保存前执行 schema 和引用校验。
13. 校验失败时不写文件，并显示错误。
14. 校验成功后写回格式化 JSON。
15. 保存后的 JSON 能通过 `npm run validate:content`。

---

## 15. 最终建议

第一版地图编辑器应聚焦于最小但完整的内容编辑闭环：

> **读取地图 JSON → 可视化选择 tile → 编辑字段 → 校验 → 保存 JSON。**

不使用 Phaser 是合理选择。它能降低第一版复杂度，让地图编辑器更接近事件编辑器的 authoring tool 架构，并避免过早绑定游戏运行时地图渲染逻辑。

只要第一版保持 React draft state 作为权威状态，未来无论升级到 SVG、Canvas、tileset preview 还是 Phaser preview，都不会推翻当前架构。

