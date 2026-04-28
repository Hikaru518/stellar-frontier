# Maintenance

## Yuan Host Production Hardening

Before any production dual-device deployment, add short-lived pairing token enforcement, TLS/WSS configuration, origin policy, rate limiting, metrics, abuse controls, deployment runbooks, and recovery guidance around the external Yuan Host.

## Yuan Tenant Follow-Up

在生产化 room -> Yuan host/tenant 映射前，必须核实 Yuan Host 的 ED25519 multi-tenancy 行为，尤其是 `apps/host/src/host-manager.ts` 中 `public_key` / `signature` 与 `host_id` 的最终取值是否符合预期。

## WebRTC Design

WebRTC DataChannel/TURN support remains delegated to Yuan and out of scope for the Rush + pnpm foundation. Production TURN/STUN and failure UX still need a separate deployment/design review before shipping.

## Yuan-Backed Business Layer RFC

后续 RFC 应聚焦 `基于 Yuan Host/Protocol 构建 Stellar 双设备业务层`，而不是替换或重做 Stellar 专属 server。RFC 至少覆盖：room 与 Yuan host/tenant 的映射、PC/mobile 作为 Yuan Terminal 的生命周期、`DualDeviceMessage` 到 `ITerminalMessage` 的映射、room-scoped token TTL、PC/phone role enforcement、first-phone lock、origin/rate-limit policy、service whitelist、Terminal discovery 限制、Yuan ED25519 multi-tenancy 当前实现核实、STUN/TURN 部署、WebRTC 失败 UX、以及手机端 browser bundle 成本。
