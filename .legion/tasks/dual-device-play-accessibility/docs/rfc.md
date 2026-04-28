# RFC: Rush + pnpm Yuan-Backed Dual-Device Foundation

## Status

Accepted for implementation in this task; supersedes the earlier Stellar-owned WSS broker scaffold.

## Decision

Use `docs/plans/2026-04-27-22-52/dual-device-play-design.md` as the original gameplay design source and `.legion/wiki/research/yuan-protocol-relay-assessment.md` as the current network architecture source. Adopt a Rush monorepo managed by pnpm and split the prototype into three Stellar-owned projects:

- `apps/pc-client`: existing authoritative browser game.
- `apps/mobile-client`: browser companion terminal for private communications.
- `packages/dual-device`: PC/mobile shared business abstraction for pairing, token TTL, typed events, Yuan terminal message mapping, and fallback rules.

Do not keep a Stellar-owned server package in this PR. The network substrate is an external Yuan Host: Yuan provides terminal routing, WSS baseline, WebRTC offer/answer signaling, opportunistic DataChannel upgrade, and WebSocket fallback. Stellar provides only the business layer on top: room/tenant semantics, QR payloads, first-phone policy, PC authority, and `DualDeviceMessage` product contract.

## Rationale

Dual-device play needs independent deployables but a single shared contract. Rush + pnpm provides project boundaries, deterministic installs, and dependency graph builds without relying on npm workspaces. A shared dual-device package prevents drift between PC and mobile while avoiding a third Stellar-owned runtime service.

Yuan is a better long-term substrate than a custom relay because it already owns the generic hard parts: Terminal identity/routing, Host-mediated signaling, WebRTC DataChannel upgrade, and WSS fallback. Stellar should not duplicate that layer. The correct boundary is a shared library that maps Stellar's product semantics onto Yuan's generic `ITerminalMessage` envelope.

## Business Layer Model

- PC owns authoritative `GameState` and exposes only approved phone-facing state.
- Phone sends typed messages such as read receipt, answer call, and choice selection.
- A Stellar room maps to a Yuan host/tenant boundary for the single-player MVP.
- QR/manual payload carries Yuan Host URL, tenant/public key, room id, short token, PC terminal id, phone terminal id, pairing code, and expiry.
- `DualDeviceMessage` remains the product contract and is carried inside Yuan `ITerminalMessage.req` or `event.payload`.
- All gameplay effects are still applied by the PC.
- Heartbeats and fallback timing let PC UI recover when phone disappears.

## MVP Slice

- PC Communication Station shows a phone terminal panel with QR code, short manual code, expiry text, Yuan Host URL, tenant id, mobile URL, connection status, regenerate control, private signal send, and PC fallback.
- Mobile companion page reads QR/manual URL parameters, shows connection/code/room status, displays PC-authorized private signal content, and sends read/answer typed events with immediate local feedback.
- Shared library owns session creation, mobile URL construction, Yuan Host connection URL construction, typed message creation/validation, Yuan terminal message wrapping, wire encode/decode, transport selection, and fallback timing.

## Transport Priority

1. `yuan-webrtc-datachannel`: opportunistic low-latency path after Yuan's WSS-mediated signaling succeeds.
2. `yuan-wss`: stable public baseline through Yuan Host and fallback path when WebRTC is unavailable.
3. `offline`: PC fallback only.

## Implementation Boundary

This task implements the first browser-based foundation and visible P0 slice, not the complete production dual-device system. It does not deploy Yuan Host, implement Yuan internally, add persistent auth, configure production TURN/STUN, create long-lived cloud sessions, or move game authority away from the PC.

## Validation

- Rush + pnpm install/update succeeds or any environment blocker is documented.
- `packages/dual-device` tests cover transport selection, pairing code formatting, pairing session URL construction, Yuan Host connection URLs, `DualDeviceMessage` creation/validation, Yuan terminal message wrapping, wire encode/decode, and fallback timing.
- `apps/mobile-client` tests cover terminal role, transport copy, and QR/manual URL parameter rendering.
- Existing PC tests, content validation, e2e checks, and build continue to pass where feasible in the local environment.

## Rollback

The monorepo migration is structural. Rollback is possible by reverting the PR before merge. Runtime save data is unchanged because PC `localStorage` keys and gameplay state shape are not intentionally modified.

## Follow-Up

- Verify Yuan Host ED25519 multi-tenancy behavior before production room/tenant mapping.
- Decide whether room equals tenant for all future modes or only for single-player dual-device MVP.
- Specify service whitelist and Terminal discovery restrictions so the phone only sees dual-device capabilities.
