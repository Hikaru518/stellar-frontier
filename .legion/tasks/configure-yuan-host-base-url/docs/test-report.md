# Test Report

## Summary

- Result: **pass**.
- The implementation-specific test passed.
- `npm run lint` passed for all Rush projects.
- The required `npm run test` command was executed locally and hit PC client 5s Vitest timeouts in unrelated existing tests, but GitHub Actions reran the full CI `test-build` job successfully, including `lint`, `validate-content`, unit tests, e2e tests, and build.
- Re-running the full PC client test suite locally with `--testTimeout=30000` passed all `422` PC tests, which indicates the local failures were timeout sensitivity rather than assertion failures from this change.

## Commands

| Command | Result | Notes |
| --- | --- | --- |
| `npm run lint` | PASS | Rush lint succeeded for editor, dual-device, mobile-client, and pc-client. |
| `npm run test` | FAIL | Editor, dual-device, and mobile-client passed. PC client failed on existing App/mapObjects tests timing out at Vitest's default `5000ms`; failing tests varied between runs. |
| `node ../../common/scripts/install-run-rushx.js test src/yuanHostConfig.test.ts` from `apps/pc-client` | PASS | Directly verifies `ws://8.159.128.125:8888/` default and `VITE_YUAN_HOST_URL` override behavior. |
| `node ../../common/scripts/install-run-rushx.js test --testTimeout=30000` from `apps/pc-client` | PASS | `49` test files and `422` tests passed with a longer timeout. |
| `git diff --check` | PASS | No whitespace errors. |
| GitHub Actions `test-build` rerun for PR #55 | PASS | Required check passed in `9m20s`; `deploy` is skipped for pull requests. |

## Failure Details

`npm run test` failed only in `@stellar-frontier/pc-client` due timeout, not due assertion mismatch:

- Run 1 timed out in `src/App.test.tsx > App > marks the opening Mike runtime call as answerable on the map crew card` and `src/validateContent.test.ts > validate-content map features > accepts legal passive and investigatable map features`.
- Run 2 timed out in `src/App.test.tsx > App > does not show the manual end-call control while an event call awaits a choice`, `src/App.test.tsx > App > opens the global debug toolbox from the floating entry`, and `src/content/mapObjects.test.ts > mapObjects content > rejects removed projection fields at the schema boundary`.

Because the failing tests changed between runs and the full PC client suite passed with `--testTimeout=30000`, this is recorded as local performance/timeout sensitivity rather than a functional regression from the Yuan Host URL change.

The GitHub Actions rerun passed the default CI unit-test step and e2e/build steps, so the local default-timeout caveat is considered resolved for PR readiness.

## Why These Commands

- `npm run lint` and `npm run test` are required by repo policy for `apps/pc-client/src` changes.
- The targeted `yuanHostConfig` test directly proves the changed URL-resolution claim with low noise.
- The longer-timeout PC test run checks that the default timeout failures do not hide assertion failures in PC client logic.
