# TODO（设计 / 文档体系级）

本文件记录与 stellar-frontier 项目设计 / 文档体系相关的、目前**有意搁置**但未来值得做的事项。代码实现层面的 TODO 不在这里登记；`audit-wiki` skill 在每轮审计中产生的"待代码处理" TODO 留在对应 `docs/plans/audits/<YYYY-MM-DD-HH-MM>/audit-report.md` 中。

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
