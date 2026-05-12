---
plan: "region-based-map-system"
branch: "feature/region-based-map-system"
started: "2026-05-11 22:36"
status: "completed"
source:
  implementation_plan: "docs/plans/2026-05-11-21-14/region-based-map-system-implementation-plan.md"
  tasks_json: "docs/plans/2026-05-11-21-14/region-based-map-system-tasks.json"
---

# Progress: region-based-map-system

## 总结

### 完成内容与验收要点

- 19 个实施任务全部完成，并按任务粒度提交。
- 地图运行时新增 `map.features` / `featuresById` 路径：Feature footprint 支持 row spans、同 tile 多 Feature 命中、按 priority 选择可调查目标，调查/维修/事件结算均写入 Feature runtime state。
- 默认 IAFS 内容已迁移到 Feature 模型；新内容不再从 `tile.areaName` / `tile.objectIds` 承载玩法语义，新存档也不再初始化 `mapObjects`。
- MapPage、CallPage 和 Map Editor 均已支持 Feature 命中、Feature 调查/维修按钮、Feature 列表/Inspector 和 footprint brush。
- e2e 覆盖了 IAFS 调查揭示、Feature repair、Feature inspect、Feature readout、移动选点仍返回 tileId、任务侧栏回归。

### 实现与设计的差异

- 旧 `content/map-objects`、`object_status_equals`、`set_object_status` 与 `mapObjects` 相关代码仍保留为 legacy 内容/旧存档兼容路径；新版 IAFS 链路和默认地图不依赖它们。
- 旧 save normalize 会读取 legacy `mapObjects.status_enum` 并迁移到同 id `featuresById.status`；迁移后新存档不会继续持久化 `mapObjects`。
- 多个子 agent 在写入部分任务后未正常返回 summary；父层逐一复核 diff、补齐缺口、运行验证并提交。
- Playwright 在 sandbox 内启动 Vite 时遇到 `listen EPERM 127.0.0.1:5173`；同一 e2e 命令提权后通过。

## 任务状态

| # | Task ID | 标题 | 状态 | 尝试次数 |
|---|---------|------|------|---------|
| 1 | TASK-001 | 添加 MapFeature 类型与 loader 兼容层 | completed | 2 |
| 2 | TASK-002 | 实现 row spans 与 Feature 查询纯函数 | completed | 1 |
| 3 | TASK-003 | 扩展 map schema 与 content validation 支持 Feature | completed | 1 |
| 4 | TASK-004 | 为默认地图 seed 初始 Feature 内容 | completed | 1 |
| 5 | TASK-005 | 添加 Runtime featuresById 与旧存档迁移 | completed | 1 |
| 6 | TASK-006 | 定义 Feature event schema、types 与 handler registry | completed | 2 |
| 7 | TASK-007 | 实现 Feature condition/effect runtime | completed | 1 |
| 8 | TASK-008 | 让 call action 上下文支持 Feature 状态 | completed | 1 |
| 9 | TASK-009 | 生成最高优先级 Feature 调查候选 | completed | 1 |
| 10 | TASK-010 | 实现 Feature survey 结算与去重 | completed | 1 |
| 11 | TASK-011 | 迁移 Feature local timed action / repair 结算 | completed | 1 |
| 12 | TASK-012 | MapPage 展示 Feature 命中结果 | completed | 1 |
| 13 | TASK-013 | CallPage 展示 Feature 目标文案与按钮 | completed | 1 |
| 14 | TASK-014 | 迁移 IAFS 事件和 action 内容到 feature_id | completed | 1 |
| 15 | TASK-015 | Editor helper、types 与 validation 支持 Feature | completed | 1 |
| 16 | TASK-016 | Editor Feature list 与 inspector | completed | 1 |
| 17 | TASK-017 | Editor footprint brush 与重叠预览 | completed | 1 |
| 18 | TASK-018 | 移除 legacy tile area/object gameplay source | completed | 1 |
| 19 | TASK-019 | 补齐 e2e 与最终验证 | completed | 1 |

状态值：`pending` | `in_progress` | `completed` | `failed`

## 执行日志

### TASK-001: 添加 MapFeature 类型与 loader 兼容层
- 状态: completed
- 开始时间: 2026-05-11 22:37
- 完成时间: 2026-05-11 23:04
- 尝试次数: 2
- 尝试记录:
  - 尝试 1: 旧 developer 子 agent 长时间未返回；按用户指令关闭后重新派发。
  - 尝试 2: 2026-05-11 22:50 重新派发。
- developer summary:
  - 添加 `MapFeatureDefinition`、`FeatureFootprint`、`FeatureRuntimeState` 等类型。
  - `defaultMapConfig` 归一化旧地图缺省 `features` 为 `[]`。
  - 增加 focused 测试覆盖旧地图兼容和 passive / investigatable Feature 类型表达。
- 质量检查:
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 45 files / 350 tests

### TASK-002: 实现 row spans 与 Feature 查询纯函数
- 状态: completed
- 开始时间: 2026-05-11 23:05
- 完成时间: 2026-05-11 23:25
- 尝试次数: 1
- developer summary:
  - 新增 `mapFeatureSystem` 纯函数模块。
  - 覆盖 row spans 展开、tile index、查询排序、未知输入、可见性过滤、可调查过滤、最高优先级选择。
- 质量检查:
  - `apps/pc-client` lint: passed
  - focused `mapFeatureSystem.test.ts`: passed, 6 tests
  - focused `contentData.test.ts MapPage.test.tsx`: passed, 22 tests
  - `apps/pc-client` test: passed on rerun, 46 files / 356 tests
  - 备注: 第一次全量 test 在两个既有测试上出现 5s timeout；隔离重跑对应文件通过，随后全量重跑通过。

### TASK-003: 扩展 map schema 与 content validation 支持 Feature
- 状态: completed
- 开始时间: 2026-05-11 23:26
- 完成时间: 2026-05-11 23:41
- 尝试次数: 1
- developer summary:
  - 扩展 `maps.schema.json`，支持 optional `features`、`row_spans` footprint、priority、visibility、custom kind、investigatable/status/actions。
  - 扩展 `validate-content`，校验 Feature id 唯一性、span 非空/边界/重叠/四方向连续、initial_status、非 investigatable 字段限制。
  - 增加 validator 集成测试，覆盖合法 features 和拒绝场景。
- 质量检查:
  - `npm run validate:content`: passed
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 46 files / 359 tests

### TASK-004: 为默认地图 seed 初始 Feature 内容
- 状态: completed
- 开始时间: 2026-05-11 23:42
- 完成时间: 2026-05-11 23:56
- 尝试次数: 1
- developer summary:
  - 为 `default-map.json` 添加 6 个初始 Feature：IAFS 坠毁点、南侧通道、发电机、维生装置、穿梭机核心、散落物资。
  - 保留 legacy `tile.areaName/objectIds`，未修改 runtime、事件、schema 或 validator。
  - 增加默认地图 Feature 内容契约测试。
- 质量检查:
  - `npm run validate:content`: passed
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 46 files / 359 tests

### TASK-005: 添加 Runtime featuresById 与旧存档迁移
- 状态: completed
- 开始时间: 2026-05-11 23:57
- 完成时间: 2026-05-12 00:08
- 尝试次数: 1
- developer summary:
  - 为 runtime map state 添加 `featuresById`。
  - 新游戏初始化每个 investigatable Feature 的 `status = initial_status`。
  - save normalize 将 legacy `mapObjects[id].status_enum` 迁移到同 id `featuresById[id].status`。
  - 添加 Feature runtime status 读取 helper，缺失 state 时回退 `initial_status`。
- 质量检查:
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 46 files / 361 tests

### TASK-006: 定义 Feature event schema、types 与 handler registry
- 状态: completed
- 开始时间: 2026-05-12 00:09
- 完成时间: 2026-05-12 00:56
- 尝试次数: 2
- 尝试记录:
  - 尝试 1: 子 agent 多次超时未返回；已写入部分 schema/registry/types/editor 文件，但无 summary 和验证结果。2026-05-12 00:50 关闭后重新派发。
  - 尝试 2: 2026-05-12 00:50 从当前 dirty worktree 继续检查和收尾。
- developer summary:
  - 定义 `feature_status_equals` condition schema 与 handler registry entry。
  - 定义 `set_feature_status`、`set_feature_revealed` effect schema、TS effect type 和 Editor authoring metadata/template。
  - 增加 schema 接受、handler ref 可解析、Editor metadata/template 测试。
- 质量检查:
  - `npm run validate:content`: passed
  - `npm run editor:test`: passed, 44 files / 232 tests
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 46 files / 361 tests

### TASK-007: 实现 Feature condition/effect runtime
- 状态: completed
- 开始时间: 2026-05-12 00:57
- 完成时间: 2026-05-12 01:10
- 尝试次数: 1
- developer summary:
  - 实现 `feature_status_equals` condition，读取 `GameState.map.featuresById`，缺失 runtime state 时回退 authored `initial_status`。
  - 实现 `set_feature_status` 与 `set_feature_revealed`，只写 `featuresById`，保留已有 runtime 字段。
  - 补充未知 `feature_id` 的非崩溃路径：condition 返回 false，effect warning 后写入最小 state。
- 质量检查:
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 48 files / 371 tests

### TASK-008: 让 call action 上下文支持 Feature 状态
- 状态: completed
- 开始时间: 2026-05-12 01:11
- 完成时间: 2026-05-12 01:27
- 尝试次数: 1
- developer summary:
  - `buildCallActionContext` 向 condition evaluator 注入 `state.map.featuresById`，并在 Feature 候选下提供 `trigger_context.payload.feature_*`。
  - `buildCallView` 收集当前 tile 可见、可调查 Feature 的 inline actions，输出 `featureId`，并按 Feature 分组。
  - 增加 Feature status 可见性和 disabled reason 覆盖测试。
- 质量检查:
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 48 files / 373 tests

### TASK-009: 生成最高优先级 Feature 调查候选
- 状态: completed
- 开始时间: 2026-05-12 01:28
- 完成时间: 2026-05-12 01:41
- 尝试次数: 1
- developer summary:
  - `buildCallView` 的 Feature 候选改为只收集当前 tile 上最高 priority 的可见可调查 Feature。
  - 增加 focused tests 覆盖单一最高优先级、并列最高优先级、低优先级过滤、全部不可见不生成 Feature action。
- 质量检查:
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 48 files / 376 tests

### TASK-010: 实现 Feature survey 结算与去重
- 状态: completed
- 开始时间: 2026-05-12 01:42
- 完成时间: 2026-05-12 01:57
- 尝试次数: 1
- developer summary:
  - `survey` settlement 支持 `action_params.target_feature_id`。
  - 调查目标 Feature 后更新 `featuresById[featureId]` 的 `revealed / investigated / investigatedAt / lastTriggeredAt / historyKeys`。
  - TriggerContext payload 增加 `feature_id / feature_kind / feature_tags / action_def_id / feature_first_investigation`。
  - 同一 Feature 跨 tile 再调查不会重复写入一次性 reveal history。
  - 未知 `target_feature_id` 返回失败日志并清理 active action，不崩溃。
- 质量检查:
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 48 files / 379 tests

### TASK-011: 迁移 Feature local timed action / repair 结算
- 状态: completed
- 开始时间: 2026-05-12 01:58
- 完成时间: 2026-05-12 02:19
- 尝试次数: 1
- developer summary:
  - Feature repair 开始时写入 `action_params.target_feature_id`，不再要求新 repair 路径提供 `object_id`。
  - repair 结算支持 `set_feature_status`，完成 payload 带 `feature_id` / Feature metadata。
  - repair lock 从 object id 泛化到 repair target id，支持同一 Feature 维修中禁用/拒绝第二次维修。
  - legacy object repair fallback 保留。
- 质量检查:
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 48 files / 381 tests

### TASK-012: MapPage 展示 Feature 命中结果
- 状态: completed
- 开始时间: 2026-05-12 02:20
- 完成时间: 2026-05-12 02:34
- 尝试次数: 1
- developer summary:
  - MapPage 点击 readout 基于 `tileId` 查询全部可见 Feature。
  - Readout 按“背景 / 可调查”分组展示 Feature，并保留 tileId、地形、天气基础信息。
  - 从通话进入地图时，“标记当前坐标”仍只回传 `tileId`。
- 质量检查:
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 48 files / 385 tests
- 备注: 本任务未单独做浏览器视觉验证；后续 UI 任务完成后统一抽查 MapPage readout。

### TASK-013: CallPage 展示 Feature 目标文案与按钮
- 状态: completed
- 开始时间: 2026-05-12 02:35
- 完成时间: 2026-05-12 03:00
- 尝试次数: 1
- developer summary:
  - 扩展 `buildCallView`，输出 Feature action target meta 与低优先级 Feature context。
  - CallPage 渲染 Feature 名称、状态、禁用原因，并显示低优先级 Feature 作为上下文。
  - 移动确认保持使用 selected tile 的位置/地形目标，不显示目标 tile 上的 Feature id/name。
- 质量检查:
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 48 files / 389 tests
- 备注: 本任务未单独做浏览器视觉验证；后续 UI 任务完成后统一抽查 CallPage。

### TASK-014: 迁移 IAFS 事件和 action 内容到 feature_id
- 状态: completed
- 开始时间: 2026-05-12 03:01
- 完成时间: 2026-05-12 03:21
- 尝试次数: 1
- 尝试记录:
  - 尝试 1: 子 agent 写入实现后未正常返回；父层关闭该 agent，复核 diff 并完成质量检查。
- developer summary:
  - IAFS 默认地图的 repair/search authored actions 改为 `feature_status_equals` / `set_feature_status`。
  - IAFS 事件定义的 reveal、inspect、repair callback、supplies search 触发条件改为 `feature_id` / Feature runtime state。
  - 默认 crash-site 和 scattered-supplies tile 不再通过 `objectIds` 承载 gameplay 对象，旧 map-object 定义保留兼容路径。
  - App location-story trigger payload 为 Feature action 写入 `feature_id` / `feature_kind` / `feature_tags`，并保留 legacy `object_id: null`。
  - 补充内容基线、事件引擎、App、call action 集成测试。
- 质量检查:
  - `npm run validate:content`: passed
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 48 files / 392 tests

### TASK-015: Editor helper、types 与 validation 支持 Feature
- 状态: completed
- 开始时间: 2026-05-12 03:22
- 完成时间: 2026-05-12 03:35
- 尝试次数: 1
- developer summary:
  - Editor map draft 类型新增轻量 `MapFeatureDefinition` / `FeatureFootprint`，`createMapEditorDraft` 与 `normalizeMapEditorDraft` 统一提供 `features: []`。
  - helper load 旧地图时补齐 `features: []`，已有 `features` 原样保留；helper save 测试覆盖 `features` 写回 map JSON。
  - helper validation 新增 Feature id、row_spans 边界、重叠和四方向连续性校验，Feature issue target 使用 `kind: "feature"`。
  - 修复前序 Feature effect metadata 测试中的 TypeScript lint 问题，保证 editor lint 可通过。
- 质量检查:
  - `npm run validate:content`: passed
  - `apps/editor` lint: passed
  - `npm run editor:test`: passed, 44 files / 234 tests

### TASK-016: Editor Feature list 与 inspector
- 状态: completed
- 开始时间: 2026-05-12 03:36
- 完成时间: 2026-05-12 03:54
- 尝试次数: 1
- 尝试记录:
  - 尝试 1: 子 agent 写入实现后未正常返回；父层关闭该 agent，补齐 tags/actions 基础字段编辑并完成质量检查。
- developer summary:
  - Map Editor 侧栏新增 Feature list / Feature inspector，支持创建、选择、删除 Feature。
  - Feature 创建会锚定当前选中 tile，生成非空 `row_spans` footprint。
  - Inspector 支持编辑 name、kind、priority、visibility、tags、investigatable、status options、initial status 和 action 基础字段。
  - reducer 新增 `feature/create`、`feature/update`、`feature/delete` 命令，并纳入 undo/redo 历史。
- 质量检查:
  - `apps/editor` lint: passed
  - `npm run editor:test`: passed, 45 files / 238 tests

### TASK-017: Editor footprint brush 与重叠预览
- 状态: completed
- 开始时间: 2026-05-12 03:55
- 完成时间: 2026-05-12 04:11
- 尝试次数: 1
- 尝试记录:
  - 尝试 1: 子 agent 写入实现后未正常返回；父层关闭该 agent，复核并完成质量检查。
- developer summary:
  - MapGrid 支持显示选中 Feature footprint 和多 Feature 重叠标记。
  - Map Editor 在选中 Feature 后支持 add/erase footprint brush，pointer drag stroke 统一在 pointer-up 时提交为一条 history。
  - 新增 footprint tile helper：查询 tile 上 Feature、展开/压缩 `row_spans` footprint。
  - 选中 tile 时侧栏显示该 tile 的重叠 Feature 列表，并可直接切换选中 Feature。
- 质量检查:
  - `apps/editor` lint: passed
  - `npm run editor:test`: passed, 46 files / 243 tests

### TASK-018: 移除 legacy tile area/object gameplay source
- 状态: completed
- 开始时间: 2026-05-12 04:12
- 完成时间: 2026-05-12 04:34
- 尝试次数: 1
- 尝试记录:
  - 尝试 1: 子 agent 写入实现后未正常返回；父层关闭该 agent，收紧新存档 `mapObjects` 初始化并完成质量检查。
- developer summary:
  - `maps.schema.json` 的 tile 字段移除 `areaName/objectIds`，`default-map.json` 的 65536 个 tile 同步删除 legacy 字段。
  - PC loader 和 Editor draft normalization 会剥离旧 tile `areaName/objectIds`；TileInspector 不再编辑 area/object。
  - PC location label 改为 Feature 查询优先，缺失时回退 tile id；MapPage focus label 同步改为 Feature/tile id。
  - 新存档不再初始化 `map.mapObjects`；旧存档 `mapObjects.status_enum` 只在 normalize 阶段迁移到同 id Feature runtime state。
  - 移除 PC gameplay 代码对 `tile.objectIds` 的静态运行时依赖，legacy revealed object fallback 不再来自 tile config。
- 质量检查:
  - `npm run validate:content`: passed
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 48 files / 392 tests
  - `apps/editor` lint: passed
  - `npm run editor:test`: passed, 46 files / 243 tests
  - `git diff --check`: passed
  - `rg '"areaName"|"objectIds"' content/maps/default-map.json`: no matches
  - `rg 'tile\\.objectIds|defaultMapConfig\\.tiles.*objectIds|staticObjectIds|lookupStaticObjectIds|resolveTileObjects' apps/pc-client/src`: no runtime matches

### TASK-019: 补齐 e2e 与最终验证
- 状态: completed
- 开始时间: 2026-05-12 04:35
- 完成时间: 2026-05-12 05:10
- 尝试次数: 1
- 尝试记录:
  - 尝试 1: 重新派发只读 explorer 检查 e2e Feature 语义；父层完成 e2e fixture、断言和最终验证收口。
- developer summary:
  - e2e helper 从 `CRASH_SITE_OBJECT_IDS` / `mapObjects` / `revealedObjectIds` fixture 迁移到 `CRASH_SITE_FEATURE_IDS` / `featuresById`。
  - IAFS runtime e2e 断言 Feature reveal、`target_feature_id` repair action 和 Feature inspect runtime call。
  - Map e2e 断言同 tile 多 Feature 命中后的 priority focus label：revealed origin 显示 `发电机 +3`，重叠 footprint 显示 `南侧通道 +1`，同时 readout 保留底层 tile id 和全部命中 Feature。
  - 任务侧栏 e2e fixture 移除空 `revealedObjectIds`，避免继续表达旧 object reveal 模型。
- 质量检查:
  - `npm run validate:content`: passed
  - `apps/pc-client` lint: passed
  - `apps/pc-client` test: passed, 48 files / 392 tests
  - `npm run editor:test`: passed, 46 files / 243 tests
  - focused e2e `tests/e2e/map-and-movement.spec.ts tests/e2e/iafs-runtime.spec.ts`: passed, 11 tests
  - focused e2e `tests/e2e/map-and-movement.spec.ts tests/e2e/iafs-runtime.spec.ts tests/e2e/quest-sidebar.spec.ts`: passed, 16 tests
  - `git diff --check`: passed
- 环境备注:
  - 直接运行 `node scripts/run-playwright.mjs ...` 时本地 shell 找不到 `vite`；改用 Rush package command。
  - sandbox 内运行 Playwright dev server 触发 `listen EPERM 127.0.0.1:5173`；提权运行同一 Rush e2e 命令后通过。
