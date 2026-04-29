---
plan: "game-system-demock"
started: "2026-04-29 16:35"
status: "completed"
branch: "feature/game-system-demock"
source:
  implementation_plan: "docs/plans/2026-04-29-15-29/game-system-demock-implementation-plan.md"
  tasks_json: "docs/plans/2026-04-29-15-29/game-system-demock-tasks.json"
---

# Progress: game-system-demock

## 任务状态

| # | Task ID | 标题 | 状态 | 尝试次数 |
|---|---------|------|------|---------|
| 1 | T001 | 固化去 mock 与去 legacy 审计清单 | completed | 1 |
| 2 | T002 | 三人化 crew content、schema 与类型 | completed | 1 |
| 3 | T003 | 删除旧角色相关结构化事件资产 | completed | 1 |
| 4 | T004 | 三人化地图、初始状态与测试 fixture | completed | 1 |
| 5 | T005 | 删除 legacy event 内容入口 | completed | 1 |
| 6 | T006 | 删除 editor legacy event 展示 | completed | 1 |
| 7 | T007 | 建立 crew_actions 派生视图模型 | completed | 1 |
| 8 | T008 | 强化阻塞与单主行动约束 | completed | 1 |
| 9 | T009 | 迁移时间推进到 crew_actions | completed | 1 |
| 10 | T010 | 迁移移动行动到 crew_actions | completed | 1 |
| 11 | T011 | 迁移停止与待命行动到事件 runtime | completed | 1 |
| 12 | T012 | 迁移调查当前区域到地点事件入口 | completed | 1 |
| 13 | T013 | 重构基础行动 content 与 schema | completed | 1 |
| 14 | T014 | 删除 legacy dispatch 与旧行动入口 | completed | 1 |
| 15 | T015 | 建立地点剧情动作事件样例 | completed | 1 |
| 16 | T016 | 删除地图 legacy content 字段与 schema | completed | 1 |
| 17 | T017 | 删除 deriveLegacyTiles 与旧 MapTile 投影 | completed | 1 |
| 18 | T018 | 清理 PC UI mock 文案 | completed | 1 |
| 19 | T019 | 清理 mobile UI mock 文案 | completed | 1 |
| 20 | T020 | 更新正式项目文档 | completed | 1 |
| 21 | T021 | 全仓关键词审计与生成产物同步 | completed | 1 |
| 22 | T022 | 集成验证与收口 | completed | 1 |

状态值：`pending` | `in_progress` | `completed` | `failed`

## 执行策略

- 按 `depends_on` 判断可执行批次。
- 仅在依赖满足且预计文件范围相对分离时并行派发 Monkey。
- 每个 task 通过质量检查后由 MonkeyKing 提交。
- 若并行结果发生冲突，MonkeyKing 按本轮 design / technical design 修复整合问题。

## 执行日志

<!-- 每个任务完成（或失败）后，在此追加一条记录 -->

### T001: 固化去 mock 与去 legacy 审计清单
- 状态: completed
- 开始时间: 2026-04-29 16:36
- 完成时间: 2026-04-29 16:42
- 尝试次数: 1
- Monkey summary: 在 `game-system-demock-implementation-plan.md` 中新增按 content、runtime/UI、mobile、editor、dual-device、scripts、generated、tests、docs 分类的审计清单，明确关键词范围、历史材料例外和后续删除规则。未运行 npm 命令，因为本任务只修改 Markdown 计划文档。

### T002: 三人化 crew content、schema 与类型
- 状态: completed
- 开始时间: 2026-04-29 16:43
- 完成时间: 2026-04-29 16:56
- 尝试次数: 1
- Monkey summary: 删除 Lin Xia / Kael crew content，删除 crew `summary` 字段、schema、类型和 UI 读取路径；将 `CrewId` 收窄为 Mike、Amy、Garry，并更新相关 PC 测试。验证：`npm run validate:content` 通过；PC client lint/test 通过；root `npm run lint` 和 `npm run test` 失败在 editor 既有 `@xyflow/react` / `@dagrejs/dagre` 缺依赖，不属于本任务改动范围。

### T003: 删除旧角色相关结构化事件资产
- 状态: completed
- 开始时间: 2026-04-29 16:57
- 完成时间: 2026-04-29 17:00
- 尝试次数: 1
- Monkey summary: 删除 `crew_kael` definitions / call templates 与 manifest domain，清理 desert、mainline_medical、mountain 中的 Lin Xia / Kael 结构化事件引用，重新生成 event manifest，并新增 retired crew content validator。验证：`npm run validate:content` 通过；PC client lint/test 通过；新增 retired crew validator 测试通过。root `npm run lint` / `npm run test` 仍失败在 editor 既有 `@xyflow/react` / `@dagrejs/dagre` 缺依赖；完整 `scripts/validate-content.test.mjs` 仍有两个既有 map candidate action 断言失败。

### T004: 三人化地图、初始状态与测试 fixture
- 状态: completed
- 开始时间: 2026-04-29 17:01
- 完成时间: 2026-04-29 17:07
- 尝试次数: 1
- Monkey summary: 清理 PC unit/e2e fixture 中 Lin Xia / Kael 的正向引用，改为三人 crew id，并在初始 runtime 测试中增加三人 crew id 与地图占位断言。验证：`npm run validate:content` 通过；`npm --prefix apps/pc-client run lint` 通过；`npm --prefix apps/pc-client run test` 通过。e2e 因本机 Playwright Chromium 缓存缺失未进入业务断言。

### T005: 删除 legacy event 内容入口
- 状态: completed
- 开始时间: 2026-04-29 17:01
- 完成时间: 2026-04-29 17:10
- 尝试次数: 1
- Monkey summary: 删除 `content/events/events.json` 与 `content/schemas/events.schema.json`，移除 runtime/content validation/editor helper 对 legacy event asset 的加载路径，并更新 README 与相关测试说明，使结构化事件成为唯一事件内容入口。验证：`npm run validate:content` 通过；`npm --prefix apps/pc-client run lint` 通过；`npm --prefix apps/pc-client run test` 通过；legacy 删除相关目标测试通过。root lint/test 仍因 editor 既有 `@xyflow/react` / `@dagrejs/dagre` 缺依赖失败。

### T006: 删除 editor legacy event 展示
- 状态: completed
- 开始时间: 2026-04-29 17:12
- 完成时间: 2026-04-29 17:15
- 尝试次数: 1
- Monkey summary: 删除 editor `legacy_event` asset type 与 UI 渲染路径，并让 editor library/browser 支持结构化 presets、handlers、schemas。验证：`npm --prefix apps/editor run test -- src/event-editor/EventBrowser.test.tsx helper/contentStore.test.mjs` 通过；完整 editor lint/test 仍因既有 graph 依赖 `@xyflow/react` / `@dagrejs/dagre` 缺失受阻。

### T007: 建立 crew_actions 派生视图模型
- 状态: completed
- 开始时间: 2026-04-29 17:12
- 完成时间: 2026-04-29 17:17
- 尝试次数: 1
- Monkey summary: 新增 `crew_actions` 派生 view model，覆盖 idle、moving、waiting call、blocked action 等状态，并让 PC 页面读取派生行动标题、进度、通讯可用性和阻塞原因。验证：`npm --prefix apps/pc-client run lint` 通过；`npm --prefix apps/pc-client run test` 通过。

### T008: 强化阻塞与单主行动约束
- 状态: completed
- 开始时间: 2026-04-29 17:18
- 完成时间: 2026-04-29 17:19
- 尝试次数: 1
- Monkey summary: 为 `create_crew_action` 添加 active `current_action_id` / active `crew_actions` 占用检查，event candidate blocking slot 判断纳入当前主行动占用，并补充 blocking event/call 冲突与非阻塞背景候选测试。验证：`npm --prefix apps/pc-client run lint` 通过；`npm --prefix apps/pc-client run test` 通过。

### T009: 迁移时间推进到 crew_actions
- 状态: completed
- 开始时间: 2026-04-29 17:21
- 完成时间: 2026-04-29 17:32
- 尝试次数: 1
- Monkey summary: 将 `settleGameTime` 的到期行动结算切到 active `crew_actions`，完成后标记 action completed、清理旧 activeAction 显示并发出 `action_complete` trigger；objective completion 测试改为基于 `crew_actions`。调度层修复了 `event_waiting` action completion 保留 unavailable 的集成问题。验证：`npm --prefix apps/pc-client run test -- App.test.tsx` 通过；`npm --prefix apps/pc-client run lint` 通过；`npm --prefix apps/pc-client run test` 通过。

### T010: 迁移移动行动到 crew_actions
- 状态: completed
- 开始时间: 2026-04-29 17:33
- 完成时间: 2026-04-29 17:42
- 尝试次数: 1
- Monkey summary: 移动确认创建 `CrewActionState` 并写入 `crew_actions`，移动路径、step timing 与 route index 存入 action params；时间推进通过 active `crew_actions` 推进移动、更新 crew tile / map discovery，抵达后完成 action 并发出 `arrival` trigger。验证：`npm --prefix apps/pc-client run lint` 通过；`npm --prefix apps/pc-client run test` 通过。

### T011: 迁移停止与待命行动到事件 runtime
- 状态: completed
- 开始时间: 2026-04-29 17:33
- 完成时间: 2026-04-29 17:42
- 尝试次数: 1
- Monkey summary: 停止/待命迁移到 `crew_actions` runtime；stop 中断原 active action 并创建默认 10 秒 stop action，standby 创建并完成 standby action 并触发 `idle_time`，`cancel_crew_action` 会释放 crew runtime 指针。验证：合并态 `npm run validate:content`、`npm --prefix apps/pc-client run lint`、`npm --prefix apps/pc-client run test` 通过。

### T012: 迁移调查当前区域到地点事件入口
- 状态: completed
- 开始时间: 2026-04-29 17:33
- 完成时间: 2026-04-29 17:42
- 尝试次数: 1
- Monkey summary: “调查当前区域”从 `legacy.survey` 迁移到结构化地点事件入口，按当前地块可见 map objects 尝试事件候选；无可触发调查事件时显示中性空状态，不生成旧通用调查结果。验证：合并态 `npm run validate:content`、`npm --prefix apps/pc-client run lint`、`npm --prefix apps/pc-client run test` 通过。

### T013: 重构基础行动 content 与 schema
- 状态: completed
- 开始时间: 2026-04-29 17:43
- 完成时间: 2026-04-29 17:47
- 尝试次数: 1
- Monkey summary: `universal-actions` 收紧为四类基础行动，`move/standby/stop` 的 `event_id` 改为 `crew_actions.*`，schema 限定 action id/category 并拒绝 `legacy.*`；通话页过滤旧通用对象动作 `gather/build/extract/scan`。验证：`npm run validate:content` 通过；`npm --prefix apps/pc-client run lint` 通过；`npm --prefix apps/pc-client run test` 通过。

### T014: 删除 legacy dispatch 与旧行动入口
- 状态: completed
- 开始时间: 2026-04-29 17:48
- 完成时间: 2026-04-29 17:56
- 尝试次数: 1
- Monkey summary: 删除 `App.handleDecision` 中 legacy translator 与 `applyImmediateOrCreateAction` 入口，`settleAction` 改为只接受 `CrewActionState`，过滤退休 object actions，并将 map-object 中 `legacy.*` event id 改为 `retired.map_object_*` 占位。验证：`npm run validate:content` 通过；`npm --prefix apps/pc-client run lint` 通过；`npm --prefix apps/pc-client run test` 通过。

### T015: 建立地点剧情动作事件样例
- 状态: completed
- 开始时间: 2026-04-29 17:57
- 完成时间: 2026-04-29 18:02
- 尝试次数: 1
- Monkey summary: 新增医疗文档地点剧情动作 `mainline-medical-docs:learn`，普通通话可触发结构化事件 runtime，真实接通并选择事件选项后结算 `knows_field_first_aid` 与事件日志；样例不依赖 gather/build/trade 通用按钮。验证：合并态 `npm run validate:content`、`npm --prefix apps/pc-client run lint`、`npm --prefix apps/pc-client run test` 通过。

### T016: 删除地图 legacy content 字段与 schema
- 状态: completed
- 开始时间: 2026-04-29 17:57
- 完成时间: 2026-04-29 18:02
- 尝试次数: 1
- Monkey summary: 删除 map content/schema/type 中的 `legacyResource`、`legacyBuilding`、`legacyInstrument`、`legacyDanger` 字段，清理 PC 端旧读取逻辑，`deriveLegacyTiles` 不再从对象派生旧展示列表。验证：合并态 `npm run validate:content`、`npm --prefix apps/pc-client run lint`、`npm --prefix apps/pc-client run test` 通过。

### T017: 删除 deriveLegacyTiles 与旧 MapTile 投影
- 状态: completed
- 开始时间: 2026-04-29 18:03
- 完成时间: 2026-04-29 18:10
- 尝试次数: 1
- Monkey summary: 删除 PC runtime 中的 `deriveLegacyTiles`，从 saved tile views 清理旧 `resources/buildings/instruments/danger` 投影字段，地图页改从 map config、runtime map state、objects 与 special states 展示信息，并使用中性未知格文案。验证：`npm --prefix apps/pc-client run lint` 通过；`npm --prefix apps/pc-client run test` 通过。

### T018: 清理 PC UI mock 文案
- 状态: completed
- 开始时间: 2026-04-29 18:11
- 完成时间: 2026-04-29 18:15
- 尝试次数: 1
- Monkey summary: 清理通讯台硬编码频道/噪声/天线/脚步声/固定求救，清理控制中心设施卡、日志、弹窗中的唱片机/异常数量/假状态和剧情化占位文案，通话页改为中性状态说明，初始系统日志改为中性初始化记录。验证：`npm --prefix apps/pc-client run lint` 通过；`npm --prefix apps/pc-client run test` 通过。

### T019: 清理 mobile UI mock 文案
- 状态: completed
- 开始时间: 2026-04-29 18:16
- 完成时间: 2026-04-29 18:17
- 尝试次数: 1
- Monkey summary: 移除 mobile UI 中的 demo/live/armed 与固定求救文案，连接卡片改为真实连接状态，无私密来电时显示“暂无私密来电”中性空状态；未修改 shared transport 逻辑。验证：`npm --prefix apps/mobile-client run lint` 通过；`npm --prefix apps/mobile-client run test` 通过。

### T020: 更新正式项目文档
- 状态: completed
- 开始时间: 2026-04-29 18:18
- 完成时间: 2026-04-29 18:28
- 尝试次数: 1
- Monkey summary: 同步正式 Markdown 文档为 Mike、Amy、Garry 三人队伍、四类基础行动、`crew_actions` 唯一行动事实源和结构化事件入口；移除正式文档中的旧事件入口、旧对象行动与旧地图投影表述。验证：文档范围关键词审计通过；`docs/core-ideas.md` 按规则未修改。

### T021: 全仓关键词审计与生成产物同步
- 状态: completed
- 开始时间: 2026-04-29 18:29
- 完成时间: 2026-04-29 18:39
- 尝试次数: 1
- Monkey summary: 完成全仓关键词审计清理，删除一次性旧迁移脚本，更新 content 校验以基于当前 crew content 校验结构化事件 crew 引用，并重跑 event manifest 生成器。剩余命中仅限历史 plans、Pencil 源文件、工具链/API 名或当前正式模型字段。验证：`npm run validate:content`、PC lint/test、mobile lint/test、editor 目标测试均通过。

### T022: 集成验证与收口
- 状态: completed
- 开始时间: 2026-04-29 18:40
- 完成时间: 2026-04-29 18:45
- 尝试次数: 1
- Monkey summary: 完成最终集成验证；同步 Rush 依赖后 root `npm run validate:content`、`npm run lint`、`npm run test` 全部通过，并修复 editor App 测试在 Node 25 下的 localStorage warning。`npm run test:e2e` 因本机 Playwright Chromium executable 缺失未能完成浏览器级验证。
