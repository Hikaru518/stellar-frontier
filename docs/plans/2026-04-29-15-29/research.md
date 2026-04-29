---
topic: 游戏系统去 mock 与去 legacy 重构
date: 2026-04-29
research_scope:
  codebase: true
  internet: false
source:
  - initial
  - research_topics
---

# 1. Research Summary

本轮研究确认了一个核心问题：当前原型把真实运行时模型、内容资产、演示文本和兼容投影混在同一层 UI 中。用户要求删除 mock 文本、缩减角色、清理 legacy 内容，本质上是在重新划定“游戏已经实现什么”的表达边界。后续设计应优先定义可展示信息的来源：运行时状态来自 `GameState`，内容文本来自 `content/*.json`，UI 只承担标签、空状态和操作说明，不再用硬编码剧情句暗示尚未实现的机制。

项目已有约束支持这次清理。`AGENTS.md` 明确规定 `content/` 是运行时内容数据，设计意图写入 `docs/`，队员、事件、物品、地图配置不应新增到代码硬编码数组。用户“不保留 legacy”的诉求也与“不要为了兼容性留下多余内容”一致，但当前代码仍保留多处兼容层，因此设计阶段需要先决定删除范围，而不是直接把所有带 `legacy` 的字段等同处理。

# 2. Project Findings

## Existing Patterns

项目采用内容驱动的游戏资产模式。`content/crew/crew.json` 定义队员档案，`content/events/` 定义事件资产，`content/maps/default-map.json` 定义地图内容；`apps/pc-client/src/content/contentData.ts` 负责装载内容并导出给客户端使用。这一模式说明，角色简介、事件台词、地图对象和初始内容应从 content 层进入运行时，而不是散落在页面组件里。

UI 层仍存在明显的原型展示文本。`apps/pc-client/src/pages/CommunicationStation.tsx` 写死了“频道 A-17 / 信号噪声 38% / 当前仅允许一条通话事件”、“天线：偏移 2.1° / 校准建议：忽略”、“Amy / 森林 / 非常不礼貌的求救”等句子。这些文本没有绑定可验证的 `GameState` 字段，会让玩家误以为信号噪声、天线偏移、最近通讯和森林求救都是系统能力。私人终端 fallback 也写死了 Amy 的叙事台词，进一步模糊了“真实来电”和“演示文案”的边界。

## Domain Knowledge

地图模型存在事实源与兼容投影的分层。`docs/game_model/map.md` 说明 `GameState.map` 是地图事实源，`deriveLegacyTiles` 派生的 `MapTile` 只是兼容投影。`apps/pc-client/src/mapSystem.ts` 仍从配置和 `RuntimeMapState` 填充 `resources`、`buildings`、`instruments`、`danger` 等 legacy 字段；`content/maps/default-map.json`、`content/schemas/maps.schema.json`、`content/schemas/map-objects.schema.json` 也保留 `legacyResource`、`legacyBuilding`、`legacyInstrument`、`legacyDanger`。因此，地图 legacy 不是单个文件问题，而是模型叙述、schema、content 和 UI 读法共同形成的旧边界。

事件系统的 legacy 边界更复杂。`apps/pc-client/src/content/contentData.ts` 同时装载结构化事件和 `content/events/events.json`，`apps/pc-client/scripts/validate-content.mjs` 的 `legacyPairs` 仍校验 legacy event schema。`apps/editor/README.md` 把 `content/events/events.json` 定义为 legacy readonly；`apps/editor/src/event-editor/types.ts` 也保留 `legacy_event`。这些事实说明，legacy event 已被产品化为编辑器只读展示的一部分，而不只是运行时残留。

## Recent Changes

最近提交显示项目刚经历地图对象、行动系统、事件编辑器和双设备文档的整理：`d8d6620 feat: 重构地图对象与行动系统 (#23)`、`dcf7c5f Feature/event editor (#22)`、`f9ca37b docs: 同步 Yuan 双设备文档 (#20)`。这些改动提高了内容结构化程度，也留下了迁移期兼容层。当前重构应把“迁移期兼容”视为需要被设计确认的债务，而不是默认保留。

## Technical Constraints

三人化会影响内容、运行时类型、生成清单、测试和文档。`content/crew/crew.json` 仍包含 `lin_xia`、`kael`；`content/events/manifest.json`、`content/events/definitions/crew_kael.json`、`content/events/call_templates/crew_kael.json` 绑定 Kael；`content/events/definitions/desert.json`、`mountain.json`、`mainline_medical.json` 引用 Lin Xia 或 Kael。`apps/pc-client/src/data/gameData.ts` 的 `CrewId`、`initialTiles`，以及多处测试 fixtures 也写入二者。`AGENTS.md`、`docs/game_model/crew.md`、`docs/game_model/event.md`、`docs/gameplay/event-system/event-system.md` 仍把五人团队当成当前事实。

# 4. Trade-offs Analysis

严格删除 mock 文案能提高模型可信度。玩家只会看到系统真实计算或 content 明确定义的内容，不会把占位文本误读为机制承诺。代价是早期页面可能显得更空、更工具化，需要设计清楚“空状态”和“未接入”如何表达。

删除 legacy 内容能降低后续设计负担。事件、地图、编辑器和测试可以围绕当前结构化模型收敛，不再为旧资产解释例外。代价是需要接受一次内容资产断裂：`events.json`、legacy schema、legacy dispatch 和只读展示可能同步消失，相关历史样例也要改写或删除。

角色从五人缩到三人能让原型聚焦 Mike、Amy、Garry 的核心循环。代价是现有地图区域、事件样例和文档例子会失去引用对象。设计上应决定这些内容是整体删除，还是改写为三人版本；如果改写，需要避免把 Lin Xia、Kael 的个人剧情简单替换成其他角色名。

# 5. Key References

## Project Files

- `AGENTS.md`
- `docs/game_model/map.md`
- `docs/game_model/crew.md`
- `docs/game_model/event.md`
- `docs/gameplay/event-system/event-system.md`
- `apps/pc-client/src/pages/CommunicationStation.tsx`
- `apps/pc-client/src/data/gameData.ts`
- `apps/pc-client/src/mapSystem.ts`
- `apps/pc-client/src/content/contentData.ts`
- `apps/pc-client/src/eventSystem.ts`
- `apps/pc-client/scripts/validate-content.mjs`
- `apps/editor/README.md`
- `apps/editor/src/event-editor/types.ts`
- `content/crew/crew.json`
- `content/events/events.json`
- `content/events/manifest.json`
- `content/events/definitions/crew_kael.json`
- `content/events/call_templates/crew_kael.json`
- `content/maps/default-map.json`
- `content/schemas/maps.schema.json`
- `content/schemas/map-objects.schema.json`

## External Links

无，本轮跳过互联网研究。

# 6. Open Questions for Design

1. 去 mock 的边界是什么？是否只删除硬编码剧情句和假机制暗示，保留纯 UI 标签、空状态、调试说明和无叙事占位符？
2. `content/crew/crew.json` 中的 `summary`、日记、专长效果的 `customLogText` 是否都允许展示？它们属于真实内容资产，还是也需要等待事件系统驱动后再展示？
3. `content/events/events.json`、`apps/pc-client/src/eventSystem.ts`、legacy schema、legacy readonly editor 展示应全部删除，还是分阶段从运行时、编辑器、校验脚本中移除？
4. 地图 legacy 投影是否纳入本轮去 legacy？如果纳入，`legacyResource`、`legacyBuilding`、`legacyInstrument`、`legacyDanger` 是否都应从 content 和 schema 视角消失？
5. `crew_kael`、Lin Xia、Kael 相关事件、地图格子、测试 fixture 和文档例子应删除还是重写为 Mike、Amy、Garry 的三人版本？
6. 私人终端 fallback 文案应如何处理？它是连接状态说明、真实私密来电内容，还是临时演示剧情？
7. “实时连接演示”是产品功能说明，还是原型演示标签？如果保留，它需要绑定真实 Yuan / WebRTC 状态，而不是固定 preview 数据。

# Research Completed / Next Step

Research Completed。本轮已汇总项目内证据，并确认互联网研究跳过。

Next Step：进入 Step 4 设计访谈，先确认去 mock、去 legacy、三人化和私人终端文案的设计边界，再撰写本轮 design 文档。
