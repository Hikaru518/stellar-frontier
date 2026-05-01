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

---

**Planning Completed:** 2026-05-01 23:20
