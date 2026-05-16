# Test Report

## Scope

Task: `mobile-terminal-visual-redesign`

Changed surface: `apps/mobile-client/src/MobileTerminalApp.tsx`, `apps/mobile-client/src/styles.css`, and mobile app tests.

The task is a visual-language rewrite of the mobile client. The credible verification path is mobile package type checking, mobile package unit tests, and a browser responsive smoke check for phone and wide viewports.

## Commands

### Dependency Preparation

Command:

```bash
npm run rush:update
```

Result: PASS.

Reason: the isolated worktree did not have Rush/pnpm dependencies installed. Initial parallel lint/test attempts raced on `common/temp`, so dependencies were installed once before rerunning package checks.

### Mobile Lint

Command:

```bash
cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js lint
```

Result: PASS.

Evidence: `tsc --noEmit` completed successfully.

Reason: the JSX rewrite changed markup, helper return types, and test imports; TypeScript lint is the direct check for accidental type or API breakage.

### Mobile Unit Tests

Command:

```bash
cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js test
```

Result: PASS.

Evidence: `2 passed (2)` test files, `3 passed (3)` tests.

Reason: the existing mobile tests cover empty state, Yuan transport text, PC-authoritative copy, message-list presence, absence of demo content, and QR/manual URL pairing params. Tests were updated only where visual markup split old single-line text into label/value regions.

### Responsive Browser Smoke Check

Preparation:

```bash
cd apps/mobile-client && node ../../common/scripts/install-run-rushx.js dev --host 127.0.0.1 --port 5174
```

Check command:

```bash
cd apps/pc-client && node --input-type=module -e "import { chromium } from '@playwright/test'; const browser = await chromium.launch({ channel: 'chrome', headless: true }); const checks = []; for (const viewport of [{ width: 390, height: 844, name: 'mobile' }, { width: 900, height: 900, name: 'wide' }]) { const page = await browser.newPage({ viewport }); await page.goto('http://127.0.0.1:5174', { waitUntil: 'networkidle' }); const result = await page.evaluate(() => ({ title: document.querySelector('h1')?.textContent?.trim(), modules: document.querySelectorAll('.terminal-module').length, hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth, heroBorder: getComputedStyle(document.querySelector('.terminal-hero')).borderColor })); await page.screenshot({ path: '../../.legion/tasks/mobile-terminal-visual-redesign/docs/' + viewport.name + '-terminal.png', fullPage: true }); checks.push({ viewport, result }); await page.close(); } await browser.close(); console.log(JSON.stringify(checks, null, 2));"
```

Result: PASS.

Evidence:

```json
[
  {
    "viewport": { "width": 390, "height": 844, "name": "mobile" },
    "result": {
      "title": "等待配对",
      "modules": 3,
      "hasHorizontalOverflow": false,
      "heroBorder": "rgba(154, 146, 113, 0.72)"
    }
  },
  {
    "viewport": { "width": 900, "height": 900, "name": "wide" },
    "result": {
      "title": "等待配对",
      "modules": 3,
      "hasHorizontalOverflow": false,
      "heroBorder": "rgba(154, 146, 113, 0.72)"
    }
  }
]
```

Artifacts:

- `.legion/tasks/mobile-terminal-visual-redesign/docs/mobile-terminal.png`
- `.legion/tasks/mobile-terminal-visual-redesign/docs/wide-terminal.png`

Reason: visual and responsive changes cannot be fully proven by unit tests. The smoke check verifies that the rewritten interface renders in Chromium, exposes the expected title and modules, and has no horizontal overflow at representative phone and wide viewport sizes.

## Initial Failures and Resolutions

- First parallel lint/test attempt failed because Rush dependency installation raced on `common/temp`. Resolution: ran `npm run rush:update`, then reran checks.
- First mobile test run after JSX rewrite failed because tests expected old single-line text (`公网兜底`, `短码 ABCDEF`) while the UI now renders label/value regions. Resolution: updated tests to query multiple visible transport mentions and pair-code label/value inside `aria-label="配对状态摘要"`.
- `playwright-cli` global command was unavailable. Resolution: used the repository Playwright dependency with system Chrome.
- Bundled Playwright Chromium was not installed. Resolution: used `chromium.launch({ channel: 'chrome' })`, which was available in this environment.

## Skipped

- Full root `npm run lint`, `npm run test`, `npm run build`, and PC e2e were not run because the code change is isolated to `apps/mobile-client/src` and does not modify PC client, shared dual-device contracts, content, schema, Rush config, or gameplay behavior.

## Verdict

PASS for the scoped mobile visual rewrite.
