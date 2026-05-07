# IAFS side 06: Dual-Settlement Ceasefire

## Meta

- event_id: `iafs_side_06_dual_settlement_ceasefire`
- line_type: `side`
- unique_id: `06`
- source_anchor: `IAFS_story.md` -> `### 支线 06：双村停火（社会线）`
- target_file: `IAFS_side_06_dual-settlement-ceasefire.md`
- tone: `严肃（站队收益与长期代价）`

## Narrative Intent

- 将双聚落政治冲突写成可判定停火流程。
- 强化“即时收益 vs 长期协作网络”冲突。
- 把社会线结果写回主线执行成本。

## Tone Narrative

停火桌上没有中立空气。两边都把伤亡名单摊在你面前，要求你先表态再谈规则。你知道自己无论偏向哪边，另一边都会把这次决定记很久。

最难受的不是谈判，而是担保。你写下的每一条条款都要有人在窗口里拿命去执行；你给出的每一份保证，都会在下一次补给失误时先找你追责。

## Event Journey (Story-Driven)

### Prologue: 听证接入

- Trigger: `action_complete`（双聚落冲突升温后触发）
- Event Node: `n_call_ceasefire_brief`
- Choice:
  - `opt_push_ceasefire`
  - `opt_side_frostbay`
  - `opt_side_cinderforge`

### Task 1: 核证与担保

- Event Node:
  - `n_ceasefire_hearing_wait`
  - `n_ceasefire_archive_check`
  - `n_ceasefire_guarantee_check`

### Endings & Mainline Coupling

- `result_ceasefire_success`: 解锁联合补给网，执行稳定性提升
- `result_side_frostbay`: 冷端支持上升，热端关系下降
- `result_side_cinderforge`: 热端支持上升，冷端关系下降

## Open Questions

- 停火失败是否应触发一次强制资源短缺惩罚。
