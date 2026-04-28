# Event Editor

Event Editor 是本仓库的本地内容编辑工具。它由两部分组成：

- `editor:helper`：只监听 `127.0.0.1` 的本地 helper，负责读取、校验、保存 `content/events/`。
- `editor:dev`：独立 Vite editor 前端，负责浏览事件库、编辑 draft、保存到内容文件。

## 从干净 checkout 启动

在仓库根目录执行：

```bash
node common/scripts/install-run-rush.js update
npm run editor:helper
```

保持 helper 终端运行，再开一个终端启动 editor：

```bash
npm run editor:dev
```

默认地址：

- Helper: `http://127.0.0.1:4317/api/health`
- Editor: `http://localhost:5174/`

打开 Editor 后，页面会请求 `GET /api/event-editor/library`。如果 helper 未启动，页面会显示 `npm run editor:helper` 的本地启动提示。

## 保存与校验边界

- 可编辑内容只包括 `content/events/definitions/*.json` 和 `content/events/call_templates/*.json`。
- `content/events/events.json` 是 legacy readonly 内容，Editor 只展示，不提供保存入口。
- 保存已有 asset 时，helper 会先在临时目录应用 draft 并运行内容校验；校验失败不会写入最终 content 文件。
- 新建 domain 会同时生成 `definitions/<domain>.json`、`call_templates/<domain>.json`，更新 `content/events/manifest.json`，并刷新 `apps/pc-client/src/content/generated/eventContentManifest.ts`。
- PC 玩家侧通过 `apps/pc-client/src/content/contentData.ts` 的 `eventContentLibrary` 加载生成模块；新建 domain 必须出现在 manifest、生成模块和 `eventContentLibrary.domains` 中。

## 验收命令

```bash
npm run validate:content
npm run lint
npm run test
npm run editor:build
```
