# Research Topics

## 用户选择

### 项目内研究

用户要求扫描 `docs` 和 code。研究范围包括：

- `docs/core-ideas.md`
- `docs/gameplay/`
- `docs/game_model/`
- `docs/ui-designs/`
- `content/`
- 与内容加载、事件系统、数据校验、页面入口相关的 `src/` 和脚本

目标：找出 event editor 需要遵守的现有约束、数据结构、UI 风格和工程边界。

### 互联网研究

用户选择：

- JSON Schema 驱动编辑器 / 表单生成器。理由：event 数据已有 schema，编辑器可能应尽量复用 schema 来降低维护成本。
- 游戏内容编辑器与策划工具 UX。理由：这是给策划和开发使用的生产工具，需要参考内容浏览、校验、差异查看、批量编辑等常见模式。
- Other。用户未提供具体方向；后续访谈中如有需要再补充。

用户未选择：

- 文件型内容管线与版本控制协作。
- 不用探索互联网。
