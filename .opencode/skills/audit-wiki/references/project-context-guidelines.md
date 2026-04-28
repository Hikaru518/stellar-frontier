# Project Context Guidelines（AGENTS.md / README.md 同步规则 / 中文）

本文件由 `audit-wiki` skill 的 Step 6 引用，定义如何同步项目根的 `AGENTS.md` 与 `README.md`。

## 总则

- **保留用户原创**：任何用户**手写**的规则、说明、命令清单都**不要**自动删除；不确定一段是否过时时，问用户。
- **同步而非重写**：本 skill 不重写整个 `AGENTS.md` / `README.md`；它只增量同步那些「事实部分」（文件清单、目录结构、命令清单、功能列表）。
- **来源是事实**：增量更新的内容来源是 Step 2 三个 subagent 的扫描结果，不是推测。
- **末尾时间戳**：每次同步在文件末尾追加 `<!-- last-synced-by audit-wiki: YYYY-MM-DD -->`，便于确认最近同步日期；如已有，更新日期。

## 1. 边界对照

| 内容 | AGENTS.md | README.md |
| --- | --- | --- |
| 受众 | AI agent / coding 协作者 | 人类开发者 / 玩家 |
| 语气 | 强制规则与体系说明 | 友好介绍与上手指南 |
| 维护者 | 用户 + audit-wiki 同步 | 用户 + audit-wiki 同步 |
| 是否可全量重生 | ❌ 否（保留用户原创规则） | ❌ 否（保留用户原创介绍） |
| 末尾时间戳 | ✅ 是 | ✅ 是 |

## 2. AGENTS.md 同步规则

### 2.1 必须保留的用户原创内容

任何不在下面 §2.2 列出的「audit-wiki 维护段」中的内容都视为用户原创，**保持不动**。例如当前 `AGENTS.md` 中的：

```markdown
docs 这个文件夹中的所有内容需要自包含。当你需要引用文件的时候，你需要把相应的文件复制到 docs 中
```

→ 这是用户原创规则，**保留**。

### 2.2 audit-wiki 维护段

在 AGENTS.md 中**追加**或**更新**以下三段（用 markdown 注释包裹起止边界，便于下次幂等更新）：

```markdown
<!-- audit-wiki:start 文档体系 -->
## 文档体系

- **入口索引**：[`docs/index.md`](./docs/index.md)（由 `audit-wiki` skill 重生成）
- **整体游戏理念**：[`docs/core-ideas.md`](./docs/core-ideas.md)（由 `organize-wiki` skill 维护）
- **子系统 wiki**：`docs/gameplay/<system>/<system>.md`（由 `organize-wiki` skill 维护）
- **数据契约文档**：`docs/game_model/<topic>.md`（由 `organize-wiki` skill 维护）
- **UI 设计**：`docs/ui-designs/`（手工维护）
- **策划案**：`docs/plans/`（按时间戳子目录组织）

当前已成文的子系统 wiki：

- `docs/gameplay/<system-1>/<system-1>.md`
- `docs/gameplay/<system-2>/<system-2>.md`
- ...

当前已成文的 game_model 文档：

- `docs/game_model/<topic-1>.md`
- `docs/game_model/<topic-2>.md`
- ...
<!-- audit-wiki:end 文档体系 -->
```

```markdown
<!-- audit-wiki:start skill 体系 -->
## Skill 体系

| Skill | 入口 | 职责 |
| --- | --- | --- |
| `game-design-brainstorm` | 有新机制 / 新系统的想法 | 把粗略想法转化为版本化中文策划案 |
| `organize-wiki` | 已确认的策划案 | 把策划案合并进全量设计文档（gameplay wiki / game_model） |
| `audit-wiki` | 阶段性审计 | 设计文档 ↔ code 一致性、维护 index、同步项目根 |

详细流程见各 skill 的 `SKILL.md`。
<!-- audit-wiki:end skill 体系 -->
```

```markdown
<!-- audit-wiki:start 当前实现状态 -->
## 当前实现状态

> 来源：最近一次 `audit-wiki` 扫描结果（<YYYY-MM-DD>）

- **已实现的核心系统**：
  - `<system-name>`（`src/<file>.ts`）
  - ...
- **仅设计未实现**：
  - `<system-name>`（仅在 `docs/...` 中描述）
- **代码已有但 wiki 缺失**：
  - `<system-name>`（`src/<file>.ts`，无对应 wiki）

如本轮发现未处理的临时 finding，在 audit-wiki 最终回复中查看「待代码处理 / 待整理」段。
<!-- audit-wiki:end 当前实现状态 -->
```

### 2.3 幂等更新

每次 audit-wiki 运行：

1. 用正则定位 `<!-- audit-wiki:start <段名> -->` 与 `<!-- audit-wiki:end <段名> -->` 之间的内容
2. 完全替换该段内容（保留起止注释）
3. 若起止注释不存在，**追加**到 AGENTS.md 末尾（在末尾时间戳之前）

**不要**在维护段之外动用户原创内容。

### 2.4 待用户决定的修订

如果扫描发现 AGENTS.md 中**用户原创**的某条规则与当前实现不符（例如规则提到 `docs/old-thing.md` 但该文件已不存在），**不要**自动改写；用 question tool 提问：

```
问题：AGENTS.md 中以下规则似乎与当前实现不符，是否更新 / 删除 / 保留？

原文：
> <规则原文>

不一致点：<具体说明>

请选择：
选项 A：保留原文（仍然有效）
选项 B：用户输入新表述
选项 C：删除该规则
选项 D：跳过本条
```

决议保留在当前对话中，并在用户选择 B / C 后才动 AGENTS.md；最终回复需要列出本轮冲突决议摘要。

## 3. README.md 同步规则

### 3.1 必须保留的用户原创内容

- 项目简介段
- 技术栈段（除非命令本身已变化）
- 安装、启动、构建、预览、测试相关命令清单
- GitHub Pages 部署说明
- 「开发说明」自由文字段

### 3.2 必须同步的事实段

下面这些段以**事实扫描结果**为准，发现差异时更新：

#### 3.2.1 功能概览

- 来源：`pages/*.tsx` 中实际存在的页面 + 用户可见入口
- 规则：只列**已实现**的功能；仍在 wiki / 策划案中、src 还没实现的不列
- 用户在 README 中已写过更详细的功能描述时，保留用户原创，仅在末尾追加：
  ```markdown
  > 当前已实现入口（自动同步）：控制中心、通讯台、通话、地图、队员详情、调试工具
  ```

#### 3.2.2 目录结构

- 来源：实际的 `src/` + `docs/` 目录扫描
- 输出格式：保持当前 README 用的 `+--` 风格，不要改成别的；只更新内容
- 控制深度到 2 层（顶层目录 + 直接子目录），更深的不列

#### 3.2.3 设计文档入口

- **优先**：单条入口指向 `docs/index.md`
- 如果用户原 README 维护了页面级链接列表（例如 `docs/ui-designs/pages/控制中心.md` 等），**保留**这些链接，但在表格上方或下方加一行：
  ```markdown
  完整文档索引见 [`docs/index.md`](./docs/index.md)。
  ```

### 3.3 维护段

与 AGENTS.md 类似，README.md 中也用注释边界标记可被覆盖的段。建议两个段：

```markdown
<!-- audit-wiki:start 功能概览 -->
## 功能概览

> 来源：最近一次 `audit-wiki` 扫描结果（<YYYY-MM-DD>）

- 控制中心：游戏主入口，展示资源状态、系统日志和可交互设施。
- 通讯台：查看队员位置、状态、背包和来电，并进入通话事件。
- 通话：承载角色事件、普通行动和紧急决策，选择结果会更新队员与地图状态。
- 地图：以 4x4 网格展示地形、自然资源、建筑、仪器、危险和队员位置。
- ...（按 src/pages/*.tsx 实际存在的页面）
<!-- audit-wiki:end 功能概览 -->
```

```markdown
<!-- audit-wiki:start 目录结构 -->
## 目录结构

```text
.
+-- docs/
|   +-- core-ideas.md
|   +-- index.md
|   +-- game_model/
|   +-- gameplay/
|   +-- plans/
|   +-- ui-designs/
+-- src/
|   +-- components/
|   +-- content/
|   +-- data/
|   +-- pages/
|   +-- App.tsx
|   +-- main.tsx
|   +-- styles.css
+-- .opencode/
|   +-- agents/
|   +-- skills/
+-- AGENTS.md
+-- README.md
+-- package.json
+-- vite.config.ts
```
<!-- audit-wiki:end 目录结构 -->
```

### 3.4 不动的段

- 命令清单（`npm install` / `npm run dev` / ...）
- 部署说明
- 「开发说明」段

如果发现命令清单与 `package.json` 的 scripts 不一致，提问让用户决定，不自动改。

## 4. 检查清单（Step 6 验证）

在 Step 6.3 用 `@explore` subagent 验证：

- [ ] AGENTS.md / README.md 中提到的所有 `docs/...` 路径在文件系统中存在
- [ ] AGENTS.md / README.md 中提到的所有 `src/...` 路径在文件系统中存在
- [ ] AGENTS.md / README.md 中所有 `audit-wiki:start` 都有对应的 `audit-wiki:end`
- [ ] 末尾的 `<!-- last-synced-by audit-wiki: YYYY-MM-DD -->` 是当天日期
- [ ] AGENTS.md 中用户原创的"docs 自包含"规则仍然存在
- [ ] README.md 中 npm 命令清单未被改动

任一项不通过 → 停止继续改写，向用户说明失败项、已改文件与建议回滚方式；不要自行执行破坏性 git 操作。

## 5. 反模式（不要做的事）

- ❌ 全量重写 AGENTS.md / README.md：必然丢失用户原创内容
- ❌ 把 wiki 内容搬进 README：README 是入口，wiki 才是详细内容
- ❌ 列还没实现的功能：README 必须反映当前 src 实际能做的事
- ❌ 改 npm 命令：命令清单跟随 `package.json`，不由 audit-wiki 决定
- ❌ 把临时 findings 贴进 AGENTS.md / README.md：项目根只保留稳定事实，临时审计结论留在对话总结中即可
