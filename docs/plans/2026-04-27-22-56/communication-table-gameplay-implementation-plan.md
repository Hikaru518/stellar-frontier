---
topic: communication-table-gameplay
date: 2026-04-27
status: draft
source:
  design: docs/plans/2026-04-27-22-56/communication-table-gameplay-design.md
  research: docs/plans/2026-04-27-22-56/research.md
  interview: docs/plans/2026-04-27-22-56/communication-table-gameplay-interview.md
tasks_file: communication-table-gameplay-tasks.json
---

# communication-table-gameplay Implementation Plan

## 1. 概述

本轮把通讯台 / 通话页 / 队员行动 / 事件 runtime 改造成统一的"内容驱动 + 桥接合流"模型，让玩家可以仅通过通讯台和通话页完成"联系队员 → 下达行动 → 看到行动推进 → 获得行动结果 → 接通事件"的闭环；并提供 Mike 残骸 / Amy 森林野兽紧急 / Garry 矿床异常三个 MVP 事件作为验收切片（详见 design doc §11.1 PS-001/002/003）。

技术方案一句话概述：**用 `content/call-actions/*.json` 定义通用动作元数据，用 `src/callActions.ts` 与 `src/callActionSettlement.ts` 替换 App.tsx 中按 crewId/tileId 硬编码的分支，并在 `mergeEventRuntimeState` 增加桥接层把事件创建的 `crew_actions` 投射回 `crew[].activeAction`，让事件选项第一次拥有真实改变世界的能力。**

任务总数：**12 个**，分 6 个执行波次。

关键风险（详见 technical design §7）：
- **R1 — 桥接 race**：事件创建 action 与 App 层 settle 同帧时 `activeAction` 被覆写。缓解：约定事件优先；新增专项单测。
- **R3 — 既有测试硬编码 tile id 回退**：本轮重构必然让一批旧用例需改写。缓解：在重构 task（TASK-006）中显式同步改写测试，断言基于 tag 行为。
- **R5 — 加 JSON 但漏 import**：`content/events/definitions/{crash_site,mine}.json` 必须同步加入 `src/content/contentData.ts`。缓解：tasks.json 在 TASK-009/011 的 modify 列表中显式列出 contentData.ts。

### 1.1 任务文件

- `tasks_file`: `communication-table-gameplay-tasks.json`

### 1.2 任务执行顺序

1. **TASK-001**: 扩展 maps schema 与默认地图内容 — 数据基座（candidateActions enum、对象 tags、beast danger_tag 修复）。
2. **TASK-002**: 新增 call-actions 内容与 schema — 内容驱动落地，含 validate-content.mjs 交叉校验。（依赖: TASK-001）
3. **TASK-003**: 实现 src/callActions.ts — 按钮视图构造纯函数。（依赖: TASK-002）
4. **TASK-004**: 实现 src/callActionSettlement.ts — 动作 handler 注册表与 settleAction。（依赖: TASK-002）
5. **TASK-005**: 桥接层与 effect 输出对齐 — bridgeCrewActions 把事件创建的 crew_actions 投射回 activeAction。（依赖: TASK-003, TASK-004）
6. **TASK-006**: 重构 App.tsx 删除硬编码分支并接入 callActionSettlement — 风险最高的 atomic 重构。（依赖: TASK-003, TASK-004, TASK-005）
7. **TASK-007**: 重构 CallPage 用 buildCallView 渲染按钮 — 删除 garryActions / Mike 湖泊硬编码。（依赖: TASK-003, TASK-006）
8. **TASK-008**: 通讯台统一所有事件来电为接通按钮 — 普通/紧急通过 severity 标签 + 倒计时区分。（依赖: TASK-006）
9. **TASK-009**: 实现 Mike crash_site_wreckage_recon 事件内容与集成。（依赖: TASK-005, TASK-007, TASK-008）
10. **TASK-010**: 实现 Amy forest_beast_emergency 紧急事件 — 含阻塞 + 倒计时 + on_failed 路径。（依赖: TASK-005, TASK-007, TASK-008）
11. **TASK-011**: 实现 Garry mine_anomaly_report 事件 — 完全 tag-driven 触发。（依赖: TASK-005, TASK-007, TASK-008）
12. **TASK-012**: 新增 e2e 三事件验收用例 — Playwright 端到端覆盖 PS-001/002/003。（依赖: TASK-009, TASK-010, TASK-011）

> 调度策略：TASK-009/010/011 在 Wave 5 内可并行（用户在 Step 3 ADR 访谈中选择并行调度）；其余 task 严格按顺序串行。建议先把 TASK-009 跑完作为事件 content 的范例，再开 010 与 011。

## 2. 技术设计

### 2.1 设计文件 `communication-table-gameplay-technical-design.md`

技术设计完整内容见同目录下 [`communication-table-gameplay-technical-design.md`](./communication-table-gameplay-technical-design.md)。

### 2.2 设计要点

**架构概览（technical design §1）**：四层最小改动
- **内容层**：新增 `content/call-actions/`、`content/events/definitions/{crash_site,mine}.json`；调整 `default-map.json` 与 `forest.json`。
- **领域层**：新增 `src/callActions.ts`（视图构造）与 `src/callActionSettlement.ts`（动作结算，替换 App.tsx 大 if 链）。
- **桥接层**：`mergeEventRuntimeState` 新增 `bridgeCrewActions`，让事件 effect 创建的 crew_actions 真正改变 `crew[].activeAction`。
- **UI 层**：`CallPage` 完全动态生成按钮；`CommunicationStation` 统一所有事件来电为"接通"。

**关键决策（5 条 ADR，technical design §2）**：
- **ADR-001 (B)**：内容化 call-actions（新建 schema + JSON），与 events / items / maps 风格一致；行为 handler 仍在代码侧白名单。
- **ADR-002 (A)**：复用现有事件 runner，本轮不主动启用 `ActionRequestNode`。
- **ADR-003 (A)**：事件 → 真实行动桥接放在 `mergeEventRuntimeState`；冲突时事件优先并写日志。
- **ADR-004 (A)**：CallPage 完全靠 buildCallView 渲染，删除所有硬编码常量。
- **ADR-005 (A)**：本轮 MVP 严格三事件（Mike 残骸 / Amy 紧急野兽 / Garry 矿床异常）。

**重要约束**：
- 所有 handler 行为基于 tile.tags + object.candidateActions + action.params；禁止 `if (member.id === ...)` / `if (tile.id === ...)` 这类硬编码。
- `content/events/definitions/*.json` 与 `content/call-actions/*.json` 必须同步 import 到 `src/content/contentData.ts`，否则 runtime 不生效（虽然 `validate:content` 仍可通过，是独立离线 lint）。
- 所有事件来电（普通 + 紧急）在通讯台都显示"接通"按钮；普通 vs 紧急通过 severity 标签 + 倒计时差异化。

---

**Planning Completed:** 2026-04-27 23:35
