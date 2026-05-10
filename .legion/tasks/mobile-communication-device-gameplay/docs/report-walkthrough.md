# Report Walkthrough: 手机通讯终端融入 Gameplay

> Mode: `implementation`  
> Evidence: `plan.md`, `docs/rfc.md`, `docs/review-rfc.md`, `docs/test-report.md`, `docs/review-change.md`, git diff summary

## 改了什么

- 手机端从心跳 / 已读 / 接听测试端扩展为 WeChat-like 通讯终端 UI，可展示消息 / 联系人 / 会话 / 紧急来电 / 结构化选项，并提交 `phone.choice.select` intent。
- PC 端新增手机 active / fallback 通讯模式：手机在线时控制中心隐藏或弱化主通讯台入口并显示状态卡；fallback 后恢复 PC 通讯台入口。
- PC 仍是唯一权威：手机 intent 经 PC 校验后进入中央 dispatcher，复用现有 RuntimeCall / 基础行动结算与全局日志路径。
- dual-device 补充 `phone.choice.select` payload / guard / envelope 校验相关能力与测试。
- 内容文件未修改；`npm run validate:content` 不适用且未执行。

## 为什么这样改

- RFC 选择 Option A：手机完整替代通讯台 UI，但不接管权威状态；PC dispatcher bridge 负责结算和日志。
- 该方案满足手机 active 体验，同时保留 PC fallback，避免断连后核心通讯玩法不可用。
- 手机不实现移动地图；移动仍沿用 PC 通话 / 地图候选 / 通讯确认流程，避免扩大本轮范围。

## 关键文件

- `packages/dual-device/src/index.ts` / `index.test.ts`：`phone.choice.select` payload、guard、envelope / sequence 校验测试。
- `apps/mobile-client/src/MobileTerminalApp.tsx` / `styles.css` / tests：手机通讯终端 UI、结构化选项提交、pending / ack 展示相关覆盖。
- `apps/pc-client/src/App.tsx` / `App.test.tsx`：PC mobile session、fallback、phone intent 校验、dispatcher bridge。
- `apps/pc-client/src/pages/ControlCenter.tsx`：mobile active/fallback 下的通讯入口与状态卡。
- `apps/pc-client/src/pages/CommunicationStation.tsx`：保留配对 / fallback 相关入口，移除不再应由站台直接承担的手机结算职责。
- `apps/pc-client/src/logger/__tests__/handleDecision.integration.test.tsx`：验证日志路径仍闭合。

Git diff summary: 10 个代码 / 测试文件变更，约 `799 insertions / 350 deletions`；未观察到 `content/` 变更。

## Reviewer 重点看哪里

- Trust boundary：`roomId`、`phoneTerminalId`、正向单调 `sequence` 是否必须通过后才更新 heartbeat/fallback 或派发 intent。
- Dispatcher / logging：phone-origin RuntimeCall option 是否仍写 `player.call.choice`，survey/standby/stop 是否仍写 `player.action.dispatch`。
- RuntimeCall crew 权威性：payload `crewId` 与 PC 权威 `RuntimeCall.crew_id` 不一致时应拒绝；payload 为 `null` 时由 PC 权威 call 派生。
- Fallback 安全：手机 active 时 PC 入口隐藏 / disabled，心跳超时或离线后 PC 通讯台可恢复。
- 范围边界：没有手机移动地图、没有 phone-only 状态写入、没有 content/schema 改动。

## 验证证据

`docs/test-report.md` 记录以下最终验证均 PASS：

- `cd packages/dual-device && node ../../common/scripts/install-run-rushx.js test`
- `cd packages/dual-device && node ../../common/scripts/install-run-rushx.js lint`
- `cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js test`
- `cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js lint`
- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test`（最终 46 files / 423 tests passed）
- `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint`
- `npm run lint`
- `npm run test`
- `npm run test:e2e`
- `npm run build`
- `git diff --check`

`npm run validate:content` 未执行；原因是本实现未修改 `content/` 或 schema。

## Review / 风险结论

- `docs/review-rfc.md`：RFC PASS，无阻塞问题。
- `docs/review-change.md`：实现复审 PASS，无阻塞问题。
- 复审已特别关注跨设备 typed events 与 PC-authoritative command dispatch 的安全 / 信任边界。
- 已修复的历史阻塞包括：未校验 `clientId` / `sequence`、生产 DOM 测试后门、RuntimeCall phone intent 信任 payload `crewId`。

## Rollback notes

- 若发现手机 intent 导致状态不一致、fallback 无法恢复、日志缺失，回滚策略是关闭 mobile active 隐藏入口并停止处理 `phone.choice.select`。
- PC 通讯台可恢复为唯一决策入口；heartbeat/read/answer 可保留。
- 不需要数据迁移；GameState 与 content 未变，pending phone ack 可丢弃，以 PC 权威状态为准。
