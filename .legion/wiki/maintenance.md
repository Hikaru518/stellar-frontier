# Maintenance

## Yuan Host Production Hardening

Before any production dual-device deployment, add short-lived pairing token enforcement, TLS/WSS configuration, origin policy, rate limiting, metrics, abuse controls, deployment runbooks, and recovery guidance around the external Yuan Host.

## Yuan Tenant Follow-Up

在生产化 room -> Yuan host/tenant 映射前，必须核实 Yuan Host 的 ED25519 multi-tenancy 行为，尤其是 `apps/host/src/host-manager.ts` 中 `public_key` / `signature` 与 `host_id` 的最终取值是否符合预期。

## WebRTC Design

WebRTC DataChannel/TURN support remains delegated to Yuan and out of scope for the Rush + pnpm foundation. Production TURN/STUN and failure UX still need a separate deployment/design review before shipping.

## Yuan WebRTC Integration Test

当前 PR 已有本地 smoke 覆盖真实 Yuan `Terminal` + Yuan Host WSS 路由：PC/mobile 均开启 `enable_WebRTC: true`，手机心跳可让 PC 变为已连接，PC 私密来电可投递到手机，手机接听可回写 PC。尚未覆盖真实 DataChannel tunnel 断言。后续需要单独测试 harness：启动 Yuan Host，启动 PC/mobile 两个 Yuan Terminal，开启 WebRTC，观察 WSS signaling 后 DataChannel 成功升级与失败回退，最好直接读取 Yuan tunnel metrics 或暴露测试钩子。

## Yuan-Backed Business Layer RFC

后续 RFC 应聚焦 `基于 Yuan Host/Protocol 构建 Stellar 双设备业务层`，而不是替换或重做 Stellar 专属 server。RFC 至少覆盖：room 与 Yuan host/tenant 的映射、PC/mobile 作为 Yuan Terminal 的生命周期、`DualDeviceMessage` 到 `ITerminalMessage` 的映射、room-scoped token TTL、PC/phone role enforcement、first-phone lock、origin/rate-limit policy、service whitelist、Terminal discovery 限制、Yuan ED25519 multi-tenancy 当前实现核实、STUN/TURN 部署、WebRTC 失败 UX、以及手机端 browser bundle 成本。
