---
topic: map-editor-ux
date: 2026-05-01
status: approved
source:
  initial: docs/plans/2026-05-01-22-43/initial.md
  research: docs/plans/2026-05-01-22-43/research.md
  interview: docs/plans/2026-05-01-22-43/map-editor-ux-interview.md
---

## 1. 一句话总结

为内容策划提供一个独立的地图 authoring 工具，使策划可以从 `assets/` 中选择 tile 素材，新建指定尺寸的地图，通过 palette、brush、fill、图层和预览模式拼出视觉地图，并在同一工作流中维护每个 tile 的 gameplay 语义数据，最终保存为可被游戏运行时消费的 `content/maps/*.json`。

## 2. 背景与问题（As-is）

- **当前做法**：项目已有配置驱动地图内容，地图数据存于 `content/maps/*.json`，PC runtime 已有 Phaser 地图展示；`apps/editor` 目前只开放 Event Editor，Map Editor 仍是 Future。
- **痛点/成本**：原始地图编辑器设计更偏“编辑已有 JSON 字段”，现有 implementation plan 虽然加入了素材库和图层，但还没有定义策划如何从空白地图开始选素材、铺图、分层检查、维护 gameplay 语义和保存。
- **为什么现在做**：`assets/kenney_tiny-battle/` 已经提供 198 个 16x16 tile 和示例地图，若要让策划实际用这些资产拼地图，MVP 必须从“字段编辑器”升级为“tile map authoring 工具”。

## 3. 目标（Goals）

- 支持策划新建地图，输入 `id/name/rows/cols` 后自动生成完整 gameplay tiles 和空 visual layers。
- 支持从 `assets/` 注册的 tileset 中选择素材，并用 brush / eraser / fill / rectangle / eyedropper 在 active layer 上逐 tile 铺图。
- 支持基础图层工作流：新增、重命名、排序、删除、active、visible、locked、opacity、solo。
- 支持 `Final Art`、`Gameplay Overlay`、`Layer Solo` 三种预览，帮助策划同时检查视觉效果和 gameplay 语义。
- 支持通过 inspector 和 semantic brush 编辑 `terrain/weather/objectIds/specialStates/origin/initialDiscovered` 等玩法语义，且默认不让视觉铺图自动改 gameplay 数据。
- 保存前提供 validation，确保地图 JSON、视觉层、tileset 引用和 gameplay 引用可被 runtime 消费。

### 3.1 术语说明

- **gameplay tile**：地图 JSON 中参与游戏规则的格子数据，包括 `terrain`、`weather`、`environment`、`objectIds`、`specialStates` 等。
- **visual layer**：地图 JSON 中用于保存视觉铺图结果的图层。每层记录某些 tile 上使用了哪个 tileset 的哪个 tile index。
- **tileset / palette**：tileset 是一组来自 `assets/` 的 tile 素材定义；palette 是编辑器里供策划浏览、筛选和选择素材的面板。
- **active layer**：当前 brush / eraser / fill 操作会修改的图层。
- **inspector**：选中某个地图格后显示的详情面板，用于精修该格的 gameplay 数据。
- **semantic brush**：批量修改 gameplay 语义的画笔，例如刷 `terrain=水` 或批量添加某个 `objectId`。
- **Final Art**：只看视觉层叠后的最终地图效果。
- **Gameplay Overlay**：在视觉地图上叠加 terrain、weather、object、special state、origin、initial discovered 等玩法信息。
- **Layer Solo**：临时只看某个图层的编辑器视图，用于检查分层铺图效果。

## 4. 非目标（Non-goals）

- 本轮不做 Tiled `.tmx` 导入 / 导出，也不把 Tiled 作为编辑器运行依赖。
- 本轮不做 auto-tiling、terrain edge rules、随机笔刷、multi-tile stamp、prefab 或复杂素材规则系统。
- 本轮不做完整素材管理器：不支持在 UI 中编辑素材 tag、上传新 tileset、收藏夹、多项目素材库。
- 本轮不在 editor 内使用 Phaser；editor 预览由 React/CSS sprite grid 承担，Phaser 只在 PC runtime 消费保存结果。
- 本轮不做运行时玩法调试视图，例如 collision、walkability、event trigger、danger heatmap。
- 本轮不做游戏内地图文件切换流程；保存出多张 map JSON 后，runtime 如何选择地图另行设计。

## 5. 目标用户与使用场景

### 5.1 用户画像

- **内容策划 / 关卡策划**：需要从素材库拼出可玩的网格地图，同时维护每个 tile 的地形、天气、对象和特殊状态。
- **开发者 / 内容维护者**：需要确认地图 JSON、visual layer、tileset registry 和 runtime 渲染之间的数据契约是否稳定。

### 5.2 典型场景（Top 3）

- **S1：从零创建地图**：策划点击 New Map，输入尺寸和基础信息，系统生成完整格子；策划用 palette + brush 铺底图、道路、水域、对象层，保存为新 map JSON。
- **S2：给已有地图补视觉层**：策划打开 `default-map`，保留已有 gameplay tile 数据，新增 visual layers，把现有地形色块替换为 Kenney tile 组合。
- **S3：检查视觉与玩法语义是否一致**：策划在 `Final Art` 和 `Gameplay Overlay` 间切换，检查水域是否标成水、危险区域是否有 special state、初始探索范围是否合理。

## 6. 用户旅程（To-be）

1. 策划打开 Game Editor，点击顶部 `Map` 模块，进入地图编辑器工作台。
2. 策划点击 `New Map`，输入 `id/name/rows/cols`；系统生成完整 gameplay tiles、默认 origin、默认 initial discovered 和空 visual layers。
3. 编辑器显示三栏工作区：左侧地图文件与图层，中间可缩放地图网格，右侧素材 palette / inspector，底部 validation 与保存状态。
4. 策划在 palette 中选择一个 grass tile，工具自动切到 Brush；在 active layer 上点击或按住拖动，连续铺设底图。
5. 策划切换 water / road / object / shadow 等分类，用 Brush、Bucket Fill、Rectangle Fill、Eraser 和 Eyedropper 快速调整地图结构。
6. 策划在 layer panel 中新增、重命名、排序、隐藏、锁定或 solo 图层，分别检查 terrain、road、objects、overlay/shadow 的层叠效果。
7. 策划切换到 `Gameplay Overlay`，选择 semantic brush 或点选单格打开 inspector，设置 `terrain/weather/objectIds/specialStates/origin/initialDiscovered`。
8. 编辑器实时显示 dirty 状态和 validation；策划点击错误项时，地图定位到对应 tile 或图层。
9. 策划点击 Save；helper 校验 schema、引用、tileset、tile index 和边界，成功后写入 `content/maps/*.json`。
10. 策划重新打开地图或进入 PC 地图页，确认视觉层能还原，未铺视觉层的格子仍有地形色块 fallback。

### 6.1 失败路径与边界

- **F1：helper 未启动**：编辑器显示 helper unavailable，提示启动 `npm run editor:helper`，不允许进入保存流程。
- **F2：地图尺寸或 id 不合法**：New Map 表单直接显示错误，不生成 draft。
- **F3：保存校验失败**：不写文件，保留当前 draft，并在 validation panel 中列出可跳转错误。
- **F4：误刷 locked layer**：locked layer 不接受 brush / eraser / fill 操作，UI 给出轻量提示。
- **F5：素材引用失效**：palette 中标记缺失 tileset；地图格显示 fallback，validation 阻止保存或要求修复引用。

## 7. 约束与假设

### 7.1 约束（Constraints）

- **C1：文档自包含**：设计必须保存在 `docs/plans/2026-05-01-22-43/`，不能依赖 `tmp/` 或已删除的旧 plan 目录。
- **C2：编辑器独立**：Map Editor 属于 `apps/editor`，不复用 PC runtime 的 `MapPage`、`PhaserMapCanvas` 或 `MapScene`。
- **C3：React draft 是事实源**：编辑状态由 React reducer/state 持有，保存时生成 JSON；不能从 canvas/Phaser 内部反向导出内容。
- **C4：内容数据校验**：修改 `content/` 后必须通过 `npm run validate:content`；修改 editor 或 PC client 后必须通过 lint/test。
- **C5：地图运行时仍消费 JSON**：最终产物必须是 `content/maps/*.json` 和 tileset registry，而不是只存在编辑器本地状态。

### 7.2 假设（Assumptions）

- **A1**：Kenney Tiny Battle 资产可作为首个内置素材库使用。（验证方式：保留 license 文档，registry 记录来源和路径。）
- **A2**：MVP 地图尺寸以几十格到数百格为主，React/CSS grid 可承担 editor preview。（验证方式：用至少 `16 x 12` 和 `30 x 17` 进行手动性能检查。）
- **A3**：视觉层和 gameplay 语义默认分离能降低误改风险。（验证方式：手动验收中检查铺水面 tile 不会自动改 `terrain`。）
- **A4**：基础分类足以让策划找到常用素材。（验证方式：使用 Kenney 198 个 tile 做一次从零铺图 demo，记录找素材成本。）

## 8. 方案选择

### 选择的方案：React tile authoring editor

- **做法**：在 `apps/editor` 中实现独立 Map Editor，用 React/CSS grid 显示地图和 sprite preview；helper 负责读取、校验、保存 `content/maps/*.json` 和 tileset registry；PC Phaser runtime 只消费保存后的视觉层。
- **优点**：贴合现有 editor 架构，适合表单、validation、dirty state、undo/redo 和 JSON 保存；不会把运行时 crew、route、discovered state 带入 authoring 工具。
- **缺点/风险**：React/CSS grid 的大地图性能需要验证；视觉效果不会 100% 等同 PC Phaser runtime。
- **选择理由**：本轮目标是策划 authoring，不是 runtime 复刻；React 更适合承载素材 palette、图层面板、inspector 和 validation。

### 选择与理由（Decision）

- 视觉铺图与 gameplay 语义采用“默认分离 + 可选 semantic brush”。
- 铺图主交互采用“palette 选 tile，地图点击 / 拖动绘制”，而不是反复拖拽 tile 到地图。
- MVP 工具采用 `Select / Brush / Eraser / Bucket Fill / Rectangle Fill / Eyedropper / Undo / Redo`。
- MVP 图层采用 `active / visible / locked / opacity / rename / reorder / delete / solo`。
- MVP 预览采用 `Final Art / Gameplay Overlay / Layer Solo`。

### 方案的比较

| 方案 | 优点 | 缺点 | 结论 |
| --- | --- | --- | --- |
| React tile authoring editor | 适合内容编辑、校验、保存、表单和图层 UI | 大地图性能需验证 | 采用 |
| 复用 PC Phaser 地图 | 运行时视觉更一致 | 混入 crew、route、discovered state，authoring 状态复杂 | 不采用 |
| 直接集成 Tiled/LDtk 流程 | 成熟工具能力强 | 与本项目 JSON schema、helper、runtime 契约整合成本高 | 后续可参考，不作为本轮方案 |

## 9. 核心对象/数据

- **Map file**
  - **来源/归属**：`content/maps/*.json`
  - **关键字段**：`id/name/version/size/originTileId/initialDiscoveredTileIds/tiles/visual`
  - **生命周期**：由 Map Editor 新建、编辑、校验、保存；runtime 只读取消费。

- **Gameplay tile**
  - **来源/归属**：map JSON 的 `tiles[]`
  - **关键字段**：`id/row/col/areaName/terrain/weather/environment/objectIds/specialStates`
  - **生命周期**：新建地图时自动生成完整格子；通过 inspector 或 semantic brush 修改。

- **Visual layer**
  - **来源/归属**：map JSON 的 `visual.layers[]`
  - **关键字段**：`id/name/visible/locked/opacity/cells`
  - **生命周期**：由策划新增、排序、重命名、删除；brush / eraser / fill 只修改 active layer 的 cells。

- **Tileset registry**
  - **来源/归属**：`content/maps/tilesets/registry.json`
  - **关键字段**：`id/name/assetPath/tileWidth/tileHeight/columns/tileCount/categories`
  - **生命周期**：本轮内置 Kenney Tiny Battle；后续可扩展多 tileset。

- **Palette metadata**
  - **来源/归属**：tileset registry 或 editor 派生状态
  - **关键字段**：tile index、分类、最近使用、搜索关键字
  - **生命周期**：用于帮助策划找到素材，不直接决定 gameplay 语义。

- **Semantic brush preset**
  - **来源/归属**：editor draft state
  - **关键字段**：目标字段、目标值、应用范围
  - **生命周期**：只在编辑器交互中存在；应用后修改 gameplay tiles。

## 10. 范围与阶段拆分

### 10.1 MVP（本次必须做）

- Map Editor 模块入口、地图文件列表、打开已有地图、新建地图。
- 新建地图表单：`id/name/rows/cols`，自动生成完整 gameplay tiles、默认 origin 和 initial discovered。
- Tileset registry 接入 Kenney Tiny Battle，并在 editor 中提供基础可用 palette。
- Visual layers：新增、重命名、排序、删除、active、visible、locked、opacity、solo。
- 铺图工具：Select、Brush、Eraser、Bucket Fill、Rectangle Fill、Eyedropper、Undo、Redo。
- Inspector：编辑单 tile 的 gameplay 字段；Semantic brush：批量刷 terrain/weather/object/special state/origin/discovered。
- 三种预览：Final Art、Gameplay Overlay、Layer Solo。
- 保存与校验：map schema、tileset 引用、tile index、cell 边界、objectIds、origin、initial discovered。
- PC Phaser runtime 消费 visual layers；无视觉层时保留现有地形色块 fallback。

### 10.2 Later（未来可能做，但明确本轮不做）

- Tiled / LDtk 导入导出。
- Auto-tiling、terrain edge rules、随机笔刷、multi-tile stamp、prefab。
- 在 UI 中维护素材 tag、收藏夹、多 tileset 上传、素材备注。
- 运行时地图选择、跨地图移动、地图版本迁移工具。
- 更复杂的 debug 视图：walkability、event trigger、danger heatmap、探索热区。
- Phaser editor preview 或与 runtime scene 完全同构的预览。

## 11. User Stories（MVP）

### US-001: 新建地图
- **作为**：内容策划
- **我想要**：输入地图基础信息和尺寸来创建新地图
- **以便**：从空白地图开始用素材拼出新关卡
- **验收标准**：
  - [ ] 可输入 `id/name/rows/cols`
  - [ ] 系统生成 `rows x cols` 个 gameplay tiles
  - [ ] 自动设置默认 origin、initial discovered、terrain、weather、environment
  - [ ] 新地图可保存为 `content/maps/<id>.json`
- **不包含**：运行时地图选择
- **优先级**：P0
- **依赖**：map helper save API、map schema

### US-002: 使用素材 palette 铺图
- **作为**：内容策划
- **我想要**：从 Kenney palette 选择 tile，然后点击或拖动绘制
- **以便**：快速拼出地图视觉层
- **验收标准**：
  - [ ] palette 显示 tilesheet、tile index、放大预览、最近使用和基础分类
  - [ ] Brush 在 active layer 上点击 / 拖动绘制
  - [ ] Eraser 可清除 active layer 的 cell
  - [ ] Bucket Fill 和 Rectangle Fill 可批量填充
  - [ ] Eyedropper 可从地图格拾取视觉 tile
- **不包含**：auto-tiling、随机笔刷、multi-tile stamp
- **优先级**：P0
- **依赖**：tileset registry、visual layer model

### US-003: 管理视觉图层
- **作为**：内容策划
- **我想要**：新增、重命名、排序、隐藏、锁定和 solo 图层
- **以便**：分开维护 terrain、road、objects、overlay/shadow 并检查层叠效果
- **验收标准**：
  - [ ] 每次绘制只修改 active layer
  - [ ] locked layer 不可绘制或擦除
  - [ ] hidden layer 不参与 Final Art
  - [ ] opacity 影响编辑器预览和 runtime 展示
  - [ ] solo 只作为临时预览状态，不保存进 JSON
- **不包含**：group layer、blend mode、parallax
- **优先级**：P0
- **依赖**：visual layer schema

### US-004: 编辑 gameplay 语义
- **作为**：内容策划
- **我想要**：通过 inspector 和 semantic brush 修改 tile 的 gameplay 数据
- **以便**：让视觉地图与游戏规则保持可控一致
- **验收标准**：
  - [ ] 选中 tile 后 inspector 显示并可编辑 gameplay fields
  - [ ] Semantic brush 可批量设置 terrain、weather、objectIds、specialStates、origin、initial discovered
  - [ ] 普通视觉 brush 不自动修改 gameplay fields
  - [ ] Gameplay Overlay 能显示语义数据的整体分布
- **不包含**：自动从视觉 tile 推断 gameplay 语义
- **优先级**：P0
- **依赖**：map schema、object definitions

### US-005: 校验并保存地图
- **作为**：内容策划
- **我想要**：保存前看到所有 schema、引用和视觉层错误
- **以便**：避免提交 runtime 无法消费的地图 JSON
- **验收标准**：
  - [ ] validation panel 显示错误并可跳转到 tile / layer
  - [ ] 校验失败不写入文件
  - [ ] 校验 tileset id、tile index、cell tileId、origin、initial discovered、objectIds
  - [ ] 保存成功后 dirty 状态清除，重新打开可还原
- **不包含**：自动修复所有错误
- **优先级**：P0
- **依赖**：helper validate/save API

### US-006: Runtime 展示视觉层
- **作为**：开发者 / 内容维护者
- **我想要**：PC Phaser 地图消费保存后的 visual layers
- **以便**：editor 产物能在游戏地图页看到
- **验收标准**：
  - [ ] 有 visual layers 的 tile 显示 spritesheet tile
  - [ ] 多层按 order 和 opacity 叠加
  - [ ] 没有视觉层的 tile 回退现有 terrain 色块
  - [ ] 现有 crew marker、route preview、selection、area label 不被破坏
- **不包含**：runtime 地图文件选择
- **优先级**：P0
- **依赖**：PC Phaser mapView / MapScene 更新

## 12. 成功标准（如何判断做对了）

- [ ] 策划可以在 Map Editor 中从零新建一张至少 `16 x 12` 的地图，并保存为新的 map JSON。
- [ ] 策划可以用 Kenney palette 在不同 visual layers 上铺 terrain、water、road、objects、shadow，并通过 visible/locked/opacity/solo 检查效果。
- [ ] Brush 支持点击和拖动绘制；Eraser、Bucket Fill、Rectangle Fill、Eyedropper 都可在 active layer 上工作。
- [ ] 普通视觉 brush 不会自动修改 `terrain/weather/objectIds/specialStates`；semantic brush 或 inspector 才会修改 gameplay 语义。
- [ ] `Final Art`、`Gameplay Overlay`、`Layer Solo` 三种预览能帮助策划发现视觉和语义不一致的问题。
- [ ] 保存前 validation 能捕捉 schema、tileset id、tile index、cell 越界、objectId、origin、initial discovered 等错误。
- [ ] 保存成功后重新打开地图，视觉层、图层设置和 gameplay 数据保持一致。
- [ ] PC Phaser 地图可以显示 visual layers；无视觉层时仍使用现有 terrain 色块 fallback。
- [ ] `npm run validate:content`、`npm run editor:test`、`npm run lint`、`npm run test` 在相关实现完成后通过。

### 12.2 使用效果（Outcome）

- **策划效率**：不需要手写 JSON，也不需要在 198 个 tile 中反复猜 index，就能完成一张可保存、可预览、可被 runtime 消费的地图。
- **数据安全**：视觉铺图和 gameplay 语义默认分离，降低误改规则数据的风险。
- **实现可控**：MVP 避免 auto-tiling、复杂素材管理器和 runtime 地图切换，先完成完整 authoring 闭环。

## 13. 风险与缓解

- **R1：React/CSS grid 在较大地图上性能不足**
  - **缓解**：MVP 用 `16 x 12` 和 Kenney 示例规模 `30 x 17` 做验收；若交互明显卡顿，再考虑 viewport virtualization 或 canvas preview。

- **R2：基础素材分类不够好，策划仍然找不到 tile**
  - **缓解**：先提供分类、tile index、放大预览、最近使用；demo 后根据实际找素材成本再补 tag / favorites。

- **R3：视觉层与 gameplay 语义分离导致重复维护**
  - **缓解**：提供 `Gameplay Overlay` 和 semantic brush；让策划明确选择何时批量修改语义，而不是自动猜测。

- **R4：editor 预览与 PC Phaser runtime 渲染不一致**
  - **缓解**：共享 tileset registry、tile index 计算和 layer order 规则；手动验收 editor 保存后 PC 地图还原效果。

- **R5：保存 API 误写或破坏现有 map JSON**
  - **缓解**：保存前 validate；保存失败不覆盖文件；保留稳定字段顺序；测试覆盖 helper save/validate；实现阶段注意不要改动无关内容。

- **R6：MVP 范围过大**
  - **缓解**：坚守本设计的 Non-goals，不做 auto-tiling、Tiled 导入、素材管理器和 runtime 地图切换。

## 14. 未决问题（Open Questions）

1. Kenney tile 的基础分类由谁维护在首次实现中更合适：直接写入 `tileset registry`，还是先作为 editor 内置 metadata？
2. 新建地图默认 `areaName` 是否统一使用占位名，例如 `未命名区域`，还是按坐标生成如 `区域 1-1`？
3. 新建地图默认 `environment` 数值是否沿用当前 `default-map` 的平均值，还是定义一组更中性的默认环境模板？
4. `locked` 是否需要保存进 map JSON，还是只作为编辑器临时状态？我倾向保存，因为它表达 authoring 意图；`solo` 则不保存。
5. `opacity` 在 PC runtime 中是否必须生效，还是只影响 editor preview？我倾向 runtime 也生效，因为 visual layer 是内容表达的一部分。
6. Map Editor 的第一版 demo 地图是否需要新增一个示例地图文件，还是只改 `default-map` 添加 visual layers？
