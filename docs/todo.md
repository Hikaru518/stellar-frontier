# TODO（设计 / 文档体系级）

本文件记录与 stellar-frontier 项目设计 / 文档体系相关的、目前**有意搁置**但未来值得做的事项。代码实现层面的 TODO 不在这里登记；`audit-wiki` skill 在每轮审计中产生的"待代码处理" TODO 留在对应 `docs/plans/audits/<YYYY-MM-DD-HH-MM>/audit-report.md` 中。

## 事件图节点扩展

**当前状态**：在 `docs/plans/2026-04-27-15-33/` 的事件程序模型头脑风暴中，第一版 event node 类型暂定不包含并行编排能力。

**后续要补充的节点类型**：

- `parallel`：允许一个事件同时开启多个下游节点，用于多队员、多目标或多地点同时推进的复杂事件。
- `join`：允许多个上游节点完成后汇合，用于等待多个目标完成、多个条件满足后进入同一后续阶段。

本轮先固定 `call`、`wait`、`check`、`random`、`action_request`、`objective`、`spawn_event`、`log_only`、`end` 九类节点；`parallel` / `join` 等并行图能力留到后续事件图扩展轮次处理。

## 编辑器级事件内容校验

**当前状态**：在 `docs/plans/2026-04-27-15-33/` 的事件程序模型头脑风暴中，第一版内容校验暂定做到生产级校验，不包含编辑器级分析报告。

**后续要补充的校验能力**：

- 事件分支覆盖率统计。
- 通话 variant 命中率与永远不可达 variant 报告。
- 隐藏选项报告与隐藏原因统计。
- 事件池概率、优先级和互斥关系分析。
- 面向内容生产的质量评分或风险提示。

本轮先保证 schema、ID / 引用、图可达性、终点路径、option / template 对齐、condition / effect 字段类型、handler 参数 schema 和样例事件 dry-run。

## Event Editor 编辑版后续扩展

**当前状态**：在 `docs/plans/2026-05-04-22-17/` 的 Event Editor 编辑版头脑风暴中，MVP 范围先收敛为可编辑 `event_definitions` 与 `call_templates`，用于让策划快速修改事件定义与通话模板。`presets`、`handlers`、`schemas` 和复杂图编辑能力暂不进入 MVP。

**后续要补充的能力**：

- `presets` 编辑：先补齐 preset schema 与校验边界，再开放 condition / effect / effect_group / probability_modifier 等复用片段的创建、编辑、引用检查。
- `handlers` 编辑或管理：明确 handler registry 是否允许策划改动；如允许，需要 handler 参数 schema、目标类型、确定性 / 随机性、失败策略等字段的专用编辑与强校验。
- schema 只读参考增强：不直接编辑 runtime schema，但提供字段说明、枚举来源、示例值和跳转定位，帮助策划理解错误。
- Graph 结构编辑：新增 / 删除 / 重命名节点、修改入口和终点、编辑 transition / option mapping，并提供断链、不可达、循环和终点路径反馈。
- condition / effect builder：用专用控件编辑 `target + field + op + value`、`type + params + failure_policy + record_policy`，避免策划手写复杂 JSON。
- sample context dry-run：从 entry 或指定 node 运行事件预览，展示通话 transcript、可用 / 不可用选项、effect diff、event log 和终点 resolution。
- 教程式能力文档 / handbook：在编辑器内或 `docs/` 中为每种 trigger / node / condition / effect 类型补充完整示例、设计建议、常见坑和可复制案例；MVP 先做可插入模板的工作目录，不做长篇教程。
- 保存事务与版本检查：在多文件联动保存、manifest 更新或批量操作前，引入更严格的 diff、mtime / 版本检查、失败恢复和原子写入策略。
- 内容生产分析：补充事件分支覆盖率、variant 命中率、隐藏选项原因、事件池概率 / 优先级 / 互斥关系等编辑器级报告。

本轮 MVP 先解决已有 definition 与 call template 的安全编辑、校验、diff 和保存；以上能力留到后续 Event Editor 增强轮次处理。

## Content 加载架构统一

**当前状态**：在 `docs/plans/2026-05-04-22-17/` 的 Event Editor 编辑版头脑风暴中，MVP 决定只调整 structured event 内容加载：PC client 不再依赖 `apps/pc-client/src/content/generated/eventContentManifest.ts`，改为通过 `content/events/manifest.json` + Vite `import.meta.glob` 加载 event definitions / call templates / presets。crew、items、maps、map objects、universal actions 等其他 content 类型暂时保持现有加载方式。

**后续要补充的能力**：

- 统一所有 `content/` 加载模式：评估是否把 crew、items、maps、map objects、tilesets、universal actions 等也迁移到 manifest / glob / registry 驱动，减少手写 import 与生成文件。
- content loader 迁移策略：如果未来范围较大，设计 generated loader 与 glob loader 的兼容期、迁移检查、回滚方式和测试覆盖。
- content HMR / editor 联动：评估 editor 保存内容后，PC dev server 是否能稳定感知新增文件、manifest 更新和热更新边界。
- manifest 责任边界：统一定义哪些内容必须出现在 manifest / registry，哪些允许目录扫描，避免不同内容类型各自演化出不一致规则。
- 其他编辑器迁移：当 Character / Item / NPC 等 editor 从只读或未实现走向 authoring 时，统一评估它们是否也应采用 manifest / registry / glob 驱动的内容发现与保存边界，避免每个 editor 维护一套互不兼容的 loader 规则。

本轮不做全仓 content loader 统一，也不保留 event generated TS 与 glob loader 的长期双轨；先只解决 Event Editor 新建 domain 时不应修改 generated TypeScript 的问题。

## Wiki 索引页 / 子系统总览（已收口于 audit-wiki skill）

**当前状态**：已由 `audit-wiki` skill 处理。

- 索引页路径：`docs/index.md`
- 维护方：`audit-wiki` skill 的 Step 5.1 自动重生成
- 模板：`.codex/audit-wiki/references/index-template.md`
- 索引页包含：每个子系统的标题、scope、`last_updated`、一句话概述、与其他系统的耦合关系图（mermaid，自动从各 wiki 章节 6「系统交互」抽取）

**仍未处理的子项**：

- 索引页的「状态」列（已实现 / 部分实现 / 仅设计 / 已废弃）判定细则仍需要随实际 audit 经验继续微调。
- 是否引入 `whole-game-index` 这一 scope 暂不需要（`docs/index.md` 直接由 audit-wiki 生成、`organize-wiki` 不动它，二者职责清晰）。

如果未来有更复杂的索引需求（例如按 scope / 按耦合度 / 按更新时间多视图），再考虑独立 skill 或扩展 `audit-wiki/references/index-template.md`。

## Phaser 地图 e2e 测试策略扩展

**当前状态**：Phaser 地图 MVP（`docs/plans/2026-04-30-18-46/`）的 e2e 测试采用机制 A（DOM `data-`* 属性桥接），覆盖 zoom level、人物当前格等可观察状态。

**后续要补充**：

- **机制 B**：在 Phaser Scene 内设置 `window.__mapTestState`（仅 `import.meta.env.DEV` 下），Playwright 通过 `page.evaluate()` 读取，覆盖摄像机 scroll 位置（`cameraScrollX/Y`）、轨迹长度（`trailLength`）等内部状态，以验证拖拽平移和人物移动轨迹。
- 机制 B 的测试仅在 `vite dev`（开发服务器）下运行，不在 `vite preview`（生产构建）下运行。

本轮 MVP 先保证机制 A 可运行；机制 B 等 Phaser 地图功能稳定后再补充。

## 战争迷雾 / 探索可见性重设计

**当前状态**：PC 地图和通话移动选点已经取消临时 `3 x 3` / discovered frontier 限制，当前完整显示默认 `8 x 8` 地图，并允许选择任意合法 authored tile。`GameState.map.discoveredTileIds`、`initialDiscoveredTileIds` 和 `getVisibleTileWindow` 仍保留在代码与内容模型中，但不作为当前玩家可见范围或移动规则。

**后续要补充**：

- 战争迷雾的视觉层级：完全未知、粗略信号、队员回传、已调查等状态如何显示。
- 信息隐藏规则：区域名、地形、天气、对象、特殊状态、环境属性分别在哪个状态可见。
- 移动目标规则：是否允许移动到未知格、边境格或只允许移动到已掌握格。
- 队员回传与事件触发：抵达、调查、失联、危险状态如何改变地图可见性。
- UI 文案和测试：避免再次出现临时规则与正式体验混在一起。
