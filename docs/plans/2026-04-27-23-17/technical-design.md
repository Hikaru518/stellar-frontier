# Minimal Use Case 技术设计

## 1. 背景

本技术设计基于 `docs/plans/2026-04-27-23-17/minimal-use-case-design.md` 与本轮代码 / content 调研结果，目标是在当前 React/Vite PC 客户端与 content/event graph 架构中落地一条可稳定通关的 MVP 主线。

玩家作为远程指挥者，通过“通讯台 -> 通话 -> 行动 / 事件 / 地图发现”调度坠毁小队，逐步取得维修技术、外星语言、关键材料、折跃坐标和外星粘液燃料，最终在坠毁点修复折跃仓并返航。

本设计遵循最小正确改动原则：不引入服务端，不改变核心设计原则，不把 MVP 提前扩展为复杂村落、贸易、背包或医疗系统。

## 2. 目标

### 2.1 必须实现

- 保底主线可完整通关，不依赖随机掉落、高属性或单一队员存活。
- 每个主线必需地点、物品、知识都有稳定来源和明确用途。
- 关键知识可重复学习，避免单一携带者失效导致硬锁。
- 稀有矿石样本在丘陵采集 3 次后保底获得。
- 巢穴路线需要 2 个诱饵，入口与孵化室各消耗 1 个；MVP 必须提供稳定取得 2 个诱饵的路线。
- 受伤具备最小系统效果：移动变慢、高风险选项禁用、可通过药品或野外急救恢复。
- 终局要求所有非失联 / 死亡 / 不可用且可通讯的队员回到 `4-4`，并新增薄 `EndingPage` 展示返航完成。

### 2.2 体验目标

- 前半段体现“信息不足下的探索调度”。
- 中段体现“通过语言、交易、医疗和制造串联返航方案”。
- 后段体现“关键前置完成后，明确推进折跃仓终局”。

## 3. 不做

- 不引入服务端或专属后端状态。
- 不实现离线推进、关闭游戏后的补算、现实时间事件。
- 不实现专用村落菜单；村落交互使用地图对象 + 通话行动按钮。
- 不实现完整交易系统；MVP 只做关键交易。
- 不实现队员间物品转移、背包负重、基地共享仓库玩法。
- 不实现复杂医疗、感染、长期残废、士气或关系联动。
- 不实现驯兽、巢穴迷宫、女王室、蜂群社会知识等 Later 内容。
- 不实现雷达升级与细粒度扫描子界面；雷达只稳定给主线线索。

## 4. 当前代码约束

### 4.1 PC 客户端与状态

- `apps/pc-client/src/App.tsx` 持有权威 `GameState`，并通过 `localStorage` 持久化。
- 当前页面类型位于 `apps/pc-client/src/data/gameData.ts`，`PageId` 只有 `control`、`station`、`call`、`map`。
- 当前没有全局完成态，也没有返航结局页面。
- `App.tsx` 会把 UI 状态转换为 event runtime state，再把 runtime 结果 merge 回 UI 视图。

### 4.2 Content 加载

- `apps/pc-client/src/content/contentData.ts` 当前手工静态 import 固定事件域。
- `npm run validate:content` 会扫描 `content/events/definitions/*.json` 与 `content/events/call_templates/*.json` 下全部 JSON。
- 因此存在风险：新增事件 content 可以通过校验，但未被 `contentData.ts` import，导致 app runtime 不加载。

### 4.3 普通行动边界

- `apps/pc-client/src/callActionSettlement.ts` 中普通行动处理器保持通用：
- `survey/surveyObject` 标记调查、揭示对象、发出 `action_complete` trigger。
- `gather` 根据对象 `legacyResource` 给当前队员背包添加基础资源。
- `build/extract/scan` 只完成行动并发出 trigger，不处理复杂成本与产物。
- MVP 主线的条件、成本、产物和分支应优先写入 event graph，而不是扩普通行动为通用配方系统。

### 4.4 Event Runtime 能力

- `apps/pc-client/src/events/conditions.ts` 已支持 `has_condition`、`attribute_check`、`inventory_has_item`、`world_flag_equals`、`world_history_exists/count`、`handler_condition`。
- `apps/pc-client/src/events/effects.ts` 已支持 `add_crew_condition`、`remove_crew_condition`、`add_item`、`remove_item`、`transfer_item`、`set_world_flag`、`increment_world_counter`、`write_world_history`、`add_event_log`。
- `apps/pc-client/src/events/graphRunner.ts` 已支持 call、wait、check、random、action_request、objective、spawn_event、log_only、end 等节点。

### 4.5 Inventory 同步缺口

- `toEventEngineState` 会把 `crew.inventory`、`baseInventory`、`resources` 转为 runtime `inventories`。
- 当前 `mergeEventRuntimeState` 只同步部分 crew/tile 视图，未稳定把 runtime `inventories` 回写到 `crew.inventory` 或 `baseInventory`。
- 主线关键物品已确认进入队员个人背包，因此事件 `add_item/remove_item` 的 UI 可见性与后续条件判断必须优先修复。

### 4.6 受伤与终局缺口

- `apps/pc-client/src/crewSystem.ts` 的移动耗时只看地形，不看 `wounded`。
- 当前普通行动和事件 UI 没有统一高风险限制。
- 当前没有 `EndingPage` 或完成态。

## 5. 已确认决策

本章为后续实现任务的固定输入，除非另起设计轮次，否则不再反复讨论。

| 决策项 | 已确认方案 |
| --- | --- |
| 事件 content 加载 | 使用 Vite `import.meta.glob(..., { eager: true })` 自动聚合 definitions、call_templates、presets。 |
| 知识标签 | 使用 crew `condition_tags`，不使用 expertise tags。 |
| 主线关键物品归属 | 进入队员个人背包，不进入共享基地库存。 |
| 个人背包限制 | 事件条件优先检查当前行动 / 通话队员背包；MVP 不实现队员间转移。若携带者失效，必须通过可重复来源或替代来源避免硬锁。 |
| 稀有矿石样本 | 丘陵采集 3 次后保底获得。 |
| 巢穴诱饵 | 总共消耗 2 个，入口与孵化室各消耗 1 个。浅滩湿地 / 额外诱饵来源进入 MVP content 或成为保底路线前置。 |
| 终局集合 | 所有非失联 / 死亡 / 不可用且可通讯的队员都必须在 `4-4`。 |
| 受伤 | `wounded` 使移动耗时 1.5x，高风险事件选项禁用，药品 / 野外急救恢复。 |
| 村落交互 | 地图对象 + 通话行动按钮，不做专用村落菜单。 |
| 终局展示 | 新增薄 `EndingPage`。 |
| 主线 content 组织 | 按域拆分。 |

## 6. 代码改动设计

### 6.1 自动聚合事件 content

修改 `apps/pc-client/src/content/contentData.ts`：

- 用 `import.meta.glob` eager 加载 `content/events/definitions/*.json`。
- 用 `import.meta.glob` eager 加载 `content/events/call_templates/*.json`。
- 用 `import.meta.glob` eager 加载 `content/events/presets/*.json`。
- 保留 `handler_registry.json` 的单文件 import。
- 聚合后仍导出 `eventProgramDefinitions`、`callTemplates`、`presetDefinitions`、`eventContentLibrary`。

设计要点：

- `validate-content` 扫描到的 JSON 与 app runtime 加载范围保持一致。
- 新增主线 domain 文件后不需要继续改 `contentData.ts` import 列表。
- 测试需要覆盖“新增 mock domain 可被聚合”的行为，或至少断言现有所有 definitions/call_templates 被聚合数量与 fixture 一致。

### 6.2 修复个人背包 runtime 同步

主线关键物品进入队员个人背包，因此 inventory 同步是前置任务。

修改 `apps/pc-client/src/App.tsx`：

1. `toEventEngineState`：
   - 由当前 `crew.inventory` 生成 `crew:<crewId>` inventory。
   - 保留 runtime-only inventory。
   - 避免旧 `state.inventories["crew:<crewId>"]` 覆盖当前 `crew.inventory` 派生结果。

2. `mergeEventRuntimeState`：
   - 读取 `eventState.inventories["crew:<crewId>"]`。
   - 将其 `items` 同步回对应 `CrewMember.inventory`。
   - 同步时保留 `CrewMember` 其他字段和本次 runtime 更新的 conditions/personalityTags。

3. base inventory：
   - 虽然主线关键物品不进入共享基地库存，仍应保持 `base` inventory 与 `baseInventory/resources` 的现有一致性，避免旧功能回归。

最小化处理：

- 不新增物品转移 UI。
- 不新增队员背包管理界面。
- 事件条件默认检查当前事件 primary crew 对应的 `crew_inventory`。

### 6.3 知识标签同步

MVP 使用 crew condition tags：

| 中文名 | tag |
| --- | --- |
| 维修技术 | `knows_repair_tech` |
| 野外急救 | `knows_field_first_aid` |
| 外星语言 | `knows_alien_language` |

代码层使用现有 `add_crew_condition`、`remove_crew_condition`、`has_condition`。

UI 层暂不新增专用技能栏，沿用现有队员 conditions 展示。若展示文案不足，可在后续 UI 任务中加入 condition label 映射，但不阻塞主线实现。

### 6.4 受伤移动倍率

修改 `apps/pc-client/src/crewSystem.ts`：

- 当队员 `conditions` 包含 `wounded` 时，移动每步耗时乘以 `1.5`。
- 倍率应影响 `createMovePreview` 与实际移动行动，确保预览和结算一致。
- 推荐在计算 step duration 时引入小型 helper，例如根据 member condition 包装 terrain cost；不要把受伤逻辑散落到多处。

边界：

- MVP 不降低属性。
- MVP 不影响普通 survey/gather/build 耗时。
- 高风险限制由事件 option requirements 负责。

### 6.5 高风险事件选项禁用

高风险 action 不作为新的普通行动系统实现，而在事件 option requirements 中限制：

- 火山采集黑曜石。
- 巢穴入口危险推进。
- 巢穴孵化室采集燃料。
- 后续危险事件中的强行突破选项。

实现方式：

- 对高风险 option 添加 `not has_condition(wounded)` 或等价 requirements。
- Runtime call renderer 已根据 option requirements 生成 available options；不可用选项在通话中不应被提交。

### 6.6 恢复受伤

通过事件通话选项实现，不新增通用治疗行动。

药品恢复：

- 条件：当前队员背包有 `medicine`。
- 效果：`remove_item medicine`，`remove_crew_condition wounded`。

野外急救恢复：

- 条件：当前队员有 `knows_field_first_aid`。
- 效果：`remove_crew_condition wounded`。

### 6.7 终局集合判定

终局启动前需要检查：

- 所有非失联 / 死亡 / 不可用且可通讯的队员都在 `4-4`。

推荐实现为 event condition handler 或 App 层终局前置 helper。

最小推荐：新增一个 condition handler，例如 `all_available_crew_at_tile`：

- params：`tile_id: "4-4"`。
- 可行动队员判定：`!member.unavailable && member.canCommunicate && status 不是 lost/dead`。
- 由于 event runtime 的 `CrewState.status` 与 UI `CrewMember.status` 有语义差异，需谨慎从 runtime crew 状态判定。

备选：终局事件在 App 层通过特殊 effect / flag 触发前检查，但会让 content 与代码耦合更强。

推荐使用 handler，因为终局条件属于事件图条件，且后续可测试。

### 6.8 EndingPage

新增薄页面：

- `apps/pc-client/src/pages/EndingPage.tsx`
- `PageId` 增加 `ending`
- App 检测 `world_flags.return_home_completed === true` 后进入 ending 页面

页面内容：

- 标题：返航完成
- 简要总结：折跃仓启动，小队返航
- 完成时间
- 可选按钮：重置游戏 / 回控制中心查看记录

最小状态来源：

- `world_flags.return_home_completed`
- `world_flags.return_home_completed_at` 或 event log 时间

## 7. Content 改动设计

### 7.1 文件组织

主线 content 按域拆分，推荐新增：

- `content/events/definitions/mainline_crash_site.json`
- `content/events/definitions/mainline_resources.json`
- `content/events/definitions/mainline_village.json`
- `content/events/definitions/mainline_medical.json`
- `content/events/definitions/mainline_hive.json`
- `content/events/definitions/mainline_ending.json`
- `content/events/call_templates/mainline_crash_site.json`
- `content/events/call_templates/mainline_resources.json`
- `content/events/call_templates/mainline_village.json`
- `content/events/call_templates/mainline_medical.json`
- `content/events/call_templates/mainline_hive.json`
- `content/events/call_templates/mainline_ending.json`

如需共用 condition / effect preset，可新增：

- `content/events/presets/mainline.json`

### 7.2 Items

新增主线物品到 `content/items/items.json`。

| itemId | 名称 | category | stackable | consumedOnUse | 用途 |
| --- | --- | --- | --- | --- | --- |
| `medicine` | 药品 | consumable | true | true | 治疗受伤、救助村民 |
| `rare_ore_sample` | 稀有矿石样本 | quest | true | true | 交易高温开采设备 |
| `thermal_mining_gear` | 高温开采设备 | tool | false | false | 火山采集黑曜石 |
| `obsidian` | 黑曜石 | resource | true | true | 制造折跃仓修复套件 |
| `warp_pod_repair_kit` | 折跃仓修复套件 | quest | false | true | 修复折跃仓仓体 |
| `warp_coordinates` | 折跃坐标 | quest | false | false | 输入终局坐标 |
| `decoy` | 诱饵 | consumable | true | true | 巢穴入口与孵化室各消耗 1 个 |
| `alien_slime_fuel` | 外星粘液燃料 | quest | false | true | 终局注入燃料 |

注意：

- 知识不作为 item 表示，使用 `condition_tags`。
- 主线关键物品进入当前行动 / 通话队员的个人背包。
- 因 MVP 不做转移系统，关键来源必须尽量可重复或提供替代来源。

### 7.3 地图地点与对象

在 `content/maps/default-map.json` 中复用现有 `8 x 8` 地图，不扩尺寸。

推荐地块映射：

| 地点 | tile | 对象 |
| --- | --- | --- |
| 坠毁区域 | `4-4` | 坠毁残骸、损坏折跃仓、日志技术文档、基础雷达 |
| 丘陵矿带 | `3-3` / `3-4` | 铁矿床、稀有矿石样本进度 |
| 外星村落 | `2-4` | 商人、村民 |
| 罗塞塔装置 | `1-4` | 罗塞塔装置 |
| 医疗舱 | `4-1` | 损坏医疗舱、医疗文档 |
| 损坏熔炉 | `6-5` | 损坏熔炉 |
| 火山 | `8-5` | 高温采集点、黑曜石矿脉 |
| 旧飞船遗迹 | `4-8` | 半埋残骸、失效驾驶舱 |
| 受伤村民营地 | `5-2` | 受伤村民 |
| 浅滩湿地 | `6-1` | 小型生物诱饵来源 |
| 外星生物巢穴 | `2-7` | 巢穴入口、孵化室 |

地图对象通过 `candidateActions` 暴露通话行动按钮。

### 7.4 个人背包限制与 content 规避

由于主线关键物品进入个人背包，MVP 需要避免以下硬锁：

- 携带 `thermal_mining_gear` 的队员失效导致火山路线锁死。
- 携带 `warp_coordinates` 的队员失效导致终局锁死。
- 携带 `decoy` 的队员失效导致巢穴锁死。

最小化策略：

- 事件条件优先检查当前行动 / 通话队员背包。
- 关键知识通过可重复学习避免硬锁。
- 关键物品来源尽量允许重复获得或存在替代来源：
- 稀有矿石样本可继续在丘陵采集获得。
- 高温开采设备可通过重新交易获得，前提是稀有矿石样本可再获取。
- 药品 / 野外急救可在医疗舱补给或学习。
- 诱饵必须提供至少 2 个稳定来源：营地救援 + 浅滩湿地；若任一携带者失效，可通过浅滩湿地或重复营地逻辑补救。
- 折跃坐标、外星粘液燃料、修复套件若携带者失效，MVP 暂不实现转移；content 应避免在这些物品取得后再让携带者进入不可恢复失效分支。

## 8. 主线事件设计

### 8.1 坠毁点三次调查

触发：

- `trigger.type = action_complete`
- `payload.action_type = survey`
- tile 或 object 具备 `crash_site` tag

状态：

- `world_flags.crash_site_survey_count`

第一次调查：

- 给当前队员添加基础物资：可包含 `ration`、`basic_tool`、`folding_rifle` 等现有物品。
- 记录折跃仓损坏。
- 创建或更新主目标“回家”。

第二次调查：

- 给出稳定雷达线索：北边生命迹象、东边旧金属反应、南边高温反应、医疗应答信标。
- 揭示或标记外星村落、旧飞船遗迹方向、火山方向、医疗舱方向。

第三次调查：

- 给当前队员添加 `knows_repair_tech`。
- 记录日志与技术文档已保存，可重复学习。
- 设置 `world_flags.repair_docs_available = true`。

### 8.2 可重复学习维修技术

触发：

- 坠毁点日志技术文档对象 `survey` 或 `scan`。

条件：

- `world_flags.repair_docs_available = true`。
- 当前队员缺少 `knows_repair_tech`。

效果：

- `add_crew_condition knows_repair_tech`。
- 写 event log。

### 8.3 丘陵采集与稀有矿石样本

触发：

- 铁矿床对象 `gather`。

普通行动：

- 继续给当前队员添加 `iron_ore`。

事件效果：

- 递增 `world_flags.rare_ore_gather_count`。
- 第 1、2 次写“矿脉出现异常杂质”类提示。
- 第 3 次保底给当前队员 `rare_ore_sample`。
- 第 3 次后可继续采集并按需要再次产出样本，用于个人背包失效后的补救。

### 8.4 外星村落与罗塞塔

村落初访：

- 地点对象：外星村落、商人、村民。
- 无 `knows_alien_language` 时，触发初访通话。
- 高社交捷径可直接添加 `knows_alien_language`。
- 保底选项揭示罗塞塔装置方向，不惩罚失败。

罗塞塔装置：

- 调查后给当前队员添加 `knows_alien_language`。
- 设置 `world_flags.rosetta_language_available = true`，允许后续队员重复学习。

可重复学习外星语言：

- 在罗塞塔装置处，缺少 `knows_alien_language` 的队员可再次学习。

### 8.5 村落交易与营地线索

商人交易高温开采设备：

- 条件：当前队员有 `knows_alien_language`。
- 条件：当前队员背包有 `rare_ore_sample`。
- 效果：移除 `rare_ore_sample`，添加 `thermal_mining_gear`。

村民交流：

- 条件：当前队员有 `knows_alien_language`。
- 效果：揭示受伤村民营地。
- 写日志说明营地中有人受伤，救援可能获得可引开兵蚁的诱饵。

### 8.6 医疗舱与野外急救

医疗舱调查：

- 给当前队员添加 `medicine`。
- 给当前队员添加 `knows_field_first_aid`。
- 设置 `world_flags.medical_docs_available = true`。

可重复学习野外急救：

- 在医疗舱处，缺少 `knows_field_first_aid` 的队员可再次学习。

受伤恢复：

- 药品恢复：当前队员有 `medicine` 时，移除 `medicine` 与 `wounded`。
- 野外急救恢复：当前队员有 `knows_field_first_aid` 时，移除 `wounded`。

### 8.7 火山与黑曜石

火山调查：

- 提示高温环境，需要 `thermal_mining_gear` 才能安全采集。
- 揭示旧飞船遗迹方向或强化旧金属反应线索。

黑曜石采集：

- 条件：当前队员背包有 `thermal_mining_gear`。
- 条件：当前队员没有 `wounded`。
- 效果：给当前队员添加 `obsidian`。

### 8.8 损坏熔炉与修复套件

修复熔炉：

- 条件：当前队员有 `knows_repair_tech`。
- 条件：当前队员背包有 `iron_ore`。
- 效果：移除所需 `iron_ore`，设置 `world_flags.forge_repaired = true`。

制造折跃仓修复套件：

- 条件：`world_flags.forge_repaired = true`。
- 条件：当前队员背包有 `obsidian`。
- 条件：当前队员背包有 `iron_ore`。
- 效果：移除 `obsidian` 和所需 `iron_ore`，添加 `warp_pod_repair_kit`。

### 8.9 旧飞船遗迹与折跃坐标

触发：

- 旧飞船遗迹对象 `survey` 或 `scan`。

效果：

- 给当前队员添加 `warp_coordinates`。
- 写一段返航未遂的叙事回响。
- 设置 `world_flags.warp_coordinates_found = true`。

### 8.10 受伤村民营地与第一诱饵

救援选项 A：使用药品。

- 条件：当前队员背包有 `medicine`。
- 效果：移除 `medicine`，添加 `decoy`。

救援选项 B：使用野外急救。

- 条件：当前队员有 `knows_field_first_aid`。
- 效果：添加 `decoy`。

完成后：

- 设置 `world_flags.injured_villager_rescued = true`。
- 写日志说明诱饵可引开兵蚁守卫。

### 8.11 浅滩湿地与第二诱饵

由于巢穴已确认需要 2 个诱饵，浅滩湿地或等价额外来源必须进入 MVP。

触发：

- 浅滩湿地对象 `survey` 或 `gather`。

效果：

- 给当前队员添加 `decoy`。
- 设置 `world_flags.marsh_decoy_obtained = true`。

保底要求：

- 玩家必须能在进入巢穴前稳定获得两个 `decoy`。
- 若营地诱饵或湿地诱饵被失效携带者带走，MVP 不做转移；content 应避免在诱饵取得后强制触发不可恢复失效。

### 8.12 外星生物巢穴

入口阶段：

- 条件：当前队员背包有 `decoy`。
- 条件：当前队员没有 `wounded`。
- 效果：移除 1 个 `decoy`，设置 `world_flags.hive_entrance_guard_lured = true`。

无诱饵时：

- 只能观察并撤回。
- 明确提示需要诱饵，且诱饵可来自营地救援与浅滩湿地。

孵化室阶段：

- 条件：`world_flags.hive_entrance_guard_lured = true`。
- 条件：当前队员背包有 `decoy`。
- 条件：当前队员没有 `wounded`。
- 效果：移除 1 个 `decoy`，添加 `alien_slime_fuel`。
- 采集成功后直接撤离，不做额外巢穴尾段。

### 8.13 折跃仓终局三步

终局地点：`4-4` 坠毁区域。

Step 1：修复仓体结构。

- 条件：当前队员有 `knows_repair_tech`。
- 条件：当前队员背包有 `warp_pod_repair_kit`。
- 效果：移除 `warp_pod_repair_kit`，设置 `world_flags.warp_pod_hull_repaired = true`。

Step 2：注入燃料。

- 条件：`world_flags.warp_pod_hull_repaired = true`。
- 条件：当前队员背包有 `alien_slime_fuel`。
- 效果：移除 `alien_slime_fuel`，设置 `world_flags.warp_pod_fueled = true`。

Step 3：输入坐标并启动。

- 条件：`world_flags.warp_pod_fueled = true`。
- 条件：当前队员背包有 `warp_coordinates`。
- 条件：所有非失联 / 死亡 / 不可用且可通讯队员都在 `4-4`。
- 效果：设置 `world_flags.return_home_completed = true`，记录完成时间，进入 `EndingPage`。

## 9. 测试与验收策略

### 9.1 自动验证

必须运行：

```bash
npm run validate:content
npm run lint
npm run test
```

### 9.2 建议新增测试

- `contentData.test.ts`：验证 `import.meta.glob` 聚合 definitions、call_templates、presets。
- `App.test.tsx`：事件 `add_item/remove_item` 后，当前队员背包 UI 状态与 runtime inventory 一致。
- `crewSystem.test.ts`：`wounded` 队员移动耗时为普通耗时 1.5 倍。
- `eventEngine` 或 content sample 测试：关键主线事件 sample contexts 可启动并产生预期 flags/items。
- 终局测试：所有可通讯可行动队员在 `4-4` 且当前队员持有所需物品时，设置 `return_home_completed` 并进入 ending。

### 9.3 手动通关验收

重置存档后，按以下保底路线验收：

1. 在坠毁点完成三次调查，获得主目标、雷达线索与 `knows_repair_tech`。
2. 丘陵采集 3 次，稳定获得 `rare_ore_sample`。
3. 前往村落，无语言时得到罗塞塔线索。
4. 前往罗塞塔，学习 `knows_alien_language`。
5. 回村落，用 `rare_ore_sample` 交易 `thermal_mining_gear`。
6. 与村民交流，获得受伤村民营地线索。
7. 前往医疗舱，获得 `medicine` 与 `knows_field_first_aid`。
8. 前往火山，用 `thermal_mining_gear` 采集 `obsidian`。
9. 前往损坏熔炉，修复熔炉并制造 `warp_pod_repair_kit`。
10. 前往旧飞船遗迹，获得 `warp_coordinates`。
11. 前往受伤村民营地，救援后获得第 1 个 `decoy`。
12. 前往浅滩湿地，获得第 2 个 `decoy`。
13. 前往巢穴，入口消耗 1 个 `decoy`。
14. 孵化室消耗 1 个 `decoy`，获得 `alien_slime_fuel` 并撤离。
15. 所有非失联 / 死亡 / 不可用且可通讯队员回到 `4-4`。
16. 在坠毁点完成折跃仓三步，进入 `EndingPage`。

### 9.4 受伤验收

- 给队员添加 `wounded` 后，移动预览与实际耗时变为 1.5 倍。
- `wounded` 队员看不到或不能提交高风险事件选项。
- 使用 `medicine` 能移除 `wounded` 并消耗药品。
- 具备 `knows_field_first_aid` 时可不消耗药品移除 `wounded`。

## 10. 风险与缓解

### 10.1 个人背包导致关键物品携带者失效

风险：MVP 不做队员间物品转移，关键物品如果在失效队员身上可能卡主线。

缓解：

- 关键知识必须可重复学习。
- 稀有矿石样本、高温开采设备、诱饵等前中期物品提供重复或替代来源。
- 折跃坐标、修复套件、外星粘液燃料等后期物品取得后，MVP content 避免再强制触发不可恢复失效分支。
- 后续版本再设计队员间转移 / 找回背包机制。

### 10.2 事件图数量增加导致维护成本上升

风险：主线拆成多个域后，event ids、call template ids、world flags 容易命名混乱。

缓解：

- 使用 `mainline_<domain>` 文件前缀。
- world flags 统一以语义命名，如 `warp_pod_hull_repaired`、`hive_entrance_guard_lured`。
- 每个事件文件保留 sample contexts。
- 依赖 `validate-content` 与 event cross-reference validation。

### 10.3 import.meta.glob 与测试环境

风险：测试环境可能需要适配 Vite glob 类型或 mock。

缓解：

- 保持聚合逻辑简单，集中在 `contentData.ts`。
- 若 Vitest 已支持 Vite transform，则直接测试。
- 若单测环境不支持，抽出纯函数处理 glob module map，并测试纯函数。

### 10.4 终局集合条件的状态判定

风险：UI `CrewMember.status` 是中文文本，runtime `CrewState.status` 是枚举，直接基于 status 文本判断不稳。

缓解：

- 优先使用 `unavailable`、`canCommunicate`、死亡 / 失联 condition 或明确字段判断。
- 如需 handler，测试覆盖 unavailable、lost_contact、dead、正常队员在 / 不在 `4-4` 的组合。

### 10.5 巢穴 2 个诱饵增加流程长度

风险：入口与孵化室各消耗 1 个诱饵，会让浅滩湿地从可选变成保底前置。

缓解：

- 在村民救援奖励文案中明确“可能还需要额外诱饵”。
- 在巢穴入口无足够诱饵时明确提示浅滩湿地线索。
- 浅滩湿地诱饵应稳定获取，不依赖随机。

## 11. 后续任务建议

1. 代码前置：content glob 聚合、inventory 同步、受伤移动倍率、终局集合 condition、EndingPage。
2. Content 基础：新增主线 items，更新 map 对象与地点标签。
3. 主线第一段：坠毁点三次调查、维修技术、雷达线索、丘陵 3 次保底样本。
4. 主线第二段：村落、罗塞塔、交易、医疗舱、营地救援、浅滩湿地第二诱饵。
5. 主线第三段：火山、熔炉、旧飞船遗迹、巢穴、折跃仓终局。
6. 验证：content validation、lint、test、手动保底路线通关。
