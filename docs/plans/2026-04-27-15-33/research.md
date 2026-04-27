---
topic: event-program-model-player-journey
date: 2026-04-27
research_scope:
  codebase: true
  internet: true
source:
  initial: docs/plans/2026-04-27-15-33/initial.md
  research_topics: docs/plans/2026-04-27-15-33/research-topics.md
---

## 1. Research Summary（研究摘要）

本轮研究聚焦一个决策：是否把当前“触发后立即结算”的事件实现，替换为 `event_definition`、事件图、运行时 `event` 和运行时 `call` 分层模型。结论是方向成立，但不是小改。现有系统能触发、掷概率、执行 effect、弹紧急通话，却没有独立事件实例、通话实例、节点进度、结构化历史和图校验。

外部资料支持“静态内容图 + 运行时状态 + 结构化 condition/effect”的模型。Storylets 适合做事件候选池，事件图适合表达单个事件内部阶段，XState 的 `{ type, params }` guard/action 适合 JSON-first 规则。按用户指令，兼容旧代码和旧存档不是目标；但 design 仍要决定是清档切换、save version bump，还是做一次性迁移提示。

## 2. Project Findings（项目内发现，如果没有进行项目内探索则跳过）

### 2.1 Existing Patterns（现有模式）

- **内容入口**：事件来自 `content/events/events.json`，由 `src/content/contentData.ts` 暴露；数据驱动入口已存在。
- **单步事件**：`src/eventSystem.ts` 按 trigger、标签、字符串 condition、概率和确定性 roll 选最多一个事件，然后立即执行 effects；它像单步 storylet，不是图调度器。
- **通话未分层**：紧急事件存于 `CrewMember.emergencyEvent`，`choices` 同时是逻辑选项和 UI 文案；非紧急 `CallPage` 仍有 Garry/Mike 硬编码分支。

### 2.2 Domain Knowledge（领域知识）

- **玩家旅程约束**：地图只读，指令经通讯台/通话发出；事件必须和行动、等待、来电、日志、时间推进共同工作。
- **历史不足**：`GameState` 只存 crew、tiles、logs、resources、baseInventory、`eventHistory`；没有 `world_history`、`call_history`、运行中事件图状态。当前历史 key 是 `eventId:crewId:tileId`，不足以支撑跨队员目标、冷却和回放。

### 2.3 Recent Changes（最近变更）

- **变化趋势**：近期提交集中在 inventory/event effects、crew 文档、事件 JSON 内容和时间驱动玩法。事件与背包 effect 已是主动耦合点。

### 2.4 Technical Constraints（技术约束）

- **校验入口**：`scripts/validate-content.mjs` 已用 Ajv 和跨文件校验，适合扩展图可达性、引用完整性、condition/effect 静态检查。
- **爆炸半径**：若不保留旧兼容，需要重写 content schema、`contentData` 类型、`eventSystem`、`App` 时间结算与决策流、`CallPage`/`CommunicationStation`，并 bump save version。

## 3. Best Practice Findings（最佳实践发现，如果没有进行互联网研究则跳过）

### 3.1 Common Approaches（常见做法）

- **静态图 + 运行时状态**：ink、Yarn、Twine、Ren'Py、Inform 都区分内容结构、变量状态和展示元数据。
- **Storylet + 事件图**：storylet 决定“现在可发生什么”，事件图决定“发生后如何推进”。

### 3.2 Official Recommendations（官方建议）

- **结构化 guard/action**：XState 建议 guard/action 使用可序列化 `{ type, params }`，guard 保持纯同步布尔函数。
- **严格 schema**：JSON Schema 与 Ajv strict mode 可在运行前发现多余字段、错误引用和类型漂移。

### 3.3 Known Pitfalls（已知陷阱）

- **组合爆炸**：分支若缺少节点边界、终点和覆盖测试，会变成 time-cave。
- **职责混合**：文本、运行时、编辑器布局、debug trace 混在一个对象里，会污染存档和 UI。
- **坏中断**：实时事件若只有惩罚、没有反应时间和有意义选择，会伤害玩家信任。

### 3.4 SOTA / Emerging Practices（前沿实践，可选）

- **自动探索测试**：ChoiceScript Quicktest/Randomtest 提醒我们，事件图要检查可达性、分支覆盖、隐藏选项和终点。

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：一次性重写事件模型 vs 分阶段替换

- **一次性重写的优势**：清理 `emergencyEvent`、硬编码 call、字符串 DSL 和旧存档形状。
- **分阶段替换的优势**：先验证 runtime event/call 是否改善玩家旅程。
- **建议**：兼容不是目标，但 cutover 必须明确：清档、迁移提示，还是开发期静默 bump。

### Trade-off 2：事件图优先 vs 内容 schema 优先

- **事件图优先的优势**：先证明发现、来电、等待、二次通话、行动回写和长期后果。
- **内容 schema 优先的优势**：先稳定内容资产，减少 JSON 反复迁移。
- **建议**：若目标是 gameplay 体验，先做最小 runtime graph；若目标是内容生产，先冻结 schema 与静态校验。

### Trade-off 3：触发池 + 内部图 vs 全局大图

- **触发池 + 内部图的优势**：符合当前事件候选池，便于按地形、队员、历史索引。
- **全局大图的优势**：主线依赖更直观。
- **建议**：MVP 用 storylet 触发池 + 单事件 DAG；跨事件关系用 objective/world_history 连接。

## 5. Key References（关键参考）

### 5.1 Project Files（项目文件）

- `src/eventSystem.ts` - 当前触发、条件、概率和效果结算核心。
- `src/App.tsx` - `GameState`、时间结算和事件触发入口。
- `src/pages/CallPage.tsx` - 当前通话 UI 与非 JSON 驱动分支。
- `src/data/gameData.ts` - 行动常量、队员和初始状态定义。
- `content/schemas/events.schema.json` - 当前事件内容 schema。
- `scripts/validate-content.mjs` - Ajv 与跨文件校验入口。
- `docs/gameplay/event-system/event-system.md` - 当前事件系统设计快照。
- `docs/ui-designs/pages/通话.md` - 通话页面玩家体验约束。

### 5.2 External Links（外部链接）

- https://www.inklestudios.com/ink/ - ink 的内容/运行时分离参考。
- https://raw.githubusercontent.com/inkle/ink/master/Documentation/ink_JSON_runtime_format.md - ink JSON runtime format。
- https://docs.yarnspinner.dev/3.1/write-yarn-scripts/scripting-fundamentals/logic-and-variables.md - Yarn 变量与逻辑。
- https://stately.ai/docs/guards - XState guard 建议。
- https://stately.ai/docs/actions - XState action 建议。
- https://ajv.js.org/strict-mode.html - Ajv strict mode。
- https://www.choiceofgames.com/make-your-own-games/testing-choicescript-games-automatically/ - ChoiceScript 自动分支测试。
- https://emshort.blog/2019/11/29/storylets-you-want-them/ - storylet 模式。
- https://www.gamedeveloper.com/design/building-a-narrative-out-of-push-notifications-in-i-lifeline-i- - Lifeline 的实时通讯叙事。

## 6. Open Questions for Design（留给 design 的问题）

- **Q1**：MVP 优先完整玩家旅程、内容生产，还是编辑器可验证性？
- **Q2**：运行时 `call` 保存选择摘要，还是保存已渲染台词、隐藏选项和 variant 命中？
- **Q3**：哪些事件不打断行动，哪些必须进入 `in_event` 或 `event_waiting`？
- **Q4**：旧存档失效时，玩家看到重置提示、迁移日志，还是开发期静默 bump？
- **Q5**：字符串 condition DSL 立即换成 JSON AST，还是先用 handler registry 过渡？

---

**Research Completed:** 2026-04-27 15:40  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
