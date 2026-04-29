# Audit Scope

## Selection

项目上下文 + 双设备 wiki。

## Reason

User requested a new task to maintain `README.md`, `AGENTS.md`, and wiki after the Yuan-backed dual-device implementation, and specifically asked why local testing does not visibly upgrade to WebRTC despite both terminals enabling WebRTC.

## Included Paths

- `README.md`
- `AGENTS.md`
- `docs/index.md`
- `docs/plans/2026-04-27-22-52/dual-device-play-design.md`
- `docs/plans/audits/2026-04-28-16-21/`
- `.legion/wiki/**`
- `.legion/tasks/readme-agents-wiki-maintenance/**`

## Excluded Paths

- `src` / `apps/**/src` production code changes
- `docs/core-ideas.md` changes without explicit human confirmation
- Full gameplay wiki/code consistency audit outside the dual-device/Yuan topic
