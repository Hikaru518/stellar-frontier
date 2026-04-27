# Agents Guide

本文件给协作 agent 提供工作所需的最小上下文：在哪里查资料、当前系统能做什么、不做什么、有哪些约束，以及代码仓库分了哪些模块。

## 核心约定

- `docs/` 是本项目的 knowledge base，所有设计内容都应**自包含**在其中。当某条设计需要引用外部资料（论文、文章、其他仓库等）时，请把相关内容**抄录或摘录到 `docs/` 内**再引用，不要只放外链。
- `docs/core-ideas.md` 是特殊的全局核心想法与设计原则页，保持短小、指导性，不使用普通子系统 wiki 的 10 章模板；任何对它的更新都必须先获得人类确认，agent 不得在未确认的情况下自动改写核心原则。
- `content/` 下的 JSON 是**运行时内容数据**，不是设计文档。设计意图请写在 `docs/`，事件/队员/物品/地图的具体配置写在 `content/`。
- 修改 `content/` 后必须能通过 `npm run validate:content`；修改 `src/` 后必须能通过 `npm run lint` 和 `npm run test`。

## docs/ 知识库结构

`docs/` 同时承载**全量文档**（当前生效的设计快照）与**增量提案**（按时间分目录的设计变更）。

### 全量文档（current state）

| 路径 | 用途 |
| --- | --- |
| `docs/core-ideas.md` | 特殊全局原则页：简短说明核心想法与设计原则，不套用普通子系统 wiki 模板；任何更新都需要人类确认。 |
| `docs/index.md` | 知识库索引，由 `audit-wiki` 根据现有 wiki 与文档入口重生成。 |
| `docs/todo.md` | **设计 / 文档体系级**的有意搁置项；代码层面的 TODO 不写在这里。 |
| `docs/gameplay/<system>/<system>.md` | 各子系统的 wiki，已生效的全量规则。当前包含 `crew`、`event-system`、`map-system`、`time-system` 四份。 |
| `docs/game_model/<topic>.md` | 代码层数据契约：队员、事件、事件集成边界、地图等运行时模型与内容 schema 边界。 |
| `docs/ui-designs/ui.md` | UI 总览：页面与职责、模块关系、跳转图。 |
| `docs/ui-designs/ui-design-principles.md` | UI 风格与机制设计原则（低保真控制台美学）。 |
| `docs/ui-designs/pages/*.md` | 控制中心 / 通讯台 / 通话 / 地图 的页面级 PRD。 |
| `docs/ui-designs/pencil-pages/*.pen` | pencil.dev 草图源文件。 |

### 增量提案（per-round design）

`docs/plans/<YYYY-MM-DD-HH-MM>/` 每个目录代表一轮设计活动，包含完整的研究→访谈→设计→合并轨迹：

| 文件名 | 含义 |
| --- | --- |
| `initial.md` | 用户原始诉求 / 头脑风暴。 |
| `research-topics.md` | 选定的项目内 + 外部调研主题。 |
| `research.md` | 调研结论。 |
| `<topic>-interview.md` | 设计访谈记录。 |
| `<topic>-design.md` | 本轮策划案（含 MVP / Later / 不做、验收标准、Open Questions）。 |
| `wiki-backup-<timestamp>.md` | 合并前的目标 wiki 备份。 |
| `wiki-merge-diff.md` | 本轮策划案合入目标 wiki 时的新增 / 更新 / 冲突 / 决议记录。 |

> 修改子系统 wiki 时优先走"增量提案 → 合并 diff → 更新 wiki"流程，不要直接覆写 `docs/gameplay/<system>/<system>.md`。

## 当前系统能做什么

游戏原型当前已实现以下能力：

### 玩法循环

- **全局时间**：以 `1 现实秒 = 1 游戏秒` 推进；玩家关闭游戏后世界停止，再次进入从 `elapsedGameSeconds` 继续。Debug toolbox 可切换 `1x` / `2x` / `4x` / `8x` 倍率。
- **队员行动**：5 名队员（Mike、Amy、Garry、Lin Xia、Kael）在可配置网格地图（默认 `8 x 8`）上移动；同一时间只能执行一个主行动；移动按格推进、抵达后自动待命；行动可被中断，停止动作本身需 `10 秒`。
- **通话决策**：玩家通过通讯台进入通话，给队员下达移动 / 调查 / 采集 / 建设 / 撤离 / 应急选项；选择结果更新队员状态、地块状态与系统日志。
- **事件触发**：抵达地块、调查完成、采集完成、建设完成、长时间待命、通话选项均可触发事件；事件依据队员属性 / 携带物 / 标签 / 概率结算；紧急事件以来电进入通讯台并形成倒计时。
- **人物表达**：每名队员具备背景档案、通话语气、5 维轻量属性（体能 / 敏捷 / 智力 / 感知 / 运气，取值 `1-6`）、自由性格标签、专长标签与关键节点日记。
- **日记可见性**：日记按 `已传回 / 未传回 / 失联锁定 / 找回解锁` 四态控制可见性。
- **存档**：以 `localStorage`（key `stellar-frontier-save-v1`）保存全量游戏状态；Debug toolbox 提供重置入口。

### 内容数据

- 队员、事件、物品、地图定义全部从 `content/*.json` 加载，由 `content/schemas/*.schema.json` 与 `content/schemas/events/*.schema.json` 约束格式；`scripts/validate-content.mjs` 同时校验 schema 与跨文件引用完整性。

## 未来要做（Later）

以下方向已在设计文档中讨论，但当前不实现，等待后续轮次再启动：

- 索引页状态列与系统耦合关系图的判定细则（详见 `docs/todo.md`）。
- 背包负重容量与背包规则改动。
- 性格标签、专长标签、属性参与**自动**规则判定（当前仅作展示与文本参考，少量手工定义的专长效果除外）。
- 角色成长 / 升级 / 训练或属性变化。
- 关系系统、士气系统、好感度或团队氛围联动。
- 程序生成角色 / 随机背景。
- 控制中心中的研究台（科技树）、星际贸易、星际之门等模块的实质交互。
- 完整的"经过每个移动地块"事件触发；MVP 仅在抵达 / 完成时检查。

## 明确不做（Out of Scope）

- 关闭游戏后的时间流逝、离线行动 / 事件 / 资源补算。
- 跨地图移动、载具、飞行、传送（除剧情设定外）。
- 多队员编队、护送、协同行动；单队员多行动并行。
- 地图直接下达指令（地图只读，指令必须经通话）。
- 可视化事件编辑器、复杂剧情树编辑器、复杂变量脚本语言。
- 大规模全局随机事件、与现实时间相关的固定时间事件。
- 昼夜循环、季节、天气、睡眠、暂停、多时间线。
- 把 Debug toolbox 包装成正式玩法。

## 约束与假设

- **平台**：浏览器单页应用；状态全部在前端，依赖 `localStorage` 持久化，无后端。
- **网格**：星球地图为可配置网格，默认 `8 x 8`，移动使用曼哈顿路径，每格默认 `60 秒`，再叠加地形耗时。
- **指令通道**：移动 / 调查 / 采集 / 建设等所有队员指令必须经"通讯台 → 通话"发出；地图与控制中心都不直接下达指令。
- **行动并行性**：每名队员同一时间只能执行一个主行动；移动中改派必须先停止当前行动。
- **数据来源唯一**：所有页面共享同一个 `GameState`；不存在页面独立的时间或状态。
- **内容 vs 代码**：游戏文本、事件、队员、物品、地图配置走 `content/*.json`，不允许新增到代码内的硬编码数组。
- **设计文档自包含**：见上文"核心约定"。

## 代码仓库模块

```text
.
├── content/                              # 数据驱动的游戏内容（与代码解耦）
│   ├── crew/crew.json                    # 队员档案、属性、标签、专长、日记节点定义
│   ├── events/
│   │   ├── events.json                   # 兼容层事件内容片段
│   │   ├── definitions/<domain>.json     # 结构化事件定义
│   │   ├── call_templates/<domain>.json  # 通话模板
│   │   ├── presets/<domain>.json         # 可复用 condition / effect preset
│   │   └── handler_registry.json         # 白名单 handler 与参数 schema 引用
│   ├── items/items.json                  # 物品定义
│   ├── maps/default-map.json             # 默认可配置地图内容
│   └── schemas/
│       ├── *.schema.json                 # crew / items / legacy events / maps 等顶层 schema
│       └── events/*.schema.json          # 结构化事件资产 schema
├── scripts/
│   └── validate-content.mjs              # `npm run validate:content` 入口；校验 schema + 跨文件引用
├── src/
│   ├── components/
│   │   └── Layout.tsx                    # 通用布局原子：Modal / Panel / StatusTag / FieldList 等控制台风格组件
│   ├── content/
│   │   └── contentData.ts                # 加载并 re-export content/*.json，提供运行时类型与查询助手
│   ├── data/
│   │   └── gameData.ts                   # 类型定义、初始游戏状态（队员 / 地块 / 资源 / 日志）、行动与通话常量
│   ├── pages/
│   │   ├── ControlCenter.tsx             # 控制中心：资源 / 日志 / 设施入口
│   │   ├── CommunicationStation.tsx      # 通讯台：队员卡片、通讯录、来电、背包入口
│   │   ├── CallPage.tsx                  # 通话：剧情对白、行动 / 紧急决策选项、地图与通讯录浮层入口
│   │   ├── MapPage.tsx                   # 地图：可配置网格、坐标详情面板（只读）
│   │   ├── CrewDetail.tsx                # 人物详情：档案 / 属性 / 标签 / 专长 / 日记
│   │   └── DebugToolbox.tsx              # Debug toolbox：时间倍率切换、重置存档
│   ├── events/                           # 结构化事件引擎：types / conditions / effects / graphRunner / callRenderer / validation 等
│   ├── test/
│   │   └── setup.ts                      # Vitest 测试环境初始化
│   ├── App.tsx                           # 页面流转、全局 GameState、游戏循环、回调与事件结算汇总
│   ├── App.test.tsx                      # 关键流程的组件级测试
│   ├── crewSystem.ts                     # 队员状态规整、移动预览、逐格推进、行动结算与中断、地块队员同步
│   ├── diarySystem.ts                    # 个人日记追加与按通讯状态切换可见性
│   ├── eventSystem.ts                    # 事件触发候选、概率修正、效果结算、紧急事件升级、自动决策
│   ├── inventorySystem.ts                # 背包查询、物品可用性与物品效果 helper
│   ├── mapSystem.ts                      # 可配置地图初始化、查询、可见窗口与 legacy tile 投影
│   ├── timeSystem.ts                     # 全局时间格式化、剩余时间计算、localStorage 存读档
│   ├── main.tsx                          # React 入口，挂载 <App />
│   └── styles.css                        # 全局样式，遵循 ui-design-principles.md 的低保真控制台美学
├── tests/
│   └── e2e/app.spec.ts                   # Playwright 端到端流程测试
├── playwright.config.ts                  # Playwright 配置
├── vite.config.ts                        # Vite 构建配置
└── tsconfig.json                         # TypeScript 配置
```

<!-- last-synced-by audit-wiki: 2026-04-27 -->
