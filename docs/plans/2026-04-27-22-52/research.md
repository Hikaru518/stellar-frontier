---
topic: dual-device-play
date: 2026-04-27
research_scope:
  codebase: true
  internet: true
source:
  initial: docs/plans/2026-04-27-22-52/initial.md
  research_topics: docs/plans/2026-04-27-22-52/research-topics.md
---

# Research: dual-device-play

## 1. Research Summary（研究摘要）

本次研究评估“电脑 + 手机同时游玩”是否适合 Stellar Frontier，以及最小可行形态应落在哪里。结论是：题材与现有 core loop 强匹配，但技术上不是小改动。游戏已经把玩家定位为通过低保真控制台、通讯台、通话、地图、资源和日志理解远征，而非直接操控角色；真实手机可自然成为游戏内“便携通讯器 / field terminal”。

关键决策方向：PC 端应保持权威主机与基地控制台，手机端不复制完整 UI，而承担可选但有意义的通讯确认、私密情报、应急反馈或队员端信号界面。MVP 应优先验证配对、低延迟反馈、断线恢复与单一 GameState，而不是追求复杂传感器、原生 app 或多手机派对规模。

## 2. Project Findings（项目内发现，未做项目内调研则跳过本节）

### 2.1 已有玩法系统（Existing Gameplay Systems）
- **通讯指令链**：移动、调查、采集、建设、撤离和紧急选项都应通过通讯台 / 通话发出，手机端最适合作为通讯链的延伸而非地图直接操作入口（证据：`docs/core-ideas.md:25-26`、`AGENTS.md:91-93`）。
- **单一时间与状态**：游戏时间在 UI、通话、紧急事件中继续推进，但关闭游戏后停止；所有页面共享同一个 `GameState`（证据：`docs/gameplay/time-system/time-system.md:13-19`、`docs/gameplay/event-system/event-system.md:27`、`AGENTS.md:93`）。

### 2.2 现存叙事设定与角色（Existing Narrative & Crew）
- **远征调度幻想**：玩家通过通讯、日志和远征回传理解世界，真实手机可强化“手里拿着一台船外通讯设备”的 fiction（来源：`docs/core-ideas.md:19-31`、`docs/gameplay/crew/crew.md`）。

### 2.3 现存 UI 设计（Existing UI Design）
- **通讯台 / 通话**：通讯台管理队员位置、行动、来电与紧急事件；通话承载决策，适合加入“手机确认 / 手机回传”的交互（来源：`docs/ui-designs/pages/通讯台.md`、`docs/ui-designs/pages/通话.md`）。
- **控制中心 / 地图**：控制中心可把配对包装成实体模块；地图保持只读，避免手机变成绕过通讯原则的遥控器（来源：`docs/ui-designs/pages/控制中心.md`、`docs/ui-designs/pages/地图.md`）。

### 2.4 设计原则（Design Principles）
- **从已有对象生长**：新功能应长在通讯台、任务、事件、求救、情报等已有对象上，而不是新增独立 meta 系统（来源：`docs/ui-designs/ui-design-principles.md:25-34`）。

### 2.5 最近 commits（Recent Changes）
- **59166b8 / 0843c40 / 5c4344c**：近期扩展了可配置地图与事件引擎，说明后续二屏事件可接入数据驱动流程，但也应避免在架构未稳定时扩大状态同步面。

### 2.6 项目约束（Project Constraints）
- **前端单机假设**：当前是浏览器 SPA，状态在前端并通过 `localStorage` 持久化，无后端；手机-PC 同步意味着新增 relay / pairing / 会话恢复等架构（来源：`AGENTS.md:89`、`README.md:149`）。
- **权威状态不可分裂**：两设备必须共享一个权威状态；手机不能拥有独立时间线或隐藏可冲突状态（来源：`AGENTS.md:93`）。

## 3. Best Practice Findings（互联网发现，未做互联网调研则跳过本节）

### 3.1 参考游戏作品（Reference Games）
- **Jackbox**：浏览器控制器 + 房间码 / QR，低安装成本、主机持有一份游戏即可。借鉴点：扫码 + 手输码并存，加入流程极简。参考：https://www.jackboxgames.com/how-to-play
- **Keep Talking and Nobody Explodes**：强制信息不对称，不同端看到不同知识。借鉴点：手机端应提供 PC 没有的私密信号或确认，而不是重复按钮。参考：https://keeptalkinggame.com/
- **Wii U GamePad**：强调第二视角和“别人看不到的信息”。借鉴点：手机端可承载私密队员回传、干扰画面或短时窗口。参考：https://www.nintendo.com/en-gb/Wii-U/Hardware-Features/Hardware-Features-660145.html
- **PlayLink**：用手机触摸、滑动、拖拽、文字输入等低门槛输入扩展主机游戏。借鉴点：优先使用所有手机都有的浏览器输入，不依赖摄像头、麦克风、蓝牙。参考：https://blog.playstation.com/2017/06/12/introducing-playlink-for-ps4

### 3.2 玩法模式与设计惯例（Patterns & Conventions）
- **QR + manual code**：扫码最快，手输码兜底；不要求 app-store 安装可显著降低进入门槛。参考：https://support.jackboxgames.com/hc/en-us/articles/15794759479959-How-do-I-join-a-game
- **WebSocket relay first**：WebSocket 兼容性和实现复杂度最适合 MVP；WebRTC DataChannel 延迟可更低但需要 signaling 与 STUN/TURN；Web Bluetooth 覆盖不足，不适合作默认方案。参考：https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API

### 3.3 已知陷阱（Known Pitfalls）
- **断线与手机休眠**：手机切后台、锁屏、网络切换会中断关键选择；紧急倒计时必须有 PC fallback 或明确的“信号失败”可读反馈。参考：https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API
- **未授权加入**：房间码 / QR 会引入陌生设备接入风险，需要短码过期、主机确认或会话锁定。参考：https://www.jackboxgames.com/how-to-play-party-pack-nine-remotely/

### 3.4 SOTA / 新趋势（可选）
- **WebTransport / WebRTC**：可作为后续低延迟方向，但对 MVP 来说部署、兼容和调试成本高于收益。参考：https://developer.chrome.com/docs/capabilities/web-apis/webtransport

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：手机作为核心必需设备 vs 手机作为可选增强设备
- **核心必需设备的优势**：沉浸感更强，能设计真正的 asymmetric play。
- **可选增强设备的优势**：更符合当前单机 SPA 基础，断线时不阻断主流程，测试和可访问性压力更低。
- **建议**：MVP 选择“可选但有独特信息价值”；关键行动必须能在 PC 端安全 fallback。

### Trade-off 2：局域网 / WebRTC 直连 vs WebSocket relay
- **直连的优势**：潜在延迟低，更符合“同一房间两设备”的直觉。
- **WebSocket relay 的优势**：跨网络更稳，扫码房间模型成熟，实现和调试更可控。
- **建议**：策划案先按 WebSocket relay 设计体验；若未来实测延迟不足，再评估 WebRTC DataChannel。

### Trade-off 3：手机下达完整指令 vs 手机确认通讯片段
- **完整指令的优势**：手机存在感强。
- **通讯片段的优势**：不破坏地图只读与通讯指令链，也更贴合“field terminal”定位。
- **建议**：手机只处理确认、私密情报、短输入和信号反馈；正式行动仍由通讯台 / 通话结算。

## 5. Key References（关键参考）

### 5.1 项目文件（Project Files）
- `docs/core-ideas.md` — 通讯、远征调度与低保真控制台核心原则。
- `AGENTS.md` — 当前技术约束、指令通道与单一 GameState 约定。
- `docs/gameplay/time-system/time-system.md` — 时间推进与关闭游戏停止规则。
- `docs/ui-designs/pages/通讯台.md` — 手机端最自然的系统接入点。
- `docs/ui-designs/pages/通话.md` — 决策与紧急选项承载页面。
- `docs/ui-designs/ui-design-principles.md` — 新功能从既有对象生长的 UI 原则。

### 5.2 外部链接（External Links）
- https://www.jackboxgames.com/how-to-play — 浏览器控制器与房间加入模式。
- https://support.jackboxgames.com/hc/en-us/articles/15794759479959-How-do-I-join-a-game — 房间码 / QR 加入说明。
- https://keeptalkinggame.com/ — 信息不对称协作玩法参考。
- https://www.nintendo.com/en-gb/Wii-U/Hardware-Features/Hardware-Features-660145.html — 第二屏私密视角参考。
- https://blog.playstation.com/2017/06/12/introducing-playlink-for-ps4 — 手机低门槛输入参考。
- https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API — WebSocket 能力与约束。
- https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Using_data_channels — WebRTC DataChannel 参考。
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API — Web Bluetooth 兼容性风险。
- https://developer.chrome.com/docs/capabilities/web-apis/webtransport — WebTransport 后续可能性。

## 6. Open Questions for Design
- **Q1**：手机端在 MVP 中最该承载哪一种独特体验：私密情报、紧急确认、队员语音/文本回传，还是短输入解码？
- **Q2**：断线时应完全 fallback 到 PC，还是把“信号中断”做成可读但不惩罚玩家的剧情状态？
- **Q3**：是否接受 MVP 需要一个轻量 relay 服务，还是必须维持纯本地 / 无后端架构？

---

**Research Completed:** 2026-04-27 22:52  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
