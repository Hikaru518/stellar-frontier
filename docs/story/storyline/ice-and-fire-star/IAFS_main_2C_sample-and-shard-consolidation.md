# IAFS main 2C: Sample and Shard Consolidation

## Meta

- event_id: `iafs_main_2C_sample_and_shard_consolidation`
- line_type: `main`
- unique_id: `2C`
- source_anchor: `IAFS_story.md` -> `## 第二阶段：双区调查与生态战斗` / `### 选择/后果/阶段收束`
- target_file: `IAFS_main_2C_sample-and-shard-consolidation.md`
- tone: `收束（把分散证据压成可执行输入）`

## Narrative Intent

- 把双区样本与坐标碎片收敛成可校准结果。
- 显式记录偏科调查带来的代价。
- 为门域接触阶段提供稳定前置条件。

## Tone Narrative

当最后一批样本送回工作台，你们终于能把分散的碎片拼到同一张图上。冷端数据、火端参数、聚落日志、战斗回收件，任何一项缺口都会让整个结论歪斜。

这一步没有新的冒险感，却比冒险更残酷：它要求你承认前面每一次省略都要补税。你此前没做完的调查，会在校准时变成误差；你此前强行压过的分歧，会在这里变成不可忽视的偏差条。

## Event Journey (Story-Driven)

### Prologue: 汇总校准

- Trigger: `action_complete`（2B 互证完成后）
- Event Node: `n_check_shard_bundle`
- Choice: `N/A`

### Endings & Mainline Coupling

- `result_2C_consolidated`: 获得可校准坐标碎片并解锁门域前置
- `result_2C_noisy`: 坐标可用但噪声偏高，后续窗口容错下降

## Open Questions

- 坐标噪声是否在后续阶段以显式 UI 指标展示。
