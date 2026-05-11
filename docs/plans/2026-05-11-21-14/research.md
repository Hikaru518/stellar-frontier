---
topic: region-based-map-system
date: 2026-05-11
research_scope:
  codebase: true
  internet: false
source:
  initial: docs/plans/2026-05-11-21-14/initial.md
  research_topics: docs/plans/2026-05-11-21-14/research-topics.md
---

## 1. Research Summary（研究摘要）

本轮研究关注 256 x 256 地图下，如何把玩家理解的“森林 / 村庄 / 飞船遗骸”等多格区域，从旧的单 tile 语义中拆出来。项目已经完成地图尺寸迁移：`content/maps/default-map.json` 是 256 x 256，包含 65,536 个显式 tile；`content/maps/radar/default-map-radar.json` 已经有 circle / box 的 `regions`，但这些 region 目前主要服务雷达显示和 label fallback，不是 gameplay 事实源。

关键结论：现在的 tile 同时承担移动坐标、点击焦点、区域名、地形、天气、环境读数、对象引用、特殊状态和调查状态。随着地图放大，这会让“大区域属性”和“一次性区域事件”难以表达。更自然的方向是保留 tile 作为移动 / 点击 / 路径单位，新增 gameplay area / region 层承载属性、对象归属、事件去重和玩家可见描述；tile 可以缓存或派生所属区域，但不应继续作为所有语义的唯一作者入口。

## 2. Project Findings（项目内发现）

### 2.1 Existing Patterns（现有模式）

- **地图已是 256 x 256 显式 tile**：默认地图尺寸为 `rows: 256, cols: 256`，并要求完整 tile coverage。校验脚本还要求默认地图必须是 256 x 256。（证据：`content/maps/default-map.json`、`apps/pc-client/scripts/validate-content.mjs`）
- **tile 是当前 gameplay 语义主载体**：`MapTileDefinition` 包含 `areaName`、`terrain`、`weather`、`environment`、`objectIds`、`specialStates`。运行时 `RuntimeMapTileState` 也以 tile id 存 `discovered`、`investigated`、`revealedObjectIds` 等。（证据：`content/schemas/maps.schema.json`、`apps/pc-client/src/content/contentData.ts`、`apps/pc-client/src/mapSystem.ts`）
- **已有 radar region，但只偏展示层**：`RadarRegionDefinition` 支持 `circle` / `box`、`priority`、`tone`；MapPage 在 tile 名为“未命名区域”时才用 region label fallback。它不参与对象、调查、事件或运行时状态。（证据：`content/schemas/map-radar.schema.json`、`apps/pc-client/src/pages/MapPage.tsx`）
- **地图对象定义已独立，但归属仍在 tile**：对象定义在 `content/map-objects/*.json`，运行时状态在 `map.mapObjects`；但对象出现在哪里仍由 `tile.objectIds` 决定。内容校验还禁止同一个 object id 被多个 tile 引用。（证据：`apps/pc-client/src/content/mapObjects.ts`、`apps/pc-client/scripts/validate-content.mjs`）
- **调查结算是 tile 级**：调查完成时只标记当前 tile 为 `investigated`，只揭示该 tile 的 `onInvestigated` objects。用户提出的“在区域内任一 tile 探索后，别的 tile 不再重复触发”当前没有一等状态承载。（证据：`apps/pc-client/src/callActionSettlement.ts`）
- **Editor 也是 tile inspector**：Map Editor 目前选择单 tile 后编辑 areaName、terrain、weather、environment、objectIds、specialStates 与 radar glyph/tone；没有区域创建、区域形状、区域对象或区域事件去重的 authoring 入口。（证据：`apps/editor/src/map-editor/TileInspector.tsx`、`apps/editor/src/map-editor/types.ts`）
- **事件与任务仍大量引用 tile id**：事件投影叫 `tile_state`，结构化事件、quest navigation、crew currentTile、移动路径都以 tile id 为位置锚点；这部分需要保留。（证据：`docs/game_model/event-integration.md`、`apps/pc-client/scripts/validate-content.mjs`）

### 2.2 Domain Knowledge（领域知识）

- 地图仍是只读态势图；移动、待命、停止、调查必须经“通讯台 → 通话”确认。新区域系统不能把地图变成直接下令入口。（来源：`docs/gameplay/map-system/map-system.md`、`docs/ui-designs/ui.md`）
- 当前地图文档已经区分“地形、区域名、地块对象、特殊状态、环境属性”，但这些概念仍大多落在 tile 字段上。（来源：`docs/gameplay/map-system/map-system.md`、`docs/game_model/map.md`）
- 事件系统要求通过结构化 condition / effect 读写状态，不能绕过地图模型直接改 `GameState`。区域状态也应有明确 source of truth。（来源：`docs/game_model/event-integration.md`）

### 2.3 Recent Changes（最近变更）

- `f385d52 Feature/game console UI migration (#40)`：把默认地图扩到 256 x 256，新增 radar JSON，MapPage 改为 ASCII / radar canvas 风格，移除了 Phaser tileset visual layer 相关代码。
- `71be27b Add IAFS runtime event chain (#41)`：强化 IAFS 事故现场对象与事件链，说明当前内容正在依赖 object status、revealed object 与 tile trigger 组合。
- `9236922 Add quest system and sidebar (#39)`：任务导航可指向 tile，后续区域系统若提供任务目标，应考虑“导航到区域代表点 / 最近 tile / 区域详情”的关系。
- `b042906 feat: phaser-map (#31)`：较早实现过 visual layer / tileset / Map Editor；最新 UI migration 已把这套视觉层弱化，当前地图系统更偏 radar / semantic map。

### 2.4 Technical Constraints（技术约束）

- `content/maps/*.json` 当前要求完整 tile coverage；在 65,536 tile 上重复 area / terrain / object 语义会带来内容维护成本。
- 地图对象当前不能跨 tile 引用同一 object id；这与“飞船遗骸占据多个 tile，但只探索一次”的需求冲突。
- 运行时存档与事件系统当前以 tile id 为锚点，不能直接用区域取代 tile；合理迁移应是 tile 保留坐标职责，区域成为更高层语义事实源。
- 当前没有互联网研究输入，本报告只基于项目文件与 git 历史。

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：新增 area / region 层 vs 继续在 tile 上堆字段

- **新增层的优势**：能直接表达“一个森林覆盖多个 tile”“一个飞船遗骸对象只属于一个区域”“区域探索一次后整体去重”；也能减少 256 x 256 下重复编辑。
- **继续堆 tile 字段的优势**：迁移小，现有事件 / Editor / validation 改动少。
- **建议**：新增 gameplay area / region 层。tile 继续是移动和点击单位，但其语义通过所属区域派生；必要时只保留少量 tile override。

### Trade-off 2：形状定义区域 vs 显式 tile 列表定义区域

- **形状定义的优势**：box / circle / polygon 更适合大地图 authoring，文件更小；现有 radar region 已有 box / circle 基础。
- **显式 tile 列表的优势**：能表达不规则连续填充和细粒度边界，查询直观。
- **建议**：MVP 支持 `box` 和 `tiles` 两类 shape；box 解决常见矩形区域，tiles 解决飞船遗骸、村庄轮廓等不规则区域。polygon / flood fill 可留到 Later。

### Trade-off 3：对象归属区域 vs 对象归属 tile

- **区域归属的优势**：符合用户目标，一个对象可以覆盖多格并共享探索状态；对象行动和事件去重不再绑死单坐标。
- **tile 归属的优势**：当前 call action、visible object 和事件触发代码已经能直接按 tile 查对象。
- **建议**：区域对象作为新 source of truth，tile 查询时返回“该 tile 所属区域中的可见对象”。短期可兼容旧 `tile.objectIds`，但新内容应走区域归属。

## 5. Key References（关键参考）

### 5.1 Project Files（项目文件）

- `content/maps/default-map.json` - 当前 256 x 256 默认地图与 tile 内容。
- `content/maps/radar/default-map-radar.json` - 现有 radar regions、glyphRows、toneRows。
- `content/schemas/maps.schema.json` - 当前 map/tile schema。
- `content/schemas/map-radar.schema.json` - 当前 radar region shape schema。
- `apps/pc-client/src/mapSystem.ts` - tile id、坐标、移动合法性与对象解析 helper。
- `apps/pc-client/src/pages/MapPage.tsx` - 玩家地图点击、focus label、radar region fallback。
- `apps/pc-client/src/callActionSettlement.ts` - 调查行动的 tile 级结算。
- `apps/editor/src/map-editor/TileInspector.tsx` - 当前 tile 级 Map Editor authoring。
- `apps/pc-client/scripts/validate-content.mjs` - 内容 cross-reference 与默认 256 x 256 校验。
- `docs/game_model/event-integration.md` - 事件系统访问 tile_state 的边界。

### 5.2 External Links（外部链接）

- 未进行互联网研究。

## 6. Open Questions for Design（留给 design 的问题）

- **Q1**：MVP 的“区域”是否只承担玩家可见属性、对象归属和事件去重，还是也要影响移动耗时、危险、天气、资源等规则？
- **Q2**：当一个 tile 属于多个区域时，玩家地图详情应该展示所有区域，还是只展示一个主区域加若干标签？
- **Q3**：区域探索后，“整个区域已调查”是否意味着所有区域对象可见，还是只意味着某个一次性事件不再重复触发？
- **Q4**：区域 shape 的 MVP 是否接受 `box + explicit tiles`，还是必须从第一版就支持连续填充 / flood fill authoring？
- **Q5**：旧 `tile.areaName`、`tile.objectIds` 和 `radar.regions` 是要迁移为新区域模型，还是短期并存并设定优先级？

---

**Research Completed:** 2026-05-11 21:14  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。

