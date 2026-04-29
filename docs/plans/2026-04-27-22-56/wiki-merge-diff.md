---
source_design: docs/plans/2026-04-27-22-56/communication-table-gameplay-design.md
technical_design: docs/plans/2026-04-27-22-56/communication-table-gameplay-technical-design.md
target_wiki: docs/gameplay/communication-table/communication-table.md
related_updates:
  - docs/gameplay/event-system/event-system.md
  - docs/gameplay/map-system/map-system.md
  - docs/game_model/call-action.md
  - docs/game_model/map.md
  - docs/game_model/event-integration.md
  - docs/game_model/crew.md
date: 2026-04-28 14:25
reaudited_at: 2026-04-29
---

# Wiki Merge Diff: communication-table-gameplay

## 1. 新增（Added）

- [docs/gameplay/communication-table/communication-table.md] 新增通讯台 gameplay 当前态 wiki，覆盖普通通话、事件来电、基础行动、地块对象、对象行动、简单携带物和原地待命等术语。
- [章节 4 核心循环与玩家体验] 新增“通讯台 -> 通话 -> 行动创建 -> 地图 / 状态推进 -> 事件来电”的玩家旅程。
- [章节 5 机制与规则] 新增当前代码口径的 call-actions 规则：通用行动来自 `content/call-actions/basic-actions.json`，对象行动来自 `content/call-actions/object-actions.json`。
- [章节 5.3 参数与默认值] 新增当前实现耗时表：调查 `120 秒`、对象调查 `120 秒`、采集 `180 秒`、建设 `300 秒`、回收 `180 秒`、扫描 `90 秒`、待命即时结算、停止处理器即时结算。
- [章节 7 关键场景] 新增主动调查、通话派遣移动、对象交互、事件来电、紧急事件处理 5 个场景。
- [docs/game_model/call-action.md] 新增通话行动模型，记录 `content/call-actions/*.json`、按钮生成、行动结算、handler 白名单和事件 runtime call 的边界。

## 2. 更新（Updated）

- [docs/gameplay/event-system/event-system.md] 补充通讯台行动与事件系统边界：基础行动由通话 / App 层创建，事件系统消费 `arrival`、`action_complete`、`idle_time` 和 `call_choice`。
- [docs/gameplay/event-system/event-system.md] 按当前代码替换旧的快速 / 标准 / 深度调查耗时表，避免与 `content/call-actions/*.json` 冲突。
- [docs/gameplay/map-system/map-system.md] 将地块对象 `candidateActions` 从“尚未确定如何进入通话菜单”更新为“已揭示对象可生成通话动态按钮”。
- [docs/game_model/map.md] 更新 `candidateActions` 数据契约，明确它由已揭示对象提供，按钮定义和 handler 来自 `content/call-actions/*.json`。
- [docs/game_model/event-integration.md] 补充通讯台普通行动与事件 trigger 的边界，并记录 `scan` / `extract` 的对象行动结算层支持。
- [docs/game_model/crew.md] 补充简单携带物复用 `CrewMember.inventory`，并记录对象行动中 `extract` / `scan` 不属于队员内容文件的初始行动类型。

## 3. 冲突（Conflicts）

### Conflict 1: 设计文档归属

**wiki / frontmatter 原文**：
> `target_wiki: docs/gameplay/event-system/event-system.md`

**策划案实际内容**：
> 通讯台 gameplay 是玩家与队员、地图、事件系统之间的主要行动入口。

**决议**：用户选择拆分归属。主内容新建 `docs/gameplay/communication-table/communication-table.md`；只把事件相关边界同步到 `event-system.md`。

### Conflict 2: 基础行动归属

**事件系统现状**：
> 事件系统强调事件图、节点和 runtime event 作为程序模型。

**策划案表述**：
> 普通通话的基础行动由 App 层通用行动生成负责，不按角色硬编码。

**决议**：按当前代码实现写入。基础行动由 `callActions` / App 层创建真实行动，事件系统消费结果信号。

### Conflict 3: 调查耗时

**wiki 原文**：
> 快速观察 `60 秒`、标准调查 `180 秒`、深度调查 `600 秒`。

**代码实现**：
> `content/call-actions/basic-actions.json` 和 `content/call-actions/object-actions.json` 均配置 `survey` 为 `120 秒`。

**决议**：用户要求按代码实现作为 ground truth。已替换为当前 call-actions 耗时表。

### Conflict 4: `candidateActions` 契约

**game_model 原文**：
> `candidateActions` 是未来行动声明位；当前不直接驱动通话菜单。

**策划案 / 代码实现**：
> 已揭示地块对象的 `candidateActions` 会直接映射成动态按钮；`src/callActions.ts` 已实现该逻辑。

**决议**：用户选择更新 `docs/game_model/map.md`。同时同步 `map-system.md`，避免 gameplay wiki 与 game model 不一致。

### Conflict 5: 简单携带物与对象行动类型

**game_model 原文**：
> `crew_action_state.type` 未列出 `scan`，`crew.md` 的内容层初始行动类型也不包含 `extract` / `scan`。

**代码实现**：
> `content/call-actions/object-actions.json` 定义 `extract` 与 `scan`；`callActionSettlement.ts` 的对象行动结算层支持两者。`gather` 通过 `addInventoryItem` 写入队员 inventory。

**决议**：用户选择同步 `event-integration.md` / `crew.md`。文档写明：简单携带物复用 inventory；`extract` / `scan` 属于通讯台对象行动结算层，不属于队员内容文件的初始行动类型。

## 4. 保持（Kept as-is）

- `docs/gameplay/event-system/event-system.md` 保留事件图、runtime event/call/objective、condition/effect、handler registry、生产级校验和原有样例事件池。
- `docs/game_model/event.md` 未修改；当前设计没有新增触发类型、节点类型、runtime event 字段或 call template 字段。
- 初次 merge 未修改 `docs/index.md`；2026-04-29 重新审计时已按 audit-wiki 索引职责同步入口。

## 5. 失败记录（如有）

*（暂无）*

## 6. 重新审计记录（2026-04-29）

- 主目标 `docs/gameplay/communication-table/communication-table.md` 仍保留策划案章节 1-9 的当前态合入结果，未发现章节 10-11 的阶段化内容残留。
- related updates 仍保留在 `docs/gameplay/event-system/event-system.md`、`docs/gameplay/map-system/map-system.md`、`docs/game_model/map.md`、`docs/game_model/event-integration.md` 和 `docs/game_model/crew.md` 中。
- `docs/game_model/call-action.md` 已作为本轮 technical design 的数据契约补充存在，原 diff 漏列，已补入 related updates。
- `docs/index.md` 在本次重新审计前缺少通讯台 Gameplay 与通话行动模型入口；本次已同步更新索引页。
