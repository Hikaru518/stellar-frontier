# 地图编辑器与素材库实施计划

## Summary

- 地图编辑器定位为 content authoring tool，负责创建和维护可被游戏消费的静态地图 JSON，而不是游戏运行时 UI。
- 编辑器应独立于游戏内地图页：不复用 `MapPage`、`PhaserMapCanvas` 或游戏 runtime `MapScene`；React draft state 是编辑器事实源，预览层只负责显示和发出编辑命令。
- 原设计的 P0 偏向“现有地图属性编辑器”，不符合已确认的“策划用素材创建地图”。首版需要前移：新建地图、自定义图层、素材 palette、画笔/橡皮、保存视觉图层引用。
- 仍不在 editor 内使用 Phaser；editor 用 React/CSS sprite preview 做 authoring，PC 的 Phaser 地图读取保存后的视觉层用于运行时展示。
- 一个 PR 可行，但按提交拆开：内容模型/资源、helper API、editor UI、PC Phaser 消费、验证收尾。

## Design Assessment

- 保留的设计原则：
  - 地图编辑器属于 `apps/editor`，通过 editor helper 读写 `content/maps/*.json`。
  - 编辑状态必须存在 React reducer/state 中，保存时从 draft 生成 JSON；不能把 Canvas/Phaser 内部状态反向导出为内容事实源。
  - 编辑器只共享 content schema、TypeScript 类型、坐标工具、地形/贴图映射、引用校验与 JSON 格式化工具，不共享游戏运行时页面或 scene。
  - 地图属性编辑仍需要覆盖 `areaName`、`terrain`、`weather`、`environment`、`objectIds`、`specialStates`、`originTileId` 和 `initialDiscoveredTileIds`。
- 需要修正的范围判断：
  - 只读取并编辑 `default-map.json` 不够；首版必须支持新建地图文件、设定尺寸，并生成完整 `rows x cols` tiles。
  - 只做 CSS Grid 颜色预览不够；素材库是地图编辑器的核心输入，策划必须能从 `assets/` 中选择贴图并铺到地图上。
  - 将 tileset 支持放到后续版本不合适；本轮应把自定义图层、素材 palette、画笔和橡皮纳入首版核心闭环。
  - 仍不需要在 editor 内引入 Phaser。Phaser 只属于 PC runtime 地图展示；editor 预览可以用 React/CSS sprite background 完成。

## Key Changes

- 新建分支：从当前 `feature/phaser-map` 创建 `codex/map-editor-assets`；完成后切回 `feature/phaser-map` 并 merge 回来，保留多个 commit。
- 扩展地图 JSON schema：在 map 顶层新增可选 `visual.layers`，每层包含 `id/name/visible/opacity/cells`；`cells` 以 `tileId -> { tilesetId, tileIndex }` 保存策划铺设的素材引用。
- 扩展 tileset registry：填充 `content/maps/tilesets/registry.json`，把 `assets/kenney_tiny-battle/Tilemap/tilemap_packed.png` 作为首个素材集；保留 `assets/` 为源资产，PC runtime 使用 public copy。
- 更新内容校验：校验所有 `content/maps/*.json`、tileset registry、visual layer 的 tileId、tilesetId、tileIndex 与 asset path；`default-map` 仍可保持 8x8，新增地图允许按 editor 创建尺寸校验。
- 新增 editor helper API：
  - `GET /api/map-editor/library`
  - `POST /api/map-editor/validate`
  - `POST /api/map-editor/save`
  - `GET /api/map-editor/assets?path=...`
- 新增 Map Editor UI：启用 editor 顶部 Map 模块；支持打开/新建地图、设定尺寸、自定义图层新增/重命名/排序/隐藏/删除、素材 palette、画笔/橡皮/选择模式、tile inspector、dirty 状态、validation panel、保存。
- 更新 PC Phaser 地图：`mapView` 派生每个 tile 的 sprite layers；`MapScene` 预加载 registry spritesheet，优先渲染视觉层，未铺素材时回退现有地形色块。

## Commit Plan

1. `content: add map visual layers and tileset registry`
2. `editor-helper: add map library validation save and asset serving`
3. `editor: add map editor authoring UI with custom layers`
4. `pc-map: render authored visual layers in Phaser`
5. `test: cover map editor flows and content validation`

## Test Plan

- `npm run validate:content`
- `npm run editor:test`
- `npm run lint`
- `npm run test`
- 手动验收：启动 `npm run editor:helper` 与 `npm run editor:dev`，新建地图，新增图层，从 Kenney palette 选择 tile，画到网格，保存后重新打开仍能还原。
- 手动验收 PC 地图：打开地图页，确认有视觉层时显示 spritesheet 贴图，无视觉层时仍显示现有色块 fallback。

## Assumptions

- 首版不做 Tiled `.tmx` 导入、自动铺边/auto-tiling、复杂 tileset 标签分类、运行时地图文件切换。
- 新建地图默认生成完整 `rows x cols` gameplay tiles，默认 terrain 为 `平原`、weather 为 `晴朗`、origin 为中心格，visual layers 初始为空，由策划手动创建。
- Kenney Tiny Battle 资产为 CC0，可作为首个内置素材库。
