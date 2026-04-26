---
topic: character-system-debug-toolbox
date: 2026-04-26
research_scope:
  codebase: true
  internet: true
source:
  initial: docs/plans/2026-04-26-17-02/initial.md
  research_topics: docs/plans/2026-04-26-17-02/research-topics.md
---

# Research: character-system-debug-toolbox

## 1. Research Summary（研究摘要）

本次研究为“人物系统 + debug toolbox”后续访谈提供事实基础。项目内已有队员、行动、事件、时间、库存与通话决策框架，因此新设计不应从零发明角色系统，而应优先澄清：哪些字段用于故事表达，哪些字段影响行动结算，哪些 debug 能力只是开发工具而不进入 MVP 玩家体验。

关键冲突在于：项目文档明确当前 MVP 不做时间加速、暂停、睡眠，但 debug toolbox 可能需要接入时间推进与存档重置；同时，调查入口目前偏向 Garry 通话，Mike 到达后无法调查暴露出角色能力、UI 指令入口、事件触发之间的边界尚不清晰。外部参考显示，优秀角色系统通常依赖少量高价值标签、背景与专长，而不是大量孤立数值。

## 2. Project Findings（项目内发现，未做项目内调研则跳过本节）

### 2.1 已有玩法系统（Existing Gameplay Systems）

- **队员行动系统**：队员是地图、事件、资源互动执行单位，同一时间只能执行移动、待命、调查、采集、建设、事件处理等一个主行动；移动完成后默认待命，不自动调查（证据：`docs/gameplay/crew/crew.md`、`src/crewSystem.ts`、`src/App.tsx`）。
- **事件与调查系统**：事件来源包括进入地块、完成调查、采集、建设、长时间待命、通话选择、紧急倒计时；调查默认 180 秒，完成后检查 `surveyComplete` 事件（证据：`docs/gameplay/event-system/event-system.md`、`src/eventSystem.ts`、`content/events/events.json`）。
- **时间与存档系统**：MVP 固定 `timeScale = 1`，不做加速、暂停、睡眠；代码以 `setInterval` 每 1000ms 增加 1 秒，localStorage key 为 `stellar-frontier-save-v1`，暂无重置存档入口（证据：`docs/gameplay/time-system/time-system.md`、`src/App.tsx`、`src/timeSystem.ts`）。
- **库存与物品系统**：已有 inventory/bag、物品 category、stackable、maxStack、description、tags、effects，但暂无重量、体积、承重上限（证据：`content/items/items.json`、`src/data/gameData.ts`）。

### 2.2 现存叙事设定与角色（Existing Narrative & Crew）

- **核心设定文档为空**：`docs/core-ideas.md` 当前为空，无法从全局世界观约束人物背景（来源：`docs/core-ideas.md`）。
- **队员数据已 JSON 化**：Mike、Amy、Garry 已有 `crewId/name/role/currentTile/status/currentAction/canCommunicate/lastContactTime`，状态包括 `idle/moving/working/inEvent/lost/dead`；已有 perception、survival、mining、engineering、combat、communication、技能、库存、当前行动、紧急事件字段（来源：`content/crew/crew.json`、`content/schemas/crew.schema.json`、`src/content/contentData.ts`）。
- **可扩展接口**：人物系统可基于已有属性、技能、物品、状态、位置、行动、紧急事件扩展；背景可接 `role/summary` 与个人物品描述；日记可接全局 `SystemLog`，但尚无 per-crew diary（来源：`content/crew/crew.json`、`src/App.tsx`）。

### 2.3 现存 UI 设计（Existing UI Design）

- **地图页只读**：地图页展示状态但不直接发指令，若要让非 Garry 队员调查，需要考虑通话页或其他确认入口（来源：`docs/ui-designs/pages/地图.md`、`src/pages/MapPage.tsx`）。
- **通话页承载决策**：通话页是行动确认入口；当前调查主要由 Garry 普通通话触发并创建 180 秒 survey action，非 Garry 普通通话多为继续前进/原地等待（来源：`docs/ui-designs/pages/通话.md`、`src/pages/CallPage.tsx`）。
- **通讯台入口**：通讯台承担队员状态与来电入口，适合承载少量角色线索与 debug 状态，但需避免抢占主 UI（来源：`src/pages/CallPage.tsx`、`docs/ui-designs/pages/通话.md`）。

### 2.4 设计原则（Design Principles）

- **文字驱动与高信息密度**：项目强调低装饰、控制台感、日志反馈、状态文本优先，因此角色信息应以短标签、状态行、日志片段表达，而不是复杂面板堆叠（来源：`docs/ui-designs/ui-design-principles.md`）。
- **行动入口一致性**：既然地图按设计不发指令，人物系统若影响行动选择，需要明确由通话、通讯台还是 debug 面板触发（来源：`docs/ui-designs/pages/地图.md`、`docs/ui-designs/pages/通话.md`）。

### 2.5 最近 commits（Recent Changes）

- **603c610**：add event system, use json to save content (#5)。
- **3cf94fc**：Add crew movement system。
- **e8901fa**：Add time-driven gameplay systems。
- **8081762**：Implement React UI MVP。

### 2.6 项目约束（Project Constraints）

- **debug 与 MVP 冲突**：debug toolbox 可接 `App.tsx` interval 与 `timeSystem` save key，但与 time-system 文档“不做加速/暂停/睡眠”的 MVP 约束冲突，需要确认是否允许 debug-only 例外（证据：`docs/gameplay/time-system/time-system.md`、`src/App.tsx`、`src/timeSystem.ts`）。
- **调查 bug 线索**：Mike 到达后无法调查，可能因 `CallPage` 对非 Garry 普通通话没有 survey 分支；调查结束无事件可能与 `surveyComplete` 概率、arrival 无内容、旧 result 文本残留、`tile.surveyCount >= 3` 条件缺少 MapTile/eventSystem 支持有关（证据：`src/pages/CallPage.tsx`、`src/eventSystem.ts`、`content/events/events.json`）。

## 3. Best Practice Findings（互联网发现，未做互联网调研则跳过本节）

### 3.1 参考游戏作品（Reference Games）

- **RimWorld**：角色由 skills、traits、backstory、needs、mood、thoughts、health、social 等共同组成。借鉴点：角色不应只是效率数值，属性、技能、特质要服务故事生成。参考：https://www.rimworldwiki.com/wiki/Characters
- **D&D 2024 Free Rules**：角色由职业、背景、种族、属性、专长、人格想象共同塑造。借鉴点：可借鉴多模块表达角色，但不照搬战斗职业。参考：https://www.dndbeyond.com/sources/dnd/free-rules/creating-a-character

### 3.2 玩法模式与设计惯例（Patterns & Conventions）

- **少数核心能力覆盖多任务**：RimWorld 中技能影响速度、成功率、品质与失败风险，技能和工作类型不完全一一对应；incapable 是硬限制，不熟练仍可尝试。借鉴点：减少表格膨胀。参考：https://www.rimworldwiki.com/wiki/Skills 、https://rimworldwiki.com/wiki/Incapable
- **擅长与喜欢分离**：RimWorld passion 影响成长和心情。借鉴点：后续可讨论“擅长”和“喜欢”是否分离，以支撑人物弧线。参考：https://www.rimworldwiki.com/wiki/Skills
- **属性可解释为行为倾向**：D&D 六属性不仅是判定数值，也帮助玩家理解角色如何行动。借鉴点：属性命名应让玩家理解“故事中意味着什么”。参考：https://www.dndbeyond.com/sources/dnd/free-rules/playing-the-game
- **专长作为规则例外**：D&D feats/proficiency 提供加成或例外，而不是把所有能力做成硬门槛。借鉴点：每名角色可有少量标志性专长，危机中允许外行尝试但产生后果。参考：https://www.dndbeyond.com/sources/dnd/free-rules/feats

### 3.3 已知陷阱（Known Pitfalls）

- **系统吞噬人物核心**：Tynan Sylvester 相关访谈强调少量明确标签、玩家脑补、信息可见、小规模人物故事。陷阱是把角色系统做成大量隐藏数值，反而削弱玩家对人的记忆。参考：https://www.rockpapershotgun.com/2016/08/12/how-rimworld-generates-great-stories/ 、https://culturedvultures.com/tynan-sylvester-rimworld/ 、https://www.eurogamer.net/rimworld-can-you-make-your-game-up-as-you-go-along
- **背景只当装饰**：RimWorld traits/backstories 显示 trait 是可管理的麻烦，backstory 用短文本解释能力来源并制造限制。陷阱是背景不影响行动、风险或叙事钩子。参考：https://www.rimworldwiki.com/wiki/Traits 、https://www.rimworldwiki.com/wiki/Backstories

### 3.4 SOTA / 新趋势（可选）

- N/A：输入资料未提供足够可溯源的新趋势信息，本报告不额外扩展。

## 4. Trade-offs Analysis（权衡分析）

### Trade-off 1：角色数值表 vs 角色故事标签

- **数值表的优势**：容易接入现有属性、技能、行动与事件结算。
- **故事标签的优势**：更符合文字驱动和小规模人物故事，便于通话、日志、背景与个人物品表达。
- **建议**：访谈中优先确认少数可见标签如何影响行动，再决定是否扩大数值维度。

### Trade-off 2：debug-only 时间工具 vs 严格遵守 MVP 时间约束

- **debug-only 的优势**：可快速验证行动、调查、事件、紧急倒计时与存档问题。
- **严格约束的优势**：避免误把加速、暂停、重置等开发能力变成玩家承诺。
- **建议**：若采用 toolbox，应明确仅开发环境可见，并在设计文档中标注不属于 MVP 玩家机制。

### Trade-off 3：通话页发指令 vs 地图页发指令

- **通话页的优势**：符合现有 UI 设计，能用角色语气包装选择。
- **地图页的优势**：更直接解决“到达后调查”的可用性问题。
- **建议**：先澄清地图只读原则是否保留；若保留，应补齐非 Garry 的通话调查入口或通讯台确认流程。

## 5. Key References（关键参考）

### 5.1 项目文件（Project Files）

- `docs/core-ideas.md` — 当前为空，缺少全局叙事约束。
- `docs/gameplay/crew/crew.md` — 队员行动、状态与职责。
- `docs/gameplay/event-system/event-system.md` — 事件来源与调查触发流程。
- `docs/gameplay/time-system/time-system.md` — MVP 时间系统限制。
- `content/crew/crew.json` — Mike/Amy/Garry 与角色字段。
- `content/events/events.json` — 现有调查和紧急事件内容。
- `src/App.tsx` — 时间推进、存档、行动状态衔接。
- `src/pages/CallPage.tsx` — 通话决策与调查入口。
- `docs/ui-designs/ui-design-principles.md` — UI 风格与信息表达原则。

### 5.2 外部链接（External Links）

- https://www.rimworldwiki.com/wiki/Characters — RimWorld 角色组成。
- https://www.rimworldwiki.com/wiki/Skills — 技能与 passion。
- https://rimworldwiki.com/wiki/Incapable — 工作限制模式。
- https://www.rimworldwiki.com/wiki/Traits — 特质作为可管理麻烦。
- https://www.rimworldwiki.com/wiki/Backstories — 背景与能力来源。
- https://www.dndbeyond.com/sources/dnd/free-rules/creating-a-character — D&D 角色创建模块。
- https://www.dndbeyond.com/sources/dnd/free-rules/playing-the-game — 属性与熟练。
- https://www.dndbeyond.com/sources/dnd/free-rules/feats — 专长作为规则例外。
- https://www.rockpapershotgun.com/2016/08/12/how-rimworld-generates-great-stories/ — RimWorld 故事生成访谈。

## 6. Open Questions for Design

- **Q1**：debug toolbox 是否允许作为 debug-only 例外提供时间加速、暂停、重置存档，还是必须完全遵守 MVP 时间限制？
- **Q2**：角色系统第一版更重“行动结算数值”，还是更重“背景、特质、日记、个人物品”等叙事表达？
- **Q3**：地图只读原则是否保持？若保持，非 Garry 队员的调查、采集、建设入口应放在通话页还是通讯台？
- **Q4**：背包承重是否进入本轮范围？若进入，需要新增重量、容量、承重上限等字段。
- **Q5**：per-crew diary 是否需要独立于全局 `SystemLog`，还是先用日志筛选模拟？

---

**Research Completed:** 2026-04-26  
**Next Step:** 进入 Step 4（用户访谈），使用本 research 作为输入。
