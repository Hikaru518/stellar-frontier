---
source_design: docs/plans/2026-04-27-17-37/configurable-map-system-design.md
target_wiki: docs/gameplay/map-system/map-system.md
backup:
  - docs/plans/2026-04-27-17-37/wiki-backup-20260427-215200-gameplay-crew.md
  - docs/plans/2026-04-27-17-37/wiki-backup-20260427-215200-gameplay-time-system.md
  - docs/plans/2026-04-27-17-37/wiki-backup-20260427-215200-game-model-event-integration.md
  - docs/plans/2026-04-27-17-37/wiki-backup-20260427-215200-game-model-crew.md
date: 2026-04-27 21:52
---

# Wiki Merge Diff: configurable-map-system

## 1. 新增（Added）

- [docs/gameplay/map-system/map-system.md] 新增可配置地图系统全量 wiki，按 10 章模板整理概述、设计意图、术语、玩家旅程、机制规则、系统交互、关键场景、取舍、参考和 Open Questions。
- [docs/game_model/map.md] 新增地图 game model 文档，整理静态地图配置、运行时 `GameState.map`、坐标系统、可见窗口、调查报告、legacy `MapTile` 投影、事件兼容和存档 reset 策略。

## 2. 更新（Updated）

- [docs/gameplay/crew/crew.md] 将移动路线与参数中的固定 `4 x 4` 地图假设改为配置驱动地图；队员位置依赖更新为区域名与玩家显示坐标。
- [docs/gameplay/time-system/time-system.md] 将基础行动耗时中的地图单位说明改为引用地图系统配置，不再重复固定地图尺寸；地图交互补充发现 / 外围未探索状态。
- [docs/game_model/event-integration.md] 将 `tile_state` 描述改为事件可访问的地图投影，并链接 `docs/game_model/map.md`；`save_state` 增加 `map` 事实源与 `tiles` 兼容投影边界。
- [docs/game_model/crew.md] 将队员与地图关系从 `MapTile` 事实源改为 `GameState.map` / 地图运行时状态；位置文案改为区域名和玩家显示坐标。
- [docs/plans/2026-04-27-17-37/configurable-map-system-design.md] frontmatter 从 `status: approved` 更新为 `status: merged`，并追加 `merged_into` 与 `merged_at`。

## 3. 冲突（Conflicts）

### Conflict 1: 固定 `4 x 4` 地图尺寸 vs 配置驱动默认 `8 x 8`

**wiki 原文**：
> `docs/gameplay/crew/crew.md` 与 `docs/gameplay/time-system/time-system.md` 写明基础地图为 `4 x 4`，坐标范围示例为 `(1,1)` 到 `(4,4)`。

**策划案表述**：
> 地图宽高由地图配置决定；默认配置为 `8 x 8`。所有坐标合法性、地图渲染范围与移动目标校验都读取配置，不再假设固定 `4 x 4`。

**决议**：采用策划案。队员与时间系统不再作为地图尺寸权威来源，改为引用地图系统配置。

### Conflict 2: 队员位置文案由资源 / 地形派生 vs 区域名优先

**wiki / game model 原文**：
> `docs/game_model/crew.md` 描述 `location` 从当前地块资源或地形派生，`getTileLocation` 优先取 `MapTile.resources[0]`，否则取 `terrain`。

**策划案表述**：
> 队员摘要与通讯台位置文案优先显示区域名，例如“位于灰熊丘陵”；地图详情中再显示坐标、地形、天气、地块对象等细节。

**决议**：采用策划案。位置文案不得再用资源名或地块对象名冒充地点。

## 4. 保持（Kept as-is）

- [docs/core-ideas.md] 未修改；核心原则页需要人类确认后才能更新。
- [docs/ui-designs/pages/地图.md] 未整理。该 UI PRD 仍有旧 `4x4` 表述，后续应通过 UI 文档整理单独处理。
- [docs/plans/2026-04-27-17-37/technical-design.md] 保持 `draft`，只作为 `docs/game_model/map.md` 的模型细节来源。
- [docs/gameplay/event-system/event-system.md] 未直接修改；事件与地图对象 / 天气 / 特殊状态 / 环境属性联调由地图模型和 event integration 记录边界。

## 5. 失败记录（如有）

*（暂无）*
