import type { LogEntry, LogInput } from "./types";

/**
 * Two-digit zero-pad helper for date / time fields in `run_id`.
 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Build a 4+ char [a-z0-9] suffix from a single random sample.
 *
 * `Number(x).toString(36)` yields `0.xxxxxx...` for x in [0,1); we strip the
 * `0.` prefix and slice. Some values (e.g. very small samples) produce short
 * strings, so we always loop until we have at least 4 chars.
 */
function makeRandSuffix(rand: () => number): string {
  let out = "";
  while (out.length < 4) {
    const slice = rand().toString(36).slice(2); // drop "0."
    out += slice;
  }
  // Defensive: clamp to [a-z0-9] only (toString(36) already produces this set,
  // but a custom randSource could return non-standard floats).
  return out.replace(/[^a-z0-9]/g, "").slice(0, Math.max(4, out.length));
}

/**
 * Build a `run-YYYY-MM-DD-HHMM-<rand>` identifier.
 *
 * @param now        Wall-clock time used to stamp the date / time portion.
 * @param randSource Injectable random source (defaults to `Math.random`),
 *                   useful for deterministic tests.
 */
export function createRunId(
  now: Date = new Date(),
  randSource: () => number = Math.random,
): string {
  const yyyy = now.getUTCFullYear();
  const mm = pad2(now.getUTCMonth() + 1);
  const dd = pad2(now.getUTCDate());
  const hh = pad2(now.getUTCHours());
  const min = pad2(now.getUTCMinutes());
  const suffix = makeRandSuffix(randSource);
  return `run-${yyyy}-${mm}-${dd}-${hh}${min}-${suffix}`;
}

/**
 * Promote a `LogInput` to a fully formed `LogEntry` by stamping the 9-field
 * envelope (ADR-002).
 *
 * The output keeps the same `(type, source, payload)` triple as the input, so
 * TypeScript narrows the result to the corresponding `LogEntry` variant.
 */
export function makeEnvelope(
  input: LogInput,
  ctx: { seq: number; runId: string; gameSeconds: number; nowReal?: Date },
): LogEntry {
  const occurredAtRealTime = (ctx.nowReal ?? new Date()).toISOString();
  const gameVersion = (globalThis as { __APP_VERSION__?: string }).__APP_VERSION__ ?? "";

  // The cast to LogEntry is sound because LogInput is a Pick over the closed
  // discriminated union — preserving (type, source, payload) keeps each variant
  // intact, and the envelope fields below are common to every variant.
  return {
    seq: ctx.seq,
    log_version: 1,
    game_version: gameVersion,
    run_id: ctx.runId,
    occurred_at_game_seconds: ctx.gameSeconds,
    occurred_at_real_time: occurredAtRealTime,
    type: input.type,
    source: input.source,
    payload: input.payload,
  } as LogEntry;
}
