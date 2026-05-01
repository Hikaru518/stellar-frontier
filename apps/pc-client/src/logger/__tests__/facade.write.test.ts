import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../index";
import type { LogEntry, LogInput } from "../types";
import type { LogWorkerCommand, LogWorkerEvent } from "../worker-protocol";

/**
 * Test harness for the main-thread logger facade. Real Workers cannot be
 * instantiated under jsdom, so every test injects a `MockWorker` via the
 * `workerFactory` factory option. The mock records every `postMessage` and
 * exposes an `emit` helper to simulate worker→main events.
 */

class MockWorker {
  public posted: LogWorkerCommand[] = [];
  public onmessage: ((e: MessageEvent<LogWorkerEvent>) => void) | null = null;
  public terminated = false;

  postMessage(cmd: LogWorkerCommand): void {
    this.posted.push(cmd);
  }

  /** Drive a worker→main event into the facade's onmessage handler. */
  emit(event: LogWorkerEvent): void {
    this.onmessage?.({ data: event } as MessageEvent<LogWorkerEvent>);
  }

  terminate(): void {
    this.terminated = true;
  }
}

/** Construct a deterministic factory that always returns the same MockWorker. */
function fixedWorkerFactory(worker: MockWorker): () => Worker {
  return () => worker as unknown as Worker;
}

const FIXED_NOW = new Date("2026-05-01T02:44:00.000Z");
const FIXED_RUN_ID = "run-2026-05-01-0244-test";

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
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("logger facade — AC1: init handshake + buffered logs drain", () => {
  it("posts init first, buffers logs while pending, drains after ready", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
    });

    // First posted command must be `init` with the current runId.
    expect(worker.posted.length).toBe(1);
    expect(worker.posted[0]).toEqual({ kind: "init", runId: FIXED_RUN_ID });

    // 10 logs while still init_pending → no append yet.
    for (let i = 0; i < 10; i += 1) {
      logger.log(basePlayerInput(`c${i}`));
    }
    expect(worker.posted.filter((c) => c.kind === "append").length).toBe(0);
    expect(logger.getStatus().mode).toBe("init_pending");

    // Drive ready → facade should drain pending buffer immediately.
    worker.emit({ kind: "ready", runId: FIXED_RUN_ID });

    const appends = worker.posted.filter(
      (c): c is Extract<LogWorkerCommand, { kind: "append" }> => c.kind === "append",
    );
    const drained: LogEntry[] = appends.flatMap((c) => c.entries);
    expect(drained.length).toBe(10);
    // Sequence numbers are strictly increasing from 1.
    drained.forEach((entry, idx) => {
      expect(entry.seq).toBe(idx + 1);
      expect(entry.run_id).toBe(FIXED_RUN_ID);
    });
    expect(logger.getStatus().mode).toBe("ok");
    // Solo tab — once the writer-election claim grace expires the role
    // settles to `"writer"` (TASK-015 wired the election into the facade).
    vi.advanceTimersByTime(300);
    expect(logger.getStatus().writerRole).toBe("writer");

    logger._stop?.();
  });
});

describe("logger facade — AC2: batch flush thresholds", () => {
  it("flushes at the size threshold, on the timer, and on explicit flush()", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
      flushBatchSize: 50,
      flushIntervalMs: 500,
    });

    worker.emit({ kind: "ready", runId: FIXED_RUN_ID });
    // After ready, no pending entries yet — no append yet.
    const appendsBefore = worker.posted.filter((c) => c.kind === "append").length;
    expect(appendsBefore).toBe(0);

    // 49 logs — still below threshold, no append yet.
    for (let i = 0; i < 49; i += 1) {
      logger.log(basePlayerInput(`a${i}`));
    }
    expect(worker.posted.filter((c) => c.kind === "append").length).toBe(0);

    // 50th log triggers immediate flushPending — append must appear now.
    logger.log(basePlayerInput("a49"));
    const appendsAfter50 = worker.posted.filter(
      (c): c is Extract<LogWorkerCommand, { kind: "append" }> => c.kind === "append",
    );
    expect(appendsAfter50.length).toBeGreaterThanOrEqual(1);
    const totalEntriesAfter50 = appendsAfter50.flatMap((c) => c.entries).length;
    expect(totalEntriesAfter50).toBe(50);

    // 5 more logs → no immediate append (below threshold).
    for (let i = 0; i < 5; i += 1) {
      logger.log(basePlayerInput(`b${i}`));
    }
    const beforeTimer = worker.posted.filter((c) => c.kind === "append").length;
    // Advance 600ms — the flush timer fires and drains the 5 pending entries.
    vi.advanceTimersByTime(600);
    const appendsAfterTimer = worker.posted.filter(
      (c): c is Extract<LogWorkerCommand, { kind: "append" }> => c.kind === "append",
    );
    expect(appendsAfterTimer.length).toBeGreaterThan(beforeTimer);
    const lastTimerAppend = appendsAfterTimer[appendsAfterTimer.length - 1];
    expect(lastTimerAppend.entries.length).toBe(5);

    // Explicit flush waits on ack; emit ack matching latest seq.
    const flushPromise = logger.flush();
    // The facade must have posted a `flush` command after draining pending.
    expect(worker.posted.some((c) => c.kind === "flush")).toBe(true);
    worker.emit({ kind: "ack", upToSeq: 55 });
    await expect(flushPromise).resolves.toBeUndefined();

    logger._stop?.();
  });
});

describe("logger facade — AC3: fatal degrades to memory-only", () => {
  it("after fatal: log() does not throw, no further append, ringBuffer/subscribers still work, console.warn once", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
    });

    worker.emit({ kind: "fatal", reason: "opfs_unavailable" });
    expect(logger.getStatus().mode).toBe("memory_only");
    expect(logger.getStatus().reason).toBe("opfs_unavailable");

    const seenDeltas: LogEntry[][] = [];
    const unsub = logger.subscribe((delta) => {
      seenDeltas.push(delta.entries);
    });

    const appendsBefore = worker.posted.filter((c) => c.kind === "append").length;

    for (let i = 0; i < 10; i += 1) {
      expect(() => logger.log(basePlayerInput(`m${i}`))).not.toThrow();
    }

    // No new append commands posted to the worker after fatal.
    const appendsAfter = worker.posted.filter((c) => c.kind === "append").length;
    expect(appendsAfter).toBe(appendsBefore);

    // RingBuffer + subscribers still receive every entry.
    expect(logger.getRingBufferSnapshot().length).toBe(10);
    expect(seenDeltas.length).toBe(10);
    seenDeltas.forEach((entries) => expect(entries.length).toBe(1));

    // console.warn fired exactly once for the fatal degradation.
    expect(warnSpy).toHaveBeenCalledTimes(1);

    unsub();
    logger._stop?.();
  });
});

describe("logger facade — AC4: subscribe delta semantics", () => {
  it("listener fires with a single-entry delta on every log; unsubscribe stops further calls", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: FIXED_RUN_ID });

    const listener = vi.fn();
    const unsub = logger.subscribe(listener);

    logger.log(basePlayerInput("x1"));
    expect(listener).toHaveBeenCalledTimes(1);
    const firstCall = listener.mock.calls[0][0] as { entries: LogEntry[] };
    expect(firstCall.entries.length).toBe(1);
    expect(firstCall.entries[0].type).toBe("player.call.choice");

    unsub();
    logger.log(basePlayerInput("x2"));
    expect(listener).toHaveBeenCalledTimes(1);

    logger._stop?.();
  });
});

describe("logger facade — extras", () => {
  it("flush() resolves immediately when in memory_only mode", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "fatal", reason: "opfs_unavailable" });
    // No ack will ever come — should still resolve.
    await expect(logger.flush()).resolves.toBeUndefined();
    logger._stop?.();
  });

  it("getCurrentRunId returns the initialRunId", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
    });
    expect(logger.getCurrentRunId()).toBe(FIXED_RUN_ID);
    logger._stop?.();
  });

  it("worker creation failure silently degrades to memory_only", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = createLogger({
      workerFactory: () => {
        throw new Error("worker boot failed");
      },
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
    });
    expect(logger.getStatus().mode).toBe("memory_only");
    expect(() => logger.log(basePlayerInput("z"))).not.toThrow();
    expect(logger.getRingBufferSnapshot().length).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
    logger._stop?.();
  });

  it("log accepts an optional gameSeconds and stamps it onto the envelope", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: FIXED_RUN_ID });

    logger.log({ ...basePlayerInput("g1"), gameSeconds: 42 });
    logger.log(basePlayerInput("g2"));

    const snap = logger.getRingBufferSnapshot();
    expect(snap[0].occurred_at_game_seconds).toBe(42);
    expect(snap[1].occurred_at_game_seconds).toBe(0);
    logger._stop?.();
  });
});
