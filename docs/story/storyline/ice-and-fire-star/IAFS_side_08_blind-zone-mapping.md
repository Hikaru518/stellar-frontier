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

盲区不是地图上的空白，而是敌方习惯里的缝隙。你要做的不是找到“没有人巡逻”的地方，而是找到“对方以为不需要巡逻”的时间。

## Event Journey (Story-Driven)

### Prologue: 测绘任务接入

- Trigger
  - `trigger.type`: `call_choice`
  - recommended source action: 第三阶段策略面板选择“盲区测绘”
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
