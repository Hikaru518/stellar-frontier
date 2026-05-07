# IAFS side 09: Seventh Beat Protocol

## Meta

- event_id: `iafs_side_09_seventh_beat_protocol`
- line_type: `side`
- unique_id: `09`
- source_anchor: `IAFS_story.md` -> `## 第三阶段：门域接触与分歧` / `支线 B：七拍语法`
- target_file: `IAFS_side_09_seventh-beat-protocol.md`
- tone: `科幻（沟通协议的高风险构建）`

## Narrative Intent

- 把“沟通”定义为工程化协议构建，而非单次对话事件。
- 明确误译代价，防止沟通线变成低风险捷径。

## Tone Narrative

你们不是在学一门语言，而是在学一种会反噬的节律。七拍语法的危险不在听不懂，而在“以为自己听懂了”。

## Event Journey (Story-Driven)

### Prologue: 协议任务启动

- Trigger
  - `trigger.type`: `call_choice`
  - recommended source action: 第三阶段策略面板选择“七拍语法”
- Condition
  - 已获得基础门域样本或碑文线索
- Event Node
  - `n_call_protocol_brief` (`call`)
- Choice
  - `opt_protocol_strict_validation` -> `n_protocol_sample_wait`
  - `opt_protocol_fast_track` -> `n_protocol_sample_wait`
- Consequence
  - 进入采样与对照流程

### Task 1: 采样、对照、构建、实测

- Trigger
  - 来自 `n_call_protocol_brief`
- Condition
  - 可进入 `loc_gate_transition_band`
- Event Node
  - `n_protocol_sample_wait` (`wait`)
  - `n_protocol_compare_check` (`check`)
  - `n_protocol_device_wait` (`wait`)
  - `n_protocol_test_check` (`check`)
- Choice
  - 本阶段无额外显式选项（`N/A`）
- Consequence
  - 成功：`n_end_protocol_success`
  - 失败：`n_end_protocol_mistranslation`

### Endings & Mainline Coupling

- `result_protocol_success`
  - 收益：解锁协议通行
  - 主线耦合：门域敌意显著下降
- `result_protocol_mistranslation`
  - 收益：无
  - 主线耦合：短期关闭沟通选项并提升警戒

### Event Graph Reference (for JSON mapping)

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_call_protocol_brief` | `call` | 七拍语法任务简报 | option mapping to `n_protocol_sample_wait` |
| `n_protocol_sample_wait` | `wait` | 节律采样 | `n_protocol_compare_check` |
| `n_protocol_compare_check` | `check` | 对照与误译筛查 | `n_protocol_device_wait` |
| `n_protocol_device_wait` | `wait` | 共振发声器构建 | `n_protocol_test_check` |
| `n_protocol_test_check` | `check` | 实测结果判定 | `n_end_protocol_success` or `n_end_protocol_mistranslation` |
| `n_end_protocol_success` | `end` | 协议成功结算 | terminal |
| `n_end_protocol_mistranslation` | `end` | 误译失败结算 | terminal |

## Open Questions

- “神名誓约”校验是否需要独立 call template 或并入实测节点。
