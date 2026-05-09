## Summary

- 修复 PR #36 中 editor manifest 相关单测对旧 `crash_site` domain 顺序与过期 fixture 的依赖。
- 改动仅限 editor test / fixture 逻辑；未修改 production code、runtime content、schema 或产品行为。

## Tests

- `cd apps/editor && node ../../common/scripts/install-run-rushx.js test` — PASS（47 files / 251 tests passed）
- `npm run test` — PASS（4 Rush projects passed）
- `npm run lint` — PASS（4 Rush projects passed）
- `npm run validate:content` — PASS
- `npm run build` — PASS（4 Rush projects passed）
- `git diff --check` — PASS

未运行 `npm run test:e2e`：本次只修改 editor node-side unit tests，不涉及 PC UI / browser flows。

## Review Notes

- `contentStore.test.mjs` 改为按 `iafs-inspection` id 查找当前 domain，不再依赖第一个 domain 是 `crash_site`。
- `generate-event-content-manifest.test.mjs` 改为使用当前 branch 的真实 copied `content/` fixture，避免旧 manifest 引用缺失文件。
- review-change 结论：PASS，无 blocking findings；安全审查未触发。

## Legion Evidence

- `.legion/tasks/fix-iafs-editor-manifest-tests/plan.md`
- `.legion/tasks/fix-iafs-editor-manifest-tests/docs/test-report.md`
- `.legion/tasks/fix-iafs-editor-manifest-tests/docs/review-change.md`
- `.legion/tasks/fix-iafs-editor-manifest-tests/docs/report-walkthrough.md`

> 用途：更新现有 PR #36（`feature/iafs-crash-site-bootstrap`），如可行不新开 main PR。
