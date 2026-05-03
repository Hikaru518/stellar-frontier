import {
  CLAIM_GRACE_MS,
  HEARTBEAT_INTERVAL_MS,
  HOLDER_TIMEOUT_MS,
  type LoggerBroadcastMessage,
} from "./broadcast-protocol";

export type WriterRole = "writer" | "reader" | "pending";

/**
 * Minimal subset of `BroadcastChannel` the election needs. Defining our own
 * structural type lets tests inject an in-memory broker and lets the facade
 * (TASK-015) decide how to construct the real channel.
 */
export interface BroadcastChannelLike {
  postMessage(message: LoggerBroadcastMessage): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<LoggerBroadcastMessage>) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent<LoggerBroadcastMessage>) => void,
  ): void;
  close(): void;
}

export interface WriterElectionOptions {
  channel: BroadcastChannelLike;
  /** Stable per-tab id; recommend `crypto.randomUUID()`. Used as tie-breaker. */
  tabId: string;
  intervalMs?: number;
  claimGraceMs?: number;
  holderTimeoutMs?: number;
  /** Time source; defaults to `Date.now`. Tests inject a deterministic clock. */
  now?: () => number;
}

export interface WriterElection {
  start(): void;
  stop(): void;
  getRole(): WriterRole;
  /** Returns an idempotent unsubscribe. Listener exceptions are isolated. */
  onRoleChange(listener: (role: WriterRole) => void): () => void;
}

/**
 * Multi-tab writer election state machine (ADR-008).
 *
 * Roles: `pending` (claim in flight) → `writer` (heartbeating holder) or
 * `reader` (observed an existing holder).
 *
 * The module is intentionally pure: it never closes the injected channel and
 * never touches the global `BroadcastChannel` constructor. The TASK-015 facade
 * is responsible for construction, fallback, and lifecycle.
 */
export function createWriterElection(
  options: WriterElectionOptions,
): WriterElection {
  const channel = options.channel;
  const tabId = options.tabId;
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const claimGraceMs = options.claimGraceMs ?? CLAIM_GRACE_MS;
  const holderTimeoutMs = options.holderTimeoutMs ?? HOLDER_TIMEOUT_MS;
  const nowFn = options.now ?? ((): number => Date.now());

  let role: WriterRole = "pending";
  let started = false;

  let claimGraceTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let holderTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  let lastClaimTs = 0;

  const listeners: Array<(r: WriterRole) => void> = [];

  function clearClaimGrace(): void {
    if (claimGraceTimer != null) {
      clearTimeout(claimGraceTimer);
      claimGraceTimer = null;
    }
  }

  function clearHeartbeat(): void {
    if (heartbeatTimer != null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function clearHolderTimeout(): void {
    if (holderTimeoutTimer != null) {
      clearTimeout(holderTimeoutTimer);
      holderTimeoutTimer = null;
    }
  }

  function clearAllTimers(): void {
    clearClaimGrace();
    clearHeartbeat();
    clearHolderTimeout();
  }

  function notifyRole(next: WriterRole): void {
    for (const listener of listeners.slice()) {
      try {
        listener(next);
      } catch {
        // Per-listener isolation: a misbehaving subscriber never blocks others.
      }
    }
  }

  function setRole(next: WriterRole): void {
    if (role === next) return;
    role = next;
    notifyRole(next);
  }

  function safePost(message: LoggerBroadcastMessage): void {
    try {
      channel.postMessage(message);
    } catch {
      // BroadcastChannel.postMessage failures are benign here: the timer-driven
      // state machine still advances. Surfacing the error would only force the
      // facade to handle something it cannot fix.
    }
  }

  function postClaim(): void {
    const ts = nowFn();
    lastClaimTs = ts;
    safePost({ kind: "claim", tabId, ts });
  }

  function postHeld(): void {
    safePost({ kind: "held", tabId, ts: nowFn() });
  }

  function postYield(): void {
    safePost({ kind: "yield", tabId, ts: nowFn() });
  }

  function startClaimCycle(): void {
    clearAllTimers();
    setRole("pending");
    postClaim();
    claimGraceTimer = setTimeout(() => {
      claimGraceTimer = null;
      // Still pending after the grace window → no existing holder responded.
      // Promote ourselves and start heartbeating.
      if (role === "pending") {
        becomeWriter();
      }
    }, claimGraceMs);
  }

  function becomeWriter(): void {
    clearClaimGrace();
    clearHolderTimeout();
    setRole("writer");
    // Send an immediate `held` so peers in their claim grace see us right away.
    postHeld();
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      postHeld();
    }, intervalMs);
  }

  function becomeReader(): void {
    clearClaimGrace();
    clearHeartbeat();
    setRole("reader");
    armHolderTimeout();
  }

  function armHolderTimeout(): void {
    clearHolderTimeout();
    holderTimeoutTimer = setTimeout(() => {
      holderTimeoutTimer = null;
      // Holder went silent → re-enter the election.
      startClaimCycle();
    }, holderTimeoutMs);
  }

  function onMessage(event: MessageEvent<LoggerBroadcastMessage>): void {
    const msg = event.data;
    if (msg == null || msg.tabId === tabId) return;

    if (msg.kind === "held") {
      // A peer asserts they hold the writer role.
      if (role === "pending") {
        // Only honor `held` messages emitted at-or-after our last claim.
        if (msg.ts >= lastClaimTs) {
          becomeReader();
        }
        return;
      }
      if (role === "writer") {
        // Conflict: both believe we're writer. Lexicographic tie-break.
        if (msg.tabId > tabId) {
          // Peer wins → we step down. No yield; peer is already heartbeating.
          clearHeartbeat();
          becomeReader();
        } else {
          // We win — keep heartbeating. Re-assert with an immediate held so
          // the (smaller-id) peer steps down promptly.
          postHeld();
        }
        return;
      }
      if (role === "reader") {
        // Reset holder watchdog on every observed heartbeat.
        armHolderTimeout();
        return;
      }
      return;
    }

    if (msg.kind === "claim") {
      if (role === "writer") {
        if (msg.tabId > tabId) {
          // Peer outranks us — step down and yield politely.
          clearHeartbeat();
          postYield();
          becomeReader();
        } else {
          // We outrank or tie — assert held to push the peer back to reader.
          postHeld();
        }
        return;
      }
      if (role === "pending") {
        // Both contending. Smaller-id (or equal) yields the contention by
        // letting the larger-id claimant win when grace expires; mirror the
        // logic by stepping down to reader when peer outranks us.
        if (msg.tabId > tabId) {
          becomeReader();
        }
        // Otherwise: ignore — our claim grace timer keeps running and we will
        // promote on timeout.
        return;
      }
      if (role === "reader") {
        // Someone is contending while a holder exists. We'll see the holder's
        // next `held` and re-arm the watchdog; nothing to do here.
        return;
      }
      return;
    }

    if (msg.kind === "yield") {
      // Holder voluntarily steps down.
      if (role === "reader") {
        // Race to claim immediately — don't wait for the watchdog.
        startClaimCycle();
        return;
      }
      // writer / pending: no action — we are not waiting on this holder.
      return;
    }
  }

  return {
    start(): void {
      if (started) return;
      started = true;
      channel.addEventListener("message", onMessage);
      startClaimCycle();
    },

    stop(): void {
      if (!started) return;
      started = false;
      const wasWriter = role === "writer";
      clearAllTimers();
      try {
        channel.removeEventListener("message", onMessage);
      } catch {
        // Some mocks may not implement removeEventListener; ignore.
      }
      if (wasWriter) {
        // Best-effort yield so peers reclaim faster than holderTimeoutMs.
        postYield();
      }
      // The channel is owned by the facade — never close it here.
      setRole("pending");
    },

    getRole(): WriterRole {
      return role;
    },

    onRoleChange(listener: (r: WriterRole) => void): () => void {
      listeners.push(listener);
      let unsubscribed = false;
      return (): void => {
        if (unsubscribed) return;
        unsubscribed = true;
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };
}
