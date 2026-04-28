---
type: task-breakdown
date: 2026-04-29
topic: map-object-action-refactor
source:
  technical_design: docs/plans/2026-04-29-01-40/technical-design.md
---

# 任务拆分：map-object-action-refactor

按 technical-design.md §10-e 的"分三步"策略落地为 **3 个串行任务**，每个任务单独 commit；最终在同一个 PR 中提交。

## 任务依赖图

```
Task 1 (基础设施)  ──▶  Task 2 (内容迁移)  ──▶  Task 3 (callActions + UI 切换)
   类型 / effect           独立对象表 +              重写 callActions /
   handler / 测试桩        gameState 集成            CallPage / 删旧
```

强依赖：每个任务完成且测试通过后再启动下一个。

---

## Task 1：基础设施 — 类型、effect handler、condition handler、提示模板

### 任务描述

引入新类型与 effect / condition 扩展点，但**不**改动任何现有运行时行为。完成后 `pnpm test` 仍按现有测试集通过。

涉及改动：

1. **新建** `apps/pc-client/src/content/mapObjects.ts`
   - 导出 `MapVisibility`、`MapObjectKind`、`ActionCategory`、`ActionUnavailableDisplay`、`ActionDef`、`MapObjectDefinition`、`MapObjectRuntime`、`RuntimeMapObjectsState`（参见 technical-design.md §2 的完整 TypeScript 定义）。
   - 本任务**不**包含 glob loader / by-id index（留给 Task 2）。
2. **修改** `apps/pc-client/src/events/types.ts`
   - `EffectType` union 加 `"set_object_status"` 字面量。
   - `EffectGameState.map` 增加 `mapObjects?: RuntimeMapObjectsState`（注意保持向后兼容形态）。
3. **修改** `apps/pc-client/src/events/effects.ts`
   - `applyEffect` switch 增加 `case "set_object_status"`，调用新增内部函数 `setObjectStatus`。
   - 实现按 technical-design.md §5.1 提供的伪代码（含 missing object 与非法 status 的告警分支）。
   - 本任务允许 `mapObjectDefinitionById` 还未真正接入 —— 用 placeholder：从 `(globalThis as any).__mapObjectDefinitionById` 或同等 hook 拿，runtime 会在 Task 2 接入。**临时实现可直接接受任何 status，仅写入；告警与 missing 分支留 TODO 注释，但 case 必须存在以让单测能跑。**
4. **新建** `apps/pc-client/src/conditions/hintTemplates.ts`
   - 暴露 `generateHint(action: ActionDef, failedConditions: Condition[]): string`。
   - 至少覆盖：`inventory_has_item`、`has_tag`、`compare_field`、`handler_condition`（含 `object_status_equals` 名）。
   - 优先使用 `action.unavailable_hint`；否则按 first failed condition 走模板。
5. **修改** `apps/pc-client/src/events/conditions.ts`（如已有 handlerCondition registry）
   - 注册 handler condition `object_status_equals`，params `{ object_id: string, status: string }`。
   - 求值方式：从 `context.state.map?.mapObjects?.[object_id]?.status_enum === status` 判断。
   - 不存在 entry → 返回 false（视为不满足）。
6. **新建测试**
   - `apps/pc-client/src/events/effects.set_object_status.test.ts`
     - 写入新 entry / 更新已有 entry / 非法 status 仍写入并 console.warn。
   - `apps/pc-client/src/conditions/hintTemplates.test.ts`
     - 覆盖每种 condition 类型的模板生成；`unavailable_hint` 覆盖路径。
   - `apps/pc-client/src/events/conditions.object_status_equals.test.ts`
     - mapObjects 含 entry 且 status 匹配 → true；不匹配 → false；缺 entry → false。

### 验收标准 (AC)

- [ ] `apps/pc-client/src/content/mapObjects.ts` 存在并导出 9 个类型。
- [ ] `EffectType` union 含 `"set_object_status"`。
- [ ] `effects.ts:applyEffect` 增加对应 case；新增 effect 单测通过 (`vitest run` 仅这一个文件)。
- [ ] `conditions/hintTemplates.ts` 存在；hintTemplates 单测通过。
- [ ] `object_status_equals` handler condition 注册；其单测通过。
- [ ] 现有所有测试（`pnpm test`）仍通过 —— 本任务不修改运行时入口。
- [ ] TypeScript `pnpm build` 编译通过。

### Commit 信息建议

```
feat(refactor): introduce map-object types + set_object_status effect

- add apps/pc-client/src/content/mapObjects.ts with new type set
- extend EffectType with "set_object_status" + handler in effects.ts
- register object_status_equals handler condition
- add hintTemplates module with generator
- add unit tests for new effect/condition/templates
```

---

## Task 2：内容迁移 + GameState 集成

### 任务描述

把数据层与运行时初始化迁移到新 schema，使 `gameState.map.mapObjects` 在游戏启动时已正确填充。

涉及改动：

1. **新建** `scripts/migrate-map-objects.mjs`
   - 输入：现有 `content/maps/default-map.json`、`content/call-actions/object-actions.json`、`content/call-actions/basic-actions.json`。
   - 输出：
     - 重写 `content/maps/default-map.json`：每 tile 的 `objects` 字段去掉，新增 `objectIds: string[]`。
     - 新建 `content/map-objects/{mainline,resources,hazards,legacy}.json`，结构 `{ "map_objects": MapObjectDefinition[] }`。
     - 新建 `content/universal-actions/universal-actions.json`，结构 `{ "universal_actions": ActionDef[] }`。
   - 字段映射按 technical-design.md §7.2。
   - 脚本须幂等：重跑同样输入产出同样输出。
   - 脚本中加 invariant assert：每个对象 `status_options` 非空、`initial_status ∈ status_options`、所有 `tile.objectIds` 在对象表中能查到。
2. **运行迁移脚本一次**，把生成结果检入 git。
3. **新建** `content/schemas/map-objects.schema.json` 与 `content/schemas/universal-actions.schema.json`（JSON Schema Draft-07，沿用现有 schemas 目录风格）。
4. **修改** `apps/pc-client/src/content/contentData.ts`
   - `MapTileDefinition.objects: MapObjectDefinition[]` → `objectIds: string[]`。
   - 旧 `MapObjectDefinition` 的导出（如有）改为从 `mapObjects.ts` re-export 或删除（推荐删除，让外部直接 import 新模块）。
   - 删除 `MapCandidateAction`、`CallActionDef`、`CallActionId`、`CallActionCategory`、`callActionsContent` 这些已废弃符号 —— 但**不**修改使用方（`callActions.ts` / `CallPage.tsx`）—— 这些留给 Task 3 一并改。如此处删了会造成本任务编译失败，则**只**导出空 stub（`export type CallActionId = never`）以保持编译通过；最终清理在 Task 3。
5. **完善** `apps/pc-client/src/content/mapObjects.ts`
   - 加 glob loader：`import.meta.glob("../../../../content/map-objects/*.json", { eager: true })`。
   - 加 `mapObjectDefinitionById: Map<string, MapObjectDefinition>` 与 `getMapObjectDefinition(id)`。
   - 加 universal actions glob loader（`content/universal-actions/*.json`）+ `universalActions: ActionDef[]` 导出。
6. **修改** `apps/pc-client/src/data/gameData.ts`
   - `GameMapState` 类型增加 `mapObjects: RuntimeMapObjectsState`。
   - 初始化：遍历 `mapObjectDefinitionById`，为每个对象写入 `{ id, status_enum: def.initial_status }`。
   - save / load 路径同步覆盖 `mapObjects` 字段。
7. **修改** `apps/pc-client/src/events/effects.ts`
   - 把 Task 1 留的 `mapObjectDefinitionById` 占位替换为真正的 import。
8. **新建测试**
   - `apps/pc-client/src/content/mapObjects.test.ts` —— 验证 by-id index 在迁移后内容下能正确查到 ≥ 1 个 mainline 对象、universal_actions 数组非空。
   - `apps/pc-client/src/data/gameData.test.ts`（或扩展现有测试）—— 验证 fresh game state 中 `mapObjects` 字段非空且 status 与 def.initial_status 一致。

### 验收标准 (AC)

- [ ] 迁移脚本能在干净 checkout 下重跑产出一致结果。
- [ ] `content/maps/default-map.json` 不再包含 `tile.objects` 内联结构；每 tile 含 `objectIds: string[]`。
- [ ] `content/map-objects/*.json` 至少 1 个文件存在，包含所有原对象。
- [ ] `content/universal-actions/universal-actions.json` 含 4 项（move / survey / standby / stop）。
- [ ] `mapObjectDefinitionById` 与 `universalActions` 在测试 / 运行时可正确加载。
- [ ] `gameState.map.mapObjects` 在游戏初始化后含所有对象 entry，status_enum 等于 def.initial_status。
- [ ] `pnpm test` 仍通过 —— Task 1 单测继续通过；新加的 mapObjects / gameData 单测通过；现有 callActions/CallPage 测试**允许**仍指向旧路径（Task 3 再改）。
- [ ] TypeScript `pnpm build` 编译通过。

### Commit 信息建议

```
feat(refactor): migrate map objects to standalone tables + gameState

- add scripts/migrate-map-objects.mjs (one-shot migration)
- split content/maps/default-map.json: tile.objectIds + content/map-objects/*.json
- add content/universal-actions/universal-actions.json
- add JSON schemas
- mapObjects.ts: glob loader + mapObjectDefinitionById index
- gameData.ts: initialize gameState.map.mapObjects
- contentData.ts: migrate MapTileDefinition.objects -> objectIds
```

---

## Task 3：callActions 重构 + UI 切换 + 删除旧路径

### 任务描述

把 callActions 与通话页切换到新数据源，删除所有遗留过滤逻辑与旧 import；本任务后实现策划案 PS-001 ~ PS-005 的端到端验收。

涉及改动：

1. **重写** `apps/pc-client/src/callActions.ts`
   - 实现 `buildCallView({ member, tile, gameState })` 按 technical-design.md §4 的管线步骤。
   - 候选 = universal_actions ∪ tile 上已揭示对象的 actions。
   - 通过 `events/conditions.ts:evaluateConditions` 求值。
   - 失败 + `display_when_unavailable !== "disabled"` → drop。
   - 失败 + `display_when_unavailable === "disabled"` → 灰显 + `disabledReason = generateHint(...)`。
   - 输出 `CallActionGroup[]`：universal 组置顶 + 每个含可见 action 的对象一组。
   - 删除现有 `buildObjectActionGroups`、`getTileObjects` 兼容回退、`getChoiceItemAvailability` 等基于旧 `applicableObjectKinds` / `usesItemTag` 的代码。
2. **新建** `apps/pc-client/src/conditions/callActionContext.ts`
   - 暴露 `buildCallActionContext({ member, tile, gameState }): ConditionEvaluationContext`，按 technical-design.md §4 步骤 3 拼装。
3. **修改** `apps/pc-client/src/mapSystem.ts`
   - `deriveLegacyTiles` 不再读 `tile.objects`，改为读 `tile.objectIds[]` 并查 `mapObjectDefinitionById` 得到 visibility / kind / legacyResource / 等。
   - reveal 逻辑（`revealedObjectIds[]`）语义不变。
4. **修改** `apps/pc-client/src/pages/CallPage.tsx`（或对应组件路径）
   - 渲染按 `CallActionGroup[]`：每组 `<section>` + `<h3>`；按钮读 `action.disabled` / `action.disabledReason`。
   - 移除依赖 `usesItemTag` / `getChoiceItemAvailability` 的旧 hint 路径。
   - universal 组始终最前。
5. **删除**
   - `content/call-actions/basic-actions.json` import（保留磁盘文件以便 git 历史，但 `contentData.ts` 不再 import）。
   - `content/call-actions/object-actions.json` import 同上。
   - `contentData.ts` 中所有为 Task 2 临时保留的废弃符号 stub（`CallActionDef`、`MapCandidateAction`、`CallActionId`、`CallActionCategory`、`callActionsContent`）。
   - `callActions.ts` 内任何"如果 universal action 没找到事件就走 legacy handler"的兼容分支（按 §9 R7 的 fallback —— **保留** App.tsx 的 `console.warn + fallback` 分支至少跑过一遍 mainline，但允许在所有事件入口齐全后删除；本任务最终态删除）。
6. **改写测试**
   - `apps/pc-client/src/callActions.test.ts` —— 完全重写为 condition 求值 / 灰显 / 隐藏 / 分组的覆盖。
   - `apps/pc-client/src/App.test.tsx` —— 把任何引用 `tile.objects`、`applicableObjectKinds`、旧 callAction id 的断言重写。
   - `apps/pc-client/src/mapSystem.test.ts` —— fixture 改为 `tile.objectIds + map-objects fixture`，覆盖 `revealedObjectIds` 持久语义不变。
   - `apps/pc-client/src/content/mainlineContent.test.ts`（如有）—— 跑通 b589ba6 minimal return-home flow，5 段主线 action 触达 + 结局未变。
7. **新增集成测试**
   - 通话页 → 选择带 set_object_status 的 action → 事件结束 → 再次进入通话 → 该对象的 action 列表按新 status 变化（PS-003 验收）。
   - 队员未带 welder → 切割舱门 disabled + hint；交付 welder 后再次通话 → 启用（PS-002 验收）。

### 验收标准 (AC)

- [ ] `callActions.ts` 不含任何对 object kind / busy / inventoryTag 的硬编码过滤；所有过滤通过 `Condition[]` 表达。
- [ ] 通话页按 universal 置顶 + object 分组渲染；灰显按钮显示 hint。
- [ ] `content/call-actions/*.json` 不再被 `contentData.ts` import。
- [ ] PS-001 / PS-002 / PS-003 / PS-004 / PS-005 的所有 AC 复选框可勾选（即对应集成测试通过 / 手动跑通）。
- [ ] `pnpm test` 全部通过（含 Task 1 / Task 2 单测 + 重写后的 callActions / App / mapSystem / mainlineContent 测试）。
- [ ] `pnpm build` 编译通过；TypeScript 无 any-cast 临时绕过（除迁移脚本外）。
- [ ] 无 `usesItemTag` / `getChoiceItemAvailability` / `MapCandidateAction` / `CallActionDef` 的运行时引用残留。

### Commit 信息建议

```
feat(refactor): rewrite callActions + CallPage on new map-objects schema

- callActions.ts: condition-driven candidate generation; replace static filters
- conditions/callActionContext.ts: ConditionEvaluationContext builder
- mapSystem.ts: deriveLegacyTiles via tile.objectIds + mapObjectDefinitionById
- CallPage.tsx: render CallActionGroup; disabled+hint via condition failure
- remove content/call-actions imports + legacy types
- rewrite callActions/App/mapSystem/mainlineContent tests
- add integration tests for set_object_status round-trip
```

---

## 全局完成定义 (Definition of Done)

完成所有 3 个任务后：

- [ ] 三段 commit 都进入同一分支并 push。
- [ ] PR 标题：`feat: 重构地图对象与行动系统`。
- [ ] PR 描述含本 plan_dir 链接、PS-001~PS-005 验收清单。
- [ ] 文档（map.md / event.md / 通话.md）的同步更新交给 organize-wiki skill 处理（不在本 PR 内）。
