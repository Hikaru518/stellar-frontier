# Wiki Log

## 2026-04-28

- Added Rush + pnpm monorepo, PC-authoritative dual-device, and Mainland hybrid transport decisions.
- Added reusable Rush command, content validation, and Playwright browser-cache patterns.
- Added maintenance notes for Yuan Host hardening and future WebRTC deployment design.
- 将 Yuan protocol relay assessment 改为中文调研页，并明确结论：不维护 Stellar 专属 server，推荐在 Yuan Host/Protocol 之上构建 PC/mobile 共享业务层。
- 根据用户澄清更新 Yuan 结论：PC/mobile 都作为 Yuan Terminal，room 可优先映射到 Yuan host/tenant，`DualDeviceMessage` 构建在 `ITerminalMessage` 上。
- 将 task wiki 改为当前架构：`packages/dual-device` + 外部 Yuan Host，而不是 repo 内 server app。
