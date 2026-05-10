---
topic: completed-task-result-node
date: 2026-05-10
status: approved
scope: feature
source:
  initial: docs/plans/2026-05-10-17-44/initial.md
  interview: docs/plans/2026-05-10-17-44/completed-task-result-node-interview.md
target_wiki: docs/gameplay/quest-system/quest-system.md
---

# 已完成任务结果节点

## 1. 概述（What & Why）

任务系统在任务完成后提供一个任务级“结果节点”。这个节点不是新的子任务，也不是事件日志聚合，而是写在 `quest JSON` 内的完成态内容，用于在玩家回看已完成任务时显示该任务的总结、结果与后续影响。

它的目标是让“任务完成”不只表现为 todo 全部打勾，而是形成一个清晰的收束状态：玩家能知道自己完成了什么、造成了什么结果、当前世界或队员状态因此发生了什么变化。

## 2. 设计意图（Design Intent）

结果节点服务于任务回看与叙事收束。玩家完成任务后，应看到一个明确的结论，而不是只看到一组已完成的 checklist。

该设计希望强化三种感受：任务有结局、玩家行动有后果、已完成任务仍有阅读价值。它避免把任务栏变成纯进度工具，也避免让结果散落在事件日志中，导致玩家回看时无法快速理解任务最终状态。

## 3. 核心概念与术语（Core Concepts & Terminology）

- **结果节点**：任务完成后显示的任务级信息节点，包含标题、总结和结果条目。
- **完成态内容**：写在 `quest JSON` 中的静态内容，用于描述任务完成后的结论。
- **任务总结**：一句或一小段文字，概括玩家完成了什么。
- **结果条目**：列出本次完成带来的直接结果、世界状态变化或后续影响。
- **任务回看**：玩家在任务侧边栏或任务详情中查看已完成任务的行为。

## 4. 核心循环与玩家体验（Core Loop & Player Experience）

### 4.1 玩家旅程

1. 玩家接到任务，只看到当前可执行的 todo。
2. 玩家推进任务，完成调查、维修或其他目标。
3. 系统在所有必需 todo 完成后把任务标记为 `completed`。
4. 任务详情中出现结果节点。
5. 玩家打开已完成任务，看到任务总结与结果条目。
6. 玩家可继续查看已完成 todo，理解过程；结果节点负责解释结论。

### 4.2 典型情境（可选）

- **高光时刻**：玩家完成最后一个维修 todo 后，任务不只是“100%”，而是显示“坠毁点已稳定，基础生命支持恢复，Mike 可继续执行后续行动”。
- **低谷 / 摩擦点**：如果结果节点文字太长，任务侧边栏会变成日志页。MVP 应保持短文本，只承担结论表达。

## 5. 机制与规则（Mechanics & Rules）

### 5.1 状态与状态机

结果节点不新增独立 runtime 状态。任务已有的 `status: completed` 是结果节点出现的唯一触发条件。

任务状态流保持不变：`incomplete -> completed`。当任务进入 `completed` 后，如果该任务定义了完成态内容，UI 在任务详情中显示结果节点。

### 5.2 规则与公式

- 每个 quest 可选定义一个 `completion_result`。
- `completion_result` 只在任务 `status` 为 `completed` 时显示。
- `completion_result` 属于任务级内容，不挂在 subquest 或 todo 下。
- 结果节点不替换 todo 列表；玩家仍可回看已完成 todo。
- 如果任务已完成但未定义 `completion_result`，UI 不显示结果节点，也不报错。
- 结果节点内容不从事件日志自动聚合，避免同一任务在不同存档中出现不稳定文案。

### 5.3 参数与默认值

建议的 `quest JSON` 结构：

```json
{
  "completion_result": {
    "title": "坠毁点已稳定",
    "summary": "Mike 完成了 IAFS 坠毁点的初步调查与关键设备修复。",
    "outcomes": [
      "发电机恢复基础供能。",
      "维生系统重新上线。",
      "穿梭机核心进入可评估状态。"
    ]
  }
}
```

字段规则：

- `title`：必填，短标题。
- `summary`：必填，1-2 句总结。
- `outcomes`：可选，0-5 条结果。

## 6. 系统交互（System Interactions）

- **依赖于**：任务定义内容、任务 runtime `status`、任务详情 UI。
- **被依赖于**：任务侧边栏和已完成任务回看体验。
- **共享对象 / 状态**：不新增存档字段；结果节点由 quest definition 与 runtime status 派生。
- **事件 / 信号**：不新增事件类型；仍由现有 quest progress effect 完成任务。

## 7. 关键场景（Key Scenarios）

### 7.1 典型场景

- **S1：完成 IAFS 坠毁点任务**：玩家完成调查与三个维修 todo → 任务状态变为 completed → 任务详情显示“坠毁点已稳定”结果节点。
- **S2：回看已完成任务**：玩家在任务侧边栏选择“已完成”任务 → 展开任务详情 → 看到完成总结、结果条目和已完成 todo。
- **S3：没有配置结果节点的任务**：任务完成但没有 `completion_result` → UI 只显示已完成状态和 todo，不显示空白结果区。

### 7.2 边界 / 失败场景

- **F1：旧存档中任务已完成**：如果 quest definition 新增了 `completion_result`，旧存档打开后也应能看到结果节点，因为它由定义和 `completed` 状态派生。
- **F2：结果内容缺字段**：内容校验应阻止缺少 `title` 或 `summary` 的 `completion_result`。
- **F3：结果内容过长**：schema 或内容规范应限制 `outcomes` 数量，避免任务详情挤压核心控制区。

## 8. 取舍与反模式（Design Trade-offs & Anti-patterns）

- **取舍 1**：选了任务级结果节点，而不是每个 todo 都有结果。理由：当前需求是“已完成任务”的总结与结果，任务级节点最小且清晰。
- **取舍 2**：选了 `quest JSON` 静态内容，而不是从事件日志聚合。理由：任务回看需要稳定、可策划的结论文案。
- **取舍 3**：选了完成后追加结果节点，而不是替换 todo。理由：结果解释结论，todo 保留过程，两者用途不同。
- **要避免的反模式**：不要把结果节点写成长篇日志；不要把结果节点作为隐藏奖励、后续任务解锁或复杂剧情分支的承载点。

## 9. 参考与灵感（References & Inspiration）

N/A。本轮未做互联网研究，设计依据来自用户需求与当前任务系统结构。

---

## 10. 本轮范围与阶段拆分（Scope & Phasing for This Round）

### 10.1 MVP（本轮必做）

- 在 quest schema 中支持任务级 `completion_result`。
- 在 quest content type 中支持 `completion_result`。
- 在任务 view model 中，当任务 `completed` 且定义了结果内容时暴露结果节点。
- 在任务侧边栏 / 任务详情 UI 中显示结果标题、总结和结果条目。
- 给 `regroup_after_crash` 配置完成结果节点。
- 补充测试：任务未完成不显示结果；任务完成后显示结果；旧 runtime 状态无需新增字段。

### 10.2 Later（未来再做，明确本轮不做）

- 多结局结果节点，根据不同完成路径显示不同总结。
- todo 级局部结果。
- 结果节点关联后续任务、解锁项或世界状态变更。
- 从事件日志或世界历史自动生成结果摘要。

### 10.3 不做（Out of Scope，避免范围膨胀）

- 不新增任务完成动画或大型结算页面。
- 不改变任务完成判定规则。
- 不把结果节点写入 `GameState` 或 save。
- 不新增一等 effect 类型。

## 11. 本轮验收与风险（Acceptance & Risks）

### 11.1 Player Stories / Play Scenarios（验收切片）

#### PS-001: 完成任务后看到结果节点
- **作为**：完成 IAFS 坠毁点主任务的玩家
- **我能**：在任务详情中看到任务总结与结果条目
- **以便**：理解任务最终状态，而不是只看到 todo 已完成
- **验收标准**：
  - [ ] `regroup_after_crash` 完成后显示结果节点标题。
  - [ ] 结果节点显示 summary。
  - [ ] 结果节点显示配置的 outcomes。
  - [ ] 已完成 todo 仍可见。
- **不包含**：多结局、todo 级结果、完成动画
- **优先级**：P0

#### PS-002: 未完成任务不提前显示结果
- **作为**：正在推进任务的玩家
- **我能**：只看到当前可执行 todo，不提前看到最终结果
- **以便**：避免剧透和信息噪音
- **验收标准**：
  - [ ] 任务 `incomplete` 时不显示 `completion_result`。
  - [ ] 调查完成但维修未完成时不显示最终结果节点。
- **不包含**：中间阶段 summary
- **优先级**：P0

### 11.2 成功标准（Success Criteria）

- [ ] 内容校验能验证 `completion_result.title` 与 `completion_result.summary`。
- [ ] 任务完成后 UI 显示结果节点。
- [ ] 任务未完成时 UI 不显示结果节点。
- [ ] 不新增 save 字段。
- [ ] 现有 quest progress 流程不变。

### 11.3 风险与缓解（Risks & Mitigations）

- **R1：结果节点和事件日志职责重叠**
  - **缓解**：结果节点只写任务结论；事件日志继续记录过程事件。
- **R2：结果节点文案过长影响任务 UI**
  - **缓解**：MVP 限制 outcomes 数量，并保持 summary 短句。
- **R3：旧任务没有结果内容导致 UI 不一致**
  - **缓解**：`completion_result` 可选；未配置时不显示结果区。

## 12. Open Questions

- **Q1**：未来是否需要多结局结果节点，根据任务完成路径显示不同结果？
- **Q2**：结果节点是否需要在控制中心以通知形式短暂提示，还是只在任务详情中回看？
