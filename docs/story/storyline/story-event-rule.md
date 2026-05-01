# Story-Event Rule (Global)

本文件定义通用 story-event 的命名规则与书写规则，用于把叙事剧情转换为可映射 event system 的文档模式。

## 1) 文件命名规则

命名格式：

`<StoryPrefix>_<main|side>_<unique-id>_<slug>.md`

### 1.1 前缀

- `StoryPrefix`：故事前缀，按篇章/星球定义。
  - 示例：`IAFS`（Ice and Fire Star）

### 1.2 类型

- `main`：主线剧情文件。
- `side`：支线剧情文件（包含主剧情内部可选支线）。

### 1.3 unique-id 规则

- 主线：`<阶段数字><字母>`，字母必须使用连续字母序（alpha/beta 对应 `A/B/C...`）。
  - 同一阶段必须从 `A` 开始，连续递增：`1A`、`1B`、`1C`...
  - 禁止跳字母或临时字母：例如 `3M` 不允许。
  - 示例：`3A`、`3B`、`3C`、`3D`。
- 支线：纯数字 ID（建议两位补零），例如 `01`、`02`、`03`...。
  - 禁止字母支线 ID：例如 `3A`、`3B`、`3C` 不允许用于支线。

### 1.4 slug 规则

- 全小写英文短语。
- 使用 `-` 连接。
- 仅使用 ASCII 字符。
- 示例：
  - `IAFS_main_3A_gate-contact-setup.md`
  - `IAFS_main_3B_gate-language-probe.md`
  - `IAFS_side_01_frozen-vow.md`

### 1.5 主线拆分粒度规则

- 主线不以“整阶段一个文件”为上限，必须拆成多个小剧情文件。
- 每个小剧情文件只覆盖一个清晰推进单元（单入口、单核心冲突、可结算）。
- 对同一阶段，按时间/行动顺序连续编号：
  - 例如第三阶段：`3A`（首次接触）-> `3B`（证据校验）-> `3C`（策略定向）-> `3D`（门域进入前置）。

## 2) Story-Event 文档书写规则

每个 story-event 文件使用同一骨架，顺序固定：

1. `Meta`
2. `Narrative Intent`
3. `Trigger Contract`
4. `Preconditions`
5. `Node Flow`
6. `Choice Matrix`
7. `Effects Matrix`
8. `Outcome & Mainline Coupling`
9. `Call Template Notes`
10. `Schema Draft`
11. `Open Questions`

## 3) 各章节最小要求

### 3.1 Meta

必须包含：

- `event_id`
- `line_type`
- `unique_id`
- `source_anchor`
- `target_file`

### 3.2 Narrative Intent

- 用 1-3 条说明玩家体验目标，不写实现细节。

### 3.3 Trigger Contract

- 明确 `trigger.type`（如 `action_complete`、`call_choice`、`idle_time`）。
- 给出 required context 字段。

### 3.4 Preconditions

- 写成结构化条件语义，可映射到 condition schema。
- 避免“自然语言不可判定”的条件描述。

### 3.5 Node Flow

- 使用节点表或列表，必须包含：
  - `node_id`
  - `node_type`（来自 event graph 白名单）
  - `enter condition`
  - `next`（默认去向/分支去向）

### 3.6 Choice Matrix

- 每个玩家选项必须有稳定 `option_id`。
- 每个选项必须有明确后续节点与失败去向。

### 3.7 Effects Matrix

- 每条效果包含：`effect_type`、`target`、`params`、`failure_policy`、`record_policy`。
- 明确是否写 `event_log` 和 `world_history`。

### 3.8 Outcome & Mainline Coupling

- 至少列出 2-3 个结局结果 key。
- 写明对主线的影响（策略可行性、资源、信任、终局代价）。

### 3.9 Call Template Notes

- 标注 `call_template_id`。
- 明确 `option_lines` key 必须与 `options[].id` 一致。

### 3.10 Schema Draft

- 给出可直接落地的 JSON 草案骨架：
  - `event_definition`
  - `event_graph`
  - `call_template`（若有 call 节点）

### 3.11 Open Questions

- 仅记录阻塞实现的问题。
- 非阻塞项不进入该章节。

## 4) 与 Event System 对齐规则

必须对齐以下文档与 schema：

- `docs/gameplay/event-system/event-system.md`
- `docs/game_model/event.md`
- `docs/game_model/event-integration.md`
- `content/schemas/events/event-definition.schema.json`
- `content/schemas/events/event-graph.schema.json`
- `content/schemas/events/call-template.schema.json`
- `content/schemas/events/condition.schema.json`
- `content/schemas/events/effect.schema.json`

关键约束：

- 节点类型只能使用 schema 白名单。
- handler 必须在 `handler_registry` 白名单内。
- `call` 选项 ID 与模板 key 必须一一对应。
- 所有引用 ID 需可解析（crew/item/resource/tile/template）。

## 5) 链接与同步规则

- `IAFS_index.md` 是拆分进度总索引。
- 每新增/完成一个 story-event 文件，需同步：
  - `IAFS_story.md`：改为“摘要 + 文件链接”
  - `IAFS_wiki.md`：补充该条 story-event 文件映射
  - `docs/story/index.md`：必要时补入口

## 6) 执行顺序（推荐）

1. 先更新 `IAFS_index.md` 条目状态。
2. 再编写/更新对应 story-event 文件。
3. 最后回写 story/wiki/index 链接。
