---
topic: event-program-model-player-journey
date: 2026-04-27
status: draft
source:
  design: docs/plans/2026-04-27-15-33/event-program-model-player-journey-design.md
  game_model_spec: docs/plans/2026-04-27-15-33/event-program-model-player-journey-game-model-spec.md
  initial: docs/plans/2026-04-27-15-33/initial.md
  research: docs/plans/2026-04-27-15-33/research.md
tasks_file: event-program-model-player-journey-tasks.json
technical_design: event-program-model-player-journey-technical-design.md
---

# Event Program Model Player Journey Implementation Plan

## 1. 概述

本计划把已批准的事件程序模型设计转成可串行执行的开发任务。目标是重建事件系统：静态内容资产放入全局资产库，运行时用 `event`、`call` 和 `objective` 表达进度，事件图驱动节点推进，结构化 condition/effect 读写 `GameState`，生产级校验保证内容能被批量生产。

技术方案采用 brownfield cutover。旧 `content/events/events.json`、旧 `CrewMember.emergencyEvent`、旧 `CallPage` 硬编码分支、旧事件存档都不作为兼容目标。新实现以 `src/events/` 纯 TypeScript 领域模块为核心，再接入 `App.tsx`、通讯台、通话页、地图和存档。

本计划共拆成 15 个任务。关键风险是范围大、旧测试会失效、内容资产引用容易出错；缓解方式是先固化模型和校验，再实现引擎，随后用 5 个样例事件验证路径，最后替换 UI 和回归测试。

### 1.1 任务文件

- `tasks_file`: `event-program-model-player-journey-tasks.json`

### 1.2 任务执行顺序

1. **TASK-001**: 建立事件程序模型 TypeScript 契约 — 固定新 `GameState`、runtime event/call/objective 和 save state 边界。
2. **TASK-002**: 搭建全局事件资产库加载与索引 — 建立 `content/events` 目录入口和 `EventContentIndex`。（依赖: TASK-001）
3. **TASK-003**: 新增事件 JSON Schema 与基础内容校验入口 — 让 `validate:content` 能校验新事件资产结构。（依赖: TASK-002）
4. **TASK-004**: 实现事件图、引用和模板一致性校验 — 校验 DAG、终点路径、跨文件引用和 option/template 对齐。（依赖: TASK-003）
5. **TASK-005**: 实现结构化 condition evaluator — 支撑 trigger、选项可见性和 handler_condition。（依赖: TASK-001, TASK-002）
6. **TASK-006**: 实现结构化 effect executor — 通过 target_ref 写入 crew、tile、inventory、objective、event_log 和 world_history。（依赖: TASK-001, TASK-005）
7. **TASK-007**: 实现事件图 runner 与 runtime event 生命周期 — 支撑 9 类节点的状态转换和单活跃节点推进。（依赖: TASK-004, TASK-006）
8. **TASK-008**: 实现 runtime call renderer 与选项回写 — 把 `call_template` 渲染成 active call，并用稳定 `option_id` 推进事件。（依赖: TASK-007）
9. **TASK-009**: 实现 trigger intake、候选选择与时间唤醒 — 统一 arrival、action_complete、call_choice、objective_completed 和 time_wakeup 入口。（依赖: TASK-008）
10. **TASK-010**: 实现 lightweight objective runtime — 支撑跨队员目标创建、分配、完成和 parent event 回写。（依赖: TASK-009）
11. **TASK-011**: 生产五个样例事件资产与 dry-run fixture — 覆盖普通发现、紧急多通话、等待、跨队员目标和长期后果。（依赖: TASK-010）
12. **TASK-012**: 把事件引擎接入 App 时间与行动流程 — 替换旧事件触发、紧急结算和硬编码行动完成分支。（依赖: TASK-011）
13. **TASK-013**: 替换通讯台与通话页为 runtime call UI — 页面只展示 active call 快照并提交 `option_id`。（依赖: TASK-012）
14. **TASK-014**: 展示事件摘要、地块标记与目标状态 — 把事件后果接到地图、队员详情、控制中心和通讯台。（依赖: TASK-013）
15. **TASK-015**: 完成内容校验、单测与端到端回归 — 收束 `validate:content`、lint、unit tests 和 e2e。（依赖: TASK-014）

## 2. 技术设计

### 2.1 设计文件

- `event-program-model-player-journey-technical-design.md`

### 2.2 设计要点

技术设计把系统拆成五层：内容资产、内容加载与校验、事件领域引擎、游戏集成、页面展示。内容资产用 `event_definition` 和 `call_template` 分离逻辑与表现；领域引擎解释事件图、condition、effect、runtime call 和 objective；React 层只负责展示和提交玩家选择。

关键 ADR 已固定：

- 研发期完整 cutover，不兼容旧事件内容和旧存档。
- 静态事件定义与通话模板分离，`option_id` 是唯一逻辑主键。
- condition/effect 使用结构化 JSON 与白名单 handler。
- MVP 事件图只支持 DAG 和单活跃节点，不做 `parallel` / `join`。
- active call 保存渲染快照，resolved 后只保留事件摘要和 world history。
- 事件引擎必须是纯 TypeScript 领域模块，不能把分支逻辑留在 React 页面。
- 生产级校验必须覆盖 schema、引用、图结构、模板对齐、handler 参数和 sample dry-run。
- objective 保持轻量，只服务事件后续行动，不扩展为完整 quest system。

后续开发应先执行 `TASK-001`，不要直接改 UI 或生产大量正式事件。每个任务完成后按影响范围运行 `npm run validate:content`、`npm run lint`、`npm run test` 或 `npm run test:e2e`。

---

**Planning Completed:** 2026-04-27 16:45
