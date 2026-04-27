# Implementation Plan

1. Change `rush.json` from `npmVersion` to `pnpmVersion` and add Rush command-line commands.
2. Remove npm workspace coupling from the root `package.json`; keep root scripts as Rush wrappers.
3. Delete stale root `package-lock.json` and let Rush generate pnpm-managed common lock state.
4. Ensure app package scripts are project-local and do not call npm workspace commands.
5. Add relay-server package, source, tests, and TypeScript config.
6. Fix PC content import paths and Playwright dev server command after moving under `apps/pc-client`.
7. Add PC communication-station copy for the phone terminal strategy.
8. Update GitHub Pages workflow to use Rush install/build and upload `apps/pc-client/dist`.
9. Run verification and record outcomes.
