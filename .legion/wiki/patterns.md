# Patterns

## Rush Commands

Use `node common/scripts/install-run-rush.js <command>` for repo-level Rush commands. Use `node ../../common/scripts/install-run-rushx.js <script>` from a project directory for project-local scripts.

## Content Validation

Keep `scripts/validate-content.mjs` as the stable root entrypoint. The actual validator can live inside a Rush project when it needs package-local dependencies such as Ajv.

## Playwright Browsers

Local Playwright browser downloads should use `common/temp/playwright-browsers` so large generated browser assets stay inside ignored repo temp space.

## Cross-Device Intent Validation

Treat phone-origin typed events as untrusted until they pass the PC boundary. Runtime gameplay commands must be validated before heartbeat/fallback state changes or gameplay dispatch, and tests should cover spoofed client IDs, replayed sequences, and any non-transport bypass path.

## Event Manifest Tests

Editor manifest tests should not hard-code legacy domain ordering or overwrite copied `content/` with a manifest that references files not present in the same fixture. Prefer either current manifest-driven assertions or fully self-contained manifest + asset fixtures.
