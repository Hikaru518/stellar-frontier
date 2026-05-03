# Map Editor UI Scenes

本文件说明 `map-editor-ui-scenes.pen` 中各 frame 的设计意图、对应 user story、关键交互和验收关注点。草图沿用项目低保真控制台美学：灰白工作台、深色文字、低饱和状态色；定位为内部 authoring tool，不是营销页面。

## Map Editor Shell / Open Existing Map

- **对应 user story**：US-001 新建地图、US-005 校验并保存地图。
- **关键交互**：从 helper 加载地图文件列表；选择已有 `content/maps/*.json`；保留 dirty state、helper 状态、schema/tileset 加载状态；右侧显示当前 tile 的基础 inspector 摘要。
- **验收关注点**：helper 可用性必须显式显示；打开已有地图不应丢失 gameplay 数据；工作台应稳定呈现文件列表、图层摘要、地图画布和 validation 状态。

## New Map Dialog

- **对应 user story**：US-001 新建地图。
- **关键交互**：输入 `id/name/rows/cols`；即时校验非法 id 和非法尺寸；创建 draft 前展示将生成的 gameplay tile 数量、默认 origin、initial discovered 和空 visual layers。
- **验收关注点**：合法输入生成 `rows x cols` 个 gameplay tiles；origin 和 initial discovered 有明确默认值；非法输入不创建 draft。

## Visual Painting / Brush + Palette

- **对应 user story**：US-002 使用素材 palette 铺图。
- **关键交互**：从 Kenney palette 搜索、按分类浏览、选择 tile index；选择 tile 后切换到 Brush；在 active layer 点击或拖动绘制；Eraser、Bucket、Rectangle、Eyedropper 与同一画布模型联动。
- **验收关注点**：绘制只写 active visual layer；普通 visual brush 不修改 `terrain/weather/objectIds/specialStates`；最近使用和放大预览能降低 tile index 查找成本。

## Layer Management / Solo + Locked

- **对应 user story**：US-003 管理视觉图层。
- **关键交互**：新增、重命名、排序、删除图层；切换 active、visible、locked、opacity、solo；对 locked layer 绘制时显示轻量提示且不修改 draft。
- **验收关注点**：每次绘制只影响 active layer；hidden layer 不参与 Final Art；opacity 进入 preview/runtime；solo 只是编辑器临时预览状态，不保存进 JSON。

## Gameplay Overlay / Inspector + Semantic Brush

- **对应 user story**：US-004 编辑 gameplay 语义。
- **关键交互**：切换 `Gameplay Overlay`；选择 overlay channel；选中 tile 后在 inspector 编辑 terrain、weather、objects、special states、origin、initial discovered；使用 semantic brush 批量修改 gameplay fields。
- **验收关注点**：visual paint 和 semantic edit 明确分离；overlay 能帮助发现视觉与语义不一致；semantic brush 只在用户明确选择后修改 gameplay tiles。

## Validation / Save Errors

- **对应 user story**：US-005 校验并保存地图。
- **关键交互**：保存前调用 helper authoritative validation；错误项显示 severity、code、定位路径和建议动作；点击错误跳转到对应 tile 或 layer；校验失败时 Save disabled。
- **验收关注点**：校验失败不写文件；能捕捉 tileset id、tile index、visual cell tileId、objectIds、origin、initial discovered 等错误；draft 保持可继续编辑。

## PC Runtime Preview / Discovered Visual Layers

- **对应 user story**：US-006 Runtime 展示视觉层。
- **关键交互**：展示保存后的 `visual.layers[]` 如何被 PC runtime 消费；对比 editor 完整地图和 PC discovered-only 渲染边界；说明 fallback 与覆盖顺序。
- **验收关注点**：已发现 tile 渲染 spritesheet tile；未发现/frontier tile 不泄露视觉层；无 visual cell 时保留 terrain 色块 fallback；crew marker、route preview、selection、area label 不被破坏。

## Verification

- Pencil MCP available. The `.pen` file uses stable frame ids `ME001` through `ME007` for screenshot/export verification.
- Verified JSON syntax with local parsing.
- Verified layout with Pencil MCP `snapshot_layout` (`No layout problems.`).
- Verified sampled screenshots for `ME001`, `ME003`, `ME005`, and `ME007`.
- Exported all seven frames through Pencil MCP to `/private/tmp/map-editor-ui-scenes-exports/` as PNGs.
