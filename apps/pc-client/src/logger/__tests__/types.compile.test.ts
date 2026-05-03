import { describe, expect, it, expectTypeOf } from "vitest";
import type {
  LogEntry,
  LogEntryEnvelope,
  LogInput,
  LogSource,
  RunArchive,
} from "../types";
import { LoggerError } from "../types";
import type { LogWorkerCommand, LogWorkerEvent } from "../worker-protocol";
import type { LoggerBroadcastMessage } from "../broadcast-protocol";
import {
  LOGGER_CHANNEL,
  HEARTBEAT_INTERVAL_MS,
  CLAIM_GRACE_MS,
  HOLDER_TIMEOUT_MS,
} from "../broadcast-protocol";

/**
 * `assertNever` — exhaustive check helper. If a discriminated union grows a new
 * variant and a switch fails to handle it, TS will refuse to compile here.
 */
function assertNever(x: never): never {
  throw new Error(`unreachable: ${JSON.stringify(x)}`);
}

describe("logger types — compile-time contract (AC1)", () => {
  it("narrows LogEntry by `type` to the matching payload shape", () => {
    // Build a sample envelope shared by all entries.
    const envelope: Omit<LogEntryEnvelope, "type" | "source"> = {
      seq: 1,
      log_version: 1,
      game_version: "0.1.0",
      run_id: "run-2026-05-01-0244-abc",
      occurred_at_game_seconds: 0,
      occurred_at_real_time: "2026-05-01T02:44:00.000Z",
    };

    const choice: LogEntry = {
      ...envelope,
      type: "player.call.choice",
      source: "player_command",
      payload: { call_id: "c1", choice_key: "ok", crew_id: null },
    };

    if (choice.type === "player.call.choice") {
      // Inside this branch payload must be the strict choice payload.
      expectTypeOf(choice.payload).toEqualTypeOf<{
        call_id: string;
        choice_key: string;
        crew_id: string | null;
      }>();
      expect(choice.payload.call_id).toBe("c1");
    }
  });

  it("rejects malformed payload at compile time", () => {
    // Each `@ts-expect-error` directive below MUST sit immediately above the
    // line that triggers the TS error. If TS stops erroring (e.g. payload
    // became too permissive), the directive itself becomes a compile-time
    // error, breaking lint — exactly what AC1 demands.

    const _bad1: LogEntry = {
      seq: 1,
      log_version: 1,
      game_version: "0.1.0",
      run_id: "run-x",
      occurred_at_game_seconds: 0,
      occurred_at_real_time: "2026-05-01T02:44:00.000Z",
      type: "player.call.choice",
      source: "player_command",
      // @ts-expect-error payload is missing required fields for player.call.choice
      payload: {},
    };

    // @ts-expect-error wrong source for type=player.call.choice (must be player_command)
    const _bad2: LogEntry = {
      seq: 1,
      log_version: 1,
      game_version: "0.1.0",
      run_id: "run-x",
      occurred_at_game_seconds: 0,
      occurred_at_real_time: "2026-05-01T02:44:00.000Z",
      type: "player.call.choice",
      source: "system",
      payload: { call_id: "c1", choice_key: "ok", crew_id: null },
    };

    const _bad3: LogEntry = {
      seq: 1,
      log_version: 1,
      game_version: "0.1.0",
      run_id: "run-x",
      occurred_at_game_seconds: 0,
      occurred_at_real_time: "2026-05-01T02:44:00.000Z",
      type: "system.run.end",
      source: "system",
      // @ts-expect-error system.run.end reason is restricted to "reset" | "unload"
      payload: { reason: "not-a-real-reason" },
    };

    // Use the variables to prevent unused-variable noise.
    void _bad1;
    void _bad2;
    void _bad3;
    expect(true).toBe(true);
  });

  it("LogSource is the closed union of 4 strings", () => {
    expectTypeOf<LogSource>().toEqualTypeOf<
      "player_command" | "event_engine" | "time_loop" | "system"
    >();
  });

  it("LogInput omits envelope auto-fields (AC: write-side input shape)", () => {
    // LogInput must contain `type / source / payload` triples but *not* the
    // envelope auto-fields (seq / run_id / log_version / etc).
    type EnvelopeAutoFields =
      | "seq"
      | "log_version"
      | "game_version"
      | "run_id"
      | "occurred_at_game_seconds"
      | "occurred_at_real_time";

    // Should compile: a valid input without envelope fields.
    const input: LogInput = {
      type: "player.call.choice",
      source: "player_command",
      payload: { call_id: "c1", choice_key: "ok", crew_id: null },
    };
    expect(input.type).toBe("player.call.choice");

    const _withSeq: LogInput = {
      type: "player.call.choice",
      source: "player_command",
      payload: { call_id: "c1", choice_key: "ok", crew_id: null },
      // @ts-expect-error LogInput must not allow envelope auto-fields like `seq`
      seq: 1,
    };
    void _withSeq;

    // Sanity: a key from EnvelopeAutoFields is *not* a key of LogInput.
    type LogInputKeys = keyof LogInput;
    type Forbidden = Extract<LogInputKeys, EnvelopeAutoFields>;
    expectTypeOf<Forbidden>().toEqualTypeOf<never>();
  });
});

describe("worker-protocol — exhaustive switches (AC2)", () => {
  it("LogWorkerCommand exhaustive switch covers all 7+ kinds", () => {
    function handleCommand(c: LogWorkerCommand): string {
      switch (c.kind) {
        case "init":
          return c.runId;
        case "append":
          return `append:${c.entries.length}`;
        case "flush":
          return "flush";
        case "rotate":
          return c.newRunId;
        case "list_runs":
          return "list_runs";
        case "read_run":
          return c.runId;
        case "delete_run":
          return c.runId;
        default:
          return assertNever(c);
      }
    }

    expect(handleCommand({ kind: "flush" })).toBe("flush");
    expect(handleCommand({ kind: "init", runId: "run-x" })).toBe("run-x");
    expect(handleCommand({ kind: "list_runs" })).toBe("list_runs");
  });

  it("LogWorkerEvent exhaustive switch covers all 6+ kinds", () => {
    function handleEvent(e: LogWorkerEvent): string {
      switch (e.kind) {
        case "ready":
          return e.runId;
        case "fatal":
          return e.reason;
        case "ack":
          return String(e.upToSeq);
        case "runs":
          return `runs:${e.runs.length}`;
        case "run_data":
          return `data:${e.bytes.byteLength}`;
        case "error":
          return e.reason;
        default:
          return assertNever(e);
      }
    }

    expect(handleEvent({ kind: "ack", upToSeq: 42 })).toBe("42");
    expect(handleEvent({ kind: "ready", runId: "run-1" })).toBe("run-1");
  });
});

describe("broadcast-protocol — channel constants & message shape", () => {
  it("exports the required runtime constants", () => {
    expect(LOGGER_CHANNEL).toBe("stellar-frontier-logger");
    expect(HEARTBEAT_INTERVAL_MS).toBe(1000);
    expect(CLAIM_GRACE_MS).toBe(200);
    expect(HOLDER_TIMEOUT_MS).toBe(2500);
  });

  it("LoggerBroadcastMessage exhaustive switch covers claim / held / yield", () => {
    function handleMsg(m: LoggerBroadcastMessage): string {
      switch (m.kind) {
        case "claim":
          return `claim:${m.tabId}`;
        case "held":
          return `held:${m.tabId}`;
        case "yield":
          return `yield:${m.tabId}`;
        default:
          return assertNever(m);
      }
    }

    expect(handleMsg({ kind: "claim", tabId: "t1", ts: 1 })).toBe("claim:t1");
    expect(handleMsg({ kind: "held", tabId: "t2", ts: 2 })).toBe("held:t2");
    expect(handleMsg({ kind: "yield", tabId: "t3", ts: 3 })).toBe("yield:t3");
  });
});

describe("RunArchive shape", () => {
  it("entry_count is optional, all other fields required", () => {
    const without: RunArchive = {
      run_id: "run-x",
      created_at_real_time: "2026-05-01T00:00:00.000Z",
      updated_at_real_time: "2026-05-01T00:00:01.000Z",
      size_bytes: 0,
      is_current: true,
    };
    const withCount: RunArchive = { ...without, entry_count: 7 };
    expect(without.is_current).toBe(true);
    expect(withCount.entry_count).toBe(7);
  });
});

describe("LoggerError class", () => {
  it("is an Error subclass exposing the structured `code` field", () => {
    const err = new LoggerError({ code: "opfs_unavailable", message: "no opfs" });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(LoggerError);
    expect(err.code).toBe("opfs_unavailable");
    expect(err.message).toBe("no opfs");
    expect(err.name).toBe("LoggerError");
  });

  it("forwards `cause` when provided", () => {
    const root = new Error("root");
    const err = new LoggerError({ code: "init_failed", message: "boom", cause: root });
    expect(err.cause).toBe(root);
  });

  it("accepts the documented code values", () => {
    // Compile-time check: each documented code is assignable.
    const codes: LoggerError["code"][] = [
      "opfs_unavailable",
      "run_not_found",
      "writer_busy",
      "init_failed",
    ];
    expect(codes.length).toBe(4);
  });
});
