---
topic: minimal-use-case-content-boundary
date: 2026-04-30
status: draft
source:
  design: docs/plans/2026-04-30-00-15/minimal-use-case-content-boundary-design.md
  technical_design: docs/plans/2026-04-30-00-15/minimal-use-case-content-boundary-technical-design.md
  tasks: docs/plans/2026-04-30-00-15/minimal-use-case-content-boundary-tasks.json
---

# 最小用例内容边界 Implementation Plan

## 1. 目标

本计划把“最小用例内容边界设计”转化为后续可串行执行的开发任务。实现完成后，当前可玩版本只加载一条“回家主线”：

- 玩家从坠毁现场建立“找到回家方法”的目标。
- 玩家通过调查、采集、学习、交易、治疗、修复和处理巢穴风险取得关键物品与知识。
- 玩家命令所有可行动、可通讯队员回到坠毁区。
- 玩家完成折跃仓修复、注入燃料、输入坐标并启动。
- 系统展示返航完成。

所有可玩游戏内容都应来自 `content/` 静态资产。测试 / 演示剧情不能作为正式 runtime content 保留。

## 2. 技术方案摘要

### 2.1 现有系统能否完成主线

现有系统基本能完成主线 15 步。事件系统已经支持主线需要的通用能力：

- crew condition：维修技术、野外急救、外星语言、受伤。
- 个人背包：关键物品的获得、消耗和条件判断。
- world flags / counters：线索、阶段、采集次数和终局状态。
- 地图发现与地图对象：地点揭示、对象调查和通话行动入口。
- call templates：主线通话文本和选项。
- 终局集合：`all_available_crew_at_tile`。
- 结局页：`return_home_completed` 后进入 `EndingPage`。

仓库中也已经存在 `mainline_crash_site`、`mainline_resources`、`mainline_village`、`mainline_medical`、`mainline_hive`、`mainline_ending` 等主线事件资产，以及 `mainlineContent.test.ts` 的主线契约测试。

### 2.2 当前缺口

当前缺口是正式 runtime content 边界不干净：

- `content/events/manifest.json` 仍注册旧 `crash_site`、`desert`、`forest`、`mine`、`mountain` domain。
- 生成模块仍把旧事件 JSON import 到 PC runtime。
- 默认地图和 map-objects 仍包含森林野兽、旧资源、旧 hazard 等非主线内容。
- 部分测试仍把旧事件 JSON 当成正式 content fixture 使用。

这些内容会破坏“当前版本只承载回家主线”的设计边界。

### 2.3 已确认策略

用户已确认采用方案 A：

> 彻底删除旧事件 JSON 与旧地图对象，只保留主线 content；测试需要的样例改到测试 fixture。

因此本计划不使用 runtime 过滤器隐藏旧内容，也不把旧事件留在 `content/` 中等待未来复用。未来如需支线，应另起设计轮次并重新进入 content 边界评审。

### 2.4 T001 审计基线

本轮唯一可玩 event domain 是：

- `mainline_crash_site`
- `mainline_resources`
- `mainline_village`
- `mainline_medical`
- `mainline_hive`
- `mainline_ending`

`apps/pc-client/src/content/contentData.test.ts` 已把这 6 个 domain 写成测试基线，并把当前仍在 runtime manifest 中的非主线 domain 单独列出。T001 不删除 content，也不改玩法逻辑；T002-T004 按下面的审计清单迁出旧内容。

#### 事件资产待迁出

| domain | definition | event definition id | call template | preset | 处理 |
| --- | --- | --- | --- | --- | --- |
| `crash_site` | `content/events/definitions/crash_site.json` | `crash_site_wreckage_recon` | `content/events/call_templates/crash_site.json` | 无 | 删除剧情内容；普通残骸调查已由 `mainline_crash_site` 覆盖。 |
| `desert` | `content/events/definitions/desert.json` | `volcanic_ash_trace` | `content/events/call_templates/desert.json` | 无 | 保留“跨队员 objective”测试价值，迁移为测试 fixture；删除沙漠剧情文本。 |
| `forest` | `content/events/definitions/forest.json` | `forest_trace_small_camp`, `forest_beast_emergency` | `content/events/call_templates/forest.json` | `content/events/presets/forest.json` | 保留普通发现、紧急来电、missed call 和 blocking 测试价值，迁移为测试 fixture；删除森林营地和野兽剧情文本。 |
| `mine` | `content/events/definitions/mine.json` | `mine_anomaly_report` | `content/events/call_templates/mine.json` | 无 | 删除剧情内容；矿脉空声是旧演示，不作为当前主线 runtime content。 |
| `mountain` | `content/events/definitions/mountain.json` | `garry_mine_anomaly_report` | `content/events/call_templates/mountain.json` | 无 | 删除剧情内容；与旧矿洞异常样例重复，不保留为正式内容。 |

`apps/pc-client/src/events/sampleFixtures.ts` 目前仍直接 import `desert`、`forest`、`mountain` 的正式 content 文件和 `forest` preset。T004 需要把仍有系统测试价值的样例改为测试专用 fixture。`apps/editor/helper/contentStore.test.mjs`、`apps/editor/src/event-editor/*test.tsx` 和 `apps/editor/scripts/generate-event-content-manifest.test.mjs` 还引用旧文件路径作为编辑器或生成器样例；这些测试应在 T004/T005 中改用测试 fixture 或临时目录，不应继续依赖正式 runtime content。

#### 地图对象待迁出

| 文件 | map object id | 默认地图引用 | 处理 |
| --- | --- | --- | --- |
| `content/map-objects/resources.json` | `black-pine-stand` | `2-3` | 删除；旧森林资源，带 `forest` 标签。 |
| `content/map-objects/resources.json` | `fallen-timber` | `2-4` | 删除；旧资源氛围对象，不服务主线行动入口。 |
| `content/map-objects/resources.json` | `needlewood-stand` | `7-4` | 删除；旧森林资源对象。 |
| `content/map-objects/resources.json` | `southwest-timber` | `5-3` | 删除；旧森林资源对象。 |
| `content/map-objects/hazards.json` | `animal-tracks` | `2-3` | 删除；旧森林野兽入口。 |
| `content/map-objects/hazards.json` | `acidic-marsh` | `6-1` | 删除或改为纯地形文本；当前主线只需要 `mainline-marsh-decoy-source`。 |
| `content/map-objects/hazards.json` | `fracture-vent` | `6-5` | 删除或改为纯地形文本；当前主线只需要 `mainline-damaged-forge`。 |

`content/map-objects/mainline.json` 中的 `abandoned-medical-pod`、`crash-site-wreckage`、`iron-ridge-deposit` 和 `iron-ridge-outcrop` 虽然不是 `mainline-*` 前缀，但已带 `mainline` 标签并服务当前主线，不列为 T001 删除目标。

#### 默认地图待清理引用

- `1-7`：`specialStates[]` 含 `static-front`。
- `2-3`：`objectIds[]` 含 `black-pine-stand`、`animal-tracks`；`specialStates[]` 含 `beast-approach` 和 `dangerTags: ["beast_tracks"]`。
- `2-4`：`objectIds[]` 含 `fallen-timber`。
- `4-2`：`specialStates[]` 含 `unknown-echo`。
- `5-3`：`objectIds[]` 含 `southwest-timber`。
- `6-1`：`objectIds[]` 含 `acidic-marsh`；`specialStates[]` 含 `acid-rain-pool`。
- `6-5`：`objectIds[]` 含 `fracture-vent`。
- `7-4`：`objectIds[]` 含 `needlewood-stand`。

## 3. 15 步主线实现方式

主线步骤与系统实现关系如下：

1. 首次通讯建立目标：`mainline_crash_site` 设置主目标 flag 并展示 call template。
2. 坠毁点多次调查：调查 trigger 推进阶段，发放物资、雷达线索和 `knows_repair_tech`。
3. 丘陵采集：world counter 记录采集次数，达到阈值后发放 `rare_ore_sample`。
4. 初访村落：缺少语言时设置罗塞塔线索并揭示罗塞塔地点。
5. 罗塞塔学习：调查罗塞塔后添加 `knows_alien_language`。
6. 村落交易与营地线索：用 `rare_ore_sample` 换 `thermal_mining_gear`，并设置营地线索。
7. 医疗舱：发放 `medicine`，添加 `knows_field_first_aid`。
8. 火山：检查 `thermal_mining_gear` 和非受伤状态，发放 `obsidian` 并揭示旧飞船方向。
9. 熔炉：检查维修技术与材料，修复熔炉并制造 `warp_pod_repair_kit`。
10. 旧飞船：调查后获得 `warp_coordinates`。
11. 营地与湿地：救助村民取得一个诱饵，湿地取得第二个诱饵。
12. 巢穴：入口和孵化室各消耗一个 `decoy`，取得 `alien_slime_fuel`。
13. 全员返回坠毁区：终局事件通过 `all_available_crew_at_tile` 检查 `4-4`。
14. 折跃仓三步：修复仓体、注入燃料、输入坐标并启动。
15. 返航完成：设置 `return_home_completed`，进入 `EndingPage`。

这些规则应保持在 `mainline_*.json`、地图 content、物品 content 和 handler registry 中。代码层只提供通用解释能力。

## 4. 任务顺序

任务详情见 `minimal-use-case-content-boundary-tasks.json`。数组顺序就是后续串行执行顺序。

1. **T001 建立可玩内容边界审计与基线断言**：先把当前旧 domain、旧地图对象和旧测试样例列清，避免删除时遗漏。
2. **T002 删除非主线结构化事件资产并重生成 manifest 模块**：清理事件入口，使 runtime 只加载主线 event domain。
3. **T003 清理默认地图与旧地图对象**：移除旧演示对象和危险状态，让地图只承载主线地点与氛围。
4. **T004 迁移事件系统测试样例到测试 fixture**：保留系统测试能力，但不再从正式 content import 旧剧情。
5. **T005 加强 content 校验防止非主线内容回流**：把边界写入自动校验，覆盖 manifest、presets、map-object event_id 和默认地图 objectIds。
6. **T006 验证主线 15 步闭环仍完整可玩**：旧内容删除后，确认主线仍由 content 驱动并可完成。
7. **T007 同步正式文档中的当前内容边界**：把实现后的当前事实合入正式知识库。

排序理由：

- 先审计，再删除，避免误删测试仍需要的系统 fixture。
- 事件 manifest 和地图对象可以并行理解，但串行执行时先固定事件入口，再清地图入口。
- fixture 迁移和校验加强在删除后收口，确保新边界可长期维护。
- 主线完整验收放在最后，证明删除旧内容没有破坏最小用例。

## 5. 验证要求

每个开发任务按影响范围运行验证：

- 修改 `content/`：运行 `npm run validate:content`。
- 修改 `apps/pc-client/src` 或生成模块：运行 `npm run lint` 和 `npm run test`。
- 修改端到端验收：视情况运行 `npm run test:e2e`。

最终收口任务至少需要运行：

- `npm run validate:content`
- `npm run lint`
- `npm run test`

如果没有运行 `npm run test:e2e`，任务总结必须说明原因和替代验证。

## 6. 主要风险

- **旧事件测试依赖正式 content**：通过 T004 把系统测试迁移到 fixture，避免以测试为理由保留旧剧情。
- **地图信息密度降低**：这是可接受结果。当前目标是主线闭环，不是填满地图对象。
- **生成模块不同步**：T002 必须重跑 generator，并让测试断言 generated domains。
- **未来内容误入 runtime**：T005 用校验守门；新增正式支线前必须先更新设计。
- **主线能力被误判为缺失**：T006 逐步验收 15 步，避免在清理旧内容时引入不必要的新系统。

## 7. 输出文件

- `docs/plans/2026-04-30-00-15/minimal-use-case-content-boundary-technical-design.md`
- `docs/plans/2026-04-30-00-15/minimal-use-case-content-boundary-tasks.json`
- `docs/plans/2026-04-30-00-15/minimal-use-case-content-boundary-implementation-plan.md`

完成本计划后，不自动进入实现阶段。后续需要明确指令再按 `minimal-use-case-content-boundary-tasks.json` 串行派发开发任务。
