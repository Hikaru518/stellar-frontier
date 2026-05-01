import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __INTERNAL } from "../logger.worker";
import { createOpfsRunStore } from "../opfsRunStore";
import type { OpfsRunStore } from "../opfsRunStore";
import type { LogEntry, RunArchive } from "../types";
import { LoggerError } from "../types";
import type { LogWorkerCommand, LogWorkerEvent } from "../worker-protocol";
import {
  createMockOpfsRoot,
  type MockFileSystemDirectoryHandle,
} from "../../test/mocks/opfs";

/**
 * Test harness for the Worker entry point. We do not boot a real `new Worker()`
 * (jsdom has no Worker runtime); instead we drive the exported
 * `__INTERNAL.handleMessage(cmd, emit)` directly and capture emitted events
 * into a buffer. The same handler is wired to `self.onmessage` in production —
 * see logger.worker.ts.
 */

type EmittedEvent = LogWorkerEvent;

function makeEmit(): {
  emit: (e: LogWorkerEvent, transfer?: Transferable[]) => void;
  events: EmittedEvent[];
  transfers: Transferable[][];
} {
  const events: EmittedEvent[] = [];
  const transfers: Transferable[][] = [];
  const emit = (e: LogWorkerEvent, transfer?: Transferable[]): void => {
    events.push(e);
    transfers.push(transfer ?? []);
  };
  return { emit, events, transfers };
}

function rootGetterFor(
  root: MockFileSystemDirectoryHandle,
): () => Promise<FileSystemDirectoryHandle> {
  return async () => root as unknown as FileSystemDirectoryHandle;
}

/** Build a real OpfsRunStore wired to a fresh in-memory mock OPFS root. */
function realStoreFactory(root: MockFileSystemDirectoryHandle): () => OpfsRunStore {
  return () => createOpfsRunStore(rootGetterFor(root));
}

/** Minimal valid LogEntry for write tests; payload contents are arbitrary. */
function makeEntry(seq: number, runId: string): LogEntry {
  return {
    seq,
    log_version: 1,
    game_version: "0.1.0",
    run_id: runId,
    occurred_at_game_seconds: 0,
    occurred_at_real_time: "2026-05-01T00:00:00.000Z",
    type: "system.run.start",
    source: "system",
    payload: { game_version: "0.1.0", schema_version: "1" },
  };
}

beforeEach(() => {
  __INTERNAL.resetForTest();
});

afterEach(() => {
  __INTERNAL.restoreDefaultStoreFactory();
});

describe("logger.worker — AC1: init handshake + opfs_unavailable", () => {
  it("emits {kind:'ready'} when init succeeds against a healthy mock OPFS", async () => {
    const root = createMockOpfsRoot();
    __INTERNAL.setStoreFactory(realStoreFactory(root));
    const { emit, events } = makeEmit();

    await __INTERNAL.handleMessage(
      { kind: "init", runId: "run-2026-05-01-1000-aaaa" },
      emit,
    );

    expect(events).toEqual([
      { kind: "ready", runId: "run-2026-05-01-1000-aaaa" },
    ]);
  });

  it("emits {kind:'fatal', reason:'opfs_unavailable'} when store.init throws LoggerError opfs_unavailable", async () => {
    const failingStore: OpfsRunStore = {
      init: vi
        .fn()
        .mockRejectedValue(
          new LoggerError({
            code: "opfs_unavailable",
            message: "OPFS root is unavailable",
          }),
        ),
      createRun: vi.fn(),
      closeCurrent: vi.fn(),
      deleteRun: vi.fn(),
      listRuns: vi.fn(),
      readRun: vi.fn(),
      rotate: vi.fn(),
    };
    __INTERNAL.setStoreFactory(() => failingStore);
    const { emit, events } = makeEmit();

    await __INTERNAL.handleMessage(
      { kind: "init", runId: "run-2026-05-01-1000-aaaa" },
      emit,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "fatal",
      reason: "opfs_unavailable",
    });
    // createRun must not have been attempted after init failed
    expect(failingStore.createRun).not.toHaveBeenCalled();
  });

  it("emits error 'not_initialized' when a non-init command arrives before init", async () => {
    const { emit, events } = makeEmit();

    const cmd: LogWorkerCommand = {
      kind: "append",
      entries: [makeEntry(1, "run-2026-05-01-1000-aaaa")],
    };
    await __INTERNAL.handleMessage(cmd, emit);

    expect(events).toEqual([
      { kind: "error", cmdKind: "append", reason: "not_initialized" },
    ]);
  });
});

describe("logger.worker — AC2: append + read_run JSONL round-trip", () => {
  it("writes entries as JSONL and read_run decodes back to the original entries", async () => {
    const root = createMockOpfsRoot();
    __INTERNAL.setStoreFactory(realStoreFactory(root));
    const { emit, events, transfers } = makeEmit();

    const runId = "run-2026-05-01-1000-aaaa";
    await __INTERNAL.handleMessage({ kind: "init", runId }, emit);

    const entryA = makeEntry(1, runId);
    const entryB = makeEntry(2, runId);
    await __INTERNAL.handleMessage({ kind: "append", entries: [entryA, entryB] }, emit);

    await __INTERNAL.handleMessage({ kind: "read_run", runId }, emit);

    // events: [ready, ack, run_data]
    expect(events[0]).toEqual({ kind: "ready", runId });
    expect(events[1]).toEqual({ kind: "ack", upToSeq: 2 });

    const runData = events[2];
    if (runData.kind !== "run_data") {
      throw new Error(`expected run_data, got ${runData.kind}`);
    }
    expect(runData.runId).toBe(runId);

    // read_run is expected to transfer the buffer for zero-copy
    const lastTransfers = transfers[2];
    expect(lastTransfers).toContain(runData.bytes);

    const text = new TextDecoder().decode(new Uint8Array(runData.bytes));
    const lines = text.split("\n").filter((s) => s.length > 0);
    expect(lines).toHaveLength(2);

    const parsedA = JSON.parse(lines[0]);
    const parsedB = JSON.parse(lines[1]);
    expect(parsedA).toEqual(entryA);
    expect(parsedB).toEqual(entryB);
  });

  it("ack.upToSeq reflects max seq across the whole append batch", async () => {
    const root = createMockOpfsRoot();
    __INTERNAL.setStoreFactory(realStoreFactory(root));
    const { emit, events } = makeEmit();
    const runId = "run-2026-05-01-1000-aaaa";

    await __INTERNAL.handleMessage({ kind: "init", runId }, emit);

    const e1 = makeEntry(1, runId);
    const e2 = makeEntry(2, runId);
    const e3 = makeEntry(3, runId);
    await __INTERNAL.handleMessage(
      { kind: "append", entries: [e1, e2, e3] },
      emit,
    );

    const ack = events[1];
    expect(ack).toEqual({ kind: "ack", upToSeq: 3 });
  });
});

describe("logger.worker — AC3: rotate keeps old runs and list_runs returns both", () => {
  it("appends to r1, rotates to r2, appends to r2; list_runs reports both", async () => {
    const root = createMockOpfsRoot();
    __INTERNAL.setStoreFactory(realStoreFactory(root));
    const { emit, events } = makeEmit();

    const r1 = "run-2026-05-01-1000-aaaa";
    const r2 = "run-2026-05-01-1100-bbbb";

    await __INTERNAL.handleMessage({ kind: "init", runId: r1 }, emit);
    await __INTERNAL.handleMessage(
      { kind: "append", entries: [makeEntry(1, r1)] },
      emit,
    );
    await __INTERNAL.handleMessage({ kind: "rotate", newRunId: r2 }, emit);
    await __INTERNAL.handleMessage(
      { kind: "append", entries: [makeEntry(1, r2)] },
      emit,
    );
    await __INTERNAL.handleMessage({ kind: "list_runs" }, emit);

    // Find the runs event and assert both runIds are present
    const runsEvent = events.find((e) => e.kind === "runs");
    expect(runsEvent).toBeDefined();
    if (!runsEvent || runsEvent.kind !== "runs") return;

    const ids = runsEvent.runs.map((r: RunArchive) => r.run_id).sort();
    expect(ids).toEqual([r1, r2].sort());

    // current run should be r2 after rotate
    const r2Archive = runsEvent.runs.find((r) => r.run_id === r2);
    expect(r2Archive?.is_current).toBe(true);
    const r1Archive = runsEvent.runs.find((r) => r.run_id === r1);
    expect(r1Archive?.is_current).toBe(false);

    // After rotate the worker should emit a fresh ready{runId:r2}
    const readyEvents = events.filter((e) => e.kind === "ready");
    expect(readyEvents).toEqual([
      { kind: "ready", runId: r1 },
      { kind: "ready", runId: r2 },
    ]);
  });

  it("rotate resets lastSeqWritten so subsequent ack on the new run starts from the new seq", async () => {
    const root = createMockOpfsRoot();
    __INTERNAL.setStoreFactory(realStoreFactory(root));
    const { emit, events } = makeEmit();
    const r1 = "run-2026-05-01-1000-aaaa";
    const r2 = "run-2026-05-01-1100-bbbb";

    await __INTERNAL.handleMessage({ kind: "init", runId: r1 }, emit);
    await __INTERNAL.handleMessage(
      { kind: "append", entries: [makeEntry(7, r1)] },
      emit,
    );
    // last ack was 7 on r1
    const r1Ack = events.find((e) => e.kind === "ack");
    expect(r1Ack).toEqual({ kind: "ack", upToSeq: 7 });

    await __INTERNAL.handleMessage({ kind: "rotate", newRunId: r2 }, emit);
    await __INTERNAL.handleMessage(
      { kind: "append", entries: [makeEntry(1, r2)] },
      emit,
    );
    const acks = events.filter((e) => e.kind === "ack");
    // second ack must reflect the new run's seq, not max(7, 1)
    expect(acks[acks.length - 1]).toEqual({ kind: "ack", upToSeq: 1 });
  });
});

describe("logger.worker — AC4: delete_run rejects current run with writer_busy", () => {
  it("delete_run on currentRunId emits error and does NOT call store.deleteRun", async () => {
    const root = createMockOpfsRoot();
    const realStore = createOpfsRunStore(rootGetterFor(root));
    const deleteSpy = vi.spyOn(realStore, "deleteRun");
    __INTERNAL.setStoreFactory(() => realStore);

    const { emit, events } = makeEmit();
    const runId = "run-2026-05-01-1000-aaaa";
    await __INTERNAL.handleMessage({ kind: "init", runId }, emit);

    await __INTERNAL.handleMessage({ kind: "delete_run", runId }, emit);

    const errorEvent = events.find((e) => e.kind === "error");
    expect(errorEvent).toEqual({
      kind: "error",
      cmdKind: "delete_run",
      reason: "writer_busy",
    });
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("delete_run on a different runId does call store.deleteRun (fire-and-forget)", async () => {
    const root = createMockOpfsRoot();
    const realStore = createOpfsRunStore(rootGetterFor(root));
    __INTERNAL.setStoreFactory(() => realStore);
    const { emit, events } = makeEmit();

    const r1 = "run-2026-05-01-1000-aaaa";
    const r2 = "run-2026-05-01-1100-bbbb";

    await __INTERNAL.handleMessage({ kind: "init", runId: r1 }, emit);
    // create a second run via rotate so r1 becomes a closed archive
    await __INTERNAL.handleMessage({ kind: "rotate", newRunId: r2 }, emit);

    const deleteSpy = vi.spyOn(realStore, "deleteRun");
    await __INTERNAL.handleMessage({ kind: "delete_run", runId: r1 }, emit);

    expect(deleteSpy).toHaveBeenCalledWith(r1);
    // No ack on success (delete is fire-and-forget per task contract)
    const errorEvent = events.find(
      (e) => e.kind === "error" && e.cmdKind === "delete_run",
    );
    expect(errorEvent).toBeUndefined();
  });
});
