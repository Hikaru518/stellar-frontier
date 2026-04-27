# RFC: Rush + pnpm Dual-Device Foundation

## Status

Accepted for implementation in this task.

## Decision

Use `docs/plans/2026-04-27-22-52/dual-device-play-design.md` as the design source for this task. Adopt a Rush monorepo managed by pnpm and split the prototype into four projects:

- `apps/pc-client`: existing authoritative browser game.
- `apps/mobile-client`: browser companion terminal for private communications.
- `apps/relay-server`: minimal WSS/HTTP room broker for pairing and message forwarding.
- `packages/protocol`: shared dual-device transport, pairing, envelope, and fallback primitives.

Use a paid Mainland China WSS relay as the stable public baseline, LAN/WebRTC as later low-latency optimization, and PC fallback as the safety rail. The first implementation should prove the P0 slice from the design doc: QR/manual-code entry, short-lived token, phone terminal status, private message/call typed events, and PC fallback while preserving PC authority.

## Rationale

Dual-device play needs independent deployables but a single shared contract. Rush + pnpm provides project boundaries, deterministic installs, and dependency graph builds without relying on npm workspaces. A shared protocol package prevents drift between PC, mobile, and relay.

For Mainland China, free overseas relay paths are likely to be less stable and less predictable. A domestic WSS relay is a pragmatic baseline for latency and availability, while LAN direct gives the best same-network experience without requiring production NAT traversal work in the first slice.

## Protocol Model

- PC owns authoritative `GameState` and exposes only approved phone-facing state.
- Phone sends typed messages such as read receipt, answer call, and choice selection.
- Relay validates message envelope shape, token, and one-phone room lock before forwarding within a room.
- All gameplay effects are still applied by the PC.
- Heartbeats and fallback timing let PC UI recover when phone disappears.

## MVP Slice

- PC Communication Station shows a phone terminal panel with QR code, short manual code, expiry text, relay URL, mobile URL, connection status, regenerate control, private signal send, and PC fallback.
- Mobile companion page reads QR/manual URL parameters, shows connection/code/room status, displays PC-authorized private signal content, and sends read/answer typed events with immediate local feedback.
- Relay-server keeps in-memory rooms only; PC must create the room first with a token, phone joins must match that token, and only the first phone is locked to the room.
- Protocol package owns session creation, URL construction, typed message creation/validation, transport selection, and fallback timing.

## Transport Priority

1. `lan-websocket`: lowest latency when phone and PC are on the same LAN.
2. `mainland-relay`: stable public baseline through a paid domestic WSS deployment.
3. `webrtc-datachannel`: later direct-data optimization after TURN/STUN design.
4. `offline`: PC fallback only.

## Implementation Boundary

This task implements the first browser-based foundation and visible P0 slice, not the complete production dual-device system. It does not deploy a production relay, add persistent auth, implement WebRTC/TURN, create long-lived cloud sessions, or move game authority to the server.

## Validation

- Rush + pnpm install/update succeeds or any environment blocker is documented.
- `packages/protocol` tests cover transport selection, pairing code formatting, pairing session URL construction, message creation/validation, and fallback timing.
- `apps/mobile-client` tests cover terminal role, transport copy, and QR/manual URL parameter rendering.
- `apps/relay-server` tests cover token-required join, PC-first room creation, one-phone lock, room behavior, and invalid message rejection.
- Existing PC tests, content validation, and build continue to pass where feasible in the local environment.

## Rollback

The monorepo migration is structural. Rollback is possible by reverting the PR before merge. Runtime save data is unchanged because PC `localStorage` keys and gameplay state shape are not intentionally modified.
