import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../index";
import type { LogEntry } from "../types";
import type { LogWorkerCommand, LogWorkerEvent } from "../worker-protocol";

/**
 * Integration tests for TASK-016 — App.tsx beforeunload 接入。
 *
 * 与 reset.integration.test.tsx 一致的策略：不渲染 <App />（依赖太多），
 * 而是 (a) 静态源码断言验证 App.tsx 确实注册了 beforeunload listener、
 * 调用 logger.log + logger.flush 与使用 elapsedGameSecondsRef；
 * (b) 行为模拟测试，用 createLogger + MockWorker 验证 system.run.end{reason:"unload"}
 * 通过 LogInputWithContext 类型校验且 ringBuffer 字段正确，并验证 memory_only
 * 路径下不抛。
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- AC1/AC2: 静态源码断言 ---------------------------------------------------

describe("TASK-016 — App.tsx 源码接入断言", () => {
  // vitest 由 `apps/pc-client` 启动，process.cwd() 即包根目录。
  const appSourcePath = resolve(process.cwd(), "src/App.tsx");
  const appSource = readFileSync(appSourcePath, "utf-8");

  it("AC1: App.tsx 注册 beforeunload listener (window.addEventListener)", () => {
    expect(appSource).toMatch(/window\.addEventListener\(\s*["']beforeunload["']/);
  });

  it("AC1: App.tsx 注册 beforeunload listener 并 cleanup (window.removeEventListener)", () => {
    expect(appSource).toMatch(/window\.removeEventListener\(\s*["']beforeunload["']/);
  });

  it("AC1: beforeunload handler 写 system.run.end{reason:\"unload\"}", () => {
    // 必须含 system.run.end + reason: "unload" 两个 token；用 multiline 兼容。
    expect(appSource).toMatch(/system\.run\.end[\s\S]*reason:\s*["']unload["']/);
  });

  it("AC1: beforeunload handler 调用 logger.flush()", () => {
    expect(appSource).toMatch(/logger\.flush\s*\(\s*\)/);
  });

  it("AC2: handler 用 elapsedGameSecondsRef 读最新 gameSeconds", () => {
    expect(appSource).toMatch(/elapsedGameSecondsRef/);
  });

  it("AC2: 引入 useRef import (用于 elapsedGameSecondsRef)", () => {
    expect(appSource).toMatch(/\buseRef\b/);
  });
});

// --- AC3: LogInputWithContext 类型校验 + ringBuffer entry 字段 ----------------

describe("TASK-016 / AC3 — LogInputWithContext 类型校验 + ringBuffer entry 字段", () => {
  it("logger.log({type:'system.run.end', source:'system', payload:{reason:'unload'}, gameSeconds: 100}) 写入 ringBuffer 字段正确", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    logger.log({
      type: "system.run.end",
      source: "system",
      payload: { reason: "unload" },
      gameSeconds: 100,
    });

    const snap = logger.getRingBufferSnapshot();
    expect(snap.length).toBe(1);
    const last = snap[0];
    expect(last.type).toBe("system.run.end");
    expect(last.source).toBe("system");
    if (last.type === "system.run.end") {
      expect(last.payload).toEqual({ reason: "unload" });
    }
    expect(last.occurred_at_game_seconds).toBe(100);
    expect(last.run_id).toBe(INITIAL_RUN_ID);

    logger._stop?.();
  });
});

// --- AC4: memory_only 模式下 logger.log + logger.flush 不抛 -------------------

describe("TASK-016 / AC4 — memory_only 模式下 handler 路径不抛", () => {
  it("worker fatal 后 logger.log({type:'system.run.end', payload:{reason:'unload'}}) 不抛 / logger.flush 不 reject", async () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    // 直接进入 memory_only
    worker.emit({ kind: "fatal", reason: "opfs_unavailable" });

    expect(() => {
      logger.log({
        type: "system.run.end",
        source: "system",
        payload: { reason: "unload" },
        gameSeconds: 42,
      });
    }).not.toThrow();

    await expect(logger.flush()).resolves.toBeUndefined();

    // ring buffer 仍然记录
    const snap = logger.getRingBufferSnapshot();
    expect(snap.length).toBeGreaterThanOrEqual(1);
    expect(snap[snap.length - 1].type).toBe("system.run.end");

    logger._stop?.();
  });
});

// 让类型在文件中至少出现一次，避免 unused-import lint 抱怨
type _LogEntryShape = LogEntry;
