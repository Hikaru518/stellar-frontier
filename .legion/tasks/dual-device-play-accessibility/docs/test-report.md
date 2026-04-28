# Test Report

## Result

PASS

## Commands

- `node common/scripts/install-run-rush.js update`: pass, refreshed pnpm lock and Rush repo state after removing the server/protocol projects and adding `packages/dual-device`.
- `node common/scripts/install-run-rush.js install`: pass, verified pnpm lock install with Rush-owned pnpm 10.33.1.
- `node common/scripts/install-run-rush.js validate-content`: pass, content schemas and references valid.
- `node common/scripts/install-run-rush.js lint`: pass, all three Rush projects type-check.
- `node common/scripts/install-run-rush.js test`: pass, dual-device, PC, and mobile unit/component tests pass.
- `node common/scripts/install-run-rush.js build`: pass, dual-device dist, PC Vite build, and mobile Vite build pass.
- `node common/scripts/install-run-rush.js test:e2e --to @stellar-frontier/pc-client`: pass, PC Playwright suite passed.
- `CI=1 node common/scripts/install-run-rush.js test:e2e --to @stellar-frontier/pc-client`: pass, CI-style PC Playwright suite passed.
- Re-run after realtime-link demo and WebRTC/WSS copy fixes: `lint`, `test`, `build`, normal PC E2E, and CI-style PC E2E all passed.
- Re-run after real Yuan Terminal integration: `rush update`, `lint`, `test`, `build`, normal PC E2E, and CI-style PC E2E passed. Vite build emits Yuan dependency warnings for node-only modules externalized in browser bundles, but the browser smoke test loads and runs.
- Local real-Yuan smoke: pass. Started local Yuan Host from `/Users/c1/Work/Yuan/apps/host/lib/cli.js`, started PC/mobile Vite apps, opened both with Playwright, verified phone connects, PC private call reaches phone, and phone answer reaches PC.

## Why These Commands

- Rush update/install proves the monorepo uses Rush-owned pnpm rather than npm workspaces and refreshes lock state after package topology changes.
- Content validation protects the existing data-driven game contract after moving the PC client.
- Lint/build cover TypeScript path migration, package boundaries, Vite app builds, and the shared dual-device package.
- Unit tests cover Yuan-backed transport selection, pairing/message validation, mobile terminal copy, existing PC behavior, Yuan terminal message mapping, Terminal lease behavior by construction, and fallback timing.
- E2E protects the existing PC player flows after moving the app under `apps/pc-client` and now asserts that the UI presents WebRTC as a LAN upgrade and Yuan WSS as the public fallback.
- The local smoke test covers the real Yuan Terminal WSS business path across PC and mobile.

## Corrected During Verification

- Removed stale package topology references from Rush and regenerated pnpm lock state.
- Replaced `@stellar-frontier/protocol` imports/aliases with `@stellar-frontier/dual-device`.
- Removed the old server package from Rush commands and docs.
- Verified the PC and mobile clients consume Yuan Host connection metadata and Yuan terminal wire messages through the shared library.
- Replaced raw browser WebSocket business messaging with real `@yuants/protocol` `Terminal`, `server.provideService`, and `client.requestByMessage` on both PC and mobile.
- Added a short delayed Terminal lease/cache so React dev StrictMode does not double-connect the same `terminal_id` and trigger Yuan Host replacement cleanup.
- Added Vite `define.global = globalThis` for PC/mobile so Yuan's browser dependency chain can run in Vite.

## Skipped

- No production Yuan Host deployment was attempted; that is out of scope for this scaffold PR.
- The local real-Yuan smoke verifies real Terminal/WSS routing and PC/mobile typed-event delivery, but it does not assert that Yuan upgraded a message onto the WebRTC DataChannel. That still needs a dedicated harness or Yuan-level metric/assertion for DataChannel tunnel use.
