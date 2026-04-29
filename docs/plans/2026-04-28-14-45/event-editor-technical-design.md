---
topic: event-editor
date: 2026-04-28
status: draft
source:
  design: docs/plans/2026-04-28-14-45/event-editor-design.md
  research: docs/plans/2026-04-28-14-45/research.md
  interview: docs/plans/2026-04-28-14-45/event-editor-interview.md
---

# Event Editor Technical Design

## 1. 背景与目标

Event Editor 是一个位于 `apps/editor/` 的本地策划工具，也是 Rush monorepo 中的独立 app 项目。它不挂载玩家游戏 `src/main.tsx`，不进入玩家页面流转，也不写入玩家存档。它共享 `content/`、事件 schema、事件校验和通话渲染逻辑，用于浏览、理解、编辑并安全写回结构化事件内容。

本轮 MVP 的目标是建立一条可信的本地内容生产闭环：

- 策划或开发者从独立 Game Editor shell 进入 Event Editor。
- 用户浏览、搜索和筛选结构化 event definitions 与 call templates。
- 用户在同一屏查看表单、原始 JSON、schema 说明、通话表现预览、只读 graph 结构和 validation 结果。
- 用户修改已有 definitions / call templates，或创建新 domain 文件包。
- 本地 helper 在写入最终 `content/` 前完成格式化、manifest 同步、schema 校验和跨文件引用校验。
- 校验失败时不写入最终 `content/`，草稿保留在 editor 本机状态。

本轮不做完整游戏模拟、复杂剧情树画布、多人 review / PR 工作流、legacy `content/events/events.json` 编辑、Character / Map / Item / NPC Editor 的实际编辑能力。

## 2. 已确认架构决策

### ADR-001：Editor 使用独立 Vite 入口

采用 `apps/editor/index.html`、`apps/editor/src/main.tsx`、`apps/editor/vite.config.ts` 和 `apps/editor/tsconfig.json`。根 `package.json` 保留 editor 转发 scripts，具体依赖和项目脚本由 `@stellar-frontier/editor` 管理。玩家游戏仍使用 `apps/pc-client` 自己的 `index.html`、`src/main.tsx` 和 `vite.config.ts`。

理由：editor 是生产工具，不应污染玩家 SPA 路由；独立 Vite 配置也让 helper 代理、测试入口和构建输出更清楚。

### ADR-002：Local Helper 使用独立 Node localhost API

采用独立 Node 进程提供 localhost API，优先使用 Node 内置模块实现 HTTP、文件读写、路径限制和子进程调用。helper 只监听 `127.0.0.1`，只允许访问仓库内白名单路径。

理由：浏览器不能直接可靠写入 git 工作区；独立 helper 比 Vite middleware 更容易被后续 Character / Map / Item Editor 复用。

### ADR-003：新 domain 通过 manifest 与生成模块进入游戏加载路径

新增 `content/events/manifest.json` 作为事件 domain 清单，新增脚本生成 `apps/pc-client/src/content/generated/eventContentManifest.ts`。`apps/pc-client/src/content/contentData.ts` 改为从生成模块读取结构化 definitions、call templates、handler registry 和 presets。

helper 创建新 domain 时更新 `content/events/manifest.json`，运行生成脚本，再进入校验门禁。禁止 helper 直接拼接修改 `apps/pc-client/src/content/contentData.ts` 的 import 代码。

### ADR-004：表单层使用 RJSF 混合方案

新增 RJSF 作为基础 schema-driven 表单层。普通对象、字符串、枚举、数组和必填字段由 JSON Schema 驱动；graph、conditions/effects、handler params、event/call template 引用字段使用 custom fields / widgets。

理由：项目事件内容已由 JSON Schema 约束。RJSF 能减少基础字段重复实现；复杂事件结构仍需要专用 UI，避免把 graph 和跨文件引用暴露为难读的嵌套 JSON 数组。

### ADR-005：MVP 不模拟完整游戏运行

Editor 只做通话表现预览和保存前变更摘要。通话预览复用 `renderRuntimeCall`，基于 event 的 call node、call template 和 sample context 渲染文本与选项。不推进时间，不移动队员，不执行 effects，不写玩家存档。

## 3. 系统架构

### 3.1 运行时组成

```text
apps/editor React app
  -> localhost HTTP API
apps/editor/helper Node process
  -> read/write content/events/*
  -> update content/events/manifest.json
  -> run apps/editor/scripts/generate-event-content-manifest.mjs
  -> run npm run validate:content with a temp content root
  -> return structured schema/reference issues
apps/pc-client/src/content/contentData.ts
  -> imports apps/pc-client/src/content/generated/eventContentManifest.ts
  -> exposes eventContentLibrary to the player game
```

### 3.2 数据流

1. Editor 启动后请求 helper 的 `/api/event-editor/library`。
2. Helper 从文件系统读取 definitions、call templates、handler registry、schemas、manifest、legacy summary 和 validation report。
3. Editor 构建本机草稿状态。草稿只存在 React state 与 localStorage，不写入 `content/`。
4. 用户编辑表单或 JSON。表单与 JSON 共享同一份 draft document；JSON 解析失败时暂停表单同步并显示错误。
5. 用户保存。Editor 发送 draft、目标路径、base file hashes 和变更摘要到 helper。
6. Helper 在临时目录中应用 draft，格式化 JSON，更新 manifest / 生成模块，运行校验。
7. 校验通过后 helper 才写入最终文件；校验失败则返回 structured issues，不改最终 `content/`。

### 3.3 可复用现有模块

- `apps/pc-client/src/events/contentIndex.ts`：构建 event / call template / handler 索引。
- `apps/pc-client/src/events/validation.ts`：跨文件引用与 graph 规则校验。
- `apps/pc-client/src/events/callRenderer.ts`：通话表现预览。
- `scripts/validate-content.mjs`：内容校验入口；helper 可以通过 `VALIDATE_CONTENT_ROOT` 对临时目录运行校验。
- `src/components/Layout.tsx` 与 `src/styles.css`：editor 可复用或镜像控制台视觉组件。

## 4. 数据模型与内容契约

### 4.1 Event Library

Editor 内部以 `EventContentLibrary` 为核心数据结构：

```ts
interface EventContentLibrary {
  event_definitions: EventDefinition[];
  call_templates: CallTemplate[];
  handlers: HandlerDefinition[];
  presets: PresetDefinition[];
}
```

Helper 返回时额外提供文件归属信息，便于保存时定位写回目标：

```ts
interface EditorEventAsset<T> {
  id: string;
  domain: string;
  asset_type: "event_definition" | "call_template" | "handler" | "preset" | "legacy_event";
  file_path: string;
  json_path: string;
  base_hash: string;
  data: T;
  editable: boolean;
}
```

Legacy `content/events/events.json` 只以 `editable: false` 展示。UI 必须清楚标记它是旧格式，不进入保存 API。

### 4.2 Event Manifest

新增 `content/events/manifest.json`：

```json
{
  "schema_version": "event-manifest.v1",
  "domains": [
    {
      "id": "forest",
      "definitions": "definitions/forest.json",
      "call_templates": "call_templates/forest.json",
      "presets": "presets/forest.json"
    }
  ]
}
```

规则：

- `domains[].id` 必须与 definitions / call templates 内的 `domain` 字段一致。
- `definitions` 与 `call_templates` 是 MVP 必填。
- `presets` 可为 `null` 或省略。
- manifest 路径只能指向 `content/events/` 下的 JSON 文件。
- 生成脚本必须检查 manifest 与实际文件互相覆盖：manifest 列出的文件存在；结构化 definitions / call templates 目录下的 domain 文件也必须在 manifest 中出现。

### 4.3 生成的 Runtime 聚合模块

新增 `apps/pc-client/src/content/generated/eventContentManifest.ts`，由脚本生成，不手写业务逻辑。它静态 import manifest 中列出的 JSON 文件，并导出：

```ts
export const generatedEventProgramDefinitions: EventDefinition[];
export const generatedCallTemplates: CallTemplate[];
export const generatedPresetDefinitions: PresetDefinition[];
```

`apps/pc-client/src/content/contentData.ts` 只保留 legacy events、crew、items、map、call actions 等非结构化 import；结构化事件数组改为引用生成模块。这样新增 domain 时 helper 不需要修改 `contentData.ts`。

## 5. Helper API 设计

### 5.1 API 原则

- 只监听 `127.0.0.1`。
- 只接受 JSON request / response。
- 所有路径参数使用仓库相对路径，并通过 `path.resolve` 校验仍在允许目录内。
- 只允许写入 `content/events/definitions/*.json`、`content/events/call_templates/*.json`、`content/events/presets/*.json`、`content/events/manifest.json` 和生成模块。
- 保存请求必须携带 base hash；文件已被外部修改时返回 conflict，不覆盖用户改动。
- helper 不提供任意 shell 命令执行 API。

### 5.2 Endpoints

#### `GET /api/health`

返回 helper 状态、仓库根目录、Node 版本和支持的 API version。

#### `GET /api/event-editor/library`

返回 editor 初始数据：

```ts
interface EventEditorLibraryResponse {
  manifest: EventManifest;
  domains: string[];
  definitions: EditorEventAsset<EventDefinition>[];
  call_templates: EditorEventAsset<CallTemplate>[];
  handlers: HandlerDefinition[];
  presets: EditorEventAsset<PresetDefinition>[];
  legacy_events: EditorEventAsset<unknown>[];
  schemas: Record<string, unknown>;
  validation: ValidationReport;
}
```

#### `POST /api/event-editor/validate-draft`

在临时目录应用 draft，只运行格式化与校验，不写最终文件。用于保存前预检查，也用于 Validation 标签刷新。

#### `POST /api/event-editor/save`

保存已有 definitions 或 call templates。请求包含目标 asset、draft data、base hash 和 optional change summary。helper 在临时目录校验通过后写入最终文件，返回新的 hash、validation report 和已写入路径。

#### `POST /api/event-editor/create-domain`

创建新 domain 文件包。请求包含 domain id、初始 definition / call template scaffold。helper 创建 definitions 与 call templates 文件，更新 manifest，生成 runtime 聚合模块，运行校验。校验失败时不写最终文件。

### 5.3 Validation Report

UI 不直接解析 stdout。helper 将 schema 错误和 `EventValidationIssue` 统一成结构化报告：

```ts
interface ValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  file_path?: string;
  asset_type?: "event_definition" | "call_template" | "handler" | "preset" | "manifest";
  asset_id?: string;
  json_path?: string;
}

interface ValidationReport {
  passed: boolean;
  issues: ValidationIssue[];
  command?: string;
}
```

## 6. Editor UI 设计

### 6.1 Shell

`apps/editor/src/App.tsx` 提供轻量 Game Editor shell。导航中 Event Editor 可用，Character / Map / Item / NPC Editor 以禁用入口展示。视觉沿用现有控制台风格：低装饰、高信息密度、明确边框、monospace 状态标签。

### 6.2 Event Editor 三栏布局

- 左栏：内容浏览器。按 domain、event id、trigger、handler、校验状态和关键词筛选。
- 中栏：详情编辑区。表单与 JSON 始终并排显示。表单由 RJSF + custom widgets 渲染；JSON 使用 textarea 或轻量 code panel。
- 右栏：Schema / Preview / Graph / Validation 标签。

### 6.3 Draft 规则

- 草稿保存在 editor React state 与 localStorage。
- 草稿 key 包含 asset id、file path、base hash，避免错误套用到已变化文件。
- JSON 解析失败时，表单显示最后一次合法 draft，并提示 JSON path / parse error。
- 保存成功后清除对应草稿并刷新 library。

### 6.4 Preview 规则

Preview 只渲染 call template 表现。若选中的 event graph 节点不是 call node，则提示“当前节点没有通话预览”。如果 sample context 不足，则使用事件内第一个 `sample_contexts`，并显示 context 缺失项。

## 7. 构建、目录与测试

### 7.1 目录结构

```text
apps/editor/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  src/
    main.tsx
    App.tsx
    event-editor/
      EventEditorPage.tsx
      EventBrowser.tsx
      EventDetailWorkspace.tsx
      JsonDraftPanel.tsx
      SchemaPanel.tsx
      PreviewPanel.tsx
      GraphPanel.tsx
      ValidationPanel.tsx
      rjsfWidgets.tsx
      types.ts
      apiClient.ts
      draftStorage.ts
  helper/
    server.mjs
    contentStore.mjs
    validationGate.mjs
    manifestStore.mjs
    jsonFormat.mjs
  scripts/
    generate-event-content-manifest.mjs
apps/pc-client/src/content/generated/
  eventContentManifest.ts
content/events/
  manifest.json
```

### 7.2 Package Scripts

新增脚本建议：

```json
{
  "editor:dev": "node common/scripts/install-run-rush-pnpm.js run --filter @stellar-frontier/editor dev",
  "editor:helper": "node common/scripts/install-run-rush-pnpm.js run --filter @stellar-frontier/editor helper",
  "editor:build": "node common/scripts/install-run-rush-pnpm.js run --filter @stellar-frontier/editor build",
  "generate:event-content": "node common/scripts/install-run-rush-pnpm.js run --filter @stellar-frontier/editor generate:event-content"
}
```

`lint` 需要覆盖 `apps/pc-client/src`、`apps/editor/src`、`apps/editor/vite.config.ts` 和生成模块。`@stellar-frontier/editor` 通过自己的 `lint` script 接入 Rush bulk command，最终方案必须让 `npm run lint` 覆盖 editor 代码。

### 7.3 测试策略

Plan 阶段只定义验收，不预写测试代码。后续实现任务应覆盖：

- manifest 生成脚本：新增 domain 后生成模块包含对应静态 import。
- helper 路径限制与 hash conflict：不能写白名单之外路径，外部修改时拒绝覆盖。
- validation gate：无效 draft 不写最终 `content/`，有效 draft 写入并返回新 hash。
- Event browser：能列出 definitions / call templates / legacy readonly。
- RJSF 混合表单：基础字段可编辑，复杂 widgets 能更新 draft。
- Preview panel：能基于 call node 与 template 渲染文本与选项，且不执行 effects。

## 8. 风险与缓解

- **Manifest 与文件漂移**：新增脚本校验 manifest 与目录互相覆盖，并把生成脚本放进 helper 保存链路。
- **无效内容写入最终文件**：helper 使用临时目录先校验，失败不写最终 `content/`。
- **文件冲突覆盖用户改动**：保存请求携带 base hash，hash 不一致时返回 conflict。
- **RJSF 对复杂 union 体验差**：复杂字段用 custom widgets，RJSF 只承担基础 schema 表单。
- **Helper 安全边界过大**：只监听 localhost，只允许白名单路径，不提供任意命令 API。
- **Editor metadata 污染运行时 JSON**：草稿、筛选偏好、布局状态只存 localStorage，不写入 `content/`。
- **新增 domain 校验通过但游戏不可见**：manifest 生成模块进入保存门禁，`contentData.ts` 从生成模块读取结构化事件。

## 9. 交付边界

本 technical design 只定义实现方向，不开始业务代码实现。后续 tasks 应按以下顺序拆解：先建立 editor 工程与 manifest 基础，再实现 helper 读写和校验门禁，然后实现浏览、编辑、预览、新建 domain 与端到端验证。
