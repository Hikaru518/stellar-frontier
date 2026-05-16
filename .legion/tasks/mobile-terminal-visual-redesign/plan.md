# Mobile Terminal Visual Redesign

## Name

Mobile Terminal Visual Redesign

## Task ID

`mobile-terminal-visual-redesign`

## Goal

Redesign the mobile companion terminal so it visually matches the existing Stellar Frontier UI direction: low-fidelity frontier-console software, text-first communication, restrained color, visible system status, and dense but readable panels.

## Problem

The current mobile terminal already supports the gameplay communication slice, but its presentation still feels like a generic dark chat surface. It needs to feel like the same rough base software described in `docs/ui-designs/ui-design-principles.md` without changing the mobile feature set or the PC-authoritative gameplay model.

## Acceptance

- The mobile client reads as a compact frontier communication console rather than a generic chat app.
- The UI preserves the existing functional design: pairing status, emergency call panel, thread list, selected conversation, structured options, pending choice feedback, task summary, recent events, and Yuan link status remain available.
- Existing mobile event handlers, Yuan pairing flow, heartbeat/read/answer/choice intents, payload validation, and PC authority semantics are not intentionally changed.
- The layout works on phone-width screens and remains usable on wider browser windows.
- The visual language follows the existing UI design docs: text-first, low decoration, panel borders, restrained status colors, monospace telemetry, immediate textual feedback.
- Mobile client lint and tests pass, or any environment blocker is recorded with the command that failed.

## Assumptions

- The latest `origin/main` version of `apps/mobile-client` already contains the intended mobile gameplay communication behavior.
- This task may rewrite `MobileTerminalApp.tsx` markup and class names to support the new visual hierarchy, as confirmed by the user, as long as behavior and protocol semantics remain equivalent.
- `docs/ui-designs/ui-design-principles.md` and `docs/ui-designs/ui.md` are the design source of truth for the visual direction.
- The base branch for delivery is `origin/main`.

## Constraints

- Use the Legion worktree/PR lifecycle from `.worktrees/mobile-terminal-visual-redesign`.
- Do not modify PC gameplay, shared dual-device protocol, content data, or runtime gameplay rules unless a compile/test failure proves a minimal mechanical change is required.
- Do not introduce a new mobile feature, new command path, new message type, mobile map flow, or new persistence behavior.
- Keep all durable task evidence under `.legion/tasks/mobile-terminal-visual-redesign/`.

## Risks

- A visual rewrite can accidentally change button availability, event handlers, or selected-thread behavior.
- Dense console styling can reduce mobile readability if spacing, tap targets, or line wrapping are not checked.
- Tests may not cover visual regressions, so at least one browser/manual responsive check is needed in addition to automated tests if feasible.

## Scope

- `apps/mobile-client/src/MobileTerminalApp.tsx`: markup/class hierarchy for the same mobile terminal states and actions.
- `apps/mobile-client/src/styles.css`: visual system, responsive layout, panel treatment, status colors, typography, and tap target styling.
- `apps/mobile-client/src/MobileTerminalApp.test.tsx`: update only if tests depend on accessible labels or text hierarchy that intentionally remains equivalent.
- `.legion/tasks/mobile-terminal-visual-redesign/docs/`: verification, review, walkthrough, and PR body evidence.

## Non-Goals

- No changes to PC client behavior or PC communication station active/fallback rules.
- No changes to `packages/dual-device` typed event contracts, Yuan transport selection, or payload validation.
- No new mobile gameplay capabilities beyond the existing message list, emergency call, structured choices, read/answer, task summary, recent events, and link status.
- No content JSON, schema, map, crew, item, or event changes.
- No attempt to solve production Yuan Host deployment, auth hardening, STUN/TURN, or real-time transport observability beyond the existing UI copy.

## Design Summary

- Treat the phone as a handheld extension of the base console: a signal dossier, message switchboard, and telemetry card stack.
- Replace generic chat visual language with bordered panels, terminal labels, compact status chips, monospace codes, and restrained green/amber/red status accents.
- Keep every important state visible as text, not icon-only decoration.
- Prefer resilient CSS and native HTML controls over animation-heavy or image-heavy styling.

## Phases

1. Stabilize contract and open isolated worktree from latest `origin/main`.
2. Implement the mobile visual rewrite within the existing functional boundary.
3. Run mobile lint/test and a responsive browser check where feasible.
4. Record verification, readiness review, walkthrough, and Legion wiki writeback.
5. Commit, rebase on `origin/main`, push branch, open/update PR, attempt auto-merge, and follow checks/review to terminal state or documented blocker.

---

Created: 2026-05-16
