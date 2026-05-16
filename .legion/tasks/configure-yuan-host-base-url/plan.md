# Configure Yuan Host Base URL

## Task Metadata

- **taskId**: `configure-yuan-host-base-url`
- **name**: Configure Yuan Host Base URL
- **status**: active
- **created**: 2026-05-16

## Goal

Make the PC pairing flow use `8.159.128.125` as the default Yuan Host base address so generated phone pairing URLs point at the reachable remote host unless an explicit environment override is provided.

## Problem

The current fallback derives Yuan Host from the PC page origin and port `8888`. That keeps local development convenient, but it can generate `localhost` or LAN-specific host URLs that are not usable by a real phone. The requested target IP should become the default host base for dual-device pairing while preserving the existing `VITE_YUAN_HOST_URL` override.

## Acceptance

- [ ] PC communication pairing uses `8.159.128.125` as the default Yuan Host base address.
- [ ] The resolved default full host URL is `ws://8.159.128.125:8888/`, matching the existing Yuan Host port convention.
- [ ] `VITE_YUAN_HOST_URL` still overrides the default without behavior changes.
- [ ] Mobile pairing URLs continue to carry the resolved `hostUrl` query parameter.
- [ ] No Stellar-owned relay/server is introduced and PC remains the authoritative game state owner.
- [ ] Required validation for touched PC client code passes or failures are recorded with cause.

## Assumptions

- Yuan Host is reachable at `8.159.128.125` on the existing WebSocket port `8888`.
- No TLS/domain requirement is part of this task; the default is plain `ws://`.
- Existing environment-specific deployments can continue to set `VITE_YUAN_HOST_URL` when they need a different scheme, port, or host.

## Constraints

- Keep the change small and scoped to Yuan Host URL resolution and directly related docs/tests.
- Do not change mobile authority, token, room, fallback, or WebRTC semantics.
- Do not add a Stellar backend or modify external Yuan Host deployment.
- Follow repo validation expectations for changes under `apps/pc-client/src`.

## Risks

- If the PC app is served over HTTPS, browsers may block a plain `ws://` endpoint as mixed content; WSS/TLS remains out of scope.
- If the Yuan Host process is not actually listening on `8.159.128.125:8888`, pairing will still render but runtime connection will fall back or fail.
- Hard-coding a remote default can make local-only development less isolated, but the existing env override can restore local host behavior.

## Scope

- Update PC-side Yuan Host default resolution.
- Update directly relevant tests or documentation if needed to make the default explicit.
- Record implementation, verification, review, walkthrough, and wiki writeback evidence in this task.

## Non-Goals

- Deploy or operate Yuan Host on the remote machine.
- Implement WSS/TLS, auth hardening, TURN/STUN, or Yuan tunnel observability.
- Redesign the pairing model or mobile companion UI.
- Change gameplay state ownership or content data.

## Design Summary

- Keep `VITE_YUAN_HOST_URL` as the highest-priority configuration source.
- Replace the origin-derived fallback with a fixed default remote Yuan Host URL based on `8.159.128.125` and the existing port `8888`.
- Preserve downstream pairing behavior by continuing to pass the resolved `hostUrl` into `createPairingSession` and generated mobile URLs.

## Phases

1. **Contract** - Materialize this task contract and checklist.
2. **Implementation** - Apply the minimal PC client URL-resolution change inside the required worktree/PR envelope.
3. **Verification** - Run required lint/test checks for touched surfaces and record evidence.
4. **Review** - Perform readiness review for scope, regressions, and security implications.
5. **Closeout** - Produce walkthrough and update Legion wiki with current task knowledge.
