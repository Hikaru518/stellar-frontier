## Project Findings

### 1. Core constraints already in force

- 指令必须经由“通讯台 -> 通话”发出，地图仍保持只读态势图，不直接下达行动。
- 默认地图仍以 `8 x 8` 为当前代码与内容校验基线；如果本轮要在 `4-4` 放置坠毁地点，最稳妥的做法是继续沿用 `8 x 8` 默认图，并把 `4-4` 重新作为本轮 IAFS 出生/坠毁核心点。
- 地块对象天然适合承载“发电机 / 维生装置 / 穿梭机核心”这类可见设施；对象可见性、状态与动作入口本来就在地图系统与通话系统边界内。

### 2. Event / repair fit with current architecture

- 当前通话系统已经支持基础行动，并允许地块对象提供额外 object actions；因此“维修”可以作为对象 action 进入事件流程，符合当前架构。
- 事件系统可以监听 `action_complete`、`call_choice` 等事实信号，并把结果写回对象/地块/日志/世界状态。
- 当前系统已经有对象 blocking / action blocking 的概念，因此“同一对象同一时间只允许一个队员维修”在设计上是顺的。

### 3. Important implementation gap for the requested agility formula

- 当前事件系统类型定义里有 `trigger.probability` 和 modifier 结构，但运行时代码目前没有真正执行这套 probability 字段。
- 当前现成能力更偏向：
  - 属性阈值判断（例如 `agility >= X`）
  - 随机节点 / 加权随机分支
  - 自定义 handler 扩展
- 因此你提出的公式 `成功率 = 敏捷 * ratio - 难度 + bias` 可以作为本轮设计目标，但落地时需要补充事件引擎或 repair 结算层逻辑，不能只写 content 就自动生效。

### 4. Design implications for this IAFS increment

- 如果本轮目标是“从头开始、先做一个可扩展的 IAFS 开局骨架”，那么坠毁点 + 三个损坏对象 + 山体封锁 + 维修事件是合理的第一步。
- 维修成功后仅改变对象状态、不立刻解锁新功能，能把本轮范围控制在“空间布置 + 交互入口 + 检定与状态变化”三件事上。
- 失败仅耗时、可重复尝试，会让维修更像节奏消耗而不是惩罚型风险；后续需要靠对象数量、耗时、锁定规则和外部时间压力来维持张力。

## Best Practice Findings

- 本轮未做互联网研究；按用户要求直接基于项目内现有规则收敛设计。
