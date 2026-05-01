---
topic: phaser-map
date: 2026-04-30
status: draft
source:
  design: docs/plans/2026-04-30-18-46/initial.md
tasks_file: phaser-map-tasks.json
---

# Phaser 地图系统 Implementation Plan

## 1. 概述

本计划将 `MapPage.tsx` 现有的 CSS Grid + `<button>` DOM 地图替换为 Phaser 4 驱动的 WebGL Canvas 地图，实现 `initial.md` 规格中的 MVP 基线：4 级离散缩放、鼠标中心补偿、右键拖拽摄像机、人物 Tween 移动动画、Hover tooltip、格子点击联动右侧面板、HTML 语义层 a11y、DOM data-* e2e 测试桥接。

技术方案总体思路：React 层持有业务状态，通过 `stateRef` 将 props 同步给 Phaser Scene；Phaser Scene 负责全量重绘（约 1Hz）和 60fps 动画；纯函数层（`mapView.ts`）提供可独立测试的数据计算。MVP 阶段用程序生成颜色块替代真实 tileset PNG，同时建立 `registry.json + public/maps/tilesets/` 空壳架构供后续扩展。

共 10 个任务，其中 P0 任务 8 个（基础设施→核心功能→集成），P1 任务 2 个（区域标签 UI + 最终验收）。

关键风险：Phaser 4 API 与文档中 Phaser 3 示例存在差异；React 19 StrictMode 下 Phaser Game 双挂载；ResizeObserver 高频触发性能抖动；Tween 链竞态。均已在技术设计中给出缓解措施。

### 1.1 任务文件

- `tasks_file`: `phaser-map-tasks.json`

### 1.2 任务执行顺序

1. **TASK-001**: 安装 Phaser 依赖 + 建立目录与空壳文件 — 基础设施，所有任务的前提
2. **TASK-002**: 实现 mapView.ts 纯函数与单元测试 — 颜色映射、寻路、数据派生（依赖: TASK-001）
3. **TASK-003**: 实现 PhaserMapCanvas.tsx React 外壳 — 生命周期、stateRef、ResizeObserver（依赖: TASK-001）
4. **TASK-004**: 实现 MapScene.ts 基础图层与地形色块渲染 — 可见地形格子，第一次在浏览器看到 Phaser 渲染（依赖: TASK-002, TASK-003）
5. **TASK-005**: 实现摄像机交互 — Zoom、右键拖拽、WASD（依赖: TASK-004）
6. **TASK-006**: 实现 Hover tooltip 与左键选格 — 悬停提示、选格回调（依赖: TASK-004）
7. **TASK-007**: 实现人物标记与 Tween 移动动画 + 轨迹绘制 — 队员可视化、移动动画（依赖: TASK-004）
8. **TASK-008**: MapPage 集成 PhaserMapCanvas + e2e 测试桥接 — 删除 DOM Grid，引入 Phaser Canvas（依赖: TASK-005, TASK-006, TASK-007）
9. **TASK-009**: 实现区域名标签（depth 13）与缩放级别 UI — P1 增强（依赖: TASK-008）
10. **TASK-010**: MVP 验收与回归测试 — 逐项核对 initial.md §10 基线，三项质量门禁全部通过（依赖: TASK-008, TASK-009）

---

## 2. 技术设计

### 2.1 设计文件

`docs/plans/2026-04-30-18-46/phaser-map-technical-design.md`

### 2.2 设计要点

**架构分层**：React 层（`MapPage` + `PhaserMapCanvas` 外壳）→ Phaser Scene（`MapScene.ts`，全量重绘）→ 纯函数层（`mapView.ts`，与框架无耦合）。

**代码目录**：新建 `apps/pc-client/src/phaser-map/`，包含 `PhaserMapCanvas.tsx`、`MapScene.ts`、`mapView.ts`。

**状态同步**：`stateRef.current = props` 在每次 render 同步；Phaser 事件回调通过 `stateRef.current` 访问最新 props；`updateState(SceneState)` 驱动全量重绘。

**人物动画**：Phaser 内部 Tween 链（250ms/格，固定时长）驱动视觉动画；`getCrewMarkerPosition`（游戏时间插值）仅用于 HTML 语义层 a11y 定位。

**Tileset 占位**：MVP 用 `getTerrainFillColor` 程序生成颜色块；同时建立 `content/maps/tilesets/registry.json`（空 tilesets 数组）+ `public/maps/tilesets/` 目录空壳，后续补充 PNG 文件即可生效。

**关键决策**：直接替换 DOM Grid（无 Feature Flag）；stateRef + 全量重绘；Phaser Tween 驱动动画；新建 `src/phaser-map/` 目录；e2e 用 `data-*` 属性桥接（后续扩展 `window.__mapTestState` 见 docs/todo.md）。

---

**Planning Completed:** 2026-04-30 20:30
