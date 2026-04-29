---
plan: "game-system-demock"
started: "2026-04-29 16:35"
status: "in_progress"
branch: "feature/game-system-demock"
source:
  implementation_plan: "docs/plans/2026-04-29-15-29/game-system-demock-implementation-plan.md"
  tasks_json: "docs/plans/2026-04-29-15-29/game-system-demock-tasks.json"
---

# Progress: game-system-demock

## 任务状态

| # | Task ID | 标题 | 状态 | 尝试次数 |
|---|---------|------|------|---------|
| 1 | T001 | 固化去 mock 与去 legacy 审计清单 | completed | 1 |
| 2 | T002 | 三人化 crew content、schema 与类型 | pending | 0 |
| 3 | T003 | 删除旧角色相关结构化事件资产 | pending | 0 |
| 4 | T004 | 三人化地图、初始状态与测试 fixture | pending | 0 |
| 5 | T005 | 删除 legacy event 内容入口 | pending | 0 |
| 6 | T006 | 删除 editor legacy event 展示 | pending | 0 |
| 7 | T007 | 建立 crew_actions 派生视图模型 | pending | 0 |
| 8 | T008 | 强化阻塞与单主行动约束 | pending | 0 |
| 9 | T009 | 迁移时间推进到 crew_actions | pending | 0 |
| 10 | T010 | 迁移移动行动到 crew_actions | pending | 0 |
| 11 | T011 | 迁移停止与待命行动到事件 runtime | pending | 0 |
| 12 | T012 | 迁移调查当前区域到地点事件入口 | pending | 0 |
| 13 | T013 | 重构基础行动 content 与 schema | pending | 0 |
| 14 | T014 | 删除 legacy dispatch 与旧行动入口 | pending | 0 |
| 15 | T015 | 建立地点剧情动作事件样例 | pending | 0 |
| 16 | T016 | 删除地图 legacy content 字段与 schema | pending | 0 |
| 17 | T017 | 删除 deriveLegacyTiles 与旧 MapTile 投影 | pending | 0 |
| 18 | T018 | 清理 PC UI mock 文案 | pending | 0 |
| 19 | T019 | 清理 mobile UI mock 文案 | pending | 0 |
| 20 | T020 | 更新正式项目文档 | pending | 0 |
| 21 | T021 | 全仓关键词审计与生成产物同步 | pending | 0 |
| 22 | T022 | 集成验证与收口 | pending | 0 |

状态值：`pending` | `in_progress` | `completed` | `failed`

## 执行策略

- 按 `depends_on` 判断可执行批次。
- 仅在依赖满足且预计文件范围相对分离时并行派发 Monkey。
- 每个 task 通过质量检查后由 MonkeyKing 提交。
- 若并行结果发生冲突，MonkeyKing 按本轮 design / technical design 修复整合问题。

## 执行日志

<!-- 每个任务完成（或失败）后，在此追加一条记录 -->

### T001: 固化去 mock 与去 legacy 审计清单
- 状态: completed
- 开始时间: 2026-04-29 16:36
- 完成时间: 2026-04-29 16:42
- 尝试次数: 1
- Monkey summary: 在 `game-system-demock-implementation-plan.md` 中新增按 content、runtime/UI、mobile、editor、dual-device、scripts、generated、tests、docs 分类的审计清单，明确关键词范围、历史材料例外和后续删除规则。未运行 npm 命令，因为本任务只修改 Markdown 计划文档。
