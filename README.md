# Stellar Frontier

Stellar Frontier 是一个星球基地管理与叙事决策游戏原型。玩家从控制中心出发，通过通讯台联系队员，在通话中处理事件和下达指令，并通过地图查看地块、资源、建筑与队员状态。

当前原型聚焦于五个核心模块：控制中心、通讯台、通话决策、可配置网格地图（默认 `8 x 8`），以及人物详情。世界以全局游戏时间持续运转，玩家通过通话向队员下达移动 / 调查 / 撤离等指令；事件、队员、物品、地图等内容数据从 `content/` 下的 JSON 文件加载。

## 技术栈

- React 19
- TypeScript
- Vite
- Rush + pnpm monorepo
- Vitest（组件测试） + Playwright（端到端测试）
- Ajv（内容 JSON 的 schema 校验）

## 快速开始

Node.js 要求：推荐使用 Node.js 24（与 CI 保持一致）；最低支持版本为 `^20.19.0 || >=22.12.0`。

如果你使用 nvm，可先切换到项目版本：

```bash
nvm use || nvm install
```

安装依赖：

```bash
node common/scripts/install-run-rush.js update
```

启动 PC 开发服务器：

```bash
npm run dev:pc
```

启动手机 companion 端开发服务器：

```bash
npm run dev:mobile
```

默认本地端口：PC 为 `http://localhost:5173/`，手机端为 `http://localhost:5174/`，Yuan Host 为 `ws://localhost:8888/`。

双设备真实联调需要先启动 Yuan Host。若使用本地 Yuan 仓库，可运行：

```bash
node /Users/c1/Work/Yuan/apps/host/lib/cli.js
```

然后分别启动 PC 与手机端。PC 通讯台会创建真实 Yuan `Terminal(enable_WebRTC: true)`；手机扫码打开 companion 页面后也会创建 Yuan Terminal，并通过 Yuan service 回传心跳、已读、接听事件。

真实手机扫码时，手机端 dev server 需要暴露到局域网，且 `VITE_MOBILE_TERMINAL_URL` 需要指向手机能访问到的地址，例如：

```bash
npm run dev:mobile:lan
VITE_MOBILE_TERMINAL_URL=http://<LAN-IP>:5174/ npm run dev:pc
```

构建生产版本：

```bash
npm run build
```

本地预览构建结果：

```bash
npm run preview
```

类型检查：

```bash
npm run lint
```

运行组件测试：

```bash
npm run test
```

校验 `content/` 下的 JSON 内容（schema + 引用完整性）：

```bash
npm run validate:content
```

首次运行端到端测试前安装浏览器：

```bash
cd apps/pc-client
node ../../common/scripts/install-run-rushx.js install:browsers
```

运行端到端测试：

```bash
npm run test:e2e
```

## GitHub Pages 部署

项目已配置 GitHub Actions workflow。推送到 `main` 分支后会通过 Rush/pnpm 依次执行类型检查、内容校验、组件测试、端到端测试和生产构建，并将 `apps/pc-client/dist` 发布到 GitHub Pages。

GitHub Pages 使用项目页路径，预期访问地址为：

```text
https://<用户名>.github.io/stellar-frontier/
```

## 功能概览

- **控制中心**：游戏主入口，展示资源状态、系统日志和可交互设施（窗户、中控台、咖啡机、唱片机、冰箱、研究台、星际贸易、星际之门等）。
- **通讯台**：查看队员位置、状态、背包、通讯/失联状态和来电，并进入通话事件。
- **手机私人终端**：PC 通讯台可生成 QR 码与短手输码；手机端作为 Yuan Terminal companion 接收 PC 授权的私密通讯，只回传 typed events；PC 仍是唯一权威游戏状态，并提供 fallback。Stellar 仅维护共享 dual-device 业务库，不维护专属 relay server。
- **通话**：承载角色事件、普通行动（移动 / 调查 / 采集 / 建设 / 待命）和紧急决策；选择结果会更新队员、地图与系统日志。
- **地图**：以可配置网格（默认 `8 x 8`）展示地形、自然资源、建筑、仪器、危险与队员位置。地图只读，不直接下达指令。
- **人物详情**：展示背景档案、5 维轻量属性、自由性格标签、专长以及关键节点日记，并按通讯/失联/找回状态控制日记可见性。
- **Debug toolbox / 作弊菜单**：调整时间倍率（`1x` / `2x` / `4x` / `8x`）和重置浏览器存档，仅用于开发与验收。
- **全局时间**：游戏内时间从开始新游戏起持续推进；玩家关闭游戏后世界停止，再次进入时从保存的 `elapsedGameSeconds` 继续。

## 目录结构

```text
.
├── content/                 # 数据驱动的游戏内容（与代码解耦）
│   ├── crew/crew.json       # 队员定义
│   ├── events/              # 事件定义、通话模板、preset 与 handler registry
│   ├── items/items.json     # 物品定义
│   ├── maps/                # 默认可配置地图内容
│   └── schemas/             # 内容 JSON Schema（含 events/ 子 schema）
├── docs/                    # 设计 knowledge base（详见 AGENTS.md）
│   ├── core-ideas.md
│   ├── todo.md              # 设计 / 文档体系级 TODO
│   ├── game_model/          # 代码层数据契约与运行时状态边界
│   ├── gameplay/            # 各子系统的全量 wiki
│   ├── ui-designs/          # UI 总览、页面 PRD、风格原则、草图
│   └── plans/               # 按时间分目录的增量设计提案
├── scripts/
│   └── validate-content.mjs # 内容 schema + 引用完整性校验
├── apps/
│   ├── pc-client/           # PC 权威游戏客户端（原 React/Vite app）
│   │   ├── src/             # 页面、系统规则、内容加载、组件测试
│   │   └── tests/e2e/       # Playwright 端到端测试
│   └── mobile-client/       # 手机 companion terminal 浏览器客户端
├── packages/
│   └── dual-device/         # PC/mobile 共享的配对、Yuan message 映射、typed events 与 fallback 规则
├── common/config/rush/      # Rush + pnpm 配置与 lockfile
├── package.json
└── rush.json
```

## 设计文档

所有设计文档位于 `docs/`，按"全量 wiki + 增量提案"的方式维护，详见仓库根目录的 [`AGENTS.md`](AGENTS.md)。完整文档索引见 [`docs/index.md`](docs/index.md)。常用入口：

- [UI 设计总览](docs/ui-designs/ui.md) / [UI 设计原则](docs/ui-designs/ui-design-principles.md)
- 页面 PRD：[控制中心](docs/ui-designs/pages/控制中心.md) · [通讯台](docs/ui-designs/pages/通讯台.md) · [通话](docs/ui-designs/pages/通话.md) · [地图](docs/ui-designs/pages/地图.md)
- 子系统 wiki：[队员系统](docs/gameplay/crew/crew.md) · [事件系统](docs/gameplay/event-system/event-system.md) · [地图系统](docs/gameplay/map-system/map-system.md) · [时间系统](docs/gameplay/time-system/time-system.md)
- 数据模型：[`docs/game_model/`](docs/game_model/)（crew / event / event-integration / map）
- 设计 / 文档体系级 TODO：[`docs/todo.md`](docs/todo.md)

## 开发说明

- 页面流转和事件结算集中在 `apps/pc-client/src/App.tsx`；具体规则按系统拆分到 `crewSystem.ts` / `eventSystem.ts` / `diarySystem.ts` / `timeSystem.ts`。
- 队员、事件、物品、地图的内容数据位于 `content/*.json`，并在 `apps/pc-client/src/content/contentData.ts` 中加载；改动后请运行 `npm run validate:content`。
- Rush 由 `rush.json` 固定版本，pnpm 由 `pnpmVersion` 固定版本；不要新增 npm workspace 配置或提交 root `package-lock.json`。
- 地图页面只负责展示信息；对队员的移动、建设、调查和停止工作等指令通过通讯台和通话页面完成。
- 未实现的扩展模块（研究台、星际贸易、星际之门等）应给出明确反馈，避免玩家点击后没有响应。
- 游戏存档以 `localStorage` 保存（key：`stellar-frontier-save-v1`）；Debug toolbox 提供"重置存档"按钮用于回到初始状态。

<!-- last-synced-by audit-wiki: 2026-04-27 -->
