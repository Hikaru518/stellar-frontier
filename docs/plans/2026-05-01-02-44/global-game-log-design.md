---
topic: global-game-log
date: 2026-05-01
status: approved
source:
  initial: docs/plans/2026-05-01-02-44/initial.md
  research: docs/plans/2026-05-01-02-44/research.md
  interview: docs/plans/2026-05-01-02-44/global-game-log-interview.md
---

## 1. 一句话总结

为开发者提供一份面向调试与产品分析的、按存档生命周期切分、自动 append 到 OPFS 的全局游戏日志：每次重置存档开新文件、运行期把玩家指令与事件全过程以 JSONL 形式增量写入，并在 DebugToolbox 内实时展示与按需导出。

## 2. 背景与问题（As-is）

- **当前做法**：项目只有两条相邻但不互通的"日志线"——`SystemLog[]` 仅在通讯台下方做临时滚动展示、关闭即丢；`event_logs: EventLog[]` 进存档但生成路径分散在 `effects.ts` 各处、没有统一追踪入口；玩家通讯选择 / 移动指令 / 待命停止等指令完全不入档。（`apps/pc-client/src/App.tsx:161-260`、`apps/pc-client/src/events/types.ts:738-751`）
- **痛点 / 成本**：开发者复现 bug 时无法回溯"玩家这局到底点了什么"；事件路径出问题时只能靠 `console.log` 临时插桩；产品想分析"玩家在某事件分支的选择分布"完全无数据。
- **为什么现在做**：事件系统 / 行动系统刚做过大重构（`d8d6620 重构地图对象与行动系统`、`95ee70d game system demock`），数据结构进入相对稳定期；同时事件编辑器（`dcf7c5f Feature/event editor`）让事件定义会频繁迭代，没有版本化的事件日志会越来越难排错。

## 3. 目标（Goals）

- 每次重置存档自动开启一个新的日志归档文件，生命周期与 run 严格对齐。
- 玩家指令（通讯选择 / 移动 / 调查 / 待命 / 停止）100% 入档。
- 事件 trigger / 节点跳转 / 结算结果 100% 入档。
- 写入完全增量（OPFS 文件 append-only），运行期不重写整份文件。
- DebugToolbox 内可实时查看当前 run 的日志流，并可按 `type` / `source` 过滤。
- 提供"导出当前 run .jsonl"与"历史 run 列表（查看 / 导出 / 删除）"两个面板能力。
- 日志条目从第一行起携带最小信封（含 `seq` / `log_version` / `game_version` / `run_id`），允许未来 schema 演进。
- OPFS 内最多滚动保留 10 份历史 run，超出后丢弃最旧一份。

## 4. 非目标（Non-goals）

- **不做面向玩家的"航行日志 / 叙事回顾" UI**。本日志是开发者面向，玩家可见的叙事层仍由现有 `SystemLog[]` 与 `event_logs` 的 UI 表现负责。
- **不做完整 deterministic replay**。当前不记录 `rngSeed` / 完整起始 snapshot / 系统低层事件（资源逐项变化、行动状态机跳转、effect 逐条应用），即只覆盖"玩家行为 + 事件级别走向"，不覆盖"逐 tick 状态"。
- **不引入用户可见的本地文件（FSA）方案**。即不做"在 Chrome 里选个路径常驻 append"——跨浏览器不一致 + 每次会话需重新授权，不在本期权衡内。
- **不做远程上报 / 后端聚合**。日志只在本地 OPFS，导出靠用户主动点按钮。
- **不做日志的搜索 / 时间窗回放 / 可视化时间线**。MVP 只做实时 tail + `type`/`source` 过滤。
- **不在生产构建里默认开启 DebugToolbox 面板**——日志写入照常，但展示面板与导出按钮只在 dev 模式或经过开关启用。

## 5. 目标用户与使用场景

### 5.1 用户画像（Personas）

- **P1：项目内开发者（主要）**：正在开发 / 调试 stellar-frontier 的工程师。动机：复现 bug、验证事件分支被正确触发、确认行动结算结果是否符合预期。痛点：当前没有任何持久化的"玩家做了什么 / 系统响应了什么"完整轨迹。
- **P2：策划 / 产品（次要）**：想看玩家在某事件的选择分布，或验证某条事件链的实际触达频率。动机：调数值、判断事件是否被卡死。痛点：现状没有结构化数据可分析。

### 5.2 典型场景（Top 3）

- **S1（事后排错）**：开发者收到反馈"某次重置后队员行动卡住了"。触发：开 DebugToolbox → 历史 run 列表 → 找到对应 run → 导出 `.jsonl` → 用文本工具/脚本排序 `seq` 并按 `type` 过滤。期望：能看到玩家最后一条指令、随后的事件 trigger / 节点跳转 / 结算结果，定位卡点。
- **S2（实时观察）**：开发者刚改完一段事件分支逻辑，跑一局新存档想确认分支被走到。触发：DebugToolbox 实时面板 → 按 `source=event_engine` + `type=event.node.enter` 过滤 → 看 tail。期望：每次玩家做选择，新的日志条目几百毫秒内出现在面板。
- **S3（横向对比）**：策划想知道某事件 A 在三局测试中触发了几次、走向哪些分支。触发：依次导出近 3 份 `run-*.jsonl` → 自写小脚本聚合 `type=event.resolved` 且 `payload.event_id=A` 的条目。期望：日志的 `event_id`、`result_key`、`run_id` 字段能稳定对齐。

## 6. 用户旅程（To-be）

1. 用户启动游戏（或重置存档）。
2. 系统调用 `resetGame()` → 内部分配新 `run_id`（如 `run-2026-05-01-0244-<rand>`）→ 在 OPFS 新建 `runs/<run_id>.jsonl` 并写入第一条 `system.run.start` 信封；同时若存档归档数超过 10 份，删除最老的一份归档。
3. 玩家在通讯台点选项 / 在地图选目标 / 给某队员下达"调查 / 待命 / 停止"指令 → `handleDecision()` 触发前增加日志中间件，写入 `player.<...>` 类型条目（如 `player.call.choice`）。
4. 事件引擎消费 trigger（`processAppEventTrigger()`） → 写入 `event.trigger` / `event.node.enter` 条目；事件结算后，新增的 `event_logs` 增量同步写入 `event.resolved` 条目。
5. 日志中间件批量缓冲，每 500 ms 或满 50 条 flush 到 OPFS；事件结算 / `resetGame` / 浏览器 `beforeunload` 强制 flush。
6. 开发者打开 DebugToolbox → 切到"日志面板"标签 → 看到 tail 模式的实时流；输入 `type` / `source` 过滤词 → 列表立即收窄。
7. 开发者点"导出当前 run .jsonl" → 浏览器触发 `runs/<run_id>.jsonl` 下载到本地。
8. 开发者点"历史 run 列表" → 看到滚动保留的至多 10 份归档（按时间戳倒序，标注每份的 `created_at_real_time`）→ 可对任一份点"查看（载入面板）/ 导出 / 删除"。
9. 用户再次重置存档 → 回到第 2 步，当前 run 文件就地变成历史归档之一（不重命名，因为文件名一开始就含 `run_id`）。

### 6.1 失败路径与边界

- **F1（OPFS 不可用 / 配额耗尽）**：写入失败时降级为内存缓冲 + 控制台告警；DebugToolbox 顶部显示一条红色横幅说明"日志未持久化，请检查浏览器存储配额"。游戏本身不应被日志故障阻塞。
- **F2（标签/浏览器猛关）**：批量 flush 间隔内（最多 ~500 ms 或 50 条）的尾部条目可能丢失；重启后下一次 reset / 启动时不做"恢复"，直接接受这部分丢失。
- **F3（日志 schema 升级）**：`log_version` 与游戏代码当前期望版本不一致时，DebugToolbox 用 tolerant 解析（缺失字段给默认、未知字段保留原样），并在条目旁标注 `legacy v<n>`；不做 in-place migration。
- **F4（导出时 OPFS 文件被同时写入）**：导出按钮点击瞬间先调用 `flush()` 然后再读 OPFS 文件，保证导出快照是闭合的；导出期间新到达的日志正常写入下一个 buffer 周期。
- **F5（同一 origin 多 tab 同时打开）**：用 `BroadcastChannel` 或 OPFS 锁保证同一时刻只有一个 tab 是 writer；后开的 tab 进入"只读 + 实时面板"模式，不主动写入；若必须双 tab 写入则属于 Later 范围。

## 7. 约束与假设

### 7.1 约束（Constraints）

- **C1：纯浏览器运行环境**。无 Tauri / Electron / Node 壳，所有持久化能力受浏览器 API 边界限制（OPFS / IndexedDB / localStorage）。
- **C2：localStorage 5 MB 上限**。当前存档已经走 localStorage，日志不能寄生其中——必须独立到 OPFS。
- **C3：现有事件 / 行动数据结构稳定但仍在演化**。日志条目的 `payload` 内层 schema 必须容忍这种演化（即采纳 tolerant deserialization + 显式版本号）。
- **C4：写入路径必须穿过两个已存在的中心点**。`handleDecision()`（玩家指令）与 `processAppEventTrigger()`（事件结算）是唯二的注入点，新代码不应绕过它们去监听 reducer / state 变化。
- **C5：日志写入失败不允许阻塞主循环**。任何 OPFS / async 异常必须被 catch + 降级，不能让游戏卡帧。

### 7.2 假设（Assumptions）

- **A1：OPFS 在目标浏览器（Chrome / Edge / Safari / Firefox 当前主流版本）均可用**。验证方式：项目支持矩阵确认 + 启动时做一次 `navigator.storage.getDirectory()` feature detect，失败则走内存降级。
- **A2：每局 run 的日志条目数量级在 100 ~ 数千之间**，不会冲击 OPFS 配额（即使保留 10 份滚动归档，单 origin 总占用预估 < 50 MB）。验证方式：MVP 上线后跑 5 局正常长度的测试，记录单文件实际大小并外推。
- **A3：`run_id` 由"reset 时间戳 + 短随机串"组成全局唯一**，不会与历史归档冲突。验证方式：写入前检查 OPFS 是否已存在同名文件（理论概率极低，作为兜底）。
- **A4：DebugToolbox 实时面板每秒刷新最多展示 ~200 条新日志**对前端帧率不构成压力。验证方式：MVP 完成后做一次"1 秒内刷 200 条"的压测，确认面板不卡顿。
- **A5：批量 flush 间隔 500 ms / 50 条是合理默认**。验证方式：开发期跑几局观察"事件结算 → 日志可见"延迟是否影响调试体验，不行再调。

## 8. 方案选择

### 选择的方案：在 Worker 中维护 OPFS 单 writer，主线程通过日志中间件挂接 `handleDecision()` 与 `processAppEventTrigger()`，批量推送到 Worker 写入

- **做法**：
  1. 启动一个专用 Web Worker（`logger.worker.ts`），它持有 OPFS 中 `runs/<run_id>.jsonl` 的 `FileSystemSyncAccessHandle`；提供 `append(entries)` / `flush()` / `rotate(newRunId)` / `listRuns()` / `readRun(runId)` / `deleteRun(runId)` 等消息接口。
  2. 主线程提供 `logger` 模块封装：
     - 自动填充信封字段（`seq` / `log_version` / `game_version` / `run_id` / `occurred_at_game_seconds` / `occurred_at_real_time` / `source`）。
     - 调用方只需 `logger.log({ type, source, payload })`。
     - 内部内存 buffer + 500 ms / 50 条触发推送给 Worker。
  3. 在 `App.tsx` 的 `handleDecision()` 入口加日志中间件：每次玩家指令进入时写一条 `player.*`。
  4. 在 `processAppEventTrigger()` 之前与之后做 `event_logs` 数组 diff，新增条目转写为 `event.resolved`；trigger 派发时写 `event.trigger` / `event.node.enter`（具体在事件引擎内部 hook，待 implementation 阶段细化）。
  5. `resetGame()` 在清 localStorage 之前先 `flush()` + 写一条 `system.run.end`，然后通知 Worker `rotate(newRunId)` 创建新文件并写 `system.run.start`，最后做归档轮转（保留 10 份）。
  6. DebugToolbox 新增"日志面板" tab：订阅主线程 logger 的内存 buffer 做实时 tail；导出 / 历史 run 列表通过 Worker 消息读取 OPFS。
- **优点**：
  - OPFS Sync Access Handle 在 Worker 里是同步 API，性能好且不阻塞主线程。
  - 单 writer + 批量推送规避了"多处并发写一个文件"的一致性问题。
  - 中间件挂在两个已存在的中心点，不入侵 reducer / 状态机，扩展面小。
  - 日志写入与游戏主循环完全解耦，写入失败可降级为内存模式不影响主流程。
- **缺点 / 风险**：
  - Web Worker 初始化、OPFS handle 获取、消息往返都是异步流程，启动期可能存在"前几条日志在 Worker 就绪前进入内存 buffer"的窗口（缓解：buffer 起手就有，等 Worker 就绪后一次性吐出）。
  - 多 tab 同 origin 同时打开时仍需要约束 writer 唯一性（用 `BroadcastChannel` + 启动时锁），否则会撞 OPFS 同文件并发。
  - schema 演进通过 `log_version` + tolerant 解析覆盖，但若某次大改打破语义连续性，仍要写一次性 importer——这是整个事件溯源圈的共识，无法完全消除。
- **选择理由**：受众=开发者、载体=OPFS、批量 flush、最小信封、跨浏览器需求一旦确立，这套架构是几乎唯一的工程合理形态。Worker + Sync Access Handle 是 web.dev 与 MDN 共同推荐的"前端高频 append 日志"标准做法。

### 选择与理由（Decision）

- **理由**：
  1. **唯一能在主流四浏览器都跑、零授权、且高性能的方案**。FSA 用户可见文件方案被 Q3 显式排除（仅 Chromium、需重授权）；IndexedDB 方案需要在导出时"按 record 拼成字符串再生成 Blob"，反而更绕、性能更差；纯内存方案与"持久化文件"的硬需求矛盾。
  2. **代价分摊到了已经稳定的中心点**。`handleDecision()` 和 `processAppEventTrigger()` 是项目里少数"必经之路"的中央 dispatcher，挂中间件成本最低。
  3. **schema 演进路径在第一天就预留**。最小信封 + `log_version` 让未来加字段、改 type 命名不会让历史 10 份归档作废。
- **曾经考虑过的方案**：
  - **方案 B：用户可见 .jsonl + FSA**——被 Q3 显式拒绝；问题是仅 Chromium、每次刷新需用户重授权、底层是 copy-swap 而非真正 append、Safari/Firefox 无法工作。
  - **方案 C：IndexedDB record 化存储 + 导出时拼 Blob**——可工作但写入路径要做"主线程 structured clone"性能较差，且导出时仍需把全部 record 拉出拼字符串，违背"append-only 文件"的字面期望。
  - **方案 D：仅内存 + 退出/导出时一次性下载**——最简单但浏览器/标签崩溃即丢全部，与"增量写入"的字面要求矛盾，且不能保留历史归档。
  - **方案 E：完整 deterministic replay 日志**（含 rngSeed、起始 snapshot、系统低层事件）——价值高但工程复杂度倍增、存储压力大，被 §4 显式列为非目标。

### 方案的比较

| 维度 | 选择方案：Worker + OPFS + 中间件 | B：FSA 用户文件 | C：IndexedDB record | D：仅内存 + 一次性下载 | E：完整 replay |
| --- | --- | --- | --- | --- | --- |
| 跨浏览器 | ✅ 四主流 | ❌ 仅 Chromium | ✅ | ✅ | ✅ |
| 用户授权 UX | ✅ 零授权 | ❌ 每次会话需授权 | ✅ | ✅ | ✅ |
| 真正 append | ✅ Sync Access Handle | ⚠️ copy-swap | ⚠️ 模拟 append | ❌ | 看实现 |
| 崩溃丢失范围 | flush 间隔内 ~500 ms | 整个未 close 的 writer 缓冲 | 单条 record | 全部 | 取决实现 |
| 历史归档 | ✅ 10 份滚动 | ⚠️ 用户自己管 | ✅ | ❌ | ✅ |
| 写入性能 | 高（同步 + Worker） | 低（每次 swap） | 中（结构化克隆） | 高 | 取决 |
| 与代码侵入度 | 低（两个中心点 + 中间件） | 中 | 中 | 低 | 高（要拦 reducer / RNG） |
| schema 演进 | 信封 + tolerant | 同 | 同 | 同 | 同 |
| 引入工程复杂度 | 中（Worker + 单 writer 协调） | 中 | 低 | 极低 | 高 |

## 9. 核心对象 / 数据

### 对象 1：`LogEntry`（日志条目）

- **来源 / 归属**：所有日志条目都由 `logger` 模块（主线程）创建，由 `logger.worker.ts`（Worker）以 JSONL 形式追加进 OPFS 文件。`logger` 模块是写入侧的唯一权威。
- **关键字段（信封部分，自动填充）**：
  - `seq: number` — 同一 run 内单调递增，从 1 开始。重启读 OPFS 末尾恢复（实施细节）。
  - `log_version: number` — 当前为 `1`。
  - `game_version: string` — 来自 `package.json` / build 注入。
  - `run_id: string` — 形如 `run-2026-05-01-0244-<rand>`。
  - `occurred_at_game_seconds: number` — 取自当前 `gameState.elapsedGameSeconds`。
  - `occurred_at_real_time: string` — ISO 8601 wall clock，仅供显示与排查。
  - `type: string` — 命名空间式字符串，详见下文 type 表。
  - `source: "player_command" | "event_engine" | "time_loop" | "system"` — 与 `TriggerContext.source` 对齐。
- **关键字段（业务部分）**：
  - `payload: object` — 因 type 而异；不强制 schema，但同一 type 的 payload 应保持稳定形状（变化通过 `log_version` 升档应对）。
- **生命周期**：创建即 immutable；写入后不修改；归档轮转（保留 10 份）时整体删除最老的 run 文件。

### 对象 2：`RunArchive`（run 归档元信息）

- **来源 / 归属**：Worker 读 OPFS `runs/` 目录得出。
- **关键字段**：`run_id`、`created_at_real_time`、`updated_at_real_time`、`size_bytes`、`entry_count`（可选，扫文件统计）。
- **生命周期**：随 run 创建；reset 时不变；超过 10 份时最老一份被删除。

### `type` 命名空间约定（MVP 范围）

| type | source | payload 关键字段 | 触发点 |
| --- | --- | --- | --- |
| `system.run.start` | `system` | `{ game_version, schema_version }` | `resetGame()` / 启动新 run |
| `system.run.end` | `system` | `{ reason: "reset" \| "unload" }` | reset 前 / `beforeunload` 前 |
| `player.call.choice` | `player_command` | `{ call_id, choice_key, crew_id }` | 玩家点通讯选项 |
| `player.move.target` | `player_command` | `{ crew_id, tile_id }` | 玩家在地图选目标 |
| `player.action.dispatch` | `player_command` | `{ crew_id, action_id, action_kind }` | 玩家下达"调查 / 待命 / 停止"指令 |
| `event.trigger` | `event_engine` | `{ trigger: TriggerContext }` | `processAppEventTrigger()` 入口 |
| `event.node.enter` | `event_engine` | `{ event_id, node_id }` | 事件引擎跳节点 |
| `event.resolved` | `event_engine` | `{ event_id, result_key, summary, importance }` | `event_logs` 新增 |
| `action.complete` | `time_loop` | `{ crew_id, action_id, status: "completed" \| "interrupted" \| "failed" }` | 行动状态机终态 |

新增 type 时不需要改 `log_version`；只在改既有 type 的 payload 形状时才升 `log_version`。

## 10. 范围与阶段拆分

### 10.1 MVP（本次必须做）

1. `logger` 主线程模块 + `logger.worker.ts`：信封自动填充、500 ms / 50 条批量 flush、OPFS 单 writer。
2. `runs/` 目录管理：reset 时创建新 `<run_id>.jsonl`、写 `system.run.start` / `system.run.end`、滚动保留 10 份。
3. 中间件接入：`handleDecision()` 写 `player.*`；`processAppEventTrigger()` 前后 diff `event_logs` 写 `event.*`；行动状态机终态写 `action.complete`。
4. DebugToolbox 新增"日志面板" tab：实时 tail 当前 run、按 `type` / `source` 过滤、"导出当前 run .jsonl" 按钮、"历史 run 列表"（查看 / 导出 / 删除）。
5. 失败降级：OPFS 不可用 → 内存 buffer + DebugToolbox 顶部红条提示。
6. 多 tab 单 writer 锁：用 `BroadcastChannel` 选举写入 tab，其余 tab 进只读模式。
7. `beforeunload` 强制 flush。

### 10.2 Later（未来可能做，但明确本轮不做）

- 玩家面向的"航行日志 / 叙事回顾" UI（用 `event_logs` + 本日志的 `event.resolved` 子集合成）。
- 完整 deterministic replay（rngSeed、起始 snapshot、系统低层事件）。
- 日志搜索 / 时间窗回放 / 可视化时间线。
- FSA 双写到用户可见文件（dev 模式中可选开关）。
- 远程上报 / 后端聚合 / 多 run 跨局聚合查询。
- 日志压缩（gzip）与导出时打包多 run。
- `git_commit` / `debug_session_id` 信封扩展字段。

## 11. User Stories（MVP）

### US-001：搭建 logger 主线程模块 + Worker 骨架

- **作为**：项目内开发者
- **我想要**：一个 `logger.log({ type, source, payload })` API，背后由 Worker 持有 OPFS Sync Access Handle，能把日志按 JSONL append 到 `runs/<run_id>.jsonl`
- **以便**：上层调用方完全不关心 OPFS / Worker 协议细节，只填业务字段
- **验收标准**：
  - [ ] 调用 `logger.log({ type: "system.run.start", source: "system", payload: { ... } })` 后，OPFS 中能找到 `runs/<run_id>.jsonl`，文件最后一行是该条目，包含完整 8 字段信封
  - [ ] 同一 run 内 `seq` 严格单调递增、从 1 开始
  - [ ] Worker 初始化前调用 `logger.log()` 不丢失（先入内存 buffer，Worker 就绪后一次性吐出）
  - [ ] OPFS 不可用时，logger 调用不抛异常、自动降级到内存 buffer，并在 console 给出一次告警
- **不包含**：DebugToolbox UI、多 tab 锁、reset 接入
- **优先级**：P0
- **依赖**：无

### US-002：reset 时创建新 run + 滚动归档

- **作为**：项目内开发者
- **我想要**：`resetGame()` 走完后，OPFS 里有了一份新 `runs/<run_id>.jsonl`、旧 run 自动归档保留至多 10 份
- **以便**：每局存档与一份独立日志严格对应；旧日志不会无限堆积
- **验收标准**：
  - [ ] reset 触发后，旧 run 收到一条 `system.run.end { reason: "reset" }` 并 flush
  - [ ] 新 run 文件出现，第一行是 `system.run.start`
  - [ ] OPFS `runs/` 内文件数量始终 ≤ 10；超出时按 `created_at_real_time` 删最老
  - [ ] 新 `run_id` 与历史归档不冲突（同名时附加随机后缀重试）
- **不包含**：UI 上展示归档列表
- **优先级**：P0
- **依赖**：US-001

### US-003：玩家指令接入 `handleDecision()`

- **作为**：项目内开发者
- **我想要**：玩家每次通讯选择 / 移动 / 调查 / 待命 / 停止，都自动写入对应的 `player.*` 日志
- **以便**：事后排错时能完整回放玩家做了什么
- **验收标准**：
  - [ ] 玩家在通讯台点一次选项 → OPFS 出现一条 `player.call.choice`，payload 含 `call_id` / `choice_key` / `crew_id`
  - [ ] 玩家在地图确认移动目标 → 出现一条 `player.move.target`
  - [ ] 玩家下达"调查 / 待命 / 停止" → 出现一条 `player.action.dispatch`，`payload.action_kind` 与实际指令一致
  - [ ] 上述写入不影响 `handleDecision()` 原有返回值与游戏行为
- **不包含**：事件侧日志（US-004）
- **优先级**：P0
- **依赖**：US-001

### US-004：事件引擎接入

- **作为**：项目内开发者
- **我想要**：每次 `processAppEventTrigger()` 派发与结算时，自动写入 `event.trigger` / `event.node.enter` / `event.resolved`
- **以便**：事件链路完全可追溯
- **验收标准**：
  - [ ] 任何 trigger 进入 `processAppEventTrigger()` → 一条 `event.trigger`，`payload.trigger` 是完整 `TriggerContext`
  - [ ] 事件引擎跳到新节点 → 一条 `event.node.enter`
  - [ ] `processAppEventTrigger()` 返回后，对比前后 `event_logs` 数组，新增条目转写为 `event.resolved`，`payload` 至少含 `event_id` / `result_key` / `summary` / `importance`
  - [ ] 同一帧内多条 `event.*` 的 `seq` 严格按发生顺序递增
- **不包含**：行动结算（US-005）
- **优先级**：P0
- **依赖**：US-001

### US-005：行动结算接入

- **作为**：项目内开发者
- **我想要**：行动状态机进入终态（`completed` / `interrupted` / `failed`）时自动写一条 `action.complete`
- **以便**：能看到玩家指令对应的行动最终走向
- **验收标准**：
  - [ ] 队员行动完成 → 一条 `action.complete { status: "completed" }`
  - [ ] 行动被中断 / 失败时 status 字段对应正确值
  - [ ] payload 含 `crew_id` / `action_id`
- **不包含**：行动中间状态变化
- **优先级**：P1
- **依赖**：US-001

### US-006：DebugToolbox 实时 tail + 过滤

- **作为**：项目内开发者
- **我想要**：DebugToolbox 新增"日志"标签，能 tail 模式滚动展示当前 run 最新 N 条日志，并支持按 `type` / `source` 过滤
- **以便**：开发期实时观察事件链路与玩家行为
- **验收标准**：
  - [ ] 打开标签后，最新 ~200 条日志按时间倒序（或正序自动滚动到底）展示
  - [ ] 输入 `type` 过滤词（支持前缀匹配，如 `event.`）→ 列表立即收窄
  - [ ] 选择 `source` 下拉（all / player_command / event_engine / time_loop / system）→ 列表立即收窄
  - [ ] OPFS 不可用时面板顶部出现红色横幅
  - [ ] 关闭面板再开回，过滤词保留（同一标签页内）
- **不包含**：搜索 payload 内容、时间窗筛选
- **优先级**：P0
- **依赖**：US-001

### US-007：导出当前 run

- **作为**：项目内开发者
- **我想要**：在日志面板点"导出当前 run .jsonl" → 浏览器下载完整文件
- **以便**：拿到原始数据用 VSCode / 脚本分析
- **验收标准**：
  - [ ] 点击按钮先触发 `flush()`，再读 OPFS 中 `runs/<current_run_id>.jsonl` 全部字节
  - [ ] 浏览器弹出下载，文件名为 `<run_id>.jsonl`，MIME `application/jsonl` 或 `application/x-ndjson`
  - [ ] 导出期间新到达的日志不影响快照内容；下次再点导出能拿到包含新条目的版本
- **不包含**：批量导出多 run
- **优先级**：P0
- **依赖**：US-001

### US-008：历史 run 列表（查看 / 导出 / 删除）

- **作为**：项目内开发者
- **我想要**：日志面板里能看到 OPFS 中所有归档 run 的列表，并能对任一份"载入面板查看 / 导出 / 删除"
- **以便**：事后排错时可查任意历史局
- **验收标准**：
  - [ ] 列表按 `created_at_real_time` 倒序展示，每行显示 `run_id` / 时间 / 大小 / 条目数
  - [ ] 点"查看" → 当前面板切换到该 run 的只读模式（不再 tail 当前 run），再次点切回当前
  - [ ] 点"导出" → 与 US-007 相同行为，文件名为对应 `<run_id>.jsonl`
  - [ ] 点"删除" → 二次确认后从 OPFS 移除该文件，列表实时刷新
  - [ ] 当前正在写入的 run 在列表中标记为"当前"，不能被删除
- **不包含**：跨 run 聚合查询
- **优先级**：P1
- **依赖**：US-002

### US-009：多 tab 单 writer 锁

- **作为**：项目内开发者
- **我想要**：同一 origin 在多个 tab 同时打开游戏时，仅一个 tab 是 writer，其余 tab 进只读模式
- **以便**：避免 OPFS 同文件并发写造成损坏
- **验收标准**：
  - [ ] 第二个 tab 打开后，DebugToolbox 顶部出现一条提示"当前 tab 为只读模式（writer 在另一标签）"
  - [ ] 只读 tab 的 logger 调用不写 OPFS（可写本地内存供面板观察）
  - [ ] writer tab 关闭后，剩余 tab 的某一个在 ~1s 内自动晋升为 writer 并继续写入；新 writer 不重写已有条目，从下一 `seq` 续写
- **不包含**：双 writer / 合并写入
- **优先级**：P1
- **依赖**：US-001

### US-010：`beforeunload` 强制 flush

- **作为**：项目内开发者
- **我想要**：浏览器标签关闭前 logger 主动 flush 残留 buffer
- **以便**：减少崩溃时尾部丢失
- **验收标准**：
  - [ ] 在 `beforeunload` 事件里同步触发 flush 路径
  - [ ] 写一条 `system.run.end { reason: "unload" }` 后再尝试 flush（best-effort，不保证 100% 成功）
- **不包含**：跨会话恢复
- **优先级**：P1
- **依赖**：US-001

## 12. 成功标准（如何判断做对了）

- [ ] 跑一局新存档，所有玩家指令（通讯选择 / 移动 / 调查 / 待命 / 停止）都能在导出的 `.jsonl` 里以 `player.*` 类型一一对应找到
- [ ] 同一局内 `seq` 严格单调递增、无跳号、无重复
- [ ] 触发任意一条事件分支，`event.trigger` → 至少一条 `event.node.enter` → `event.resolved` 在日志中按发生顺序连续出现
- [ ] 重置存档后，OPFS `runs/` 目录里出现新文件、旧文件保留为归档；连续重置 11 次，最老一份被自动删除，目录始终 ≤ 10 份
- [ ] DebugToolbox 日志面板能实时看到正在产生的日志，过滤 `type=event.` 后只剩事件类条目
- [ ] 点"导出当前 run" → 浏览器下载到的 `.jsonl` 用 `cat` / VSCode 打开是合法 JSONL，每行可被 `JSON.parse`
- [ ] 历史 run 列表可"查看 / 导出 / 删除"任一份，删除后列表立即更新
- [ ] 强制把浏览器 OPFS 配额降到 0（DevTools 模拟）后，游戏仍可玩，DebugToolbox 顶部出现红色降级横幅，logger 不抛异常
- [ ] 同一 origin 开两个 tab，仅一个 tab 写入 OPFS，关闭 writer tab 后另一 tab 自动接管

### 12.2 使用效果（Outcome）

- **Metric 1**：开发者复现一个事件相关 bug 的平均耗时从"无日志靠 console.log 临时插桩"显著下降——目标：3 次连续真实 bug 排查中，至少 2 次能仅通过导出 `.jsonl` 复现路径
- **Metric 2**：单 run 文件大小在常规 1 小时玩耍内不超过 5 MB（外推 10 份归档 < 50 MB）

## 13. 风险与缓解

- **R1：OPFS Sync Access Handle 在 Safari / Firefox 某些版本表现与 Chrome 不一致**
  - **缓解**：MVP 上线前在四主流浏览器各跑一次冒烟（reset → 写一些日志 → 导出 → 看文件）；不一致时优先靠 feature detect 降级到内存模式而不是阻塞功能
- **R2：日志写入路径意外阻塞主循环**
  - **缓解**：所有 logger API 在主线程都是 fire-and-forget（push 进 buffer 即返回）；catch 所有 async 异常；CI 加一条断言"logger.log 单次调用 < 1 ms"
- **R3：`event_logs` diff 漏写或重复写**
  - **缓解**：用 `event_log.id` 集合做差集判定，而不是数组长度；加单元测试覆盖"同一帧多条 event_log 新增"、"前后 event_logs 完全相同"两种边界
- **R4：OPFS 文件被并发损坏**
  - **缓解**：BroadcastChannel 选举单 writer（US-009）；写完整 JSON 行后再写 `\n`，崩溃时损坏的尾部行可由读侧 tolerant 解析跳过
- **R5：`log_version` 升级后老归档不可读**
  - **缓解**：DebugToolbox 读侧用 tolerant 解析 + upcaster；归档面板对低版本条目显式标注 `legacy v<n>`，不做 in-place migration
- **R6：日志条目数膨胀冲击 OPFS 配额**
  - **缓解**：MVP 上线后跑 5 局测试外推；若单 run 超过 5 MB，优先排查是否记录了不该记录的 `payload`；保底方案是把"完整 `TriggerContext`"压缩成 trigger summary
- **R7：DebugToolbox 实时面板高频刷新卡顿**
  - **缓解**：UI 侧用虚拟列表（仅渲染可视区） + 节流（最多 10 fps 重绘）；A4 假设需在 MVP 完成后压测验证

## 14. 未决问题（Open Questions）

- **OQ-1**：`game_version` 来源——目前没有正式 release 编号，是用 `package.json` version 还是 `git_commit hash`？implementation 阶段决定
- **OQ-2**：`event.node.enter` 的 hook 点是否要进事件引擎 `graphRunner` 内部？还是只在 `processAppEventTrigger()` 入口拿到的 trigger 里反推？涉及事件引擎的私有 API，需 implementation 阶段进一步看代码定
- **OQ-3**：行动状态机终态写 `action.complete` 的具体 hook 点（行动是在 `settleGameTime` 内被推进还是有独立 reducer），需在 implementation 阶段定
- **OQ-4**：BroadcastChannel writer 选举的具体协议（先到先得 + heartbeat 续约 vs. 基于 visibility 的让位），MVP 用最简的"先到先得 + heartbeat"，复杂场景留给 Later
- **OQ-5**：是否在 `system.run.start` 里附带一份 `gameState` 起始 snapshot？现状不附（与 §4 非目标 E 一致），但 implementation 时若发现"没起始 snapshot 排错很难"可重议

