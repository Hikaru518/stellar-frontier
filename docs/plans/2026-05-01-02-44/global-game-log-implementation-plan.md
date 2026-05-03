---
topic: global-game-log
date: 2026-05-01
status: draft
source:
  design: docs/plans/2026-05-01-02-44/global-game-log-design.md
  research: docs/plans/2026-05-01-02-44/research.md
  interview: docs/plans/2026-05-01-02-44/global-game-log-interview.md
tasks_file: global-game-log-tasks.json
---

# global-game-log Implementation Plan

## 1. 概述

stellar-frontier 是一个纯浏览器 React + Vite 游戏。本计划要为它增加一份**面向开发者的全局调试日志**：每次重置存档开启一个新 `.jsonl` 文件，运行期把玩家指令（通讯选择 / 移动 / 调查 / 待命 / 停止）与事件全过程（trigger / 节点跳转 / 结算结果）以信封 + JSONL 形式增量 append 到 OPFS（Origin Private File System）；DebugToolbox 内提供实时 tail、按 type/source 过滤、导出当前 run、历史 run 列表（查看 / 导出 / 删除）四类能力；OPFS 滚动保留至多 10 份归档。

**总体技术思路（一句话）**：一个专用 Web Worker 在 OPFS 上做 SyncAccessHandle 单 writer，主线程 logger facade 在 `App.tsx` 的两个中央点（`handleDecision` 与 `processAppEventTrigger`/`processAppEventWakeups`）+ `settleGameTime` diff 中间件挂接，批量推送给 Worker；DebugToolbox 新增一个 Panel 通过订阅 ring buffer 做实时展示。

**任务总数**：18（其中 P0 = 13 条，P1 = 5 条）。

**关键风险**：
1. OPFS Sync Access Handle 在 Safari/Firefox 与 Chrome 行为差异 — 通过 Worker 启动自检 + 失败降级为 memory_only 缓解。
2. `event_logs` diff 与 `crew_actions` diff 可能漏写或重复 — 全部用 id 集合做差集，配合单测覆盖等长但 id 不同的边界。
3. 多 tab 同 origin 双 writer 可能损坏文件 — 用 BroadcastChannel 选举 + heartbeat，BroadcastChannel 不可用时 fallback 为 single-writer 假设。

### 1.1 任务文件

- `tasks_file`: `global-game-log-tasks.json`

### 1.2 任务执行顺序

1. **TASK-001**: 构建期注入 `__APP_VERSION__` 与 worker tsconfig 准备 — vite define + tsconfig.worker + 测试 setup（基础设施）
2. **TASK-002**: logger 模块类型定义骨架 — `LogEntry` discriminated union + Worker / Broadcast 协议
3. **TASK-003**: 信封自动填充与内存环形缓冲（envelope + ringBuffer）— 纯模块（依赖: TASK-002）
4. **TASK-004**: OPFS run store（Worker 内文件管理抽象）— 含 mock OPFS（依赖: TASK-002）
5. **TASK-005**: logger.worker.ts 入口与消息处理 —（依赖: TASK-002, TASK-004）
6. **TASK-006**: logger facade — 日志写入主路径与降级 — 主线程 API 写侧（依赖: TASK-003, TASK-005）
7. **TASK-007**: logger facade — rotate / 读 / 删 / 列表 / 导出（依赖: TASK-006）
8. **TASK-008**: App.tsx 接入 — resetGame / 新 run / 归档轮转（依赖: TASK-007）
9. **TASK-009**: App.tsx 接入 — handleDecision 玩家指令日志（依赖: TASK-008）
10. **TASK-010**: App.tsx 接入 — 事件引擎日志（trigger / node.enter / resolved）（依赖: TASK-008）
11. **TASK-011**: DebugToolbox 加入 LogPanel 骨架与 OPFS 状态横幅（依赖: TASK-007）
12. **TASK-012**: LogPanel 实时 tail 与过滤（依赖: TASK-011）
13. **TASK-013**: LogPanel 导出当前 run 按钮（依赖: TASK-007, TASK-011）
14. **TASK-014**: 多 tab writer 选举状态机（纯模块） — P1（依赖: TASK-002）
15. **TASK-015**: logger facade 集成多 tab 写入选举 — P1（依赖: TASK-014, TASK-008）
16. **TASK-016**: App.tsx 接入 — beforeunload 强制 flush 与 run.end — P1（依赖: TASK-008）
17. **TASK-017**: App.tsx 接入 — settleGameTime 行动终态 diff 写 action.complete — P1（依赖: TASK-008）
18. **TASK-018**: LogPanel 历史 run 列表（查看 / 导出 / 删除）— P1（依赖: TASK-013）

排序原则：
- **P0 全部排在 P1 之前**，让最小可演示版本（系统启动后能写日志、能 tail、能导出）尽早形成端到端闭环。
- **基础设施 → 纯模块 → Worker → 主线程 facade → App.tsx 中间件 → UI**：让上层 task 拿到稳定的下层 API。
- 同等条件下，**Worker 写侧主路径（TASK-005..007）排在 UI（TASK-011..013）之前**，因为 UI 测试需要 facade 已经能产出条目。
- TASK-014 / TASK-015（多 tab 选举）放到 P1 块首，因为它的依赖（TASK-008）在 P0 已经完成；不阻塞主路径。

## 2. 技术设计

### 2.1 设计文件 [global-game-log-technical-design.md](global-game-log-technical-design.md)

### 2.2 设计要点

**架构（三层 + 一个独立 Worker）**：

| 层 | 模块 | 职责 |
| --- | --- | --- |
| Worker（独立线程） | `src/logger/logger.worker.ts` + `opfsRunStore.ts` | 持有 OPFS `FileSystemSyncAccessHandle`，按消息 append/flush/rotate/list/read/delete；所有 I/O 同步执行不阻塞主线程。 |
| 主线程 facade | `src/logger/index.ts` + `envelope.ts` + `ringBuffer.ts` + `writerElection.ts` | 信封自动填充、ring buffer + 订阅、批量 flush（500 ms / 50 条）、Worker 消息往返、多 tab 选举、降级到 memory_only。 |
| App 中间件 | `App.tsx` 内的几处包装 | 在 `resetGame` / `handleDecision` / `processAppEventTrigger` / `processAppEventWakeups` / `settleGameTime` / `beforeunload` 上插入 `logger.log` 调用与 diff 计算。 |
| UI | `pages/DebugToolbox/LogPanel.tsx` + `DebugToolbox.tsx` 修改 | 订阅 logger，实现实时 tail / 过滤 / 导出 / 历史列表 / 状态横幅。 |

**关键技术决策（详见 technical-design 的 ADR 章节）**：

- **ADR-001**：日志载体选 OPFS（不是 FSA / IndexedDB / 仅内存）— 唯一同时满足跨主流浏览器、零授权、真正 append 的方案。
- **ADR-002**：日志条目用 9 字段最小信封（含 payload）— 调用方只填 `type + source + payload`，其余自动；为 schema 演进预留 `log_version`。
- **ADR-003**：写入路径 = 主线程批量 buffer + Worker 单 writer Sync Access Handle；崩溃接受 ~500 ms 尾部丢失。
- **ADR-004**：`event.node.enter` **零侵入**地从 `GraphRunnerResult.transitions` 反推（探索发现该字段已天然存在），不修改事件引擎签名。
- **ADR-005**：`action.complete` 通过 `crew_actions` 的 before/after diff 一处 hook 覆盖所有终态迁移（completeCrewActionState / move 完成 / 若干 failed/interrupted 直接赋值），避免逐点埋点遗漏。
- **ADR-006**：`game_version` 通过 vite `define` 注入 `package.json.version`（git commit hash 留 Later）。
- **ADR-007**：DebugToolbox 接入 = 新增第三个 Panel（不引入 Tab 容器），Panel 内 `current` / `archive` 两 mode 切换，与现有 Panel 视觉一致。
- **ADR-008**：多 tab writer 用 BroadcastChannel + 先到先得 + 1 s heartbeat；不可用时 fallback 单 writer。
- **ADR-009**：`system.run.start` 不附 GameState 起始快照（与设计 §4 非目标 E 一致），未来需要 replay 时通过 `log_version` 升级带入。
- **ADR-010**：payload schema 由 TypeScript discriminated union 在写侧约束，读侧 tolerant 解析；不引入运行时 JSON Schema 校验。

**对应的 9 种日志 type**：
`system.run.start` / `system.run.end` / `player.call.choice` / `player.move.target` / `player.action.dispatch` / `event.trigger` / `event.node.enter` / `event.resolved` / `action.complete`。

**MVP 阶段不做（与 design §4 / §10.2 一致）**：玩家面向"航行日志" UI、完整 deterministic replay、日志搜索 / 时间轴可视化、FSA 用户可见文件双写、远程上报、跨 run 聚合查询、日志压缩。

---

**Planning Completed:** 2026-05-01 03:50
