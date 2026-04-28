# Audit Report

## Result

Focused documentation audit completed.

## Findings

### D-1: Dual-device wiki target missing

- Source: `docs/plans/2026-04-27-22-52/dual-device-play-design.md`
- Target: `docs/gameplay/dual-device-play/dual-device-play.md`
- Finding: The design plan declared a target wiki, but the full wiki did not exist.
- Resolution: Created `docs/gameplay/dual-device-play/dual-device-play.md` from confirmed design material and current implementation truth.

### D-2: WebRTC enablement vs observed DataChannel unclear

- Source: `README.md`, `AGENTS.md`, `.legion/wiki/maintenance.md`
- Finding: Docs could imply that enabling WebRTC means local testing must visibly upgrade to DataChannel.
- Resolution: Added explicit explanation: WSS is baseline; DataChannel requires terminal info sync, outbound message-triggered offer/answer, ICE connectivity, and a connected peer before subsequent messages use WebRTC. Current UI does not read actual Yuan tunnel metrics.

### D-3: Save key stale in project context

- Source: `README.md`, `AGENTS.md`
- Finding: Project context still mentioned `stellar-frontier-save-v1`.
- Resolution: Updated to `stellar-frontier-save-v2`.

### D-4: Docs index missing dual-device system

- Source: `docs/index.md`
- Finding: Index listed gameplay systems but omitted the implemented dual-device play system.
- Resolution: Added dual-device row and coupling edges.

### D-5: Main branch communication-table wiki not indexed

- Source: `docs/gameplay/communication-table/communication-table.md`
- Finding: After moving the docs changes onto latest `origin/main`, the branch contained the communication-table wiki but `docs/index.md` and README's subsystem link list did not mention it.
- Resolution: Added communication-table entries while preserving the dual-device additions.

## Modified Files

- `README.md`
- `AGENTS.md`
- `docs/index.md`
- `docs/gameplay/dual-device-play/dual-device-play.md`
- `docs/plans/2026-04-27-22-52/dual-device-play-design.md`
- `docs/plans/2026-04-27-22-52/wiki-merge-diff.md`
- `.legion/wiki/index.md`
- `.legion/wiki/decisions.md`
- `.legion/wiki/maintenance.md`
- `.legion/wiki/tasks/readme-agents-wiki-maintenance.md`

## Backups

Backup files were omitted from the PR to keep the documentation branch focused. The canonical updated content is in the real files listed above, and the pre-change versions remain available through git history.

## Pending Code TODO

- Add a Yuan tunnel observability hook in `packages/dual-device` or PC/mobile UI so the app can show “DataChannel active” based on actual Yuan metrics instead of static transport candidates.
