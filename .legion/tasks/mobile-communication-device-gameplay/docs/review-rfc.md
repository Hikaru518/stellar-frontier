# Review RFC: mobile-communication-device-gameplay

> Review phase: `review-rfc`  
> Date: 2026-05-09  
> Scope reviewed: `research.md`, `rfc.md`, `implementation-plan.md`

## Decision

PASS

## Blocking findings

None.

The RFC is implementable, verifiable, and rollbackable for the stated task: mobile WeChat-like communication terminal replacing the PC Communication Station while active, with PC authority, `fallbackAfterMs`, global logger preservation, and no mobile movement map.

## Gate rationale

- **Implementability**: The RFC defines the core `phone.choice.select` payload contract, explicitly excludes mobile move intents, and requires PC-side validation before dispatch (`rfc.md` §5.2 lines 57-108; `implementation-plan.md` Milestone 1 lines 17-23).
- **Authority and logging**: The design keeps PC as the only authority and routes phone choices through a central dispatcher that preserves existing `player.call.choice` / `player.action.dispatch` logging (`rfc.md` §5.3 lines 110-114; §5.6 lines 130-136).
- **Fallback safety**: The RFC and plan specify active/fallback derivation, `fallbackAfterMs = 10000`, heartbeat handling, and station restoration (`rfc.md` §5.4-5.5 lines 116-128; `implementation-plan.md` Milestone 2 lines 46-52).
- **No mobile movement map**: Mobile `universal:move` is explicitly out of the payload contract and must only show a PC-flow prompt (`rfc.md` §5.2 lines 100-103; `implementation-plan.md` lines 18-20, 80-82).
- **Rollback**: The rollback plan restores the PC station, disables `phone.choice.select`, keeps heartbeat/read/answer, and requires no data migration (`rfc.md` §9 lines 184-192; `implementation-plan.md` Rollback Notes lines 33-35, 63-65, 94-95, 123-124).
- **Verification**: The plan names concrete unit/e2e checks for dispatcher logging, fallback restoration, illegal intent rejection, and movement-map preservation (`rfc.md` §8 lines 178-182; `implementation-plan.md` lines 24-31, 54-61, 84-93, 112-121).

## Non-blocking implementation notes

- The PC → phone view-model/message payloads are intentionally less formal than `phone.choice.select` (`rfc.md` §5.1 lines 52-54). This is acceptable for starting implementation, but Milestones 2-3 should keep those shapes versioned or locally typed enough for mobile tests.
- The proposed ack/reject reuse of `phone.message.delivered` may become semantically crowded (`rfc.md` §5.2 lines 105-108). The RFC already permits adding a typed message if needed, so this is not blocking.
