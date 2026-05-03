---
date: 2026-04-30
---

# 研究主题

## 代码库探索

**需要探索**：了解 Demo 阶段已实现的内容与 initial.md 规格的差距。

具体目标：
- 检查已有文件（PhaserMapCanvas.tsx、phaserMapView.ts、PhaserMapPerformanceDemo.tsx 等）的实现现状
- 对比 initial.md 规格，找出已实现 vs 未实现的功能点
- 了解现有 MapPage.tsx 的结构与集成方式
- 检查 apps/pc-client/package.json 中的 Phaser 版本
- 了解现有测试文件覆盖情况

## 互联网研究

### 主题 A：Phaser 4 API 与 Phaser 3 的关键差异
- 原因：initial.md 依赖 Phaser 4（`~4.1.0`），确认关键 API（Camera、Tween、Scene、Input）在 Phaser 4 中的可用性和变化

### 主题 B：React + Phaser 集成最佳实践
- 原因：stateRef 桥接模式的行业惯例，避免闭包陷阱、性能问题

### 主题 C：游戏地图 UX 设计模式
- 原因：缩放/拖拽/Tooltip 的常见交互设计，验证 initial.md 的交互方案是否符合用户心智模型
