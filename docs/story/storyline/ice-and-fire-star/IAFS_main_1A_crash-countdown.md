# IAFS main 1A: Crash Countdown

## Meta

- event_id: `iafs_main_1A_crash_countdown`
- line_type: `main`
- unique_id: `1A`
- source_anchor: `IAFS_story.md` -> `## 第一阶段：坠落与立足` / `### 开场局势`
- target_file: `IAFS_main_1A_crash-countdown.md`
- tone: `生存高压（坠毁后的分秒决策）`

## Narrative Intent

- 把开场危机转成可执行的倒计时事件链。
- 强化“先活下来，再谈探索”的优先级感。
- 为后续聚落接触建立首轮资源与状态底盘。

## Tone Narrative

警报先是失真，再是彻底撕裂。飞船在云层下方拖着火尾横切地表，像一把钝刀在冰火交界拉出一道伤口。你站在主控台前，只来得及看见三组红字同时跳亮：核心失压、备用电源临界、生命支持倒计时启动。

舰内没有“安全等待”的选项。留在船里的人要抢修供电和滤氧，出去的人要在窗口里回收关键物资。每晚一分钟，所有决定都会变贵：晚一分钟出门，路会裂；晚一分钟回收，电会掉；晚一分钟点名，某个队员就可能从“可救”变成“失联”。

外面的世界同样不给缓冲。白噪风暴从冷端压过来，火山雨从热端抬上来，交替瞬间地表会突然开缝。你要在通话里下达最短也最准确的命令：谁留守、谁外勤、谁先回、谁强撑。每个命令都不是战术炫技，而是把伤亡数字往下压一格。

当第一批人带着残缺物资回到舱门口，你知道开场还没结束，但队伍终于有了下一步的资格。倒计时没有停，只是从“立刻死亡”变成了“能否稳住今天”。

## Event Journey (Story-Driven)

### Prologue: 坠毁与点名

- Trigger
  - `trigger.type`: `action_complete`
  - recommended source action: 新游戏开局后自动触发
  - required_context:
    - `trigger_type`
    - `occurred_at`
    - `source`
- Condition
  - 飞船处于坠毁后初始状态
- Event Node
  - `n_call_rollcall_brief` (`call`): 点名并分配留守/外勤
- Choice
  - `opt_split_balanced` -> `n_assign_balanced`
  - `opt_repair_first` -> `n_assign_repair`
  - `opt_salvage_first` -> `n_assign_salvage`
- Consequence
  - 写入首轮分工偏好，进入倒计时执行

### Task 1: 倒计时执行

- Trigger
  - 来自 `n_call_rollcall_brief` 的分工选择
- Condition
  - `life_support` 剩余时间高于失败阈值
- Event Node
  - `n_assign_balanced` (`check`) -> `n_salvage_window_wait`
  - `n_assign_repair` (`check`) -> `n_salvage_window_wait`
  - `n_assign_salvage` (`check`) -> `n_salvage_window_wait`
  - `n_salvage_window_wait` (`wait`): 首轮外勤回收窗口
  - `n_life_support_check` (`check`): 判定是否稳住基础生存
- Choice
  - 本阶段无额外显式选项（`N/A`）
- Consequence
  - 成功：`n_end_1A_stabilized`
  - 失败：`n_end_1A_critical`

### Endings & Mainline Coupling

- `result_1A_stabilized`
  - 收益：获得首轮可用补给与基础行动余裕
  - 主线耦合：后续聚落接触容错提升
- `result_1A_critical`
  - 收益：无额外收益
  - 主线耦合：以高压状态进入下一段，资源与状态惩罚上升

### Event Graph Reference (for JSON mapping)

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_call_rollcall_brief` | `call` | 坠毁后点名与分工简报 | option mapping to `n_assign_balanced` / `n_assign_repair` / `n_assign_salvage` |
| `n_assign_balanced` | `check` | 均衡分工路径 | `n_salvage_window_wait` |
| `n_assign_repair` | `check` | 维修优先路径 | `n_salvage_window_wait` |
| `n_assign_salvage` | `check` | 回收优先路径 | `n_salvage_window_wait` |
| `n_salvage_window_wait` | `wait` | 首轮倒计时执行 | `n_life_support_check` |
| `n_life_support_check` | `check` | 生存状态判定 | terminal mapping |
| `n_end_1A_stabilized` | `end` | 稳住生存结算 | terminal |
| `n_end_1A_critical` | `end` | 临界失稳结算 | terminal |

### Effects Registry (for JSON mapping)

| effect_id | effect_type | target | summary | failure_policy | record_policy |
| --- | --- | --- | --- | --- | --- |
| `ef_add_log_crash_rollcall` | `add_event_log` | `event_log` | 记录坠毁后点名与分工 | `skip_effect` | write log=true, history=true |
| `ef_increment_life_support_pressure` | `increment_world_counter` | `world_flags` | 增加生命支持压力计数 | `skip_effect` | write log=true, history=true |
| `ef_add_resource_initial_salvage` | `add_resource` | `base_resources` | 发放首轮回收资源 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_1A_critical` | `set_world_flag` | `world_flags` | 标记开场临界状态 | `skip_effect` | write log=true, history=true |

## Open Questions

- 1A 失败是否允许继续推进，或需强制引导一次补救 call。
