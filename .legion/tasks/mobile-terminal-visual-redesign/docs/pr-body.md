## Summary

- Redesigns the mobile companion terminal as a low-fidelity frontier communication console matching the existing UI design principles.
- Keeps the existing mobile gameplay and Yuan communication semantics intact: pairing, message threads, emergency call actions, structured choices, pending ack display, and PC-authoritative settlement copy remain available.
- Adds scoped mobile verification evidence and responsive screenshots under the Legion task docs.

## Verification

- `npm run rush:update`
- `cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js lint`
- `cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js test`
- Chromium responsive smoke check at `390x844` and `900x900` with no horizontal overflow

## Notes

- Scope is limited to `apps/mobile-client/src` plus Legion evidence.
- Per user request, do not merge this PR and do not enable auto-merge.
