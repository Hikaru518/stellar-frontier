import { afterEach, describe, expect, it, vi } from "vitest";
import pkg from "../../../package.json" with { type: "json" };
import { createRunId, makeEnvelope } from "../envelope";
import type { LogInput, PlayerCallChoiceEntry } from "../types";

const RUN_ID_RE = /^run-\d{4}-\d{2}-\d{2}-\d{4}-[a-z0-9]{4,}$/;

describe("envelope.createRunId (AC1)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formats run id from a fixed Date with mocked random source", () => {
    // Mock Math.random so that the rand suffix is deterministic. The chosen
    // sequence of 0.1 values yields the same base36 chars on every call.
    const randSource = () => 0.5;
    const id = createRunId(new Date("2026-05-01T02:44:00Z"), randSource);

    expect(id).toMatch(RUN_ID_RE);
    expect(id.startsWith("run-2026-05-01-0244-")).toBe(true);
  });

  it("uses Math.random by default", () => {
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.123456789);
    const id = createRunId(new Date("2026-05-01T02:44:00Z"));
    expect(id).toMatch(RUN_ID_RE);
    expect(spy).toHaveBeenCalled();
  });

  it("zero-pads month / day / hour / minute", () => {
    // 2026-01-02T03:04:00Z → run-2026-01-02-0304-XXXX
    const id = createRunId(new Date("2026-01-02T03:04:00Z"), () => 0.5);
    expect(id.startsWith("run-2026-01-02-0304-")).toBe(true);
    expect(id).toMatch(RUN_ID_RE);
  });

  it("rand suffix uses [a-z0-9] characters only and is at least 4 chars", () => {
    const id = createRunId(new Date("2026-05-01T02:44:00Z"), () => 0.999);
    const suffix = id.split("-").pop() ?? "";
    expect(suffix.length).toBeGreaterThanOrEqual(4);
    expect(suffix).toMatch(/^[a-z0-9]+$/);
  });
});

describe("envelope.makeEnvelope (AC2)", () => {
  const baseInput: LogInput = {
    type: "player.call.choice",
    source: "player_command",
    payload: { call_id: "c1", choice_key: "ok", crew_id: null },
  };

  it("fills all 9 envelope fields and preserves payload", () => {
    const nowReal = new Date("2026-05-01T02:44:00.000Z");
    const out = makeEnvelope(baseInput, {
      seq: 7,
      runId: "run-2026-05-01-0244-abcd",
      gameSeconds: 12.5,
      nowReal,
    });

    // Type narrows: since type === "player.call.choice", out is the matching variant.
    expect(out.type).toBe("player.call.choice");
    expect(out.source).toBe("player_command");
    expect(out.seq).toBe(7);
    expect(out.log_version).toBe(1);
    expect(out.game_version).toBe(pkg.version);
    expect(out.run_id).toBe("run-2026-05-01-0244-abcd");
    expect(out.occurred_at_game_seconds).toBe(12.5);
    expect(out.occurred_at_real_time).toBe("2026-05-01T02:44:00.000Z");
    expect(out.payload).toEqual({ call_id: "c1", choice_key: "ok", crew_id: null });

    // Compile-time: TS should narrow this to PlayerCallChoiceEntry.
    const narrow: PlayerCallChoiceEntry =
      out.type === "player.call.choice" ? out : (null as never);
    expect(narrow.payload.call_id).toBe("c1");
  });

  it("occurred_at_real_time is a valid ISO 8601 string", () => {
    const out = makeEnvelope(baseInput, {
      seq: 1,
      runId: "run-2026-05-01-0244-abcd",
      gameSeconds: 0,
    });
    // Should be parseable back into a valid Date.
    const parsed = new Date(out.occurred_at_real_time);
    expect(Number.isFinite(parsed.getTime())).toBe(true);
    expect(out.occurred_at_real_time).toBe(parsed.toISOString());
  });

  it("game_version is sourced from globalThis.__APP_VERSION__ (= pkg.version)", () => {
    const out = makeEnvelope(baseInput, {
      seq: 1,
      runId: "run-x",
      gameSeconds: 0,
      nowReal: new Date("2026-05-01T02:44:00.000Z"),
    });
    expect(out.game_version).toBe(pkg.version);
  });

  it("preserves seq exactly and produces strictly increasing seq for increasing input", () => {
    const ctxBase = {
      runId: "run-x",
      gameSeconds: 0,
      nowReal: new Date("2026-05-01T02:44:00.000Z"),
    };
    const a = makeEnvelope(baseInput, { ...ctxBase, seq: 1 });
    const b = makeEnvelope(baseInput, { ...ctxBase, seq: 2 });
    const c = makeEnvelope(baseInput, { ...ctxBase, seq: 3 });
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
    expect(c.seq).toBe(3);
    expect(a.seq).toBeLessThan(b.seq);
    expect(b.seq).toBeLessThan(c.seq);
  });

  it("does not mutate the caller's payload", () => {
    const payload = { call_id: "c1", choice_key: "ok", crew_id: null };
    const input: LogInput = {
      type: "player.call.choice",
      source: "player_command",
      payload,
    };
    const before = { ...payload };
    makeEnvelope(input, {
      seq: 1,
      runId: "run-x",
      gameSeconds: 0,
      nowReal: new Date("2026-05-01T02:44:00.000Z"),
    });
    expect(payload).toEqual(before);
  });

  it("defaults nowReal to current Date when omitted", () => {
    const before = Date.now();
    const out = makeEnvelope(baseInput, {
      seq: 1,
      runId: "run-x",
      gameSeconds: 0,
    });
    const parsed = new Date(out.occurred_at_real_time).getTime();
    const after = Date.now();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });
});
