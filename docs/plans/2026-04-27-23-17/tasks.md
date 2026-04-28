# Minimal Use Case 开发任务拆分

本文基于已确认的 `docs/plans/2026-04-27-23-17/technical-design.md` 拆分后续顺序开发任务。任务按依赖顺序执行：先记录技术设计与代码前置能力，再写 content，最后实现终局与完整验证。

## T0：记录已确认技术设计

- 任务编号：T0
- 依赖：无
- 任务描述：确认本轮 Minimal Use Case 已产出并采用 `technical-design.md` 作为后续开发固定输入，后续任务不得绕过其中的已确认决策重新设计。
- 实施范围：
  - `docs/plans/2026-04-27-23-17/technical-design.md`
  - `docs/plans/2026-04-27-23-17/tasks.md`
- 验收标准 AC：
  - AC1：`technical-design.md` 存在，且包含事件 content 自动聚合、个人背包同步、受伤、终局集合、EndingPage、主线 content 组织等已确认决策。
  - AC2：`tasks.md` 明确后续开发任务均依赖 T0。
  - AC3：本任务只记录已确认设计，不改写核心设计原则或其他 wiki。
- 建议验证命令：
  - `git diff -- docs/plans/2026-04-27-23-17/tasks.md`

## T1：代码前置一：事件 content 自动聚合与个人背包同步

- 任务编号：T1
- 依赖：T0
- 任务描述：修复新增事件 content 可能通过校验但未被 app runtime 加载的问题，并确保事件 runtime 对当前队员个人背包的 `add_item/remove_item` 能稳定回写到 UI `CrewMember.inventory`。
- 实施范围：
  - `apps/pc-client/src/content/contentData.ts`
  - `apps/pc-client/src/App.tsx`
  - 相关单元测试文件，优先覆盖 content 聚合与 inventory merge 行为
- 验收标准 AC：
  - AC1：`contentData.ts` 使用 Vite `import.meta.glob(..., { eager: true })` 自动聚合 `content/events/definitions/*.json`、`content/events/call_templates/*.json`、`content/events/presets/*.json`。
  - AC2：`handler_registry.json` 保持单文件 import，现有导出名 `eventProgramDefinitions`、`callTemplates`、`presetDefinitions`、`eventContentLibrary` 保持可用。
  - AC3：`toEventEngineState` 从当前 `crew.inventory` 派生 `crew:<crewId>` inventory，且不会被旧 runtime inventory 覆盖当前 UI 背包。
  - AC4：`mergeEventRuntimeState` 将 `eventState.inventories["crew:<crewId>"].items` 回写到对应 `CrewMember.inventory`，并保留队员其他字段与本次 runtime 更新的 conditions/personalityTags。
  - AC5：`base` inventory 与 `baseInventory/resources` 的现有同步行为不回归。
  - AC6：测试覆盖至少一个事件给当前队员添加/移除物品后，UI 状态与后续事件条件读取一致。
- 建议验证命令：
  - `npm run test`
  - `npm run lint`

## T2：代码前置二：受伤、终局条件与 EndingPage

- 任务编号：T2
- 依赖：T1
- 任务描述：补齐主线需要的最小状态规则：`wounded` 移动变慢、终局集合条件可被事件图判断、返航完成后进入薄结局页。
- 实施范围：
  - `apps/pc-client/src/crewSystem.ts`
  - `apps/pc-client/src/events/conditions.ts` 或现有 handler 注册相关文件
  - `apps/pc-client/src/App.tsx`
  - `apps/pc-client/src/data/gameData.ts`
  - `apps/pc-client/src/pages/EndingPage.tsx`
  - 相关单元测试或 e2e 测试
- 验收标准 AC：
  - AC1：队员 `conditions` 包含 `wounded` 时，移动预览与实际移动每步耗时均为正常耗时的 `1.5x`。
  - AC2：受伤倍率不影响 survey/gather/build 等非移动普通行动耗时。
  - AC3：新增或等价实现 `all_available_crew_at_tile` 终局条件，参数支持 `tile_id: "4-4"`，判定所有非失联/死亡/不可用且可通讯队员均在目标地块。
  - AC4：`PageId` 支持 `ending`，新增 `EndingPage` 展示“返航完成”、简要总结、完成时间，并提供重置游戏或回控制中心查看记录的最小入口。
  - AC5：当 `world_flags.return_home_completed === true` 时，App 能进入 `EndingPage`。
  - AC6：测试覆盖 wounded 移动倍率、终局集合条件的正反例、完成 flag 进入 ending 页面。
- 建议验证命令：
  - `npm run test`
  - `npm run lint`

## T3：Content 基础：主线物品与地图对象

- 任务编号：T3
- 依赖：T2
- 任务描述：建立主线 content 的基础数据层，先新增物品、地图地点、对象与候选行动按钮，为后续事件图提供稳定锚点。
- 实施范围：
  - `content/items/items.json`
  - `content/maps/default-map.json`
  - 必要时新增 `content/events/presets/mainline.json`
- 验收标准 AC：
  - AC1：新增主线物品 `medicine`、`rare_ore_sample`、`thermal_mining_gear`、`obsidian`、`warp_pod_repair_kit`、`warp_coordinates`、`decoy`、`alien_slime_fuel`，字段符合 items schema。
  - AC2：默认 `8 x 8` 地图不扩尺寸，补齐坠毁区域、丘陵矿带、外星村落、罗塞塔装置、医疗舱、损坏熔炉、火山、旧飞船遗迹、受伤村民营地、浅滩湿地、外星生物巢穴等主线地点或对象。
  - AC3：主线对象通过 `candidateActions` 暴露通话行动按钮，且 action type 与后续事件触发保持一致。
  - AC4：地图对象 id/tag 命名稳定，可被后续 `mainline_*` 事件文件引用。
  - AC5：content schema 与跨文件引用校验通过。
- 建议验证命令：
  - `npm run validate:content`
  - `npm run lint`

## T4：主线第一段：坠毁点、维修技术与稀有矿石

- 任务编号：T4
- 依赖：T3
- 任务描述：实现前半段保底探索链路，让玩家能从坠毁点获得主目标、雷达线索、维修技术，并在丘陵采集 3 次后稳定获得稀有矿石样本。
- 实施范围：
  - `content/events/definitions/mainline_crash_site.json`
  - `content/events/definitions/mainline_resources.json`
  - `content/events/call_templates/mainline_crash_site.json`
  - `content/events/call_templates/mainline_resources.json`
  - 必要时更新 `content/events/presets/mainline.json`
- 验收标准 AC：
  - AC1：坠毁点三次调查分别提供基础物资/主目标、雷达线索、`knows_repair_tech` 与 `world_flags.repair_docs_available = true`。
  - AC2：维修技术可在坠毁点日志技术文档处重复学习，缺少 `knows_repair_tech` 的队员可再次获得该 condition。
  - AC3：丘陵铁矿床 gather 继续保留基础资源获得，并递增 `rare_ore_gather_count`。
  - AC4：丘陵采集第 3 次保底给当前队员 `rare_ore_sample`，第 3 次后仍允许再次获得样本以缓解个人背包失效风险。
  - AC5：事件文本明确提供村落、旧飞船遗迹、火山、医疗舱等方向线索，不依赖随机或高属性成功。
  - AC6：新增事件文件 sample contexts 或等价测试能覆盖关键 flags/items/conditions。
- 建议验证命令：
  - `npm run validate:content`
  - `npm run test`
  - `npm run lint`

## T5：主线第二段：村落、语言、医疗与双诱饵来源

- 任务编号：T5
- 依赖：T4
- 任务描述：实现中段信息与资源串联：外星语言、村落交易、医疗/急救恢复、营地救援诱饵与浅滩湿地第二诱饵。
- 实施范围：
  - `content/events/definitions/mainline_village.json`
  - `content/events/definitions/mainline_medical.json`
  - `content/events/call_templates/mainline_village.json`
  - `content/events/call_templates/mainline_medical.json`
  - 必要时更新 `content/events/presets/mainline.json`
- 验收标准 AC：
  - AC1：无 `knows_alien_language` 初访村落时可获得罗塞塔装置线索，且失败不惩罚、不硬锁。
  - AC2：罗塞塔装置调查后给当前队员 `knows_alien_language`，并设置可重复学习所需 flag。
  - AC3：具备语言且当前队员背包有 `rare_ore_sample` 时，可交易获得 `thermal_mining_gear` 并消耗样本。
  - AC4：村民交流揭示受伤村民营地，并明确救援可能获得诱饵。
  - AC5：医疗舱调查给当前队员 `medicine` 与 `knows_field_first_aid`，且野外急救可重复学习。
  - AC6：受伤恢复选项通过事件实现：药品恢复消耗 `medicine` 并移除 `wounded`，野外急救恢复要求 `knows_field_first_aid` 并移除 `wounded`。
  - AC7：营地救援可通过药品或野外急救获得第 1 个 `decoy`；浅滩湿地 survey/gather 稳定获得第 2 个 `decoy`。
  - AC8：高风险选项 requirements 禁止 `wounded` 队员提交，通话 UI 不应允许不可用选项被提交。
- 建议验证命令：
  - `npm run validate:content`
  - `npm run test`
  - `npm run lint`

## T6：主线第三段、终局与完整验收

- 任务编号：T6
- 依赖：T5
- 任务描述：实现后段关键物品链、巢穴两次诱饵消耗、折跃仓三步终局，并完成自动验证与手动保底路线通关验收。
- 实施范围：
  - `content/events/definitions/mainline_hive.json`
  - `content/events/definitions/mainline_ending.json`
  - `content/events/definitions/mainline_resources.json`
  - `content/events/call_templates/mainline_hive.json`
  - `content/events/call_templates/mainline_ending.json`
  - 必要时更新已建主线 content 文件与 e2e/单元测试
- 验收标准 AC：
  - AC1：火山调查提示需要 `thermal_mining_gear`，黑曜石采集要求当前队员背包有 `thermal_mining_gear` 且没有 `wounded`，成功后获得 `obsidian`。
  - AC2：损坏熔炉修复要求 `knows_repair_tech` 与 `iron_ore`，成功后设置 `world_flags.forge_repaired = true`。
  - AC3：制造 `warp_pod_repair_kit` 要求熔炉已修复、当前队员背包有 `obsidian` 与 `iron_ore`，成功后消耗材料并给当前队员修复套件。
  - AC4：旧飞船遗迹 survey/scan 给当前队员 `warp_coordinates`，并设置 `world_flags.warp_coordinates_found = true`。
  - AC5：巢穴入口消耗 1 个 `decoy` 并设置 `hive_entrance_guard_lured`；孵化室在入口完成后再消耗 1 个 `decoy` 并给当前队员 `alien_slime_fuel`；两段均禁止 `wounded` 队员执行高风险推进。
  - AC6：折跃仓终局三步依次完成仓体修复、注入燃料、输入坐标并启动；最后一步要求 `all_available_crew_at_tile` 判定所有可通讯可行动队员在 `4-4`。
  - AC7：完成终局后设置 `world_flags.return_home_completed = true` 与完成时间，并进入 `EndingPage`。
  - AC8：重置存档后能按 `technical-design.md` 第 9.3 节的 16 步保底路线完整通关。
  - AC9：`validate:content`、`lint`、`test` 全部通过，无未加载的新增 mainline event content。
- 建议验证命令：
  - `npm run validate:content`
  - `npm run lint`
  - `npm run test`
