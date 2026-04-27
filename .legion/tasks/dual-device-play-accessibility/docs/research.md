# Research Notes

## Mainland China Network Direction

- Stable low-latency phone-PC pairing should not depend on free global relay services as the primary path.
- Recommended baseline is a paid Mainland China-hosted WSS relay close to the target users.
- LAN WebSocket should be preferred when phone and PC are on the same network because it avoids public relay latency.
- WebRTC DataChannel can be a later opportunistic optimization, but it adds NAT/TURN complexity and should not be the first production baseline.

## Monorepo Tooling Direction

- Rush supports `pnpmVersion` in `rush.json`; this lets Rush install and own the package manager version for deterministic repo operations.
- Rush custom bulk commands can expose project scripts such as `lint`, `test`, and `test:e2e` while respecting project dependency order.
- Rush global commands can keep repository-level operations such as content validation outside any one app package.

## Architecture Implications

- Shared protocol code belongs in a package, not duplicated across PC, phone, and relay.
- Relay should validate envelope shape and route messages, not own gameplay state.
- PC should keep fallback controls visible so phone disconnects do not block gameplay.
