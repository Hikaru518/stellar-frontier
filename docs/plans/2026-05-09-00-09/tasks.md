# IAFS 坠毁点开局骨架任务拆分

本文基于 `docs/plans/2026-05-09-00-09/iafs-crash-site-bootstrap-design.md` 与本轮已确认 `technical-design.md`，按依赖顺序拆分为 4 个可串行执行的开发任务。每个任务都应控制在单次 coding subagent session 可完成的范围内。

## 用户故事

- `US1`：作为玩家，我开局应直接处于 `4-4` 坠毁点，并清楚看到当前被山体暂时封锁的活动边界。
- `US2`：作为玩家，我应能在通话页对 `发电机`、`维生装置`、`穿梭机核心` 分别发起“维修”。
- `US3`：作为玩家，我希望维修按队员敏捷结算，失败只耗时、不额外惩罚，并且之后可以重试。
- `US4`：作为玩家，我希望同一对象不能被两名队员同时维修；对象修好后，通话页状态也应立即更新。

## 任务依赖图

```text
TASK-001 内容与地图骨架
  ↓
TASK-002 维修结算与对象状态
  ↓
TASK-003 通话入口与占用反馈集成
  ↓
TASK-004 回归测试与端到端验收
```

### TASK-001: 坠毁点内容与开局地图骨架

**优先级**: P0
**依赖**: 无
**对应 User Story**: US1, US2

**描述**:
先把 IAFS 开局的静态内容骨架落地，包括 `4-4` 坠毁点、三个损坏对象、开局可见范围、山体封锁圈，以及维修 action 所需的 content 入口。
此任务只处理内容与最小内容加载联通，不实现维修运行时结算。完成后，运行时应已经能从内容层读到坠毁点和三个待修对象。

**文件清单**:
- Create:
  - `content/map-objects/iafs-crash-site.json` — 新增三个维修对象定义与 repair action 内容契约
- Modify:
  - `content/maps/default-map.json` — 在 `4-4` 挂载对象并布置封锁圈
  - `content/schemas/maps.schema.json` — 允许不可通行山体 terrain 值
  - `content/schemas/map-objects.schema.json` — 扩 `local_action` repair 契约
  - `apps/pc-client/src/content/mapObjects.ts` — 让 loader/type 能读取新 action 结构
  - `apps/pc-client/src/content/contentData.ts` — 如需要，确保新内容文件被正确载入
- Test:
  - `apps/pc-client/src/content/mapObjects.test.ts` — 覆盖对象定义与新 schema 能被读取

**验收标准**:
- [ ] AC1: `4-4` 上存在 `发电机`、`维生装置`、`穿梭机核心` 三个对象，初始状态均为 `damaged`
- [ ] AC2: 三个对象都定义了“维修” action，且 action 携带本轮 repair 所需的本地 timed 配置
- [ ] AC3: 坠毁点周围一圈地块被配置为明确不可通行的山体边界
- [ ] AC4: `npm run validate:content` 通过，且对象内容加载测试通过

**技术备注**:
- 需要遵循的 ADR：ADR-002, ADR-006
- 需要复用的目录/模块：`content/maps`, `content/map-objects`, `apps/pc-client/src/content/mapObjects.ts`
- 验证命令：`npm run validate:content`

### TASK-002: 维修结算、敏捷公式与对象状态写回

**优先级**: P0
**依赖**: TASK-001
**对应 User Story**: US3, US4

**描述**:
为维修链路补最小专用运行时实现，支持固定耗时、按敏捷计算成功率、成功后写回对象状态、失败仅耗时，以及“同一对象正在被维修”这一运行时占用判定。
此任务不负责把入口挂到通话页按钮上，只实现可被上层调用的规则、类型与结算测试。

**文件清单**:
- Modify:
  - `apps/pc-client/src/callActionSettlement.ts` — 新增 repair settlement 与公式 helper
  - `apps/pc-client/src/events/types.ts` — 扩 `CrewActionType` 与相关 action payload 类型
  - `apps/pc-client/src/data/gameData.ts` — 扩运行时 action 类型与初始桥接
  - `apps/pc-client/src/events/effects.ts` — 如需要，补最小 effect 执行桥以复用 `set_object_status`
- Test:
  - `apps/pc-client/src/callActionSettlement.test.ts` — 覆盖成功、失败、边界概率与 trigger 结果

**验收标准**:
- [ ] AC1: 运行时支持 `repair` 类型的 crew action，并在到时后进入 repair 专用结算
- [ ] AC2: 成功率按 `clamp(min, max, base + agility * ratio + bias - difficulty)` 结算，默认参数下敏捷 `5` 为 100% 成功
- [ ] AC3: 维修成功后对象状态变为 `repaired`
- [ ] AC4: 维修失败时对象保持 `damaged`，且不引入额外伤害、资源损失或额外罚时
- [ ] AC5: 成功与失败两种结算都会发出带 `object_id` 与 `repair_result` 的 `action_complete` 上下文

**技术备注**:
- 需要遵循的 ADR：ADR-001, ADR-004, ADR-005
- 需要复用的目录/模块：`apps/pc-client/src/callActionSettlement.ts`, `apps/pc-client/src/events/effects.ts`
- 验证命令：`cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test`

### TASK-003: 通话入口、对象锁定与维修调度集成

**优先级**: P0
**依赖**: TASK-002
**对应 User Story**: US2, US4

**描述**:
把 repair 真正接到玩家交互上：在普通通话中显示三个对象的“维修”按钮，点击后创建 timed repair crew action；若对象已被其他队员占用，则仍显示按钮但置灰并给出明确提示；修复完成后按钮状态需要立即随对象状态变化而更新。

**文件清单**:
- Modify:
  - `apps/pc-client/src/App.tsx` — 分流 timed object action dispatch，创建 repair crew action，并做二次锁校验
  - `apps/pc-client/src/callActions.ts` — 基于 active `crew_actions` 推导对象锁定态与禁用原因
  - `apps/pc-client/src/conditions/callActionContext.ts` — 如需要，补 repair 视图所需上下文
  - `apps/pc-client/src/pages/CallPage.tsx` — 展示禁用原因或结果反馈
- Test:
  - `apps/pc-client/src/callActions.integration.test.ts` — 覆盖按钮显示、锁定置灰、修复后入口隐藏
  - `apps/pc-client/src/App.test.tsx` — 覆盖 dispatch 创建 repair action 与重复提交失败路径

**验收标准**:
- [ ] AC1: 玩家在 `4-4` 的普通通话中能看到三个对象各自的“维修”入口
- [ ] AC2: 选择“维修”后，会生成带对象 id 和 repair 参数的 timed crew action，而不是直接立即结算
- [ ] AC3: 当某对象正由其他队员维修时，按钮仍可见但为禁用态，并显示明确的“已被占用/当前不可维修”反馈
- [ ] AC4: 某对象修复完成后，再次进入通话时不再把“维修”作为该对象的主要可执行动作
- [ ] AC5: 对已修复对象或已锁定对象的重复提交会被 dispatch 层拒绝

**技术备注**:
- 需要遵循的 ADR：ADR-001, ADR-003
- 需要复用的目录/模块：`apps/pc-client/src/App.tsx`, `apps/pc-client/src/callActions.ts`
- 验证命令：`cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test`

### TASK-004: 回归验证与边界闭环

**优先级**: P1
**依赖**: TASK-001, TASK-002, TASK-003
**对应 User Story**: US1, US2, US3, US4

**描述**:
在功能闭环跑通后，补齐自动化回归与最终验收，确保 IAFS 开局骨架不会破坏现有 PC client 主流程，同时验证山体边界与维修流程在用户旅程上的关键场景。
此任务允许只做少量必要修补，不新增玩法。

**文件清单**:
- Modify:
  - `apps/pc-client/tests/e2e/app.spec.ts` — 如环境允许，补最小 IAFS 开局 e2e 路径
  - `apps/pc-client/src/callActions.integration.test.ts` — 补最终闭环断言
  - `apps/pc-client/src/callActionSettlement.test.ts` — 补边界与回归断言
  - `apps/pc-client/src/App.test.tsx` — 补玩家旅程回归断言
- Test:
  - `apps/pc-client/tests/e2e/app.spec.ts` — 覆盖开局位置/维修主流程或记录环境阻塞

**验收标准**:
- [ ] AC1: 自动化测试覆盖开局坠毁点、维修成功、维修失败可重试、对象占用冲突四条关键路径
- [ ] AC2: `npm run validate:content`、PC client `lint`、PC client `test` 全部通过
- [ ] AC3: 若本地 Playwright 可运行，则 `test:e2e --to @stellar-frontier/pc-client` 通过；若环境阻塞，则在执行报告中明确记录阻塞原因

**技术备注**:
- 需要遵循的 ADR：全部
- 需要复用的目录/模块：现有 PC client 测试入口与 e2e 流程
- 验证命令：`npm run validate:content`, `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js lint`, `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test`, `cd apps/pc-client && node ../../common/scripts/install-run-rushx.js test:e2e`
