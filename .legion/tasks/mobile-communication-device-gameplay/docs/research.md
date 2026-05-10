# Research Notes（现状摸底）

> Task: `mobile-communication-device-gameplay`  
> 日期：2026-05-09  
> 范围：只摸底 PC / Mobile / dual-device / logger / navigation 的现状，不写生产代码。

---

## 1. Problem Restatement

- 一句话复述：把手机端从“私密来电测试 companion”升级为 WeChat-like 通讯终端；手机 active 时替代 PC 通讯台主入口，但所有结算仍由 PC 权威状态、中央 dispatcher 与全局日志完成。
- 影响范围：`apps/mobile-client/src`、`apps/pc-client/src`、`packages/dual-device/src`、logger 测试与 PC 导航 / e2e。

## 2. Relevant Code / Entry Points

- `apps/mobile-client/src/MobileTerminalApp.tsx`
  - 当前只读取 URL 配对参数、启动 Yuan Terminal、发送 `link.heartbeat`，并显示 PC 授权的私密信号（证据：`readPairingParams` lines 203-218；heartbeat lines 84-87；私密信号 UI lines 132-150）。
  - 当前手机只可回传 `phone.message.read` / `phone.call.answer`，`sendPhoneEvent` 的 type union 不含 `phone.choice.select`（lines 220-246）。
  - UI 文案仍明确“只显示 PC 授权的私密通讯”（lines 194-197），尚无消息列表 / 联系人 / 选项 UI。

- `packages/dual-device/src/index.ts`
  - `DualDeviceMessageType` 已包含 `phone.choice.select`（lines 37-45），可作为手机选择 / intent 的统一入口。
  - `DualDeviceLinkStatus` 已包含 `fallbackAfterMs`（lines 67-71）。
  - `createDualDeviceMessage` 统一生成 typed message（lines 448-456）。
  - `shouldEnablePcFallback(status, nowMs)` 已实现 offline 立即 fallback、心跳超时后 fallback（lines 555-565）；测试覆盖默认行为形态（`packages/dual-device/src/index.test.ts` lines 113-117）。
  - `validateDualDeviceMessage` 只校验通用 envelope 与 `payload` 为 object（lines 502-522），尚无 `phone.choice.select` payload 级类型守卫。

- `apps/pc-client/src/pages/CommunicationStation.tsx`
  - 当前通讯台同时承担通讯录、RuntimeCall 列表、配对二维码、手机测试来电、fallback 按钮（props lines 33-44；配对和终端 state lines 61-66；RuntimeCall 列表 lines 242-271；手机面板 lines 300+）。
  - PC service 只把手机事件交给 `handlePhoneEventMessage` 更新私密信号和连接状态（lines 148-150），未接入 App 中央决策 dispatcher。
  - 测试来电 payload 已使用 `fallbackAfterMs: 10000`（lines 168-179），可作为 MVP 默认值证据。

- `apps/pc-client/src/App.tsx`
  - PC 是权威 GameState 与导航中心：`gameState`、`page`、`currentCall`、`mapReturnTarget` 在 App 顶层维护（lines 68-76）。
  - 世界时间在 App interval 中推进并结算行动（lines 83-94），手机不应独立推进世界。
  - `handleDecision` 已集中处理 RuntimeCall 选项、`universal:survey`、`universal:standby`、`universal:stop`、地点剧情行动（lines 245-374）。
  - RuntimeCall 选择写 `player.call.choice`（lines 250-277）；调查 / 待命 / 停止写 `player.action.dispatch`（lines 295-320、327-354）。
  - 移动保持 PC 通话 → 地图候选 → 通话确认：`universal:move` 只进入选点模式且不写日志（lines 280-292），`confirmMove` 才写 `player.move.target` 并启动移动（lines 402-483）。

- `apps/pc-client/src/pages/CallPage.tsx`
  - RuntimeCall UI 只提交稳定 `option_id`（lines 115-128）。
  - 普通通话通过 `buildCallView` 展示基础行动 / 地点行动分组（lines 131-154）。
  - 地图入口说明为“只读查看坐标，不下指令”，移动确认面板在通话上下文内完成（lines 215-237）。

- `apps/pc-client/src/pages/MapPage.tsx`
  - 地图 props 明确只接受 `moveSelectionCrewId`、`selectedMoveTargetId` 与 `onSelectMoveTarget`（lines 15-29）。
  - 地图文案说明“标记候选目的地 / 返回通话确认”，不是直接写移动行动（lines 103-115、188-205、207）。

- `apps/pc-client/src/pages/ControlCenter.tsx`
  - 当前控制中心设施卡固定渲染 `facilities`，点击 `station` 直接 `onOpenStation()`（lines 49-53、91-104）。
  - 只显示未读通讯数量，尚无 mobile active / fallback 状态卡（lines 70-88）。

- `apps/pc-client/src/logger/types.ts`
  - 已有闭合集合中的 `player.call.choice`、`player.move.target`、`player.action.dispatch` payload 契约（lines 50-65、108-124）。
  - 不应为手机另建并行玩家指令日志类型；应复用现有类型。

## 3. Existing Conventions

- PC 仍是唯一权威：GameState、时间、事件、行动、存档都在 PC App 顶层维护；手机仅发送 typed events。
- 指令必须经通讯上下文：移动、调查、待命、停止等基础行动不能从地图直接写入行动。
- 日志先行：玩家选择和行动指令需要写全局 logger；现有测试对 App hook 点做静态与行为断言（`apps/pc-client/src/logger/__tests__/handleDecision.integration.test.tsx` lines 58-115）。
- dual-device 是业务抽象与 Yuan adapter，不引入 Stellar 专属 server；WebRTC 是机会性升级，WSS 是 baseline。
- 不应改 `content/`，本任务可通过派生现有 GameState / RuntimeCall / crewActions 构造手机通讯视图。

## 4. Historical Decisions / Design Source

- 设计源：`docs/plans/2026-05-01-18-37/mobile-wechat-communication-device-design.md`（主工作区只读）。
- 关键决策摘要：手机成功加入后替代 PC 通讯台，PC 保留状态卡与 fallback；手机支持消息列表、联系人、会话、结构化回复、任务摘要、近期事件、连接状态；移动仍使用 PC 通话 / 地图候选 / 通讯确认；`fallbackAfterMs` 默认 `10000ms`，只有 active / fallback，`mobile_weak` Later；手机 intent 必须经 PC 中央 dispatcher 与全局日志。

## 5. Constraints & Non-goals

- 约束：只在当前 worktree 写设计文档；本阶段不写生产代码。PC 权威 GameState 不迁移；手机不能直接修改状态或独立结算。`phone.choice.select` 应承载结构化选项与非移动行动 intent。movement MVP 不进入手机地图，不改变 PC MapPage 候选选点语义。fallback 必须可恢复 PC 通讯台入口。
- 非目标：自由文本聊天、LLM 对话、OS push、多手机 / 多人、手机背包、完整手机地图、关系系统、复杂信号玩法、关闭 PC 后手机继续世界。

## 6. Risks & Pitfalls

- 风险：把手机 UI 接到独立状态，导致 PC / phone 双事实源。缓解：PC 生成派生 mobile view model；手机只缓存展示与 pending ack。
- 风险：直接在 `CommunicationStation` 内处理手机选择，绕过 App `handleDecision` 与日志。缓解：抽出 PC 侧 central dispatcher 供 CallPage 与 phone event 共用。
- 风险：隐藏 PC 通讯台后 heartbeat 失效但入口不恢复。缓解：PC 顶层保存 `lastHeartbeatAt` / `fallbackAfterMs`，用 `shouldEnablePcFallback` 派生 active/fallback。
- 风险：`phone.choice.select` payload 过宽。缓解：dual-device 或 PC 侧新增 payload guard；非法 intent 只 ack reject，不写玩家指令日志。
- 风险：移动流程被手机改动扩大范围。缓解：MVP phone 对 `universal:move` 只展示“需在 PC 端完成移动选点”。

## 7. Unknowns

- [ ] 是否需要在日志 payload 中记录 `origin: "phone" | "pc"`：当前 logger payload 是闭合类型；MVP 可先不改日志 schema，通过 dispatcher 内部来源做测试断言。
- [ ] PC 状态卡位置：RFC 建议独立 strip + 隐藏主 station facility，避免破坏现有设施定义。
- [ ] 手机重连后的未读状态粒度：MVP 由 PC 派生当前消息 / 未读 / RuntimeCall 快照，下发全量覆盖手机本地显示。

## 8. References

- Design: `docs/plans/2026-05-01-18-37/mobile-wechat-communication-device-design.md`（主工作区只读来源）
- Files: `apps/mobile-client/src/MobileTerminalApp.tsx`, `apps/pc-client/src/App.tsx`, `apps/pc-client/src/pages/CommunicationStation.tsx`, `apps/pc-client/src/pages/CallPage.tsx`, `apps/pc-client/src/pages/MapPage.tsx`, `apps/pc-client/src/pages/ControlCenter.tsx`, `packages/dual-device/src/index.ts`, `apps/pc-client/src/logger/types.ts`
