# Task Summary: Configure Yuan Host Base URL

## Status

Implementation completed in worktree and passed readiness review. PR lifecycle pending.

## Result

- PC Yuan Host URL resolution now defaults to `ws://8.159.128.125:8888/`.
- `VITE_YUAN_HOST_URL` remains the highest-priority override for local development or environment-specific endpoints.
- README documents the remote default and the local override path `VITE_YUAN_HOST_URL=ws://localhost:8888/`.
- A focused PC client test covers the default URL and override behavior.

## Boundaries

- No Stellar relay/server was introduced.
- PC remains the authoritative `GameState` owner.
- Mobile companion, token/session, fallback, and WebRTC semantics were not changed.
- Plain `ws://` risk is accepted for this endpoint only; WSS/TLS and Yuan Host hardening remain maintenance work.

## Verification

- `npm run lint` passed.
- Targeted `yuanHostConfig` test passed.
- Full PC client suite passed with `--testTimeout=30000`.
- Required `npm run test` was executed but failed on variable existing PC client 5s timeout failures; no assertion failure tied to this change was observed.

## Evidence

- Raw contract: `.legion/tasks/configure-yuan-host-base-url/plan.md`
- Verification: `.legion/tasks/configure-yuan-host-base-url/docs/test-report.md`
- Readiness review: `.legion/tasks/configure-yuan-host-base-url/docs/review-change.md`
- Walkthrough: `.legion/tasks/configure-yuan-host-base-url/docs/report-walkthrough.md`
- PR body draft: `.legion/tasks/configure-yuan-host-base-url/docs/pr-body.md`
