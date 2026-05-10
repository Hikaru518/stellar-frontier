---
topic: quest-completed-node-merge
date: 2026-05-10
status: draft
scope: feature-adjustment
source:
  initial: docs/plans/2026-05-10-18-30/initial.md
  interview: docs/plans/2026-05-10-18-30/quest-completed-node-merge-interview.md
supersedes:
  - docs/plans/2026-05-10-17-44/completed-task-result-node-design.md
target_wiki: docs/gameplay/quest-system/quest-system.md
---

# 任务完成节点并入 nodes

## 1. 概述（What & Why）

任务完成后的“终局 / 结果”不再作为独立的 `completion_result` 字段挂在 quest 顶层，而是并入 quest 的 `nodes` 列表，作为一种 `type: "completed"` 的节点。这样任务的过程节点与完成节点共享同一套节点模型，减少 quest JSON 中“当前节点”和“完成结果”两套结构并行的问题。

## 2. 设计意图（Design Intent）

任务系统已经用 `nodes` 表达任务进度阶段。终局本质上也是任务阶段，只是它只在任务完成后可见，并带有结果总结。因此把终局并入 nodes 能让策划在一个列表里维护任务生命周期：初始状态、中间推进、最终完成。

## 3. 核心概念与术语（Core Concepts & Terminology）

- **普通节点**：任务推进中的状态节点，继续使用当前 description 展示当前情报。
- **完成节点**：`nodes` 中 `type: "completed"` 的终局节点，任务完成后在详情中显示标题、总结和结果条目。
- **完成节点 ID**：quest 顶层通过 `completed_node_id` 指向完成节点，避免完成态 UI 依赖当前 runtime `current_node_id` 是否切换。

## 4. 核心循环与玩家体验（Core Loop & Player Experience）

玩家推进任务时仍看到当前普通节点描述和可执行 todo。任务进入 `completed` 后，任务详情显示 `completed_node_id` 指向的完成节点；已完成 todo 仍保留在下方，玩家既能读结论，也能回看过程。

## 5. 机制与规则（Mechanics & Rules）

- `nodes` 支持两类节点：默认普通节点，以及 `type: "completed"` 完成节点。
- 每个 quest 可选定义 `completed_node_id`。
- 当 quest runtime `status` 为 `completed` 且 `completed_node_id` 指向有效完成节点时，UI 显示完成节点。
- 完成节点不新增 runtime/save 字段。
- 完成节点不替换 todo 列表。
- 没有完成节点的已完成任务不显示空白结果区。

建议结构：

```json
{
  "completed_node_id": "crash_site_stabilized",
  "nodes": [
    {
      "id": "crash_site_unsecured",
      "description": "坠毁区域尚未完成调查。"
    },
    {
      "id": "crash_site_stabilized",
      "type": "completed",
      "title": "坠毁点已稳定",
      "summary": "Mike 完成了 IAFS 坠毁点的初步调查与关键设备修复。",
      "outcomes": ["发电机恢复基础供能。"]
    }
  ]
}
```

## 6. 系统交互（System Interactions）

该设计影响 quest schema、content type、view model 和任务侧边栏 UI。事件系统和 quest progress effect 不需要新增 effect 类型；任务完成仍由现有 `complete_quest` 或 quest-level todos 全完成触发。

## 7. 关键场景（Key Scenarios）

- **完成 IAFS 坠毁点任务**：所有 repair todo 完成后，任务状态变为 completed，详情显示 `crash_site_stabilized` 完成节点。
- **旧存档回看**：旧 runtime 中只有 `status: completed`，打开后仍能从 quest definition 的 `completed_node_id` 派生完成节点。
- **无完成节点任务**：任务完成但未配置 `completed_node_id`，详情不显示结果区。

## 8. 取舍与反模式（Design Trade-offs & Anti-patterns）

选择完成节点类型，而不是独立 `completion_result`，会让 quest JSON 更统一，但需要 schema 区分普通节点与完成节点必填字段。完成节点不应承担后续任务解锁、奖励结算或事件日志聚合；它只表达完成态回看文案。

## 9. 参考与灵感（References & Inspiration）

N/A。本轮按用户偏好和现有 quest nodes 结构调整，未做外部调研。

## 10. 本轮范围与阶段拆分（Scope & Phasing for This Round）

### MVP（本轮必做）

- 移除上一轮新增的顶层 `completion_result` 结构。
- 在 quest schema 中支持 `completed_node_id` 与 `type: "completed"` 节点。
- 在 content type 中支持普通节点 / 完成节点联合类型。
- view model 从 `completed_node_id` 派生 `completionResult`。
- 将 `regroup_after_crash` 的结果内容迁移进 `nodes`。
- 更新测试：未完成不显示；完成后显示；不新增 save 字段；旧 runtime 可派生。

### Later（未来再做）

- 多个完成节点和多结局选择。
- 完成节点关联后续任务或世界状态摘要。

### 不做（Out of Scope）

- 不改变任务完成判定。
- 不要求完成时自动切换 `current_node_id` 到完成节点。
- 不新增任务完成动画或结算页。

## 11. 本轮验收与风险（Acceptance & Risks）

- `regroup_after_crash` 完成后显示 `nodes` 内的完成节点标题、summary 和 outcomes。
- 任务未完成时不显示完成节点。
- 已完成 todo 仍可见。
- `GameState.quest_state` 不新增字段。
- 内容校验能阻止 `completed_node_id` 指向不存在节点或非 completed 节点。

主要风险是 `current_node_id` 与 `completed_node_id` 容易混淆。MVP 规则明确：前者表示当前普通进度情报；后者只在任务完成后用于回看终局。

## 12. Open Questions

- 是否允许 quest 没有 `completed_node_id`？当前建议允许，以兼容轻量任务。
- 未来多结局时，是多个 completed node + runtime 记录实际完成节点，还是用变量选择？本轮不处理。
