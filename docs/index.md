---
title: Stellar Frontier 设计文档索引
last_synced: 2026-04-29
maintained_by: audit-wiki
---

<!--
本文件由 audit-wiki skill 自动重新生成。
请不要手工修改本文件；下一次 audit-wiki 运行时，手工改动会被覆盖。
如果想新增内容，请改写对应的子系统 wiki 或 core-ideas.md。
-->

# Stellar Frontier 设计文档索引

本页是 `stellar-frontier` 项目所有设计文档的入口。**当前实现状态**与**未实现的设计意图**会在表格中区分标注。

## 1. 整体游戏（whole-game）

| 文档 | 一句话概述 | 最近更新 |
| --- | --- | --- |
| [核心理念](./core-ideas.md) | 简短说明通讯调度、只读地图、时间代价、队员人格化和低保真控制台等全局原则。 | 2026-04-27 |

## 2. 子系统（system）

| 文档 | 一句话概述 | 最近更新 | 状态 |
| --- | --- | --- | --- |
| [通讯台 Gameplay](./gameplay/communication-table/communication-table.md) | 通讯台 gameplay 是玩家与队员、地图、行动和事件系统之间的主要指令入口。 | 2026-04-28 | 已实现 |
| [队员系统](./gameplay/crew/crew.md) | 队员系统负责管理队员作为行动执行者与真实伙伴的双重身份。 | 2026-04-27 | 已实现 |
| [双设备游玩](./gameplay/dual-device-play/dual-device-play.md) | 双设备游玩让手机成为可选私人通讯终端，PC 保持唯一权威，Yuan WSS 提供基线连接，WebRTC DataChannel 作为机会性升级。 | 2026-04-28 | 已实现（DataChannel 可观测性待补） |
| [事件系统](./gameplay/event-system/event-system.md) | 事件系统负责把队员行动、地块状态、时间推进和玩家通话选择转化为可验证、可推进、可结算的世界反馈。 | 2026-04-28 | 已实现 |
| [可配置地图系统](./gameplay/map-system/map-system.md) | 地图系统是玩家通过雷达 / 地图理解星球现场态势的基础系统，由可配置尺寸的网格地图构成。 | 2026-04-28 | 已实现 |
| [时间系统](./gameplay/time-system/time-system.md) | 时间系统是所有队员行动、资源产出、通讯事件和地图状态变化的基础系统。 | *（缺字段：frontmatter.last_updated）* | 已实现 |

> 索引页缺口：`docs/gameplay/time-system/time-system.md` 当前缺少标准 wiki frontmatter，后续应由 `organize-wiki` 按 wiki 模板补齐。

## 3. UI 与设计原则

| 文档 | 一句话概述 |
| --- | --- |
| [UI 设计总览](./ui-designs/ui.md) | 汇总游戏原型中的主要 UI 模块，把草图整理成可开发、可验证的 PRD 式说明。 |
| [UI 设计原则](./ui-designs/ui-design-principles.md) | 约束游戏 UI 原型的低保真控制台美学与系统组织方式。 |
| 页面 PRD | [控制中心](./ui-designs/pages/控制中心.md) ⋅ [通讯台](./ui-designs/pages/通讯台.md) ⋅ [通话](./ui-designs/pages/通话.md) ⋅ [地图](./ui-designs/pages/地图.md) |

## 4. 计划与策划案

进行中或已完成的策划案见 [`./plans/`](./plans/)，按 `YYYY-MM-DD-HH-MM` 子目录组织。最近的 audit 报告见 [`./plans/audits/`](./plans/audits/)。

| 类别 | 路径 | 维护方 |
| --- | --- | --- |
| Brainstorm 策划案 | `docs/plans/<YYYY-MM-DD-HH-MM>/<topic>-design.md` | `game-design-brainstorm` |
| Wiki 合入 diff | `docs/plans/<YYYY-MM-DD-HH-MM>/wiki-merge-diff.md` | `organize-wiki` |
| 一致性 audit 报告 | `docs/plans/audits/<YYYY-MM-DD-HH-MM>/audit-report.md` | `audit-wiki` |

## 5. 数据模型（game_model）

`docs/game_model/` 承载代码层数据契约：TypeScript 类型、运行时状态、JSON schema 边界和跨系统读写边界。它与 `docs/gameplay/` 平级互补，前者回答“数据怎么组织”，后者回答“玩法为什么这样运作”。

| 文档 | 一句话概述 |
| --- | --- |
| [Crew 模型](./game_model/crew.md) | 描述队员内容配置、运行时队员状态，以及地图、行动、事件、物品、日记和时间系统如何读取队员。 |
| [事件模型](./game_model/event.md) | 描述事件核心模型，包含资产库、静态事件定义、事件图、节点、runtime event/call/objective、condition/effect、handler、生命周期和校验。 |
| [事件集成状态边界](./game_model/event-integration.md) | 描述事件系统会读写的外部 game model 边界，包括队员、行动、地块、物品、资源、历史、世界标记和存档。 |
| [地图模型](./game_model/map.md) | 描述静态地图配置、地图块层级、运行时地图状态、发现 / 调查状态、坐标转换和调查报告。 |
| [通话行动模型](./game_model/call-action.md) | 描述普通通话中的行动定义、按钮生成和行动结算数据契约。 |
| [事件程序模型与玩家旅程模型索引](./game_model/event-program-model-player-journey.md) | 兼容旧引用的索引页，指向事件核心模型与事件集成状态边界。 |

## 6. 系统耦合关系

```mermaid
flowchart LR
    coreIdeas["核心理念"] -->|"高层原则"| crewSystem["队员系统"]
    coreIdeas -->|"高层原则"| communicationTable["通讯台 Gameplay"]
    coreIdeas -->|"高层原则"| eventSystem["事件系统"]
    coreIdeas -->|"高层原则"| mapSystem["可配置地图系统"]
    coreIdeas -->|"高层原则"| timeSystem["时间系统"]
    coreIdeas -->|"高层原则"| dualDevice["双设备游玩"]
    timeSystem -->|"行动耗时/倒计时"| crewSystem
    timeSystem -->|"触发与结算时点"| eventSystem
    mapSystem -->|"地块/可见性"| crewSystem
    mapSystem -->|"地块对象/candidateActions"| communicationTable
    mapSystem -->|"tile_state"| eventSystem
    communicationTable -->|"真实行动/通话选择"| crewSystem
    communicationTable -->|"arrival/action_complete/idle_time/call_choice"| eventSystem
    crewSystem -->|"位置/状态/属性"| eventSystem
    communicationTable -->|"通话指令/对象行动"| crewSystem
    communicationTable -->|"事实信号/来电入口"| eventSystem
    eventSystem -->|"来电/结果反馈"| communicationTable
    eventSystem -->|"紧急状态/行动请求"| crewSystem
    eventSystem -->|"私密来电/消息"| dualDevice
    dualDevice -->|"typed events / ack"| eventSystem
    dualDevice -->|"PC fallback"| crewSystem
```

边的来源：每个 wiki 章节 6「系统交互」中的「依赖于 / 被依赖于 / 事件 / 信号」字段，以及 `docs/game_model/event-integration.md` 中的事件集成状态边界。旧格式文档缺 frontmatter 时，边仍可作为临时索引信息保留。

## 7. 设计文档体系约定

- **brainstorm**（产生策划案）：用 `game-design-brainstorm` skill；产物落 `docs/plans/<YYYY-MM-DD-HH-MM>/`
- **organize-wiki**（合入全量 wiki）：用 `organize-wiki` skill；目标是 `core-ideas.md`、`gameplay/<system>/<system>.md` 或 `game_model/<topic>.md`
- **audit-wiki**（审计 + 维护索引 + 同步项目根）：用 `audit-wiki` skill；产物落 `docs/plans/audits/<YYYY-MM-DD-HH-MM>/`

详细职责见 [`../AGENTS.md`](../AGENTS.md)。
