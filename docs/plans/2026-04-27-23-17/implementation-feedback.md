# Minimal Use Case 实施反馈

## 2026-04-28：调查 / 扫描入口过度复杂

### 反馈

当前 MVP 主线中同时出现 `调查` 与 `扫描` 两类对象行动，玩家感知上二者职责过近，会增加不必要的选择负担。

针对最小验证，建议只保留 `调查` 作为主线信息获取入口，删除 MVP 主线对象上的 `扫描` 入口。

### 当前检查结论

当前没有发现只能依赖 `扫描` 才能推进的主线事件。

现有 mainline content 中，`scan` 基本作为 `survey` 的并列触发入口存在：

- 维修技术补学：`survey` 或 `scan` 均可触发。
- 罗塞塔语言学习：`survey` 或 `scan` 均可触发。
- 医疗文档补学：`survey` 或 `scan` 均可触发。
- 旧飞船折跃坐标：`survey` 或 `scan` 均可触发。
- 折跃仓终局事件：`survey` / `scan` / `build` / `extract` 均作为入口之一。

地图上存在少量只配置了 `scan` 的对象，例如 `mainline-basic-radar`，但当前它不是唯一主线推进入口；坠毁点三次调查已经承担雷达线索发放职责。

### 建议决策

下一步开发建议采用以下范围：

- 从 MVP 主线地图对象的 `candidateActions` 中移除 `scan`。
- 从 mainline 事件触发条件中移除 `payload.action_type = scan` 分支。
- 将相关 sample contexts / tests 改为 `survey`。
- 保留代码层全局 `scan` action、schema enum 与通用 handler，作为后续非 MVP 或信号/设备玩法的预留能力；本轮不做彻底删除。

### 不建议本轮做的事

不建议在下一步直接彻底删除全局 `scan` 功能，因为这会牵涉：

- `content/call-actions/object-actions.json`
- `content/schemas/maps.schema.json`
- `content/schemas/call-actions.schema.json`
- `apps/pc-client/src/content/contentData.ts` 类型定义
- `callActionSettlement.ts` handler 映射
- 既有测试与潜在非主线对象

对 MVP 验证而言，删除主线 content 中的 `scan` 入口已经足够降低复杂度。

### 验收标准建议

- 通话页中，主线知识 / 线索 / 坐标类对象只出现 `调查`，不再出现 `扫描`。
- `npm run validate:content` 通过。
- `npm run test` 通过。
- 主线仍可通过保底路线完成，不存在 scan-only 前置。
