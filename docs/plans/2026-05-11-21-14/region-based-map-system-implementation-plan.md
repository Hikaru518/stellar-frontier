---
topic: region-based-map-system
date: 2026-05-11
status: draft
source:
  design: docs/plans/2026-05-11-21-14/region-based-map-system-design.md
  research: docs/plans/2026-05-11-21-14/research.md
  interview: docs/plans/2026-05-11-21-14/region-based-map-system-interview.md
technical_design: docs/plans/2026-05-11-21-14/region-based-map-system-technical-design.md
tasks_file: region-based-map-system-tasks.json
---

# region-based-map-system Implementation Plan

## 1. 概述

本计划把现有 256 x 256 tile 地图迁移为 Feature 驱动的玩法地图系统。tile 保留精确坐标、路径、移动结算和事件锚点；`map.features` 成为玩家可见语义、点击命中、调查目标、状态字符串和 Feature 级去重的 source of truth。

总体技术路线是先引入兼容能力，再 seed Feature 内容，然后迁移 runtime、事件和通话链路，最后删除 `tile.areaName` / `tile.objectIds` 的正式玩法地位，并补齐 Editor authoring 和 e2e 验证。任务总数为 19 个。

关键风险集中在三处：IAFS 旧 object 事件链迁移遗漏、MapPage / CallPage / settlement 查询逻辑分叉、以及最终删除 legacy tile 字段时影响 Editor 或旧存档。任务排序已把 schema、runtime、事件、UI、Editor 和 cleanup 拆开，降低单次改动范围。

### 1.1 任务文件

- `tasks_file`: `region-based-map-system-tasks.json`

### 1.2 任务执行顺序

1. **TASK-001**: 添加 MapFeature 类型与 loader 兼容层 — 先让 PC loader 能识别 `features`。
2. **TASK-002**: 实现 row spans 与 Feature 查询纯函数 — 建立后续所有模块共用的查询入口。（依赖: TASK-001）
3. **TASK-003**: 扩展 map schema 与 content validation 支持 Feature — 让内容层可以声明 Feature。（依赖: TASK-001, TASK-002）
4. **TASK-004**: 为默认地图 seed 初始 Feature 内容 — 先添加 Feature，暂保留 legacy tile 字段。（依赖: TASK-003）
5. **TASK-005**: 添加 Runtime featuresById 与旧存档迁移 — 建立 Feature runtime state。（依赖: TASK-001, TASK-004）
6. **TASK-006**: 定义 Feature event schema、types 与 handler registry — 添加事件契约。（依赖: TASK-003, TASK-005）
7. **TASK-007**: 实现 Feature condition/effect runtime — 让事件能读写 Feature 状态。（依赖: TASK-005, TASK-006）
8. **TASK-008**: 让 call action 上下文支持 Feature 状态 — 让行动条件能读取 Feature state。（依赖: TASK-005, TASK-007）
9. **TASK-009**: 生成最高优先级 Feature 调查候选 — 实现 priority/tie 调查规则。（依赖: TASK-002, TASK-008）
10. **TASK-010**: 实现 Feature survey 结算与去重 — 调查更新 Feature state，并避免 footprint 内重复触发。（依赖: TASK-005, TASK-009）
11. **TASK-011**: 迁移 Feature local timed action / repair 结算 — repair 等对象行动改为 Feature 目标。（依赖: TASK-007, TASK-010）
12. **TASK-012**: MapPage 展示 Feature 命中结果 — 地图点击显示 Feature 和底层 tileId。（依赖: TASK-002, TASK-005, TASK-004）
13. **TASK-013**: CallPage 展示 Feature 目标文案与按钮 — 通话页显示 Feature 调查目标。（依赖: TASK-009, TASK-012）
14. **TASK-014**: 迁移 IAFS 事件和 action 内容到 feature_id — 让现有 IAFS 链路实际使用 Feature。（依赖: TASK-007, TASK-011, TASK-013）
15. **TASK-015**: Editor helper、types 与 validation 支持 Feature — 打通 Editor 数据层。（依赖: TASK-003, TASK-004）
16. **TASK-016**: Editor Feature list 与 inspector — 支持创建和编辑 Feature 属性。（依赖: TASK-015）
17. **TASK-017**: Editor footprint brush 与重叠预览 — 支持单格/拖拽 footprint 编辑。（依赖: TASK-016）
18. **TASK-018**: 移除 legacy tile area/object gameplay source — 删除 `areaName/objectIds` 正式依赖。（依赖: TASK-014, TASK-017）
19. **TASK-019**: 补齐 e2e 与最终验证 — 覆盖核心用户旅程并跑验证。（依赖: TASK-018）

## 2. 技术设计

### 2.1 设计文件

`docs/plans/2026-05-11-21-14/region-based-map-system-technical-design.md`

### 2.2 设计要点

- `map.features` 是新版 gameplay source of truth；`tile.areaName` 和 `tile.objectIds` 最终移除。
- Footprint 使用 `row_spans` 保存，运行时和 Editor 加载时派生 tile -> Feature index。
- 可调查 Feature 完整替代 map object 状态链，使用 `featuresById[featureId].status` 保存字符串状态。
- 事件系统新增 `feature_status_equals`、`set_feature_status`、`set_feature_revealed`。
- 通话页只为最高 priority 的可调查 Feature 生成行动；同优先级并列时显示多个目标按钮。
- `kind` 是 JSON 自定义字符串，不做硬编码枚举；玩法逻辑依赖 `investigatable`、`priority`、`visibility`、`actions` 和 `tags`。
- Editor MVP 支持 Feature list/inspector，以及选中 Feature 后单格/拖拽添加或擦除 footprint。

---

**Planning Completed:** 2026-05-11 22:34
