---
topic: region-based-map-system
date: 2026-05-11
status: approved
source:
  initial: docs/plans/2026-05-11-21-14/initial.md
  research: docs/plans/2026-05-11-21-14/research.md
  interview: docs/plans/2026-05-11-21-14/region-based-map-system-interview.md
---

## 1. 一句话总结

为 256 x 256 地图引入统一的 Map Feature 模型，让 tile 只负责精确坐标、路径和移动结算，让雪原、村庄、遗骸、设备等连续 footprint 承担玩家可见语义、交互命中、调查目标、状态和区域级去重。

## 2. 背景与问题（As-is）

- **当前做法**：地图已经扩展到 `256 x 256`，但玩法语义仍主要写在 tile 上：`tile.areaName` 提供地点文案，`tile.objectIds` 决定当前 tile 有哪些地图对象，调查和揭示状态也围绕单个 `tileId` 运转。
- **痛点/成本**：在 `256 x 256` 地图上，要求玩家精确点击某一个 tile 在操作和体验上几乎不可行；玩家真实意图通常是“去森林边缘”“调查村庄”“查看飞船遗骸”，而不是选中某个 1/65,536 的格子。继续把语义压在 tile 上，还会造成大量重复配置，并让跨多 tile 的遗骸、设备或异常信号难以自然表达。
- **为什么现在做**：当前内容正在围绕 IAFS 遗骸、设备状态和调查事件链扩展。此时需要先把 tile 的内部坐标/移动职责和玩家可见的上层地图语义拆开，让 Feature footprint 成为玩家点击、识别、调查和去重的主要对象。`radar.regions` 属于渲染层，本轮不处理。

## 3. 目标（Goals）

- 让玩家主要通过可感知的 Feature footprint 理解和点击地图，而不是被迫精确点中单个 tile。
- 将“雪原 / 村庄 / 飞船遗骸 / 设备 / 异常信号”等地图语义统一为 `MapFeature`，支持多个 Feature 在同一 tile 重叠并全部展示。
- 将可调查内容建模为特殊 Feature，承载字符串状态、可见性、行动和事件去重，替代旧 `tile.objectIds`。
- 保留 tile 作为移动路径、坐标、队员当前位置和事件锚点的底层单位。
- 在 Map Editor 中支持创建 Feature、设置 priority 和 investigatable 属性，并用画刷/擦除编辑连续 footprint。
- 从新版玩法模型中移除 `tile.areaName` 和 `tile.objectIds` 的正式地位；`radar.regions` 暂不处理。

## 4. 非目标（Non-goals）

- 本轮不把 Feature 接入移动耗时、通行限制、天气模拟、危险概率或调查难度等规则计算。
- 本轮不重做 `radar.regions`、glyph/tone 渲染层，也不要求渲染区域和玩法 Feature 立刻同步。
- 本轮不恢复战争迷雾、探索可见性限制或未知区域阻挡移动。
- 本轮不让地图直接下达正式指令；移动、调查和剧情动作仍通过“通讯台 → 通话”确认。
- 本轮不做程序生成地图、跨地图移动、载具、飞行或多队员编队。
- 本轮不要求一次调查填满整个 Feature footprint 内所有 tile 的环境读数。

## 5. 目标用户与使用场景

### 5.1 用户画像

- **玩家**：通过 PC 地图和通讯台远程指挥队员，需要快速理解“这里是什么地方、有什么可调查目标、队员能去哪里”。
- **内容作者 / 策划**：用 Map Editor 为 `256 x 256` 地图绘制森林、聚落、遗骸、设备、异常信号等 Feature footprint，并配置调查状态和事件入口。

### 5.2 典型场景（Top 3）

- **S1：地图点击**：玩家在大地图上点击一片可见 footprint → 系统命中 Feature，而不是要求玩家精确点击单个 tile → 玩家看到“雪原 / 村庄 / 异常信号”等并列语义。
- **S2：通话调查**：队员站在多个 Feature 重叠的位置 → 系统按 `priority: 1-100` 选择最高优先级可调查 Feature；若并列，则在通话中让玩家选择目标。
- **S3：内容编辑**：策划新建“飞船遗骸” Feature → 用画刷/擦除绘制连续 footprint → 设置 priority、investigatable、初始状态和可触发事件。

## 6. 用户旅程（To-be）

1. 玩家打开地图，看到 `256 x 256` 雷达地图和若干可感知的 Feature footprint，如“雪原”“村庄”“飞船遗骸”。
2. 玩家点击一个 Feature footprint 上的大致位置；系统用点击坐标映射到底层 `tileId`，并展示该 tile 命中的全部 Feature。
3. 地图详情并列展示重叠 Feature，例如“雪原 / 村庄 / 异常信号”，并标出哪些只是背景语义、哪些可调查。
4. 从通话进入地图时，玩家点击目标位置后返回通话；通话仍负责确认是否让队员移动到该 `tileId`。
5. 队员抵达后，玩家在通话中选择调查。系统查找当前 tile 覆盖的可调查 Feature。
6. 若只有一个最高优先级 Feature，系统默认调查它；若最高优先级并列，通话中列出候选目标让玩家选择。
7. 调查完成后，系统更新该可调查 Feature 的字符串状态，并用 Feature 级历史避免同一 footprint 内重复触发同一内容。
8. 地图和通话后续读取 Feature 状态，显示已发现、已修复、已搜索或其他内容定义的状态。

### 6.1 失败路径与边界

- **F1：点击空白处**：如果点击位置没有命中任何 Feature，地图仍显示底层 tile 坐标和基础移动目标，但不显示可调查 Feature。
- **F2：命中多个背景 Feature**：地图详情全部并列展示；背景 Feature 不产生调查按钮。
- **F3：多个可调查 Feature 同优先级**：通话中让玩家明确选择目标，避免一次调查错误揭示全部内容。
- **F4：低优先级 Feature 重叠**：低优先级 Feature 可作为背景显示，但不会抢占默认调查目标。
- **F5：点击坐标不可移动**：如果点击映射出的 tile 不合法或未来被规则标记为不可达，通话确认时必须提示原因并要求重新选点。

## 7. 约束与假设

### 7.1 约束（Constraints）

- **C1**：tile 仍是队员当前位置、移动路径、点击坐标映射和事件锚点的底层单位。
- **C2**：新版玩法语义的 source of truth 是 `content/maps/*.json` 内的 `features`，不是 `tile.areaName` 或 `tile.objectIds`。
- **C3**：`radar.regions`、glyphRows、toneRows 属于渲染层，本轮不要求和玩法 Feature 同步。
- **C4**：正式指令仍必须通过“通讯台 → 通话”确认，地图只负责查看和选点。
- **C5**：Map Editor 必须支持 Feature 创建、属性编辑、画刷和擦除 footprint。

### 7.2 假设（Assumptions）

- **A1**：玩家可以接受在 Feature footprint 上点击大致位置，再由系统映射为底层 `tileId`。（如何验证：用 256 x 256 地图手动验证点击误差和目标反馈。）
- **A2**：`priority: 1-100` 足以表达调查目标默认选择；同优先级时让玩家在通话中选择。（如何验证：用雪原 / 村庄 / 遗骸重叠案例测试通话按钮。）
- **A3**：可调查 Feature 使用字符串状态可以覆盖现有地图对象能力。（如何验证：迁移 IAFS 设备对象，确认 damaged / repaired 等状态可正常显示和触发事件。）

## 8. 方案选择

### 选择的方案：统一 Map Feature + 可调查 Feature 子类

- **做法**：在 map JSON 中新增 `features`。所有区域、地点和地图对象都以连续 footprint 表达；可调查内容是特殊 Feature，额外拥有 `investigatable`、`status_options`、`initial_status`、actions / event hooks 和运行时字符串状态。
- **优点**：玩家点击和理解都以大 footprint 为对象；对象天然可以跨多个 tile；重叠语义可以并列显示；调查去重可以落在 Feature 级，而不是 tile 级。
- **缺点/风险**：需要改 map schema、runtime map state、调查命中、通话按钮、Map Editor 和内容校验；旧 `tile.areaName` / `tile.objectIds` 需要移除或迁移。
- **选择理由**：它最直接解决 `256 x 256` 地图下“单 tile 太小、跨 tile 对象难表达、重叠区域错误揭示”的核心问题。

### 选择与理由（Decision）

- **理由**：本轮目标不是给 tile 增加更多字段，而是改变玩家和内容作者理解地图的基本单位。统一 Feature 能让地图点击、可见语义、调查目标和运行时状态共用同一个 footprint 查询。
- **放弃其它方案的代价**：继续扩展 tile 字段实现快但会扩大内容债；区域拥有对象概念直观但会在重叠区域下错误揭示；区域和对象两套平级模型更严谨但会增加 MVP 查询和编辑复杂度。

### 方案的比较

| 方案 | 优点 | 问题 |
| --- | --- | --- |
| 统一 Map Feature + 可调查 Feature 子类 | 解决点击、跨 tile、重叠和去重问题 | 需要迁移 schema、runtime、Editor 和内容 |
| 继续扩展 tile 字段 | 改动小 | 无法解决重复配置和单 tile 点击体验 |
| 区域拥有对象 | 概念直观 | 重叠区域调查时容易批量揭示错误内容 |
| 区域和对象两套平级模型 | 比父子模型安全 | 多一套几何、优先级和查询规则，MVP 成本更高 |

## 9. 核心对象/数据（如涉及）

- **MapFeature**
  - **来源/归属（source of truth）**：`content/maps/*.json` 内的 `features`。
  - **关键字段**：`id`、`name`、`kind`、`priority: 1-100`、`tags`、`footprint`、`visible` / `visibility`、`investigatable`。
  - **生命周期**：由 Map Editor 创建、编辑、删除；运行时不复制静态定义。

- **InvestigatableFeature**
  - **来源/归属（source of truth）**：`MapFeature` 的特殊形态。
  - **关键字段**：继承 Feature 字段，并增加 `status_options`、`initial_status`、`actions` / `event_hooks`。
  - **生命周期**：静态内容定义初始状态；运行时按 `featureId` 保存当前字符串状态。

- **FeatureFootprint**
  - **来源/归属（source of truth）**：Feature 的覆盖范围。
  - **关键字段**：连续 tile mask；MVP 需要支持画刷/擦除编辑，保存格式可以是压缩后的 tile 列表或 shape，但对运行时暴露统一“包含哪些 tile”的查询。
  - **生命周期**：内容作者编辑；validation 校验 footprint 连续、在地图边界内、非空。

- **FeatureRuntimeState**
  - **来源/归属（source of truth）**：`GameState.map.featuresById`。
  - **关键字段**：`id`、`status` 字符串、`investigatedAt` / `lastTriggeredAt`、必要的历史 key。
  - **生命周期**：新游戏初始化自 `initial_status`；调查、事件或行动结算时更新。

- **Tile**
  - **来源/归属（source of truth）**：仍来自 map JSON 的 tile grid。
  - **关键字段**：`id`、`row`、`col`、移动/坐标必要字段。
  - **生命周期**：作为底层坐标和移动事实源；不再承载 `areaName` 和 `objectIds` 的正式玩法语义。

## 10. 范围与阶段拆分

### 10.1 MVP（本次必须做）

- 在 map JSON 中新增 `features`，支持连续 footprint、priority、kind、tags 和可调查配置。
- 将 `tile.areaName` 和 `tile.objectIds` 从新版玩法模型移除，现有地点名和地图对象迁移到 Feature。
- 运行时新增 `featuresById` 状态，用字符串保存可调查 Feature 当前状态。
- 地图点击先命中 Feature footprint，同时保留点击坐标映射出的底层 `tileId`。
- 通话调查按 Feature priority 选择目标；同优先级并列时让玩家选择。
- Map Editor 支持 Feature 创建、属性编辑、画刷/擦除 footprint 和重叠预览。
- validation 校验 Feature id、footprint 连续性、边界、priority 范围和状态字段。

### 10.2 Later（未来可能做，但明确本轮不做）

- Feature 影响移动耗时、危险、天气、调查难度或资源产出。
- `radar.regions` 与玩法 Feature 的同步、合并或渲染重构。
- polygon / 图像 mask 导入 / 自动区域生成等高级 authoring。
- 战争迷雾、未知区域和探索边界重设计。
- 跨地图、载具、多队员编队和区域级复杂 AI。

## 11. User Stories（MVP）

### US-001: 玩家点击 Feature 而不是精确 tile

- **作为**：玩家
- **我想要**：在 `256 x 256` 地图上点击森林、村庄、遗骸等可见 footprint
- **以便**：我不需要精确点中一个很小的 tile，也能表达探索或移动意图
- **验收标准**（可观察/可验证）：
  - [ ] 点击后显示命中的 Feature 列表。
  - [ ] 点击后生成底层目标 `tileId`，供通话确认移动使用。
- **不包含**：地图直接下达移动指令。
- **优先级**：P0
- **依赖**：`MapFeature` footprint 查询。

### US-002: 重叠 Feature 并列显示

- **作为**：玩家
- **我想要**：看到当前位置同时属于哪些 Feature
- **以便**：理解“雪原上的村庄”“遗骸中的异常信号”等叠加语义
- **验收标准**（可观察/可验证）：
  - [ ] 地图详情显示全部命中 Feature。
  - [ ] UI 区分背景 Feature 与可调查 Feature。
- **不包含**：按优先级隐藏低优先级背景语义。
- **优先级**：P0
- **依赖**：Feature 重叠查询。

### US-003: 调查最高优先级 Feature

- **作为**：玩家
- **我想要**：队员调查当前位置最重要的可调查 Feature
- **以便**：避免一次调查错误揭示所有重叠内容
- **验收标准**（可观察/可验证）：
  - [ ] 系统按 `priority: 1-100` 选择默认调查目标。
  - [ ] 最高优先级并列时，在通话中列出候选目标供玩家选择。
  - [ ] 低优先级 Feature 可作为背景显示，但不抢占默认调查目标。
- **不包含**：一次调查结算所有重叠 Feature。
- **优先级**：P0
- **依赖**：通话行动生成与 Feature runtime state。

### US-004: Feature 承载地图对象状态

- **作为**：内容作者
- **我想要**：把设备、遗骸、补给、异常信号建成可调查 Feature，并保存字符串状态
- **以便**：跨多个 tile 的对象也能正常显示 damaged/repaired/searched 等状态
- **验收标准**（可观察/可验证）：
  - [ ] 运行时按 `featureId` 读写状态。
  - [ ] 事件和通话行动可引用 Feature 状态。
  - [ ] 同一 Feature footprint 内不会因换一个 tile 调查而重复触发同一一次性内容。
- **不包含**：Feature 状态自动影响移动或危险概率。
- **优先级**：P0
- **依赖**：map schema、runtime map state、事件投影更新。

### US-005: 用 Map Editor 绘制 Feature footprint

- **作为**：内容作者
- **我想要**：用画刷和擦除工具编辑连续 footprint
- **以便**：能高效制作 `256 x 256` 地图上的森林、村庄和遗骸范围
- **验收标准**（可观察/可验证）：
  - [ ] Editor 可创建 Feature 并编辑 name、kind、priority、investigatable 和状态字段。
  - [ ] Editor 可绘制和擦除 footprint。
  - [ ] Editor 可显示一个 tile 上重叠的 Feature。
- **不包含**：polygon / 图像 mask 导入 / 自动生成区域。
- **优先级**：P1
- **依赖**：Feature schema 与 validation。

## 12. 成功标准（如何判断做对了）

- [ ] 玩家在 `256 x 256` 地图上点击 Feature footprint 后，能清楚看到命中的 Feature 和实际目标 `tileId`。
- [ ] 一个 tile 同时属于多个 Feature 时，地图详情能全部并列展示，不丢失“雪原 / 村庄”这类重叠语义。
- [ ] 可调查 Feature 使用 `priority: 1-100` 决定默认调查目标；同优先级并列时通话中可选择。
- [ ] 可调查 Feature 的字符串状态能替代当前 map object 状态，至少迁移一个 IAFS 设备状态链验证。
- [ ] 同一 Feature footprint 内换 tile 调查，不会重复触发已完成的一次性内容。
- [ ] Map Editor 可以创建 Feature，并用画刷/擦除编辑连续 footprint。
- [ ] `tile.areaName` 和 `tile.objectIds` 不再作为新版玩法模型的正式 source of truth。
- [ ] `radar.regions` 保持渲染层职责，本轮不要求与玩法 Feature 同步。

### 12.2 使用效果（Outcome，可选）

- **玩家操作负担**：玩家不需要精确点中 1 个 tile 才能理解或选择目标区域。
- **内容维护成本**：跨多 tile 的地点和对象不需要在每个 tile 上重复配置。

## 13. 风险与缓解

- **R1：点击 Feature 后生成的 tileId 不符合玩家意图**
  - **缓解**：地图详情同时显示 Feature 名称和目标坐标；通话确认前允许重新选点。

- **R2：Feature 与 tile 查询带来性能压力**
  - **缓解**：为每个 tile 预计算或缓存覆盖的 Feature id 列表；Editor 保存后可生成索引或在 runtime 初始化时构建索引。

- **R3：可调查 Feature 过多导致通话按钮拥挤**
  - **缓解**：默认只显示最高优先级可调查 Feature；同优先级并列才让玩家选择，低优先级作为背景信息展示。

- **R4：移除 `tile.areaName` / `tile.objectIds` 影响现有内容**
  - **缓解**：以 IAFS 当前内容为迁移样本，先迁移地点名和设备对象，再更新 validation 和测试。

- **R5：Map Editor 画刷增加实现复杂度**
  - **缓解**：MVP 只做创建、选择、单格画刷、擦除和重叠预览；高级填充、polygon、导入 mask 留到 Later。

## 14. 未决问题（Open Questions）

- **Q1**：`FeatureFootprint` 的最终存储格式采用压缩 tile 列表、shape shorthand，还是二者混合，需要在技术设计中决定。
- **Q2**：`kind` 的枚举需要技术设计阶段收敛，例如 biome、place、site、object、signal、hazard 是否足够。
- **Q3**：tile 上除 `areaName` / `objectIds` 外的字段，如 terrain、weather、environment，在新版中哪些继续保留、哪些未来应迁移到 Feature。
- **Q4**：Feature 状态字符串如何和事件系统现有 condition/effect 命名对齐，需要技术设计细化。
- **Q5**：Map Editor 画刷的最小交互细节，例如笔刷尺寸、撤销粒度、连续性校验反馈，需要 UI/技术设计确认。
