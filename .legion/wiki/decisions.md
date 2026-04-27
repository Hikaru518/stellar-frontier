# Decisions

## Rush + pnpm Monorepo

The repo is now organized as a Rush monorepo with `pnpmVersion` pinned in `rush.json`. Do not restore npm workspaces or root `package-lock.json`.

## Dual-Device Authority

The PC client remains the authoritative `GameState` owner. Mobile clients send typed companion events only; relay-server routes messages and does not own gameplay state.

## Mainland Hybrid Transport

For Mainland China, the baseline public transport is a paid domestic WSS relay. LAN WebSocket is preferred for same-network low latency. WebRTC DataChannel is later/opportunistic.
