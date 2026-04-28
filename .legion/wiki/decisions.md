# Decisions

## Rush + pnpm Monorepo

The repo is now organized as a Rush monorepo with `pnpmVersion` pinned in `rush.json`. Do not restore npm workspaces or root `package-lock.json`.

## Dual-Device Authority

The PC client remains the authoritative `GameState` owner. Mobile clients send typed companion events only. No Stellar-owned server component owns gameplay state or routes product traffic in this PR.

## Yuan-Backed Dual-Device Layer

Stellar should not maintain a dedicated relay/server package for dual-device play. The correct boundary is `packages/dual-device`: a PC/mobile shared business abstraction over external Yuan Host/Protocol.

Yuan Host/Protocol owns terminal routing, WSS baseline, Host-mediated WebRTC offer/answer signaling, opportunistic DataChannel upgrade, and WebSocket fallback. Stellar owns room/tenant semantics, QR/manual payload, short token TTL, PC authority, first-phone policy, fallback UI, and the `DualDeviceMessage` product contract.

## Pairing Model

The current implementation follows `docs/plans/2026-04-27-22-52/dual-device-play-design.md` and the Yuan assessment: PC shows QR/manual-code pairing, pairing tokens expire, mobile reads URL parameters, and the shared library maps a Stellar room to Yuan host/tenant-oriented connection metadata.

## Yuan Protocol 评估

Yuan `@yuants/app-host` 与 `@yuants/protocol` 不是 Stellar 业务语义的裸 drop-in replacement，但它是推荐底层基础设施。PC/mobile 都应成为 Yuan Terminal，`DualDeviceMessage` 构建在 `ITerminalMessage` 之上，room 可优先映射到 Yuan host/tenant。后续生产化重点不是自研 relay，而是补齐 Stellar-specific QR/token/PC-first/first-phone-lock/fallback/game-state authority 业务语义和 Yuan tenant hardening。
