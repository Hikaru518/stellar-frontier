# Research Template（研究报告 / 中文）

本模板用于 `game-design-brainstorm` skill 的 Step 3，由一个 `@general` subagent 整合「项目内调研」与「互联网调研」的发现，最终产出 `docs/plans/YYYY-MM-DD-HH-MM/research.md`。

## 使用说明

- **目标**：为后续访谈与策划案提供决策支持，**不是**做全面综述
- **原则**：聚焦决策、可溯源、突出冲突、轻量（500–1500 字为宜）
- **输入**：
  - explore subagent 的 Project Findings（如启用项目内调研）
  - general subagent 的 Best Practice Findings（如启用互联网调研）
- **输出**：结构化的研究报告，作为访谈阶段的输入

## 模板正文

```markdown
---
topic: <短横线小写主题名>
date: <YYYY-MM-DD>
research_scope:
  codebase: true      # 是否做了项目内调研
  internet: true      # 是否做了互联网调研
source:
  initial: docs/plans/<YYYY-MM-DD-HH-MM>/initial.md
  research_topics: docs/plans/<YYYY-MM-DD-HH-MM>/research-topics.md
---

# Research: <topic>

## 1. Research Summary（研究摘要）
<!-- 1-3 段：为什么做这次研究？关键发现是什么？对策划案有什么影响？ -->

## 2. Project Findings（项目内发现，未做项目内调研则跳过本节）

### 2.1 已有玩法系统（Existing Gameplay Systems）
<!-- 项目里已实现的玩法系统、机制、流程。每条附文件 / 路径作为证据。 -->
- **<系统名>**：<简述>（证据：`docs/gameplay/<system>/`、`src/...`）

### 2.2 现存叙事设定与角色（Existing Narrative & Crew）
<!-- 已设定的世界观、角色、事件等。 -->
- **<设定 / 角色名>**：<简述>（来源：`docs/core-ideas.md`、`docs/gameplay/crew/`）

### 2.3 现存 UI 设计（Existing UI Design）
<!-- 与本次主题相关的页面、交互、信息密度约束。 -->
- **<页面 / 交互>**：<简述>（来源：`docs/ui-designs/...`）

### 2.4 设计原则（Design Principles）
<!-- 已经成文的设计原则、风格、节奏要求。 -->
- **<原则>**：<简述>（来源：`docs/ui-designs/ui-design-principles.md`）

### 2.5 最近 commits（Recent Changes）
<!-- 与主题相关的最近改动。 -->
- **<commit hash 或 PR>**：<简述>

### 2.6 项目约束（Project Constraints）
<!-- 来自代码、技术栈、性能、平台的硬约束。 -->
- **<约束>**：<简述>

## 3. Best Practice Findings（互联网发现，未做互联网调研则跳过本节）

### 3.1 参考游戏作品（Reference Games）
<!-- 业界相似机制 / 系统的代表作。每条 1-2 行摘要 + 借鉴点 + 原始链接。 -->
- **<游戏名>**：<玩法 / 系统简述>。借鉴点：<...>。参考：<URL>

### 3.2 玩法模式与设计惯例（Patterns & Conventions）
<!-- 类型 / 玩法的常见模式。 -->
- **<模式>**：<简述>。参考：<URL>

### 3.3 已知陷阱（Known Pitfalls）
<!-- 别的游戏在类似设计上踩过的坑、玩家社群反馈的问题。 -->
- **<陷阱>**：<简述>。参考：<URL>

### 3.4 SOTA / 新趋势（可选）
<!-- 最新的设计探索（如成熟度足够）。 -->
- **<趋势>**：<简述>。参考：<URL>

## 4. Trade-offs Analysis（权衡分析）
<!-- 综合项目约束与最佳实践，列出 2-3 个核心取舍点。 -->

### Trade-off 1：<选项 A> vs <选项 B>
- **A 的优势**：
- **B 的优势**：
- **建议**：<在什么条件下选哪个？>

### Trade-off 2：<选项 C> vs <选项 D>
- **C 的优势**：
- **D 的优势**：
- **建议**：

## 5. Key References（关键参考）

### 5.1 项目文件（Project Files）
- `path/to/file1.ext` — <简短说明>
- `path/to/file2.ext` — <简短说明>

### 5.2 外部链接（External Links）
- <URL> — <简短说明>
- <URL> — <简短说明>

## 6. Open Questions for Design
<!-- 研究后仍未解决、需要在访谈阶段与用户澄清的问题。 -->
- **Q1**：
- **Q2**：

---

**Research Completed:** <YYYY-MM-DD HH:MM>  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
```

## 写作要点

- **可溯源**：项目内发现的每条都要附 `path` 或 commit hash；互联网发现的每条都要附原始 URL
- **突出冲突**：项目现状与外部惯例不一致的地方要明确标注，因为这些通常是访谈阶段最值得讨论的点
- **不确定就标注**：参考链接不可访问、信息存疑时，明确写 `(unverified)` 而不是凭印象写
- **语言中文，术语保留英文**：游戏设计常见术语（core loop、player fantasy、roguelike progression、tradeoff 等）保留英文以避免歧义
