import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../index";
import type { LogEntry } from "../types";
import type { LogWorkerCommand, LogWorkerEvent } from "../worker-protocol";
import { GAME_SAVE_SCHEMA_VERSION } from "../../timeSystem";

/**
 * Integration tests for TASK-008 — App.tsx logger接入。
 *
 * 由于真实渲染 <App /> 依赖事件库 / 地图 / UI / localStorage 等大量内容，
 * 本测试不渲染 App，而是构造 createLogger + MockWorker，模拟 App.tsx 在
 * (a) 首次挂载 (b) resetGame() 等价的调用序列，并对 ringBuffer / worker.posted
 * 做断言。
 *
 * 这一约束在任务说明 §2 中被明确：本 task 简化为模拟调用序列。
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- 2A: App 首次挂载等价的 logger.log(run.start) -----------------------------

describe("TASK-008 / 2A — App 首次挂载等价：写入 system.run.start", () => {
  it("ring buffer 第一条是 system.run.start，payload.game_version 非空，schema_version === GAME_SAVE_SCHEMA_VERSION", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    // 模拟 App.tsx 首次挂载的 useEffect
    const gameVersion = (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__;
    logger.log({
      type: "system.run.start",
      source: "system",
      payload: {
        game_version: gameVersion ?? "",
        schema_version: GAME_SAVE_SCHEMA_VERSION,
      },
      gameSeconds: 0,
    });

    const snapshot = logger.getRingBufferSnapshot();
    expect(snapshot.length).toBeGreaterThanOrEqual(1);
    const first = snapshot[0];
    expect(first.type).toBe("system.run.start");
    expect(first.source).toBe("system");
    if (first.type === "system.run.start") {
      expect(first.payload.game_version).toBeTruthy();
      expect(first.payload.game_version.length).toBeGreaterThan(0);
      expect(first.payload.schema_version).toBe(GAME_SAVE_SCHEMA_VERSION);
    }
    expect(first.occurred_at_game_seconds).toBe(0);

    logger._stop?.();
  });
});

// --- 2B: resetGame 等价序列 — run.end + flush + rotate + run.start -----------

describe("TASK-008 / 2B — resetGame 等价序列：run.end + rotate + run.start", () => {
  it("worker.posted 含 init / append(run.end) / flush / rotate / append(run.start)；ring buffer 顺序正确", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
      runIdFactory: () => ROTATED_RUN_ID,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    // 模拟 App 首次挂载（旧 run 起点）
    const gameVersion =
      (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ ?? "0.0.0";
    logger.log({
      type: "system.run.start",
      source: "system",
      payload: { game_version: gameVersion, schema_version: GAME_SAVE_SCHEMA_VERSION },
      gameSeconds: 0,
    });

    // 模拟 resetGame() 的逻辑序列：
    // 1) 同步 log run.end (旧 run)
    logger.log({
      type: "system.run.end",
      source: "system",
      payload: { reason: "reset" },
      gameSeconds: 1234,
    });

    // 2) 异步 flush -> rotate -> log run.start (新 run)
    const resetPromise = (async () => {
      await logger.flush();
      const newRunId = await logger.rotate("reset");
      logger.log({
        type: "system.run.start",
        source: "system",
        payload: { game_version: gameVersion, schema_version: GAME_SAVE_SCHEMA_VERSION },
        gameSeconds: 0,
      });
      return newRunId;
    })();

    // 推进 microtask；flush() 已将 pending append 与 flush 命令 post 出去
    await Promise.resolve();
    await Promise.resolve();

    // 旧 run 的 append + flush 必须在 ack 之前已经 post
    expect(worker.posted.some((c) => c.kind === "init")).toBe(true);
    const appendsBeforeAck = worker.posted.filter(
      (c): c is Extract<LogWorkerCommand, { kind: "append" }> => c.kind === "append",
    );
    expect(appendsBeforeAck.length).toBeGreaterThanOrEqual(1);
    const flatBeforeAck = appendsBeforeAck.flatMap((c) => c.entries);
    expect(flatBeforeAck.some((e) => e.type === "system.run.start" && e.run_id === INITIAL_RUN_ID)).toBe(true);
    expect(flatBeforeAck.some((e) => e.type === "system.run.end" && e.run_id === INITIAL_RUN_ID)).toBe(true);
    expect(worker.posted.some((c) => c.kind === "flush")).toBe(true);

    // ack 旧 run 的两条 entry，rotate 才能继续
    worker.emit({ kind: "ack", upToSeq: 2 });
    await Promise.resolve();
    await Promise.resolve();

    // 现在 rotate 命令应已 post，且新 runId 一致
    const rotateCmd = worker.posted.find(
      (c): c is Extract<LogWorkerCommand, { kind: "rotate" }> => c.kind === "rotate",
    );
    expect(rotateCmd).toBeDefined();
    expect(rotateCmd!.newRunId).toBe(ROTATED_RUN_ID);

    // 新 run ready
    worker.emit({ kind: "ready", runId: ROTATED_RUN_ID });
    const newRunId = await resetPromise;
    expect(newRunId).toBe(ROTATED_RUN_ID);

    // run.start (新 run) 已写入 ring buffer
    const snap = logger.getRingBufferSnapshot();
    expect(snap.length).toBeGreaterThanOrEqual(1);
    expect(snap[0].type).toBe("system.run.start");
    expect(snap[0].run_id).toBe(ROTATED_RUN_ID);

    // 把新 run 的 append 也驱动出去（新 run.start 的 append）
    const flushAfter = logger.flush();
    const appendsAfter = worker.posted.filter(
      (c): c is Extract<LogWorkerCommand, { kind: "append" }> => c.kind === "append",
    );
    const newRunAppendEntries = appendsAfter.flatMap((c) => c.entries).filter((e) => e.run_id === ROTATED_RUN_ID);
    expect(newRunAppendEntries.some((e) => e.type === "system.run.start")).toBe(true);

    worker.emit({ kind: "ack", upToSeq: 99 });
    await flushAfter;

    // 命令序列断言：init -> append(run.start old) -> append(run.end) -> flush -> rotate -> append(run.start new)
    const kinds = worker.posted.map((c) => c.kind);
    const initIdx = kinds.indexOf("init");
    const flushIdx = kinds.indexOf("flush");
    const rotateIdx = kinds.indexOf("rotate");
    expect(initIdx).toBeGreaterThanOrEqual(0);
    expect(flushIdx).toBeGreaterThan(initIdx);
    expect(rotateIdx).toBeGreaterThan(flushIdx);

    logger._stop?.();
  });
});

// --- 2C: OPFS 不可用 — 流程仍正常 --------------------------------------------

describe("TASK-008 / 2C — worker fatal 后 reset 流程仍正常", () => {
  it("worker fatal 后 logger.log/flush/rotate/log 全部不抛、ring buffer 仍累计", async () => {
    const worker = new MockWorker();
    let nextId = ROTATED_RUN_ID;
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
      runIdFactory: () => nextId,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // 直接进入 memory_only 模式
    worker.emit({ kind: "fatal", reason: "opfs_unavailable" });

    const gameVersion =
      (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ ?? "0.0.0";

    // 模拟 App 首次挂载的 run.start
    expect(() => {
      logger.log({
        type: "system.run.start",
        source: "system",
        payload: { game_version: gameVersion, schema_version: GAME_SAVE_SCHEMA_VERSION },
        gameSeconds: 0,
      });
    }).not.toThrow();

    // 模拟 resetGame() 序列
    expect(() => {
      logger.log({
        type: "system.run.end",
        source: "system",
        payload: { reason: "reset" },
        gameSeconds: 42,
      });
    }).not.toThrow();

    // flush 不抛（memory_only 立即 resolve）
    await expect(logger.flush()).resolves.toBeUndefined();

    // rotate 不抛（memory_only 也 resolve 一个新的 runId）
    const newRunId = await logger.rotate("reset");
    expect(newRunId).toBe(ROTATED_RUN_ID);
    expect(logger.getCurrentRunId()).toBe(ROTATED_RUN_ID);

    // 新 run 的 run.start
    expect(() => {
      logger.log({
        type: "system.run.start",
        source: "system",
        payload: { game_version: gameVersion, schema_version: GAME_SAVE_SCHEMA_VERSION },
        gameSeconds: 0,
      });
    }).not.toThrow();

    // ring buffer 仍然记录 — rotate 会清空，所以最后一条是新的 run.start
    const snap = logger.getRingBufferSnapshot();
    expect(snap.length).toBeGreaterThanOrEqual(1);
    expect(snap[snap.length - 1].type).toBe("system.run.start");
    expect(snap[snap.length - 1].run_id).toBe(ROTATED_RUN_ID);

    logger._stop?.();
  });
});

// --- AC3: 连续 rotate 11 次返回 11 个不同 newRunId ---------------------------

describe("TASK-008 / AC3 — 连续 rotate 11 次返回 11 个不同 newRunId", () => {
  it("memory_only 模式下连续调用 rotate 11 次，每次返回的 newRunId 都唯一", async () => {
    const worker = new MockWorker();
    let counter = 0;
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
      runIdFactory: () => {
        counter += 1;
        return `run-2026-05-01-0244-r${counter.toString().padStart(2, "0")}`;
      },
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // 直接进入 memory_only 让 rotate 走 short-circuit 路径，不依赖 worker。
    worker.emit({ kind: "fatal", reason: "opfs_unavailable" });

    const ids: string[] = [];
    for (let i = 0; i < 11; i += 1) {
      const id = await logger.rotate("reset");
      ids.push(id);
    }

    expect(ids.length).toBe(11);
    expect(new Set(ids).size).toBe(11);
    expect(ids[0]).not.toBe(ids[10]);

    logger._stop?.();
  });
});

// --- 静态源码检查：验证 App.tsx 确实接入了 logger -----------------------------
// 这一节是真正的 RED 守门：在 App.tsx 被改造之前会失败，确保前面 2A/2B/2C/AC3
// 的"等价序列"断言不会被静默忽略。

describe("TASK-008 — App.tsx 源码接入断言", () => {
  // vitest 由 `apps/pc-client` 启动，process.cwd() 即包根目录。
  const appSourcePath = resolve(process.cwd(), "src/App.tsx");
  const appSource = readFileSync(appSourcePath, "utf-8");

  it("从 ./logger 导入 logger 单例", () => {
    expect(appSource).toMatch(/from\s+["']\.\/logger["']/);
    expect(appSource).toMatch(/\blogger\b/);
  });

  it("首次挂载的 useEffect 调用 logger.log({ type: \"system.run.start\" })", () => {
    expect(appSource).toMatch(/system\.run\.start/);
    expect(appSource).toMatch(/__APP_VERSION__/);
    expect(appSource).toMatch(/GAME_SAVE_SCHEMA_VERSION/);
  });

  it("resetGame 调用 logger.log({ type: \"system.run.end\", payload: { reason: \"reset\" } })", () => {
    expect(appSource).toMatch(/system\.run\.end/);
    expect(appSource).toMatch(/reason:\s*["']reset["']/);
  });

  it("resetGame 调用 logger.flush() 与 logger.rotate(\"reset\")", () => {
    expect(appSource).toMatch(/logger\.flush\s*\(\)/);
    expect(appSource).toMatch(/logger\.rotate\s*\(\s*["']reset["']\s*\)/);
  });
});

// 让类型在文件中至少出现一次，避免 unused-import lint 抱怨
type _LogEntryShape = LogEntry;
