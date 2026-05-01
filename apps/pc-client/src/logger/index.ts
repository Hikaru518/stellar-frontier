import { triggerDownload } from "./download";
import { createRunId, makeEnvelope } from "./envelope";
import { createRingBuffer, type RingBuffer } from "./ringBuffer";
import { LoggerError, type LogEntry, type LogInput, type RunArchive } from "./types";
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
  /**
   * Close the current run and start a new one. Returns the new runId.
   *
   * Order of operations:
   *   1. drain pending → flush → wait for ack
   *   2. mint newRunId via the configured factory
   *   3. postMessage rotate → wait for `ready` from Worker
   *   4. clear ring buffer + pending queue, reset seq
   *
   * Concurrent rotate calls share the same in-flight promise; rotate is never
   * issued twice at once.
   *
   * In `memory_only` mode rotate still mints a new id and resets local state
   * so the rest of the app sees a clean run boundary.
   */
  rotate(reason: "reset"): Promise<string>;
  listRuns(): Promise<RunArchive[]>;
  readRun(runId: string): Promise<ArrayBuffer>;
  /**
   * Best-effort delete. Rejects locally with `writer_busy` when targeting the
   * current run; otherwise posts the command and resolves immediately
   * (fire-and-forget per worker-protocol). Worker-side errors are surfaced via
   * a single `console.warn` so the UI can simply re-issue `listRuns`.
   */
  deleteRun(runId: string): Promise<void>;
  exportCurrent(): Promise<void>;
  exportRun(runId: string): Promise<void>;
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
  /**
   * Factory used by `rotate` to mint subsequent run-ids. Defaults to a thunk
   * over the same `now()` / `randSource` used at construction. Tests inject
   * this to make rotate-target ids deterministic.
   */
  runIdFactory?: () => string;
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

interface PendingReadRun {
  resolve: (bytes: ArrayBuffer) => void;
  reject: (err: unknown) => void;
}

interface PendingListRuns {
  resolve: (runs: RunArchive[]) => void;
  reject: (err: unknown) => void;
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
  const runIdFactory =
    options.runIdFactory ?? ((): string => createRunId(nowFn(), randSource));
  let currentRunId = options.initialRunId ?? createRunId(nowFn(), randSource);

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

  // Ready-handshake gate. Resolved when the Worker first emits `ready` (initial
  // boot) or `fatal` (degrades to memory_only). Rotate awaits this so callers
  // that fire `rotate()` before init completes still get correct ordering.
  let resolveReady: (() => void) | null = null;
  let readyPromise: Promise<void> = new Promise<void>((res) => {
    resolveReady = res;
  });

  // Map runId → queued readRun promises. We allow multiple concurrent readers
  // for the same id (e.g. a `listRuns` UI re-running while the previous fetch
  // is still in flight); they each consume the next matching `run_data` event
  // in FIFO order.
  const pendingReadRuns: Map<string, PendingReadRun[]> = new Map();
  const pendingListRuns: PendingListRuns[] = [];

  // In-flight rotate, if any. Concurrent rotate() calls await the same handle.
  let rotateInFlight: Promise<string> | null = null;
  // Set during a rotate cycle to track the runId we have committed to AFTER
  // flush ack but BEFORE worker confirms `ready`. Logs that arrive in this
  // window are tagged with the new id and seq restarts at 1.
  let rotateTargetRunId: string | null = null;

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

  function settleReady(): void {
    if (resolveReady != null) {
      resolveReady();
      resolveReady = null;
    }
  }

  /**
   * Read the live `mode` state. Wrapped in a function so callers across
   * `await` boundaries don't get tripped by TypeScript's synchronous flow
   * narrowing — `mode` can transition during an await.
   */
  function getMode(): LogStatus["mode"] {
    return mode;
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

  function resolveAllPendingReaders(err: unknown): void {
    for (const queue of pendingReadRuns.values()) {
      while (queue.length > 0) {
        const next = queue.shift();
        next?.reject(err);
      }
    }
    pendingReadRuns.clear();
    while (pendingListRuns.length > 0) {
      const next = pendingListRuns.shift();
      next?.reject(err);
    }
  }

  function onWorkerMessage(event: MessageEvent<LogWorkerEvent>): void {
    const data = event.data;
    switch (data.kind) {
      case "ready": {
        mode = "ok";
        settleReady();
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
        settleReady();
        // Resolve any waiters — flush() must never hang after fatal.
        const stillWaiting = waitingFlushers.splice(0, waitingFlushers.length);
        for (const w of stillWaiting) {
          try {
            w.resolve();
          } catch {
            // ignore
          }
        }
        // Reject any pending reads/lists — they will never get an answer.
        const fatalErr = new LoggerError({
          code: "opfs_unavailable",
          message: `worker fatal: ${data.reason}`,
        });
        resolveAllPendingReaders(fatalErr);
        return;
      }
      case "ack": {
        if (data.upToSeq > lastAckSeq) lastAckSeq = data.upToSeq;
        resolvePendingFlushers(data.upToSeq);
        return;
      }
      case "runs": {
        const next = pendingListRuns.shift();
        next?.resolve(data.runs);
        return;
      }
      case "run_data": {
        const queue = pendingReadRuns.get(data.runId);
        if (queue == null || queue.length === 0) {
          // Stale event for a runId we did not request (or already resolved).
          return;
        }
        const next = queue.shift();
        if (queue.length === 0) {
          pendingReadRuns.delete(data.runId);
        }
        next?.resolve(data.bytes);
        return;
      }
      case "error": {
        // Per-cmd error correlation. delete_run errors are demoted to a warn —
        // the facade contract is fire-and-forget, so we cannot reject anything.
        if (data.cmdKind === "delete_run") {
          try {
            console.warn(`[logger] delete_run failed: ${data.reason}`);
          } catch {
            // ignore
          }
          return;
        }
        const err = new LoggerError({
          code: "init_failed",
          message: data.reason,
        });
        if (data.cmdKind === "list_runs") {
          const next = pendingListRuns.shift();
          next?.reject(err);
          return;
        }
        if (data.cmdKind === "read_run") {
          // We do not know which runId the error refers to (the protocol does
          // not echo it). Reject the OLDEST pending read across all queues.
          for (const [runId, queue] of pendingReadRuns) {
            if (queue.length === 0) continue;
            const next = queue.shift();
            if (queue.length === 0) pendingReadRuns.delete(runId);
            next?.reject(err);
            return;
          }
        }
        // Unknown / unhandled error correlation — surface to console for
        // diagnostics but do not throw.
        try {
          console.warn(`[logger] worker error (${data.cmdKind}): ${data.reason}`);
        } catch {
          // ignore
        }
        return;
      }
      default:
        return;
    }
  }

  // --- Worker boot ----------------------------------------------------------
  try {
    const factory = options.workerFactory ?? defaultWorkerFactory;
    worker = factory();
    worker.onmessage = onWorkerMessage;
    worker.postMessage({ kind: "init", runId: currentRunId } satisfies LogWorkerCommand);
  } catch (err) {
    // Worker creation failed (e.g. unsupported environment). Module load must
    // not throw — degrade silently. ringBuffer + subscribers still work.
    worker = null;
    mode = "memory_only";
    fatalReason = "worker_unavailable";
    warnOnce("worker unavailable; degrading to memory_only", err);
    settleReady();
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
        // If a rotate is mid-flight (flush already acked, ready not yet
        // arrived), tag the new entry with the *target* runId so it ends up in
        // the right file once `ready` lands and we drain.
        const tagRunId = rotateTargetRunId ?? currentRunId;
        const entry = makeEnvelope(
          { type: input.type, source: input.source, payload: input.payload } as LogInput,
          {
            seq: seqCounter,
            runId: tagRunId,
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
        // Don't drain during a rotate window — the worker is mid-rename and
        // appends would race the rotate command. Drain on the post-rotate
        // ready edge instead.
        if (rotateTargetRunId != null) {
          return;
        }
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
      return currentRunId;
    },

    getRingBufferSnapshot(): LogEntry[] {
      return ring.snapshot();
    },

    getStatus(): LogStatus {
      const status: LogStatus = { mode, writerRole };
      if (fatalReason !== undefined) status.reason = fatalReason;
      return status;
    },

    rotate(_reason: "reset"): Promise<string> {
      // Concurrent rotate() calls share the same in-flight handle.
      if (rotateInFlight != null) return rotateInFlight;

      // Step A (synchronous, pre-await): drain the pending queue and post a
      // `flush` command so the *test* — and any introspection — sees the
      // commands in `posted` immediately after `rotate()` returns. We capture
      // a `flushAck` promise here that the async body awaits. Only `ok` mode
      // can post; `init_pending` defers everything until ready.
      let flushAck: Promise<void> | null = null;
      if (mode === "ok" && worker != null) {
        if (pendingQueue.length > 0) {
          flushPending();
        }
        if (seqCounter > lastAckSeq) {
          try {
            worker.postMessage({ kind: "flush" } satisfies LogWorkerCommand);
          } catch (err) {
            mode = "memory_only";
            fatalReason = "post_failed";
            warnOnce("postMessage(flush) failed during rotate", err);
          }
          if (mode === "ok") {
            flushAck = new Promise<void>((resolve) => {
              waitingFlushers.push({ resolve, untilSeq: seqCounter });
            });
          }
        }
      }

      rotateInFlight = (async (): Promise<string> => {
        // Memory-only: short-circuit. We still mint a new id and reset local
        // state so callers see a clean run boundary.
        if (mode === "memory_only" || worker == null) {
          const newId = runIdFactory();
          currentRunId = newId;
          seqCounter = 0;
          pendingQueue.length = 0;
          clearRing();
          return newId;
        }

        // If we were in init_pending when rotate() was called, we have not
        // posted anything yet. Wait for ready, then flush. We re-check `mode`
        // through `getMode()` because the synchronous narrowing TS performs
        // is invalidated by the await.
        if (getMode() === "init_pending") {
          await readyPromise;
          if (getMode() === "memory_only" || worker == null) {
            const newId = runIdFactory();
            currentRunId = newId;
            seqCounter = 0;
            pendingQueue.length = 0;
            clearRing();
            return newId;
          }
          if (pendingQueue.length > 0) {
            flushPending();
          }
          if (seqCounter > lastAckSeq) {
            try {
              worker.postMessage({ kind: "flush" } satisfies LogWorkerCommand);
            } catch (err) {
              mode = "memory_only";
              fatalReason = "post_failed";
              warnOnce("postMessage(flush) failed during rotate", err);
              const newId = runIdFactory();
              currentRunId = newId;
              seqCounter = 0;
              pendingQueue.length = 0;
              clearRing();
              return newId;
            }
            await new Promise<void>((resolve) => {
              waitingFlushers.push({ resolve, untilSeq: seqCounter });
            });
          }
        } else if (flushAck != null) {
          await flushAck;
        }

        // Mint the new id and mark the rotate window. Concurrent log() calls
        // are tagged with `newId`; their `seqCounter` restarts at 1.
        const newId = runIdFactory();
        rotateTargetRunId = newId;
        seqCounter = 0;
        // Discard ring + any leftover local pending — those belong to old run.
        pendingQueue.length = 0;
        clearRing();

        // Hook the worker.onmessage so we can observe the post-rotate `ready`
        // event without losing other events that may interleave.
        const rotateReady = new Promise<void>((resolve, reject) => {
          if (worker == null) {
            reject(
              new LoggerError({
                code: "init_failed",
                message: "worker disappeared during rotate",
              }),
            );
            return;
          }
          const previous = worker.onmessage;
          worker.onmessage = (e: MessageEvent<LogWorkerEvent>): void => {
            const ev = e.data;
            if (ev.kind === "ready" && ev.runId === newId) {
              if (worker != null) worker.onmessage = previous;
              resolve();
              return;
            }
            if (ev.kind === "error" && ev.cmdKind === "rotate") {
              if (worker != null) worker.onmessage = previous;
              reject(
                new LoggerError({
                  code: "init_failed",
                  message: ev.reason,
                }),
              );
              return;
            }
            if (ev.kind === "fatal") {
              if (worker != null) worker.onmessage = previous;
              reject(
                new LoggerError({
                  code: "opfs_unavailable",
                  message: `worker fatal: ${ev.reason}`,
                }),
              );
              // Hand off to the regular handler so the rest of the facade
              // sees the fatal transition.
              if (previous != null && worker != null) previous.call(worker, e);
              return;
            }
            // Forward every other event to the regular handler so
            // appends/acks/etc. mid-rotate still settle correctly.
            if (previous != null && worker != null) previous.call(worker, e);
          };
        });

        try {
          worker.postMessage({ kind: "rotate", newRunId: newId } satisfies LogWorkerCommand);
        } catch (err) {
          rotateTargetRunId = null;
          throw new LoggerError({
            code: "init_failed",
            message: "postMessage(rotate) failed",
            cause: err,
          });
        }

        try {
          await rotateReady;
        } catch (err) {
          rotateTargetRunId = null;
          throw err;
        }

        currentRunId = newId;
        rotateTargetRunId = null;
        // Drain anything logged during the rotate window.
        if (pendingQueue.length > 0) {
          flushPending();
        }
        return newId;
      })();

      // Always clear in-flight handle once it settles, success or failure.
      // Attach via .then to avoid an unhandled-rejection on the chained
      // promise (callers handle the rejection on `rotateInFlight` itself).
      const handle = rotateInFlight;
      rotateInFlight.then(
        () => {
          if (rotateInFlight === handle) rotateInFlight = null;
        },
        () => {
          if (rotateInFlight === handle) rotateInFlight = null;
        },
      );

      return rotateInFlight;
    },

    listRuns(): Promise<RunArchive[]> {
      if (mode === "memory_only" || worker == null) {
        // Tolerant fallback: no archives yet means "empty list".
        return Promise.resolve([]);
      }
      return new Promise<RunArchive[]>((resolve, reject) => {
        pendingListRuns.push({ resolve, reject });
        try {
          worker!.postMessage({ kind: "list_runs" } satisfies LogWorkerCommand);
        } catch (err) {
          // Roll back the pending entry; resolve with empty list to keep UI
          // resilient.
          const idx = pendingListRuns.findIndex((p) => p.resolve === resolve);
          if (idx >= 0) pendingListRuns.splice(idx, 1);
          mode = "memory_only";
          fatalReason = "post_failed";
          warnOnce("postMessage(list_runs) failed", err);
          resolve([]);
        }
      });
    },

    readRun(runId: string): Promise<ArrayBuffer> {
      if (mode === "memory_only" || worker == null) {
        return Promise.reject(
          new LoggerError({
            code: "opfs_unavailable",
            message: "OPFS unavailable; cannot read run",
          }),
        );
      }
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const queue = pendingReadRuns.get(runId) ?? [];
        queue.push({ resolve, reject });
        pendingReadRuns.set(runId, queue);
        try {
          worker!.postMessage({ kind: "read_run", runId } satisfies LogWorkerCommand);
        } catch (err) {
          // Roll back the pending entry and reject.
          const q = pendingReadRuns.get(runId);
          if (q != null) {
            const idx = q.findIndex((p) => p.resolve === resolve);
            if (idx >= 0) q.splice(idx, 1);
            if (q.length === 0) pendingReadRuns.delete(runId);
          }
          reject(
            new LoggerError({
              code: "init_failed",
              message: "postMessage(read_run) failed",
              cause: err,
            }),
          );
        }
      });
    },

    deleteRun(runId: string): Promise<void> {
      if (runId === currentRunId) {
        return Promise.reject(
          new LoggerError({
            code: "writer_busy",
            message: "Cannot delete the current run",
          }),
        );
      }
      if (mode === "memory_only" || worker == null) {
        return Promise.reject(
          new LoggerError({
            code: "opfs_unavailable",
            message: "OPFS unavailable; cannot delete run",
          }),
        );
      }
      try {
        worker.postMessage({ kind: "delete_run", runId } satisfies LogWorkerCommand);
      } catch (err) {
        return Promise.reject(
          new LoggerError({
            code: "init_failed",
            message: "postMessage(delete_run) failed",
            cause: err,
          }),
        );
      }
      // Fire-and-forget: worker reports success silently. Errors are warned
      // via the `error` event handler above; callers refresh by listing.
      return Promise.resolve();
    },

    async exportCurrent(): Promise<void> {
      // Make sure everything we've logged so far hits disk before we read.
      await this.flush();
      const runId = currentRunId;
      const bytes = await this.readRun(runId);
      triggerDownload(
        new Blob([bytes], { type: "application/x-ndjson" }),
        `${runId}.jsonl`,
      );
    },

    async exportRun(runId: string): Promise<void> {
      const bytes = await this.readRun(runId);
      triggerDownload(
        new Blob([bytes], { type: "application/x-ndjson" }),
        `${runId}.jsonl`,
      );
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

  /**
   * Drop all locally buffered entries. Used on rotate so the ring buffer +
   * subscribers see the fresh-run boundary cleanly. Subscribers are not
   * notified — `clear` is a state reset, not a delta event.
   */
  function clearRing(): void {
    ring.clear();
  }

  return facade;
}

/**
 * Module-level singleton used by production code. Tests must NOT import this —
 * always go through `createLogger({ workerFactory })` to avoid spinning up a
 * real Worker under jsdom.
 */
export const logger: LoggerFacade = createLogger();
