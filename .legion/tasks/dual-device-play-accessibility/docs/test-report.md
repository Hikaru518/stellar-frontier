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

## Why These Commands

- Rush update/install proves the monorepo uses Rush-owned pnpm rather than npm workspaces and refreshes lock state after package topology changes.
- Content validation protects the existing data-driven game contract after moving the PC client.
- Lint/build cover TypeScript path migration, package boundaries, Vite app builds, and the shared dual-device package.
- Unit tests cover Yuan-backed transport selection, pairing/message validation, mobile terminal copy, existing PC behavior, Yuan terminal message mapping, and fallback timing.
- E2E protects the existing PC player flows after moving the app under `apps/pc-client`.

## Corrected During Verification

- Removed stale package topology references from Rush and regenerated pnpm lock state.
- Replaced `@stellar-frontier/protocol` imports/aliases with `@stellar-frontier/dual-device`.
- Removed the old server package from Rush commands and docs.
- Verified the PC and mobile clients consume Yuan Host connection metadata and Yuan terminal wire messages through the shared library.

## Skipped

- No production Yuan Host deployment was attempted; that is out of scope for this scaffold PR.
