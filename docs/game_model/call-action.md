# 通话行动模型

本文描述普通通话中的基础行动定义、按钮生成和行动结算数据契约。当前基础行动只包含移动到指定区域、原地待命、停止当前行动、调查当前区域。剧情动作由结构化地点事件、事件选项、`action_request` 或 objective 提供，不再由地图对象生成通用按钮。

## 1. 模型范围与命名

| 规则 | 说明 |
| --- | --- |
| `scope` | 覆盖 `content/universal-actions/universal-actions.json`、通话按钮视图、基础行动触发、与事件 runtime call 的边界。 |
| `out_of_scope` | 不定义完整背包 / 负重，不定义对象互动子菜单，不把所有普通行动改写成事件图。 |
| `content_source_of_truth` | 基础行动 metadata 来自 `content/universal-actions/universal-actions.json`；结构化地点事件来自 `content/events/definitions/*.json`。 |
| `runtime_source_of_truth` | 当前行动状态来自 `GameState.crew_actions`；地图发现 / 调查状态来自 `GameState.map`。 |
| `handler_policy` | JSON 只能声明事件 ID、条件和参数；具体状态修改由结构化事件 runtime 与白名单 effect / handler 执行。 |

## 2. 资产库布局

| 路径 | 内容 |
| --- | --- |
| `content/universal-actions/universal-actions.json` | 全员基础行动：移动、待命、停止、调查。 |
| `content/events/definitions/*.json` | 地点事件、剧情动作、事件图和结算规则。 |
| `content/events/call_templates/*.json` | 事件通话模板。 |
| `content/schemas/universal-actions.schema.json` | 基础行动内容 schema。 |

`scripts/validate-content.mjs` 需要校验基础行动 ID、事件 ID、结构化事件引用和 schema。地图对象不再承担通用按钮入口。

## 3. 静态内容模型

### 3.1 `universal_action_definition`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `universal:move` / `universal:standby` / `universal:stop` / `universal:survey` | 基础行动定义 ID。 |
| `category` | `universal` | 当前固定为基础行动。 |
| `label` | `string` | 按钮文案。 |
| `tone` | `neutral` / `accent` / `muted` / `danger` | UI 色调。 |
| `conditions` | `condition[]` | 按队员行动状态、通讯状态或上下文判断是否显示。 |
| `event_id` | `string` | 点击后进入的结构化事件或系统处理入口。 |

### 3.2 四类基础行动

| 行动 | 说明 | 运行时结果 |
| --- | --- | --- |
| 移动到指定区域 | 进入地图选点并在通话页确认目标。 | 创建 `crew_actions` 移动行动，抵达后发出 `arrival`。 |
| 原地待命 | 队员保持待命或记录一次待命事实。 | 写入 `crew_actions` 或触发 `idle_time`。 |
| 停止当前行动 | 中断当前 active 行动并回到待命。 | 创建停止行动，完成后标记原行动 interrupted。 |
| 调查当前区域 | 以当前地块、可见对象和队员上下文检查地点事件。 | 命中事件时创建 runtime call；否则显示中性空结果。 |

## 4. 运行时视图模型

通话页把 `(crew, tile, gameState)` 转成可渲染按钮组：

| 视图 | 说明 |
| --- | --- |
| `CallActionGroup` | 一组按钮，例如“基础行动”。 |
| `CallActionView.id` | UI 提交用 ID，例如 `universal:move`。 |
| `CallActionView.eventId` | 对应结构化事件或系统处理入口。 |
| `disabled` / `disabledReason` | 不可执行原因，供 UI 展示或禁用。 |

显示规则：

- 队员待命时显示移动、原地待命、调查当前区域。
- 队员忙碌时只显示停止当前行动，必要时显示原地待命。
- 当前通话是事件 runtime call 时，事件选项由 runtime call 提供；基础行动按钮不反向决定事件图分支。

## 5. 结算模型

基础行动选择最终写入 `GameState.crew_actions` 或推进结构化事件 runtime。

| 行为 | 结算职责 |
| --- | --- |
| 移动 | 创建移动行动，记录路线、开始时间、完成时间和目标地块。 |
| 待命 | 清理或保持队员行动状态，并可触发 `idle_time`。 |
| 停止 | 中断当前 active 行动，创建停止行动或进入待命。 |
| 调查 | 生成当前区域调查上下文，交给结构化地点事件选择。 |

结算结果可以包含：

- 更新后的 `crew_actions`。
- 地图发现 / 调查 / 对象揭示 / 特殊状态揭示。
- 队员携带物或资源变化。
- 系统日志。
- `arrival`、`action_complete`、`idle_time`、`call_choice` 等事件触发上下文。

## 6. 系统关系

### 地图模型

- `GameState.map` 决定地块是否已发现、是否已调查、对象和特殊状态是否已揭示。
- 地图页只展示和辅助选点，不直接执行行动。
- 地块对象通过类型、标签和可见性参与结构化事件条件。

### 队员模型

- `crew_actions` 是行动运行时事实源。
- 通话行动会读取队员是否忙碌、是否可通讯、当前位置和背包。
- 行动完成后更新队员状态，并可能触发日记或事件。

### 事件模型

- 基础行动完成后可发出 `arrival`、`action_complete` 或 `idle_time`，供事件候选选择。
- 事件 runtime call 的选项使用稳定 `option_id`，不复用基础行动 ID。
- 事件 effect 若需要安排真实行动，应创建或更新 `crew_action_state`。

## 7. 校验规则

- `content/universal-actions/universal-actions.json` 必须符合 schema。
- 每个 `universal_action.id` 必须属于当前四类基础行动。
- 每个 `event_id` 必须能解析到结构化事件或允许的系统入口。
- 基础行动条件必须能在当前 condition runtime 中求值。
- 剧情动作不得通过地图对象通用按钮绕过事件系统。

## 8. 后续扩展记录

- 完整背包 / 负重 / 交付基地规则应独立设计，不塞进基础行动模型。
- 如果未来需要对象级耗时、消耗或工具需求，应扩展结构化事件或目标模型。

## 来源

| 日期 | 来源 |
| --- | --- |
| 2026-04-28 | `docs/plans/2026-04-27-22-56/communication-table-gameplay-design.md` |
| 2026-04-28 | `docs/plans/2026-04-27-22-56/communication-table-gameplay-technical-design.md` |
