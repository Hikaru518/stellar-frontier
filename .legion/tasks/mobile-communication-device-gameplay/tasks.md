# 手机通讯终端融入 Gameplay - 任务清单

## 快速恢复

**当前阶段**: engineer
**当前检查项**: 实现 Milestone 1-3 核心路径
**进度**: 2/6 阶段完成

---

## 阶段 1: Design Gate ✅ COMPLETE
- [x] spec-rfc | 验收: `docs/rfc.md` 与 `docs/implementation-plan.md` 已生成
- [x] review-rfc | 验收: `docs/review-rfc.md` PASS

## 阶段 2: Engineer ✅ COMPLETE
- [x] 实现 dual-device phone intent contract | 验收: payload guard 测试覆盖合法 / 非法 intent
- [x] 实现 PC dispatcher bridge | 验收: phone RuntimeCall/basic action 复用 PC 结算与 logger
- [x] 实现 PC active/fallback UI | 验收: active 隐藏 station，fallback 恢复
- [x] 实现 mobile message-list-first UI | 验收: 手机可展示线程、紧急来电、结构化选项并提交 intent

## 阶段 3: Closing 🟡 IN PROGRESS
- [x] verify-change | 验收: 测试报告写入
- [x] review-change | 验收: readiness review 通过
- [x] report-walkthrough | 验收: reviewer-facing summary 写入
- [x] legion-wiki | 验收: 当前任务知识写回

## 阶段 4: PR Lifecycle 🟡 IN PROGRESS
- [ ] commit | 验收: scope 内变更已提交到 worktree 分支
- [ ] rebase + push | 验收: 基于最新 `origin/main` 推送 PR 分支
- [ ] open PR / follow checks | 验收: PR 创建，auto-merge 尝试，checks/review 跟进
