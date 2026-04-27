---
name: audit-wiki
description: "对全量游戏设计 wiki 做一致性审计：(1) 把 docs/ 内的所有 wiki（core-ideas、gameplay/<system>/*、ui-designs/）与 src/ 当前代码实现交叉比对，发现矛盾后与用户澄清并修正；(2) 重新生成 docs/index.md 索引页，并审计 docs/core-ideas.md 与子系统 wiki 的一致性；(3) 同步更新项目级 AGENTS.md 与 README.md，使其反映当前文档体系与代码实现。在策划案合并完成、阶段性代码改动落地、或长期未审计后调用。"
---

# audit-wiki

## 概述

本 skill 负责把**全量 wiki**、**当前 src 代码**、**项目级上下文**（`AGENTS.md` / `README.md`）三者**对齐**，并维护 `docs/index.md` 索引页。

**核心边界**：

- **只审计与对齐，不发明**：与 `organize-wiki` 一样，本 skill 不引入策划案 / wiki / 代码中都没有的设计决策。
- **不动 `src/` 代码**：发现 wiki↔code 矛盾时，最多在本轮结果摘要中记录为「待代码处理」，或经用户确认后修改 wiki；本 skill 不会修改任何 `.ts` / `.tsx` / `.css` 文件。
- **与 `organize-wiki` 互补**：`organize-wiki` 处理「策划案 → wiki」的合入；本 skill 处理「wiki ↔ code」「wiki ↔ wiki」「项目根上下文 ↔ 当前文档体系」的对齐。
- **冲突先问**：每一处矛盾都用 question tool 提问，不要静默改写 wiki。
- **不产生审计工作区**：本 skill 不在仓库中创建临时审计目录、审计报告文件或备份目录；扫描摘要、findings、决议与待处理项保留在当前对话和最终回复中。

## 何时调用

- 一份策划案刚通过 `organize-wiki` 合入 wiki，且对应代码也已实施完毕
- 一段较大的 src 改动落地，担心 wiki 与代码出现漂移
- 长期未审计、文档体系出现增量后，需要重生成 `docs/index.md`
- 想确认 `AGENTS.md` / `README.md` 仍准确反映当前项目状态

## 流程图

```mermaid
flowchart TD
    startNode([用户调用 audit-wiki]) --> step1[Step1 确认范围与扫描清单]
    step1 --> step2[Step2 并行扫描 wiki / code / 项目根]
    step2 --> wikiSub[explore: wiki 扫描]
    step2 --> codeSub[explore: code 扫描]
    step2 --> rootSub[explore: AGENTS.md / README.md 扫描]
    wikiSub --> joinScan[汇合]
    codeSub --> joinScan
    rootSub --> joinScan
    joinScan --> step3[Step3 计算对话内一致性矩阵]
    step3 --> hasFinding{有矛盾或缺口?}
    hasFinding -- "是" --> step4[Step4 冲突澄清 + 应用修正]
    hasFinding -- "否" --> step5
    step4 --> step5[Step5 维护 docs/index.md + 审计 core-ideas.md]
    step5 --> step6[Step6 同步 AGENTS.md + README.md]
    step6 --> doneNode([完成 等用户指令])
```

## 强制工作流程

进入本 skill 后**立即**用 todowrite 工具按下面的 Step 1-6 创建任务列表，并按顺序逐项推进。

### Step 1: 确认范围与扫描清单

1. **用 question tool 让用户选审计范围**：
   ```
   问题：本轮 audit 的范围？
   选项 A：全量审计（扫描所有 wiki + 全部 src + AGENTS.md + README.md）
   选项 B：局部审计（只针对某个子系统 wiki，例如 docs/gameplay/time-system/）
   选项 C：仅维护项目级上下文（跳过 wiki 与 code 的交叉比对，只重建 index.md / 同步 AGENTS.md / README.md）
   ```
2. **在当前对话中记录范围选择**：包含选择、一句话理由、涉及的 wiki / src / 项目根路径列表；不要把范围记录写入仓库。
3. **罗列待审计文件清单**：
   - 待审计 wiki：`docs/core-ideas.md`、`docs/gameplay/<system>/<system>.md`（递归）、`docs/ui-designs/*.md`
   - 待审计代码：`src/**/*.ts`、`src/**/*.tsx`（按 Step 1.1 的范围裁剪）
   - 待审计项目根：`AGENTS.md`、`README.md`、`opencode.json`
4. **编辑前先读取目标文件**：任何改写都必须基于最新文件内容；不要为 audit 另建仓库内临时文件。

### Step 2: 并行扫描三类素材

并行 dispatch 三个 `@explore` subagent（详细扫描指引见 [`references/audit-protocol.md`](./references/audit-protocol.md) §1）：

- **Wiki 扫描 subagent**：读取 Step 1.3 罗列的所有 wiki 文件，提取每个文件的：
  - frontmatter（`title` / `scope` / `last_updated` / `maintained_by`）
  - 章节 1-2 的「概述 / 设计意图」一句话摘要
  - 章节 3 的关键术语列表
  - 章节 5「机制与规则」中的具体数值、参数、状态名、规则
  - 章节 6「系统交互」中的依赖、被依赖、共享对象、事件
  - 章节 10 的 Open Questions
- **Code 扫描 subagent**：读取 Step 1.3 罗列的所有 src 文件，提取：
  - 每个 system file（`timeSystem.ts` / `eventSystem.ts` / `crewSystem.ts` / `diarySystem.ts`）公开的 type / enum / constant / 关键函数与默认值
  - 页面层（`pages/*.tsx`）的状态字段、行动选项、用户可见的术语
  - 数据层（`data/gameData.ts`）的初始数据结构
  - 类型定义中的常量与上下限（如有）
- **项目根扫描 subagent**：读取 `AGENTS.md` / `README.md` / `opencode.json`，提取：
  - `AGENTS.md` 当前规则
  - `README.md` 的功能概览、目录结构、设计文档入口列表
  - `opencode.json` 的 schema / 配置摘要

三个 subagent 的产出由本 skill 在当前对话上下文中保留，后续 Step 3 基于这些原始事实做对比。不要把扫描摘要写入仓库。

### Step 3: 计算对话内一致性矩阵

基于 Step 2 的扫描事实计算四类一致性问题（详见 [`references/audit-protocol.md`](./references/audit-protocol.md) §3）：

- **类别 A：wiki ↔ wiki**：不同 wiki 文件之间的术语 / 数值 / 规则矛盾，或同一 wiki 内章节自相矛盾
- **类别 B：wiki ↔ code**：wiki 描述的状态机 / 参数 / 流程与 src 当前实现不一致
- **类别 C：wiki ↔ design principles**：与 `docs/ui-designs/ui-design-principles.md` 或 `docs/core-ideas.md` 的设计意图抵触
- **类别 D：缺口（gaps）**：代码已有但 wiki 完全没写、或 wiki 已有但代码完全没实现

每条 finding 包含：

- ID（`A-1` / `B-3` / ...）
- 涉及的文件与片段（wiki 路径 + 行号或章节 / code 路径 + 行号）
- 矛盾摘要（一句话）
- 建议处理方式（采用 wiki / 采用 code / 留待代码处理 / 升级为 Open Question）

findings 保留在当前对话中，并在最终回复里汇总；不要生成仓库内报告文件。

如果四类全部为零，跳过 Step 4，直接进入 Step 5。

### Step 4: 冲突澄清 + 应用修正

#### 4.1 冲突澄清访谈

按 ID 顺序**逐项**用 question tool 提问，每条 finding 单独问一次：

```
问题：[<finding ID>] [<wiki 章节路径>] <矛盾摘要>

wiki 现状：
> <wiki 原文片段>

代码 / 其他 wiki 现状：
> <对比方原文片段>

请选择：
选项 A：采用 wiki，记录待代码处理项（不改代码，最终回复中列出）
选项 B：采用代码 / 另一份 wiki，本次修改本 wiki 让其与之对齐
选项 C：均不准确，升级为 Open Question 写进相关 wiki 章节 10
选项 D：合并双方（用户输入新表述）
选项 E：跳过本条，留在「待整理」缓冲区
```

每个决议保留在当前对话中，并在最终回复的「冲突决议」段列出。

类别 D（缺口）的提问形式略有不同，常见两类：

- **代码已有但 wiki 没写**：选 A=补 wiki / 选 B=升级为 Open Question / 选 C=跳过
- **wiki 已有但代码没实现**：选 A=保持 wiki 但加「未实现」标记 / 选 B=记待代码处理 / 选 C=从 wiki 删除 / 选 D=升级为 Open Question

#### 4.2 应用修正

对每个被决议要修改的 wiki 文件：

1. **先读取目标文件当前内容**，确认没有未处理的用户改动。
2. **改写**：严格按决议改写，**不引入决议之外的内容**。改写时遵循 `organize-wiki/references/wiki-template.md` 的章节结构与去阶段化措辞规则。
3. **末尾追加变更记录行**：在被修改 wiki 的「变更记录 / 来源策划案」表末尾追加一行，来源使用概括性说明，不引用临时审计文件：
   ```
   | <YYYY-MM-DD> | audit-wiki 一致性审计 | audit 修正：<一句话摘要> |
   ```
4. **更新 frontmatter**：`last_updated: <YYYY-MM-DD>`。

对类别 A 选项「记待代码处理」的 finding，把待办保留到最终回复的「待代码处理」段；**不要**主动写到 `docs/todo.md`，那是设计 / 文档体系级 TODO，二者不混。

### Step 5: 维护 docs/index.md 与 core-ideas.md 引用

#### 5.1 重新生成 docs/index.md

1. 读取现有 `docs/index.md`，确认它可被重生成覆盖。
2. 基于 Step 2 wiki 扫描结果，按 [`references/index-template.md`](./references/index-template.md) 重新生成完整的 `docs/index.md`：
   - 每个 wiki 一行（标题 / scope / last_updated / 一句话概述 / 路径链接）
   - 按 scope 分组（`whole-game` → `system` → `feature`）
   - 末尾追加「系统耦合关系图」：用 mermaid 从各 wiki 章节 6「系统交互」的「依赖于 / 被依赖于」自动汇总
3. 如果某 wiki 缺 frontmatter 字段或概述章节，**不要**在 index 里编造；标 `*（缺字段，待 organize-wiki 补全）*`，并在最终回复的「索引页缺口」段记录。

#### 5.2 审计 docs/core-ideas.md

`docs/core-ideas.md` 是全局核心想法与设计原则的简短指导页：它说明这个游戏最稳定的高层方向，例如通讯调度、只读地图、时间代价、队员人格化、事件反馈、内容与文档分离等原则。它不是完整玩法总览，也不替代各子系统 wiki。

**特殊规则**：`core-ideas.md` 不使用 `organize-wiki/references/wiki-template.md` 的 10 章骨架。审计时不要把它改写成普通子系统 wiki，也不要要求它补齐「核心循环 / 机制规则 / 系统交互 / 关键场景」等标准章节。

1. 读取 core-ideas.md 当前内容。
2. 检查：
   - core-ideas.md 中提到的核心理念是否被所有子系统 wiki 体现
   - core-ideas.md 是否引用了已不存在 / 名称已变更的子系统
   - core-ideas.md 是否存在与子系统 wiki 矛盾的高层描述（这通常是类别 A 矛盾，应已在 Step 3-4 处理）
   - core-ideas.md 是否仍保持“简短指导页”定位，未变成重复子系统 wiki 的长篇规则汇总
   - core-ideas.md 是否误用了普通子系统 wiki 的 10 章结构；如果误用，应在用户确认后收缩为短小原则页
3. **任何对 core-ideas.md 的更新都必须先获得人类确认**。仅当用户在 Step 4 已明确确认要修订 core-ideas.md 时，才在本步动手；**不主动**为 core-ideas.md 引入未确认的内容。如发现新的、未在 Step 3 中出现的不一致，最终回复中列为「Step 5 新发现」，**不**自动改写。

如果 core-ideas.md 当前为空或缺少上述指导性定位，不要自行补写；最终回复中记录「core-ideas.md 需要人类确认后由 organize-wiki 写入 / 修订」。

### Step 6: 同步 AGENTS.md 与 README.md

#### 6.1 AGENTS.md

1. 读取现有 `AGENTS.md`。
2. 按 [`references/project-context-guidelines.md`](./references/project-context-guidelines.md) §2 整理：
   - 保留所有用户已写入的强制规则原文（包括"docs 自包含"规则）
   - 在「文档体系」段更新：当前 wiki 总数、文件清单、维护方
   - 在「skill 体系」段更新：可用 skill 列表与各自职责（`game-design-brainstorm` / `organize-wiki` / `audit-wiki`）
   - 在「当前实现状态」段更新：src 已实现的子系统 vs 仅在 wiki 中的子系统
3. **不要**删除任何用户手写的规则；不确定一段是否过时时，问用户：
   ```
   问题：AGENTS.md 中以下规则似乎与当前实现不符，是否更新 / 删除 / 保留？
   原文：> ...
   ```
4. 末尾追加更新时间戳：`<!-- last-synced-by audit-wiki: YYYY-MM-DD -->`。

#### 6.2 README.md

1. 读取现有 `README.md`。
2. 按 [`references/project-context-guidelines.md`](./references/project-context-guidelines.md) §3 整理：
   - 保留 tech stack / 安装与启动命令 / 部署说明（除非命令本身已变化）
   - 同步「功能概览」：以 src 实际实现为准，不要列 wiki 中尚未实现的功能
   - 同步「目录结构」：用真实的 `src/` 与 `docs/` 树，而非过期描述
   - 同步「设计文档」入口：以 `docs/index.md` 作为入口，避免维护重复链接列表（除非用户明确希望保留页面级链接）
3. 同样末尾追加：`<!-- last-synced-by audit-wiki: YYYY-MM-DD -->`。

#### 6.3 验证

用 `@explore` subagent 或只读工具确认：

- AGENTS.md / README.md 中没有出现已不存在的文件路径（`docs/old-thing.md`）
- AGENTS.md / README.md 中提到的 src 文件 / 目录都真实存在
- 被改动文件的最终 diff 只包含本轮审计需要的内容

## 完成后

简短总结：

- 本轮审计范围
- finding 总数（按类别 A/B/C/D 分计）
- 被修改的文件清单（wiki / index.md / AGENTS.md / README.md）
- 冲突决议摘要
- 「待代码处理」TODO 数量与条目
- 「待整理 / Open Question」数量与条目

**不要**：

- 自动 commit
- 自动调用 `organize-wiki` 或建议进入下一轮 brainstorm
- 主动改 src 代码
- 为 audit 创建仓库内临时目录、审计报告或备份目录

等用户指令决定下一步。

## 失败与回滚

任何 step 写文件失败时：

- **不要**继续扩大修改范围
- 立即停止并向用户说明失败位置、已完成修改、建议回滚方式
- 如果需要回滚，优先基于用户确认和版本控制 diff 处理；不要自行执行破坏性 git 操作

如果用户在 Step 4 中途决定终止 audit：

- 已经做过的修正不回滚（用户已确认过的）
- 最终回复中标注「本轮终止于 finding `<ID>`，剩余 finding 留待下一轮」

## 文件清单（一次完整会话可能更新）

```text
docs/index.md                  # Step 5 重新生成
docs/core-ideas.md             # Step 5 仅在用户已确认的修订上动
docs/gameplay/<...>/<wiki>.md  # Step 4 仅在用户已确认的修订上动
AGENTS.md                      # Step 6 同步
README.md                      # Step 6 同步
```
