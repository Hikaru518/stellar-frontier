---
topic: event-editor
date: 2026-04-28
status: draft
source:
  design: docs/plans/2026-04-28-14-45/event-editor-design.md
  technical_design: docs/plans/2026-04-28-14-45/event-editor-technical-design.md
  tasks: docs/plans/2026-04-28-14-45/event-editor-tasks.json
---

# Event Editor Implementation Plan

## 1. 目标

本计划把 Event Editor 策划案转化为可执行的开发任务。Event Editor 是 `apps/editor/` 下的本地 Game Editor 模块，也是 Rush monorepo 中的独立 app 项目。它服务策划与开发者，不进入玩家游戏入口。它共享 `content/`、事件 schema、事件校验和通话渲染逻辑，用来浏览、理解、编辑并安全写回结构化事件内容。

MVP 交付一条完整闭环：

- 独立 editor 页面可浏览结构化 event definitions 与 call templates。
- 左侧内容浏览器支持按 domain、ID、trigger、handler、校验状态和关键词检索。
- 中间区域并排显示 RJSF 表单与原始 JSON。
- 右侧标签展示 schema、通话表现预览、只读 graph 和 validation。
- Local Helper 在写入最终 `content/` 前完成格式化、manifest 同步和校验。
- 校验失败不写最终文件，草稿保留在 editor 本机状态。

本轮不做完整游戏模拟、复杂剧情树画布、Git review 工作流、legacy events 编辑，也不实现 Character / Map / Item / NPC Editor 的实际编辑能力。

## 2. 技术方案摘要

### Editor 入口

Editor 使用独立 Vite 入口：`apps/editor/index.html`、`apps/editor/src/main.tsx`、`apps/editor/vite.config.ts` 和 `apps/editor/tsconfig.json`。根 `package.json` 保留 editor 转发脚本，具体依赖和脚本由 `@stellar-frontier/editor` 管理。玩家游戏仍走 `apps/pc-client` 的入口。

### Local Helper

Local Helper 是独立 Node localhost API，优先使用 Node 内置模块。它只监听 `127.0.0.1`，只允许读写白名单路径，并提供 library、validate、save、create-domain 等 API。它不是线上后端。

### Manifest 与加载路径

新增 `content/events/manifest.json`，记录结构化事件 domain 文件。新增 `apps/editor/scripts/generate-event-content-manifest.mjs` 生成 `apps/pc-client/src/content/generated/eventContentManifest.ts`，由 `apps/pc-client/src/content/contentData.ts` 读取。新增 domain 时，helper 更新 manifest、生成聚合模块，并通过校验门禁，避免“文件存在但游戏读不到”。

### 表单与预览

表单层采用 RJSF 混合方案。基础字段由 JSON Schema 驱动，graph、conditions/effects、handler params 和引用字段使用 custom widgets。Preview 只渲染通话表现，不执行 effects、不推进时间、不改玩家存档。

### 保存门禁

保存请求携带 target asset、draft data 和 base hash。helper 在临时目录应用草稿、格式化 JSON、更新 manifest / generated module、运行 `npm run validate:content`。只有校验通过才写最终 `content/`；hash 不一致时返回 conflict。

## 3. 任务顺序

任务详情见 `event-editor-tasks.json`。数组顺序就是后续串行执行顺序。

1. **T001 建立事件 manifest 与生成式运行时聚合模块**：先解决新增 domain 的加载路径，避免后续 editor 保存产生游戏不可见内容。
2. **T002 搭建独立 editor Vite/TS/RJSF 工程入口**：建立 UI 项目的基础入口、脚本和类型检查。
3. **T003 实现 Local Helper 基础服务与只读 library API**：让 editor 可以读取事件库、schema、manifest 和校验状态。
4. **T004 实现 validation gate 与已有 asset 保存 API**：建立安全写回已有 definitions / call templates 的核心能力。
5. **T005 实现新建 domain API 与 manifest 同步**：在保存门禁基础上支持创建新 domain 文件包。
6. **T006 实现 editor API client、library state 与 draft storage**：让前端接入 helper 并保存本机草稿。
7. **T007 实现 Event Browser 与搜索筛选**：交付查阅、理解和定位事件的左侧浏览器。
8. **T008 实现表单与 JSON 并排编辑工作区**：交付主要编辑体验。
9. **T009 实现 Schema、Preview、Graph、Validation 侧栏**：补齐理解、预览和排错能力。
10. **T010 打通保存 UX、冲突处理与刷新流程**：把前端保存体验接入 helper save API。
11. **T011 集成收口与端到端验收**：验证浏览、编辑、保存、新建 domain 与玩家内容加载路径一起工作。

这个顺序先处理内容加载和保存安全，再搭 UI。T001 和 T002 可独立启动，但后续 helper 与 create-domain 依赖 T001；前端工作区依赖 editor shell 与 helper library API。

## 4. 验证要求

后续每个开发任务都应至少满足自己的 acceptance criteria，并在影响范围内运行命令：

- 修改 `content/` 或事件 manifest：运行 `npm run validate:content`。
- 修改 `apps/pc-client/src`、`apps/editor/src`、`apps/editor/helper`、脚本或配置：运行 `npm run lint`。
- 修改逻辑或 UI 组件：运行 `npm run test`。
- 若任务新增 editor e2e：运行 `npm run test:e2e` 或新增的 editor e2e 命令。

计划阶段不预写测试代码。实现阶段应按 TDD skill 在对应 task 内补足测试。

## 5. 主要风险

- **manifest 与目录漂移**：生成脚本必须检查 manifest 和实际文件互相覆盖。
- **无效内容写入最终文件**：helper 必须先在临时目录校验，失败不写最终 `content/`。
- **外部改动被覆盖**：保存请求必须携带 base hash，冲突时拒绝覆盖。
- **RJSF 对复杂事件结构体验不足**：复杂字段使用 custom widgets，不依赖纯自动表单。
- **helper 安全边界过宽**：只监听 localhost，只写白名单路径，不暴露任意命令执行。
- **editor metadata 污染运行时 JSON**：草稿、布局和筛选偏好只存在本机状态或 localStorage。

## 6. 输出文件

- `docs/plans/2026-04-28-14-45/event-editor-technical-design.md`
- `docs/plans/2026-04-28-14-45/event-editor-tasks.json`
- `docs/plans/2026-04-28-14-45/event-editor-implementation-plan.md`

完成本计划后，不自动进入实现阶段。后续需要明确指令再按 `event-editor-tasks.json` 串行派发开发任务。
