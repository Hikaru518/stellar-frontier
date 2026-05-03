import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../index";
import type { LogEntry } from "../types";
import type { LogWorkerCommand, LogWorkerEvent } from "../worker-protocol";

/**
 * Integration tests for TASK-017 — App.tsx 接入：settleGameTime 行动终态 diff
 * 写 action.complete。
 *
 * 与 TASK-008/009 一样不渲染 App（事件库/地图/UI 渲染过重）。本测试由两部分组成：
 *
 *   (a) 静态源码断言：验证 App.tsx 定义了 TERMINAL_ACTION_STATUSES + diffActionsAndLog
 *       并在 setGameState 内调用比较 prev/next 的 crew_actions；diff 写入的
 *       action.complete 包含 crew_id / action_id / action_kind / status 字段，
 *       并且 action_kind 取自 CrewActionState.type。
 *
 *   (b) 行为模拟测试：用 createLogger + MockWorker 验证 LogInputWithContext
 *       type="action.complete" 的 payload schema 通过类型校验，且 ringBuffer 中
 *       payload 字段与传入一致（覆盖 4 个终态：completed / interrupted / failed /
 *       cancelled）。
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

// --- 静态源码断言：验证 App.tsx 定义并接入 diffActionsAndLog ----------------------

describe("TASK-017 — App.tsx settleGameTime diff 源码接入断言", () => {
  // vitest 由 `apps/pc-client` 启动，process.cwd() 即包根目录。
  const appSourcePath = resolve(process.cwd(), "src/App.tsx");
  const appSource = readFileSync(appSourcePath, "utf-8");

  it("App.tsx 定义 diffActionsAndLog 函数", () => {
    expect(appSource).toMatch(/function diffActionsAndLog\(/);
  });

  it("App.tsx 定义 TERMINAL_ACTION_STATUSES 集合，含 4 个终态", () => {
    expect(appSource).toMatch(/TERMINAL_ACTION_STATUSES/);
    // 4 个终态字符串都必须出现在 TERMINAL_ACTION_STATUSES 的字面量定义里
    expect(appSource).toMatch(/"completed"[\s\S]*?"failed"[\s\S]*?"interrupted"[\s\S]*?"cancelled"/);
  });

  it("setGameState 内调用 diffActionsAndLog 比较 prev.crew_actions 与 next.crew_actions", () => {
    expect(appSource).toMatch(/diffActionsAndLog\(\s*state\.crew_actions\s*,\s*next\.crew_actions/);
  });

  it("diffActionsAndLog 写 action.complete 含 crew_id / action_id / action_kind / status", () => {
    expect(appSource).toMatch(/type:\s*"action\.complete"/);
    expect(appSource).toMatch(/source:\s*"time_loop"/);
    expect(appSource).toMatch(/action_kind:\s*action\.type/);
    // 至少在 diffActionsAndLog 调用块里要看到 crew_id / action_id / status
    const diffStart = appSource.indexOf("function diffActionsAndLog(");
    expect(diffStart).toBeGreaterThan(-1);
    const diffBlockEnd = appSource.indexOf("\n}\n", diffStart);
    const diffBlock = appSource.slice(diffStart, diffBlockEnd > 0 ? diffBlockEnd : undefined);
    expect(diffBlock).toMatch(/crew_id:\s*action\.crew_id/);
    expect(diffBlock).toMatch(/action_id:\s*id/);
    expect(diffBlock).toMatch(/status:\s*action\.status/);
  });

  it("diffActionsAndLog 仅在 prev 非终态 + next 终态时写 action.complete", () => {
    const diffStart = appSource.indexOf("function diffActionsAndLog(");
    expect(diffStart).toBeGreaterThan(-1);
    const diffBlockEnd = appSource.indexOf("\n}\n", diffStart);
    const diffBlock = appSource.slice(diffStart, diffBlockEnd > 0 ? diffBlockEnd : undefined);
    // 应当含有 “wasTerminalBefore || !isTerminalNow” 这种短路逻辑
    expect(diffBlock).toMatch(/wasTerminalBefore/);
    expect(diffBlock).toMatch(/isTerminalNow/);
    expect(diffBlock).toMatch(/TERMINAL_ACTION_STATUSES\.has/);
  });

  it("timer useEffect 依赖数组保持 [timeMultiplier]", () => {
    // setGameState((state) => { ... settleGameTime ... diffActionsAndLog ... }) 紧跟
    // 一个 1000ms 的 setInterval，最终 useEffect 依赖应是 [timeMultiplier]
    expect(appSource).toMatch(/\}, 1000\);[\s\S]{0,200}\}, \[timeMultiplier\]\);/);
  });
});

// --- 行为模拟测试：验证 LogInput 类型契约 + ringBuffer 字段 ---------------------

describe("TASK-017 — action.complete 等价日志写入 ringBuffer", () => {
  it("LogInputWithContext: action.complete 写入 ringBuffer 字段正确（completed）", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    logger.log({
      type: "action.complete",
      source: "time_loop",
      payload: {
        crew_id: "crew-a",
        action_id: "act-1",
        action_kind: "move",
        status: "completed",
      },
      gameSeconds: 50,
    });

    const snapshot = logger.getRingBufferSnapshot();
    const last = snapshot[snapshot.length - 1];
    expect(last.type).toBe("action.complete");
    expect(last.source).toBe("time_loop");
    if (last.type === "action.complete") {
      expect(last.payload).toEqual({
        crew_id: "crew-a",
        action_id: "act-1",
        action_kind: "move",
        status: "completed",
      });
    }
    expect(last.occurred_at_game_seconds).toBe(50);

    logger._stop?.();
  });

  it("4 个终态 (completed/interrupted/failed/cancelled) 都能写入并保留", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    const terminals: ReadonlyArray<"completed" | "interrupted" | "failed" | "cancelled"> = [
      "completed",
      "interrupted",
      "failed",
      "cancelled",
    ];

    terminals.forEach((status, idx) => {
      logger.log({
        type: "action.complete",
        source: "time_loop",
        payload: {
          crew_id: `crew-${idx}`,
          action_id: `act-${idx}`,
          action_kind: "investigate",
          status,
        },
        gameSeconds: 100 + idx,
      });
    });

    const completes = logger.getRingBufferSnapshot().filter((e) => e.type === "action.complete");
    expect(completes.length).toBe(4);
    const statuses = completes.map((entry) =>
      entry.type === "action.complete" ? entry.payload.status : null,
    );
    expect(statuses).toEqual(["completed", "interrupted", "failed", "cancelled"]);

    logger._stop?.();
  });
});

// 让类型在文件中至少出现一次，避免 unused-import lint 抱怨
type _LogEntryShape = LogEntry;
