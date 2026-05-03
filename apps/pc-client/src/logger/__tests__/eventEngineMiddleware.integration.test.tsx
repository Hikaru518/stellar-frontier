import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../index";
import type { LogEntry } from "../types";
import type { LogWorkerCommand, LogWorkerEvent } from "../worker-protocol";
import type { TriggerContext } from "../../events/types";

/**
 * Integration tests for TASK-010 — App.tsx 接入：事件引擎日志
 * （event.trigger / event.node.enter / event.resolved）。
 *
 * 与 TASK-008 / TASK-009 一样不渲染 App（事件库 / 地图 / UI 渲染过重）。
 * 本测试由两部分组成：
 *
 *   (a) 静态源码断言：验证 App.tsx 在两个中央闸口
 *       (`processAppEventTrigger` / `processAppEventWakeups`) 内确实写入了
 *       正确 type/payload 的 logger.log 调用，并且 wakeups 不写
 *       `event.trigger`（design §9 的语义约定）。
 *
 *   (b) 行为模拟测试：用 createLogger + MockWorker 模拟三类条目等价的
 *       logger.log({...}) 调用，断言 ringBuffer 中产出的 LogEntry
 *       payload 与 LogInput 类型契约一致（design §9）。
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

// --- 静态源码断言：验证 App.tsx 中央闸口接入 ----------------------------------

describe("TASK-010 — App.tsx 事件引擎中间件源码接入断言", () => {
  // vitest 由 `apps/pc-client` 启动，process.cwd() 即包根目录。
  const appSourcePath = resolve(process.cwd(), "src/App.tsx");
  const appSource = readFileSync(appSourcePath, "utf-8");

  function bodyOf(fnDecl: string): string {
    const start = appSource.indexOf(fnDecl);
    expect(start).toBeGreaterThan(-1);
    const end = appSource.indexOf("\nfunction ", start + 1);
    expect(end).toBeGreaterThan(start);
    return appSource.slice(start, end);
  }

  it('AC1 — processAppEventTrigger 写 event.trigger 且早于 processTrigger(', () => {
    const body = bodyOf("function processAppEventTrigger(");
    expect(body).toMatch(/type:\s*"event\.trigger"/);
    const idxTrigger = body.indexOf('"event.trigger"');
    const idxProcess = body.indexOf("processTrigger(");
    expect(idxTrigger).toBeGreaterThan(-1);
    expect(idxProcess).toBeGreaterThan(-1);
    expect(idxTrigger).toBeLessThan(idxProcess);
  });

  it("AC2 — processAppEventTrigger 引用 transitions 字段并写 event.node.enter", () => {
    const body = bodyOf("function processAppEventTrigger(");
    expect(body).toMatch(/type:\s*"event\.node\.enter"/);
    expect(body).toMatch(/transitions/);
  });

  it("AC2 — processAppEventTrigger 通过 diffEventLogsAndLog 写 event.resolved", () => {
    const body = bodyOf("function processAppEventTrigger(");
    expect(body).toMatch(/diffEventLogsAndLog\(/);
    // event.resolved 类型字面量整文件中至少出现一次（source 模块级 helper 与/或
    // 内联调用）
    expect(appSource).toMatch(/type:\s*"event\.resolved"/);
  });

  it("AC1 — processAppEventWakeups 不写 event.trigger（trigger 是显式 dispatch 的语义）", () => {
    const body = bodyOf("function processAppEventWakeups(");
    expect(body).not.toMatch(/type:\s*"event\.trigger"/);
  });

  it("AC2 — processAppEventWakeups 写 event.node.enter 并通过 diffEventLogsAndLog 写 event.resolved", () => {
    const body = bodyOf("function processAppEventWakeups(");
    expect(body).toMatch(/type:\s*"event\.node\.enter"/);
    expect(body).toMatch(/transitions/);
    expect(body).toMatch(/diffEventLogsAndLog\(/);
  });

  it("event_engine 三类条目 source 全部为 event_engine", () => {
    const triggerBlock = appSource.match(
      /type:\s*"event\.trigger"[\s\S]{0,200}source:\s*"event_engine"/,
    );
    const nodeEnterBlocks = appSource.match(
      /type:\s*"event\.node\.enter"[\s\S]{0,200}source:\s*"event_engine"/g,
    );
    const resolvedBlocks = appSource.match(
      /type:\s*"event\.resolved"[\s\S]{0,200}source:\s*"event_engine"/g,
    );
    expect(triggerBlock).not.toBeNull();
    expect(nodeEnterBlocks?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(resolvedBlocks?.length ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("diffEventLogsAndLog helper 在 App.tsx 内被定义", () => {
    expect(appSource).toMatch(/function\s+diffEventLogsAndLog\s*\(/);
  });
});

// --- 行为模拟测试：验证 LogInput 类型契约可被消费 ------------------------------

describe("TASK-010 — event_engine 三类条目等价日志写入 ringBuffer", () => {
  it("AC3 — event.trigger payload.trigger 等于完整 TriggerContext", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    const ctx: TriggerContext = {
      trigger_type: "call_choice",
      occurred_at: 0,
      source: "call",
      crew_id: "c1",
      tile_id: null,
      action_id: null,
      payload: {},
    };

    logger.log({
      type: "event.trigger",
      source: "event_engine",
      payload: { trigger: ctx },
      gameSeconds: 0,
    });

    const snap = logger.getRingBufferSnapshot();
    const last = snap[snap.length - 1];
    expect(last.type).toBe("event.trigger");
    expect(last.source).toBe("event_engine");
    if (last.type === "event.trigger") {
      expect(last.payload.trigger).toEqual(ctx);
    }

    logger._stop?.();
  });

  it("AC3 — event.node.enter payload 结构与 design §9 一致", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    logger.log({
      type: "event.node.enter",
      source: "event_engine",
      payload: { event_id: "e1", from_node_id: null, to_node_id: "n1" },
      gameSeconds: 5,
    });
    logger.log({
      type: "event.node.enter",
      source: "event_engine",
      payload: { event_id: "e1", from_node_id: "n1", to_node_id: "n2" },
      gameSeconds: 5,
    });

    const snap = logger.getRingBufferSnapshot();
    const enters = snap.filter((e) => e.type === "event.node.enter");
    expect(enters.length).toBe(2);
    if (enters[0].type === "event.node.enter") {
      expect(enters[0].payload).toEqual({
        event_id: "e1",
        from_node_id: null,
        to_node_id: "n1",
      });
    }
    if (enters[1].type === "event.node.enter") {
      expect(enters[1].payload).toEqual({
        event_id: "e1",
        from_node_id: "n1",
        to_node_id: "n2",
      });
    }
    expect(enters[0].occurred_at_game_seconds).toBe(5);

    logger._stop?.();
  });

  it("AC3 — event.resolved payload 结构与 design §9 一致", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    logger.log({
      type: "event.resolved",
      source: "event_engine",
      payload: {
        event_log_id: "el1",
        event_id: "e1",
        event_definition_id: "def1",
        result_key: "ok",
        summary: "summary text",
        importance: "minor",
      },
      gameSeconds: 10,
    });

    const snap = logger.getRingBufferSnapshot();
    const last = snap[snap.length - 1];
    expect(last.type).toBe("event.resolved");
    expect(last.source).toBe("event_engine");
    if (last.type === "event.resolved") {
      expect(last.payload).toEqual({
        event_log_id: "el1",
        event_id: "e1",
        event_definition_id: "def1",
        result_key: "ok",
        summary: "summary text",
        importance: "minor",
      });
    }
    expect(last.occurred_at_game_seconds).toBe(10);

    logger._stop?.();
  });

  it("event.resolved payload 兼容 result_key / summary 为 null", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    logger.log({
      type: "event.resolved",
      source: "event_engine",
      payload: {
        event_log_id: "el2",
        event_id: "e2",
        event_definition_id: "def2",
        result_key: null,
        summary: null,
        importance: "normal",
      },
      gameSeconds: 11,
    });

    const snap = logger.getRingBufferSnapshot();
    const last = snap[snap.length - 1];
    if (last.type === "event.resolved") {
      expect(last.payload.result_key).toBeNull();
      expect(last.payload.summary).toBeNull();
      expect(last.payload.importance).toBe("normal");
    }

    logger._stop?.();
  });
});

// 让类型在文件中至少出现一次，避免 unused-import lint 抱怨
type _LogEntryShape = LogEntry;
