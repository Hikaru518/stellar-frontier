# IAFS main 2A: Dual-Zone Investigation Init

## Meta

- event_id: `iafs_main_2A_dual_zone_investigation_init`
- line_type: `main`
- unique_id: `2A`
- source_anchor: `IAFS_story.md` -> `## 第二阶段：双区调查与生态战斗` / `### 开场局势`
- target_file: `IAFS_main_2A_dual-zone-investigation-init.md`
- tone: `扩压（站稳后立刻进入双区高压调查）`

## Narrative Intent

- 启动冰火双区并行调查。
- 建立“战斗与取证互相反哺”的节奏。
- 给后续坐标碎片拼接打底。

## Tone Narrative

你们刚在聚落里站稳脚跟，就被推回更恶劣的外场。冰端和火端回传的证据互相打架：一边说节律先乱，一边说环境先崩。没有哪条证词能单独成立，也没有哪条线索可以放弃。

双区调查从第一天就显露代价。你把人手放在冰端，热端就会丢窗口；你把资源压给火端，冷端就会断样本。战斗不再是旁支，而是主线前置门槛：关键材料与关键证据都在危险点位里。

## Event Journey (Story-Driven)

### Prologue: 双区调查令

- Trigger: `action_complete`（1B 接触结算后）
- Event Node: `n_call_dual_zone_brief`
- Choice:
  - `opt_open_frost_first`
  - `opt_open_cinder_first`
  - `opt_open_parallel`

### Task 1: 首轮并行取证

- Event Node:
  - `n_frost_probe_wait`
  - `n_cinder_probe_wait`
  - `n_dual_sync_check`

### Endings & Mainline Coupling

- `result_2A_sync_good`: 双区取证链完整，后续拼图效率提升
- `result_2A_sync_partial`: 证据链偏科，后续误判风险上升

## Open Questions

- 并行推进的窗口惩罚是否按固定值，或按队员状态动态浮动。
