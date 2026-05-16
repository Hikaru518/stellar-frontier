# Report Walkthrough

## Mode

Implementation.

## Summary

- Changed PC Yuan Host default resolution to `ws://8.159.128.125:8888/`.
- Preserved `VITE_YUAN_HOST_URL` as the highest-priority override.
- Updated README dual-device setup notes to document the remote default and the local override path.
- Added a focused PC client test for default and override URL resolution.

## Files To Review

- `apps/pc-client/src/yuanHostConfig.ts` - Defines the remote default URL and override resolver.
- `apps/pc-client/src/yuanHostConfig.test.ts` - Verifies default and override behavior.
- `apps/pc-client/src/App.tsx` - Uses the resolver when creating phone terminal pairing sessions.
- `README.md` - Documents default remote Yuan Host URL and local override usage.
- `.legion/tasks/configure-yuan-host-base-url/**` - Task contract, verification, and review evidence.

## Verification Evidence

- `npm run lint` passed.
- `node ../../common/scripts/install-run-rushx.js test src/yuanHostConfig.test.ts` passed from `apps/pc-client`.
- `node ../../common/scripts/install-run-rushx.js test --testTimeout=30000` passed from `apps/pc-client` with `49` files and `422` tests.
- GitHub Actions `test-build` rerun passed for PR #55.
- `git diff --check` passed.

## Caveat

`npm run test` was executed locally and failed only because `@stellar-frontier/pc-client` hit variable existing 5s Vitest timeouts. The longer-timeout PC suite passed, and GitHub Actions passed the default CI unit-test step, so this is recorded as local timeout sensitivity rather than a regression from this change.

## Review Result

`docs/review-change.md` records PASS with a security lens. The accepted residual risk is using plain `ws://8.159.128.125:8888/`; WSS/TLS and Yuan Host hardening are out of scope.
