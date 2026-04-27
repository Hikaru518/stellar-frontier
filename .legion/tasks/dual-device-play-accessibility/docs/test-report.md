# Test Report

## Result

PASS

## Commands

- `node common/scripts/install-run-rush.js update`: pass, generated Rush scripts and pnpm lock with `pnpmVersion` 10.33.1.
- `node common/scripts/install-run-rush.js install`: pass, verified pnpm lock install.
- `node common/scripts/install-run-rush.js validate-content`: pass, content schemas and references valid.
- `node common/scripts/install-run-rush.js lint`: pass, all four Rush projects type-check.
- `node common/scripts/install-run-rush.js test`: pass, protocol, PC, mobile, and relay tests pass.
- `node common/scripts/install-run-rush.js build`: pass, protocol dist, PC Vite build, mobile Vite build, and relay-server build pass.
- `node common/scripts/install-run-rush.js rebuild`: pass, forced all four Rush projects to rebuild after QR/pairing changes.
- `node ../../common/scripts/install-run-rushx.js install:browsers` from `apps/pc-client`: pass, installed Chromium into `common/temp/playwright-browsers`.
- `node common/scripts/install-run-rush.js test:e2e --to @stellar-frontier/pc-client`: pass, PC Playwright suite passed.
- `CI=1 node common/scripts/install-run-rush.js test:e2e --to @stellar-frontier/pc-client`: pass after replacing the Playwright webServer command with direct `vite --host 127.0.0.1`.
- Re-run after importing `docs/plans/2026-04-27-22-52/*` and implementing QR/manual pairing, token-locked relay, mobile URL entry, private signal, and PC fallback: pass.

## Why These Commands

- Rush update/install proves the monorepo uses Rush-owned pnpm rather than npm workspaces.
- Content validation protects the existing data-driven game contract after moving the PC client.
- Lint/build cover TypeScript path migration, package boundaries, Vite app builds, and relay-server Node output.
- Unit tests cover protocol selection, pairing/message validation, mobile terminal copy, existing PC behavior, and relay room routing.
- Additional unit tests cover pairing session URL construction, mobile QR/manual URL rendering, relay token validation, PC-first room creation, and one-phone lock.
- E2E protects the existing PC player flows after moving the app under `apps/pc-client`.

## Corrected During Verification

- Changed local workspace dependencies to `workspace:*` so Rush/pnpm links `@stellar-frontier/protocol` instead of trying the npm registry.
- Removed root `type: module` because Rush generated scripts are CommonJS.
- Moved the real content validator under `apps/pc-client/scripts` so Ajv resolves from a Rush project package; kept `scripts/validate-content.mjs` as a compatibility wrapper.
- Added a repo-local Playwright browser path under `common/temp/playwright-browsers` for local E2E runs.
- Avoided nested Rush inside Playwright webServer startup; CI should start Vite directly from the PC project.
- Added real QR generation through `qrcode` and refreshed the Rush pnpm lock.

## Skipped

- No production relay deployment was attempted; that is out of scope for this scaffold PR.
