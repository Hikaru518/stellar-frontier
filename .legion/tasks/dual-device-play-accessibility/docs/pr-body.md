## Summary

- Convert the repo to a Rush + pnpm monorepo with PC, mobile, and shared `packages/dual-device` projects.
- Add the first dual-device foundation from `docs/plans/2026-04-27-22-52/dual-device-play-design.md`: QR/manual-code pairing, token expiry, mobile companion shell, private signal read/answer events, PC fallback, and Yuan Host connection metadata.
- Remove the Stellar-owned server scaffold; PC and mobile now instantiate real Yuan `Terminal`s and exchange Stellar typed events through Yuan services while Yuan Host remains external infrastructure.
- Improve the realtime connection demo and clarify transport semantics: WebRTC is the LAN upgrade path; Yuan WSS is the public fallback.
- Update CI/docs for Rush-managed pnpm and the new PC app artifact path.

## Tests

- `node common/scripts/install-run-rush.js update`
- `node common/scripts/install-run-rush.js install`
- `node common/scripts/install-run-rush.js validate-content`
- `node common/scripts/install-run-rush.js lint`
- `node common/scripts/install-run-rush.js test`
- `node common/scripts/install-run-rush.js build`
- `node common/scripts/install-run-rush.js test:e2e --to @stellar-frontier/pc-client`
- `CI=1 node common/scripts/install-run-rush.js test:e2e --to @stellar-frontier/pc-client`
- Local real-Yuan smoke: Yuan Host + PC Vite + mobile Vite + Playwright two-page flow passed.

Note: the local smoke covers real Yuan Terminal WSS routing and PC/mobile typed-event delivery. It does not yet assert that Yuan upgraded a message onto the WebRTC DataChannel.

## Notes

- Yuan Host production deployment and hardening are intentionally out of scope.
- PR should be reviewed but not merged automatically by this task.
