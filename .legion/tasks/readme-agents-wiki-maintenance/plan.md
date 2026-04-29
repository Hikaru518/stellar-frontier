# README / AGENTS / Wiki Maintenance

## Goal

Synchronize the project-facing documentation after the dual-device Yuan integration so `README.md`, `AGENTS.md`, `docs/index.md`, and the Legion wiki accurately explain the current repo shape, local startup path, and Yuan/WebRTC behavior.

## Problem

PR #16 moved the project to a Rush + pnpm monorepo and replaced the dual-device scaffold with real Yuan `Terminal` integration. That PR is now merged into `origin/main`. The root docs and wiki need to be updated on a new branch so future agents and humans do not confuse `enable_WebRTC: true` with guaranteed DataChannel upgrade, or miss the PC/mobile/Yuan local setup requirements.

## Acceptance

- `README.md` documents current Rush scripts, PC/mobile dev ports, LAN mobile startup, Yuan Host requirement, and what the phone can do.
- `AGENTS.md` reflects the current monorepo layout, dual-device implementation state, validation commands, and Yuan/WebRTC boundaries.
- `docs/index.md` and relevant wiki/Legion wiki pages point to the current dual-device/Yuan docs without inventing gameplay rules.
- The docs explicitly explain why local testing may remain on WSS even when both terminals set `enable_WebRTC: true`.
- Changes are delivered through a new branch based on latest `origin/main`, because PR #16 has already merged.

## Scope

- Root project context: `README.md`, `AGENTS.md`.
- Docs entry/wiki layer: `docs/index.md`, relevant `docs/**` dual-device or project-index files if present, and `.legion/wiki/**` maintenance/task summaries.
- Task evidence under `.legion/tasks/readme-agents-wiki-maintenance/`.

## Non-Goals

- No gameplay code or transport code changes.
- No production Yuan Host deployment or TURN/STUN setup.
- No claim that WebRTC DataChannel is guaranteed in local tests.
- No full all-game wiki/code consistency audit beyond the project-context and dual-device/Yuan area selected by the user.

## Assumptions

- PR #16 is already merged; this documentation task uses `legion/readme-agents-wiki-maintenance-docs` from latest `origin/main`.
- PC remains authoritative; mobile is an optional companion terminal.
- Yuan WSS is the stable baseline; Yuan WebRTC DataChannel is opportunistic and observable only after tunnel setup succeeds.

## Constraints

- Preserve existing user-written rules in `AGENTS.md` unless directly contradicted by the current repo.
- Do not update `docs/core-ideas.md` without explicit human confirmation.
- Keep documentation self-contained; avoid relying only on external links for design intent.
- Use Rush commands for validation.

## Risks

- Documentation can overstate WebRTC readiness if it says `enable_WebRTC` means DataChannel is active.
- Replaying the docs changes from the old PR worktree can accidentally overwrite newer `origin/main` documentation; preserve newer main additions such as `communication-table`.

## Recommended Direction

Perform a focused project-context audit for dual-device/Yuan changes. Update README and AGENTS first, then docs/index/wiki references, then record verification and PR status in task docs.

## Phases

1. Materialize task contract and scope.
2. Inspect current README, AGENTS, docs index, and relevant wiki pages in PR #16.
3. Apply focused documentation updates for Rush/Yuan/WebRTC/local testing semantics.
4. Validate with docs sanity checks plus Rush lint/build where useful.
5. Update task evidence, commit, push PR #16, and follow checks.
