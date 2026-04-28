---
topic: event-editor
date: 2026-04-28
status: draft
scope: feature
source:
  initial: docs/plans/2026-04-28-14-45/initial.md
  research: docs/plans/2026-04-28-14-45/research.md
  interview: docs/plans/2026-04-28-14-45/event-editor-interview.md
target_wiki: docs/gameplay/event-editor/event-editor.md
---

# Event Editor 策划案

## 1. 概述（What & Why）

Event Editor 是一个面向策划与开发者的 Game Editor 模块，用于浏览、理解、校验、编辑并写回 `content/` 下的结构化事件内容。它不属于玩家可进入的游戏玩法，而是独立于游戏 `src/main.tsx` 入口的内容生产工具；本轮先开放 Event Editor，并在轻量 Game Editor shell 中为后续 Character / Map / Item / NPC Editor 预留位置。

这个工具的核心价值是把当前分散在 JSON、schema、handler registry、call template 和校验脚本中的事件知识集中展示，让策划能看懂事件结构，开发者能追踪引用与错误，并让有效修改经过本地 helper 安全落盘到 `content/`。

## 2. 设计意图（Design Intent）

Event Editor 的设计意图是降低结构化事件内容的理解与维护成本，让事件从“只能由熟悉 JSON 和引擎细节的人修改”变成“策划可以看懂、开发者可以验证、双方可以共同审阅”的内容资产。它应优先支持查阅、理解和校验，再在同一工作流中提供受保护的编辑与写回。

这个工具要避免三类体验：第一，把复杂 JSON 原样丢给策划而没有 schema、引用和预览上下文；第二，做成脱离运行时校验的自由表单，导致保存后的内容无法被游戏读取；第三，把本轮做成复杂剧情树画布，过早引入布局、节点拖拽和 editor metadata。MVP 的目标是清晰、可信、可落盘，而不是做一个完整叙事 IDE。

## 3. 核心概念与术语（Core Concepts & Terminology）

- **Game Editor**：独立于玩家游戏入口的内容生产工具入口，作为 Rush app 位于 `apps/editor/`。本轮只开放 Event Editor，并为未来 Character / Map / Item / NPC Editor 保留导航位置。
- **Event Editor**：Game Editor 中负责事件内容的模块，面向结构化事件 definitions、call templates、handler registry、schema、校验结果和预览。
- **结构化事件（structured event）**：位于 `content/events/definitions/<domain>.json` 的事件定义，包含触发、条件、graph、效果和 sample contexts 等运行时字段。
- **Call Template**：位于 `content/events/call_templates/<domain>.json` 的通话表现模板，用于把事件节点和选项渲染成玩家可见的通讯内容。
- **Domain**：一组事件内容的领域文件，如 `mountain`、`forest`。MVP 支持创建新 domain，并确保新增内容能被游戏加载。
- **Local Helper**：本地 Node/CLI 写回服务，接收 editor 的保存请求，负责写入 `content/`、格式化 JSON、运行内容校验并返回结果。
- **Validation Gate**：保存门禁。内容只有通过 schema 校验与跨文件引用校验后，才能写入最终 `content/` 文件。
- **Editor Metadata**：草稿状态、筛选偏好、面板布局、review 备注、图布局坐标等仅服务编辑器体验的数据。MVP 中这些数据只保存在本机，不写入运行时 JSON。

## 4. 核心循环与玩家体验（Core Loop & Player Experience）

### 4.1 用户旅程

1. 策划或开发者打开 `apps/editor/` 下的 Game Editor，进入轻量 shell。
2. 用户从导航进入 Event Editor；其他 editor 入口可见但标记为未来模块。
3. 左侧内容浏览器按 domain、事件 ID、trigger、校验状态和搜索词展示结构化事件。
4. 用户选择一个事件后，中间区域始终并排显示表单视图与原始 JSON 视图，便于策划理解字段，也便于开发者核对实际内容。
5. 右侧标签面板展示 schema 说明、call preview、只读 graph 结构预览和 validation 结果。
6. 用户修改 definitions 或 call templates；editor 在本机草稿中保存未落盘状态，并提示变更范围。
7. 用户点击保存；Local Helper 写入前运行格式化、schema 校验和跨文件引用校验。
8. 校验通过后内容写入 `content/`；校验失败时不写入最终文件，错误定位回表单字段、JSON path 和全局报告。

### 4.2 典型情境

- **高光时刻**：策划从一个事件 ID 出发，能在同一屏看到它的触发条件、graph、通话表现、schema 说明和错误状态，并在修改后确认内容已经通过校验并落盘。
- **低谷 / 摩擦点**：新增 domain 或调整 call template 时，用户可能不知道还需要同步加载清单或引用关系；editor 必须把这些问题转成明确的校验错误或保存前提示，而不是让游戏运行时才失败。

## 5. 机制与规则（Mechanics & Rules）

### 5.1 状态与状态机

- **只读浏览态**：未选中事件或未产生修改。用户可以搜索、筛选、查看 schema、预览和校验结果。
- **草稿编辑态**：用户修改表单或 JSON 后进入本机草稿状态。草稿保存在 editor 本机状态中，不写入 `content/`，也不进入 Git。
- **待保存态**：用户点击保存后，editor 将变更提交给 Local Helper。此时 UI 显示写入目标文件、变更摘要和校验进度。
- **保存成功态**：Local Helper 完成格式化、校验和写入，返回成功结果。UI 清除对应草稿，并刷新内容浏览器与校验状态。
- **保存失败态**：schema 或跨文件校验失败时，Local Helper 不写入最终 `content/` 文件。UI 保留草稿，并展示字段级、JSON path 级和全局错误。

### 5.2 规则与公式

- **入口规则**：editor 是 monorepo 中的独立 Rush app，位于 `apps/editor/`，不挂载玩家游戏 `App`，但可以复用事件类型、校验、渲染和样式 token。
- **内容覆盖规则**：MVP 可编辑 `content/events/definitions/<domain>.json` 与 `content/events/call_templates/<domain>.json`；展示 `handler_registry.json` 与 `content/schemas/events/*.schema.json`；legacy `content/events/events.json` 只读展示并标记为旧格式。
- **新增规则**：MVP 支持新建 domain 文件包，包括 definitions 与 call templates。新增后必须确保游戏加载路径同步，不能出现"文件存在但游戏读不到"的状态。
- **Graph 规则**：graph 字段通过表单或 JSON 编辑；只读 graph 预览用于理解节点与边，不支持拖拽节点、连线编辑或保存图布局。
- **写回规则**：所有保存必须经过 Local Helper。Helper 写入前先格式化和校验；校验失败时阻止写入最终 `content/` 文件。
- **元数据规则**：editor metadata 不写入运行时 JSON。个人偏好、筛选状态、未保存草稿等只保存在本机。

### 5.3 参数与默认值

- **默认内容范围**：结构化 definitions 与 call templates。
- **默认保存门禁**：schema 校验 + 跨文件引用校验全部通过。
- **默认视图布局**：左侧内容浏览器；中间表单与 JSON 并排；右侧 Schema / Preview / Graph / Validation 标签。
- **默认搜索维度**：domain、event ID、trigger、handler、校验状态、文本关键词。
- **默认 graph 能力**：只读结构预览，不保存布局。

## 6. 系统交互（System Interactions）

- **依赖于**：`content/events/` 的结构化事件文件、`content/schemas/events/` 的 JSON Schema、`handler_registry.json`、`scripts/validate-content.mjs`、`apps/pc-client/src/events/validation.ts`、`apps/pc-client/src/events/callRenderer.ts`。
- **被依赖于**：后续 Character / Map / Item / NPC Editor 可以复用 Game Editor shell、内容浏览器、schema 面板、validation 面板和 Local Helper 写回流程。
- **共享对象 / 状态**：事件 definitions、call templates、schema、handler registry、sample contexts、校验报告、未保存草稿。
- **事件 / 信号**：打开文件、选择事件、修改字段、切换 JSON、运行预览、保存请求、校验通过、校验失败、写入成功、写入失败。

Event Editor 与玩家游戏共享内容契约，但不共享玩家运行时状态。editor 预览可以构造模拟上下文和 dry-run 结果，但这些结果不写入玩家存档，也不改变游戏世界状态。

## 7. 关键场景（Key Scenarios）

### 7.1 典型场景

- **S1：查阅事件**：用户搜索事件 ID → 选中事件 → 同屏看到表单、JSON、schema、call preview 和 graph 预览。
- **S2：修正已有事件**：用户修改条件或文案 → 保存 → Local Helper 运行校验 → 校验通过后写入对应 definitions 或 call templates 文件。
- **S3：新增 domain**：用户创建新 domain → editor 生成 definitions 与 call templates 基础文件 → 同步加载路径 → 校验通过后落盘。
- **S4：定位校验错误**：用户打开 Validation 标签 → 点击错误 → editor 定位到表单字段与 JSON path，并展示相关 schema 说明。

### 7.2 边界 / 失败场景

- **F1：schema 校验失败**：字段类型、枚举或必填项错误 → 保存被阻止 → UI 保留草稿并定位错误字段。
- **F2：跨文件引用失败**：event 引用不存在的 call template、handler 或 option id → 保存被阻止 → Validation 面板展示引用来源与缺失目标。
- **F3：新增 domain 未被游戏加载**：helper 检测到新文件未进入加载路径 → 保存被阻止或要求同步加载清单 → 用户不能得到"已保存但游戏不可见"的假成功。
- **F4：JSON 与表单冲突**：用户在 JSON 视图输入无法解析的内容 → 表单暂停同步并显示解析错误，直到 JSON 恢复合法。

## 8. 取舍与反模式（Design Trade-offs & Anti-patterns）

- **取舍 1**：选了独立 Game Editor 入口而非复用游戏入口，理由：editor 是生产工具，不应污染玩家页面流转，也需要为未来多类内容编辑器预留空间。
- **取舍 2**：选了浏览器 editor + 本地 Node helper，而非纯浏览器直写，理由：纯浏览器不能可靠直接写仓库文件；helper 能承担写入、格式化和校验门禁。
- **取舍 3**：选了表单编辑 + JSON 并排 + 只读 graph 预览，而非可视化节点编辑器，理由：本轮目标是清晰、可信、可落盘，不是复杂剧情树画布。
- **取舍 4**：选了校验失败不写入最终 `content/`，理由：`content/` 是运行时数据源，不能让无效内容破坏游戏可运行性。
- **要避免的反模式**：把 editor metadata 写进运行时 JSON；只做自由 JSON 编辑器而没有 schema 与引用上下文；保存后不运行内容校验；新增文件后不处理游戏加载路径；把 legacy 与结构化事件都做成可编辑导致模型混乱。

## 9. 参考与灵感（References & Inspiration）

- **RJSF / JSON Forms**：参考 JSON Schema 驱动表单、custom widgets、UI schema 与 renderer registry，用于把 schema 契约转换成可用编辑界面。参考：https://rjsf-team.github.io/react-jsonschema-form/docs/quickstart 、https://jsonforms.io/docs/tutorial/custom-renderers/
- **Ajv**：参考 `oneOf`、`anyOf`、`allOf` 与 discriminator 的行为，用于设计 union 字段的校验和错误提示。参考：https://ajv.js.org/json-schema.html
- **Unity Asset Database Search**：参考内容浏览器的筛选、搜索和定位方式。参考：https://docs.unity3d.com/Manual/search-adb.html
- **Unreal Diff Tool**：参考内容资产 diff、差异导航和 review 体验。参考：https://dev.epicgames.com/documentation/en-us/unreal-engine/ue-diff-tool-in-unreal-engine
- **Sanity document views**：参考 form、preview、JSON 多视图并存的内容编辑体验。参考：https://www.sanity.io/docs/studio/create-custom-document-views-with-structure-builder
- **项目内文档**：`docs/game_model/event.md`、`docs/game_model/event-integration.md`、`docs/gameplay/event-system/event-system.md`、`docs/ui-designs/ui-design-principles.md` 是本策划案的主要内部约束来源。

---

## 10. 本轮范围与阶段拆分（Scope & Phasing for This Round）

### 10.1 MVP（本轮必做）

- 建立 `apps/editor/` 下的轻量 Game Editor shell，并只开放 Event Editor。
- 提供 Event Editor 三栏工作台：内容浏览器、表单 + JSON 并排编辑区、Schema / Preview / Graph / Validation 右侧标签。
- 支持浏览、搜索和筛选结构化 event definitions 与 call templates。
- 支持编辑已有 definitions 与 call templates，并通过 Local Helper 写回 `content/`。
- 支持创建新 domain 文件包，并处理游戏加载路径或加载清单同步。
- 展示 handler registry、JSON Schema 与 legacy `events.json`；legacy 只读，不进入编辑范围。
- 保存时运行格式化、schema 校验和跨文件引用校验；失败时阻止写入最终 `content/`。
- 支持 call preview、sample context 预览和只读 graph 结构预览。
- editor metadata 仅保存在本机，不写入运行时 JSON。

### 10.2 Later（未来再做，明确本轮不做）

- Character / Map / Item / NPC Editor 的实际编辑能力。
- 可视化节点拖拽、连线编辑、graph 布局保存。
- Git PR / review 工作流、多人协作、权限和发布审批。
- schema-aware diff 的完整 review 系统。
- presets 的完整编辑器与更严格的 schema / 校验补齐。
- 桌面应用 / Electron 版本。

### 10.3 不做（Out of Scope，避免范围膨胀）

- 不把 editor 做成玩家可进入的玩法页面。
- 不把 editor metadata 写入运行时 JSON。
- 不支持编辑 legacy `content/events/events.json`。
- 不在本轮实现复杂剧情树 IDE。
- 不绕过 `validate:content` 或等价校验直接写入最终内容。
- 不让 editor 产生玩家存档、事件历史或游戏世界状态变更。

## 11. 本轮验收与风险（Acceptance & Risks）

### 11.1 Player Stories / Play Scenarios（验收切片）

#### PS-001: 浏览结构化事件

- **作为**：策划或开发者
- **我能**：从 Game Editor 进入 Event Editor，按 domain、ID、trigger 和校验状态查找事件
- **以便**：快速理解当前事件内容结构
- **验收标准**：
  - [ ] Event Editor 可列出结构化 definitions 与 call templates。
  - [ ] 选择事件后可看到表单、JSON、schema、preview、graph 和 validation 信息。
  - [ ] Legacy `events.json` 可见但标记为只读旧格式。
- **不包含**：编辑 legacy events。
- **优先级**：P0

#### PS-002: 安全修改并写回事件

- **作为**：策划或开发者
- **我能**：修改已有事件或 call template，并保存到 `content/`
- **以便**：不用手动在多个 JSON 文件中查找和修改内容
- **验收标准**：
  - [ ] 保存请求必须通过 Local Helper。
  - [ ] 校验通过后，对应 JSON 文件被格式化并写入。
  - [ ] 校验失败时最终 `content/` 文件不被写入，草稿仍可继续编辑。
- **不包含**：无校验强行写入。
- **优先级**：P0

#### PS-003: 新建 domain

- **作为**：开发者或高级策划
- **我能**：创建新的事件 domain 文件包，并让游戏加载路径同步
- **以便**：新增内容领域不会停留在“文件存在但游戏读不到”的状态
- **验收标准**：
  - [ ] Editor 可创建 definitions 与 call templates 基础文件。
  - [ ] 新 domain 通过内容校验。
  - [ ] 新 domain 被游戏内容加载路径识别，或保存被明确阻止并提示需要同步的步骤。
- **不包含**：自动生成完整可玩剧情包。
- **优先级**：P1

### 11.2 成功标准（Success Criteria）

- [ ] 策划能在不先阅读全部 JSON schema 的情况下理解一个事件的触发、graph、通话表现和校验状态。
- [ ] 开发者能从校验错误跳转到具体字段、JSON path 和相关引用。
- [ ] 修改后的内容只有在通过校验时才写入最终 `content/`。
- [ ] 新建 domain 不会造成校验通过但游戏无法加载的断层。
- [ ] `content/` 中不出现 editor layout、草稿、review 状态或图坐标。

### 11.3 风险与缓解（Risks & Mitigations）

- **R1**：现有文档把可视化事件编辑器列为 out of scope。
  - **缓解**：本策划案将其定义为开发者 / 策划工具，且不做复杂剧情树画布；后续合并 wiki 时明确修订边界。
- **R2**：Local Helper 增加工程复杂度和本地安全边界。
  - **缓解**：helper 只接受限定的 content 写入操作；保存前展示目标路径和变更摘要；所有写入经过校验门禁。
- **R3**：表单与 JSON 双向同步容易产生状态冲突。
  - **缓解**：JSON 解析失败时暂停表单同步并保留草稿；恢复合法 JSON 后再同步。
- **R4**：新建 domain 牵涉加载清单或动态发现机制。
  - **缓解**：把加载路径同步纳入保存门禁；无法同步时阻止保存并给出明确步骤。
- **R5**：schema-driven 表单难以优雅表达复杂 union 与 handler 参数。
  - **缓解**：对条件、效果、handler 参数等复杂字段提供专用 renderer，而不是完全依赖通用 JSON Schema 表单。

## 12. Open Questions

- **Q1**：Local Helper 的具体形态是长期运行的本地服务、一次性 CLI，还是 Vite dev server 插件？
- **Q2**：新建 domain 时，游戏加载路径应改为动态发现、生成 manifest，还是继续维护显式 import 清单？
- **Q3**：Schema-aware diff 是否进入 MVP，还是只保留普通 JSON diff / 变更摘要？
- **Q4**：Call preview 需要模拟到什么程度：只渲染文案，还是执行部分 graph / condition / effect dry-run？
- **Q5**：Presets 是否需要在本轮只读展示，还是补齐 schema 后进入后续编辑范围？
