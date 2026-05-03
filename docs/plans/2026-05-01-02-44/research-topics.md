# Research Topics

## 用户选择

### 代码库探索
- ✅ 探索现有代码库

### 互联网研究（多选）
- ✅ 前端日志持久化方案（浏览器 / Tauri / Electron 上的本地文件、IndexedDB、FileSystem Access API 等）
- ✅ 事件溯源 / Append-only Log 模式（Event Sourcing、JSONL、game replay log）
- ❌ 面向 LLM 的游戏叙事日志（暂不研究）

## 项目内探索关注点

- **存档系统**：当前 reset save / new game 的入口、存档 ID/版本、存档结构。
- **事件系统**：现有事件总线 / 事件定义、触发与结果的表达方式（事件发生 → 走向 → 结果）。
- **行动 / 通话系统**：玩家给队友通话、下达指令的现有抽象（最近 commit 提到 `重构地图对象与行动系统`）。
- **持久化层**：现在游戏怎么存数据？localStorage / IndexedDB / 文件？运行平台（纯 web 还是 Tauri/desktop）？
- **既有日志或调试输出**：是否已经有 console / dev log / replay 系统可以复用？
- **领域文档**：`docs/core-ideas.md`、`docs/gameplay/*`、`docs/game_model/*` 中关于"事件 / 玩家行动 / 时间线 / 叙事"的描述。
- **最近提交**：近期是否动过事件、行动、存档相关的代码（如 `feat: game system demock`、`feat: 重构地图对象与行动系统`）。

## 互联网研究关注点

### 前端日志持久化
- 在纯浏览器环境下，append-only 写入本地文件的可行手段（FileSystem Access API、download 触发、IndexedDB + 周期导出）。
- 在 Tauri / Electron 环境下追加写入文件的标准 API。
- 大小 / 性能 / 浏览器配额 / 用户授权方面的限制。
- 跨平台差异（用户所在项目运行在哪类壳子里需要在项目探索中确认）。

### 事件溯源 / Append-only Log
- Event Sourcing 在游戏 / 应用中的常见做法（command → event → state）。
- JSON Lines（JSONL）作为 append-only 日志格式的优劣。
- 单存档一份日志 vs. 滚动文件 vs. 分段（rotation）的取舍。
- replay / 时光回溯 / 调试场景下的最佳实践与已知陷阱。
