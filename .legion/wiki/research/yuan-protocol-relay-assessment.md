# 调研：基于 Yuan 构建 Stellar 双设备业务层

## 问题

`@yuants/protocol` 的 RPC 协议与 WebRTC 升级机制，再加上 `@yuants/app-host`，能否作为 Stellar Frontier 双设备业务层的底层基础设施？

## 修正结论

可以，而且这是比自研长期 relay 更合理的方向。

更准确的边界是：Yuan Host/Protocol 不能“裸替换”Stellar 的业务语义，但 Stellar 双设备能力完全可以构建在 Yuan 之上。因此不需要维护单独的 Stellar server 组件；Yuan 负责通用 transport / terminal routing / WebRTC signaling / DataChannel upgrade / WebSocket fallback，Stellar 只保留 PC/mobile 共享的业务抽象层，负责房间、扫码、token、PC 权威、首台手机锁定和游戏 typed events。

推荐后续 RFC 从“是否自研 relay / 是否用 Yuan 替换 relay”改为“如何在 Yuan Host/Protocol 上实现 Stellar DualDevice 业务层”。

## 推荐分层

```text
PC Yuan Terminal / Mobile Yuan Terminal
  -> Stellar DualDevice business services
     - room/session 语义
     - QR / 手输码
     - pairing token TTL / revoke
     - PC-first 创建与授权
     - first-phone lock
     - fallback state
     - DualDeviceMessage product contract
  -> Yuan Protocol message / service / channel
     - ITerminalMessage envelope
     - service discovery / request routing
     - HostEvent / terminal info sync
  -> Yuan Host transport
     - WSS baseline
     - Host-mediated WebRTC offer/answer signaling
     - DataChannel opportunistic upgrade
     - WS fallback
```

## 对四个核心问题的判断

### 1. room 可以匹配 Yuan host / tenant

Stellar 的 room 不应该被理解为“游戏状态容器”，而应该是一次 PC-phone pairing session 的路由与授权命名空间。这个概念可以映射到 Yuan host / tenant，尤其是 ED25519 tenant：一个 room 对应一个临时或半临时 ED25519 key pair，`public_key` 作为 host/tenant id，签名用于证明加入者属于这次 pairing。

这样做的好处是：

- room boundary 由 Yuan Host 的 tenant/host boundary 承载。
- PC 和 mobile 都作为同一 host/tenant 下的 Terminal 接入。
- Stellar 的 first-phone lock 和 role policy 可以作为该 tenant 内的业务服务规则实现。
- QR 可以携带 host URL、tenant/public key、pairing token 或一次性 join proof。

需要注意一个实现细节：当前 `apps/host/src/host-manager.ts` 里 multi-tenancy 分支会读取 `public_key` / `signature` 并设置 `host_id = public_key`，但后面又出现 `host_id = 'main'` 的赋值：[apps/host/src/host-manager.ts](https://github.com/No-Trade-No-Life/Yuan/blob/main/apps/host/src/host-manager.ts#L328-L337)。在真正把 room 映射到 Yuan tenant 前，需要核实这是预期逻辑还是 bug；如果它覆盖了 ED25519 tenant id，就要先修 Yuan Host 或在 Stellar adapter 里绕开。

### 2. DualDeviceMessage 可以构建在 Yuan Protocol Message 之上

`DualDeviceMessage` 不需要和 Yuan `ITerminalMessage` 竞争。它可以保留为 Stellar 的产品层 contract，然后作为 `ITerminalMessage.req`、`ITerminalMessage.event.payload` 或某个 `DualDevice/*` service 的请求体传输。

Yuan `ITerminalMessage` 提供的是通用消息 envelope：`source_terminal_id`、`target_terminal_id`、`trace_id`、`seq_id`、`method`、`service_id`、`req`、`res`、`frame`、`event`、`done`：[libraries/protocol/src/model.ts](https://github.com/No-Trade-No-Life/Yuan/blob/main/libraries/protocol/src/model.ts#L214-L235)。Stellar 可以把 `DualDeviceMessage` 当作业务 payload，而不需要放弃自身更简单的 typed events。

建议映射：

| Stellar | Yuan |
| --- | --- |
| `roomId` | tenant/host id 或业务 service 内的 session id |
| `clientId` | `source_terminal_id` / Terminal tag |
| `type` | `method = DualDevice/<type>` 或 `event.type` |
| `sequence` | `seq_id` 或业务 payload 内保留 |
| `sentAt` | 业务 payload 字段 |
| `payload` | `req` / `event.payload` |

### 3. PC 和 mobile 都应该成为 Yuan Terminal

同意。如果 PC/mobile 不都成为 Yuan Terminal，那么使用 Yuan 的价值会大幅降低。Yuan 的关键收益正是 Terminal routing、service discovery、HostEvent、WebRTC signaling 和 DataChannel upgrade；这些能力都建立在双方是 Terminal 的前提上。

PC Terminal 的职责：

- 持有唯一 `GameState`，仍是 gameplay authority。
- 提供 Stellar DualDevice services，例如 `DualDevice/CreatePairing`、`DualDevice/PrivateSignal`、`DualDevice/Ack`、`DualDevice/Fallback`。
- 校验 mobile 的 role、pairing token、message sequence 和当前游戏状态。

Mobile Terminal 的职责：

- 通过 QR / 手输码获得 Host URL、tenant/room 信息和 join proof。
- 作为轻量 Terminal 接入同一 host/tenant。
- 只调用白名单 DualDevice services 或订阅白名单 channel。
- 发送已读、接听、选择、heartbeat 等 typed events。

这仍然不改变 PC 权威。Yuan Terminal 只是 transport/session identity，游戏事实仍由 PC 服务确认。

### 4. Yuan 的无感 WebRTC 升级是主要价值

同意。这是选择 Yuan 的最强理由。

Yuan 的 WebRTC 流程已经符合 Stellar 的产品要求：先用 WSS 作为稳定 baseline；在双方都启用 `enable_WebRTC` 时，通过 Host 上的 `WebRTC/Offer` / `WebRTC/Answer` 服务交换 signaling；DataChannel 连上后优先走 WebRTC；无法连接或发送失败时自动退回 WebSocket：[libraries/protocol/src/terminal.ts](https://github.com/No-Trade-No-Life/Yuan/blob/main/libraries/protocol/src/terminal.ts#L521-L625)、[libraries/protocol/src/terminal.ts](https://github.com/No-Trade-No-Life/Yuan/blob/main/libraries/protocol/src/terminal.ts#L270-L338)。

这正好匹配 Stellar 策划案中的原则：WSS Host 是可靠基线，WebRTC 是同网/可直连时的机会性低延迟优化，失败不应成为玩家要处理的问题。

## 仍然不是 drop-in 的原因

虽然推荐 build on Yuan，但它仍然不是 drop-in replacement，原因更精确地说是“缺少 Stellar 业务层”，不是“Yuan 不适合”。

缺少的业务层包括：

- QR / 手输码生成与展示。
- pairing token TTL、撤销、重放防护。
- PC-first room/tenant 创建流程。
- mobile join request 与 first-phone lock。
- `DualDeviceMessage` payload schema 和白名单 service。
- PC fallback state 与 UI 语义。
- 手机端“可选增强，不成为负担”的产品文案和状态机。
- 与当前 PC `GameState` 的权威校验和日志写入。

这些不是 Yuan Host 应该内建的游戏逻辑，而是 Stellar 应该在 Yuan 上实现的业务服务。

## 后续 RFC 应回答的问题

- room 是否直接等于 Yuan host/tenant，还是一个 tenant 内可有多个 Stellar room？当前倾向：单人双设备 MVP 可以先让 room 等于 tenant/host；未来多房间或多设备再拆分。
- pairing key pair 是每次打开配对都临时生成，还是 PC session 级复用并配合短 token？
- QR 中包含哪些字段：Host URL、tenant/public key、pairing code、token、mobile terminal id seed、过期时间？
- Stellar `DualDeviceMessage` 放在 Yuan 的 `req` 还是 `event.payload`？是否需要 request/response ack 语义？
- mobile 应该暴露哪些 `provideService`，哪些只能由 PC 提供？
- 如何限制 Terminal service discovery，避免手机看到或调用非 DualDevice 的服务？
- Yuan Host 的 ED25519 multi-tenancy 当前实现是否需要修正或扩展？
- WebRTC TURN/STUN、国内网络、HTTPS/WSS 部署与 fallback UI 如何设计？

## 当前决策

当前 PR 应删除已有最小 relay scaffold，改为 `packages/dual-device` 共享业务层：PC/mobile 使用同一套配对、QR、token、typed event、Yuan `ITerminalMessage` 映射和 fallback 规则。Yuan Host 作为外部基础设施存在，不作为 Stellar repo 内的 server app。

下一步如果继续推进双设备网络层，应写新 RFC：`基于 Yuan Host/Protocol 构建 Stellar 双设备业务层`。该 RFC 的默认方向应是 PC/mobile 都成为 Yuan Terminal，room 映射到 Yuan host/tenant，`DualDeviceMessage` 构建在 `ITerminalMessage` 上，并利用 Yuan 的无感 WebRTC 升级。
