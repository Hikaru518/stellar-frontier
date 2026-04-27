# Decisions

## Rush + pnpm Monorepo

The repo is now organized as a Rush monorepo with `pnpmVersion` pinned in `rush.json`. Do not restore npm workspaces or root `package-lock.json`.

## Dual-Device Authority

The PC client remains the authoritative `GameState` owner. Mobile clients send typed companion events only; relay-server routes messages and does not own gameplay state.

## Dual-Device Pairing

The current implementation follows `docs/plans/2026-04-27-22-52/dual-device-play-design.md`: PC shows QR/manual-code pairing, pairing tokens expire, mobile reads URL parameters, and relay rooms are created by PC first, token-checked, and locked to the first phone.

## Mainland Hybrid Transport

For Mainland China, the baseline public transport is a paid domestic WSS relay. LAN WebSocket is preferred for same-network low latency. WebRTC DataChannel is later/opportunistic.
