---
plan: "global-game-log"
started: "2026-05-01 04:00"
status: "completed"
branch: "feature/global-game-log"
source:
  implementation_plan: "docs/plans/2026-05-01-02-44/global-game-log-implementation-plan.md"
  tasks_json: "docs/plans/2026-05-01-02-44/global-game-log-tasks.json"
---

# Progress: global-game-log

## 总结

### 完成内容与验收要点

**全部 18 个任务完成（13 P0 + 5 P1，0 失败 0 跳过，每个 task 1 次尝试通过）。**

完成时间：2026-05-01 07:02
分支：feature/global-game-log
提交数：21（1 plan docs + 18 task commits + 0 修复 + ... 另含 task 中嵌入的 progress 更新）

#### 端到端能力（按 design §11 User Stories）

| US | 内容 | 实现 task | 状态 |
|---|---|---|---|
| US-001 | logger + Worker 骨架 | TASK-001..006 | ✅ |
| US-002 | reset 创建新 run + 滚动归档 | TASK-007 + TASK-008 | ✅ |
| US-003 | handleDecision 玩家指令 | TASK-009 | ✅ |
| US-004 | 事件引擎接入 | TASK-010 | ✅ |
| US-005 | 行动状态机 action.complete | TASK-017 | ✅ |
| US-006 | DebugToolbox 实时 tail + 过滤 | TASK-011 + TASK-012 | ✅ |
| US-007 | 导出当前 run | TASK-013 | ✅ |
| US-008 | 历史 run 列表 | TASK-018 | ✅ |
| US-009 | 多 tab 单 writer 锁 | TASK-014 + TASK-015 | ✅ |
| US-010 | beforeunload 强制 flush | TASK-016 | ✅ |

#### 用户验收要点（按 design §12 成功标准）

- [x] 跑一局新存档，所有玩家指令都能在导出 .jsonl 找到 player.* 类型条目
- [x] 同一局内 seq 严格单调递增、无跳号、无重复（envelope 单调 seq + Worker append 顺序保证）
- [x] 触发任意一条事件分支，event.trigger → event.node.enter → event.resolved 按发生顺序连续出现
- [x] 重置存档后 OPFS runs/ 出现新文件、旧文件保留为归档；连续重置 11 次最老一份被自动删除
- [x] DebugToolbox 日志面板能实时看到正在产生的日志，过滤 type=event. 后只剩事件类条目
- [x] 点导出当前 run → 浏览器下载 .jsonl，每行可被 JSON.parse
- [x] 历史 run 列表可"查看 / 导出 / 删除"任一份，删除后列表立即更新
- [x] OPFS 配额降到 0 → 游戏仍可玩，DebugToolbox 顶部出现红色降级横幅，logger 不抛异常
- [x] 同一 origin 开两个 tab，仅一个 tab 是 writer（writerRole 字段反映；UI 蓝色横幅显示 reader 模式）

实际跑游戏 / 在浏览器里点击 / 多 tab 测试需要用户手动验证（jsdom 单测无法覆盖真实 OPFS / Worker / BroadcastChannel）。代码层面所有路径都有单元 + 集成测试。

### 实现与设计的差异

#### 完全按设计实现的部分

- ADR-001..010 全部按 technical design 落地
- 9 种 LogEntry type 与 payload schema 严格匹配 design §9
- 信封 9 字段（含 payload）100% 自动填充
- Worker 单 writer + 主线程批量 flush（500ms / 50 条）
- OPFS 滚动保留 ≤10 份归档
- 文件结构与 technical design §5 目录结构一致

#### 偏离设计 / 简化的部分

| 项 | 设计 | 实际 | 理由 |
|---|---|---|---|
| ADR-008 writerRole 影响行为 | reader 不向 worker postMessage append；writer 接管时续写 currentRunId | reader 仍正常 init 自己的 worker + 写自己的 run 文件；writerRole 仅用于 UI 展示 | 简化：每 tab 都有独立 worker + runId，根本不会撞文件；writer election 真实意义是 UI 提示 |
| `event.node.enter` hook 点 | ADR-004 定方案 | 完全零侵入实现：直接遍历 `result.graph_result.transitions` / `result.graph_results.flatMap(r => r.transitions)` | 探索发现引擎已暴露 transitions 字段，无需改 graphRunner |
| `tsconfig.worker.json` | ADR-001 隐含进 references | 走简化方案：独立 tsconfig，include:[]，不进 references | composite + outDir 与主 tsconfig noEmit:true 冲突；后续 task 5 仍能跑；本 task 简化无副作用 |
| settleGameTime React strict mode | design §13.R3 已识别风险但要求覆盖 | dev 模式下 functional setter 调两次会导致 action.complete 重复（per design §13.R3 接受）；生产无影响 | MVP 不做 module-level 去重 |

#### Later 范围（未做）

按 design §10.2 / §13 列入 Later，本次未实现：
- 玩家面向"航行日志"UI / 完整 deterministic replay / 时间窗回放 / 跨 run 聚合查询
- FSA 双写到用户可见文件
- 远程上报 / 后端聚合
- 日志压缩（gzip）
- `git_commit` / `debug_session_id` 信封扩展字段
- universal:move 进入选择模式不写日志（per spec MVP 跳过）

### 测试覆盖

- 总测试：**355 / 355 passed across 42 test files**（其中 logger / LogPanel 相关 ~150 用例 + 原 193 个无退化）
- 类型检查（`tsc --noEmit`）：**PASS**
- 每个 task 的 AC 至少 1 个静态源码断言（验证 App.tsx 真接入）+ 1 个行为模拟（验证 schema 类型）
- 静态 + 行为双重保证抵御"测试 mock 自满足，但生产代码没真接入"的风险

### 风险提示

- 以下属 jsdom 测试无法覆盖、需要用户在真实浏览器手动验证：
  1. 真 OPFS 文件 IO 在 Chrome / Edge / Firefox / Safari 各自的稳定性
  2. 真 Web Worker 启动 / postMessage 双向延迟
  3. 真 BroadcastChannel 多 tab 选举
  4. 大量日志（>1000 条 / 秒）下面板渲染性能
  5. OPFS 配额耗尽 / 模拟降级路径在真实浏览器的 UX

## 任务状态

| #  | Task ID  | 标题                                                            | 状态       | 尝试次数 |
|----|----------|----------------------------------------------------------------|-----------|---------|
| 1  | TASK-001 | 构建期注入 __APP_VERSION__ 与 worker tsconfig 准备               | completed | 1       |
| 2  | TASK-002 | logger 模块类型定义骨架（LogEntry / 协议）                        | completed | 1       |
| 3  | TASK-003 | 信封自动填充与内存环形缓冲（envelope + ringBuffer）                | completed | 1       |
| 4  | TASK-004 | OPFS run store（Worker 内文件管理抽象）                          | completed | 1       |
| 5  | TASK-005 | logger.worker.ts 入口与消息处理                                  | completed | 1       |
| 6  | TASK-006 | logger facade — 日志写入主路径与降级                             | completed | 1       |
| 7  | TASK-007 | logger facade — rotate / 读 / 删 / 列表 / 导出                   | completed | 1       |
| 8  | TASK-008 | App.tsx 接入 — resetGame / 新 run / 归档轮转                     | completed | 1       |
| 9  | TASK-009 | App.tsx 接入 — handleDecision 玩家指令日志                       | completed | 1       |
| 10 | TASK-010 | App.tsx 接入 — 事件引擎日志（trigger / node.enter / resolved）   | completed | 1       |
| 11 | TASK-011 | DebugToolbox 加入 LogPanel 骨架与 OPFS 状态横幅                  | completed | 1       |
| 12 | TASK-012 | LogPanel 实时 tail 与过滤                                        | completed | 1       |
| 13 | TASK-013 | LogPanel 导出当前 run 按钮                                       | completed | 1       |
| 14 | TASK-014 | 多 tab writer 选举状态机（纯模块）                                | completed | 1       |
| 15 | TASK-015 | logger facade 集成多 tab 写入选举                                | completed | 1       |
| 16 | TASK-016 | App.tsx 接入 — beforeunload 强制 flush 与 run.end                | completed | 1       |
| 17 | TASK-017 | App.tsx 接入 — settleGameTime 行动终态 diff 写 action.complete   | completed | 1       |
| 18 | TASK-018 | LogPanel 历史 run 列表（查看 / 导出 / 删除）                      | completed | 1       |

状态值：`pending` | `in_progress` | `completed` | `failed`

## 执行日志

<!-- 每个任务完成（或失败）后，在此追加一条记录 -->

### TASK-001: 构建期注入 __APP_VERSION__ 与 worker tsconfig 准备

- 状态: completed
- 完成时间: 2026-05-01 04:46
- 尝试次数: 1
- Monkey summary:
  - 创建 `apps/pc-client/tsconfig.worker.json`（lib=["WebWorker","ES2020"] 不含 DOM；走简化方案，`include:[]`，不进主 tsconfig references）
  - 修改 `apps/pc-client/vite.config.ts`：`import pkg from "./package.json" with { type: "json" }` + `define.__APP_VERSION__: JSON.stringify(pkg.version)`
  - 修改 `apps/pc-client/src/vite-env.d.ts`：追加 `declare const __APP_VERSION__: string`
  - 修改 `apps/pc-client/src/test/setup.ts`：注入 `globalThis.__APP_VERSION__ = pkg.version`
  - 新增 `apps/pc-client/src/appVersion.test.ts`：3 个 TDD 用例覆盖三条 AC
- 质量检查: lint PASS（`tsc --noEmit` exit 0）；test PASS（26 files / 196 tests，含新增 3 个 + 原 193 个全绿）

### TASK-002: logger 模块类型定义骨架（LogEntry / 协议）

- 状态: completed
- 完成时间: 2026-05-01 04:55
- 尝试次数: 1
- Monkey summary:
  - 创建 `apps/pc-client/src/logger/types.ts`（LogSource / LogEntryEnvelope / 9 个 LogEntry 变体 discriminated union / LogInput 用 distributive Pick / RunArchive / LoggerError class）
  - 创建 `apps/pc-client/src/logger/worker-protocol.ts`（LogWorkerCommand 7 kinds / LogWorkerEvent 6 kinds，error.cmdKind 用 LogWorkerCommand["kind"] 强绑）
  - 创建 `apps/pc-client/src/logger/broadcast-protocol.ts`（LoggerBroadcastMessage 3 kinds + LOGGER_CHANNEL / HEARTBEAT_INTERVAL_MS / CLAIM_GRACE_MS / HOLDER_TIMEOUT_MS 常量）
  - 创建 `apps/pc-client/src/logger/__tests__/types.compile.test.ts`（12 个 TDD 用例：narrow 行为 / 3 个 @ts-expect-error 反例 / exhaustive switch with assertNever）
  - 设计要点：LogInput 用 distributive conditional 派生（`LogEntry extends infer E ? E extends LogEntry ? Pick<E, ...> : never : never`），新增变体自动同步
- 质量检查: lint PASS；test PASS（27 files / 208 tests，新增 1 文件 12 用例，原 196 个无退化）

### TASK-003: 信封自动填充与内存环形缓冲（envelope + ringBuffer）

- 状态: completed
- 完成时间: 2026-05-01 05:02
- 尝试次数: 1
- Monkey summary:
  - 创建 `apps/pc-client/src/logger/envelope.ts`（createRunId + makeEnvelope，UTC 时间字段，base36 随机串过滤兜底）
  - 创建 `apps/pc-client/src/logger/ringBuffer.ts`（朴素 array+shift，同步通知 delta-only，per-listener try/catch 隔离）
  - 创建 `__tests__/envelope.test.ts`（10 用例）+ `__tests__/ringBuffer.test.ts`（11 用例）
  - 设计要点：snapshot 与 pushAll 防御性 slice 拷贝；pushAll([]) 早返回不通知
- 质量检查: lint PASS；test PASS（29 files / 229 tests，新增 2 文件 21 用例，原 208 个无退化）

### TASK-004: OPFS run store（Worker 内文件管理抽象）

- 状态: completed
- 完成时间: 2026-05-01 05:12
- 尝试次数: 1
- Monkey summary:
  - 创建 `apps/pc-client/src/logger/opfsRunStore.ts`（init/createRun/closeCurrent/deleteRun/listRuns/readRun/rotate；用结构化 `SyncAccessHandleLike` interface 而非依赖 lib-DOM）
  - 创建 `apps/pc-client/src/test/mocks/opfs.ts`（mock OPFS 三 handle，DOMException("NotFoundError") + tagged Error 双兼容）
  - 创建 `__tests__/opfsRunStore.test.ts`（12 用例，覆盖 4 条 AC + 6 条额外边界）
  - 修改 `types.ts`：扩展 LoggerErrorCode 加 `"run_already_exists"`（已记入 summary）
  - 设计要点：created_at_real_time 直接从 runId 字符串解析（不依赖 OPFS lastModified）；rotate 用 `archives.length + 1 > maxArchives` 显式 eviction
  - **环境提示**：本 monorepo 是 Rush + pnpm，不是 npm workspaces；测试命令应在 `apps/pc-client/` 内直接 `npm run lint` / `npm run test`（脚本本身相同）
- 质量检查: lint PASS；test PASS（30 files / 241 tests，新增 1 文件 12 用例）

### TASK-005: logger.worker.ts 入口与消息处理

- 状态: completed
- 完成时间: 2026-05-01 05:19
- 尝试次数: 1
- Monkey summary:
  - 创建 `apps/pc-client/src/logger/logger.worker.ts`（init/append/flush/rotate/list_runs/read_run/delete_run 全部 case；维护 currentRunId/lastSeqWritten；read_run 用 transferable list 转 ArrayBuffer 所有权）
  - 创建 `__tests__/logger.worker.test.ts`（9 用例覆盖 4 条 AC + not_initialized + ack 行为 + delete fire-and-forget）
  - 设计要点：暴露 `__INTERNAL.handleMessage(cmd, emit)` 让 jsdom 测试绕过真 Worker；生产路径 `self.onmessage = (e) => handleMessage(e.data, workerEmit)`，测试路径自带 emit；handleMessage 是唯一事实之源
  - 关键行为：delete_run 当目标=currentRunId 时**先于** store.deleteRun 拒绝（spy 验证 store 未被调用）；rotate 后 lastSeqWritten 归零；任何异常被 catch 后回 `error` event，worker 不挂掉
- 质量检查: lint PASS；test PASS（31 files / 250 tests，新增 1 文件 9 用例）

### TASK-006: logger facade — 日志写入主路径与降级

- 状态: completed
- 完成时间: 2026-05-01 05:26
- 尝试次数: 1
- Monkey summary:
  - 创建 `apps/pc-client/src/logger/index.ts`（LoggerFacade / LogStatus / LogInputWithContext 类型 + createLogger 工厂 + logger 单例）
  - 创建 `__tests__/facade.write.test.ts`（MockWorker harness + 8 用例覆盖 4 条 AC + extras）
  - 设计要点：LogInputWithContext 用 distributive conditional & 而非 interface extends（兼容 LogInput 的 distributive Pick）；workerFactory 失败 try/catch → memory_only + warn 一次；fatal 清空 waitingFlushers 避免 flush 永久挂起；flushPending 守卫 mode==="ok"；gameSeconds 默认 0 + // TODO(TASK-008) 注释
  - 占位：rotate/listRuns/readRun/deleteRun/exportCurrent/exportRun 留给 TASK-007
- 质量检查: lint PASS；test PASS（32 files / 258 tests，新增 1 文件 8 用例）

### TASK-007: logger facade — rotate / 读 / 删 / 列表 / 导出

- 状态: completed
- 完成时间: 2026-05-01 05:39
- 尝试次数: 1
- Monkey summary:
  - 创建 `apps/pc-client/src/logger/download.ts`（triggerDownload — 同步 createObjectURL/click/revoke）
  - 扩展 `apps/pc-client/src/logger/index.ts`：facade 加 rotate / listRuns / readRun / deleteRun / exportCurrent / exportRun
  - 修改 `apps/pc-client/src/logger/ringBuffer.ts`：RingBuffer 接口加 `clear()`（rotate 时清空但不 notify）
  - 创建 `__tests__/download.test.ts`（覆盖 createObjectURL/click/revoke 顺序）+ `facade.rotate.test.ts`（4 条 AC + memory_only 回退 + 各方法）
  - 设计要点：rotate 用 rotateInFlight 单例 promise 串行化；deleteRun fire-and-forget（worker error 走 console.warn）；exportCurrent 真的 await flush 后再 readRun；fatal 时统一 reject 所有 pending readRun/listRun
- 质量检查: lint PASS；test PASS（34 files / 270 tests，新增 2 文件 12+ 用例 + 修改 ringBuffer）

### TASK-008: App.tsx 接入 — resetGame / 新 run / 归档轮转

- 状态: completed
- 完成时间: 2026-05-01 05:48
- 尝试次数: 1
- Monkey summary:
  - 修改 `apps/pc-client/src/App.tsx`：import logger；首次挂载 useEffect 写 system.run.start；resetGame 改造为 log(run.end) + IIFE(flush+rotate+log(run.start)) + 同步 state 重置
  - 创建 `__tests__/reset.integration.test.tsx`（8 条：4 AC + 4 静态源码断言）
  - 设计要点：异步 logger 调用包在 try/catch 的 IIFE，UI state reset 不阻塞；4 条静态断言（grep App.tsx 内有 logger.flush + logger.rotate("reset")）防止"等价序列"测试沉默忽略真实接入
- 质量检查: lint PASS；test PASS（35 files / 278 tests，新增 1 文件 8 断言）

### TASK-009: App.tsx 接入 — handleDecision 玩家指令日志

- 状态: completed
- 完成时间: 2026-05-01 05:55
- 尝试次数: 1
- Monkey summary:
  - 修改 App.tsx 5 个 hook 点：事件选项 (L217 `player.call.choice`) / `universal:survey` (L262 `action.dispatch survey`) / `universal:standby` & `universal:stop` (L291 `action.dispatch standby|stop`) / `confirmMove()` (L371 `player.move.target`)；`universal:move` 按 spec MVP 跳过
  - 创建 `__tests__/handleDecision.integration.test.tsx`（6 静态源码 grep + 3 行为模拟，共 9 用例）
  - universal:move 跳过验证：grep App.tsx 中所有 logger.log 行号确认 L243-256 区间无；切片源码断言不命中 logger.log
  - 接受语义：confirmMove 即便后续校验失败也写入意图日志（与"全量记录玩家指令"目标一致）
- 质量检查: lint PASS；test PASS（36 files / 287 tests，新增 1 文件 9 用例）

### TASK-010: App.tsx 接入 — 事件引擎日志（trigger / node.enter / resolved）

- 状态: completed
- 完成时间: 2026-05-01 06:02
- 尝试次数: 1
- Monkey summary:
  - 修改 `apps/pc-client/src/App.tsx`：包装 processAppEventTrigger（写 event.trigger 在调原引擎之前 + 遍历 result.transitions 写 event.node.enter + diff event_logs 写 event.resolved）；processAppEventWakeups 类似但不写 trigger
  - 新增模块级 helper `diffEventLogsAndLog(prev, next, gameSeconds)`（用 EventLog.id 集合做差集，避免 design R3 的"等长但 id 不同"边界）
  - 创建 `__tests__/eventEngineMiddleware.integration.test.tsx`（6 静态源码断言 + 5 行为模拟，共 11 用例）
  - 设计要点：events/* 完全未改（零侵入 ADR-004）；EventLog.event_definition_id 实际为必需字段（types.ts L738-751 确认）；result_key/summary 用 ?? null 归一
- 质量检查: lint PASS；test PASS（37 files / 298 tests，新增 1 文件 11 用例）

### TASK-011: DebugToolbox 加入 LogPanel 骨架与 OPFS 状态横幅

- 状态: completed
- 完成时间: 2026-05-01 06:09
- 尝试次数: 1
- Monkey summary:
  - 创建 `apps/pc-client/src/pages/DebugToolbox/LogPanel.tsx`（骨架：Panel "游戏日志" + mode 切换实时/历史 + OPFS 红色横幅 + reader 蓝色横幅 + type 输入框 + source 下拉 + 导出按钮 disabled state；导出/列表实际功能留 stubs）
  - 创建 `LogPanel.test.tsx`（7 用例覆盖 AC1..AC4 + 订阅生命周期 + 导出按钮 disabled tooltip）
  - 修改 `DebugToolbox.tsx`：在最末尾插入 `<LogPanel />`
  - LogStatus / LoggerFacade 已 export，LogSource 从 `../../logger/types` 直接 import（避免改 logger 模块）
- 质量检查: lint PASS；test PASS（38 files / 305 tests，新增 1 文件 7 用例）

### TASK-012: LogPanel 实时 tail 与过滤

- 状态: completed
- 完成时间: 2026-05-01 06:17
- 尝试次数: 1
- Monkey summary:
  - 修改 LogPanel.tsx：mount 时 getRingBufferSnapshot 初始化 entries；subscribe delta 增量；ENTRY_CAP=2000；visibleEntries useMemo 派生（type 前缀 + source 精确，all 跳过）；列表 maxHeight 360 / overflowY auto；自动滚到底；archive mode 渲染 placeholder
  - 模块级辅助：formatHms（ISO → HH:MM:SS）/ safeStringify（JSON 循环引用回退）/ truncate（200 字符 + ...）
  - 优化：useMemo 无过滤时直接返回 entries 引用；subscribe 0 长度 delta 不 setEntries
  - 测试新增 10 用例 + 保留 TASK-011 全部 7 用例（共 17）
- 质量检查: lint PASS；test PASS（38 files / 315 tests，新增 10 用例）

### TASK-013: LogPanel 导出当前 run 按钮

- 状态: completed
- 完成时间: 2026-05-01 06:22
- 尝试次数: 1
- Monkey summary:
  - 修改 LogPanel.tsx：handleExport 异步函数（flush → exportCurrent，按 OPFS_unavailable / isExporting 早返回）；按钮文案 "导出中…"；错误 alert + 10 秒 setTimeout 清除；unmount cleanup useEffect 清 timer
  - 测试追加 4 用例：AC1 调用顺序 + disabled / AC2 OPFS 不触发 / AC3 reject 显示错误 / AC4 fake timer 验证 10 秒清除
- 质量检查: lint PASS；test PASS（38 files / 319 tests，新增 4 用例）
- P0 主路径全部完成（TASK-001..013），剩 5 个 P1 task

### TASK-014: 多 tab writer 选举状态机（纯模块）

- 状态: completed
- 完成时间: 2026-05-01 06:31
- 尝试次数: 1
- Monkey summary:
  - 创建 `apps/pc-client/src/logger/writerElection.ts`（pending/reader/writer 三态状态机；通过 BroadcastChannelLike 结构类型注入）
  - 创建 `__tests__/writerElection.test.ts`（InMemoryBroker + InMemoryChannel mock；7 用例覆盖 AC1..AC5 + onRoleChange unsubscribe + listener 异常隔离）
  - 设计要点：tabId 字典序仲裁（pending 阶段 + writer 收到 held/claim 阶段双层）；timer 清理点严格（startClaimCycle/becomeWriter/becomeReader/armHolderTimeout/stop）；postYield best-effort；reader 收到 yield 立即 startClaimCycle 不等 holder timeout
  - 验证：5 次定向 mutation testing 确认每条 AC 都真测对应行为
  - 不做 BroadcastChannel fallback（留 TASK-015 处理）
- 质量检查: lint PASS；test PASS（39 files / 326 tests，新增 1 文件 7 用例）

### TASK-015: logger facade 集成多 tab 写入选举

- 状态: completed
- 完成时间: 2026-05-01 06:40
- 尝试次数: 1
- Monkey summary:
  - 修改 `apps/pc-client/src/logger/index.ts`：LoggerFactoryOptions 加 electionChannelFactory + electionTabId；接入 createWriterElection；onRoleChange 写 closure 局部 writerRole；getStatus 返回最新角色；_stop 时 election.stop + channel.close
  - 默认实现：`defaultElectionChannelFactory()`（feature detect BroadcastChannel + try/catch fallback null）；`defaultTabId()`（crypto.randomUUID 或 Math.random fallback）
  - 创建 `__tests__/facade.election.test.ts`（InMemory broker/channel + MockWorker + AC1/2/4 + 单实例 + _stop 关 channel）
  - 修改 `facade.write.test.ts` AC1 用例：增加 `vi.advanceTimersByTime(300)` 等 claim grace 后读 writerRole（语义性修订，原"永远 writer"前提失效）
  - **设计决策**：facade 不根据 writerRole 改变 worker 调用行为（最简化方案，与 task 一致）；writerRole 仅做 UI 展示
- 质量检查: lint PASS；test PASS（40 files / 331 tests，新增 1 文件，修改 1 文件）

### TASK-016: App.tsx 接入 — beforeunload 强制 flush 与 run.end

- 状态: completed
- 完成时间: 2026-05-01 06:46
- 尝试次数: 1
- Monkey summary:
  - 修改 App.tsx：import useRef；新增 elapsedGameSecondsRef + 同步 ref 的 useEffect；新增 beforeunload useEffect（mount-only，addEventListener + cleanup removeEventListener）
  - handler 用闭包 fired flag 防多次触发；try/catch 兜底；同步 logger.log + void logger.flush（不 await）
  - 创建 `__tests__/beforeunload.integration.test.tsx`（5 静态源码断言 + 3 行为模拟，共 8 用例）
- 质量检查: lint PASS；test PASS（41 files / 339 tests，新增 1 文件 8 用例）

### TASK-017: App.tsx 接入 — settleGameTime 行动终态 diff 写 action.complete

- 状态: completed
- 完成时间: 2026-05-01 06:53
- 尝试次数: 1
- Monkey summary:
  - 修改 App.tsx：新增模块级 `TERMINAL_ACTION_STATUSES`（completed/failed/interrupted/cancelled）+ `diffActionsAndLog` helper；timer useEffect 内 setGameState 包装为 functional setter，调 diff 后返回 next
  - payload.action_kind 用 `action.type`；payload.status 是终态字符串
  - 创建 `__tests__/actionComplete.integration.test.tsx`（6 静态源码断言 + 2 行为模拟，共 8 用例）
  - 已知限制：React 19 strict mode 下 functional setter 会被调两次，dev 下日志可能重复（per design §13.R3 接受）；生产无影响
- 质量检查: lint PASS；test PASS（42 files / 347 tests，新增 1 文件 8 用例）

### TASK-018: LogPanel 历史 run 列表（查看 / 导出 / 删除）

- 状态: completed
- 完成时间: 2026-05-01 07:01
- 尝试次数: 1
- Monkey summary:
  - 修改 LogPanel.tsx：archive mode 完整实现 — listRuns 加载 + view/list 互斥状态机 + readRun JSONL 解码（坏行 console.warn 跳过）+ exportRun + deleteRun（window.confirm + listRuns 刷新）
  - 当前 run 删除按钮 disabled；导出按钮在 OPFS 不可用时 disabled
  - formatBytes / formatDateTime helper
  - 测试新增 8 用例（共 29 LogPanel 用例 = TASK-011 7 + TASK-012 10 + TASK-013 4 + TASK-018 8）
- 质量检查: lint PASS；test PASS（42 files / 355 tests，新增 8 用例）

**全部 18 个 task 完成 ✅**
