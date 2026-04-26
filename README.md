# Stellar Frontier

Stellar Frontier 是一个星球基地管理与叙事决策游戏原型。玩家从控制中心出发，通过通讯台联系队员，在通话中处理事件和下达指令，并通过地图查看地块、资源、建筑与队员状态。

当前项目重点验证核心 UI 流程：控制中心、通讯台、通话决策和 4x4 星球地图。

## 技术栈

- React 19
- TypeScript
- Vite

## 快速开始

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
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

首次运行端到端测试前安装浏览器：

```bash
npx playwright install
```

运行端到端测试：

```bash
npm run test:e2e
```

## GitHub Pages 部署

项目已配置 GitHub Actions workflow。推送到 `main` 分支后会依次执行类型检查、组件测试、端到端测试和生产构建，并将 `dist` 发布到 GitHub Pages。

GitHub Pages 使用项目页路径，预期访问地址为：

```text
https://<用户名>.github.io/stellar-frontier/
```

## 功能概览

- 控制中心：游戏主入口，展示资源状态、系统日志和可交互设施。
- 通讯台：查看队员位置、状态、背包和来电，并进入通话事件。
- 通话：承载角色事件、普通行动和紧急决策，选择结果会更新队员与地图状态。
- 地图：以 4x4 网格展示地形、自然资源、建筑、仪器、危险和队员位置。

## 目录结构

```text
.
+-- docs/
|   +-- ui-designs/        # UI 设计说明、页面 PRD 和草图源文件
+-- src/
|   +-- components/        # 通用布局组件
|   +-- data/              # 游戏初始数据、类型和行动配置
|   +-- pages/             # 控制中心、通讯台、通话、地图页面
|   +-- App.tsx            # 页面流转与核心状态管理
|   +-- main.tsx           # React 入口
|   +-- styles.css         # 全局样式
+-- package.json
+-- vite.config.ts
```

## 设计文档

设计文档位于 `docs/ui-designs`，可从以下入口开始阅读：

- [UI 设计总览](docs/ui-designs/ui.md)
- [控制中心](docs/ui-designs/pages/控制中心.md)
- [通讯台](docs/ui-designs/pages/通讯台.md)
- [通话](docs/ui-designs/pages/通话.md)
- [地图](docs/ui-designs/pages/地图.md)

## 开发说明

- 页面流转和事件结算集中在 `src/App.tsx`。
- 队员、资源、地图地块、行动选项等初始数据位于 `src/data/gameData.ts`。
- 地图页面只负责展示信息；对队员的移动、建设、调查和停止工作等指令通过通讯台和通话页面完成。
- 未实现的扩展模块应给出明确反馈，避免玩家点击后没有响应。
