# IAFS main 4A: Departure Window and Interpretation Split

## Meta

- event_id: `iafs_main_4A_departure_window_and_interpretation_split`
- line_type: `main`
- unique_id: `4A`
- source_anchor: `IAFS_story.md` -> `## 第四阶段：离场窗口与终局解释` / `### 开场局势`
- target_file: `IAFS_main_4A_departure-window-and-interpretation-split.md`
- tone: `终局前夜（窗口压缩与解释分裂）`

## Narrative Intent

- 将终局前置状态压缩为一次离场窗口争夺。
- 把“神谕解释 vs 技术解释”冲突具象化。
- 为 4B 行动链提供清晰起点。

## Tone Narrative

你们终于站到离场边缘，却发现窗口比预计更短。风暴节律在收紧，门域稳定时间在跳变，主引擎只允许一次高负荷尝试。没有人再问“能不能回家”，所有人都在问“这一次失手，谁来承担后果”。

与此同时，解释分裂也到达临界：有人坚持神谕叙事能维持秩序，有人坚持技术解释必须公开。你知道这不是单纯观点冲突，而是会直接改写执行策略与后续遗留状态的决策分叉。

## Event Journey (Story-Driven)

### Prologue: 离场前置简报

- Trigger: `action_complete`（3C 组合结算后）
- Event Node: `n_call_departure_split_brief`
- Choice:
  - `opt_bias_myth_interpretation`
  - `opt_bias_technical_interpretation`
  - `opt_bias_hybrid_interpretation`

### Endings & Mainline Coupling

- `result_4A_myth_bias`: 稳定秩序叙事，信息透明度下降
- `result_4A_tech_bias`: 解释透明度上升，秩序波动风险上升
- `result_4A_hybrid_bias`: 折中叙事，执行复杂度提升

## Open Questions

- 解释立场是否应与聚落信任值进行联动修正。
