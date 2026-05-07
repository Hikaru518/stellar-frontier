# IAFS main 4C: Endings and Carryover State

## Meta

- event_id: `iafs_main_4C_endings_and_carryover_state`
- line_type: `main`
- unique_id: `4C`
- source_anchor: `IAFS_story.md` -> `## 第四阶段：离场窗口与终局解释` / `### 后果/阶段收束`
- target_file: `IAFS_main_4C_endings-and-carryover-state.md`
- tone: `余震（离场结局与遗留状态归档）`

## Narrative Intent

- 结算终局结果并生成可继承状态。
- 将离场成功与解释立场统一归档。
- 为后续篇章提供稳定 carryover 契约。

## Tone Narrative

窗口关闭后，世界会在一瞬间安静下来。你们知道这不是结束，只是代价开始入账：谁活着回去了，谁留在了记录里，谁的解释会成为下一段历史的起点。

终局从来不只是一张“成功/失败”结算页。它还会留下对星球的态度、对真相的立场、对关系网络的损耗。下一段旅程拿到的不只是坐标，也是一组已经被你们写过注脚的遗留状态。

## Event Journey (Story-Driven)

### Prologue: 终局归档

- Trigger: `action_complete`（4B 执行链结束后）
- Event Node: `n_check_endings_bundle`
- Choice: `N/A`

### Endings & Mainline Coupling

- `result_4C_fast_return`: 速返成功，遗留紧张标签偏高
- `result_4C_cooperative_return`: 协返成功，遗留稳定标签偏高
- `result_4C_blood_return`: 高损离场，创伤标签偏高
- `result_4C_stranded`: 未离场，进入补救线

## Open Questions

- carryover 状态粒度是否要拆分为“关系/生态/认知”三轴。
