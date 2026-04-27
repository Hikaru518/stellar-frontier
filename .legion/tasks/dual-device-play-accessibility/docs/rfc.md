# RFC: Rush + pnpm Dual-Device Foundation

## Status

Accepted for implementation in this task.

## Decision

Adopt a Rush monorepo managed by pnpm and split the prototype into four projects:

- `apps/pc-client`: existing authoritative browser game.
- `apps/mobile-client`: browser companion terminal for private communications.
- `apps/relay-server`: minimal WSS/HTTP room broker for pairing and message forwarding.
- `packages/protocol`: shared dual-device transport, pairing, envelope, and fallback primitives.

Use a paid Mainland China WSS relay as the stable public baseline, LAN WebSocket as the preferred same-network low-latency path, and WebRTC DataChannel only as a later optimization.

## Rationale

Dual-device play needs independent deployables but a single shared contract. Rush + pnpm provides project boundaries, deterministic installs, and dependency graph builds without relying on npm workspaces. A shared protocol package prevents drift between PC, mobile, and relay.

For Mainland China, free overseas relay paths are likely to be less stable and less predictable. A domestic WSS relay is a pragmatic baseline for latency and availability, while LAN direct gives the best same-network experience without requiring production NAT traversal work in the first slice.

## Protocol Model

- PC owns authoritative `GameState` and exposes only approved phone-facing state.
- Phone sends typed messages such as read receipt, answer call, and choice selection.
- Relay validates message envelope shape and forwards within a room.
- All gameplay effects are still applied by the PC.
- Heartbeats and fallback timing let PC UI recover when phone disappears.

## Transport Priority

1. `lan-websocket`: lowest latency when phone and PC are on the same LAN.
2. `mainland-relay`: stable public baseline through a paid domestic WSS deployment.
3. `webrtc-datachannel`: later direct-data optimization after TURN/STUN design.
4. `offline`: PC fallback only.

## Implementation Boundary

This task implements the scaffold and validated message routing skeleton. It does not deploy a production relay, add auth hardening beyond in-memory room/client validation, or move game authority to the server.

## Validation

- Rush + pnpm install/update succeeds or any environment blocker is documented.
- `packages/protocol` tests cover transport selection, pairing code formatting, message validation, and fallback timing.
- `apps/mobile-client` tests cover terminal role and transport copy.
- `apps/relay-server` tests cover health/room behavior and invalid message rejection.
- Existing PC tests, content validation, and build continue to pass where feasible in the local environment.

## Rollback

The monorepo migration is structural. Rollback is possible by reverting the PR before merge. Runtime save data is unchanged because PC `localStorage` keys and gameplay state shape are not intentionally modified.
