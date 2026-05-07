# IAFS main 3A: Gate Contact Setup

## Meta

- event_id: `iafs_main_3A_gate_contact_setup`
- line_type: `main`
- unique_id: `3A`
- source_anchor: `IAFS_story.md` -> `## 第三阶段：门域接触与分歧` / `### 开场局势`
- target_file: `IAFS_main_3A_gate-contact-setup.md`
- tone: `紧张（首次接触前的压迫与预判）`

## Narrative Intent

- 把门域接触入口从“背景描述”转成可执行的接触准备链。
- 让玩家在首次接触前先做策略倾向声明，形成后续分支成本。
- 把“门域不是单点目标”的概念落实到分层行动与风险提示。

## Tone Narrative

上一轮风暴终于收束的那一夜，主控舱里只剩风噪、心跳和散热风扇的低鸣。指挥台上并排亮着三套推演图：蓝色线条标注潜入窗口，金色线条模拟协议信道，红色线条计算强攻回路。你们终于把 [门域] 从“传说里的方向”拉进了“可以抵达的坐标”，却在出发前先撞上最难的一道门槛——不是怎么过去，而是决定以怎样的身份过去。

黎明前的第一轮窗口里，门域外圈在灰雾中缓慢起伏，像一堵有呼吸节律的活墙；节律过渡带在监测器上忽明忽暗，像在无声点名；核心结点则安静得近乎傲慢，仿佛一台只负责放大错误、从不原谅错误的机器。技术组抱着堆满注记的板子坚持先测算，战斗组已经把路径画到第三层防线，联络组却还在反复校对第一句问候，试图争取一次“还能回头”的接触。

真正的选择在会议尾声落下：先押注低暴露潜入、先押注沟通试探，还是先押注强制清剿。每个选项都能成立，每个选项也都会让另外两条路的准备成本立刻上升。你在屏幕上按下的不是一个按钮，而是整支队伍接下来几轮行动的重心。

这一刻还没开火，代价却已经开始计时。你此刻写入系统的姿态，会改变后续分流门槛，并提前在终局前风险表上落下第一行注脚。你以为自己在选战术，其实是在给整章故事决定叙事重心。

## Event Journey (Story-Driven)

### Prologue: 门域开场归档

- Trigger
  - `trigger.type`: `action_complete`
  - recommended source action: 上一轮主线收束结算后触发
  - required_context:
    - `trigger_type`
    - `occurred_at`
    - `source`
    - `payload.action_type`
- Condition
  - 已获得可校准的 `[坐标碎片]`
  - 当前不处于终局执行状态
- Event Node
  - `n_call_stage3_briefing` (`call`): 汇总门域前置信息
- Choice
  - `opt_bias_infiltration` -> `n_probe_infiltration`
  - `opt_bias_communication` -> `n_probe_communication`
  - `opt_bias_purge` -> `n_probe_purge`
- Consequence
  - 进入对应策略倾向的首次接触测试

### Task 1: 首次接触测试

- Trigger
  - 来自 `n_call_stage3_briefing` 的策略倾向选择
- Condition
  - 至少存在一个可执行门域窗口
- Event Node
  - `n_probe_infiltration` (`wait`)
  - `n_probe_communication` (`wait`)
  - `n_probe_purge` (`wait`)
  - `n_first_contact_check` (`check`): 评估首次接触反馈
- Choice
  - 本阶段无额外显式选项（`N/A`）
- Consequence
  - 写入倾向标记并进入下一段证据冲突流程

### Endings & Mainline Coupling

- `result_3A_infiltration_bias`
  - 收益：潜入准备效率提升
  - 主线耦合：后续盲区测绘成本下降
- `result_3A_communication_bias`
  - 收益：沟通试探容错提升
  - 主线耦合：后续七拍语法初始敌意降低
- `result_3A_purge_bias`
  - 收益：清剿部署效率提升
  - 主线耦合：后续边境清剿执行力提升但生态波动风险上升

### Event Graph Reference (for JSON mapping)

| node_id | node_type | purpose | next |
| --- | --- | --- | --- |
| `n_call_stage3_briefing` | `call` | 门域开场简报与倾向选择 | option mapping to `n_probe_infiltration` / `n_probe_communication` / `n_probe_purge` |
| `n_probe_infiltration` | `wait` | 潜入倾向首次试探 | `n_first_contact_check` |
| `n_probe_communication` | `wait` | 沟通倾向首次试探 | `n_first_contact_check` |
| `n_probe_purge` | `wait` | 驱逐倾向首次试探 | `n_first_contact_check` |
| `n_first_contact_check` | `check` | 首次接触反馈判定 | terminal mapping |
| `n_end_3A_infiltration_bias` | `end` | 潜入倾向结算 | terminal |
| `n_end_3A_communication_bias` | `end` | 沟通倾向结算 | terminal |
| `n_end_3A_purge_bias` | `end` | 驱逐倾向结算 | terminal |

terminal_node_ids:

- `n_end_3A_infiltration_bias`
- `n_end_3A_communication_bias`
- `n_end_3A_purge_bias`

graph_rules:

- `acyclic: true`
- `max_active_nodes: 1`
- `allow_parallel_nodes: false`

### Effects Registry (for JSON mapping)

| effect_id | effect_type | target | summary | failure_policy | record_policy |
| --- | --- | --- | --- | --- | --- |
| `ef_set_flag_3A_infiltration_bias` | `set_world_flag` | `world_flags` | 写入潜入倾向标记 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_3A_communication_bias` | `set_world_flag` | `world_flags` | 写入沟通倾向标记 | `skip_effect` | write log=true, history=true |
| `ef_set_flag_3A_purge_bias` | `set_world_flag` | `world_flags` | 写入驱逐倾向标记 | `skip_effect` | write log=true, history=true |
| `ef_add_log_first_contact` | `add_event_log` | `event_log` | 记录门域首次接触报告 | `skip_effect` | write log=true, history=true |

## Call Template Notes

- suggested call_template_id: `iafs_main_3A_gate_contact_setup_call`
- `n_call_stage3_briefing` option keys:
  - `opt_bias_infiltration`
  - `opt_bias_communication`
  - `opt_bias_purge`

## Schema Draft

```json
{
  "event_definitions": [
    {
      "id": "iafs_main_3A_gate_contact_setup",
      "trigger": {"type": "action_complete"},
      "event_graph": {"entry_node_id": "n_call_stage3_briefing"}
    }
  ]
}
```

## Open Questions

- 倾向标记是否需要设定衰减，避免过度锁死后续分流与组合结算。
