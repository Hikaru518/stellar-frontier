# IAFS side 05: Fairy Abandoned Nest

## Meta

- event_id: `iafs_side_05_fairy_abandoned_nest`
- line_type: `side`
- unique_id: `05`
- source_anchor: `IAFS_story.md` -> `### 支线 05：妖精弃巢（生态观察）`
- target_file: `IAFS_side_05_fairy-abandoned-nest.md`
- tone: `科幻（规则感与未知结构）`

## Narrative Intent

- 将“弃巢探索”转为可复现实验流程。
- 构建知识收益与材料收益的互斥取舍。
- 为门域参数线提供高价值前置证据。

## Tone Narrative

弃巢里没有战斗痕迹，只有还在运行的秩序。墙面像在呼吸，地面像在计时，任何触碰都像在打扰一台暂停到一半的实验机。你能感觉到它是空的，却又不敢相信它真的空了。

这条线最难的地方不是“敢不敢进去”，而是“进去之后拿什么回来”。带走核心部件能立刻变强，留下监测装置能换更深的真相。你必须在短期战力和长期认知之间做一次无法回滚的选择。

## Event Journey (Story-Driven)

### Prologue: 弃巢接入

- Trigger: `action_complete`（门域外围扫描后触发）
- Event Node: `n_call_nest_brief`
- Choice:
  - `opt_nest_silent_sampling`
  - `opt_nest_fast_strip`
  - `opt_nest_mark_and_delay`

### Task 1: 节点处理

- Event Node:
  - `n_nest_probe_wait`
  - `n_nest_reaction_check`

### Endings & Mainline Coupling

- `result_nest_sampling`: 参数可信度提升，警戒抬升低
- `result_nest_strip`: 即时收益高，门域警戒上升
- `result_nest_delay`: 短期收益低，后续观测收益高

## Open Questions

- 延迟处理分支是否需要跨章节继承数据缓存。
