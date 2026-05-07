---
topic: iafs-mobile-hotpot-cart
date: 2026-05-02
research_scope:
  codebase: true
  internet: true
source:
  initial: docs/plans/2026-05-02-00-00/initial.md
  research_topics: docs/plans/2026-05-02-00-00/research-topics.md
---

# Research: iafs-mobile-hotpot-cart

## 1. Research Summary（研究摘要）

本次研究用于回答一个具体问题：在 IAFS 世界里，“移动火锅车”除了搞笑外，如何具备可验证的世界观特色与系统价值。关键结论是，该题材可成立，但必须遵守现有玩法边界（远程指挥、通话下令、时间持续流逝），并将“灰烬霜带的冷热窗口”作为核心压力，而不是把火锅车写成纯段子装置。

项目内已有 side_03 作为 canon 锚点，说明方向不是“要不要做”，而是“做多深、怎么不跑偏”。外部资料显示，极地烹饪的可信细节可以被抽象为几个可读风险变量；灾难叙事中的幽默应作为角色 coping，不应压过关键代价节点。对策划案的直接影响是：可以给火锅车一套“保温/燃料/稳定”三要素，但表达为 2-4 个带代价选项，避免模拟过度。

## 2. Project Findings（项目内发现）

### 2.1 已有玩法系统（Existing Gameplay Systems）

- **通讯台指令闭环**：移动、待命、停止、调查四类基础行动是主骨架，剧情动作应进入事件选项，而非新增自由指令。（证据：`docs/gameplay/communication-table/communication-table.md`）
- **地图只读态势**：地图页承担信息观察，不直接下达行动命令，动作仍需通过通话触发。（证据：`docs/gameplay/map-system/map-system.md`）
- **事件图与 schema 约束**：节点类型、选项映射、效果写回路径都受 event system 与 schema 限制。（证据：`docs/gameplay/event-system/event-system.md`）

### 2.2 现存叙事设定与角色（Existing Narrative & Crew）

- **灰烬霜带是动态交界带**：不是静态景观，强调窗口期与失误代价。（来源：`docs/story/storyline/ice-and-fire-star/IAFS_wiki.md`）
- **双聚落同源分裂且互依赖**：支线结果应回写舆情/信任，不应只有一次性掉落。（来源：`docs/story/storyline/ice-and-fire-star/IAFS_wiki.md`）
- **side_03 已是既有剧情锚点**：移动火锅车的语气与冲突框架已有基础，应增量深化而非推倒重来。（来源：`docs/story/storyline/ice-and-fire-star/IAFS_side_03_ashland-scavengers.md`）

### 2.3 现存 UI 设计（Existing UI Design）

- **通话页适配多选代价决策**：2-4 个选项最利于玩家在压力下做判断，适配火锅车“稳妥/冒险/放弃”结构。（来源：`docs/ui-designs/pages/通话.md`）
- **控制台低保真表达**：文本反馈与日志累计比复杂动效更重要。（来源：`docs/ui-designs/ui-design-principles.md`）

### 2.4 设计原则（Design Principles）

- **文本驱动 + 系统后果可追踪**：叙事必须能映射为状态变化，写回日志/历史而非只留文案印象。（来源：`docs/core-ideas.md`）
- **内容驱动优先**：剧情定义、选项、效果应在 content 资产层维护，避免代码硬编码分支。（来源：`docs/core-ideas.md`）

### 2.5 最近 commits（Recent Changes）

- **本轮未做 commit-level 研究**：仅依据当前文档快照进行约束梳理。

### 2.6 项目约束（Project Constraints）

- **时间不暂停**：通话与犹豫本身会消耗窗口，必须有代价反馈。（来源：`docs/gameplay/time-system/time-system.md`）
- **单队员单主行动互斥**：救援与其他主行动并行受限，事件需显式处理占用关系。（来源：`docs/gameplay/crew/crew.md`）

## 3. Best Practice Findings（互联网发现）

### 3.1 参考游戏作品（Reference Games）

- **Overcooked（官方站点）**：移动烹饪的核心张力是“时间压力 + 空间障碍 + 协作失误成本”。借鉴点：把火锅车做成节奏管理问题，而非菜单收集问题。参考：https://www.ghosttowngames.com/overcooked
- **Battle Chef Brigade（Nintendo/官方信息）**：烹饪与战斗/采集联动，强调“食材获取风险 -> 成果质量”。借鉴点：火锅车补给品质可绑定前置行动质量。参考：https://www.nintendo.com/games/detail/battle-chef-brigade-deluxe-switch

### 3.2 玩法模式与设计惯例（Patterns & Conventions）

- **极地炊事工程化抽象**：稳定燃烧、挡风保氧、固定平台、锅盖密封、低温泵件可靠性是核心变量。可转译为事件条件与失败因子。参考：https://explorersweb.com/secrets-of-polar-gear-part-6-cooking-setups
- **灾难场景中的幽默是“减压阀”**：应服务角色 coping 与节奏换气，而非替代冲突。参考：https://www.writersdigest.com/write-better-fiction/how-to-bring-humor-to-tough-topics

### 3.3 已知陷阱（Known Pitfalls）

- **笑点过量导致跳戏**：若在关键伤亡/失联节点持续抖包袱，会削弱主线危机可信度。参考：Writer's Digest（同上）
- **过度系统模拟**：把极地烹饪做成细碎参数管理，可能破坏通讯台决策节奏。参考：ExplorersWeb（同上）
- **引用低可信攻略化资料**：部分博客/维基信息缺少原始验证，若直接写进 canon 风险高。参考：(unverified) https://heatinerary.blog/blog/stove-basics-setup-safety-maintenance/camp-stove-season-guide-windproof-cold-ready

### 3.4 SOTA / 新趋势（可选）

- **“高压叙事中的功能性幽默”**：以微型幽默缓冲情绪，再把重决策落在后续节点，形成“轻-重-轻”节拍。参考：Writer's Digest（同上）

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：工程真实感（细节） vs 交互可读性（轻量）
- **A 的优势**：真实感强，玩家更信“火锅车在冰火环境中能跑起来”。
- **B 的优势**：决策更快，符合通话界面高压选择节奏。
- **建议**：优先 B；把工程逻辑压缩为 2-4 个可读代价选项，用结果文案补充真实感。

### Trade-off 2：幽默密度（记忆点） vs 主线危机感（一致性）
- **A 的优势**：角色更鲜活，支线辨识度高。
- **B 的优势**：不破坏“灰烬霜带窗口与代价”的主叙事张力。
- **建议**：在开场与回收段放幽默，中段冲突与失败结算保持克制。

### Trade-off 3：即时奖励（爽感） vs 长期后效（系统价值）
- **A 的优势**：反馈直接，玩家体感明显。
- **B 的优势**：与双聚落关系、后续社会线形成可追踪耦合。
- **建议**：两者并用，但长期后效至少落 1 个 world_flag + 1 条 history key。

## 5. Key References（关键参考）

### 5.1 项目文件（Project Files）
- `docs/core-ideas.md` — 全局设计原则与内容驱动边界
- `docs/gameplay/communication-table/communication-table.md` — 指令与通话约束
- `docs/gameplay/map-system/map-system.md` — 地图只读与态势职责
- `docs/gameplay/event-system/event-system.md` — 事件图、选项与效果约束
- `docs/gameplay/time-system/time-system.md` — 时间流逝与窗口代价
- `docs/gameplay/crew/crew.md` — 队员行动互斥
- `docs/ui-designs/ui-design-principles.md` — 低保真控制台表现原则
- `docs/ui-designs/pages/通话.md` — 通话页选项密度与信息呈现
- `docs/story/storyline/ice-and-fire-star/IAFS_story.md` — 章节叙事源文本
- `docs/story/storyline/ice-and-fire-star/IAFS_wiki.md` — 设定与耦合说明
- `docs/story/storyline/ice-and-fire-star/IAFS_index.md` — story-event 拆分索引
- `docs/story/storyline/ice-and-fire-star/IAFS_side_03_ashland-scavengers.md` — 已有 side_03 事件草案

### 5.2 外部链接（External Links）
- https://explorersweb.com/secrets-of-polar-gear-part-6-cooking-setups — 极地炊事工程细节（较可信）
- https://www.writersdigest.com/write-better-fiction/how-to-bring-humor-to-tough-topics — 严肃叙事中的幽默边界（较可信）
- https://www.ghosttowngames.com/overcooked — Overcooked 官方信息
- https://www.nintendo.com/games/detail/battle-chef-brigade-deluxe-switch — Battle Chef Brigade 官方信息
- (unverified) https://heatinerary.blog/blog/stove-basics-setup-safety-maintenance/camp-stove-season-guide-windproof-cold-ready — 极地炉具经验帖（未核验）

## 6. Open Questions for Design

- **Q1**：移动火锅车在 IAFS 中是“一次性事故补给载体”还是“可重复出现的民间物流节点”？
- **Q2**：双聚落后效是否拆成“信任/依赖/敌意”多轴，还是先用单一 `world_flag` 做 MVP？
- **Q3**：通话页默认给 3 选项还是 4 选项，才能兼顾可读性与策略深度？
- **Q4**：失败结局是否允许直接进入失联链路，还是先限定为资源/舆情惩罚以控制难度跃迁？

---

**Research Completed:** 2026-05-02 00:00  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
