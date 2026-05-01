---
topic: global-game-log
date: 2026-05-01
research_scope:
  codebase: true
  internet: true
source:
  initial: docs/plans/2026-05-01-02-44/initial.md
  research_topics: docs/plans/2026-05-01-02-44/research-topics.md
---

## 1. Research Summary（研究摘要）

本次研究围绕 stellar-frontier "全局游戏日志"功能展开：每次重置存档后开启新文件，把玩家操作（如给队友通话）、事件发生 / 走向 / 结果以 append-only 方式持续写入。

**项目侧关键事实**：项目是**纯浏览器 + React + Vite** 应用，无 Tauri/Electron 壳；当前所有持久化都走 `localStorage`（key `stellar-frontier-save-v2`），整个 `GameState` 每帧 JSON 序列化覆盖写入。事件系统已经相当成熟：`event_logs: EventLog[]` 已经是长期存档字段、有 `summary / importance / visibility / result_key / history_keys` 等结构化语义；统一的"玩家指令派发"集中在 `handleDecision()`，事件触发与结算集中在 `processAppEventTrigger()`——这两个点是天然的日志切入面。

**互联网侧关键事实**：在浏览器里"用户可见文件"与"零授权、高性能 append"是互斥的。`showSaveFilePicker` + `createWritable({keepExistingData:true})` 仅 Chromium 支持，且每次会话都要重新授权，底层是 copy-swap 而不是真正 append。OPFS 跨三大引擎、性能好但用户看不到；IndexedDB 适合做热区，但导出要走 Blob 下载。格式上 JSONL/NDJSON 是事实标准，配合 CloudEvents 风格 envelope（`id/type/time/specversion`）+ replay 工程要求（`seq / schemaVersion / gameVersion`）可让日志同时具备"易追加、易诊断、易演进"。

**对 design 的影响**：本项目 = 纯浏览器 + 没有现成的"打开一个真文件不断 append"的能力，所以**设计核心是先确定"日志的载体"**——用户可见文件（FSA，限 Chromium，需授权）、隐形持久化（OPFS / IndexedDB + 按需导出）、还是仅在内存 + 一次性下载（最 MVP）。其次决定颗粒度：复用现有 `EventLog`，还是建立更底层的"输入级 / 系统级"事件流；这决定了能不能做 replay，以及日志条目数量级。

## 2. Project Findings（项目内发现）

### 2.1 Existing Patterns（现有模式）

- **事件日志结构已就位**：`EventLog { id, event_id, occurred_at, summary, crew_ids, tile_ids, result_key, importance: minor|normal|major|critical, visibility: player_visible|hidden_until_resolved, history_keys[] }`（证据：`apps/pc-client/src/events/types.ts:738-751`）。
- **统一指令派发点**：玩家通话选择、移动目标确认、调查触发、待命/停止全部进入 `handleDecision()`（证据：`apps/pc-client/src/App.tsx:161-260`）；新日志中间件挂这一层即可一网打尽玩家侧动作。
- **统一事件结算点**：`processAppEventTrigger()` 消费 `TriggerContext` 并返回新 `GameState`，`mergeEventRuntimeState()` 合并事件运行态（证据：`apps/pc-client/src/App.tsx:964-1003, 1176-1188`）；可在此后 diff 出新增 `event_logs` 增量。
- **自动存档循环**：每帧 `saveGameState(gameState)` 整体覆盖到 localStorage（证据：`apps/pc-client/src/App.tsx:90-92`、`apps/pc-client/src/timeSystem.ts:35-63`）。
- **行动语义已细化**：行动有 `source: player_command | event_action_request`、状态 `active|interrupted|completed|failed`（证据：`apps/pc-client/src/App.tsx:620-656`），可作为日志条目的天然字段。
- **TriggerContext 标准信封**：`trigger_type / occurred_at / source / crew_id / tile_id / action_id / payload`（证据：`apps/pc-client/src/events/types.ts:28-50`）——这本身就是一个现成的 envelope 候选。

### 2.2 Domain Knowledge（领域知识）

- **核心原则**："通讯是指令通道；事件是世界反馈；界面是控制台；内容与规则分离"（来源：`docs/core-ideas.md:20-31`）——日志应同时呈现"指令侧"与"反馈侧"两条线。
- **典型情境分类**：高光时刻 / 压力时刻 / 调度时刻 / 长期后果时刻；`event_log` 的设计目标就是记录"事件发生与后果"（来源：`docs/gameplay/event-system/event-system.md:62-68`）。
- **存档持久化范围已明确**：存档保留活跃事件/通话、目标、event_log、world_history、world_flags；**完整 call/debug 细节不长期保存**（来源：`docs/gameplay/event-system/event-system.md:59-60`）——意味着"细粒度通话原文 / 调试日志"是新功能要新建立的层。
- **时间制约**：游戏时间只有运行时推进，关闭后停止，再进入从 `elapsedGameSeconds` 继续（来源：`docs/gameplay/time-system/time-system.md:43-49`）；日志中的"游戏内时间"是 `GameSeconds`，不是 wall clock。

### 2.3 Recent Changes（最近变更）

- `d8d6620 feat: 重构地图对象与行动系统` — 引入 `MapObjectDefinition`、`set_object_status` effect、条件驱动行动；行动从挂在 tile 改为挂在对象。日志的"动作 / 结果"语义需要兼容这套模型。
- `95ee70d feat: game system demock` — 系统去 mock 化，可能影响数据结构稳定性；意味着日志 schema 自第一天起就需要版本化。
- `dcf7c5f Feature/event editor` — 引入事件编辑器，事件定义可能频繁迭代——更需要 `event_definition_id` 在日志里被显式保留。
- `ff1e4c9 fix: pin local dev server ports` — 与日志无关，但说明项目仍处于打基建阶段。

### 2.4 Technical Constraints（技术约束）

- **运行环境**：纯浏览器（Chrome / 移动 Web），React 19 + Vite，无 Node/Tauri/Electron 壳——**默认不能直接打开本地文件做 append**。
- **现存档介质**：localStorage（key `stellar-frontier-save-v2`），整体 JSON 覆盖式写入。这意味着今天的"存档大小上限"= localStorage 配额（一般 5 MB / origin），日志若同一存档共用 localStorage 会撞上限。
- **没有日志库**：无 winston/pino 之类依赖；项目自管理日志数组（`SystemLog[]` 仅 UI 临时显示，关闭即丢；`event_logs[]` 入存档但无统一追踪入口）。
- **schema 演进意识已存在**：存档头部就有 `schema_version`、`event-program-model-v1` 这类字段，说明团队已习惯版本化 schema。

## 3. Best Practice Findings（最佳实践发现）

### 3.1 Common Approaches（常见做法）

- **Approach A：File System Access API + 用户授权文件**：`showSaveFilePicker()` 拿 handle，`createWritable({keepExistingData:true})` + `seek(file.size)` 后 `write` 实现追加。仅 Chromium 支持（参考：<https://caniuse.com/native-filesystem-api>），且**每次会话刷新都要 `requestPermission` 重新授权**（即使把 handle 存进 IndexedDB），底层是 copy-swap 不是真正 append（参考：<https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable>）。
- **Approach B：OPFS（Origin Private File System）+ Sync Access Handle**：2023 年起三大引擎 Baseline，无授权弹窗，Worker 内 `createSyncAccessHandle()` 提供同步 read/write/truncate/flush，性能远超 FSA；但**用户看不见这份文件**（参考：<https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system>）。
- **Approach C：IndexedDB 按 record 存事件 + 周期导出**：每条事件一行，按 `seq` 索引；满 N 条或定期切段，导出时用 Dexie-export-import 等流式工具（参考：<https://web.dev/articles/indexeddb-best-practices>）。
- **Approach D：Tauri/Electron 真原生 append**：Tauri `@tauri-apps/plugin-fs` 的 `open(path, { append: true })` 或 `tauri-plugin-log` 自带 `max_file_size + rotation_strategy`（参考：<https://v2.tauri.app/plugin/logging/>）；本项目目前没有这层壳，引入即"换运行平台"。

### 3.2 Official Recommendations（官方建议）

- **Event Sourcing 设计**：事件应记录**业务意图**（"reserved 2 seats"）而非结果状态（"seats=42"），否则退化为无业务含义的 change log（来源：<https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing>）。
- **JSON Lines / NDJSON 格式约束**：UTF-8 无 BOM，每行一个合法 JSON，`\n` 结尾；扩展名 `.jsonl` / `.ndjson`，遇坏行 MUST 报错（来源：<https://jsonlines.org/>、<https://github.com/ndjson/ndjson-spec>）。
- **CloudEvents envelope**：`specversion / id / source / type / time / subject` 是公认的事件信封字段（来源：<https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md>）。
- **Snapshot is an optimization, not a replacement**：Fowler / Azure 都强调快照只是加速，事件流本身才是 source of truth（来源：<https://martinfowler.com/eaaDev/EventSourcing.html>）。
- **Deterministic replay 必备字段**：`schemaVersion / gameVersion / rngSeed / startSnapshot / tick`（来源：<https://gafferongames.com/post/deterministic_lockstep/>）。

### 3.3 Known Pitfalls（已知陷阱）

- **FSA 跨会话不持久**：把 handle 存进 IndexedDB 可恢复对象，但 `requestPermission({ mode: 'readwrite' })` 仍要再次用户手势触发——不能"安静地"恢复 append（参考：<https://developer.chrome.com/docs/capabilities/web-apis/file-system-access>）。
- **FSA 多 tab 双写**：默认 `siloed` mode 下两个 tab 同时打开会互相覆盖，必须 `mode: "exclusive"` 或在应用层强制单 writer。
- **Schema 演进必须考虑**：避免 in-place migration；用 *tolerant deserialization*（忽略未知字段、缺失给默认）+ 显式 `eventVersion` + **upcaster**（读时把旧 schema 升级）（参考：<https://event-driven.io/en/how_to_do_event_versioning/>）。
- **时钟漂移**：`Date.now()` 受系统调时间影响；replay/排序应同时记录**单调 `seq`** + wall clock，仅把 wall clock 当显示用。
- **崩溃尾部丢失**：FSA 的 swap-write 模式在 close 之前进程崩溃，整段未 close 的 writer 缓冲会**全部丢失**，不只是尾部一行；JSONL + 频繁 flush 才能限定丢失范围。
- **性能瓶颈**：每条 event 都 close 一次 writer 会触发 swap-replace，应**批量 flush**（每 N 条或每 100 ms 一次）。

### 3.4 SOTA / Emerging Practices（前沿实践）

- **OPFS + Sync Access Handle 在 Worker 中**已经成为浏览器侧高频写日志的事实首选（SQLite WASM 也用它）。
- **CloudEvents** 在跨语言 / 跨服务事件 envelope 上事实标准化，前端单机场景借用它的字段命名仍能拿到"将来好导出 / 好接消费侧"的红利。

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：日志载体 — 用户可见文件（FSA） vs 隐形持久化（OPFS / IndexedDB）+ 按需导出

- **FSA 的优势**：用户能看到一份"真实的 .jsonl 文件"，符合用户原始需求"日志会在每次重置存档后存到一个新的文件"的字面语义；可被外部工具（编辑器、analytics）直接消费。
- **OPFS / IndexedDB 的优势**：跨浏览器一致；无授权 UX 摩擦；性能好；不会因为用户没点"另存为"就把日志丢了；适合作为"运行期热写入层"。
- **建议**：如果"用户能直接打开 .jsonl"是硬需求 → FSA（接受仅 Chromium + 每次启动需重授权）。如果只是"能在游戏内查看 / 偶尔导出"→ OPFS（或 IndexedDB）+ 显式"导出存档日志"按钮做 Blob 下载，这是工程上更稳健且跨浏览器的选项。

### Trade-off 2：日志颗粒度 — 复用 `EventLog`（玩家可读叙事级） vs 引入更底层的事件流（系统级 / 输入级）

- **复用 `EventLog` 的优势**：现成结构（`importance / visibility / summary / result_key / history_keys`），玩家可读，体量小，已经入存档；最小改动就能落地。
- **底层事件流的优势**：可做完整 replay / 调试 / AI 复读；对玩家行为做事后分析；与 Event Sourcing 的"事件即真相"理念一致。但条目数量级会从"每局 几十–几百"涨到"每局 几千–几万"，对存储压力倍增。
- **建议**：MVP 强烈倾向"以 `EventLog` 为基底 + 玩家指令进入同一条流（统一 envelope）"，先解决"看得到、记得住"。底层 replay 级日志放 Later，避免一开始就为不存在的需求付存储与复杂度成本。

### Trade-off 3：日志格式与版本化 — 即时落地的最小 JSON vs 一开始就上 envelope（CloudEvents 风格 + seq + version）

- **最小 JSON 的优势**：写起来最快，schema 即"我现在需要的字段"。
- **Envelope + seq + version 的优势**：未来加字段、做 replay、做 importer 都不用回头重写；事件溯源圈共识"schema 演进无法事后补救"。
- **建议**：从第一行日志起就引入最小信封 — `{ seq, log_version, game_version, occurred_at_game_seconds, occurred_at_real_time, type, source, payload }`。代价小（5–6 个字段），收益大（未来不被 schema 卡死）。

## 5. Key References（关键参考）

### 5.1 Project Files

- `apps/pc-client/src/App.tsx:120-128` — `resetGame()` 入口，新存档创建点。
- `apps/pc-client/src/App.tsx:161-260` — `handleDecision()`，统一玩家指令派发中心。
- `apps/pc-client/src/App.tsx:460-520` — `GameState` 存档结构定义（含 `event_logs / world_history / world_flags`）。
- `apps/pc-client/src/App.tsx:964-1003` — `processAppEventTrigger()`，事件结算入口。
- `apps/pc-client/src/App.tsx:90-92` — 自动存档 `useEffect`，每帧覆盖写 localStorage。
- `apps/pc-client/src/timeSystem.ts:35-63` — `loadGameSave / saveGameState`。
- `apps/pc-client/src/events/types.ts:28-50` — `TriggerContext` 类型。
- `apps/pc-client/src/events/types.ts:738-751` — `EventLog` 类型。
- `docs/core-ideas.md:20-31` — 项目核心原则。
- `docs/gameplay/event-system/event-system.md:33-68` — 事件系统术语 / 典型情境 / 持久化范围。
- `docs/gameplay/time-system/time-system.md:43-49` — 时间制约。

### 5.2 External Links

- <https://developer.mozilla.org/en-US/docs/Web/API/Window/showSaveFilePicker> — FSA 入口。
- <https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createWritable> — `keepExistingData` / 多 tab 行为。
- <https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system> — OPFS。
- <https://caniuse.com/native-filesystem-api> — FSA 浏览器支持。
- <https://developer.chrome.com/docs/capabilities/web-apis/file-system-access> — Chrome 端 UX 细节。
- <https://web.dev/articles/indexeddb-best-practices> — IndexedDB 最佳实践。
- <https://v2.tauri.app/plugin/file-system/> / <https://v2.tauri.app/plugin/logging/> — Tauri 文件系统 / 日志插件（备选壳方案）。
- <https://martinfowler.com/eaaDev/EventSourcing.html> — Event Sourcing 经典定义。
- <https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing> — Event Sourcing 工程模式。
- <https://jsonlines.org/> / <https://github.com/ndjson/ndjson-spec> — JSONL/NDJSON 规范。
- <https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md> — CloudEvents envelope。
- <https://gafferongames.com/post/deterministic_lockstep/> — Replay / 确定性日志工程模式。
- <https://event-driven.io/en/how_to_do_event_versioning/> — 事件 schema 演进与 upcasting。

## 6. Open Questions for Design

- **Q1（载体）**：用户希望"打开一个真文件就能看到日志"，还是接受"游戏内查看 + 一键导出"？这直接决定 FSA 还是 OPFS/IndexedDB。
- **Q2（受众）**：日志是给玩家看的（叙事 / 回顾）、给开发调试用、还是给未来 LLM/AI 复读？三者颗粒度差异很大。
- **Q3（颗粒度）**：MVP 是否仅以 `EventLog` 为基底 + 把玩家指令补一类条目进同一流？还是要一开始就把"动作完成 / 行动状态变化 / 系统结算"全打入？
- **Q4（生命周期细节）**：reset save 后旧日志是 (a) 改名归档保留、(b) 丢弃、(c) 让用户选？是否提供 "查看历史存档日志" 的 UI？
- **Q5（存储位置与上限）**：localStorage 5 MB 容量很容易撑爆；是否同意把日志分离到 IndexedDB / OPFS，与 `stellar-frontier-save-v2` 解耦？
- **Q6（schema 演进）**：是否一开始就引入 `log_version` + `game_version` + `seq`？还是 MVP 只记最小字段、出问题再迁移？
- **Q7（写入节奏）**：每条事件即时写、每秒批量 flush、还是只在 reset/退出/导出时持久化？

---

**Research Completed:** 2026-05-01 02:50
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
