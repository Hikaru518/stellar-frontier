# Scan Summary

## Scope

Focused project-context and dual-device/Yuan audit. User selected “项目上下文 + 双设备 wiki”.

## README

- Already documents Rush + pnpm, PC/mobile dev scripts, ports, local Yuan Host path, and mobile LAN URL.
- Needed clearer caveat that `enable_WebRTC: true` does not prove DataChannel usage.
- Save key still mentioned `stellar-frontier-save-v1`; current tests/code use `stellar-frontier-save-v2`.

## AGENTS

- Already documents Rush + pnpm and mobile private terminal foundation.
- Needed update from “Yuan message mapping / external WebRTC” wording to real Yuan Terminal integration.
- Needed add `dual-device-play` to wiki list and clarify WebRTC observability limits.
- Save key still mentioned `stellar-frontier-save-v1`; current tests/code use `stellar-frontier-save-v2`.

## Docs Index

- Listed four gameplay wikis and omitted dual-device full wiki.
- Needed a dual-device system row and coupling links from event/private message flow to dual-device.
- Latest `origin/main` also contains `docs/gameplay/communication-table/communication-table.md`; the focused docs update preserves that wiki by adding it to the subsystem index and README link list.

## Dual-Device Wiki

- `docs/plans/2026-04-27-22-52/dual-device-play-design.md` existed with `target_wiki`, but the target wiki file did not exist.
- Created `docs/gameplay/dual-device-play/dual-device-play.md` from the design plan and current Yuan-backed implementation.

## Legion Wiki

- Decisions and maintenance already recorded Yuan Host / WSS / WebRTC semantics.
- Needed explicit note that UI currently does not read actual Yuan tunnel metrics, so local “no WebRTC” observations can be UI/observability rather than transport failure.
