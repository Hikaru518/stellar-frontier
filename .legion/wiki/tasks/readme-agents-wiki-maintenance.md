# Task Summary: README / AGENTS / Wiki Maintenance

## Status

PR #20 is open on branch `legion/readme-agents-wiki-maintenance-docs` based on latest `origin/main`. PR #16 has already merged, so this task is delivered through the new branch. `test-build` passed; `deploy` skipped as expected for PR. The PR remains open for review.

## Scope

- Root project context: `README.md`, `AGENTS.md`.
- Docs entry/wiki: `docs/index.md`, `docs/gameplay/dual-device-play/dual-device-play.md`.
- Legion wiki: decisions, maintenance, task summary.

## Key Decision

Document the distinction between `enable_WebRTC: true` and an observed DataChannel tunnel. Yuan WSS is the reliable baseline; WebRTC is an opportunistic upgrade that needs terminal info sync, outbound message-triggered offer/answer, successful ICE connectivity, and a connected peer before subsequent messages use DataChannel.

## Evidence

- Task contract: `.legion/tasks/readme-agents-wiki-maintenance/plan.md`
- Audit workspace: `docs/plans/audits/2026-04-28-16-21/`
- Dual-device wiki: `docs/gameplay/dual-device-play/dual-device-play.md`
