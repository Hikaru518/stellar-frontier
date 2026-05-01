import { createRunId, makeEnvelope } from "./envelope";
import { createRingBuffer, type RingBuffer } from "./ringBuffer";
import type { LogEntry, LogInput } from "./types";
import type { LogWorkerCommand, LogWorkerEvent } from "./worker-protocol";

/**
 * Status returned by `LoggerFacade.getStatus`.
 *
 * - `mode: "init_pending"` — Worker created, awaiting `ready`. Logs accumulate
 *   in the ring buffer and a pending queue but are not yet sent to the Worker.
 * - `mode: "ok"` — Worker is the live writer; appends and flushes flow normally.
 * - `mode: "memory_only"` — Worker reported `fatal` (or never booted). Ring
 *   buffer + subscribers continue to work, but nothing is forwarded to a
 *   Worker. `reason` carries the fatal cause.
 *
 * `writerRole` is always `"writer"` in this task; TASK-015 introduces holder
 * election that may flip it to `"reader"` / `"pending"` (ADR-008).
 */
export type LogStatus = {
  mode: "ok" | "memory_only" | "init_pending";
  writerRole: "writer" | "reader" | "pending";
  reason?: string;
};

/**
 * Write-side input as accepted by `LoggerFacade.log`. Augments the type-derived
 * `LogInput` (which only carries `type / source / payload`) with an optional
 * `gameSeconds`. The mapped-conditional form distributes the optional field
 * across every `LogInput` variant so the discriminated-union narrowing on
 * `(type, source, payload)` is preserved.
 *
 * Until App.tsx wires elapsed game time through, callers may either pass it
 * explicitly or accept the default of `0`.
 *
 * TODO(TASK-008): wire gameSeconds from App.tsx state instead of relying on
 * each call site to pass it.
 */
export type LogInputWithContext = LogInput extends infer E
  ? E extends LogInput
    ? E & { gameSeconds?: number }
    : never
  : never;

export interface LoggerFacade {
  log(input: LogInputWithContext): void;
  flush(): Promise<void>;
  subscribe(listener: (delta: { entries: LogEntry[] }) => void): () => void;
  getCurrentRunId(): string;
  getRingBufferSnapshot(): LogEntry[];
  getStatus(): LogStatus;
}

export interface LoggerFactoryOptions {
  /**
   * Inject a Worker (or a Worker-shaped mock). Defaults to a production
   * `new Worker(new URL("./logger.worker.ts", import.meta.url), { type: "module" })`.
   * Throwing from this factory is acceptable — the facade catches and
   * degrades to `memory_only`.
   */
  workerFactory?: () => Worker;
  /** Capacity of the in-memory tail buffer. Defaults to 2000. */
  ringBufferCapacity?: number;
  /** Pending queue size that triggers an immediate flush. Defaults to 50. */
  flushBatchSize?: number;
  /** Idle interval (ms) at which the timer drains a non-empty pending queue. Defaults to 500. */
  flushIntervalMs?: number;
  /** Wall-clock source. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Random source for the run-id suffix. Defaults to `Math.random`. */
  randSource?: () => number;
  /** Override the initial run-id; otherwise computed from `now()` + `randSource`. */
  initialRunId?: string;
}

/**
 * Internal handle returned by `createLogger`. The optional `_stop` is a test
 * seam for clearing the flush timer + dropping the Worker reference; production
 * never calls it (the singleton lives for the page session).
 */
export type LoggerInstance = LoggerFacade & { _stop?: () => void };

interface PendingFlush {
  resolve: () => void;
  untilSeq: number;
}

function defaultWorkerFactory(): Worker {
  return new Worker(new URL("./logger.worker.ts", import.meta.url), {
    type: "module",
  });
}

/**
 * Build a logger facade instance. Most call-sites should use the exported
 * `logger` singleton; tests construct a fresh facade per case with a mock
 * `workerFactory`.
 */
export function createLogger(options: LoggerFactoryOptions = {}): LoggerInstance {
  const ringBufferCapacity = options.ringBufferCapacity ?? 2000;
  const flushBatchSize = options.flushBatchSize ?? 50;
  const flushIntervalMs = options.flushIntervalMs ?? 500;
  const nowFn = options.now ?? ((): Date => new Date());
  const randSource = options.randSource ?? Math.random;
  const initialRunId = options.initialRunId ?? createRunId(nowFn(), randSource);

  const ring: RingBuffer<LogEntry> = createRingBuffer<LogEntry>({
    capacity: ringBufferCapacity,
  });

  let mode: LogStatus["mode"] = "init_pending";
  const writerRole: LogStatus["writerRole"] = "writer";
  let fatalReason: string | undefined;
  let warnedFatalOnce = false;
  let warnedLogPathOnce = false;

  let seqCounter = 0;
  const pendingQueue: LogEntry[] = [];
  let lastAckSeq = 0;
  const waitingFlushers: PendingFlush[] = [];

  let worker: Worker | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  function warnOnce(message: string, detail?: unknown): void {
    if (warnedFatalOnce) return;
    warnedFatalOnce = true;
    try {
      if (detail !== undefined) {
        console.warn(`[logger] ${message}`, detail);
      } else {
        console.warn(`[logger] ${message}`);
      }
    } catch {
      // Never let logging itself break the app.
    }
  }

  function warnLogPathOnce(err: unknown): void {
    if (warnedLogPathOnce) return;
    warnedLogPathOnce = true;
    try {
      console.warn("[logger] log() error swallowed", err);
    } catch {
      // ignore
    }
  }

  function flushPending(): void {
    // init_pending: hold entries until ready arrives.
    // memory_only: never forward — caller already knows we degraded.
    if (mode !== "ok" || worker == null) {
      return;
    }
    if (pendingQueue.length === 0) {
      return;
    }
    const entries = pendingQueue.splice(0, pendingQueue.length);
    try {
      worker.postMessage({ kind: "append", entries } satisfies LogWorkerCommand);
    } catch (err) {
      // postMessage failure is unexpected but recoverable: drop to memory_only.
      mode = "memory_only";
      fatalReason = "post_failed";
      warnOnce("postMessage failed; degrading to memory_only", err);
    }
  }

  function resolvePendingFlushers(upToSeq: number): void {
    if (waitingFlushers.length === 0) return;
    // Resolve every flusher whose untilSeq has been acknowledged, in order.
    for (let i = waitingFlushers.length - 1; i >= 0; i -= 1) {
      const w = waitingFlushers[i];
      if (w.untilSeq <= upToSeq) {
        waitingFlushers.splice(i, 1);
        try {
          w.resolve();
        } catch {
          // ignore — listener exception in user code
        }
      }
    }
  }

  function onWorkerMessage(event: MessageEvent<LogWorkerEvent>): void {
    const data = event.data;
    switch (data.kind) {
      case "ready": {
        mode = "ok";
        // Drain anything that piled up during init.
        if (pendingQueue.length > 0) {
          flushPending();
        }
        return;
      }
      case "fatal": {
        mode = "memory_only";
        fatalReason = data.reason;
        warnOnce(`worker fatal: ${data.reason}`, data.detail);
        // Resolve any waiters — flush() must never hang after fatal.
        const stillWaiting = waitingFlushers.splice(0, waitingFlushers.length);
        for (const w of stillWaiting) {
          try {
            w.resolve();
          } catch {
            // ignore
          }
        }
        return;
      }
      case "ack": {
        if (data.upToSeq > lastAckSeq) lastAckSeq = data.upToSeq;
        resolvePendingFlushers(data.upToSeq);
        return;
      }
      case "runs":
      case "run_data":
      case "error":
        // TASK-007 (read side) and richer error reporting will consume these.
        return;
      default:
        return;
    }
  }

  // --- Worker boot ----------------------------------------------------------
  try {
    const factory = options.workerFactory ?? defaultWorkerFactory;
    worker = factory();
    worker.onmessage = onWorkerMessage;
    worker.postMessage({ kind: "init", runId: initialRunId } satisfies LogWorkerCommand);
  } catch (err) {
    // Worker creation failed (e.g. unsupported environment). Module load must
    // not throw — degrade silently. ringBuffer + subscribers still work.
    worker = null;
    mode = "memory_only";
    fatalReason = "worker_unavailable";
    warnOnce("worker unavailable; degrading to memory_only", err);
  }

  // --- Flush timer ----------------------------------------------------------
  if (worker != null) {
    timer = setInterval(() => {
      if (pendingQueue.length > 0) {
        flushPending();
      }
    }, flushIntervalMs);
  }

  // --- Public API -----------------------------------------------------------
  const facade: LoggerInstance = {
    log(input: LogInputWithContext): void {
      try {
        seqCounter += 1;
        const entry = makeEnvelope(
          { type: input.type, source: input.source, payload: input.payload } as LogInput,
          {
            seq: seqCounter,
            runId: initialRunId,
            // TODO(TASK-008): wire gameSeconds from App.tsx state.
            gameSeconds: input.gameSeconds ?? 0,
            nowReal: nowFn(),
          },
        );
        ring.push(entry);
        // Memory-only: never queue for the worker, but keep ring + subscribers.
        if (mode === "memory_only") {
          return;
        }
        pendingQueue.push(entry);
        if (pendingQueue.length >= flushBatchSize) {
          flushPending();
        }
      } catch (err) {
        // Never throw out of log() — it sits on hot paths.
        warnLogPathOnce(err);
      }
    },

    async flush(): Promise<void> {
      if (mode === "memory_only" || worker == null) {
        return;
      }
      // Nothing buffered locally and worker has acked everything we sent → done.
      if (pendingQueue.length === 0 && lastAckSeq >= seqCounter) {
        return;
      }
      // If we're still init_pending, we cannot send append/flush yet. Wait
      // until ready promotes us; the ack loop will resolve the promise.
      if (mode === "ok") {
        flushPending();
        try {
          worker.postMessage({ kind: "flush" } satisfies LogWorkerCommand);
        } catch (err) {
          mode = "memory_only";
          fatalReason = "post_failed";
          warnOnce("postMessage(flush) failed", err);
          return;
        }
      }
      const untilSeq = seqCounter;
      await new Promise<void>((resolve) => {
        waitingFlushers.push({ resolve, untilSeq });
      });
    },

    subscribe(listener) {
      return ring.subscribe(listener);
    },

    getCurrentRunId(): string {
      return initialRunId;
    },

    getRingBufferSnapshot(): LogEntry[] {
      return ring.snapshot();
    },

    getStatus(): LogStatus {
      const status: LogStatus = { mode, writerRole };
      if (fatalReason !== undefined) status.reason = fatalReason;
      return status;
    },

    _stop(): void {
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
      if (worker != null) {
        worker.onmessage = null;
        try {
          worker.terminate();
        } catch {
          // ignore — mock workers may not support terminate
        }
        worker = null;
      }
    },
  };

  return facade;
}

/**
 * Module-level singleton used by production code. Tests must NOT import this —
 * always go through `createLogger({ workerFactory })` to avoid spinning up a
 * real Worker under jsdom.
 */
export const logger: LoggerFacade = createLogger();
