# Implementation Plan（从 RFC Milestones 抽取）

> Task: `mobile-communication-device-gameplay`  
> 日期：2026-05-09  
> 说明：本文件是实现阶段交接清单；本阶段未写生产代码。

---

## Milestone 1: Contract + PC dispatcher bridge

### Scope
- `packages/dual-device/src/index.ts`
- `packages/dual-device/src/index.test.ts`
- `apps/pc-client/src/App.tsx`（或抽出邻近 helper）
- `apps/pc-client/src/logger/__tests__/handleDecision.integration.test.tsx` 或新增 phone dispatcher 测试

### Steps
- [ ] 为 `phone.choice.select` 定义 / 校验 payload v1：`runtime_call_option`、`basic_action`、`story_action`。
- [ ] 让 mobile `basic_action` 仅允许 `universal:survey | universal:standby | universal:stop`；拒绝 `universal:move`。
- [ ] 从 `handleDecision` 抽出 PC 中央 dispatcher，确保 PC CallPage 与 phone intent 共用结算路径。
- [ ] PC service 收到 `phone.choice.select` 后做 room/client/sequence/payload/call/action 校验，再调用 dispatcher。
- [ ] 非法 / 过期 intent 返回 reject，不写 `player.call.choice` / `player.action.dispatch`。

### Verification
- Commands:
  - `cd packages/dual-device && node ../../common/scripts/install-run-rushx.js test`
  - `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test`
- Expected:
  - payload guard 测试覆盖合法 / 非法 intent。
  - phone RuntimeCall option 写 `player.call.choice`。
  - phone survey/standby/stop 写 `player.action.dispatch`。

### Rollback Notes
- 不接入 `phone.choice.select` handler 即可回到 PC-only 通讯决策。

---

## Milestone 2: PC mobile session + status / fallback UI

### Scope
- `apps/pc-client/src/App.tsx`
- `apps/pc-client/src/pages/CommunicationStation.tsx`
- `apps/pc-client/src/pages/ControlCenter.tsx`
- `packages/dual-device/src/index.ts`（复用 `shouldEnablePcFallback`，尽量不改）

### Steps
- [ ] 在 PC 顶层集中维护 `mobileSessionState`：pairing、lastHeartbeatAt、fallbackAfterMs、online/unread/emergency。
- [ ] 将 heartbeat 更新从 `CommunicationStation` 局部状态提升到 PC 顶层或可被 ControlCenter 读取的位置。
- [ ] 用 `shouldEnablePcFallback` 派生 active/fallback；默认 `fallbackAfterMs = 10000`。
- [ ] ControlCenter active 时隐藏或禁用主 station facility，并展示“移动通讯设备在线”状态卡 / strip。
- [ ] fallback / 未配对时恢复原 station 入口，状态卡说明 PC fallback 已接管。
- [ ] 紧急 RuntimeCall 和未读数同步到状态卡。

### Verification
- Commands:
  - `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint`
  - `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test`
- Expected:
  - active 状态下 station 主入口不可用。
  - 超过 10000ms 无 heartbeat 后 station 恢复。
  - 未读 / 紧急 / fallback 文案可测试。

### Rollback Notes
- 删除 / 关闭 active 隐藏判断，让 ControlCenter 永远渲染 station facility。

---

## Milestone 3: Mobile WeChat-like UI + intent submission

### Scope
- `apps/mobile-client/src/MobileTerminalApp.tsx`
- `apps/mobile-client/src/styles.css`
- `apps/mobile-client/src/MobileTerminalApp.test.tsx`
- 可能新增 mobile view model 类型 / helper 文件

### Steps
- [ ] 将手机首页重构为消息列表优先：线程摘要、联系人入口、未读 / 紧急标识。
- [ ] 支持会话线程展示：普通 story call inline；紧急 RuntimeCall 全屏高优先级。
- [ ] 展示任务摘要、近期事件、连接状态。
- [ ] 选项按钮发送 `phone.choice.select`，包含 `clientRequestId`，本地显示 pending。
- [ ] 支持 `universal:survey | universal:standby | universal:stop`；移动只提示回 PC 地图流程。
- [ ] 处理 PC ack / reject，更新线程反馈；重连后以 PC 下发快照覆盖本地显示。

### Verification
- Commands:
  - `cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js lint`
  - `cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js test`
  - `cd packages/dual-device && node ../../common/scripts/install-run-rushx.js test`
- Expected:
  - 手机无配对参数显示手动 / 等待配对。
  - 收到普通消息进入线程；收到 emergency 展示全屏。
  - 点击结构化选项发送正确 `phone.choice.select`。

### Rollback Notes
- 保留旧 heartbeat/read/answer shell；PC fallback 继续可用。

---

## Milestone 4: End-to-end regression / hardening

### Scope
- `apps/pc-client/tests/e2e/app.spec.ts`
- PC / mobile / dual-device 相关单元测试
- 文档 / handoff 说明

### Steps
- [ ] 增加 PC 控制中心 active/fallback 的回归测试。
- [ ] 增加手机 intent 到 PC dispatcher 的集成测试，验证日志。
- [ ] 验证 MapPage 仍只做候选选点，不直接写移动行动。
- [ ] 手动或 e2e 覆盖：配对 → 手机 active → PC 隐藏 station → 手机断开 / heartbeat 超时 → PC station 恢复。

### Verification
- Commands:
  - `npm run lint`
  - `npm run test`
  - `npm run test:e2e`（涉及 PC 页面流和用户旅程时）
  - `npm run validate:content`（仅当实现意外触及 `content/`；计划上不应触及）
- Expected:
  - lint/test 通过。
  - e2e 能证明 PC fallback 不会卡死关键通讯。
  - 全局日志仍出现 `player.call.choice`、`player.action.dispatch`、移动仍为 `player.move.target`。

### Rollback Notes
- 若 e2e 发现 fallback 卡死，优先回滚 Milestone 2 的隐藏入口逻辑，而不是回滚 dispatcher 或 mobile UI。
