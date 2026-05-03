# 地图系统访谈记录

> **时间**：2026-04-30
> **主题**：Phaser 4 地图系统 design doc 访谈

---

**问：initial.md 已经有完整的技术规格（§1–§11），这次 brainstorm 的直接目标是什么？**

选项：
- A：把 initial.md 原封不动地转成标准 design doc（按模板补充背景、用户旅程、User Stories、成功标准等），不做新决策。
- B：在访谈中重新审视 initial.md 的假设，识别遗漏/矛盾，形成一份经过澄清的 design doc，可能调整部分决策。
- C：initial.md 只是起点，这次需要更大范围地讨论：比如地图视觉风格、贴图制作工作流、或玩法层是否需要变化。

**用户回答**：A。同时把 initial 作为 reference 写入文档中，强调已经包含技术决策，需要 tech（意指技术决策已包含在 initial.md 中，不需要在 design doc 重新决策）。

---

**问：initial.md 第一行写着"已通过 Demo 阶段验证"，但主线仓库没有任何 Phaser 代码。这个 Demo 的实际状态是？**

选项：
- A：Demo 存在于其他分支/本地工程，已验证过主要交互（缩放、拖拽、贴图、人物动画），可以直接翻译到主线。
- B：Demo 存在，但只验证了部分功能（比如渲染），并非全部 MVP 项目。
- C：Demo 是这份 initial.md 本身（设计稿阶段算验证），尚未进行任何渲染层验证。

**用户回答**：Demo 在另一个分支，但是不会翻译到主线，因为实现的 demo 和我们的游戏概念差太多，能复用的都在文档里了。

---

**问：initial.md §10 MVP 第一条是"用真实 tileset PNG 替代程序生成色块"。目前实际资源情况如何？**

选项：
- A：已有可用的 tileset PNG 文件，可以随代码一起提交。
- B：PNG 还没有，MVP 阶段先用程序生成色块（当前的 terrain color mapping），贴图作为 Later 项。
- C：PNG 还没有，但 MVP 里需要一套占位贴图（placeholder sprites），哪怕是单色块或简单图案也行。

**用户回答**：C——PNG 还没有，但 MVP 里需要占位贴图基础设施（registry.json + 加载管道），图案可以是简单占位图。

---

**问：Phaser 4.0.0 的 ESM 默认导出有一个已知 bug（#7280，于 2026-04-22 修复），导致 `import('phaser')` 动态导入在 esbuild/Vite 下报错。initial.md 指定 `phaser: ~4.1.0`。应如何处理？**

选项：
- A：锁定到一个具体的安全版本（如 4.1.0，包含修复），并在 design doc 里注明原因。
- B：按 initial.md 的 `~4.1.0` 范围即可，安装时自动解析到最新 patch。
- C：改用 `import * as Phaser from 'phaser'` named import 方式规避 bug，不强制版本。

**用户回答**：A——锁定到 4.1.0，在 design doc 中注明 ESM bug 原因。

---
