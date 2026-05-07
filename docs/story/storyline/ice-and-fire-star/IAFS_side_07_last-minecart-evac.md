# IAFS side 07: Last Minecart Evac

## Meta

- event_id: `iafs_side_07_last_minecart_evac`
- line_type: `side`
- unique_id: `07`
- source_anchor: `IAFS_story.md` -> `### 支线 07：最后一班矿车（战斗撤离）`
- target_file: `IAFS_side_07_last-minecart-evac.md`
- tone: `哲学（人命与供能的价值排序）`

## Narrative Intent

- 把矿车撤离危机转成强制取舍事件。
- 明确“救人/保矿”二选一代价。
- 将结果写回社会公信与资源线。

## Tone Narrative

最后一班矿车卡在高温走廊时，所有人都知道没有完美答案。车厢里有矿工，也有决定聚落供能的矿样；你能救下很多，但很难救下全部。

这条线最重的一刻不是战斗，而是抉择。你在热浪和塌方中下达的一句命令，会把“效率正确”或“伦理正确”写进两地对你的长期记忆。

## Event Journey (Story-Driven)

### Prologue: 撤离告警

- Trigger: `action_complete`（火区矿道事故后触发）
- Event Node: `n_call_minecart_alert`
- Choice:
  - `opt_clear_then_evac`
  - `opt_fight_while_evac`
  - `opt_life_first_protocol`

### Task 1: 临界撤离

- Event Node:
  - `n_minecart_push_wait`
  - `n_minecart_forced_tradeoff_call`
  - `n_minecart_outcome_check`

### Endings & Mainline Coupling

- `result_minecart_high_preserve`: 人员与物资高保全，社会公信上升
- `result_minecart_life_first`: 人命保全优先，矿样收益下降
- `result_minecart_failure`: 撤离失败，信任与资源双降

## Open Questions

- “人命优先”分支是否应给予跨线剧情保护加成。
