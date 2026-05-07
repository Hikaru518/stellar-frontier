# IAFS side 04: Spore Quarantine Zone

## Meta

- event_id: `iafs_side_04_spore_quarantine_zone`
- line_type: `side`
- unique_id: `04`
- source_anchor: `IAFS_story.md` -> `### 支线 04：孢子禁区（门域外围）`
- target_file: `IAFS_side_04_spore-quarantine-zone.md`
- tone: `惊悚（看不见的扩散与群体恐慌）`

## Narrative Intent

- 把孢子扩散风险转成可执行封锁链。
- 强化民生与主线资源抢占冲突。
- 为门域外围风险建模提供环境负反馈。

## Tone Narrative

禁区最可怕的地方不是“看见怪物”，而是“看不见边界”。昨晚还是薄雾，今晨就吞没整条补给路；昨天还正常说话的人，今天会在同一句话里卡进陌生节拍。

你要在扩散速度快于解释速度之前做决定：先保聚落安全，还是先保门域推进。任何延迟都会把恐慌放大，任何激进都可能把资源抽空。

## Event Journey (Story-Driven)

### Prologue: 禁区告警

- Trigger: `action_complete`（门域外围行动后触发）
- Event Node: `n_call_spore_alert`
- Choice:
  - `opt_quarantine_full`
  - `opt_quarantine_minimal`
  - `opt_quarantine_segmented`

### Task 1: 封锁与守线

- Event Node:
  - `n_quarantine_setup_wait`
  - `n_quarantine_night_hold_wait`
  - `n_quarantine_result_check`

### Endings & Mainline Coupling

- `result_quarantine_full`: 民生稳定上升，主线节奏下降
- `result_quarantine_minimal`: 主线节奏保持，但回潮风险上升
- `result_quarantine_segmented`: 中庸方案，存在复染风险

## Open Questions

- “复染”是否应触发单独 follow-up 事件链。
