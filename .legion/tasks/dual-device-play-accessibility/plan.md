# Dual-Device Play Accessibility

## Goal

Build the first deployable dual-device foundation for Stellar Frontier: the PC client remains the authoritative game surface, while a phone can act as a private companion communication terminal. The repository should be reshaped into a Rush + pnpm monorepo so the PC client, mobile client, relay server, and shared protocol can evolve together.

Design source: `docs/plans/2026-04-27-22-52/dual-device-play-design.md`, copied into this worktree from the main workspace after it was found as an untracked docs plan.

## Problem

The current prototype is a single browser app. Dual-device play needs separate deliverables with a shared protocol boundary, plus a network path that works reliably in Mainland China. Free global relay choices are not the priority; stable low-latency domestic connectivity is.

## Acceptance

- The repository is configured as a Rush monorepo using `pnpmVersion`, not npm workspaces.
- The existing game is preserved as `apps/pc-client` and continues to pass its relevant tests.
- A new `apps/mobile-client` provides a responsive companion-terminal shell that states its PC-authoritative role.
- A new `apps/relay-server` provides a minimal WSS/HTTP room broker skeleton for PC-phone pairing and message forwarding.
- A new `packages/protocol` owns shared dual-device transport, pairing, and typed message primitives.
- PC shows QR/manual-code pairing with expiry and fallback controls based on the design plan's P0 slice.
- Mobile reads pairing URL parameters, renders connection status, and can send read/answer typed events for a private signal.
- Relay enforces PC-first room creation, token match, and one-phone room lock in memory.
- CI and root scripts use Rush-oriented commands and pnpm-managed dependency installation.
- Content validation and existing game behavior are not intentionally changed.
- Delivery is via a PR from an isolated worktree branch; the PR must not be merged by this task.

## Scope

- Monorepo structure: `apps/pc-client`, `apps/mobile-client`, `apps/relay-server`, `packages/protocol`.
- Rush + pnpm configuration, common dependency preferences, and command-line commands for build/lint/test/content validation.
- Protocol helpers and tests for transport priority, pairing sessions, URLs, typed message envelopes, and fallback timing.
- Mobile shell and tests showing waiting-for-pairing, QR/manual URL entry, recommended transport, and PC-authoritative constraints.
- Relay skeleton with token-checked room join, first-phone lock, heartbeat, typed message validation, and room broadcast behavior.
- PC communication-station pairing/fallback/private-signal affordance without moving authority off the PC.

## Non-Goals

- No full production deployment to a Mainland cloud provider in this PR.
- No WebRTC TURN/STUN implementation beyond documenting it as later/opportunistic.
- No cross-device persistence or server-owned game-state authority.
- No gameplay rule rewrite, content schema rewrite, or map/direct-command change.
- No mobile-native app packaging; this is a browser companion client.

## Assumptions

- PC remains the sole authoritative `GameState` owner.
- Phone sends typed intents only; PC validates and applies any gameplay effect.
- The baseline public path is a paid Mainland China WSS relay; LAN WebSocket is preferred when available on the same network.
- The repo base branch is `origin/main`.
- Node version remains aligned with the existing `.nvmrc` / Vite requirements.

## Constraints

- Use Rush with pnpm, not npm workspaces.
- Keep runtime content data under `content/`; do not move game content into code.
- Preserve current browser-only localStorage behavior for PC game saves.
- Keep implementation bounded to scaffold/protocol/visibility; avoid pretending the relay is production hardened.
- Use the Legion worktree/PR envelope and do not merge the PR.

## Risks

- Monorepo migration can break relative content imports, Playwright paths, or CI artifact paths.
- Rush + pnpm can expose phantom dependency assumptions that npm previously tolerated.
- Relay skeleton can be mistaken for production-ready infrastructure if readiness notes are unclear.
- Local environment may lack global pnpm; Rush should own pnpm installation.

## Recommended Direction

Use a Rush + pnpm monorepo with a small shared protocol package. Ship the first dual-device slice as a structural and protocol foundation: PC UI surfaces the terminal strategy, mobile renders a companion shell, and relay-server provides a validated WSS broker skeleton. For Mainland China stability, document the paid domestic WSS relay as baseline and LAN direct as best-effort lower-latency path.

## Phases

1. Stabilize task contract and RFC for Rush + pnpm dual-device architecture.
2. Implement monorepo structure, shared protocol, mobile shell, relay skeleton, and PC affordance.
3. Update CI/root commands and docs for Rush + pnpm workflows.
4. Run content validation, lint, tests, and build where feasible; document any environmental blockers.
5. Produce review/walkthrough evidence, commit, rebase, push, and open PR without merging.
