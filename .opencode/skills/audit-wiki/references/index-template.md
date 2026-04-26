# Index Template（docs/index.md 模板 / 中文）

本文件由 `audit-wiki` skill 的 Step 5.1 引用，作为 `docs/index.md` 重新生成的章节骨架。

## 使用约束

- **完全可重生成**：`docs/index.md` 不应包含手工写入的内容；每次 `audit-wiki` 运行都会全量重写。如果用户想加自定义内容，应该写到 `core-ideas.md` 或对应子系统 wiki 中。
- **来源是 frontmatter**：所有 wiki 条目的字段都从对应 wiki 文件的 frontmatter 与章节 1「概述」抽取，**不**在 index 中编造内容。
- **缺字段不补**：wiki frontmatter 缺字段时，对应单元格写 `*（缺字段）*` 并把该 wiki 加进 `audit-report.md` 的「索引页缺口」段。
- **scope 分组排序**：先 `whole-game` → 再 `system`（按子目录字典序）→ 再 `feature`（按路径字典序）。
- **耦合关系图可选**：如果所有 wiki 章节 6 都为空，跳过 mermaid 图章节；不要画一个空图。

## frontmatter 字段

`docs/index.md` 自身的 frontmatter：

| 字段 | 含义 | 取值 |
| --- | --- | --- |
| `title` | 索引页标题 | 「Stellar Frontier 设计文档索引」 |
| `last_synced` | 最近一次 audit-wiki 重生成日期 | `YYYY-MM-DD` |
| `maintained_by` | 维护者标签 | `audit-wiki`（恒定） |

## 模板正文

```markdown
---
title: Stellar Frontier 设计文档索引
last_synced: <YYYY-MM-DD>
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
| [核心理念](./core-ideas.md) | <来自 core-ideas.md 章节 1「概述」一句话> | <last_updated> |

## 2. 子系统（system）

| 文档 | 一句话概述 | 最近更新 | 状态 |
| --- | --- | --- | --- |
| [<title>](./gameplay/<system>/<system>.md) | <来自 wiki 章节 1 一句话> | <last_updated> | <see §状态标记> |

## 3. UI 与设计原则

| 文档 | 一句话概述 |
| --- | --- |
| [UI 设计总览](./ui-designs/ui.md) | <一句话> |
| [UI 设计原则](./ui-designs/ui-design-principles.md) | <一句话> |
| 页面 PRD | [控制中心](./ui-designs/pages/控制中心.md) ⋅ [通讯台](./ui-designs/pages/通讯台.md) ⋅ [通话](./ui-designs/pages/通话.md) ⋅ [地图](./ui-designs/pages/地图.md) |

## 4. 计划与策划案

进行中或已完成的策划案见 [`./plans/`](./plans/)，按 `YYYY-MM-DD-HH-MM` 子目录组织。最近的 audit 报告见 [`./plans/audits/`](./plans/audits/)。

| 类别 | 路径 | 维护方 |
| --- | --- | --- |
| Brainstorm 策划案 | `docs/plans/<YYYY-MM-DD-HH-MM>/<topic>-design.md` | `game-design-brainstorm` |
| Wiki 合入 diff | `docs/plans/<YYYY-MM-DD-HH-MM>/wiki-merge-diff.md` | `organize-wiki` |
| 一致性 audit 报告 | `docs/plans/audits/<YYYY-MM-DD-HH-MM>/audit-report.md` | `audit-wiki` |

## 5. 系统耦合关系
<!-- 仅在至少一个子系统 wiki 章节 6 非空时才生成；否则整段省略 -->

```mermaid
flowchart LR
    <system-A>[<title-A>] -->|<event/shared-state>| <system-B>[<title-B>]
    <system-B> --> <system-C>[<title-C>]
```

边的来源：每个 wiki 章节 6「系统交互」中的「依赖于 / 被依赖于 / 事件 / 信号」字段。同一条边在双方 wiki 都列出时合并为一条；只在单边列出时**仍然画**但加上单向标记。

## 6. 设计文档体系约定

- **brainstorm**（产生策划案）：用 `game-design-brainstorm` skill；产物落 `docs/plans/<YYYY-MM-DD-HH-MM>/`
- **organize-wiki**（合入全量 wiki）：用 `organize-wiki` skill；目标是 `core-ideas.md` 或 `gameplay/<system>/<system>.md`
- **audit-wiki**（审计 + 维护索引 + 同步项目根）：用 `audit-wiki` skill；产物落 `docs/plans/audits/<YYYY-MM-DD-HH-MM>/`

详细职责见 [`../AGENTS.md`](../AGENTS.md)。
```

## 状态标记

子系统 wiki 表格的「状态」列由 `audit-wiki` 在 Step 3 一致性矩阵之后自动判定：

| 标记 | 判定条件 |
| --- | --- |
| `已实现` | 至少有一个 src 文件覆盖了该子系统的核心 type / function |
| `部分实现` | wiki 列出的核心机制中，部分在 src 中有对应代码、部分没有 |
| `仅设计` | wiki 存在但 src 中没有任何对应实现（典型：刚 organize-wiki 完，代码尚未跟上） |
| `已废弃` | wiki frontmatter 显式标 `status: deprecated`（未来字段，目前不强求） |

判定细则：

- 「核心 type / function」由 wiki 章节 3「核心概念与术语」与章节 5「机制与规则」中的命名词决定
- 命名词在 src 中以 `type` / `interface` / `enum` / `const` / 函数名出现即视为有对应代码
- 灰色地带由 `audit-wiki` 在 Step 4 询问用户

## 范例

例如，当时间系统 wiki 已成形、其他子系统仅有空目录时，`docs/index.md` 表格大致长成：

```markdown
## 2. 子系统（system）

| 文档 | 一句话概述 | 最近更新 | 状态 |
| --- | --- | --- | --- |
| [时间系统](./gameplay/time-system/time-system.md) | 决定昼夜与天气节奏，是事件触发与队员行为可用性的时序框架。 | 2026-04-26 | 已实现 |
| [事件系统](./gameplay/event-system/event-system.md) | *（缺字段：尚无 wiki 文件）* | — | 仅设计 |
| [队员系统](./gameplay/crew/crew.md) | *（缺字段：尚无 wiki 文件）* | — | 已实现 |
```

## 反模式（不要做的事）

- ❌ 在 index 中重写 wiki 内容：index 只链接与摘要，不复述
- ❌ 在 index 中加 wiki 没有的设计：发现需要新内容时升级到 brainstorm
- ❌ 把 plans/ 子目录全部列进 index：链接到 `plans/` 入口即可，子目录由用户自行浏览
- ❌ 维护手工的目录树：用 mermaid 而非 ascii 树，便于一致性审计后自动重画
