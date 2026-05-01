/**
 * BroadcastChannel name shared by all tabs that participate in the logger
 * holder election (ADR-008).
 */
export const LOGGER_CHANNEL = "stellar-frontier-logger";

/** Heartbeat cadence emitted by the current holder (ms). */
export const HEARTBEAT_INTERVAL_MS = 1000;

/** Window during which a `claim` waits for an existing holder to respond (ms). */
export const CLAIM_GRACE_MS = 200;

/** After this idle window the previous holder is considered gone (ms). */
export const HOLDER_TIMEOUT_MS = 2500;

/**
 * Messages exchanged on the logger BroadcastChannel during holder election
 * and heartbeat. Discriminated by `kind`.
 */
export type LoggerBroadcastMessage =
  | { kind: "claim"; tabId: string; ts: number }
  | { kind: "held"; tabId: string; ts: number }
  | { kind: "yield"; tabId: string; ts: number };
