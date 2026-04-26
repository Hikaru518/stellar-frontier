# TODO（设计 / 文档体系级）

本文件记录与 stellar-frontier 项目设计 / 文档体系相关的、目前**有意搁置**但未来值得做的事项。代码实现层面的 TODO 不在这里登记。

## Wiki 索引页 / 子系统总览

**背景**：当前 `organize-wiki` skill 把每个子系统输出成独立 wiki 文件（`docs/gameplay/<system>/<system>.md`），但**没有**一个总览索引文件（类似 `docs/gameplay/README.md` 或 `docs/wiki-index.md`）来列出所有子系统、它们的简介和入口链接。

**当前缺口**：

- 子系统数量增长后，外来读者难以快速浏览全貌
- 系统间的耦合关系只能通过逐个翻 wiki 章节 6「系统交互」拼出，缺少全景视图
- `docs/core-ideas.md` 是 whole-game 的概念描述，并不承担"目录"角色

**可能的实现方向**：

- 引入新的 scope，例如 `whole-game-index`，专门指向一个目录文件
- 或者增加一个独立的 skill（暂名 `update-wiki-index`），消费所有现有 wiki 的 frontmatter，自动生成 / 维护索引页
- 索引页可包含：每个子系统的标题、scope、`last_updated`、一句话概述、与其他系统的耦合关系图（可由 mermaid 自动生成）

**为什么本轮不做**：

- 子系统目前还没有 wiki 内容（`docs/gameplay/crew/`、`event-system/`、`time-system/` 都是空目录）
- 索引在只有 1-2 份 wiki 时几乎没价值；等积累 3+ 份再做更合算
- 索引文件的维护策略（手工 / 自动 / 半自动）需要先看实际使用习惯再定
