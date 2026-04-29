---
type: interview-transcript
date: 2026-04-29
topic: map-object-action-refactor
---

# 访谈记录：map-object-action-refactor

> 本文件忠实记录本次 brainstorm 的提问与回答，不做总结裁剪。Q1-Q2 属于研究范围决策，Q3 起为正式访谈。

---

## Step 2 — 研究范围决策

### Q1：是否需要先扫描现有 docs（core-ideas、gameplay/、ui-designs/、game_model/）以及当前代码中已有的 action / map 实现，找出与本次想法相关的部分？

**Assistant 提供选项**：
- A：扫描现有 docs 与代码（推荐）
- B：不用，直接进入访谈

**User**：扫描现有 docs 与代码

### Q2：以下哪些方向值得做互联网研究？

**Assistant 提供选项**（多选）：
- A：点击冒险 / RPG 中的动词-名词交互
- B：表驱动 / 数据驱动的物体—行动—事件结构
- C：前置条件 vs 事件内判断的取舍
- D：不用探索

**User**：B（表驱动 / 数据驱动）+ A（动词-名词交互）

---

## Step 4 — 正式访谈

### Q3：地图对象抽离后，与 tile 的关联放在哪一边？

**Assistant 提供选项**：
- A：在 object 上存 tileId（对象看 tile）
- B：在 tile 上存 objectIds[]（tile 看对象）
- C：双向都存（冗余）

**User**：B — 在 tile 上存 objectIds[]

### Q4：运行时状态（status_enum、运行时 tags、被什么进度改变过等）应该如何存储？

**Assistant 提供选项**：
- A：definition 只记初始值，运行时状态走单独的 runtime 表（推荐）
- B：合并到一个对象表，状态与定义同表
- C：三层（blueprint + definition + runtime）

**User**：A — definition + runtime 分层

### Q5：status_enum 的初始枚举集合选哪个方向？

**Assistant 提供选项**：
- A：生命周期型（pristine / discovered / interacted / depleted / destroyed）
- B：物理状态型（intact / damaged / broken / locked / unlocked）
- C：抽象状态型（active / inactive / consumed）
- D：先不锁枚举，用 `status_enum: string` 为全局文本枚举，按对象型别自定义

**User**：D — 先不锁枚举，按对象型别自定义

### Q6：状态转换由谁驱动？

**Assistant 提供选项**：
- A：由事件 effect 驱动（事件原语 set_object_status）（推荐）
- B：事件 effect 主导，但 action 可声明 default_outcome.set_status
- C：两者均可独立驱动

**User**：A — 由事件 effect 驱动

### Q7：action 与 event 的耦合方式？

**Assistant 提供选项**：
- A：action 只存 event_id 引用，入口单一
- B：action 存 event_id + entry_node_id（可选）（推荐）
- C：action 存 event_id + context payload（传参）

**User**：A — action 只存 event_id 引用，入口单一

### Q8：action 的条件 DSL，是复用还是重新写一套？

**Assistant 提供选项**：
- A：完全复用 events/types.ts 里的 Condition[]（推荐）
- B：复用 + 新增专属谓词（如 object_status）
- C：为 action 写一套精简的专用 schema

**User**：A — 完全复用 Condition[]

### Q9：「基础行动」（移动、调查地图块、待命、停止）是否也走同一张 action 表？

**Assistant 提供选项**：
- A：走同一张表，用 category=universal 区别（推荐）
- B：基础行动硬编码在 UI，对象 action 走表
- C：双表（universal_action / object_action）

**User**：A — 走同一张表

### Q10：条件不满足的 action 怎么在通话页展示？

**Assistant 提供选项**：
- A：默认隐藏，仅需额外标记才灰显
- B：默认灰显带门槛提示，例外才隐藏（推荐）
- C：由单个 action 自己决定 display_when_unavailable

**User**：A — 默认隐藏，标记后才灰显

### Q11：灰显时的「门槛提示文案」怎么产生？

**Assistant 提供选项**：
- A：action 自己声明 unavailable_hint 文案
- B：从 condition 自动生成
- C：两者结合：默认从 condition 生成，action 可重写（推荐）

**User**：C — 两者结合

### Q12：现有 tile_object_definition.candidateActions: string[] 这个字段怎么过渡？

**Assistant 提供选项**：
- A：完全废弃，改为「action 自声明 applicable_to」（推荐）
- B：保留 candidateActions，叠加 action.conditions 过滤
- C：双向都保留

**User**：A — 完全废弃；并反问"不再需要 kind/tag，而是直接针对每个 object id 都会有对应的 action，这样可以吗"

### Q13：（追问）object 拥有自己的 action 集合 —— 底层如何存？

**Assistant 提供选项**：
- A：object.actions: ActionDef[]（全部内联）
- B：object.action_ids: string[]（引用共享 action 表）（推荐）
- C：混合 action_ids[] + object_overrides

**User**：A — 全部内联（object.actions: ActionDef[]）

### Q14：「基础行动」（移动 / 调查地图块 / 待命 / 停止）怎么装进这套「oid→action」体系？

**Assistant 提供选项**：
- A：他们是「不被某个对象拥有」的 universal action，独立提供（推荐）
- B：tile 也是一种 object，调查 / 移动也是 tile 拥有的 action
- C：基础行动仍然硬编码在 UI

**User**：A — universal action 独立提供

### Q15：既然 status_enum 不锁全局枚举，是否要在对象 definition 里声明该对象允许的 status 集合？

**Assistant 提供选项**：
- A：在 object definition 里写 status_options: string[]（推荐）
- B：只在 type 层面为 string，不强制声明
- C：提供 status_enum 完整重量型声明（状态 + 性质 + 转换规则）

**User**：A — status_options: string[]

### Q16：MVP 阶段是否需要可视化编辑器？

**Assistant 提供选项**：
- A：阶段 1 手写 JSON，editor 留给后续（推荐）
- B：MVP 同步做最简的 action editor（表单式）
- C：需要完整可视化 condition 编辑器

**User**：A — 阶段 1 手写 JSON

### Q17：本轮 MVP 要覆盖哪些能力？（多选）

**Assistant 提供选项**：
- A：地图对象抽离为独立表（definition + runtime 分层）+ status_options + status_enum
- B：Action 表重构：object.actions 内联 + universal_actions 独立 + Condition[] 复用 + event_id 入口
- C：不可用 action 隐藏逻辑 + override 灰显 + 门槛提示
- D：set_object_status 事件 effect + 实例迁移

**User**：全选 — A + B + C + D

### Q18：本轮明确不做 / 推到后续的项？（多选）

**Assistant 提供选项**：
- A：可视化 action / condition / object 编辑器
- B：状态机「合法转换」声明与静态检查（lint）
- C：额外反馈（action 选择后的动画 / 音效 / 运行时说明面板）
- D：跨对象联动（作为主动语义）

**User**：全选 — A + B + C + D

---

## 访谈期间的插问

**User（/btw）**：我该如何开启 claudecode 的联网搜索功能？

**Assistant**：解答了 WebSearch / WebFetch 工具的存在、permissions 配置方法、以及若工具不出现的排查路径。
