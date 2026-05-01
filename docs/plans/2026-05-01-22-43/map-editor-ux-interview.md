# 地图编辑器策划体验访谈记录

## 访谈上下文

本轮访谈基于：

- `docs/plans/2026-05-01-22-43/initial.md`
- `docs/plans/2026-05-01-22-43/research-topics.md`
- `docs/plans/2026-05-01-22-43/research.md`
- 已迁入本轮目录的 `map-editor-original-design.md`
- 已迁入本轮目录的 `map-editor-assets-implementation-plan.md`

访谈目的：厘清地图编辑器作为策划工具的用户体验范围，尤其是素材铺图、视觉层、gameplay 语义、新建地图和预览模式。

## Q1：视觉铺图和 gameplay 语义是否自动联动？

助手提出选项：

- A. 默认分离 + 可选语义画笔（推荐）：铺 Kenney tile 只修改 `visual.layers`；要改 `terrain/weather/objectIds` 时，用 inspector 或 semantic brush 明确修改。安全，适合内容 authoring。
- B. 强自动联动：比如铺水 tile 自动把 terrain 改成 `水`，铺建筑 tile 自动加 object。效率高，但需要维护 tile 分类规则，误改 gameplay 数据的风险更大。
- C. 完全分离：视觉层和 gameplay 字段永不联动。最安全，但策划会重复编辑视觉和语义，长期体验差。

用户追问：

> 什么是 inspedtor 或者 semantic brush?

助手解释：

- `inspector` 是右侧详情面板。点选地图上的某一个 tile 后，它显示并允许编辑该 tile 的玩法数据，例如 `areaName`、`terrain`、`weather`、`environment`、`objectIds`、`specialStates`。
- `semantic brush` 是“语义画笔”。普通 tile brush 只画视觉素材，例如水面 sprite、道路 sprite、树 sprite；semantic brush 批量修改玩法语义，例如 `terrain=水`、`weather=酸雨`、`objectIds=[signal_tower]`。
- 推荐“默认分离 + 可选 semantic brush”：策划先自由拼视觉地图，不自动改玩法数据；需要批量设定玩法语义时，再明确切换到 semantic brush。

用户回答：

> OK, 我选择 A

结论：采用 A。视觉铺图与 gameplay 语义默认分离，并提供可选 semantic brush。

## Q2：MVP 的铺图工具做到什么程度？

助手提出选项：

- A. 实用基础工具集（推荐）：包含 `Select`、`Brush`、`Eraser`、`Bucket Fill`、`Rectangle Fill`、`Eyedropper`、`Undo/Redo`。这能支持策划真正从空白地图快速铺出底图、湖泊、道路和对象层，复杂度仍可控。
- B. 最小工具集：只做 `Select`、`Brush`、`Eraser`、`Undo/Redo`。实现快，但新建稍大地图会很慢，策划需要重复拖刷大量格子。
- C. 完整高级工具集：在 A 基础上加 multi-tile stamp、随机笔刷、auto-tiling、素材 tag 规则。体验最好，但需要维护额外 tileset metadata，本轮风险明显变高。

用户回答：

> A

结论：MVP 采用实用基础工具集。

## Q3：MVP 的图层能力做到什么程度？

助手提出选项：

- A. 基础图层工作流（推荐）：每层支持 `active`、`visible`、`locked`、`opacity`、重命名、排序、删除；再提供 `solo` 作为查看单层效果的临时 UI 状态。这能满足策划分层铺 terrain、road、objects、overlay/shadow，并检查不同层级效果。
- B. 最小图层工作流：只支持新增、删除、排序、隐藏。实现更快，但容易误刷图层，也不方便检查半透明叠层和锁定底图。
- C. 高级图层工作流：支持 group layer、blend mode、tint、parallax、offset。更接近 Tiled，但对当前网格地图和 Kenney 素材来说过重。

用户回答：

> A

结论：MVP 采用基础图层工作流，`solo` 为编辑器临时 UI 状态。

## Q4：MVP 是否必须支持新建地图并设定尺寸？

助手提出选项：

- A. 必须支持（推荐）：策划可以输入 `id/name/rows/cols` 新建地图；系统生成完整 `rows x cols` gameplay tiles、默认 origin、默认 initial discovered、默认 terrain/weather/environment 和空 visual layers。这符合“策划从 assets 拼一张地图”的真实起点。
- B. 只支持复制现有地图再改：从 `default-map` 复制一份，然后编辑内容和视觉层。实现更简单，但不像真正的地图编辑器，而且会继承很多无关旧内容。
- C. 只编辑现有地图：不做新建，只给 `default-map` 加视觉层。最省事，但不满足用户之前提到的新建和规定大小。

用户回答：

> A

结论：MVP 必须支持新建地图、设定尺寸并自动生成完整 gameplay tiles。

## Q5：MVP 的素材库需要做到什么组织程度？

助手提出选项：

- A. 基础可用素材库（推荐）：显示 tilesheet 网格和独立 tile 放大预览；支持 tile index、最近使用、搜索 index；提供少量人工分类：terrain、water、road、building、nature、vehicle/unit、marker、shadow。策划能比较快找到常用 tile，工程复杂度仍可控。
- B. 裸 tilesheet：只展示 `18 x 11` 的完整 tile sheet，点击某个格子选择 tile。实现最快，但 198 个 tile 很难记，策划会频繁找素材。
- C. 完整素材管理器：支持 tag 编辑、收藏夹、素材备注、多 tileset 管理、自动分类。长期很好，但本轮不必要。

用户回答：

> A

结论：MVP 素材库采用基础可用素材库，不只是裸 spritesheet。

## Q6：MVP 需要哪些地图预览模式？

助手提出选项：

- A. 三种核心预览（推荐）：`Final Art` 看最终视觉层叠效果；`Gameplay Overlay` 在视觉图上叠加 terrain/weather/object/special state/origin/discovered；`Layer Solo` 临时只看当前图层。这能直接支撑策划检查“看起来对不对”和“游戏语义对不对”。
- B. 只做 Final Art + layer visibility：靠开关图层检查效果。实现更简单，但 gameplay 语义容易被隐藏在 inspector 里，不方便整体检查。
- C. 更多调试预览：增加 collision、walkability、event trigger、heatmap、danger map 等。后续有价值，但本轮会扩范围。

用户回答：

> A

结论：MVP 采用 `Final Art`、`Gameplay Overlay`、`Layer Solo` 三种核心预览。
