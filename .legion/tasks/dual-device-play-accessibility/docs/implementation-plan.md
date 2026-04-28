# Implementation Plan

1. Rebase the worktree on latest `origin/main` and resolve PC source/content migration conflicts.
2. Change `rush.json` from `npmVersion` to `pnpmVersion` and add Rush command-line commands.
3. Remove npm workspace coupling from the root `package.json`; keep root scripts as Rush wrappers.
4. Delete stale root `package-lock.json` and let Rush generate pnpm-managed common lock state.
5. Ensure app package scripts are project-local and do not call npm workspace commands.
6. Move the existing PC app under `apps/pc-client` and fix content import paths / Playwright dev server command.
7. Add `apps/mobile-client` as the browser companion terminal.
8. Replace the earlier generic protocol/server split with `packages/dual-device`, a shared PC/mobile business layer that maps Stellar typed events onto Yuan terminal messages.
9. Remove the Stellar-owned server scaffold; Yuan Host remains external infrastructure.
10. Add PC communication-station copy and controls for QR/manual pairing, Yuan Host connection info, private signal, and fallback.
11. Update GitHub Pages workflow to use Rush install/build and upload `apps/pc-client/dist`.
12. Run verification and record outcomes.
