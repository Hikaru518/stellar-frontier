# Event Editor

Event Editor 是本仓库的本地内容编辑工具，作为 Rush app 位于 `apps/editor`。它由两部分组成：

- `editor:helper`：只监听 `127.0.0.1` 的本地 helper，负责读取、校验、保存 `content/events/`。
- `editor:dev`：独立 Vite editor 前端，负责浏览事件库、编辑 draft、保存到内容文件。
- `apps/editor/scripts/generate-event-content-manifest.mjs`：Event Editor 专属生成脚本，用于根据 `content/events/manifest.json` 刷新 PC 运行时聚合模块。

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

也可以在 `apps/editor` 内使用 Rush project script：

```bash
node ../../common/scripts/install-run-rushx.js helper
node ../../common/scripts/install-run-rushx.js dev
```

默认地址：

- Helper: `http://127.0.0.1:4317/api/health`
- Editor: `http://localhost:5175/`

打开 Editor 后，页面会请求 `GET /api/event-editor/library`。如果 helper 未启动，页面会显示 `npm run editor:helper` 的本地启动提示。

## 保存与校验边界

- 可编辑内容只包括 `content/events/definitions/*.json` 和 `content/events/call_templates/*.json`；presets、handlers 与 schemas 作为结构化事件库的只读参考显示。
- 结构化事件是唯一事件内容入口；Editor 通过 `content/events/manifest.json` 与事件子目录读取内容。
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
