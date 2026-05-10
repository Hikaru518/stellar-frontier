# Review Change: fix-iafs-editor-manifest-tests

## Decision

PASS

## Blocking findings

None.

## Scope compliance

- Reviewed `plan.md`, `docs/test-report.md`, and the git diff.
- Changed files are limited to editor unit tests:
  - `apps/editor/helper/contentStore.test.mjs`
  - `apps/editor/scripts/generate-event-content-manifest.test.mjs`
- No runtime content, product behavior, schemas, or application code were changed.

## Correctness and maintainability

- `contentStore.test.mjs` now locates the `iafs-inspection` domain by id instead of relying on the old `crash_site` first-domain assumption, matching the PR branch manifest.
- `generate-event-content-manifest.test.mjs` now uses the branch's actual copied `content/` fixture instead of overriding the manifest with stale domains whose referenced files are absent.
- The changes are minimal and directly target the CI failures described in the task.

## Verification evidence reviewed

From `docs/test-report.md`:

- `cd apps/editor && node ../../common/scripts/install-run-rushx.js test` — PASS
- `npm run test` — PASS
- `npm run lint` — PASS
- `npm run validate:content` — PASS
- `npm run build` — PASS
- `git diff --check` — PASS

`npm run test:e2e` was not run; this is acceptable because the diff only touches node-side editor unit tests and does not affect PC UI or browser flows.

## Security lens

Security review was not triggered: the diff only updates tests/fixtures and does not touch auth, permissions, secrets, protocol/trust boundaries, user-controlled privileged paths, privacy, or tenant isolation.
