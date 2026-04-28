---
type: research-topics
created_at: 2026-04-29 01:40
---

# 研究范围

## 项目内调研

- 用户选择：**扫描现有 docs 与代码**
- 重点关注：
  - `docs/core-ideas.md`
  - `docs/gameplay/map/`、`docs/gameplay/event/`、`docs/gameplay/crew/`（如存在）
  - `docs/game_model/`
  - `docs/ui-designs/` 中关于通话界面 / action 列表的部分
  - `src/` 中 action / map / map-object / event 相关模块的当前结构
  - 最近的 commits（特别是 b589ba6 minimal return-home MVP 与 25cbaf9 editor planning）

## 互联网调研

- 用户选择：
  1. **表驱动 / 数据驱动的物体—行动—事件结构**（Caves of Qud / RimWorld 风格 entity+tag+condition 行动系统的可扩展设计与编辑器友好度）
  2. **点击冒险 / RPG 中的动词-名词交互**（Monkey Island、Disco Elysium、Pillars 等：角色站在物体旁时显示哪些可选行动 —— 动词菜单、上下文动作、技能门槛行动）

- 用户**未选择**的方向（明确跳过）：
  - 前置条件 vs 事件内判断的取舍
