# Wiki Template（全量游戏设计 wiki / 中文）

本模板用于 `organize-wiki` skill 的 Step 4，作为目标 wiki 文件的章节骨架。

## 使用约束

- **当前态描述**：所有正文用「这个系统是 ...」「玩家会 ...」之类的当前态语气；**严禁**出现「本轮 / 本次 / 本版本 / MVP / Later」之类的版本性措辞——那些属于策划案，不属于 wiki。
- **章节顺序固定**：必须严格按下面的 10 个章节顺序排列；新章节追加到 Open Questions 之前。
- **末尾保留「变更记录 / 来源策划案」段**：由 organize-wiki 自动维护，不要手工覆盖。
- **章节可以为空**：如果某章节当前没有内容，保留章节标题与一行 `*（暂无）*`，不要省略章节。
- **scope 字段决定文件位置**：
  - `whole-game` → `docs/core-ideas.md`
  - `system` → `docs/gameplay/<system>/<system>.md`
  - `feature` → 按 `target_wiki` 字段决定

## frontmatter 字段定义

| 字段 | 含义 | 取值 |
| --- | --- | --- |
| `title` | wiki 标题 | 中文标题 |
| `scope` | wiki 类型 | `whole-game` \| `system` \| `feature` |
| `last_updated` | 最近一次 organize-wiki 整理日期 | `YYYY-MM-DD` |
| `maintained_by` | 维护者标签 | `organize-wiki`（恒定） |

## 与策划案的字段映射规则

由 `organize-wiki` skill 的 Step 4 应用：

| 策划案章节 | wiki 章节 | 处理方式 |
| --- | --- | --- |
| 1 概述 | 1 概述 | 替换 / 合并 |
| 2 设计意图 | 2 设计意图 | 替换 / 合并 |
| 3 核心概念与术语 | 3 核心概念与术语 | 增量合并（保留旧术语，添加新术语；冲突询问） |
| 4 核心循环与玩家体验 | 4 核心循环与玩家体验 | 替换 / 合并 |
| 5 机制与规则 | 5 机制与规则 | 替换 / 合并 |
| 6 系统交互 | 6 系统交互 | 增量合并 |
| 7 关键场景 | 7 关键场景 | 增量合并 |
| 8 取舍与反模式 | 8 取舍与反模式 | 增量合并 |
| 9 参考与灵感 | 9 参考与灵感 | 增量合并 |
| **10 本轮范围与阶段拆分** | **不进 wiki** | 跳过 |
| **11 本轮验收与风险** | **不进 wiki** | 跳过 |
| 12 Open Questions | 10 Open Questions | 增量合并（已解决的删除，新的追加） |

详细的 diff / 冲突 / 写入协议见 [`merge-protocol.md`](./merge-protocol.md)。

## 模板正文

```markdown
---
title: <wiki 中文标题，例如「时间系统」或「Stellar Frontier 核心理念」>
scope: system
last_updated: <YYYY-MM-DD>
maintained_by: organize-wiki
---

<!--
本文件由 organize-wiki skill 维护。
请不要直接手工修改本文件；改动应当通过：
1. 用 game-design-brainstorm skill 写一份新的策划案
2. 用 organize-wiki skill 把策划案合入本文件
-->

# <wiki 标题>

## 1. 概述（What & Why）
<!-- 一句话定义这个系统 / 概念是什么，在游戏整体中扮演什么角色。
     用当前态语气，不提"本轮"。 -->

## 2. 设计意图（Design Intent）
<!-- 想给玩家带来什么体验 / 情绪 / 张力。恒定的设计目标。 -->

## 3. 核心概念与术语（Core Concepts & Terminology）
<!-- 关键对象、状态、名词定义。后续章节使用的术语都在这里登记。 -->
- **<术语 1>**：<定义>
- **<术语 2>**：<定义>

## 4. 核心循环与玩家体验（Core Loop & Player Experience）
<!-- 玩家如何感知、玩家旅程、典型情境。 -->

### 4.1 玩家旅程
1.

### 4.2 典型情境
- **高光时刻**：
- **低谷 / 摩擦点**：

## 5. 机制与规则（Mechanics & Rules）
<!-- 完整的当前态机制、规则、参数。 -->

### 5.1 状态与状态机

### 5.2 规则与公式

### 5.3 参数与默认值

## 6. 系统交互（System Interactions）
<!-- 输入 / 输出 / 与其他系统的耦合。 -->
- **依赖于**：
- **被依赖于**：
- **共享对象 / 状态**：
- **事件 / 信号**：

## 7. 关键场景（Key Scenarios）

### 7.1 典型场景
- **S1**：
- **S2**：

### 7.2 边界 / 失败场景
- **F1**：
- **F2**：

## 8. 取舍与反模式（Design Trade-offs & Anti-patterns）
- **取舍 1**：选了 <X> 而非 <Y>，理由：<...>
- **要避免的反模式**：

## 9. 参考与灵感（References & Inspiration）
- **<游戏 / 资料>**：<URL>。借鉴点：<...>

## 10. Open Questions
<!-- 仍未决的问题，未来 brainstorm 时处理。已经被新策划案解决的应当被删除。 -->
- **Q1**：

---

## 变更记录 / 来源策划案

<!-- 由 organize-wiki skill 自动维护。每次 merge 追加一行。 -->

| 日期 | 来源策划案 | 变更摘要 |
| --- | --- | --- |
| <YYYY-MM-DD> | docs/plans/<YYYY-MM-DD-HH-MM>/<topic>-design.md | <一句话摘要> |
```

## 范例

例如，第一次为时间系统建 wiki 后，文件可能长成：

```markdown
---
title: 时间系统
scope: system
last_updated: 2026-04-26
maintained_by: organize-wiki
---

# 时间系统

## 1. 概述
时间系统决定了玩家在星球基地上每个回合内"白天 / 夜晚 / 暴风雪"等环境状态的更替节奏，是事件触发与队员行为可用性的基础时序框架。

...

---

## 变更记录 / 来源策划案

| 日期 | 来源策划案 | 变更摘要 |
| --- | --- | --- |
| 2026-04-26 | docs/plans/2026-04-26-16-00/time-system-design.md | 新增时间系统初稿（包含 4 段昼夜模型、3 类天气事件、与事件系统的 2 个交互接口） |
```
