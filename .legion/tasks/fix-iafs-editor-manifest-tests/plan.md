# 修复 IAFS 分支 Editor Manifest 单测

## 目标

修复 PR #36 (`feature/iafs-crash-site-bootstrap`) 在 GitHub Actions `test-build` 中失败的 editor 单测。

## 问题陈述

CI 在 `npm run test` 阶段失败，失败项目为 `@stellar-frontier/editor`。日志显示 `contentStore.test.mjs` 仍假定第一个 event domain 是 `crash_site`，而当前分支 manifest 的首个 domain 已是 `iafs-inspection`；`generate-event-content-manifest.test.mjs` 的临时 fixture 也没有复制 manifest 所引用的内容文件，导致 manifest validation 报大量 missing file。

## 验收标准

- [ ] 修复 failing editor unit tests，不改变产品行为。
- [ ] `cd apps/editor && node ../../common/scripts/install-run-rushx.js test` 通过。
- [ ] `npm run test` 通过，或记录环境阻塞。
- [ ] PR #36 checks 通过或进入可审阅状态。

## 范围

- 仅修改 editor 测试或测试 fixture / helper。
- 不修改 runtime content 设计，不调整事件内容语义。

## 阶段

1. engineer: 最小修复单测。
2. verify-change: 记录验证结果。
3. review-change: 只读检查修复是否越界。
4. report / wiki: 轻量收口。
