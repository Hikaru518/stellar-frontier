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

## 3. 任务顺序

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

## 4. 验证要求

后续每个开发任务必须按影响范围运行验证：

- 修改 `content/`：运行 `npm run validate:content`。
- 修改 `apps/pc-client/src`、`apps/mobile-client/src`、`apps/editor/src`、`apps/editor/helper` 或 `packages/dual-device/src`：运行 `npm run lint` 和 `npm run test`。
- 修改端到端流程：视情况运行 `npm run test:e2e`。

最终收口任务必须至少运行：

- `npm run validate:content`
- `npm run lint`
- `npm run test`

如果没有运行 `npm run test:e2e`，实现总结必须说明原因。

## 5. 主要风险

- **行动 runtime 重写范围大**：通过 T007-T014 分阶段迁移，先建派生视图和约束，再迁移时间推进、移动、待命、调查和 dispatch。
- **结构化事件内容不足**：基础行动之外的动作只通过地点事件出现；T015 先做最小样例证明路径，不把整条主线塞入本轮。
- **删除地图 legacy 投影后页面变空**：地图页面改展示对象、特殊状态和中性空状态，不补假资源或假危险。
- **docs 与代码不同步**：T020 和 T021 把正式文档更新、关键词审计和生成产物同步作为独立收口工作。
- **旧存档或旧测试依赖被误保留**：本轮明确不做兼容，失败的旧断言应改为当前事实，而不是加 fallback。

## 6. 输出文件

- `docs/plans/2026-04-29-15-29/game-system-demock-technical-design.md`
- `docs/plans/2026-04-29-15-29/game-system-demock-tasks.json`
- `docs/plans/2026-04-29-15-29/game-system-demock-implementation-plan.md`

完成本计划后，不自动进入实现阶段。后续需要明确指令再按 `game-system-demock-tasks.json` 串行派发开发任务。
