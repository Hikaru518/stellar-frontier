# 手机通讯终端融入 Gameplay

## 目标

实现手机 WeChat-like 通讯终端作为 PC 通讯台的 active-mode 替代入口，同时保持 PC 权威状态、PC fallback、现有移动选点流程和全局游戏日志。

## 问题陈述

当前 mobile-client 仅支持心跳、已读、接听和测试私密信号，不能承接正式 gameplay 通讯。需要让手机显示消息列表、联系人、会话、来电、结构化回复、任务摘要、近期事件和连接状态，并把手机选择作为 intent 回传给 PC 中央 dispatcher 结算。

## 验收标准

- [ ] 手机端提供消息列表优先的通讯终端 UI。
- [ ] 手机可展示普通消息 / 紧急来电，并发送结构化 `phone.choice.select` intent。
- [ ] PC 端校验手机 intent，通过中央 dispatcher 结算 RuntimeCall 选项和调查 / 待命 / 停止等非移动行动。
- [ ] 手机提交的玩家指令保留现有全局日志：`player.call.choice`、`player.action.dispatch`。
- [ ] 手机 active 时 PC 主通讯台入口隐藏或禁用，并显示通讯状态卡；fallback 后恢复入口。
- [ ] 移动仍沿用 PC 通话 / 地图候选选点 / 通讯确认流程，不在手机端实现地图移动。
- [ ] 相关 lint / test 通过，或记录环境阻塞。

## 假设 / 约束 / 风险

- **假设**: 现有 Yuan / dual-device typed event 链路可承载 `phone.choice.select`。
- **约束**: PC 是唯一权威 GameState；手机只提交 intent，不直接写状态。
- **约束**: `fallbackAfterMs` MVP 默认 `10000ms`；`mobile_weak` 不进入本轮。
- **约束**: 不改 `content/`；不做自由文本、OS push、多手机、手机背包、手机地图。
- **风险**: 隐藏 PC 通讯台后 fallback 若失效会卡死玩家；实现必须优先保证 PC fallback。
- **风险**: 手机 intent 若绕过 PC dispatcher 会破坏日志、事件结算和状态一致性。

## 要点

- **RFC 决策**: Option A，手机完整替代通讯台 UI，PC dispatcher bridge 保持权威与日志。
- **移动边界**: 不实现手机移动地图；移动仍走 PC 现有候选选点流程。
- **Rollback**: 关闭 mobile active 替代逻辑并停止处理 `phone.choice.select`，PC 通讯台可恢复为唯一入口。

## 范围

- `packages/dual-device/src` - phone intent payload / guards / tests。
- `apps/mobile-client/src` - WeChat-like mobile terminal UI 和 intent submission。
- `apps/pc-client/src` - PC mobile session、fallback UI、dispatcher bridge、logger-preserving phone intent settlement。
- `.legion/tasks/mobile-communication-device-gameplay/docs/` - RFC、review、验证和交付证据。

## 设计索引 (Design Index)

> **Design Source of Truth**: `.legion/tasks/mobile-communication-device-gameplay/docs/rfc.md`

**摘要**:
- 核心流程: 手机 active 后作为通讯入口；PC 隐藏主通讯台入口但保留状态卡；手机 intent 经 PC dispatcher 结算；fallback 后 PC 恢复通讯台。
- 验证策略: 包级 dual-device / mobile / pc lint+test，必要时根级 lint/test/e2e。

## 阶段概览

1. **spec-rfc** - 已完成 RFC / implementation plan。
2. **review-rfc** - 已 PASS。
3. **engineer** - 当前阶段，实现限定范围内代码。
4. **verify-change / review-change / report / wiki** - 实现后按 Legion 继续。

---
*Created: 2026-05-09 | Updated: 2026-05-09*
