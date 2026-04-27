# TODO（设计 / 文档体系级）

本文件记录与 stellar-frontier 项目设计 / 文档体系相关的、目前**有意搁置**但未来值得做的事项。代码实现层面的 TODO 不在这里登记；`audit-wiki` skill 在每轮审计中产生的"待代码处理" TODO 留在对应 `docs/plans/audits/<YYYY-MM-DD-HH-MM>/audit-report.md` 中。

## 事件图节点扩展

**当前状态**：在 `docs/plans/2026-04-27-15-33/` 的事件程序模型头脑风暴中，第一版 event node 类型暂定不包含并行编排能力。

**后续要补充的节点类型**：

- `parallel`：允许一个事件同时开启多个下游节点，用于多队员、多目标或多地点同时推进的复杂事件。
- `join`：允许多个上游节点完成后汇合，用于等待多个目标完成、多个条件满足后进入同一后续阶段。

本轮先固定 `call`、`wait`、`check`、`random`、`action_request`、`objective`、`spawn_event`、`log_only`、`end` 九类节点；`parallel` / `join` 等并行图能力留到后续事件图扩展轮次处理。

## 编辑器级事件内容校验

**当前状态**：在 `docs/plans/2026-04-27-15-33/` 的事件程序模型头脑风暴中，第一版内容校验暂定做到生产级校验，不包含编辑器级分析报告。

**后续要补充的校验能力**：

- 事件分支覆盖率统计。
- 通话 variant 命中率与永远不可达 variant 报告。
- 隐藏选项报告与隐藏原因统计。
- 事件池概率、优先级和互斥关系分析。
- 面向内容生产的质量评分或风险提示。

本轮先保证 schema、ID / 引用、图可达性、终点路径、option / template 对齐、condition / effect 字段类型、handler 参数 schema 和样例事件 dry-run。

## Wiki 索引页 / 子系统总览（已收口于 audit-wiki skill）

**当前状态**：已由 `audit-wiki` skill 处理。

- 索引页路径：`docs/index.md`
- 维护方：`audit-wiki` skill 的 Step 5.1 自动重生成
- 模板：`.opencode/skills/audit-wiki/references/index-template.md`
- 索引页包含：每个子系统的标题、scope、`last_updated`、一句话概述、与其他系统的耦合关系图（mermaid，自动从各 wiki 章节 6「系统交互」抽取）

**仍未处理的子项**：

- 子系统数量增长 3+ 后再首次跑 audit-wiki 会更有意义；目前 `docs/gameplay/crew/`、`event-system/`、`time-system/` 仍是空目录
- 索引页的「状态」列（已实现 / 部分实现 / 仅设计 / 已废弃）判定细则需要在第一次实跑后根据真实情况微调
- 是否引入 `whole-game-index` 这一 scope 暂不需要（`docs/index.md` 直接由 audit-wiki 生成、`organize-wiki` 不动它，二者职责清晰）

如果未来有更复杂的索引需求（例如按 scope / 按耦合度 / 按更新时间多视图），再考虑独立 skill 或扩展 `audit-wiki/references/index-template.md`。
