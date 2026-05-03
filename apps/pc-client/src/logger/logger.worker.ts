/// <reference lib="webworker" />

import {
  createOpfsRunStore,
  type OpfsRunStore,
  type SyncAccessHandleLike,
} from "./opfsRunStore";
import { LoggerError } from "./types";
import type { LogWorkerCommand, LogWorkerEvent } from "./worker-protocol";

/**
 * Dedicated logger Worker entry (ADR-001 / ADR-003).
 *
 * Responsibilities:
 *   - Hold the single OPFS SyncAccessHandle for the active run.
 *   - Translate `LogWorkerCommand` messages into JSONL appends, flushes,
 *     rotates, and read/list/delete operations.
 *   - Never enrich envelopes, never throttle — that lives in the main-thread
 *     facade. The Worker is a "dumb writer."
 *
 * The module also exports `__INTERNAL` for unit tests. jsdom has no real
 * Worker runtime, so tests drive `__INTERNAL.handleMessage` directly with a
 * captured `emit` callback. Production code wires the same `handleMessage`
 * into `self.onmessage` below.
 */

// --- Module-level state ------------------------------------------------------

/** Factory used to construct an `OpfsRunStore`. Tests override this. */
type StoreFactory = () => OpfsRunStore;

const defaultStoreFactory: StoreFactory = () =>
  createOpfsRunStore(() => navigator.storage.getDirectory());

let storeFactory: StoreFactory = defaultStoreFactory;

let store: OpfsRunStore | null = null;
let currentHandle: SyncAccessHandleLike | null = null;
let currentRunId: string | null = null;
/** Max seq seen across all appends to the current run; resets on rotate. */
let lastSeqWritten: number = 0;

// --- Helpers -----------------------------------------------------------------

const encoder = new TextEncoder();

/** Write one JSONL-encoded entry to the end of the file. */
function writeEntry(handle: SyncAccessHandleLike, entry: unknown): void {
  const line = JSON.stringify(entry) + "\n";
  const bytes = encoder.encode(line);
  handle.write(bytes, { at: handle.getSize() });
}

/** Best-effort error message extraction. */
function reasonOf(err: unknown): string {
  if (err instanceof LoggerError) return err.code;
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Best-effort detail string used inside `fatal` events. */
function detailOf(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (err == null) return undefined;
  return String(err);
}

// --- Core message handler ----------------------------------------------------

type Emit = (event: LogWorkerEvent, transfer?: Transferable[]) => void;

/**
 * Process a single command. Always swallows exceptions — every error path
 * surfaces back as either a `fatal` (init) or `error` event so the caller can
 * recover. The Worker itself must never crash on a bad message.
 */
async function handleMessage(cmd: LogWorkerCommand, emit: Emit): Promise<void> {
  try {
    switch (cmd.kind) {
      case "init": {
        try {
          const created = storeFactory();
          await created.init();
          const handle = await created.createRun(cmd.runId);
          store = created;
          currentHandle = handle;
          currentRunId = cmd.runId;
          lastSeqWritten = 0;
          emit({ kind: "ready", runId: cmd.runId });
        } catch (err) {
          if (err instanceof LoggerError && err.code === "opfs_unavailable") {
            emit({
              kind: "fatal",
              reason: "opfs_unavailable",
              detail: detailOf(err),
            });
            return;
          }
          emit({
            kind: "fatal",
            reason: "init_failed",
            detail: detailOf(err),
          });
        }
        return;
      }

      case "append": {
        if (!store || !currentHandle || currentRunId == null) {
          emit({ kind: "error", cmdKind: cmd.kind, reason: "not_initialized" });
          return;
        }
        for (const entry of cmd.entries) {
          writeEntry(currentHandle, entry);
          if (entry.seq > lastSeqWritten) lastSeqWritten = entry.seq;
        }
        emit({ kind: "ack", upToSeq: lastSeqWritten });
        return;
      }

      case "flush": {
        if (!store || !currentHandle) {
          emit({ kind: "error", cmdKind: cmd.kind, reason: "not_initialized" });
          return;
        }
        currentHandle.flush();
        emit({ kind: "ack", upToSeq: lastSeqWritten });
        return;
      }

      case "rotate": {
        if (!store) {
          emit({ kind: "error", cmdKind: cmd.kind, reason: "not_initialized" });
          return;
        }
        const handle = await store.rotate(cmd.newRunId, 10);
        currentHandle = handle;
        currentRunId = cmd.newRunId;
        lastSeqWritten = 0;
        emit({ kind: "ready", runId: cmd.newRunId });
        return;
      }

      case "list_runs": {
        if (!store) {
          emit({ kind: "error", cmdKind: cmd.kind, reason: "not_initialized" });
          return;
        }
        const runs = await store.listRuns(currentRunId);
        emit({ kind: "runs", runs });
        return;
      }

      case "read_run": {
        if (!store) {
          emit({ kind: "error", cmdKind: cmd.kind, reason: "not_initialized" });
          return;
        }
        const bytes = await store.readRun(cmd.runId);
        // Transfer ownership of the buffer to the receiver to avoid a copy.
        emit({ kind: "run_data", runId: cmd.runId, bytes }, [bytes]);
        return;
      }

      case "delete_run": {
        if (!store) {
          emit({ kind: "error", cmdKind: cmd.kind, reason: "not_initialized" });
          return;
        }
        if (cmd.runId === currentRunId) {
          emit({ kind: "error", cmdKind: cmd.kind, reason: "writer_busy" });
          return;
        }
        await store.deleteRun(cmd.runId);
        // Fire-and-forget on success — no ack per task contract.
        return;
      }

      default: {
        // Exhaustiveness guard — TS proves this is unreachable when the union
        // is closed; if someone adds a new variant we want a compile error.
        const _exhaustive: never = cmd;
        return _exhaustive;
      }
    }
  } catch (err) {
    emit({ kind: "error", cmdKind: cmd.kind, reason: reasonOf(err) });
  }
}

// --- Worker wiring -----------------------------------------------------------

/**
 * Bridge a Worker `postMessage` into the same shape the test harness uses.
 * `transfer` becomes the second argument to `postMessage`, enabling zero-copy
 * for `read_run` ArrayBuffer payloads.
 */
function workerEmit(event: LogWorkerEvent, transfer?: Transferable[]): void {
  // Cast through `unknown` because in some environments `self` is typed as
  // `Window & typeof globalThis` (DOM lib only); we know at runtime we're a
  // dedicated worker.
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(
    event,
    transfer ?? [],
  );
}

/**
 * Register the production message listener. Guarded by a `typeof` check so
 * that importing this module from jsdom unit tests (which lack a real Worker
 * global but do expose `self`) does not blow up — the test path drives
 * `__INTERNAL.handleMessage` directly anyway.
 */
if (typeof self !== "undefined" && typeof (self as unknown as { addEventListener?: unknown }).addEventListener === "function") {
  (self as unknown as DedicatedWorkerGlobalScope).onmessage = (
    e: MessageEvent<LogWorkerCommand>,
  ): void => {
    void handleMessage(e.data, workerEmit);
  };
}

// --- Test-only surface -------------------------------------------------------

/**
 * Internal test seam. Production code never imports this — it exists so unit
 * tests can drive the message handler without spinning up a real Worker.
 */
export const __INTERNAL = {
  handleMessage,
  setStoreFactory(factory: StoreFactory): void {
    storeFactory = factory;
  },
  restoreDefaultStoreFactory(): void {
    storeFactory = defaultStoreFactory;
  },
  resetForTest(): void {
    store = null;
    currentHandle = null;
    currentRunId = null;
    lastSeqWritten = 0;
  },
  getCurrentRunId(): string | null {
    return currentRunId;
  },
  getLastSeqWritten(): number {
    return lastSeqWritten;
  },
};
