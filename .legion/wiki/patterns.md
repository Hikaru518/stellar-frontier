# Patterns

## Rush Commands

Use `node common/scripts/install-run-rush.js <command>` for repo-level Rush commands. Use `node ../../common/scripts/install-run-rushx.js <script>` from a project directory for project-local scripts.

## Content Validation

Keep `scripts/validate-content.mjs` as the stable root entrypoint. The actual validator can live inside a Rush project when it needs package-local dependencies such as Ajv.

## Playwright Browsers

Local Playwright browser downloads should use `common/temp/playwright-browsers` so large generated browser assets stay inside ignored repo temp space.
