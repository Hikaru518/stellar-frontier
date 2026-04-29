# Event Editor 访谈记录

**Q1:** 这个 Event Editor 的首个 MVP，最核心要解决哪一种工作痛点？我推荐先选“查阅 + 理解 + 校验”，因为它能最快建立对现有事件数据的可视化认知，也能避免一开始就卡在写回和复杂编辑工作流上。

**A1:** 查阅 / 理解 / 校验优先：先把现有事件、schema、引用关系、校验错误更清楚地展示出来。

**Q2:** 本轮 MVP 是否要包含“把修改写回 content 目录”的能力？我推荐先做 A，因为它符合查阅优先目标，也能绕开浏览器写本地工作区的风险；B 更像完整工具，但实现和安全边界更复杂。

选项：

- A. 只读 + 导出 diff/JSON 草稿：MVP 不直接改 content，但能产出可审阅的修改结果
- B. 本地 helper 写回：MVP 提供 Node/CLI helper，把编辑结果写入 content 并运行 validate
- C. 必须能直接编辑并写回 content：否则不算 editor
- D. 完全只读：MVP 只做浏览、schema 展示、校验和预览，不提供修改输出

**A2:** 提问：请解释一下 B。

**Q2 解释:** B 方案就是给 editor 配一个本地“写文件助手”。大致流程是：策划在网页里编辑事件，点保存后，网页把修改发给本机的 Node/CLI helper；helper 负责改 `content/` 下的 JSON、格式化、运行 `npm run validate:content`，再把成功或错误返回给网页。优点是体验接近“真正的 editor”，保存即落盘；缺点是实现复杂度更高，需要处理本地服务启动、安全边界、文件冲突、校验失败回滚或提示。相比之下，A 方案只导出 diff/JSON，更轻、更稳，但不够像完整编辑器。

**Q2 重问:** 本轮 MVP 是否要包含“把修改写回 content 目录”的能力？

**A2 最终:** C. 必须能直接编辑并写回 content：否则不算 editor。

**Q3:** 既然 MVP 必须直接写回 content，你更接受哪种承载方式？我推荐 A：浏览器 editor + 本地 Node helper，因为它能保持网页入口，同时满足本地文件写入与 validate；纯浏览器无法可靠直接写仓库文件。

**A3:** A. 浏览器 editor + 本地 Node helper：网页负责 UI，helper 负责写 content、格式化、运行 validate。

**Q4:** MVP 要覆盖哪些 event 内容？我推荐 A：先聚焦结构化 definitions + call_templates + handler registry/schema 展示，把 legacy events.json 只读标记为旧格式，避免把两套模型同时做成可编辑。

**A4:** A. 结构化事件为主：可编辑 definitions 与 call_templates，展示 handler registry / schema，legacy events.json 只读。

**Q5:** 策划打开 Event Editor 后，最主要的页面工作流应该是什么？我推荐 A：左侧内容浏览器 + 中间详情编辑 + 右侧 schema/preview/validation 面板，最符合查阅、理解、校验优先，也便于后续加入更多 editor。

**A5:** A. 三栏工作台：内容浏览器 / 事件详情编辑 / schema + preview + validation 侧栏。

**Q6:** 保存写回 `content/` 时，校验失败应该如何处理？我推荐 A：失败时不写入最终文件，只保留草稿并显示错误；这样最不容易破坏可运行内容。

**A6:** A. 校验失败则阻止写入最终 content：保留 editor 草稿，显示字段级和全局错误。

**Q7:** Event Editor 产生的编辑器元数据（草稿状态、面板布局、筛选条件、review 备注、节点坐标等）应该存在哪里？我推荐 A：运行时 JSON 绝不写 editor metadata，MVP 只用 localStorage 保存个人偏好和草稿，保持 content 干净。

**A7:** A. 只存在本机 localStorage / editor 草稿中，不写入 content，也不进 Git。

**Q8:** MVP 是否要支持新增事件或模板？我推荐 B：允许复制已有事件创建新事件，但不支持从空白向导新建 domain；这样既能满足真实编辑，又能控制 schema 和加载清单风险。

**A8:** 解释一下 C,D。

**Q8 解释:** C 是“在已有 domain 文件里新建事件”。例如你在 `mountain.json` 里点“New Event”，editor 用向导帮你填：`id`、`trigger`、基础 `graph`、关联的 `call_template`、`sample_contexts`。它不创建新的文件，只在已有 `definitions/mountain.json`、`call_templates/mountain.json` 里追加内容。D 是“创建一个新的事件领域 / 文件包”。例如新增 `desert` 事件域，editor 会创建：`content/events/definitions/desert.json`、`content/events/call_templates/desert.json`，可能还包括 `presets/desert.json`，并处理游戏加载清单或后续自动发现问题。D 更完整，但风险更大，因为现在 `apps/pc-client/src/content/contentData.ts` 是显式 import 文件；新建 domain 后，如果不处理加载清单，内容可能校验通过但游戏读不到。我的建议仍是 B 或 C，D 放 Later。

**A8 最终:** D。

**Q9:** MVP 里的 event graph 应该怎么编辑？我推荐 A：用结构化表单/树编辑节点和边，不做拖拽节点画布；这样能满足编辑与校验，也避免落入“复杂剧情树编辑器”的范围。

**A9:** B. 表单编辑 + 只读图预览：编辑仍在表单中完成，旁边显示 graph 结构图帮助理解。

**Q10:** `apps/editor/` 的 Game Editor 入口，本轮要做到什么程度？我推荐 B：做一个轻量 Game Editor shell，只开放 Event Editor，同时把 Character/Map/Item/NPC 作为禁用入口展示未来方向。

**A10:** B. 轻量 Game Editor shell：有总入口和导航，Event Editor 可用，其他 editor 显示为未来模块。

**Q11:** 单个事件详情页里，哪些视图必须是一等入口？我推荐 A：表单为主，JSON、Schema、Preview、Validation 都作为并排/标签面板存在；这能同时服务策划和开发。

**A11:** D. 表单与 JSON 始终左右并排，Schema/Preview/Validation 放右侧标签。
