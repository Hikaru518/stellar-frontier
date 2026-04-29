---
topic: event-editor
date: 2026-04-28
research_scope:
  codebase: true
  internet: true
source:
  initial: docs/plans/2026-04-28-14-45/initial.md
  research_topics: docs/plans/2026-04-28-14-45/research-topics.md
---

# Research: event-editor

## 1. Research Summary（研究摘要）

本次研究确认：event editor 的价值明确，但它会改变项目当前边界。现有文档把"可视化事件编辑器、复杂剧情树编辑器"列为 out of scope；因此本轮策划案必须把 editor 定义为开发者 / 策划工具，而不是玩家玩法，并明确 MVP 不做复杂剧情树、不把编辑器元数据写进运行时内容。

事件内容已经具备较完整的数据契约：结构化 event definitions、call templates、handler registry、JSON Schema、Ajv 校验与程序级引用校验。最关键的设计问题不是"能不能显示 JSON"，而是如何把 schema、校验、预览、diff/review 和写回 `content/` 的路径组织成可靠的工作流。

外部资料支持 schema-first 的方向：JSON Schema 适合作为内容契约，但不应承载完整 UI；编辑器需要额外的 UI schema / renderer / widget 层，提供字段帮助、专用引用控件、预览和可导航校验结果。

## 2. Project Findings（项目内发现）

### 2.1 已有玩法系统（Existing Gameplay Systems）

- **事件系统**：事件以结构化资产、白名单 handler、静态校验、graph 与 option id 为核心；通话只是表现层，不应把逻辑埋入文本（证据：`docs/gameplay/event-system/event-system.md`、`apps/pc-client/src/events/`）。
- **内容驱动运行时**：游戏内容在 `content/`，设计说明在 `docs/`；修改 `content/` 后必须通过 `npm run validate:content`（证据：`AGENTS.md`、`scripts/validate-content.mjs`）。

### 2.2 现存叙事设定与角色（Existing Narrative & Crew）

- **编辑器模拟记录不进入玩家存档**：事件 dry-run、预览 transcript、debug trace 应保留在工具侧，不写入玩家 save policy（来源：`docs/game_model/event-integration.md`）。

### 2.3 现存 UI 设计（Existing UI Design）

- **editor 不是现有游戏页面**：`docs/ui-designs/ui.md` 只覆盖控制中心、通讯台、通话、地图；event editor 需要独立信息架构，但视觉上应延续低装饰、高信息密度、控制台式语言（来源：`docs/ui-designs/ui.md`、`docs/ui-designs/ui-design-principles.md`）。

### 2.4 设计原则（Design Principles）

- **内容与规则分离**：运行时 JSON 禁止携带 `editor_layout`、节点坐标、review 状态等编辑器元数据；字段命名使用英文 `snake_case`（来源：`docs/game_model/event.md`）。
- **out of scope 冲突**：现有项目约束明确不做可视化事件编辑器；本轮需记录为"开发者工具例外"，或在后续 wiki 整理时修订边界（来源：`AGENTS.md`、`docs/game_model/event.md`）。

### 2.5 最近 commits（Recent Changes）

- 当前工作区已有多处 docs、game_model、gameplay、plans 改动，说明事件、通讯、地图文档仍在演进；editor 策划案应以 `docs/game_model/event.md`、`scripts/validate-content.mjs` 和实际 `content/` 结构为准。

### 2.6 项目约束（Project Constraints）

- **事件内容结构**：`content/events/definitions/<domain>.json` 使用 `event_definitions`；`content/events/call_templates/<domain>.json` 使用 `call_templates`；另有 `handler_registry.json`、`presets/` 与 `content/schemas/events/*.schema.json`。
- **legacy 与结构化资产并存**：仍存在 `content/events/events.json` 和 `content/schemas/events.schema.json`，编辑器需要决定是否只支持结构化事件，或同时只读展示 legacy。
- **校验入口已有**：`scripts/validate-content.mjs` 使用 Ajv2020，并调用 `apps/pc-client/src/events/validation.ts` 的 `validateEventContentLibrary` 做跨文件引用校验；`VALIDATE_CONTENT_ROOT` 可用于替代根目录。
- **加载清单耦合**：`apps/pc-client/src/content/contentData.ts` 显式 import definitions、call_templates、presets；新增 domain 或 preset 文件后，游戏可能不会自动加载。
- **工程入口限制**：当前 Vite 是单入口 `index.html -> src/main.tsx`，`tsconfig.json` 只 include `src`；独立 `apps/editor/` app 需要单独配置并接入 Rush。
- **浏览器写回限制**：纯前端页面不能安全直接写 git 工作区；MVP 必须在"导出 JSON / diff"、"本地 Node helper"、"桌面壳"等写回模式中选一个。

## 3. Best Practice Findings（互联网发现）

### 3.1 参考游戏作品（Reference Games）

- **Unity Asset Database Search**：内容工具应提供按类型、标签、引用、路径等维度检索，而不是只给文件树。借鉴点：event browser 可按 domain、trigger、crew、handler、错误状态筛选。参考：https://docs.unity3d.com/Manual/search-adb.html
- **Unreal Diff Tool**：内容资产 diff/review 应作为一等入口。借鉴点：保存前展示 schema-aware diff、前后差异导航、影响摘要。参考：https://dev.epicgames.com/documentation/en-us/unreal-engine/ue-diff-tool-in-unreal-engine
- **LDtk / Tiled**：内容类型、schema、属性说明和预览紧密结合。借鉴点：未来 character/map/item editor 可共享 content type registry。参考：https://ldtk.io/docs/game-dev/json-overview/json-schema 、https://docs.mapeditor.org/en/stable/manual/custom-properties/

### 3.2 玩法模式与设计惯例（Patterns & Conventions）

- **Schema-first，但 UI 不塞进 schema**：JSON Schema 负责契约、校验、描述和枚举；表单布局、字段分组、专用控件用 UI schema / renderer / widget 层承载。参考：https://code.visualstudio.com/docs/languages/json
- **React 表单方案**：RJSF 上手快，支持 custom widgets / fields、objects / arrays、oneOf / anyOf / allOf；JSON Forms 更适合复杂编辑器，因为它把 JSON Schema 与 UI Schema 分离，并支持 renderer registry。参考：https://rjsf-team.github.io/react-jsonschema-form/docs/quickstart 、https://jsonforms.io/docs/tutorial/custom-renderers/
- **预览与原始 JSON 并排**：设计师需要 form 和 preview，开发者需要 raw JSON；Sanity / Decap 的 document views 与 preview templates 可作为参考。参考：https://www.sanity.io/docs/studio/create-custom-document-views-with-structure-builder 、https://www.decapcms.org/docs/customization/

### 3.3 已知陷阱（Known Pitfalls）

- **复杂 union schema 会伤害可用性**：`oneOf` / `anyOf` / `allOf` 的渲染和错误提示容易变差；Uniforms 官方也说明这些组合支持不完整。建议为事件类型使用带 discriminator 的 tagged union，并给专用控件。参考：https://ajv.js.org/json-schema.html 、https://uniforms.tools/docs/api-reference/bridges/
- **live validate 有性能成本**：字段级校验可即时；跨文件引用、ID 唯一性、handler 参数、call template 对齐更适合保存前或批量校验。参考：https://rjsf-team.github.io/react-jsonschema-form/docs/usage/validation/
- **验证报告要可导航**：Unreal Data Validation 的官方页本次未抓取成功，此点来自搜索摘要，需复核；Charon validate 提供 document id、schema、path、message、code 等结构化报告。参考：https://gamedevware.github.io/charon/advanced/commands/data_validate.html

### 3.4 SOTA / 新趋势（可选）

- **Git-backed editorial workflow**：Decap 的 editorial workflow 把草稿、审核、发布映射到 Git 分支 / PR / merge；本项目可先做本地 validate + diff，后续再接 PR 审核。参考：https://decapcms.org/docs/editorial-workflows/

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：独立 editor 入口 vs 复用游戏入口

- **独立 editor 的优势**：符合"策划工具不是玩家玩法"的边界；未来 character/map/item editor 可共享入口；不污染游戏页面流转。
- **复用游戏入口的优势**：更容易复用 `src` 状态和样式，初期配置少。
- **建议**：选择 `apps/editor/` 独立入口，但复用 `apps/pc-client/src/events` 的类型、校验和预览逻辑；不要挂载游戏 `App`。

### Trade-off 2：直接写回 content vs 导出 diff / 本地 helper

- **直接写回的优势**：策划体验最顺，保存即修改文件。
- **导出 diff / 本地 helper 的优势**：更符合浏览器安全模型，保留 Git review 与人工确认。
- **建议**：MVP 先选择导出 JSON / diff 或本地 Node helper，避免假设纯浏览器能写工作区；如果做 helper，保存后必须触发 `validate:content`。

### Trade-off 3：通用 JSON 编辑器 vs schema-aware 事件编辑器

- **通用 JSON 编辑器的优势**：实现快，覆盖面广。
- **schema-aware 事件编辑器的优势**：能展示字段含义、引用目标、handler 参数、call preview 和校验路径，更贴近策划工作。
- **建议**：MVP 可保留 raw JSON 面板，但主体验应是 schema-aware 列表、表单、预览、校验组合。

## 5. Key References（关键参考）

### 5.1 项目文件（Project Files）

- `AGENTS.md` — 内容、文档、校验和 out-of-scope 的项目级约束。
- `docs/game_model/event.md` — 事件资产契约、命名和 editor metadata 边界。
- `docs/game_model/event-integration.md` — 事件集成与存档边界。
- `docs/gameplay/event-system/event-system.md` — 事件系统玩法与结构化资产说明。
- `docs/ui-designs/ui-design-principles.md` — editor 应继承的控制台美学。
- `content/events/` — 事件 definitions、call templates、handler registry、presets。
- `content/schemas/events/` — 结构化事件 JSON Schema。
- `scripts/validate-content.mjs` — 内容校验入口。
- `apps/pc-client/src/events/validation.ts` — 跨文件程序校验。
- `apps/pc-client/src/content/contentData.ts` — 游戏内容加载清单。

### 5.2 外部链接（External Links）

- https://rjsf-team.github.io/react-jsonschema-form/docs/quickstart — RJSF 快速开始。
- https://jsonforms.io/docs/tutorial/custom-renderers/ — JSON Forms 自定义 renderer。
- https://ajv.js.org/json-schema.html — Ajv JSON Schema 与 discriminator。
- https://docs.unity3d.com/Manual/search-adb.html — Unity 资产搜索。
- https://dev.epicgames.com/documentation/en-us/unreal-engine/ue-diff-tool-in-unreal-engine — Unreal asset diff。
- https://www.sanity.io/docs/studio/create-custom-document-views-with-structure-builder — Sanity 文档多视图。
- https://decapcms.org/docs/editorial-workflows/ — Git-backed editorial workflow。

## 6. Open Questions for Design

- **Q1**：本轮 MVP 的写回策略是什么：只导出 JSON / diff，还是提供本地 Node helper 写入 `content/`？
- **Q2**：MVP 是否只支持结构化事件 definitions 与 call templates，还是也要展示 legacy `events.json`？
- **Q3**：editor 是否允许创建新 domain / preset 文件？如果允许，如何同步 `apps/pc-client/src/content/contentData.ts` 的加载清单？
- **Q4**：哪些编辑器元数据允许存在？若需要布局、草稿备注、review 状态，是否存 localStorage、侧车文件，还是本轮不做？
- **Q5**：event editor 的首要使用场景是"查阅理解"、"修改已有事件"、"新增事件"，还是"校验与排错"？

---

**Research Completed:** 2026-04-28 15:20  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
