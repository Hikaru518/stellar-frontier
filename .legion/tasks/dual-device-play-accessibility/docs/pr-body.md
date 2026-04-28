## Summary

- Convert the repo to a Rush + pnpm monorepo with PC, mobile, and shared `packages/dual-device` projects.
- Add the first dual-device foundation from `docs/plans/2026-04-27-22-52/dual-device-play-design.md`: QR/manual-code pairing, token expiry, mobile companion shell, private signal read/answer events, PC fallback, and Yuan Host connection metadata.
- Remove the Stellar-owned server scaffold; the shared library maps Stellar typed events onto Yuan terminal messages while Yuan Host remains external infrastructure.
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

## Notes

- Yuan Host production deployment and hardening are intentionally out of scope.
- PR should be reviewed but not merged automatically by this task.
