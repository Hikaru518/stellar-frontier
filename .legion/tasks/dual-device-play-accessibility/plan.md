# Dual-Device Play Accessibility

## Goal

Build the first deployable dual-device foundation for Stellar Frontier: the PC client remains the authoritative game surface, while a phone can act as a private companion communication terminal. The repository should be reshaped into a Rush + pnpm monorepo so the PC client, mobile client, and shared dual-device business library can evolve together.

Design source: `docs/plans/2026-04-27-22-52/dual-device-play-design.md`, plus the Yuan assessment in `.legion/wiki/research/yuan-protocol-relay-assessment.md`.

## Problem

The current prototype is a single browser app. Dual-device play needs separate PC/mobile deliverables with a shared business contract, plus a transport path that works reliably in Mainland China. We no longer want a Stellar-owned server component; Yuan Host/Protocol should provide terminal routing, WSS baseline, WebRTC signaling, DataChannel upgrade, and fallback.

## Acceptance

- The repository is configured as a Rush monorepo using `pnpmVersion`, not npm workspaces.
- The existing game is preserved as `apps/pc-client` and continues to pass its relevant tests.
- A new `apps/mobile-client` provides a responsive companion-terminal shell that states its PC-authoritative role.
- A new `packages/dual-device` owns PC/mobile shared business primitives: room/tenant pairing, QR payloads, short token TTL, typed messages, Yuan `ITerminalMessage` mapping, and fallback rules.
- No Stellar-owned relay/server package remains in this PR; Yuan Host is treated as external infrastructure.
- PC shows QR/manual-code pairing with expiry and fallback controls based on the design plan's P0 slice.
- Mobile reads pairing URL parameters, renders connection status, and can send read/answer typed events for a private signal.
- CI and root scripts use Rush-oriented commands and pnpm-managed dependency installation.
- Content validation and existing game behavior are not intentionally changed.
- Delivery is via a PR from an isolated worktree branch; the PR must not be merged by this task.

## Scope

- Monorepo structure: `apps/pc-client`, `apps/mobile-client`, `packages/dual-device`.
- Rush + pnpm configuration, common dependency preferences, and command-line commands for build/lint/test/content validation.
- Shared dual-device helpers and tests for transport priority, pairing sessions, mobile URLs, Yuan Host connection URLs, `DualDeviceMessage` creation/validation, `ITerminalMessage` wrapping, wire encode/decode, and fallback timing.
- Mobile shell and tests showing waiting-for-pairing, QR/manual URL entry, recommended Yuan transport, and PC-authoritative constraints.
- PC communication-station pairing/fallback/private-signal affordance without moving authority off the PC.
- Documentation that the actual Host/Terminal/WebRTC infrastructure is supplied by Yuan, not by a Stellar server app.

## Non-Goals

- No production Yuan Host deployment in this PR.
- No embedded Yuan implementation or local fork of Yuan in this repository.
- No STUN/TURN production configuration beyond documenting it as later/opportunistic through Yuan.
- No cross-device persistence or server-owned game-state authority.
- No gameplay rule rewrite, content schema rewrite, or map/direct-command change.
- No mobile-native app packaging; this is a browser companion client.

## Assumptions

- PC remains the sole authoritative `GameState` owner.
- Phone sends typed intents only; PC validates and applies any gameplay effect.
- PC and mobile will both become Yuan Terminals in the future production path.
- A Stellar room maps to a Yuan host/tenant boundary for the single-player dual-device MVP.
- Yuan WSS is the stable public baseline; Yuan WebRTC DataChannel is the opportunistic low-latency upgrade.
- The repo base branch is `origin/main`.
- Node version remains aligned with the existing `.nvmrc` / Vite requirements.

## Constraints

- Use Rush with pnpm, not npm workspaces.
- Keep runtime content data under `content/`; do not move game content into code.
- Preserve current browser-only localStorage behavior for PC game saves.
- Keep implementation bounded to scaffold/business abstraction/visibility; avoid pretending Yuan production deployment is complete.
- Use the Legion worktree/PR envelope and do not merge the PR.

## Risks

- Monorepo migration can break relative content imports, Playwright paths, or CI artifact paths.
- Rush + pnpm can expose phantom dependency assumptions that npm previously tolerated.
- Yuan `apps/host` ED25519 multi-tenancy needs follow-up verification before production room/tenant mapping.
- The shared library can be mistaken for complete networking if readiness notes are unclear; this PR only wraps business semantics and wire mapping.

## Recommended Direction

Use a Rush + pnpm monorepo with a shared `packages/dual-device` business library. Ship the first dual-device slice as a structural and protocol foundation: PC UI surfaces the terminal strategy, mobile renders a companion shell, and the shared library maps Stellar typed events onto Yuan terminal messages. Do not maintain a Stellar relay server; use Yuan Host as the external WSS/WebRTC substrate.

## Phases

1. Stabilize task contract and RFC for Rush + pnpm Yuan-backed dual-device architecture.
2. Implement monorepo structure, shared dual-device library, mobile shell, and PC affordance.
3. Remove the Stellar-owned relay server scaffold and update CI/root commands/docs.
4. Run content validation, lint, tests, and build where feasible; document any environmental blockers.
5. Produce review/walkthrough evidence, commit, rebase, push, and update PR without merging.
