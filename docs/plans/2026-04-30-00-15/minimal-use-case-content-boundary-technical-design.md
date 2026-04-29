# 最小用例内容边界 Technical Design

## 1. 摘要

本技术设计回答两个问题：

1. `minimal-use-case-content-boundary-design.md` 中的 15 步玩家旅程，当前系统应如何实现。
2. 现有 runtime 和 `content/` 是否已经能承载这些内容。

结论：主线闭环所需的大部分 runtime 能力已经存在，且仓库中已经有 `mainline_*.json` 事件资产与对应测试。事件系统支持队员 condition、个人背包、world flags、world counters、地图发现、通话选项、受伤恢复、终局集合判定和结局页。当前主要缺口不是“主线做不了”，而是“runtime 仍加载非主线测试 / 演示内容”。

本轮实现策略按用户确认的方案 A 执行：彻底删除旧可玩事件 JSON 与旧地图对象，只保留主线 content；测试需要的样例迁移到测试 fixture，不再作为正式 `content/` runtime 资产存在。

## 2. 输入与背景

### 2.1 产品输入

- `docs/plans/2026-04-30-00-15/initial.md`
- `docs/plans/2026-04-30-00-15/minimal-use-case-content-boundary-design.md`
- `docs/plans/2026-04-27-23-17/minimal-use-case-design.md`
- `docs/plans/2026-04-27-23-17/technical-design.md`

### 2.2 已确认约束

- 当前可玩版本只承载一条“回家主线”。
- 游戏策划设计和关卡设计必须在 `content/` 静态资产中，不写入页面逻辑或临时代码。
- 事件、通话文本、地图对象、地点、物品和行动入口都属于内容资产。
- 森林野兽、Amy 遇到熊、矿洞异常、沙漠 / 山地样例等非主线测试 / 演示内容不得作为玩家可遭遇内容保留。
- 自动化测试可以保留 fixture 或 sample contexts，但 fixture 不等同于正式 runtime content。

### 2.3 当前仓库事实

现有系统已经包含以下主线能力：

- `content/events/definitions/mainline_crash_site.json`
- `content/events/definitions/mainline_resources.json`
- `content/events/definitions/mainline_village.json`
- `content/events/definitions/mainline_medical.json`
- `content/events/definitions/mainline_hive.json`
- `content/events/definitions/mainline_ending.json`
- `apps/pc-client/src/events/mainlineContent.test.ts`
- `apps/pc-client/src/pages/EndingPage.tsx`
- `apps/pc-client/src/events/conditions.ts` 中的 `all_available_crew_at_tile`
- `apps/pc-client/src/crewSystem.ts` 中的 `wounded` 移动倍率

但 runtime content 边界仍不干净：

- `content/events/manifest.json` 仍注册 `crash_site`、`desert`、`forest`、`mine`、`mountain` 等非主线 domain。
- `apps/pc-client/src/content/generated/eventContentManifest.ts` 仍 import 并导出这些 domain。
- `content/maps/default-map.json` 仍引用森林野兽、旧荒原、非主线资源 / hazard 对象。
- `content/map-objects/resources.json` 与 `content/map-objects/hazards.json` 仍包含旧演示对象。
- `apps/pc-client/src/content/contentData.test.ts` 仍把非主线 domain 当成当前正式 domain 断言。

## 3. 目标与非目标

### 3.1 目标

- 明确 15 步玩家旅程各自使用的系统能力。
- 判定现有系统是否能完成这些内容。
- 删除旧可玩事件 JSON、旧 call templates、旧 presets 和旧地图对象。
- 让 runtime manifest、生成模块、默认地图和 map-object loader 只暴露主线可玩内容。
- 把测试需要的旧样例迁移到测试 fixture 或 inline fixture。
- 加强校验，防止非主线内容、孤立事件文件或错误 `event_id` 再次进入 runtime。
- 保留 `content/` 作为游戏内容唯一事实源；代码只提供通用能力、校验和运行时解释。

### 3.2 非目标

- 不新增主线剧情分支。
- 不实现完整交易系统、村落社会系统、背包转移或共享仓库。
- 不把旧测试 / 演示事件改写成新支线。
- 不通过 runtime 过滤器隐藏旧内容；旧可玩内容应从正式 content 中删除。
- 不为未发布旧存档做兼容。

## 4. 现有系统能力分析

### 4.1 内容加载

事件内容通过 `content/events/manifest.json` 注册，再由 `apps/editor/scripts/generate-event-content-manifest.mjs` 生成 `apps/pc-client/src/content/generated/eventContentManifest.ts`。PC runtime 从 `apps/pc-client/src/content/contentData.ts` 读取生成模块并构建 `eventContentLibrary`。

这套机制适合“正式 runtime content 必须显式登记”的目标。问题是 manifest 目前登记了主线以外的旧 domain。由于生成模块会把所有 manifest domain import 到 runtime，删除旧 domain 必须同步删除文件、更新 manifest 并重新生成模块。

### 4.2 事件系统

事件系统已支持主线需要的大部分通用能力：

- `has_condition`：判断 `knows_repair_tech`、`knows_field_first_aid`、`knows_alien_language`、`wounded`。
- `inventory_has_item`：判断当前队员个人背包中的关键物品。
- `add_item` / `remove_item`：发放和消耗主线道具。
- `add_crew_condition` / `remove_crew_condition`：学习知识、恢复受伤。
- `set_world_flag` / `increment_world_counter`：记录线索、阶段和采集次数。
- `set_discovery_state`：揭示罗塞塔、营地等地点。
- `handler_condition`：通过 `all_available_crew_at_tile` 判断终局集合。
- `call` 节点与 call templates：承载通话文本与选项。

因此主线规则应主要写在 `content/events/definitions/mainline_*.json` 和 `content/events/call_templates/mainline_*.json` 中。代码不应写“村落交易”“火山黑曜石”“巢穴诱饵”等具体策划逻辑。

### 4.3 地图与行动入口

地图配置来自 `content/maps/default-map.json`，地图对象来自 `content/map-objects/*.json`。通话页会根据当前地块、可见对象和 action 条件展示按钮；地点对象 action 的 `event_id` 指向 `EventDefinition.id`。

通用基础行动仍由代码提供：移动、原地待命、停止当前行动、调查当前区域。调查完成后会发出 `action_complete` trigger；主线事件通过 trigger 条件识别当前 tile、object、action type 或 tags。

这个边界符合本轮目标：代码提供“能调查当前区域”的通用能力，具体调查结果仍由 content 事件图决定。

### 4.4 队员、背包与终局

主线关键知识使用 crew condition tags。主线关键物品进入当前行动 / 通话队员的个人背包。现有事件 effects 与 runtime merge 已支持这类变化，`mainlineContent.test.ts` 也覆盖了关键物品、知识和终局条件。

终局集合由 `all_available_crew_at_tile` 判断所有可行动、可通讯队员是否在 `4-4`。`world_flags.return_home_completed` 为 true 后，App 进入 `EndingPage`。

## 5. 15 步玩家旅程映射

| 步骤 | 玩家体验 | 现有系统实现 | 当前判断 |
| --- | --- | --- | --- |
| 1 | 首次通讯得知“找到回家方法” | `mainline_crash_site` 事件设置 `main_objective_return_home_known`，call template 展示目标 | 已具备 |
| 2 | 反复调查坠毁现场，获得物资、雷达线索、维修技术 | 当前区域调查发出 `action_complete`；事件用 world flags 区分阶段，发放物品与 `knows_repair_tech` | 已具备 |
| 3 | 丘陵持续采集，稳定获得稀有矿石样本 | `increment_world_counter rare_ore_gather_count`，达到阈值后 `add_item rare_ore_sample` | 已具备 |
| 4 | 初访村落，语言不通时取得罗塞塔线索 | 村落事件判断缺少 `knows_alien_language`，设置 `rosetta_clue_found` 并揭示地点 | 已具备 |
| 5 | 调查罗塞塔装置，保底学会外星语言 | 罗塞塔对象 / 地点调查触发 `add_crew_condition knows_alien_language`，可重复学习 | 已具备 |
| 6 | 回村交易高温开采设备，并取得营地线索 | 村落 call option 检查 `rare_ore_sample`，消耗样本并添加 `thermal_mining_gear`；村民事件设置营地线索 | 已具备 |
| 7 | 调查医疗舱，获得药品和野外急救 | 医疗舱事件添加 `medicine` 与 `knows_field_first_aid`，并设置可重复学习 flag | 已具备 |
| 8 | 火山取得黑曜石，并获得旧飞船遗迹方向 | 资源事件检查 `thermal_mining_gear` 与非 `wounded`，添加 `obsidian`，设置旧飞船线索 / 发现 | 已具备 |
| 9 | 修复损坏熔炉，制造折跃仓修复套件 | 资源事件检查维修技术与材料，设置 `forge_repaired`，添加 `warp_pod_repair_kit` | 已具备 |
| 10 | 调查旧飞船遗迹，取得折跃坐标 | 旧飞船事件添加 `warp_coordinates` 并设置坐标 flag | 已具备 |
| 11 | 救助村民并探索湿地，稳定取得两个诱饵 | 医疗事件通过药品或急救发放第 1 个 `decoy`，湿地事件发放第 2 个 | 已具备 |
| 12 | 巢穴入口和孵化室各消耗一个诱饵，取得燃料 | 巢穴事件两段检查并 `remove_item decoy`，最终 `add_item alien_slime_fuel` | 已具备 |
| 13 | 所有可行动、可通讯队员回到坠毁区 | 终局事件用 `all_available_crew_at_tile` 检查 `4-4` | 已具备 |
| 14 | 坠毁点按顺序修复、注入燃料、输入坐标并启动 | `mainline_ending` 用 world flags / inventory / condition 组织三步终局 | 已具备 |
| 15 | 展示返航完成 | `return_home_completed` flag 触发 `EndingPage` | 已具备 |

主线闭环本身可以由现有系统完成。真正未完成的是内容边界清理和防回归校验。

## 6. 架构决策记录

### ADR-001：正式 runtime 只加载主线 event domain

**决策**：`content/events/manifest.json` 只保留 `mainline_*` domain。删除旧 `crash_site`、`desert`、`forest`、`mine`、`mountain` 事件定义、通话模板和旧 preset 文件。

**理由**：manifest 是 runtime 事件内容的入口。只要旧 domain 留在 manifest 中，玩家就可能遭遇非主线事件，或测试继续把它们当成当前事实。

**后果**：依赖旧事件 JSON 的测试必须迁移到 fixture 或删除。生成模块必须重跑。

### ADR-002：旧地图对象从正式 content 中删除

**决策**：删除不服务主线的 `content/map-objects/resources.json`、`content/map-objects/hazards.json` 内容，或将其中仍有价值但不触发剧情的氛围对象移入主线文件并标注清楚。默认地图不得引用森林野兽、矿洞异常、沙漠 / 山地样例等旧对象或危险状态。

**理由**：地图对象是关卡设计事实源。旧对象即使没有 action，也会误导主线边界，并可能通过调查 trigger 进入旧事件条件。

**后果**：地图信息密度会暂时降低；这符合最小用例目标。需要保留的纯地形氛围应留在 map tile 的 areaName、terrain、weather、environment 中，而不是保留旧剧情对象。

### ADR-003：测试样例不放在正式 `content/`

**决策**：事件系统测试需要的非主线样例迁移到测试 fixture，例如测试文件内 inline JSON、`apps/pc-client/src/events/__fixtures__/`，或测试专用构造函数。它们不能位于 `content/events/definitions`、`content/events/call_templates` 或 `content/map-objects`。

**理由**：`content/` 是运行时内容事实源。把测试样例留在这里会破坏“正式 content 即玩家可遭遇内容”的约定。

**后果**：测试中不能再 import 旧 `content/events/definitions/forest.json` 等文件。若要验证事件引擎能力，应使用最小 fixture 表达引擎行为。

### ADR-004：校验承担内容边界守门

**决策**：`npm run validate:content` 和相关单元测试应检查 runtime content 边界：

- manifest domain 只允许主线 domain。
- `content/events/definitions` 和 `content/events/call_templates` 不包含未注册 JSON。
- `content/events/presets` 若仍存在文件，必须被 schema 校验并被 manifest 引用。
- map-object action 的 `event_id` 必须指向存在的 `EventDefinition.id`。
- 默认地图引用的 object id 必须存在，且不得引用旧演示对象。

**理由**：单靠人工约定无法长期防止 demo content 回流。

**后果**：校验脚本会更严格。后续新增正式支线必须先更新设计边界，而不是直接把 JSON 放入 content。

## 7. 目标目录边界

实现完成后，正式 runtime content 的推荐形态如下：

```text
content/
├── events/
│   ├── manifest.json
│   ├── definitions/
│   │   ├── mainline_crash_site.json
│   │   ├── mainline_resources.json
│   │   ├── mainline_village.json
│   │   ├── mainline_medical.json
│   │   ├── mainline_hive.json
│   │   └── mainline_ending.json
│   ├── call_templates/
│   │   ├── mainline_crash_site.json
│   │   ├── mainline_resources.json
│   │   ├── mainline_village.json
│   │   ├── mainline_medical.json
│   │   ├── mainline_hive.json
│   │   └── mainline_ending.json
│   └── handler_registry.json
├── map-objects/
│   └── mainline.json
├── maps/
│   └── default-map.json
└── items/
    └── items.json
```

测试 fixture 可以放在 app 测试目录中，但不能作为 runtime content 被 manifest、map loader 或 `contentData.ts` 导出。

## 8. 验证策略

后续实现任务需要按影响范围运行：

- 修改 `content/`：`npm run validate:content`
- 修改 `apps/pc-client/src` 或生成模块：`npm run lint`、`npm run test`
- 修改端到端主线：视情况运行 `npm run test:e2e`

最终收口至少需要证明：

- `content/events/manifest.json` 只包含 `mainline_*` domain。
- `eventContentManifest.ts` 不再 import 非主线事件文件。
- `contentData.test.ts` 的 domain 断言改为主线白名单。
- 默认地图不引用旧演示对象。
- 主线 15 步仍被 `mainlineContent.test.ts` 或等价测试覆盖。
- `validate:content`、`lint`、`test` 通过。

## 9. 风险与缓解

- **删除旧 content 影响事件系统测试**：先迁移测试 fixture，再删除旧 JSON，避免把测试覆盖和 runtime 内容绑在一起。
- **地图对象删除导致页面信息变少**：保留主线对象和地形氛围，不用旧事件对象填充密度。
- **生成模块陈旧**：把生成脚本 check 纳入验证，或在任务中明确重跑生成脚本。
- **未来支线误入主线版本**：通过 manifest 白名单和 content 校验阻止；新增支线前必须另起设计轮次。
- **content 与代码边界反复模糊**：主线具体规则只写事件 JSON；代码只新增通用校验、loader、handler 或 UI 能力。
