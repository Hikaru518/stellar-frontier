# IAFS main 2B: Settlement Perimeter Investigation

## Meta

- event_id: `iafs_main_2B_settlement_perimeter_investigation`
- line_type: `main`
- unique_id: `2B`
- source_anchor: `IAFS_story.md` -> `## 第二阶段：双区调查与生态战斗` / `### 情境/冲突`
- target_file: `IAFS_main_2B_settlement-perimeter-investigation.md`
- tone: `对撞（人物口述与地点证据互证）`

## Narrative Intent

- 将聚落人物线与周边地点线合并到同一调查链。
- 让“口述 vs 日志 vs 现场”冲突可判定。
- 强化后续门域策略的证据基础。

## Tone Narrative

聚落里每个人都能给你一条看似完整的答案，但把这些答案摆在同一张桌上，它们又彼此冲突。记录员说窗口异常是先兆，监工说塌方才是起点，旧仓日志却在关键时段留下了空白页。

你开始在人物与地点之间来回折返：白天听证，夜里实勘。越深入，越能看见同一事实被不同叙事包裹。你要做的不是“找最响亮的声音”，而是把能复现的证据链拼出来。

## Event Journey (Story-Driven)

### Prologue: 证据链任务接入

- Trigger: `action_complete`（2A 取证完成后）
- Event Node: `n_call_perimeter_brief`
- Choice:
  - `opt_prioritize_people`
  - `opt_prioritize_sites`
  - `opt_cross_verify`

### Task 1: 人地互证

- Event Node:
  - `n_people_line_wait`
  - `n_site_line_wait`
  - `n_cross_evidence_check`

### Endings & Mainline Coupling

- `result_2B_evidence_strong`: 解锁高可信门域研判输入
- `result_2B_evidence_fragmented`: 后续策略线初始误差上升

## Open Questions

- “日志缺页”是否要在 runtime 里对应一次可追溯的篡改标记。
