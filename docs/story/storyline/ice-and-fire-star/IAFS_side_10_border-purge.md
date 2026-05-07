# IAFS side 10: Border Purge

## Meta

- event_id: `iafs_side_10_border_purge`
- line_type: `side`
- unique_id: `10`
- source_anchor: `IAFS_story.md` -> `## 第三阶段：门域接触与分歧` / `支线 C：边境清剿`
- target_file: `IAFS_side_10_border-purge.md`
- tone: `高压（强制介入前的资源对赌）`

## Narrative Intent

- 为驱逐策略提供高风险高执行力路径。
- 把“强制介入”前置为可失败的作战支线，避免无成本直达。

## Tone Narrative

第一份联合作战委托送到你手里时，纸边还沾着火山灰和冻霜。两地代表难得坐在同一张桌前，却谁都不看谁：冷端要你先稳住撤离线，热端要你立刻打穿外圈。大家都在说“先活下来”，只是每个人对“谁先活”有不同答案。

作战一开始就没有英雄主义的余裕。外围警戒环像会收缩的铁网，队伍刚推进半程，巡逻回廊就开始回流；你让突击组继续压前，后勤就会掉队；你让后勤先走，火力窗口就会被吞回去。每一个看似正确的命令，都在另一条线里变成代价。

当回收点终于亮起引导灯，真正的抉择才出现：是趁缺口还在，继续向控制结点猛推；还是立刻固守，把人和物资完整带回。前者可能赢下门域的短时主导权，后者能保住下一次出击的骨架。你听见通讯里有人催你“现在不冲就来不及了”，也听见医疗组低声报出新的伤员编号。

清剿线的结尾从来不体面。赢了，也只是换来一段短暂可控的窗口；输了，队伍、聚落和生态都会一起记住这次过度冒进。你带回来的不只是战果，而是一张更重的账单——上面写着接下来每一步都要偿还的名字。

## Event Journey (Story-Driven)

### Prologue: 联合作战委托

- Trigger
  - `trigger.type`: `call_choice`
  - recommended source action: 门域策略面板选择“边境清剿”
- Condition
  - 两地聚落至少一方信任达到执行阈值
- Event Node
  - `n_call_purge_brief` (`call`)
- Choice
  - `opt_purge_fast_push` -> `n_purge_assault_wait`
  - `opt_purge_hold_line` -> `n_purge_assault_wait`
- Consequence
  - 进入外围节点清剿

### Task 1: 外围节点清剿与回收点固守

- Trigger
  - 来自 `n_call_purge_brief`
- Condition
  - 可访问 `loc_gate_outer_perimeter` / `loc_gate_control_nexus`
- Event Node
  - `n_purge_assault_wait` (`wait`)
  - `n_purge_hold_check` (`check`)
- Choice
  - 本阶段无额外显式选项（`N/A`）
- Consequence
  - 成功：`n_end_purge_success`
  - 失败：`n_end_purge_fail`

### Endings & Mainline Coupling

- `result_purge_success`
  - 收益：解锁强制介入门域选项
  - 主线耦合：短时夺取控制权能力提升
- `result_purge_fail`
  - 收益：无
  - 主线耦合：队伍状态恶化、聚落信任下降、生态波动升级

### Event Graph Reference (for JSON mapping)

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_call_purge_brief` | `call` | 清剿委托简报与推进方式选择 | option mapping to `n_purge_assault_wait` |
| `n_purge_assault_wait` | `wait` | 外围节点清剿执行 | `n_purge_hold_check` |
| `n_purge_hold_check` | `check` | 回收点固守结果判定 | `n_end_purge_success` or `n_end_purge_fail` |
| `n_end_purge_success` | `end` | 清剿成功结算 | terminal |
| `n_end_purge_fail` | `end` | 清剿失败结算 | terminal |

## Open Questions

- 清剿失败是否需要强制触发一次“生态反扑” follow-up 事件。
