import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../index";
import type { LogEntry } from "../types";
import type { LogWorkerCommand, LogWorkerEvent } from "../worker-protocol";

/**
 * Integration tests for TASK-009 — App.tsx 接入：handleDecision 玩家指令日志。
 *
 * 与 TASK-008 一样不渲染 App（事件库/地图/UI 渲染过重）。本测试由两部分组成：
 *
 *   (a) 静态源码断言：验证 App.tsx 在 5 个 hook 点（事件选项 / survey /
 *       standby+stop / confirmMove）确实写入了正确 type/payload 的 logger.log
 *       调用，并且 universal:move 分支没有写日志（MVP 跳过）。
 *
 *   (b) 行为模拟测试：用 createLogger + MockWorker 模拟 handleDecision 各分支
 *       等价的 logger.log({...}) 调用，断言 ringBuffer 中产出的 LogEntry
 *       payload 与 LogInput 类型契约一致。
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

// --- 静态源码断言：验证 App.tsx 5 个 hook 点 -----------------------------------

describe("TASK-009 — App.tsx handleDecision 源码接入断言", () => {
  // vitest 由 `apps/pc-client` 启动，process.cwd() 即包根目录。
  const appSourcePath = resolve(process.cwd(), "src/App.tsx");
  const appSource = readFileSync(appSourcePath, "utf-8");

  it('handleDecision 事件选项分支写入 logger.log({type:"player.call.choice"...})', () => {
    expect(appSource).toMatch(/type:\s*"player\.call\.choice"/);
    expect(appSource).toMatch(/choice_key:\s*actionId/);
    expect(appSource).toMatch(/call_id:\s*currentCall\.runtimeCallId/);
  });

  it('universal:survey 分支写入 player.action.dispatch action_kind="survey"', () => {
    expect(appSource).toMatch(/action_id:\s*"universal:survey"/);
    expect(appSource).toMatch(/action_kind:\s*"survey"/);
  });

  it("universal:standby/stop 分支写入 player.action.dispatch 且 action_kind 与 actionId 一致", () => {
    expect(appSource).toMatch(
      /action_kind:\s*actionId\s*===\s*"universal:standby"\s*\?\s*"standby"\s*:\s*"stop"/,
    );
  });

  it("confirmMove 写入 player.move.target，tile_id = currentCall.selectedTargetTileId", () => {
    expect(appSource).toMatch(/type:\s*"player\.move\.target"/);
    expect(appSource).toMatch(/tile_id:\s*currentCall\.selectedTargetTileId/);
  });

  it("universal:move 分支不调用 logger.log（MVP 跳过）", () => {
    const moveStart = appSource.indexOf('if (actionId === "universal:move")');
    const surveyStart = appSource.indexOf(
      'if (actionId === "universal:survey")',
      moveStart,
    );
    expect(moveStart).toBeGreaterThan(-1);
    expect(surveyStart).toBeGreaterThan(moveStart);
    const moveBlock = appSource.slice(moveStart, surveyStart);
    expect(moveBlock).not.toMatch(/logger\.log\s*\(/);
  });

  it("所有 5 个玩家指令日志 source 都为 player_command", () => {
    // 取 handleDecision 起点到文件末尾里所有 logger.log 调用块（粗粒度）；
    // 5 处 player.* 日志都应同时出现 source: "player_command"
    const playerCallChoiceMatches = appSource.match(
      /type:\s*"player\.call\.choice"[\s\S]{0,200}source:\s*"player_command"/,
    );
    const playerActionDispatchMatches = appSource.match(
      /type:\s*"player\.action\.dispatch"[\s\S]{0,200}source:\s*"player_command"/g,
    );
    const playerMoveTargetMatches = appSource.match(
      /type:\s*"player\.move\.target"[\s\S]{0,200}source:\s*"player_command"/,
    );
    expect(playerCallChoiceMatches).not.toBeNull();
    // standby/stop + survey = 至少两处
    expect(playerActionDispatchMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(playerMoveTargetMatches).not.toBeNull();
  });
});

// --- 行为模拟测试：验证 LogInput 类型契约可被消费 ------------------------------

describe("TASK-009 — handleDecision 等价日志写入 ringBuffer", () => {
  it("player.call.choice payload schema 与 LogInput 类型契约一致", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    logger.log({
      type: "player.call.choice",
      source: "player_command",
      payload: {
        call_id: "call-event-1",
        choice_key: "opt-a",
        crew_id: "crew-mike",
      },
      gameSeconds: 100,
    });

    const snapshot = logger.getRingBufferSnapshot();
    const last = snapshot[snapshot.length - 1];
    expect(last.type).toBe("player.call.choice");
    expect(last.source).toBe("player_command");
    if (last.type === "player.call.choice") {
      expect(last.payload).toEqual({
        call_id: "call-event-1",
        choice_key: "opt-a",
        crew_id: "crew-mike",
      });
    }
    expect(last.occurred_at_game_seconds).toBe(100);

    logger._stop?.();
  });

  it("player.action.dispatch (survey/standby/stop) payload 写入 ringBuffer", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    logger.log({
      type: "player.action.dispatch",
      source: "player_command",
      payload: {
        crew_id: "crew-amy",
        action_id: "universal:survey",
        action_kind: "survey",
      },
      gameSeconds: 11,
    });
    logger.log({
      type: "player.action.dispatch",
      source: "player_command",
      payload: {
        crew_id: "crew-amy",
        action_id: "universal:standby",
        action_kind: "standby",
      },
      gameSeconds: 22,
    });
    logger.log({
      type: "player.action.dispatch",
      source: "player_command",
      payload: {
        crew_id: "crew-amy",
        action_id: "universal:stop",
        action_kind: "stop",
      },
      gameSeconds: 33,
    });

    const snapshot = logger.getRingBufferSnapshot();
    const dispatches = snapshot.filter((e) => e.type === "player.action.dispatch");
    expect(dispatches.length).toBe(3);
    const kinds = dispatches.map((entry) =>
      entry.type === "player.action.dispatch" ? entry.payload.action_kind : null,
    );
    expect(kinds).toEqual(["survey", "standby", "stop"]);

    logger._stop?.();
  });

  it("player.move.target payload tile_id 与传入一致", () => {
    const worker = new MockWorker();
    const logger = createLogger({
      workerFactory: fixedWorkerFactory(worker),
      initialRunId: INITIAL_RUN_ID,
      now: () => FIXED_NOW,
    });
    worker.emit({ kind: "ready", runId: INITIAL_RUN_ID });

    logger.log({
      type: "player.move.target",
      source: "player_command",
      payload: {
        crew_id: "crew-mike",
        tile_id: "tile-3-4",
      },
      gameSeconds: 555,
    });

    const snapshot = logger.getRingBufferSnapshot();
    const last = snapshot[snapshot.length - 1];
    expect(last.type).toBe("player.move.target");
    if (last.type === "player.move.target") {
      expect(last.payload.tile_id).toBe("tile-3-4");
      expect(last.payload.crew_id).toBe("crew-mike");
    }
    expect(last.occurred_at_game_seconds).toBe(555);

    logger._stop?.();
  });
});

// 让类型在文件中至少出现一次，避免 unused-import lint 抱怨
type _LogEntryShape = LogEntry;
