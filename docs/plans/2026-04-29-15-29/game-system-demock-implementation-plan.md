---
topic: game-system-demock
date: 2026-04-29
status: draft
source:
  design: docs/plans/2026-04-29-15-29/game-system-demock-design.md
  technical_design: docs/plans/2026-04-29-15-29/game-system-demock-technical-design.md
  tasks: docs/plans/2026-04-29-15-29/game-system-demock-tasks.json
---

# 游戏系统去 mock 与去 legacy 重构 Implementation Plan

## 1. 目标

本计划把“游戏系统去 mock 与去 legacy 重构”策划案转化为可串行执行的开发任务。重构完成后，UI、content、runtime、editor、测试和正式文档应表达同一个当前事实：

- 队伍只包含 Mike、Amy、Garry。
- UI 不展示虚构世界状态、硬编码剧情句或假系统数值。
- content 不保留没有机制支撑的文本字段。
- 结构化事件是唯一事件内容系统。
- `crew_actions` 是唯一角色行动 runtime 事实源。
- 基础行动只包含移动、原地待命、停止当前行动、调查当前区域。
- 采集、修复、交易、使用诱饵和终局确认等动作由地点剧情事件提供。
- 当前事实代码、content、schema、tests 和正式 docs 不再保留 legacy 命名路径。

本轮不做旧存档兼容，不迁移 Lin Xia / Kael 剧情，不新增信号、天线、最近通讯或异常探测机制，也不实现完整 minimal use case 主线内容。

## 2. 技术方案摘要

### 2.1 事实源边界

运行时状态来自 `GameState` 与 event runtime，正式内容来自 `content/*.json`。UI 只能展示真实状态、正式内容资产，或中性 UI 说明。删除字段时同步删除 schema、类型、读取路径和测试，不通过空值或兼容 shim 保留旧形状。

### 2.2 行动 runtime

`crew_actions` 成为唯一行动事实源。旧 `CrewMember.activeAction` 不再作为真实状态保留。时间推进、移动、待命、停止、调查、objective completion 和 event trigger 都以 `CrewActionState` 为输入。页面通过 selector / view model 派生显示状态。

### 2.3 事件与剧情动作

通话选项背后的行动命令进入事件图。每个角色同一时间只能被一个阻塞型主事件或主行动占用；非阻塞背景事件可以并存，但本轮不扩展复杂并行玩法。

基础行动收缩为四类控制动作。剧情推进所需的采集、修复、交易、学习、使用道具和终局确认，都写成地点或剧情事件的专属选项与结果。

### 2.4 Legacy 删除

本轮删除所有 legacy 命名路径，包括：

- `content/events/events.json`
- legacy event schema 与 loader
- editor `legacy_event`
- `legacy.<verb>` dispatch
- `deriveLegacyTiles`
- `legacyResource` / `legacyBuilding` / `legacyInstrument` / `legacyDanger`

如果某处删除后页面信息变少，使用中性空状态，不补虚构世界状态。

## 3. T001 审计清单

本清单把关键词审计结果固化为后续实现任务的检查项。它只标记删除边界，不引入兼容 shim，也不要求在 T001 修改业务逻辑。

审计关键词：

- 结构与 legacy：`legacy`、`events.json`、`deriveLegacyTiles`、`legacyResource`、`legacyBuilding`、`legacyInstrument`、`legacyDanger`。
- 旧角色与无机制字段：`lin_xia`、`kael`、`summary`。
- mock 世界状态词：`最近一次通讯`、`最近通讯`、`天线`、`信号噪声`、`脚步声`、`未知回声`、`演示`、`mock`、`频道`、`噪声`、`固定求救`、`求救`、`唱片机`、`异常数量`、`设施状态`。

当前事实审计范围：

- `content/`：清理 crew 中的 Lin Xia、Kael 和 `summary`；删除 legacy event 入口、旧角色 event domain、legacy map 字段、通用行动中的 `legacy.*` 引用；同步 schema、manifest 和 content README。
- `apps/pc-client/` runtime：清理 `contentData`、`gameData`、`App`、`crewSystem`、`callActionSettlement`、`mapSystem`、`content/mapObjects`、`conditions/callActionContext`、`events/*` 中的 legacy loader、legacy dispatch、旧行动状态、旧地图投影和旧角色引用。
- `apps/pc-client/` UI：清理 `CommunicationStation`、`ControlCenter`、`CallPage`、`MapPage`、`CrewDetail` 中的虚构信号、天线、最近通讯、脚步声、异常数量、唱片机、固定求救等静态世界状态。保留页面标签、正式 content、真实 runtime 状态和中性空状态。
- `apps/mobile-client/`：清理 `MobileTerminalApp` 中的演示型世界状态和固定剧情求救；保留真实配对、连接、消息和私密来电状态。
- `apps/editor/`：删除 `legacy_event` 类型、Event Browser 的旧格式只读展示、helper 返回的 legacy asset 分支，以及 editor README 中的 `events.json` 当前能力说明。
- `packages/dual-device/`：只审计是否残留 mock 世界状态词；除非任务明确改 shared transport 类型，否则不修改传输逻辑。
- `scripts/` 与 app scripts：删除 validate-content 中的 legacy event schema pair；更新对应脚本测试。
- 生成产物：在删除 event manifest domain 后重新生成 `apps/pc-client/src/content/generated/eventContentManifest.ts`，确保不再 import 被删除 domain。
- 测试：同步 `*.test.*`、`tests/e2e/*`、editor 测试、mobile 测试和 content 校验测试；旧断言应改为当前事实，不用 skip、兼容 fallback 或同义 legacy 概念绕过。
- 正式 docs：同步 `AGENTS.md`、`README.md`、`docs/game_model/*.md`、`docs/gameplay/*/*.md`、`docs/ui-designs/**/*.md`。不修改 `docs/core-ideas.md`，除非先获得人类确认。

历史设计输入与允许例外：

- `docs/plans/2026-04-29-15-29/*` 是本轮设计、调研、访谈、技术方案、任务和进度材料，允许描述本轮要删除的对象。
- `docs/plans/**` 中更早轮次的研究、设计、任务、备份和 merge diff 也是历史材料，不作为当前事实审计对象；如果它们被正式 docs 索引当作当前事实引用，后续任务应改正式 docs 的引用关系，而不是改写历史记录。
- `docs/ui-designs/pencil-pages/*.pen` 是 Pencil 设计源。如后续需要审计或修改其内容，必须通过 Pencil MCP 工具读取和写入；T001 不直接改 `.pen` 文件。
- 依赖 lockfile、Rush 配置、第三方包名或测试工具名中的 `mock`、`legacy` 等词不等同于游戏事实残留。最终审计时应记录为工具链命中或无关命中。

后续任务处理规则：

- 删除字段时同步删 schema、TypeScript 类型、运行时读取、UI 展示和测试断言。
- 删除文件时同步删 import、manifest、校验脚本、生成产物和文档当前事实引用。
- 如果关键词用于描述“禁止项”或“已删除项”，它只能出现在本轮 plan 或任务总结中；当前事实代码、content、schema、UI、测试和正式 docs 不应保留这些描述。
- 不把旧概念改名为新字段继续保存；缺少真实机制时使用中性空状态。

## 4. 任务顺序

任务详情见 `game-system-demock-tasks.json`。数组顺序就是后续串行执行顺序。

1. **T001 固化去 mock 与去 legacy 审计清单**：先列清删除范围和允许例外，避免后续任务反复判断边界。
2. **T002 三人化 crew content、schema 与类型**：删除旧角色和 `crew.summary` 字段，建立三人基础事实。
3. **T003 删除旧角色相关结构化事件资产**：清理 Kael domain、旧角色事件引用和生成模块。
4. **T004 三人化地图、初始状态与测试 fixture**：删除地图、fixture 和 e2e 中的旧角色位置与断言。
5. **T005 删除 legacy event 内容入口**：移除 `events.json`、legacy schema、legacy loader 和校验入口。
6. **T006 删除 editor legacy event 展示**：editor 只浏览结构化事件资产。
7. **T007 建立 crew_actions 派生视图模型**：为删除 `activeAction` 建立 UI 读取层。
8. **T008 强化阻塞与单主行动约束**：统一角色主行动和阻塞事件占用规则。
9. **T009 迁移时间推进到 crew_actions**：让行动完成、清理和 trigger 基于 `CrewActionState`。
10. **T010 迁移移动行动到 crew_actions**：移动创建、推进、抵达和地图发现都走新 runtime。
11. **T011 迁移停止与待命行动到事件 runtime**：停止和待命不再依赖旧 settlement。
12. **T012 迁移调查当前区域到地点事件入口**：调查进入结构化事件或中性空状态。
13. **T013 重构基础行动 content 与 schema**：`universal-actions` 只保留四类基础行动，删除 `legacy.*`。
14. **T014 删除 legacy dispatch 与旧行动入口**：删除 translator 和旧通话按钮入口。
15. **T015 建立地点剧情动作事件样例**：用少量结构化事件证明专属剧情动作路径。
16. **T016 删除地图 legacy content 字段与 schema**：从 map content 和 schema 删除 legacy 投影字段。
17. **T017 删除 deriveLegacyTiles 与旧 MapTile 投影**：地图 UI 改读对象、特殊状态和 runtime map state。
18. **T018 清理 PC UI mock 文案**：通讯台、控制中心、通话页、地图页只保留真实状态或中性说明。
19. **T019 清理 mobile UI mock 文案**：手机端只展示真实连接、配对和中性空状态。
20. **T020 更新正式项目文档**：同步 `AGENTS.md`、game model、gameplay 和 UI docs。
21. **T021 全仓关键词审计与生成产物同步**：处理禁止关键词残留和 manifest 漂移。
22. **T022 集成验证与收口**：运行全量验证并修复跨任务集成问题。

这个顺序先删除内容源头，再统一 runtime，随后迁移基础行动、地图和 UI，最后更新 docs 与审计。每个任务都应在自己的影响范围内保持仓库可验证。

## 5. 验证要求

后续每个开发任务必须按影响范围运行验证：

- 修改 `content/`：运行 `npm run validate:content`。
- 修改 `apps/pc-client/src`、`apps/mobile-client/src`、`apps/editor/src`、`apps/editor/helper` 或 `packages/dual-device/src`：运行 `npm run lint` 和 `npm run test`。
- 修改端到端流程：视情况运行 `npm run test:e2e`。

最终收口任务必须至少运行：

- `npm run validate:content`
- `npm run lint`
- `npm run test`

如果没有运行 `npm run test:e2e`，实现总结必须说明原因。

## 6. 主要风险

- **行动 runtime 重写范围大**：通过 T007-T014 分阶段迁移，先建派生视图和约束，再迁移时间推进、移动、待命、调查和 dispatch。
- **结构化事件内容不足**：基础行动之外的动作只通过地点事件出现；T015 先做最小样例证明路径，不把整条主线塞入本轮。
- **删除地图 legacy 投影后页面变空**：地图页面改展示对象、特殊状态和中性空状态，不补假资源或假危险。
- **docs 与代码不同步**：T020 和 T021 把正式文档更新、关键词审计和生成产物同步作为独立收口工作。
- **旧存档或旧测试依赖被误保留**：本轮明确不做兼容，失败的旧断言应改为当前事实，而不是加 fallback。

## 7. 输出文件

- `docs/plans/2026-04-29-15-29/game-system-demock-technical-design.md`
- `docs/plans/2026-04-29-15-29/game-system-demock-tasks.json`
- `docs/plans/2026-04-29-15-29/game-system-demock-implementation-plan.md`

完成本计划后，不自动进入实现阶段。后续需要明确指令再按 `game-system-demock-tasks.json` 串行派发开发任务。
