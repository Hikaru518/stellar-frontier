# IAFS side 08: Blind Zone Mapping

## Meta

- event_id: `iafs_side_08_blind_zone_mapping`
- line_type: `side`
- unique_id: `08`
- source_anchor: `IAFS_story.md` -> `## 第三阶段：门域接触与分歧` / `支线 A：盲区测绘`
- target_file: `IAFS_side_08_blind-zone-mapping.md`
- tone: `策略（低暴露潜入窗口构建）`

## Narrative Intent

- 为潜入策略提供可执行、可验证的低警戒路径。
- 把“测绘”从背景动作转成有成本、有失败惩罚的支线闭环。

## Tone Narrative

第一次拿到门域外圈巡逻图时，你几乎想把它扔回桌上：线条密得像一张故意不给人喘息的网。技术组说“总有盲区”，战斗组说“看不见不等于不存在”，而你知道这次任务真正要测的，不是地图本身，而是对方的习惯。

你带队沿外围警戒环贴边推进，先用快扫抢到一批粗糙轨迹，再用慢扫把可疑空窗一格格钉死。每多确认一个坐标，就要多消耗一次窗口时间；每少确认一步，就可能把整支队伍送进回廊交叉火线。盲区从来不是“没人巡逻的地方”，而是“对方以为不用巡逻的那几分钟”。

当最后一段回传数据对齐时，所有人都在等你的判断：现在标记潜入入口，还是再赌一次精度。你若求快，后续潜入能提早启动，但失误会直接换来追击；你若求稳，准备成本变高，却能给后面的人留下一条更像路、而不是更像运气的通道。

这条支线的终点不是一个漂亮坐标，而是一份可以交给下一支小队的生存说明书。成了，门域会短暂失去对你们脚步的预判；败了，它会立刻记住你们来过，并把这次试探加倍还回来。

## Event Journey (Story-Driven)

### Prologue: 测绘任务接入

- Trigger
  - `trigger.type`: `call_choice`
  - recommended source action: 门域策略面板选择“盲区测绘”
- Condition
  - 已解锁门域外围行动权限
- Event Node
  - `n_call_mapping_brief` (`call`)
- Choice
  - `opt_mapping_fast_scan` -> `n_mapping_fast_wait`
  - `opt_mapping_safe_scan` -> `n_mapping_safe_wait`
- Consequence
  - 进入测绘执行

### Task 1: 盲区测绘执行

- Trigger
  - 来自 `n_call_mapping_brief`
- Condition
  - 可访问 `loc_gate_outer_perimeter` 与 `loc_gate_patrol_corridor`
- Event Node
  - `n_mapping_fast_wait` (`wait`)
  - `n_mapping_safe_wait` (`wait`)
  - `n_mapping_check` (`check`)
- Choice
  - 本阶段无额外显式选项（`N/A`）
- Consequence
  - 成功：`n_end_mapping_success`
  - 失败：`n_end_mapping_fail`

### Endings & Mainline Coupling

- `result_mapping_success`
  - 收益：解锁低警戒潜入选项
  - 主线耦合：潜入失败惩罚降低
- `result_mapping_fail`
  - 收益：无
  - 主线耦合：触发追击事件，潜入警戒值上升

### Event Graph Reference (for JSON mapping)

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_call_mapping_brief` | `call` | 盲区测绘方案选择 | option mapping to `n_mapping_fast_wait` / `n_mapping_safe_wait` |
| `n_mapping_fast_wait` | `wait` | 快速测绘执行 | `n_mapping_check` |
| `n_mapping_safe_wait` | `wait` | 稳妥测绘执行 | `n_mapping_check` |
| `n_mapping_check` | `check` | 测绘结果判定 | `n_end_mapping_success` or `n_end_mapping_fail` |
| `n_end_mapping_success` | `end` | 成功结算 | terminal |
| `n_end_mapping_fail` | `end` | 失败结算 | terminal |

## Open Questions

- 追击事件是否拆分为独立 follow-up side event。
