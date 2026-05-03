---
topic: map-editor-ux
date: 2026-05-01
status: draft
source:
  design: docs/plans/2026-05-01-22-43/map-editor-ux-design.md
  research: docs/plans/2026-05-01-22-43/research.md
  interview: docs/plans/2026-05-01-22-43/map-editor-ux-interview.md
technical_design: docs/plans/2026-05-01-22-43/map-editor-ux-technical-design.md
tasks_file: map-editor-ux-tasks.json
---

# map-editor-ux Implementation Plan

## 1. 概述

本计划把已批准的地图编辑器策划体验设计转成可执行技术方案。目标是在 `apps/editor` 中实现独立 Map Editor，让策划可以新建地图、设定尺寸、从 `assets/kenney_tiny-battle/` 选择 tile、使用 brush/fill/eraser 等工具铺 visual layers，并通过 inspector / semantic brush 维护 gameplay tile 数据。保存结果是可被项目运行时消费的 `content/maps/*.json`。

总体技术方案是：content schema 定义 `visual.layers` 与 tileset registry；editor helper 负责读取、校验、保存和受限服务资产；Editor React reducer 是 authoring 事实源；PC Phaser runtime 只消费保存后的 visual layers，并在无视觉层或未发现 tile 时保留现有 terrain 色块 fallback。

本轮拆成 12 个串行任务。主要风险是 editor preview 与 PC runtime 视觉不一致、helper save 写坏 JSON、以及 visual layers 误泄露未探索地图；技术设计中已通过共享 registry 规则、authoritative validation、runtime 只渲染 discovered tile 来约束。

### 1.1 任务文件

- `tasks_file`: `map-editor-ux-tasks.json`

### 1.2 任务执行顺序

1. **TASK-001**: 扩展地图 visual schema 与 Kenney tileset registry — 先建立内容契约和素材元数据。
2. **TASK-002**: 实现 helper 地图库读取与 authoritative validation — 基于 schema/registry 做可测试的 Node 读库和校验模块。（依赖: TASK-001）
3. **TASK-003**: 新增 Map Editor helper HTTP API 与资产服务 — 暴露 library、validate、save、assets API。（依赖: TASK-002）
4. **TASK-004**: 建立 Map Editor 前端模型、commands 与 visual layer 操作 — 为 UI 提供 draft、reducer、history 和纯铺图操作。（依赖: TASK-001）
5. **TASK-005**: 启用 editor 模块切换并加载 Map Editor shell — 接入导航、helper loading/error 和地图文件选择。（依赖: TASK-003, TASK-004）
6. **TASK-006**: 实现新建地图、地图网格与基础图层面板 — 完成 New Map、CSS grid、layer workflow。（依赖: TASK-005）
7. **TASK-007**: 实现 tileset palette 与视觉铺图工具 — 接入 Kenney palette 和 Brush/Eraser/Fill/Rectangle/Eyedropper。（依赖: TASK-006）
8. **TASK-008**: 实现 gameplay inspector、semantic brush 与 Gameplay Overlay — 补齐 gameplay 语义编辑。（依赖: TASK-006）
9. **TASK-009**: 实现保存、validation panel 与 dirty/history UX — 打通 editor 保存闭环。（依赖: TASK-007, TASK-008）
10. **TASK-010**: 让 PC content 与 mapView 派生 visual sprite layers — 先让 runtime view model 读懂 visual layers。（依赖: TASK-001）
11. **TASK-011**: 在 PC Phaser MapScene 渲染 authored visual layers — 将 view model 的 sprite layers 画到 Phaser 场景。（依赖: TASK-010）
12. **TASK-012**: 收尾验证地图编辑器端到端闭环 — 统一跑验证、修集成缝隙、完成手动验收。（依赖: TASK-009, TASK-011）

## 2. 技术设计

### 2.1 设计文件

- `docs/plans/2026-05-01-22-43/map-editor-ux-technical-design.md`

### 2.2 设计要点

- Editor 不复用 PC `MapScene`，采用 React/CSS grid 做 authoring preview；React draft reducer 是事实源。
- Map JSON 新增可选 `visual.layers[]`，layer array order 是渲染顺序；`visible/locked/opacity` 保存，`solo` 不保存。
- Visual cell 使用 `Record<tileId, { tilesetId, tileIndex }>`，便于 brush、eraser、fill 和 validation。
- Tileset registry 写入 `content/maps/tilesets/registry.json`，Kenney packed spritesheet 是首个内置 tileset；分类只用于 palette，不自动推断 gameplay 语义。
- Helper `POST /api/map-editor/save` 做 authoritative validation；校验失败不写文件。
- 普通 visual brush 不修改 gameplay 字段；inspector 和 semantic brush 才修改 `terrain/weather/objectIds/specialStates/origin/initialDiscovered`。
- PC runtime 只在 discovered tile 上渲染 visual sprites，unknown/frontier tile 继续使用现有灰色 fallback，避免泄露未探索地图。

## 3. TASK-012 最终验证与验收映射

TASK-012 不新增功能，只把 TASK-001 至 TASK-011 的实现闭环回归到 `map-editor-ux-design.md` 的 user stories、用户旅程和失败路径，并记录收尾验证命令。代码层状态以 `progress.md` 中每个任务的 Main verification 为准；本节作为最终接受标准的自包含索引。

### 3.1 User Story 覆盖

| User Story | 设计验收重点 | 实现任务覆盖 | TASK-012 验收判定 |
| --- | --- | --- | --- |
| US-001 新建地图 | 输入 `id/name/rows/cols`，生成完整 gameplay tiles、默认 origin、initial discovered，并保存为 `content/maps/<id>.json` | TASK-004 建立 draft/model；TASK-005 接入 Map Editor shell；TASK-006 实现 New Map 表单、grid 和图层基础；TASK-009 保存并重新打开 | 覆盖。需在手动验收中创建至少 `16 x 12` 地图，并确认保存后可重新打开 |
| US-002 使用素材 palette 铺图 | Kenney palette、tile index、放大预览、分类/最近使用、Brush/Eraser/Bucket/Rectangle/Eyedropper | TASK-001 registry；TASK-004 visual layer ops；TASK-007 palette 与绘制工具 | 覆盖。需确认普通视觉 brush 只写 active visual layer |
| US-003 管理视觉图层 | active、visible、locked、opacity、rename、reorder、delete、solo；solo 不保存 | TASK-001 schema；TASK-004 reducer 与 layer ops；TASK-006 LayerPanel；TASK-007 locked layer no-op | 覆盖。需确认 locked layer 不可绘制、hidden layer 不进 Final Art、opacity 在 editor/runtime 生效、solo 只在 editor local state |
| US-004 编辑 gameplay 语义 | Inspector 和 semantic brush 修改 gameplay；视觉 brush 不自动改 gameplay；Gameplay Overlay 显示语义分布 | TASK-004 保障 visual command 不改 gameplay；TASK-008 inspector、semantic brush、overlay | 覆盖。需确认 semantic brush 可设置 terrain/weather/origin/initial discovered，且设置 origin 会保持 initial discovered 包含 origin |
| US-005 校验并保存地图 | 保存前 validation；失败不写入；校验 tileset id、tile index、cell tileId、origin、initial discovered、objectIds；dirty 状态和错误跳转 | TASK-002 authoritative validation；TASK-003 helper API；TASK-009 validation panel、dirty/save flow、file_exists 保护 | 覆盖。需确认 helper validation 是保存前权威校验，`file_exists` 不覆盖已有地图 |
| US-006 Runtime 展示视觉层 | PC Phaser 消费 visual layers；order/opacity；无视觉层 terrain fallback；不破坏 crew/route/selection/label | TASK-010 mapView 派生 discovered visual layers；TASK-011 MapScene preload/render visual sprites | 覆盖。需确认 unknown/frontier tile 不暴露 visual sprites，discovered tile 才显示 authored sprites |

### 3.2 用户旅程覆盖

| Journey Step | 覆盖任务 | 接受标准 |
| --- | --- | --- |
| 1. 打开 Game Editor 并进入 Map 模块 | TASK-005 | `Map Editor` 顶部入口可用；Event Editor 可切回且行为保持 |
| 2. New Map 输入 `id/name/rows/cols` | TASK-004, TASK-006 | 合法输入生成完整 draft；非法 id 或尺寸不生成 draft |
| 3. 三栏工作区、地图网格、validation/save 状态 | TASK-005, TASK-006, TASK-009 | 文件/图层、grid、palette/inspector、validation 状态可见 |
| 4. Palette 选择 grass tile 并自动进入 Brush | TASK-007 | 点击/拖动在 active layer 写入 visual cell |
| 5. 切换分类并使用 Brush/Bucket/Rectangle/Eraser/Eyedropper | TASK-007 | 所有视觉工具只影响 active layer；locked layer no-op |
| 6. 新增、重命名、排序、隐藏、锁定、solo 图层 | TASK-006 | 图层状态可编辑；solo 不进入保存 JSON |
| 7. Gameplay Overlay、semantic brush、inspector 编辑语义 | TASK-008 | gameplay 字段只能通过 inspector/semantic brush 修改 |
| 8. Dirty 状态、validation 错误定位 | TASK-009 | 保存前显示 validation；点击 issue 选中对应 tile/layer |
| 9. Save 写入 `content/maps/*.json` | TASK-002, TASK-003, TASK-009 | validation 失败不写入；保存成功清 dirty 并更新文件列表 |
| 10. 重新打开或进入 PC 地图确认视觉层/fallback | TASK-009, TASK-010, TASK-011 | 重新打开还原 visual/gameplay；PC discovered tile 渲染 visual layers，无 visual cell 保留 terrain fallback |

### 3.3 失败路径覆盖

| 失败路径 | 覆盖任务 | 接受标准 |
| --- | --- | --- |
| F1 helper 未启动 | TASK-005 | UI 显示 `Helper unavailable` 和 `npm run editor:helper` 提示，不能进入保存闭环 |
| F2 地图尺寸或 id 不合法 | TASK-006 | New Map 表单显示错误，不创建 draft |
| F3 保存校验失败 | TASK-002, TASK-003, TASK-009 | helper 返回 validation errors，不写文件，draft 保留可继续编辑 |
| F4 误刷 locked layer | TASK-004, TASK-006, TASK-007 | reducer 和 UI 均阻止修改，并显示轻量提示 |
| F5 素材引用失效 | TASK-001, TASK-002, TASK-003, TASK-009 | registry/schema/helper validation 捕捉缺失 tileset、非法 tile index 或越界 visual cell |

### 3.4 TASK-012 验证命令与本轮结果

TASK-012 期望执行并记录以下验证。若根级 `npm run lint` 或 `npm run test` 被 Rush/Node 环境中的 `ERROR: Unexpected output from "ps" command` 阻断，则记录为环境阻断，并以 package 级命令作为可行替代验证。本轮环境为 Node.js `25.2.1`；Rush `5.175.0` 会提示该 Node 版本未测试。

| 命令 | 验证内容 | 期望结果 | 本轮执行结果 |
| --- | --- | --- | --- |
| `node -e "JSON.parse(require('fs').readFileSync('docs/plans/2026-05-01-22-43/map-editor-ux-tasks.json','utf8')); console.log('tasks json ok')"` | TASK-012 tasks JSON 语法 | 通过 | 通过：`tasks json ok` |
| `git diff --check -- docs/plans/2026-05-01-22-43/map-editor-ux-implementation-plan.md docs/plans/2026-05-01-22-43/map-editor-ux-tasks.json` | TASK-012 文档 diff 空白检查 | 通过 | 通过 |
| `npm run validate:content` | content schema、map visual layers、tileset registry 和跨文件引用 | 通过 | 通过：`Content validation passed.` |
| `npm run editor:test` | editor helper/API、Map Editor model/UI/save validation flow | 通过 | 通过：21 files / 92 tests |
| `node common/scripts/install-run-rush-pnpm.js run --filter @stellar-frontier/editor lint` | editor package lint 替代验证 | 通过 | 通过 |
| `node common/scripts/install-run-rush-pnpm.js run --filter @stellar-frontier/pc-client test` | PC content/mapView/MapScene visual layer runtime tests | 通过 | 通过：29 files / 250 tests |
| `node common/scripts/install-run-rush-pnpm.js run --filter @stellar-frontier/pc-client lint` | PC package lint 替代验证 | 通过 | 通过 |
| `PLAYWRIGHT_BROWSERS_PATH=../../common/temp/playwright-browsers node --input-type=module -e '<map editor smoke script>'` | 本地浏览器烟测：新建 `16 x 12`、创建图层、palette 铺图、保存、重开和视觉布局 | 通过 | 通过：`summaryIncludesSize=true`，保存前后 visual sprite 数均为 `1`，Preview mode 高度为 `30px`，截图为 `/private/tmp/map-editor-task012-fixed.png`，临时地图文件已清理 |
| `npm run lint` | 根级 lint | 通过；若 Rush `ps` issue 阻断，记录环境 caveat | 阻断：`ERROR: Unexpected output from "ps" command` |
| `npm run test` | 根级 test | 通过；若 Rush `ps` issue 阻断，记录环境 caveat | 阻断：`ERROR: Unexpected output from "ps" command` |

### 3.5 手动 / 浏览器验收记录

- 启动 `npm run editor:helper` 与 `npm run editor:dev -- --host 127.0.0.1 --port 5174` 后，使用 Playwright/Chromium 打开 editor，并进入 `Map Editor` 模块。
- 新建临时地图 `task012-smoke-1777657761680`，尺寸为 `16 x 12`；页面 summary 确认 `summaryIncludesSize=true`，origin 为中心格 `8-6`。
- 点击 `Add Layer` 创建 `layer-1`，从 Kenney palette 选择 tile index `3`，在 `1-1` 绘制 1 个 visual sprite；保存前 visual sprite 数为 `1`。
- 切换 `Gameplay Overlay` 预览，并在视觉检查中发现 preview buttons 被 grid row 拉伸成异常竖条；已在 `apps/editor/src/styles.css` 中修复 `map-canvas-shell` rows 和 preview/grid row placement。
- 修复后重跑同一烟测，Preview mode 高度为 `30px`，地图网格保持在工具栏下方；截图记录为 `/private/tmp/map-editor-task012-fixed.png`。
- 点击 `Save` 后 helper 写入 `content/maps/task012-smoke-1777657761680.json`；刷新页面、重新进入 `Map Editor`、从文件列表选择该地图后，visual sprite 数仍为 `1`，说明保存后重新打开可以还原 visual layer。烟测结束后已删除该临时地图文件。
- PC runtime 的 authored visual layer 展示由 `pc-client` 测试覆盖：`buildPhaserTileViews` 只为 discovered tile 派生 visual layers，`MapScene` 预加载 spritesheet，将 visual sprites 叠在 terrain fallback 上方，并验证多层 order/opacity 与无 visual layer fallback。当前运行时地图文件选择明确不在本轮范围内，因此没有通过 PC UI 手动切换到临时地图。

---

**Planning Completed:** 2026-05-01 23:20
