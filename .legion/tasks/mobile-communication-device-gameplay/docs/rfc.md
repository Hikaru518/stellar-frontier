# RFC: 手机 WeChat-like 通讯终端替代 PC 通讯台

> **Profile**: RFC Heavy  
> **Status**: Draft  
> **Task**: `mobile-communication-device-gameplay`  
> **Created / Updated**: 2026-05-09

---

## Executive Summary

- **Problem**: 当前 mobile-client 只是心跳 / 已读 / 接听的私密信号测试端，不能承接已批准设计中的通讯台替代职责。
- **Decision**: 采用 Option A：手机作为完整通讯台替代 UI，所有选择以 typed intent 发回 PC，由 PC dispatcher 复用现有通话 / 行动 / logger 管线。
- **Impact**: 跨 `mobile-client`、`pc-client`、`dual-device`、logger 测试与导航；不改 content，不改移动地图直发。
- **Risks**: 双端状态分裂、隐藏 PC 入口后断连卡死、手机 intent 绕过日志、移动流程范围膨胀。
- **Rollback**: 保留 PC 通讯台原能力；回滚时关闭 mobile active 替代逻辑并让 PC 始终显示 station。

---

## 1. Background / Motivation

批准设计要求手机端成为“玩家手中通讯设备”：消息列表优先，支持联系人、会话、来电、结构化回复、任务摘要、近期事件与连接状态；手机 active 时 PC 隐藏主通讯台入口，仅保留状态卡 / strip 与 fallback。PC 仍是权威 GameState，移动仍沿用 PC 通话 → 地图候选 → 通讯确认。

当前代码证据见 `research.md`：mobile 只处理测试私密信号；PC `CommunicationStation` 仍是主通讯台；`App.tsx` 已有可复用的 `handleDecision` 与日志 hook；dual-device 已有 `phone.choice.select` 与 `shouldEnablePcFallback`。

## 2. Goals

- 手机端提供消息列表优先的通讯终端：联系人、线程、来电、结构化选项、任务摘要、近期事件、连接状态。
- 手机端可处理普通 story call、紧急 RuntimeCall、结构化事件回复。
- 手机端可提交非移动基础行动：`universal:survey`、`universal:standby`、`universal:stop`。
- PC active 时隐藏主 Communication Station 入口，保留状态卡 / strip：online、unread、emergency、fallback。
- `fallbackAfterMs` 默认 `10000ms`，超过心跳阈值后恢复 PC 通讯台。
- 手机 intent 必须经 PC 中央 dispatcher，保留 `player.call.choice` 与 `player.action.dispatch` 全局日志。

## 3. Non-goals

自由文本聊天、LLM 开放对话、OS push、多手机 / 多玩家、手机背包、完整手机地图、PC 地图直接写移动行动、关系 / 好感系统、复杂信号玩法、`mobile_weak`、PC 关闭后手机继续推进世界。

## 4. Constraints

- **Compatibility / API**: 复用 `DualDeviceMessage` envelope；`phone.choice.select` 的 payload 必须可版本化、可校验。
- **Authority**: PC 是唯一权威；手机只发送 intent 与展示派生 view model。
- **Logging**: 结构化回复写 `player.call.choice`；非移动行动写 `player.action.dispatch`；移动仍由 PC `player.move.target`。
- **Navigation**: MapPage 保持候选选点；ControlCenter 根据 mobile active/fallback 隐藏或恢复 station 入口。
- **Operational**: Yuan WSS baseline + WebRTC opportunity 不变；fallback 不依赖真实 DataChannel 可观测性。
- **Content**: 本任务预计不改 `content/`；手机 view model 从现有 GameState / RuntimeCall / event logs 派生。

## 5. Proposed Design

### 5.1 High-level Architecture

- **PC App 顶层**：持有 `mobileSessionState`（pairing、connectionStatus、lastHeartbeatAt、`fallbackAfterMs = 10000`、unread/emergency、pending ack），派生 `mobileMode = active | fallback`，并提供 `dispatchPlayerCommunicationIntent(intent, source)`。
- **PC → Phone 派发**：PC 生成 mobile view model / messages：联系人摘要、线程摘要、当前 RuntimeCall、普通通话可选项、任务摘要、近期事件、连接状态。紧急 RuntimeCall 使用 `priority: "emergency"` 并在手机全屏展示。
- **Phone → PC intent**：手机按钮只发送 `phone.choice.select`，本地显示 pending / ack / rejected。PC 验证 room/client/sequence、payload、call 是否 active、crew/action 是否合法，再调用中央 dispatcher。
- **PC UI**：`mobileMode=active` 时 ControlCenter 隐藏 / disabled `station` facility 主入口并显示“手机通讯在线”状态卡；fallback / 未配对时恢复原 station 入口。

### 5.2 Data / Event Contracts

#### `phone.choice.select` envelope

```ts
DualDeviceMessage {
  type: "phone.choice.select";
  roomId: string;
  clientId: string;
  sequence: number;
  sentAt: number;
  payload: PhoneChoiceSelectPayload;
}
```

#### Payload v1

```ts
type PhoneChoiceSelectPayload =
  | {
      version: 1;
      kind: "runtime_call_option";
      callId: string;
      crewId: string | null;
      optionId: string;
      clientRequestId: string;
    }
  | {
      version: 1;
      kind: "basic_action";
      crewId: string;
      actionId: "universal:survey" | "universal:standby" | "universal:stop";
      clientRequestId: string;
    }
  | {
      version: 1;
      kind: "story_action";
      crewId: string;
      actionId: string;
      clientRequestId: string;
    };
```

- `runtime_call_option` → PC dispatcher 等价调用 RuntimeCall 分支：写 `player.call.choice`，payload 保持 `{ call_id, choice_key, crew_id }`。
- `basic_action` → PC dispatcher 等价调用 `universal:survey/standby/stop`：写 `player.action.dispatch`，payload 保持 `{ crew_id, action_id, action_kind }`。
- `story_action` → 用于普通地点事件结构化 action；若现有 action 不可见 / 不合法，reject。
- MVP 不定义 `move` intent；手机如展示“移动”只能提示“请在 PC 地图流程完成”。

#### Ack / reject 表示

- 复用 PC → phone 消息，可用 `phone.message.delivered` payload 表示：`{ kind: "intent_ack", clientRequestId, status: "accepted" | "rejected", reason?, resultingThreadId? }`。
- 本 RFC 不要求新增 `DualDeviceMessageType`；如实现发现 ack 类型混淆严重，可在 `dual-device` 中新增 typed message，但需同步测试。

### 5.3 PC Dispatcher Boundary

- 从 `App.tsx handleDecision` 中抽取或包裹一个中心函数，统一接收 `source: "pc" | "phone"`、`crewId`、`actionId / optionId / callId`、`clientRequestId?`。
- 中央函数负责：合法性检查 → `logger.log` → GameState 更新 → currentCall / RuntimeCall 状态更新 → UI/system log。
- 不在 `CommunicationStation.tsx` 内直接 settle 手机 intent；该组件最多负责 pairing service 与展示。

### 5.4 PC hides/restores station entry

- `mobile_active`：最近 heartbeat 未超过 `fallbackAfterMs`，且 phone terminal 已加入。
- `mobile_fallback`：offline 或 `now - lastHeartbeatAt >= fallbackAfterMs`。
- `ControlCenter` active 时隐藏或禁用主 station facility，并显示状态卡：手机在线、未读数、紧急数、最近同步、fallback 倒计时 / 说明。
- fallback / 未配对时显示原 station 入口；状态卡说明“PC fallback 已接管”。

### 5.5 fallbackAfterMs enforcement

- 默认值集中常量化：`10000ms`。
- PC 每次收到 `link.heartbeat` 更新 `lastHeartbeatAt`；定时 / render 派生时调用 `shouldEnablePcFallback`。
- offline transport 立即 fallback；缺失 heartbeat 且 terminal 尚未连接时保持 waiting，不误判 active。
- `mobile_weak` 不实现；UI 只显示 active / fallback。

### 5.6 Preserve global game log

- 不新增“phone-only player log”。
- RuntimeCall 手机选择仍写 `player.call.choice` / `player_command`。
- 手机调查 / 待命 / 停止仍写 `player.action.dispatch` / `player_command`。
- 非法 / 过期手机 intent 不写玩家指令日志；可写 UI system log / ack reject。
- 若需要区分来源，另开日志 schema RFC；本轮不破坏闭合 logger payload。

---

## 6. Alternatives Considered

### Option A: 手机完整替代通讯台 + PC dispatcher bridge（选择）
- Pros: 符合批准设计；PC 权威、fallback、日志管线均可保留；移动流程不扩张到手机地图。
- Cons: 跨模块较多，需要抽 dispatcher 与 view model。
- Why chosen: 在体验目标和工程约束之间最平衡。

### Option B: 手机仅做现有 test signal 的 UI shell
- Pros: 改动小；保留当前 pairing / heartbeat 路径。
- Cons: 不能处理联系人、线程、RuntimeCall、结构化回复、非移动行动；PC 通讯台仍是主入口。
- Why not: 明显低于批准设计与验收标准。

### Option C: 所有通话流程迁移到 phone only
- Pros: 手机体验最纯粹。
- Cons: 手机断连会阻断核心玩法；移动与地图确认会被迫跨屏重构；更容易形成双状态。
- Why not: 超出 MVP；违背 fallback 与 PC 地图候选流程约束。

### Decision

选择 Option A。放弃手机自由移动地图、phone-only 通话、仅测试壳方案、`mobile_weak` 分级连接玩法。

---

## 7. Milestones

- **Milestone 1: Contract + PC dispatcher bridge**
  - Scope: `packages/dual-device` payload guard / helper；`App.tsx` 中央通讯 intent dispatcher；相关 unit tests。
  - Acceptance: phone intent 与 PC CallPage 路径共用同一结算 / logger 逻辑；非法 intent reject。
- **Milestone 2: PC mobile session + status / fallback UI**
  - Scope: PC 顶层 mobile state、heartbeat 更新、`shouldEnablePcFallback` 接入、ControlCenter 状态卡、active 时隐藏 station、fallback 时恢复。
  - Acceptance: 手机心跳正常隐藏入口；超过 `10000ms` 恢复入口；紧急 / 未读状态可见。
- **Milestone 3: Mobile WeChat-like UI + intent submission**
  - Scope: `MobileTerminalApp.tsx` 消息列表、联系人、线程、紧急全屏、任务摘要、近期事件、连接状态、`phone.choice.select` 发送与 ack 显示。
  - Acceptance: 手机可处理 RuntimeCall option 与 survey/standby/stop；普通和紧急视觉区分。
- **Milestone 4: Regression / e2e hardening**
  - Scope: mobile/pc/dual-device tests；PC e2e 覆盖 station active/fallback；日志测试覆盖 phone-origin dispatcher。
  - Acceptance: `npm run lint`、`npm run test` 通过；必要时 `npm run test:e2e` 覆盖用户旅程。

## 8. Verification Plan

- 必跑：`npm run lint`、`npm run test`。
- 视实现范围加跑：`npm run test:e2e`（PC 页面流、通话、地图候选、fallback 用户旅程变更时）；`npm run validate:content`（仅当触及 `content/`，本 RFC 建议不触及）。
- 重点测试：phone RuntimeCall option 写 `player.call.choice`；phone survey/standby/stop 写 `player.action.dispatch`；active 时 station 入口隐藏，fallback 后恢复；心跳超时 `fallbackAfterMs=10000` 生效；地图仍只标记候选移动；非法 / 过期 intent reject 且不写玩家指令日志。

## 9. Rollback Plan

- 回滚条件：手机 intent 造成状态不一致、fallback 无法恢复 PC 通讯台、日志缺失或错误、移动流程被误改为直发。
- 回滚步骤：
  1. 禁用 mobile active 隐藏入口逻辑，让 `ControlCenter` 始终显示 station。
  2. 保留或恢复原 `CommunicationStation` 配对与测试私密信号能力。
  3. 停止处理 `phone.choice.select`，只保留 heartbeat/read/answer；PC 通讯台接管所有决策。
  4. 不需要数据迁移；GameState 与 content 未变。
- 数据一致性：已写入的合法玩家日志保留；pending phone ack 可丢弃，因为 PC 状态为权威。

## 10. Open Questions（阻塞级）

- 无阻塞级问题。来源区分是否进入 logger payload 属于后续日志 schema 设计，不阻塞 MVP。

## 11. References

- Research: `.legion/tasks/mobile-communication-device-gameplay/docs/research.md`
- Design source: `docs/plans/2026-05-01-18-37/mobile-wechat-communication-device-design.md`
- Key files: `apps/mobile-client/src/MobileTerminalApp.tsx`, `apps/pc-client/src/App.tsx`, `apps/pc-client/src/pages/CommunicationStation.tsx`, `apps/pc-client/src/pages/ControlCenter.tsx`, `apps/pc-client/src/pages/CallPage.tsx`, `apps/pc-client/src/pages/MapPage.tsx`, `packages/dual-device/src/index.ts`, `apps/pc-client/src/logger/types.ts`
