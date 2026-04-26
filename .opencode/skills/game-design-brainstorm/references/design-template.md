# Design Template（游戏策划案 / 中文）

本模板用于在 `game-design-brainstorm` skill 的 Step 5 里**逐段填充**策划案文档。每次只填一个 section（或其子节），先展示给用户确认，确认后才写入 `docs/plans/YYYY-MM-DD-HH-MM/<topic>-design.md`。

## 使用约束

- **逐段确认**：不要一次性把整份策划案写完。每段写完先 review，确认后再下一段。
- **段落长度**：简单问题 2-6 行即可；复杂问题控制在 200-300 字。
- **N/A 允许**：明显不适用的章节（例如纯叙事类策划案没有"机制与规则"）允许标 N/A，但要写一句话说明为什么不适用。
- **写给陌生读者**：策划案要完全自包含——一个不熟悉本项目的策划 / 工程师 / LLM 只读这份策划案就能理解要做什么、为什么做、怎么做。
- **章节 1-9 是设计内容，10-12 是本轮过程视角**：1-9 的用词应当是当前态描述（"这个系统是 ..." 而非 "本轮要把它变成 ..."），方便后续 organize-wiki skill 抽取并合入 wiki；10-12 的用词聚焦本轮（"本轮 MVP" / "本轮风险" / "本轮未决"）。

## frontmatter 字段定义

| 字段 | 含义 | 取值 |
| --- | --- | --- |
| `topic` | 短横线小写主题名 | 例如 `time-system`、`crew-call-event` |
| `date` | brainstorm 起始日 | `YYYY-MM-DD` |
| `status` | 当前状态 | `draft` \| `approved` \| `merged` |
| `scope` | 策划范围 | `whole-game` \| `system` \| `feature` |
| `source.initial` | 来源 initial.md | 完整相对路径 |
| `source.research` | 来源 research.md（可选） | 完整相对路径 |
| `source.interview` | 来源 interview.md | 完整相对路径 |
| `target_wiki` | 预期合入的 wiki 路径（可选） | 例如 `docs/gameplay/time-system/time-system.md` |
| `merged_into` | merge 后填入（organize-wiki 写） | 实际合入的 wiki 路径 |
| `merged_at` | merge 时间（organize-wiki 写） | ISO datetime |

## 模板正文

```markdown
---
topic: <短横线小写主题名>
date: <YYYY-MM-DD>
status: draft
scope: system
source:
  initial: docs/plans/<YYYY-MM-DD-HH-MM>/initial.md
  research: docs/plans/<YYYY-MM-DD-HH-MM>/research.md
  interview: docs/plans/<YYYY-MM-DD-HH-MM>/<topic>-interview.md
target_wiki: docs/gameplay/<system>/<system>.md
---

# <策划案标题>

## 1. 概述（What & Why）
<!-- 一句话定义这个系统 / 概念是什么，在游戏整体中扮演什么角色。
     如果是对已有系统的迭代，这里仍然描述「整个系统是什么」，而不是「这次改了什么」。 -->

## 2. 设计意图（Design Intent）
<!-- 想给玩家带来什么体验 / 情绪 / 张力。
     这是恒定的设计目标，不是版本目标。
     建议覆盖：核心情绪、目标体验、想避免的体验。 -->

## 3. 核心概念与术语（Core Concepts & Terminology）
<!-- 系统内的关键对象、状态、名词定义。
     用 bullet 列表，每条 1-2 行。后续章节使用的术语都要在这里定义。 -->
- **<术语 1>**：<定义>
- **<术语 2>**：<定义>

## 4. 核心循环与玩家体验（Core Loop & Player Experience）
<!-- 玩家如何感知这个系统、如何与之互动。
     描述 5-10 步的玩家旅程：玩家动作 → 系统响应 → 玩家感知。
     如有典型情境（高峰、低谷），分别描述。 -->

### 4.1 玩家旅程
1.
2.
3.

### 4.2 典型情境（可选）
- **高光时刻**：
- **低谷 / 摩擦点**：

## 5. 机制与规则（Mechanics & Rules）
<!-- 详细玩法规则、参数、状态机、公式。
     这是策划案最"硬"的部分：能让程序员直接据此实现。
     如有数值，给出参考值与上下限。 -->

### 5.1 状态与状态机
<!-- 如有 -->

### 5.2 规则与公式
<!-- 如有 -->

### 5.3 参数与默认值
<!-- 表格或 bullet -->

## 6. 系统交互（System Interactions）
<!-- 这个系统的输入 / 输出 / 与其他游戏系统的耦合方式。
     列出依赖、被依赖、共享数据、事件订阅。 -->

- **依赖于**：
- **被依赖于**：
- **共享对象 / 状态**：
- **事件 / 信号**：

## 7. 关键场景（Key Scenarios）
<!-- 典型场景 + 边界 / 失败场景。每条用「触发条件 → 关键动作 → 期望结果」格式。 -->

### 7.1 典型场景
- **S1**：触发 → 动作 → 结果
- **S2**：

### 7.2 边界 / 失败场景
- **F1**：什么时候算异常？玩家看到什么？如何恢复？
- **F2**：

## 8. 取舍与反模式（Design Trade-offs & Anti-patterns）
<!-- 故意做 / 故意不做的设计选择，需要避免的反模式。
     用「我们选了 X 而不是 Y，因为 ...」的格式。 -->

- **取舍 1**：选了 <X> 而非 <Y>，理由：<...>
- **取舍 2**：
- **要避免的反模式**：

## 9. 参考与灵感（References & Inspiration）
<!-- 借鉴的游戏、文献、链接。每条注明灵感点。 -->

- **<游戏 / 资料 1>**：<URL>。借鉴点：<...>
- **<游戏 / 资料 2>**：

---

<!-- 以下章节 10-12 是「本轮过程视角」，organize-wiki 会跳过这部分，不进 wiki。 -->

## 10. 本轮范围与阶段拆分（Scope & Phasing for This Round）

### 10.1 MVP（本轮必做）
<!-- 用 bullet 列出本轮一定要落地的能力。每条要可验证。 -->
-

### 10.2 Later（未来再做，明确本轮不做）
<!-- 同样 bullet。这些会以 Open Questions 或下一轮 brainstorm 处理。 -->
-

### 10.3 不做（Out of Scope，避免范围膨胀）
<!-- 容易被误以为属于本轮但实际不属于的事情。明确拒绝。 -->
-

## 11. 本轮验收与风险（Acceptance & Risks）

### 11.1 Player Stories / Play Scenarios（验收切片）
<!-- 每条 story 描述玩家可观察、可验证的行为。 -->

#### PS-001: <标题>
- **作为**：<玩家角色 / 处境>
- **我能**：<动作 / 体验>
- **以便**：<带来的价值 / 情绪>
- **验收标准**：
  - [ ]
  - [ ]
- **不包含**（防止隐含需求）：
- **优先级**：P0 | P1 | P2

#### PS-002: <标题>
...

### 11.2 成功标准（Success Criteria）
<!-- 具体、可观察的判断依据。优先用 checkbox。 -->
- [ ]
- [ ]

### 11.3 风险与缓解（Risks & Mitigations）
- **R1**：<风险描述>
  - **缓解**：<...>
- **R2**：

## 12. Open Questions
<!-- 当前未决问题。明确指出哪些需要在实施时复议、哪些会在下一轮 brainstorm 处理。
     organize-wiki 会把这一节合并进 wiki 的「Open Questions」章节。 -->
- **Q1**：
- **Q2**：
```

## 与 wiki 模板的字段映射

`organize-wiki` skill 在 merge 时按下面的规则把策划案章节映射到 wiki 章节（详见 `organize-wiki/references/merge-protocol.md`）：

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
