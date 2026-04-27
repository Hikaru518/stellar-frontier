## Summary

- Convert the repo to a Rush + pnpm monorepo with PC, mobile, relay-server, and shared protocol projects.
- Add the first dual-device foundation: PC-authoritative terminal copy, mobile companion shell, shared protocol helpers, and relay room-broker skeleton.
- Update CI/docs for Rush-managed pnpm and the new PC app artifact path.

## Tests

- `node common/scripts/install-run-rush.js update`
- `node common/scripts/install-run-rush.js install`
- `node common/scripts/install-run-rush.js validate-content`
- `node common/scripts/install-run-rush.js lint`
- `node common/scripts/install-run-rush.js test`
- `node common/scripts/install-run-rush.js build`
- `node ../../common/scripts/install-run-rushx.js install:browsers` from `apps/pc-client`
- `node common/scripts/install-run-rush.js test:e2e --to @stellar-frontier/pc-client`

## Notes

- Relay production hardening and deployment are intentionally out of scope.
- PR should be reviewed but not merged automatically by this task.
