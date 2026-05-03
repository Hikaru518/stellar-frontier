# Game Editor

Game Editor 是本仓库的本地内容编辑工具，作为 Rush app 位于 `apps/editor`。它独立于玩家 PC 客户端入口，不写玩家存档，只读写仓库内 `content/` 数据。

当前包含两个可用模块：

- **Event Editor**：浏览结构化事件、通话模板、preset、handler、schema 和 graph，编辑并保存事件内容。
- **Map Editor**：新建 / 选择地图，编辑 gameplay tile、origin、初始 discovered 标记、地块对象、特殊状态、视觉层和 tileset palette，保存到 `content/maps/*.json`。

Editor 由两部分组成：

- `editor:helper`：只监听 `127.0.0.1` 的本地 helper，负责读取、校验、保存 content，并通过白名单路径读取 `assets/` 中的 PNG tileset。
- `editor:dev`：独立 Vite editor 前端，负责浏览内容库、编辑 draft、保存到内容文件。
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

打开 Editor 后：

- Event Editor 请求 `GET /api/event-editor/library`。
- Map Editor 请求 `GET /api/map-editor/library`。
- 如果 helper 未启动，页面会显示 `npm run editor:helper` 的本地启动提示。

## 保存与校验边界

Event Editor：

- 可编辑内容包括 `content/events/definitions/*.json` 和 `content/events/call_templates/*.json`；presets、handlers 与 schemas 作为结构化事件库的只读参考显示。
- 新建 domain 会同时生成 `definitions/<domain>.json`、`call_templates/<domain>.json`，更新 `content/events/manifest.json`，并刷新 `apps/pc-client/src/content/generated/eventContentManifest.ts`。
- PC 玩家侧通过 `apps/pc-client/src/content/contentData.ts` 的 `eventContentLibrary` 加载生成模块；新建 domain 必须出现在 manifest、生成模块和 `eventContentLibrary.domains` 中。

Map Editor：

- 可编辑内容包括 `content/maps/*.json` 中的地图尺寸、origin、`initialDiscoveredTileIds`、tile gameplay 字段和 `visual.layers`。
- 只读参考包括 `content/maps/tilesets/registry.json`、`content/map-objects/*.json`、`content/schemas/maps.schema.json`、`content/schemas/map-tilesets.schema.json` 和 `content/schemas/map-objects.schema.json`。
- 视觉素材来自 registry 指向的 `assets/` PNG；helper 只允许读取仓库内 `assets/**/*.png`。
- 保存前 helper 会校验地图 schema、object 引用、visual cell tile id、tileset id 和 tile index 范围；校验失败不会写入最终 content 文件。

## 验收命令

```bash
npm run validate:content
npm run lint
npm run test
npm run editor:build
```
