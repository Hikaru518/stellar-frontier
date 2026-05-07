# IAFS main 1B: Trace Routing to Settlement

## Meta

- event_id: `iafs_main_1B_trace_routing_to_settlement`
- line_type: `main`
- unique_id: `1B`
- source_anchor: `IAFS_story.md` -> `## 第一阶段：坠落与立足` / `### 情境/冲突/选择`
- target_file: `IAFS_main_1B-trace-routing-to-settlement.md`
- tone: `压迫推进（在错误地图上找活路）`

## Narrative Intent

- 把首轮生存转入“找聚落接触”的可执行推进。
- 强化窗口节律与路线选择的风险差异。
- 让玩家在稳健和激进之间做首次路线立场声明。

## Tone Narrative

坠毁后的烟还没散尽，你们就得决定往哪边走。冷端有反光片和风向残标，像一条能活下去的慢路；热端有矿渣辙痕和通风火点，像一条能赶时间的快路。两条线都像线索，也都像陷阱。

真正难的不是“看见哪条路”，而是“把队伍完整带过最后一段窗口”。通话里每一次停-走-掩蔽都在抢秒，慢一点就失去温差回落，快一点就踩进裂缝和热浪反扑。你在地图上画的是路径，在现实里赌的是队员状态。

当聚落外缘的轮廓终于出现，你会发现到达不等于接纳。门口的第一句问话不是“你们是谁”，而是“你们能拿什么交换落脚资格”。

## Event Journey (Story-Driven)

### Prologue: 路线判读

- Trigger
  - `trigger.type`: `action_complete`
  - recommended source action: 1A 生存状态结算后触发
- Condition
  - 队伍具备至少一轮外勤能力
- Event Node
  - `n_call_route_briefing` (`call`)
- Choice
  - `opt_route_frost` -> `n_route_frost_wait`
  - `opt_route_cinder` -> `n_route_cinder_wait`
  - `opt_route_split_team` -> `n_route_split_wait`
- Consequence
  - 进入对应接触路线执行

### Task 1: 窗口穿越与接触

- Event Node
  - `n_route_frost_wait` (`wait`)
  - `n_route_cinder_wait` (`wait`)
  - `n_route_split_wait` (`wait`)
  - `n_arrival_contact_check` (`check`)
- Consequence
  - `n_end_1B_contact_stable` or `n_end_1B_contact_strained`

### Endings & Mainline Coupling

- `result_1B_contact_stable`: 成功接触聚落并建立首条稳定补给线
- `result_1B_contact_strained`: 接触成功但损耗偏高，后续资源压力抬升

## Open Questions

- 分队路线的收益上限是否需要按队员通讯质量加权。
