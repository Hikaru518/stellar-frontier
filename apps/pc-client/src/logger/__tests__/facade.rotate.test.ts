import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LogEntry, LogInput, RunArchive } from "../types";
import type { LogWorkerCommand, LogWorkerEvent } from "../worker-protocol";

// `triggerDownload` is mocked module-wide so every test can read the captured
// arguments without touching real DOM URL APIs. Each test resets the mock.
vi.mock("../download", () => ({
  triggerDownload: vi.fn(),
}));

import { triggerDownload } from "../download";
import { createLogger } from "../index";

/**
 * Test harness for the rotate / read / list / delete / export side of the
 * facade. Reuses the MockWorker pattern from facade.write.test.ts but keeps
 * a local copy here to avoid coupling the two test files.
 */

class MockWorker {
  public posted: LogWorkerCommand[] = [];
  public onmessage: ((e: MessageEvent<LogWorkerEvent>) => void) | null = null;
  public terminated = false;

  postMessage(cmd: LogWorkerCommand): void {
    this.posted.push(cmd);
  }

  emit(event: LogWorkerEvent): void {
    this.onmessage?.({ data: event } as MessageEvent<LogWorkerEvent>);
  }

  terminate(): void {
    this.terminated = true;
  }
}

function fixedWorkerFactory(worker: MockWorker): () => Worker {
  return () => worker as unknown as Worker;
}

const FIXED_NOW = new Date("2026-05-01T02:44:00.000Z");
const INITIAL_RUN_ID = "run-2026-05-01-0244-init";
const ROTATED_RUN_ID = "run-2026-05-01-0244-rota";

function basePlayerInput(seed: string): LogInput {
  return {
    type: "player.call.choice",
    source: "player_command",
    payload: { call_id: seed, choice_key: "ok", crew_id: null },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
  vi.mocked(triggerDownload).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- AC1: rotate basic flow --------------------------------------------------

describe("logger facade — AC1: rotate basic flow", () => {
  it("flushes the old run, posts rotate, restarts seq, and isolates writes per runId", async () => {
    const worker = new MockWorker();
    let nextRunId = ROTATED_RUN_ID;
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
      // Stub the random source so a fresh runId would be predictable, but the
      // injectable `runIdFactory` is what rotate actually consumes.
      runIdFactory: () => nextRunId,
    });

    // Drive ready for the initial run.
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    // 5 logs in old run.
    for (let i = 0; i < 5; i += 1) {
      logger.log(basePlayerInput(`old${i}`));
    }

    const rotatePromise = logger.rotate("reset");

    // Facade must have flushed pending and posted a flush command before rotate.
    const beforeFlushAck = worker.posted.map((c) => c.kind);
    expect(beforeFlushAck).toContain("append");
    expect(beforeFlushAck).toContain("flush");

    // Old-run append must contain exactly the 5 entries we logged with seq 1..5.
    const firstAppend = worker.posted.find(
      (c): c is Extract<LogWorkerCommand, { kind: "append" }> => c.kind === "append",
    );
    expect(firstAppend).toBeDefined();
    expect(firstAppend!.entries.length).toBe(5);
    firstAppend!.entries.forEach((entry, idx) => {
      expect(entry.seq).toBe(idx + 1);
      expect(entry.run_id).toBe(INITIAL_RUN_ID);
    });

    // Ack the flush so rotate can proceed.
    worker.emit({ kind: "ack", upToSeq: 5 });

    // Allow the awaited flush() inside rotate to settle so the subsequent
    // postMessage(rotate) actually fires before we assert on it.
    await Promise.resolve();
    await Promise.resolve();

    // Now the rotate command must be posted with the new runId.
    const rotateCmd = worker.posted.find(
      (c): c is Extract<LogWorkerCommand, { kind: "rotate" }> => c.kind === "rotate",
    );
    expect(rotateCmd).toBeDefined();
    expect(rotateCmd!.newRunId).toBe(ROTATED_RUN_ID);

    // Worker confirms by emitting `ready` with the new runId.
    worker.emit({ kind: "ready", runId: ROTATED_RUN_ID });

    const newRunId = await rotatePromise;
    expect(newRunId).toBe(ROTATED_RUN_ID);
    expect(logger.getCurrentRunId()).toBe(ROTATED_RUN_ID);

    // 3 logs in the new run.
    for (let i = 0; i < 3; i += 1) {
      logger.log(basePlayerInput(`new${i}`));
    }

    // Force a flush so the new appends actually leave the pending queue.
    const flushPromise = logger.flush();
    // The facade should have posted a fresh append with the new runId and
    // seq starting at 1 again.
    const newAppends = worker.posted.filter(
      (c): c is Extract<LogWorkerCommand, { kind: "append" }> =>
        c.kind === "append" && c.entries[0]?.run_id === ROTATED_RUN_ID,
    );
    expect(newAppends.length).toBeGreaterThanOrEqual(1);
    const newEntries = newAppends.flatMap((c) => c.entries);
    expect(newEntries.length).toBe(3);
    newEntries.forEach((entry, idx) => {
      expect(entry.seq).toBe(idx + 1);
      expect(entry.run_id).toBe(ROTATED_RUN_ID);
    });

    // Ring buffer must have been cleared on rotate; only the 3 new entries
    // remain.
    const snap = logger.getRingBufferSnapshot();
    expect(snap.length).toBe(3);
    expect(snap.every((e) => e.run_id === ROTATED_RUN_ID)).toBe(true);

    // Ack the new flush so the test promise can settle.
    worker.emit({ kind: "ack", upToSeq: 3 });
    await flushPromise;

    logger._stop?.();
  });

  it("listRuns posts list_runs and resolves with the runs payload", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    const fakeRuns: RunArchive[] = [
      {
        run_id: INITIAL_RUN_ID,
        created_at_real_time: FIXED_NOW.toISOString(),
        updated_at_real_time: FIXED_NOW.toISOString(),
        size_bytes: 10,
        is_current: true,
      },
    ];
    const listPromise = logger.listRuns();
    expect(worker.posted.some((c) => c.kind === "list_runs")).toBe(true);
    worker.emit({ kind: "runs", runs: fakeRuns });
    await expect(listPromise).resolves.toEqual(fakeRuns);

    logger._stop?.();
  });

  it("readRun posts read_run and resolves with bytes for the matching runId", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    const buf = new ArrayBuffer(4);
    const readPromise = logger.readRun("run-other");
    const cmd = worker.posted.find(
      (c): c is Extract<LogWorkerCommand, { kind: "read_run" }> => c.kind === "read_run",
    );
    expect(cmd).toBeDefined();
    expect(cmd!.runId).toBe("run-other");

    // Emit a stale event for a different runId first — should NOT resolve.
    worker.emit({ kind: "run_data", runId: "run-stale", bytes: new ArrayBuffer(2) });
    // Then the matching one resolves.
    worker.emit({ kind: "run_data", runId: "run-other", bytes: buf });
    const result = await readPromise;
    expect(result).toBe(buf);

    logger._stop?.();
  });
});

// --- AC2: deleteRun(currentRunId) rejects locally ----------------------------

describe("logger facade — AC2: deleteRun(currentRunId) rejects locally", () => {
  it("rejects with LoggerError code=writer_busy and never posts delete_run", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    const before = worker.posted.filter((c) => c.kind === "delete_run").length;
    await expect(logger.deleteRun(logger.getCurrentRunId())).rejects.toMatchObject({
      name: "LoggerError",
      code: "writer_busy",
    });
    const after = worker.posted.filter((c) => c.kind === "delete_run").length;
    expect(after).toBe(before);
    expect(after).toBe(0);

    logger._stop?.();
  });

  it("posts delete_run for a different runId and resolves immediately (fire-and-forget)", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    await expect(logger.deleteRun("run-some-other")).resolves.toBeUndefined();
    const deletes = worker.posted.filter(
      (c): c is Extract<LogWorkerCommand, { kind: "delete_run" }> => c.kind === "delete_run",
    );
    expect(deletes.length).toBe(1);
    expect(deletes[0].runId).toBe("run-some-other");

    logger._stop?.();
  });
});

// --- AC3: exportCurrent triggers download ------------------------------------

describe("logger facade — AC3: exportCurrent triggers download", () => {
  it("flushes, reads the current run, then calls triggerDownload with the right filename + blob", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    logger.log(basePlayerInput("e1"));

    const exportPromise = logger.exportCurrent();
    // exportCurrent must first flush — pending append + flush should appear.
    expect(worker.posted.some((c) => c.kind === "append")).toBe(true);
    expect(worker.posted.some((c) => c.kind === "flush")).toBe(true);

    // No read_run yet — the facade should be waiting on flush ack.
    expect(worker.posted.some((c) => c.kind === "read_run")).toBe(false);

    worker.emit({ kind: "ack", upToSeq: 1 });
    await Promise.resolve();
    await Promise.resolve();

    // After ack, exportCurrent should have posted read_run for the current id.
    const readCmd = worker.posted.find(
      (c): c is Extract<LogWorkerCommand, { kind: "read_run" }> => c.kind === "read_run",
    );
    expect(readCmd).toBeDefined();
    expect(readCmd!.runId).toBe(INITIAL_RUN_ID);

    const bytes = new TextEncoder().encode(
      JSON.stringify({ run_id: INITIAL_RUN_ID }) + "\n",
    ).buffer;
    worker.emit({ kind: "run_data", runId: INITIAL_RUN_ID, bytes });
    await exportPromise;

    expect(triggerDownload).toHaveBeenCalledTimes(1);
    const [blobArg, filenameArg] = vi.mocked(triggerDownload).mock.calls[0];
    expect(filenameArg).toBe(`${INITIAL_RUN_ID}.jsonl`);
    expect(blobArg).toBeInstanceOf(Blob);
    expect((blobArg as Blob).type).toBe("application/x-ndjson");

    logger._stop?.();
  });
});

// --- AC4: rotate-window logs are not lost ------------------------------------

describe("logger facade — AC4: rotate-window logs are not lost", () => {
  it("logs arriving during rotate end up in the new run with seq starting at 1", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
      runIdFactory: () => ROTATED_RUN_ID,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    // 5 logs in old run.
    for (let i = 0; i < 5; i += 1) {
      logger.log(basePlayerInput(`o${i}`));
    }

    const rotatePromise = logger.rotate("reset");

    // Ack old run's flush so rotate can post.
    worker.emit({ kind: "ack", upToSeq: 5 });
    await Promise.resolve();
    await Promise.resolve();

    // 3 logs *while rotate is in flight* (after we asked, before ready).
    for (let i = 0; i < 3; i += 1) {
      logger.log(basePlayerInput(`m${i}`));
    }

    // Worker now confirms rotate.
    worker.emit({ kind: "ready", runId: ROTATED_RUN_ID });
    const newRunId = await rotatePromise;
    expect(newRunId).toBe(ROTATED_RUN_ID);

    // 5 more logs after rotate completes.
    for (let i = 0; i < 5; i += 1) {
      logger.log(basePlayerInput(`p${i}`));
    }

    // Drain everything.
    const flushPromise = logger.flush();

    // Old-run appends should never have included the mid-rotate logs.
    const oldAppends = worker.posted.filter(
      (c): c is Extract<LogWorkerCommand, { kind: "append" }> =>
        c.kind === "append" && c.entries.every((e) => e.run_id === INITIAL_RUN_ID),
    );
    const oldEntries = oldAppends.flatMap((c) => c.entries);
    expect(oldEntries.length).toBe(5);

    // New-run appends should contain all 8 entries (3 mid-rotate + 5 after),
    // with seq numbers 1..8 in order.
    const newAppends = worker.posted.filter(
      (c): c is Extract<LogWorkerCommand, { kind: "append" }> =>
        c.kind === "append" && c.entries.every((e) => e.run_id === ROTATED_RUN_ID),
    );
    const newEntries = newAppends.flatMap((c) => c.entries);
    expect(newEntries.length).toBe(8);
    newEntries.forEach((entry, idx) => {
      expect(entry.seq).toBe(idx + 1);
      expect(entry.run_id).toBe(ROTATED_RUN_ID);
    });

    worker.emit({ kind: "ack", upToSeq: 8 });
    await flushPromise;

    logger._stop?.();
  });
});

// --- Memory-only mode --------------------------------------------------------

describe("logger facade — memory_only fallback for rotate / listRuns / readRun", () => {
  it("rotate resolves with a fresh runId, clears ring buffer, and seq restarts at 1", async () => {
    const worker = new MockWorker();
    let nextRunId = ROTATED_RUN_ID;
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
      runIdFactory: () => nextRunId,
    });
    // Drop straight into memory_only.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    worker.emit({ kind: "fatal", reason: "opfs_unavailable" });

    logger.log(basePlayerInput("a"));
    logger.log(basePlayerInput("b"));
    expect(logger.getRingBufferSnapshot().length).toBe(2);

    const newId = await logger.rotate("reset");
    expect(newId).toBe(ROTATED_RUN_ID);
    expect(logger.getCurrentRunId()).toBe(ROTATED_RUN_ID);
    expect(logger.getRingBufferSnapshot().length).toBe(0);

    // After rotate, a fresh log gets seq=1 in the new run.
    logger.log(basePlayerInput("c"));
    const snap = logger.getRingBufferSnapshot();
    expect(snap.length).toBe(1);
    expect(snap[0].seq).toBe(1);
    expect(snap[0].run_id).toBe(ROTATED_RUN_ID);

    logger._stop?.();
  });

  it("listRuns resolves with [] in memory_only mode", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    worker.emit({ kind: "fatal", reason: "opfs_unavailable" });

    await expect(logger.listRuns()).resolves.toEqual([]);
    logger._stop?.();
  });

  it("readRun rejects with LoggerError code=opfs_unavailable in memory_only mode", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    worker.emit({ kind: "fatal", reason: "opfs_unavailable" });

    await expect(logger.readRun(INITIAL_RUN_ID)).rejects.toMatchObject({
      name: "LoggerError",
      code: "opfs_unavailable",
    });
    logger._stop?.();
  });
});

// --- exportRun forwards to triggerDownload -----------------------------------

describe("logger facade — exportRun(runId)", () => {
  it("reads the named run and downloads it", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    const exportPromise = logger.exportRun("run-archive-1");
    const readCmd = worker.posted.find(
      (c): c is Extract<LogWorkerCommand, { kind: "read_run" }> => c.kind === "read_run",
    );
    expect(readCmd).toBeDefined();
    expect(readCmd!.runId).toBe("run-archive-1");

    const bytes = new ArrayBuffer(8);
    worker.emit({ kind: "run_data", runId: "run-archive-1", bytes });
    await exportPromise;

    expect(triggerDownload).toHaveBeenCalledTimes(1);
    const [, filename] = vi.mocked(triggerDownload).mock.calls[0];
    expect(filename).toBe("run-archive-1.jsonl");

    // exportRun must NOT post a flush — it's only needed for the live run.
    expect(worker.posted.some((c) => c.kind === "flush")).toBe(false);

    logger._stop?.();
  });
});

// Sanity: the LogEntry type lives in scope for the suites above.
type _TypeCheck = LogEntry;
