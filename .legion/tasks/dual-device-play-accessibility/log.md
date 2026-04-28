# Log

## 2026-04-28

- Created worktree `.worktrees/dual-device-play-accessibility` from `origin/main` and branch `legion/dual-device-play-accessibility-cn-relay`.
- Confirmed user preference: use Rush + pnpm, prioritize Mainland China stability and latency over free-only relay choices, create PR but do not merge.
- Started monorepo migration and discovered the initial task docs were not persisted after context compression; reconstructed the task contract in this directory.
- Implemented initial Rush + pnpm monorepo structure, shared protocol draft, mobile companion shell, temporary relay scaffold, PC communication-station affordance, and Rush-based CI/docs updates.
- Verification passed: Rush update/install, content validation, lint, unit tests, build, Playwright browser install to repo temp, and PC E2E.
- Review evidence written: `docs/review-rfc.md`, `docs/test-report.md`, `docs/review-change.md`, `docs/report-walkthrough.md`, and `docs/pr-body.md`.
- After PR check failure, reproduced CI-style E2E locally with `CI=1`; fixed Playwright webServer startup by using direct `vite --host 127.0.0.1` instead of nested `rushx dev`.
- Found prior untracked design docs in main workspace at `docs/plans/2026-04-27-22-52/` and copied them into the worktree.
- Updated RFC and implementation to align with that plan's P0 slice: PC QR/manual-code pairing, short-lived token, mobile URL entry, private signal read/answer events, PC fallback, and relay token/first-phone lock.
- Rebased the PR worktree on latest `origin/main` and resolved conflicts from the new call action/content additions into `apps/pc-client`.
- Revised the architecture after Yuan discussion: Stellar no longer keeps a dedicated server component; `packages/dual-device` becomes the PC/mobile shared business layer over external Yuan Host/Protocol.
- Final validation after the Yuan-backed refactor passed: Rush update/install, content validation, lint, unit tests, build, normal PC E2E, and CI-style PC E2E.
- Committed `af6499e` (`refactor: 改为 Yuan 双设备业务层`), rebased on latest `origin/main`, force-with-lease pushed the PR branch after history rewrite, and updated PR #16 body.
- PR #16 check status after update: `test-build` passed; `deploy` skipped as expected for PR. Auto-merge/merge intentionally not enabled because this task's delivery constraint is to update the PR without merging.
- Fixed transport presentation after review: WebRTC is now shown as the LAN upgrade path, Yuan WSS as the public fallback. Added a more visual realtime-link demo on PC/mobile and E2E assertions for that UI. Actual Yuan Terminal `enableWebRTC=true` DataChannel handshake remains a future integration harness.
