---
title: 双设备游玩
scope: system
last_updated: 2026-04-28
maintained_by: organize-wiki
---

<!--
本文件由 organize-wiki skill 维护。
请不要直接手工修改本文件；改动应当通过：
1. 用 game-design-brainstorm skill 写一份新的策划案
2. 用 organize-wiki skill 把策划案合入本文件
-->

# 双设备游玩

## 1. 概述（What & Why）

双设备游玩是一个可选增强系统：玩家在 PC 浏览器中运行主游戏，同时用手机浏览器连接同一局游戏，让手机成为游戏内真实存在的私人通讯终端。PC 始终是权威主机与基地控制台，负责保存、时间推进、规则结算和完整 fallback；手机只承载少量高价值、低负担、低延迟的通讯体验。

这个系统的目标不是把游戏拆成两个必须同时操作的客户端，也不是追求炫技式二屏 gimmick，而是在不破坏单人完整可玩的前提下，让玩家偶尔拿起真实手机接收私密来电、短消息或队员回传，从而加强“我正在远程指挥一支远征队”的沉浸感。

## 2. 设计意图（Design Intent）

核心体验是“手机真的变成了游戏世界里的通讯器”。玩家在 PC 上观察基地控制台，在手机上收到只属于自己的私人信号：队员的短消息、紧急来电、干扰信号或需要确认的通讯片段。手机端应带来轻微惊喜和临场感，而不是制造额外压力。

设计优先级从高到低是：可访问性、连接便利性、可感知低延迟、安全 fallback、技术可维护性，最后才是玩法新奇度。玩家不应该因为没有手机、摄像头不可用、网络不理想、手机锁屏、浏览器后台休眠或不想拿手机，就失去核心游戏进度。

要避免的体验包括：必须安装原生 app、必须注册账号、必须调试同一局域网、扫码失败就无法玩、手机断线导致关键决策丢失、PC 与手机显示不同状态而玩家无法判断谁是正确的。

## 3. 核心概念与术语（Core Concepts & Terminology）

- **PC 主机 / 基地控制台**：运行完整游戏的权威端。持有唯一 `GameState`，负责时间推进、事件结算、存档、规则校验和所有关键 UI fallback。
- **手机 companion / 私人通讯终端**：通过浏览器打开的轻量 companion 页面。它显示私密消息、来电、连接状态和少量确认交互，不保存独立世界状态。
- **配对会话**：PC 创建的一次短期连接窗口。PC 显示 QR 码和短手输码，手机访问 session URL 后加入。
- **配对 token**：短时有效的随机凭证，用于防止陌生设备长期复用链接。token 应快速过期，并可由 PC 主机主动撤销。
- **房间 / room**：Yuan Host / Terminal 路由上的临时通信命名空间，不等于账号，也不代表长期在线存档。
- **权威确认 / authoritative ack**：手机发出的动作必须经 PC 主机确认后才成为游戏事实。手机可以先给本地触感或视觉反馈，但不能自行结算规则。
- **可感知延迟**：玩家从点击手机到看到手机端即时反馈的时间。目标是小于 50ms。
- **权威延迟**：手机动作经 Yuan Host / Terminal 到 PC 并得到确认的往返时间。WSS 基线应稳定；WebRTC DataChannel 可更低，但不作为可靠承诺。
- **安全 fallback**：手机不可用时，PC 能在延迟后、玩家请求后或紧急情况下显示等价信息与可选操作，且不会惩罚玩家。

## 4. 核心循环与玩家体验（Core Loop & Player Experience）

### 4.1 玩家旅程

1. 玩家在 PC 端进入“通讯台”或“设备配对”入口。
2. PC 显示一个 QR 码、一个短手输码、连接说明和明确的“手机是可选增强”提示。
3. 玩家用手机扫码，或在手机浏览器输入短链接 / 手输码进入 companion 页面。
4. 手机显示会话名称、连接状态和“等待 PC 授权 / 已连接”状态；PC 显示新设备请求或自动锁定第一台设备。
5. 配对成功后，PC 继续作为完整控制台运行，手机进入私人通讯终端待机界面。
6. 当游戏触发私密来电或消息时，手机优先收到视觉式提示；PC 端只显示“私人信号已发送到手机”或一个可打开的安全 fallback。
7. 玩家在手机上阅读消息、接听来电或进行轻量确认；手机立即给出本地反馈，并等待 PC 权威确认。
8. PC 接收手机事件，验证当前游戏状态，更新唯一 `GameState`，再把状态 delta 广播给手机。
9. 如果手机断开、锁屏或超时，PC 端自动提供安全处理路径，保证剧情信息与关键决策不丢失。
10. 玩家可随时断开手机，游戏仍能在 PC 上完整继续。

### 4.2 典型情境

- **高光时刻**：PC 通讯台显示远征队信号异常，玩家手机突然收到一条只在手机上优先展示的私人短讯：“别在主频道回复。”玩家拿起真实手机阅读，获得强烈的设备即道具感。
- **低谷 / 摩擦点**：扫码失败、手机浏览器切后台、网络切换、Yuan WSS 延迟波动、WebRTC DataChannel 未能升级。系统必须把这些都处理为可读的连接状态，而不是让玩家猜测游戏坏了。

## 5. 机制与规则（Mechanics & Rules）

### 5.1 状态与状态机

PC 主机维护配对与连接状态，手机只展示派生状态。

- **未启用**：玩家未打开手机 companion。所有内容在 PC 上正常可玩。
- **等待配对**：PC 创建短期配对会话，显示 QR 码和手输码。token 到期后需要重新生成。
- **待授权**：手机访问 session URL 后进入等待状态。当前实现采用“第一台设备自动锁定”的轻量入口，后续可增加 PC 点击批准。
- **已连接**：手机可接收私密消息和发送轻量事件。PC 显示设备在线、延迟估计和同步状态。
- **弱连接 / 重连中**：心跳超时或页面进入后台。手机与 PC 都显示“正在恢复连接”，关键事件不只发手机。
- **已断开**：PC 解锁或保留最近会话，允许手机用同一 session 在短时间内恢复；关键信息进入 PC fallback。
- **已撤销**：玩家在 PC 主动断开设备或 token 过期，旧手机链接不可继续操作。

消息事件状态如下：

- **待投递**：PC 生成私密消息，尚未确认手机在线。
- **手机优先展示**：手机在线时先展示，PC 端只显示安全占位与 fallback 入口。
- **已读 / 已确认**：手机回传阅读或确认事件，PC 权威写入状态。
- **fallback 可见**：手机离线、超时或玩家手动请求后，PC 显示完整消息或可替代操作。
- **已归档**：消息进入日志或通讯记录，后续可在 PC 查看。

### 5.2 规则与公式

- PC 是唯一权威端。手机发送的是 typed event，例如 `phone.message.read`、`phone.call.answer`、`phone.choice.select`，不能直接写入完整状态。
- PC 对手机事件做状态校验：会话是否有效、设备是否匹配、消息是否仍可操作、选择是否仍在当前时间窗口内。
- PC 只向手机发送小型 typed events / deltas，例如新消息、通话状态、同步状态、连接提示，不发送完整 `GameState` dump。
- 手机端允许即时本地反馈：按钮按下、loading、临时已读状态都可先出现，但必须等 PC ack 后进入最终状态。
- 私密内容的 PC fallback 必须存在。建议默认策略是手机优先展示后延迟 10-30 秒在 PC 开放“查看备份”，或玩家点击“手机不可用，在 PC 查看”。
- 任何会影响任务成败、队员生死、永久资源损失的选择，都不得只存在于手机端。若设计上需要手机确认，PC 必须在超时后提供等价确认或自动安全处理。
- Yuan WSS 是稳定基线；Yuan WebRTC DataChannel 是机会性升级。即使 PC 和手机都设置 `enable_WebRTC: true`，也只有当双方通过 Yuan Host 获得彼此 `terminalInfo.enable_WebRTC`、有对端消息触发 offer/answer、且浏览器 ICE 候选连通时，后续消息才会优先走 DataChannel。
- 当前 UI 的“当前链路 / 局域网升级 / 公网兜底”是产品语义展示，不是实时读取 Yuan peer/tunnel metric 的诊断面板。判断是否真的走 DataChannel 需要 Yuan tunnel metric、调试日志或专门测试钩子。
- 心跳建议每 2-5 秒一次；超过 6-10 秒无响应进入“弱连接 / 重连中”；超过 20-30 秒进入“已断开并启用 fallback”。具体值应由实测调整。
- 配对 token 建议 2-5 分钟过期；已连接 session 可持续到玩家断开、PC 刷新、存档关闭或长时间无心跳。

### 5.3 参数与默认值

| 参数 | 建议值 | 说明 |
| --- | --- | --- |
| 手机本地点击反馈 | `<50ms` | 由本地 UI 立即响应，不等待网络。 |
| Yuan WSS 权威往返延迟目标 | 理想 `100-200ms` 内 | 用于消息、确认、来电，不支持高频动作玩法。 |
| WebRTC DataChannel 延迟目标 | 尽量低于 WSS | 仅作为机会性优化，不承诺一定成功。 |
| 心跳间隔 | `2-5 秒` | 平衡实时状态与电量 / 网络负担。 |
| 弱连接判定 | `6-10 秒` 无心跳 | UI 显示同步风险。 |
| 断开判定 | `20-30 秒` 无心跳 | PC 启用 fallback。 |
| 配对 token 过期 | `2-5 分钟` | 降低被旁观者复用的风险。 |
| 手机数量 | `1 台` | 单人双设备优先，避免 co-op 范围膨胀。 |
| 传输内容 | typed events / deltas | 不同步全量状态。 |

## 6. 系统交互（System Interactions）

- **依赖于**：通讯台 / 通话系统、事件系统、时间系统、单一 `GameState`、浏览器网络能力、HTTPS/WSS 部署、外部 Yuan Host。
- **被依赖于**：私密来电、队员短消息、紧急通讯提示、未来可能的解码任务、未来可能的本地协作模式。
- **共享对象 / 状态**：配对 session、设备连接状态、消息投递状态、通话状态、PC fallback 状态、同步延迟估计、最近一次 ack 时间。
- **事件 / 信号**：`pairing.created`、`phone.connected`、`phone.disconnected`、`phone.reconnecting`、`phone.message.delivered`、`phone.message.read`、`phone.call.incoming`、`phone.call.answered`、`phone.choice.selected`、`phone.fallback.enabled`。

PC 与手机不共享平等控制权。手机端每一次操作都进入 PC 的事件队列，由 PC 校验并广播结果。这样可以避免双端状态分裂，也能保持现有“所有页面共享同一个 `GameState`”的项目约束。

## 7. 关键场景（Key Scenarios）

### 7.1 典型场景

- **S1：扫码配对成功**：玩家在 PC 打开配对面板，手机扫码访问 session URL，PC 显示设备已连接，手机进入私人通讯终端。玩家无需账号、无需安装 app。
- **S2：手输码 fallback**：玩家手机相机不可用或不想授权相机，可在手机浏览器输入短链接与手输码进入同一 companion 页面。
- **S3：私密消息手机优先**：事件系统触发队员私密短讯，PC 将消息 delta 发给手机，手机立即显示提示，PC 仅显示安全占位；玩家在手机阅读后，PC 日志更新为已读。
- **S4：私密来电**：队员发起私人来电，手机显示接听界面并提供“接听 / 稍后 / 在 PC 处理”，PC 收到 ack 后进入对应通话分支。
- **S5：WebRTC 机会性升级**：Yuan WSS 完成配对、服务调用和 signaling；双方尝试 ICE；成功则后续消息可走 DataChannel，失败则继续 WSS。玩家只需要看到“标准连接 / 局域网升级”等简短状态。

### 7.2 边界 / 失败场景

- **F1：手机锁屏或切后台**：心跳丢失，PC 显示手机重连中，超时后 PC 显示“在 PC 查看私人通讯”入口，关键信息不丢。
- **F2：Yuan WSS 延迟过高**：PC 和手机显示同步指示变黄或提示“连接较慢”，手机仍有本地点击反馈，不进入高频操作或限时惩罚玩法。
- **F3：WebRTC 未升级**：ICE 不成功、网络阻断、没有持续对端消息、或 UI 未接入真实 tunnel metric 时，系统继续使用 WSS，玩家不需要理解 NAT、STUN、TURN 或局域网设置。
- **F4：陌生设备扫码加入**：token 已过期、房间已锁定或 PC 未批准，手机看到“会话不可用 / 等待主机批准”，PC 可撤销 session 并生成新码。
- **F5：PC 刷新或重启**：权威端中断，手机显示“基地控制台离线”，PC 恢复存档后可重新生成配对或恢复短期 session；手机不保存独立进度。
- **F6：玩家没有手机**：PC 不显示阻断性任务，所有私密通讯可在 PC 上通过 fallback 体验，游戏主线完整可玩。

## 8. 取舍与反模式（Design Trade-offs & Anti-patterns）

- **取舍 1**：选了“手机可选增强”而非“手机核心必需”，理由是可访问性和可靠性优先，双设备不应成为游玩门槛。
- **取舍 2**：选了“PC 权威主机”而非“双端共同持有状态”，理由是现有项目是单一前端状态模型，拆分权威会显著增加冲突、存档和测试风险。
- **取舍 3**：选了“浏览器 companion”而非“原生 app”，理由是免安装、扫码即用、跨平台最重要。
- **取舍 4**：选了“Yuan WSS baseline + WebRTC 机会性升级”而非“Bluetooth-first / LAN-only”，理由是 WSS 最稳且最易进入，WebRTC 可探索低延迟，但失败不能成为玩家要解决的问题。
- **取舍 5**：选了“小型 typed events / deltas”而非“全量状态同步”，理由是降低带宽、延迟、隐私和状态分裂风险，也让手机端职责保持清晰。
- **要避免的反模式**：为了证明手机有用而设计大量强制拿手机的操作。
- **要避免的反模式**：把手机端做成 PC UI 的缩小复制品。
- **要避免的反模式**：把低延迟误解为支持高频动作玩法；本系统只承诺通讯级低延迟，不承诺实时动作同步。
- **要避免的反模式**：让 WebRTC / LAN / Bluetooth 失败成为玩家要解决的技术问题。
- **要避免的反模式**：在公开直播或投屏时显示可被陌生人长期复用的房间码。

## 9. 参考与灵感（References & Inspiration）

- **Jackbox Games**：https://www.jackboxgames.com/how-to-play。借鉴点：主屏 + 手机浏览器控制器、扫码 / 房间码、低安装门槛。
- **Jackbox 加入说明**：https://support.jackboxgames.com/hc/en-us/articles/15794759479959-How-do-I-join-a-game。借鉴点：QR 与手输码并存，降低摄像头不可用时的进入成本。
- **Keep Talking and Nobody Explodes**：https://keeptalkinggame.com/。借鉴点：不同设备 / 不同视角提供信息不对称，但本案不采用强制协作压力。
- **Wii U GamePad**：https://www.nintendo.com/en-gb/Wii-U/Hardware-Features/Hardware-Features-660145.html。借鉴点：第二屏作为私密视角，而不是主屏复制。
- **PlayLink**：https://blog.playstation.com/2017/06/12/introducing-playlink-for-ps4。借鉴点：手机触摸、文字输入和轻量交互适合低门槛 companion。
- **MDN WebSocket API**：https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API。借鉴点：WSS baseline 的基础能力与兼容性。
- **MDN WebRTC DataChannel**：https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels。借鉴点：低延迟直连通道。
- **MDN Web Bluetooth API**：https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API。借鉴点：确认 Bluetooth 在浏览器端权限、兼容性和设备覆盖上不适合作默认入口。
- **Chrome WebTransport 文档**：https://developer.chrome.com/docs/capabilities/web-apis/webtransport。借鉴点：未来服务端低延迟传输优化候选。

## 10. Open Questions

- **Q1：Yuan tenant / room 映射**：当前倾向是单人双设备 session 映射到 Yuan host/tenant，但生产化前仍需核实 Yuan Host ED25519 multi-tenancy 的 `host_id` 行为。
- **Q2：首台手机授权策略**：PC 对第一台手机是自动锁定，还是必须点击批准？自动锁定更方便，主机批准更安全。
- **Q3：PC fallback 延迟**：私密消息的 PC fallback 默认延迟应是多少：立即可手动打开、10 秒后开放、还是 30 秒后开放？
- **Q4：WebRTC DataChannel 可观测性**：Yuan 已启用机会性 WebRTC 升级，但 Stellar UI 还没有接入真实 peer/tunnel metric。需要决定是读取 Yuan metrics、暴露 adapter state，还是只在测试 harness 中断言。
- **Q5：多手机 / 协作权限**：如果未来引入多手机 / 协作，是否仍保持“PC 单一权威 + 手机轻量终端”，还是需要新的身份与权限系统？

---

## 变更记录 / 来源策划案

| 日期 | 来源策划案 | 变更摘要 |
| --- | --- | --- |
| 2026-04-28 | docs/plans/2026-04-27-22-52/dual-device-play-design.md | 创建双设备游玩全量 wiki，合入 PC 权威、手机 companion、Yuan WSS baseline、WebRTC 机会性升级与 fallback 边界。 |
