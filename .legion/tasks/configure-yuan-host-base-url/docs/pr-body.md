## Summary

- Set the PC Yuan Host fallback to `ws://8.159.128.125:8888/` while keeping `VITE_YUAN_HOST_URL` as an override.
- Added a focused resolver test for the remote default and local override behavior.
- Updated README dual-device setup notes for the new default and local Yuan Host workflow.

## Validation

- `npm run lint` PASS
- `node ../../common/scripts/install-run-rushx.js test src/yuanHostConfig.test.ts` PASS from `apps/pc-client`
- `node ../../common/scripts/install-run-rushx.js test --testTimeout=30000` PASS from `apps/pc-client` (`49` files / `422` tests)
- GitHub Actions `test-build` PASS on rerun for PR #55
- `git diff --check` PASS

## Caveat

- Local `npm run test` was executed but failed on variable existing PC client 5s Vitest timeouts. No assertion failure tied to this change was observed; the PC suite passed with a longer timeout and GitHub Actions passed the default CI unit-test step.

## Legion Evidence

- Plan: `.legion/tasks/configure-yuan-host-base-url/plan.md`
- Test report: `.legion/tasks/configure-yuan-host-base-url/docs/test-report.md`
- Review: `.legion/tasks/configure-yuan-host-base-url/docs/review-change.md`
- Walkthrough: `.legion/tasks/configure-yuan-host-base-url/docs/report-walkthrough.md`
