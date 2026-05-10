# Test Report: 修复 IAFS 分支 Editor Manifest 单测

## 验证目标

验证 PR #36 中 editor manifest 相关单测不再依赖旧 `crash_site` domain 顺序和过期 fixture 文件集合。

## Commands

- `npm run rush:update` — PASS
  - 原因: 新 worktree 初始缺少 Rush / pnpm link，首次 editor test 找不到 `vitest`。
- `cd apps/editor && node ../../common/scripts/install-run-rushx.js test` — PASS
  - 结果: 47 files / 251 tests passed。
- `npm run test` — PASS
  - 结果: 4 Rush projects passed。
- `npm run lint` — PASS
  - 结果: 4 Rush projects passed。
- `npm run validate:content` — PASS
- `npm run build` — PASS
  - 结果: 4 Rush projects passed。
- `git diff --check` — PASS

## 修复过的失败

- `contentStore.test.mjs` 原先硬编码 `library.domains[0]` 为 `crash_site`。当前分支 manifest 首个且唯一 domain 是 `iafs-inspection`，测试已改为按 `id` 查找当前 domain。
- `generate-event-content-manifest.test.mjs` 原先在复制当前 `content/` 后覆盖 manifest 为旧多 domain 列表，导致 manifest validation 报 missing old domain files 和 unregistered `iafs-inspection` files。测试已改为使用当前 branch 的真实 manifest/content fixture。

## 未执行

- `npm run test:e2e` 未执行；本次只修改 editor node-side unit tests，不涉及 PC 页面流、地图、通话或浏览器交互。

## 结论

PASS。已覆盖 CI 中失败的 `rush test` 路径，并额外跑过 lint、content validation 和 build。
