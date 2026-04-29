# 通话行动模型

本文描述普通通话中的行动定义、按钮生成和行动结算数据契约。它连接地图对象、队员行动和事件 runtime：地图对象声明可候选行动，通话页把候选行动渲染为按钮，App 层把按钮选择结算为真实 `ActiveAction` 或即时状态更新。

## 1. 模型范围与命名

| 规则 | 说明 |
| --- | --- |
| `scope` | 覆盖 `content/call-actions/*.json`、通话按钮视图、对象候选行动、行动 handler 白名单、行动完成 patch、与事件 runtime call 的边界。 |
| `out_of_scope` | 不定义完整背包 / 负重，不定义对象互动子菜单，不把所有普通行动改写成事件图。 |
| `content_source_of_truth` | 行动 metadata 来自 `content/call-actions/`；地块对象可用行动来自 `content/maps/default-map.json` 的 `objects[].candidateActions`。 |
| `runtime_source_of_truth` | 当前行动状态来自 `GameState.crew[].activeAction`；地图发现 / 调查状态来自 `GameState.map`。 |
| `handler_policy` | JSON 只能声明 handler ID 和参数；具体状态修改由代码侧白名单 handler 执行。 |

## 2. 资产库布局

| 路径 | 内容 |
| --- | --- |
| `content/call-actions/basic-actions.json` | 全员通用行动，例如 `survey`、`move`、`standby`、`stop`。 |
| `content/call-actions/object-actions.json` | 由地块对象提供的行动，例如 `gather`、`extract`、`scan`、`build`。 |
| `content/schemas/call-actions.schema.json` | 通话行动内容 schema。 |
| `content/maps/default-map.json` | 地块对象通过 `candidateActions` 引用行动 ID。 |

`scripts/validate-content.mjs` 需要交叉校验：地图对象引用的 `candidateActions` 必须存在于 call-actions 内容中；call-actions 的 ID 与 maps schema 中允许的枚举保持一致。

## 3. 静态内容模型

### 3.1 `call_action_definition`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `move` / `survey` / `gather` / `build` / `standby` / `extract` / `scan` / `stop` | 行动定义 ID，也是地图对象 `candidateActions` 的引用值。 |
| `category` | `universal` / `object_action` | 通用行动或对象行动。 |
| `label` | `string` | 按钮文案，可包含 `{objectName}`。 |
| `tone` | `neutral` / `accent` / `muted` / `danger` | UI 色调。 |
| `availableWhenBusy` | `boolean` | 队员忙碌时是否仍显示。 |
| `applicableObjectKinds` | `string[]` | 对象行动可应用的地块对象类型。 |
| `durationSeconds` | `number` | 创建行动时使用的默认耗时；`0` 可表示即时结算。 |
| `handler` | `string` | 代码侧 `callActionSettlement` handler ID。 |
| `params` | `object` | 透传给 handler 的结构化参数。 |

### 3.2 `candidateActions`

地块对象用 `candidateActions` 声明自己能提供哪些通话行动。对象必须先对玩家可见，行动才会进入通话页：

- `visibility = onDiscovered` 的对象在地块发现后可提供行动。
- `visibility = onInvestigated` 的对象需要调查揭示后才可提供行动。
- 客户端即使伪造 action ID，结算层仍要检查对象存在、对象已揭示、handler 存在。

## 4. 运行时视图模型

`src/callActions.ts` 把 `(crew, tile, gameState)` 转成通话页可渲染的按钮组：

| 视图 | 说明 |
| --- | --- |
| `CallActionGroup` | 一组按钮，例如“基础行动”或某个对象名。 |
| `CallActionView.id` | UI 提交用 ID；通用行动通常是 `survey`，对象行动可包含对象 ID。 |
| `CallActionView.defId` | 对应 `call_action_definition.id`。 |
| `CallActionView.objectId` | 对象行动关联的地块对象 ID。 |
| `disabled` / `disabledReason` | 不可执行原因，供 UI 展示或禁用。 |

显示规则：

- 队员待命时显示通用行动：调查当前区域、移动到指定区域、原地待命。
- 队员忙碌时只显示允许忙碌时使用的行动，例如停止当前行动、原地待命。
- 当前地块上已揭示对象的 `candidateActions` 会追加为对象行动按钮。
- 如果当前通话是事件 runtime call，则事件选项由 runtime call 提供；普通行动按钮不反向决定事件图分支。

## 5. 结算模型

`src/callActionSettlement.ts` 负责把按钮选择或行动完成转换为 `GameState` patch。

| 函数 | 职责 |
| --- | --- |
| `applyImmediateOrCreateAction` | 玩家点击通话行动时调用；即时行动直接改状态，耗时行动创建 `crew[].activeAction`。 |
| `settleAction` | 时间推进到 `finishTime` 后调用；结算调查、采集、回收、扫描、建设等结果。 |
| `actionHandlers` | handler 白名单；每个 handler 明确读写队员、地图、物品、日志和 trigger context。 |

结算结果可以包含：

- 更新后的队员状态和 `activeAction`。
- 地图发现 / 调查 / 对象揭示 / 特殊状态揭示。
- 队员携带物或资源变化。
- 系统日志。
- `arrival`、`action_complete`、`idle_time`、`call_choice` 等事件触发上下文。

## 6. 系统关系

### 地图模型

- `objects[].candidateActions` 是对象行动入口。
- `GameState.map` 决定对象是否已揭示。
- 地图页只展示和辅助选点，不直接执行行动。

### 队员模型

- `crew[].activeAction` 是行动运行时事实源。
- 通话行动会读取队员是否忙碌、是否可通讯、当前位置和背包。
- 行动完成后更新队员状态，并可能触发日记或事件。

### 事件模型

- 普通通话行动完成后可发出 `action_complete`，供事件候选选择。
- 事件 runtime call 的选项使用稳定 `option_id`，不复用普通通话 action ID。
- 事件 effect 若需要安排真实行动，应创建 `crew_action_state`，再桥接到 `crew[].activeAction`。

## 7. 校验规则

- 所有 `content/call-actions/*.json` 必须符合 `call-actions.schema.json`。
- 每个 `candidateActions` 引用必须存在于 call-actions 内容中。
- 每个 `handler` 必须存在于代码侧白名单。
- 对象行动必须声明适用的对象类型，避免同一 action 错挂到不支持的对象上。
- `durationSeconds` 必须为非负数。

## 8. 后续扩展记录

- 对象和行动数量增加后，可把动态按钮收敛为“与当前地块对象互动”子菜单。
- 完整背包 / 负重 / 交付基地规则应独立设计，不塞进通话行动模型。
- 行动 handler 可继续保持代码白名单；只有 metadata 和参数进入内容层。

## 来源

| 日期 | 来源 |
| --- | --- |
| 2026-04-28 | `docs/plans/2026-04-27-22-56/communication-table-gameplay-design.md` |
| 2026-04-28 | `docs/plans/2026-04-27-22-56/communication-table-gameplay-technical-design.md` |
