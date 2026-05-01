# 地图编辑器策划体验 research

## Research Scope

本轮 research 服务于地图编辑器的产品体验设计，重点回答：

- 当前项目已有地图编辑器计划是否足以支撑策划用 `assets/` 中的 tile 素材拼地图。
- 策划新建地图、规定尺寸、逐 tile 铺设、分层查看和保存内容时，需要哪些基础体验。
- 成熟 tile map editor 的常见工作流中，哪些应进入本项目 MVP。

## Project Findings

### 现有 editor 状态

- `apps/editor/src/App.tsx` 当前只有 Event Editor 可用；Map Editor 在顶部导航中仍是 `Future` 且 disabled。
- `apps/editor/helper/server.mjs` 当前只支持 `GET /api/health` 和 `GET /api/event-editor/library`，并且只允许 GET。地图编辑器若要保存地图，需要新增 map-specific library / validate / save / asset serving API。
- Event Editor 的现有模式是合理参考：helper 从 `content/` 读取 JSON，React UI 展示，保存前走 schema / 引用校验。地图编辑器也应沿用本地 helper + React draft state 的模式。

### 当前地图内容与 schema

- `content/maps/default-map.json` 是当前唯一地图文件，尺寸为 `8 x 8`，包含完整 tile 列表、`originTileId`、`initialDiscoveredTileIds`、tile 的 `areaName / terrain / weather / environment / objectIds / specialStates`。
- `content/schemas/maps.schema.json` 当前不允许额外字段，地图顶层也没有 `visual` 或 `layers` 字段；要保存视觉层，必须扩展 schema。
- `content/maps/tilesets/registry.json` 当前为空。要把 `assets/` 当作地图编辑器资源，必须新增 tileset registry 数据，并把 asset path、tile size、columns、tile count 等信息变成可校验内容。

### 当前 assets 形态

- `assets/kenney_tiny-battle/` 已包含 `Tilemap/tilemap.png`、`Tilemap/tilemap_packed.png`、`Tiles/tile_0000.png` 到 `tile_0197.png`、`Preview.png`、`Sample.png`、Tiled 示例 `.tmx/.tsx` 和 license。
- `Tilesheet.txt` 标明 tile size 是 `16 x 16`，sheet 是 `18 x 11`，共 `198` 个 tile；`sampleSheet.tsx` 使用 spacing 为 `1px` 的 `tilemap.png`。
- 从策划体验看，198 个 tile 直接裸排可用但不好用；至少需要放大预览、tile index、最近使用，最好有简单分类。

### 当前 PC Phaser 地图

- `apps/pc-client/src/phaser-map/mapView.ts` 目前为 Phaser 地图生成 tile view，主要字段是地形色块、语义文本、路线、队员标记和选择状态。
- `apps/pc-client/src/phaser-map/MapScene.ts` 的 `redrawTerrain` 当前以 rectangle 色块渲染 terrain。若地图 JSON 增加视觉层，PC runtime 可以优先渲染视觉 sprite layer，再保留色块 fallback。
- 地图编辑器不应复用 PC runtime 的 `MapPage / PhaserMapCanvas / MapScene`。这些组件含有 runtime discovered state、crew marker、route、camera、hover popup 等游戏状态，对静态 authoring 是噪音。

### 对现有计划的评估

- 已迁入本轮目录的 `map-editor-assets-implementation-plan.md` 方向正确：已经把新建地图、尺寸、自定义图层、素材 palette、画笔 / 橡皮、保存视觉层纳入计划。
- 该实施计划仍偏工程清单，缺少可验收的策划用户旅程：如何开始新地图、如何从素材中选 tile、如何铺底图和对象层、如何切换层级视图、如何检查视觉层与 gameplay 语义层的关系。
- 原始设计 `map-editor-original-design.md` 适合作为“地图 JSON 字段编辑器”的基础，但它把 tileset、画笔、尺寸编辑、图层开关放得太靠后，不满足“策划用素材拼地图”的目标。

## Best Practice Findings

### Tile editor 的主交互是 palette + brush

Tiled 官方文档把 Stamp Brush 描述为编辑 tile layer 的主工具，可用于绘制单个 tile 或更大的 stamp；stamp 通常来自 tileset view 中选中的一个或多个 tile。来源：[Tiled Editing Tile Layers](https://doc.mapeditor.org/en/stable/manual/editing-tile-layers/)

LDtk 官方文档也采用类似流程：创建 tileset、创建 tile layer、使用 tile picker，然后按住左键绘制，按住 Shift 点击拖拽绘制矩形，Shift 单击填充区域。来源：[LDtk Tile layers](https://ldtk.io/docs/general/tile-layers/)

设计含义：

- 本项目 MVP 不应把“从 palette 拖拽 tile 到地图”作为主流程。拖拽适合放置对象或 prefab，但逐 tile 绘制的主流程应是：点击 palette 选 tile，地图点击 / 拖动绘制。
- Brush、Eraser、Fill、Rectangle Fill、Eyedropper 是更符合策划肌肉记忆的工具组。

### 图层必须是 authoring 的一等对象

Tiled 官方文档指出 tile map 内容按 layer 组织，layer 顺序决定渲染顺序；layer 可以隐藏、部分透明、锁定，也可以用 group layer 组织。来源：[Tiled Working with Layers](https://doc.mapeditor.org/en/stable/manual/layers/)

LDtk 的 JSON 概览中，tile layer 数据按显示顺序保存 tile，先出现的 tile 在下方，后出现的 tile 在上方。来源：[LDtk Layer instances](https://ldtk.io/docs/game-dev/json-overview/layer-instances/)

设计含义：

- 本项目 MVP 至少需要 `visible / locked / opacity / order / active layer`，否则策划无法可靠查看“不同层级下的感觉”。
- `solo layer` 虽然不是保存数据必须项，但对调试图层很有价值，应纳入 MVP 或强 P1。
- 每次 brush / eraser 只作用于 active layer；locked layer 必须不可编辑。

### Fill / Shape / Selection 是效率工具，不是奢侈功能

Tiled 的官方工具集中包括 Bucket Fill、Shape Fill、Eraser、Selection Tools。Bucket Fill 用于快速填充空区域或相同 tile 区域；Shape Fill 用于填充矩形或椭圆；Eraser 左键擦单 tile，右键可擦矩形区域。来源：[Tiled Editing Tile Layers](https://doc.mapeditor.org/en/stable/manual/editing-tile-layers/)

设计含义：

- 如果只有单 tile 点击绘制，策划创建 `16 x 12` 或更大地图会非常慢。
- MVP 至少需要 brush 拖动连续绘制、eraser、bucket fill；rectangle fill 可以作为 P0.5 / P1，但如果新建地图尺寸会大于 `8 x 8`，它应进入 MVP。

### Auto-tiling / terrain brush 可以后置

Tiled 的 Terrain Brush 用于处理地形过渡和边角匹配，但它依赖 tileset 中预先定义 terrain sets。来源：[Tiled Using Terrains](https://doc.mapeditor.org/en/stable/manual/terrain/)

设计含义：

- 当前 Kenney Tiny Battle 素材没有项目内维护的 terrain metadata，因此 P0 不应承诺 auto-tiling。
- 可以先做手动铺设 + 简单分类；后续再给 tileset registry 增加 terrain tags / edge rules。

## UX Implications

- 地图编辑器的第一屏应是工作台，而不是说明页：左侧文件 / 图层，中间地图画布，右侧 palette / inspector，底部 validation / save。
- 新建地图必须是 P0：策划输入 `id/name/rows/cols` 后，系统生成完整 gameplay tiles 和空 visual layers。
- 视觉层和 gameplay 语义层应默认分离：铺水面 tile 不自动修改 `terrain`，除非策划启用 semantic brush 或在 inspector 中明确修改。
- 保存内容时既要保存 gameplay tile 字段，也要保存 visual layer cells；validation 需要同时检查 schema、引用、tileset id、tile index、越界 cell。
- 现有 implementation plan 应补充一份面向策划体验的 design 文档，明确主交互、图层模型、视图模式、失败路径、验收标准和 open questions。

## Sources

- Tiled Documentation, Editing Tile Layers: https://doc.mapeditor.org/en/stable/manual/editing-tile-layers/
- Tiled Documentation, Working with Layers: https://doc.mapeditor.org/en/stable/manual/layers/
- Tiled Documentation, Using Terrains: https://doc.mapeditor.org/en/stable/manual/terrain/
- LDtk Documentation, Tile layers: https://ldtk.io/docs/general/tile-layers/
- LDtk Documentation, Layer instances: https://ldtk.io/docs/game-dev/json-overview/layer-instances/
