import type { TriggerContext } from "../events/types";

/**
 * The fixed set of log sources (ADR-002).
 *
 * Each `LogEntry.type` is statically bound to exactly one source — that binding
 * is enforced by the discriminated union below.
 */
export type LogSource = "player_command" | "event_engine" | "time_loop" | "system";

/**
 * Envelope auto-fields. The 9-field minimal envelope (ADR-002) =
 * `{ ...envelope, type, source, payload }` where the envelope below is filled
 * by the logger facade and never by the caller.
 *
 * Note: `type` and `source` are intentionally NOT part of this envelope; they
 * vary per LogEntry variant and form the discriminant tag pair, so each
 * variant in `LogEntry` declares them with its own narrow literal type.
 */
export interface LogEntryEnvelope {
  /** Monotonically increasing per-run sequence (starts at 1). */
  seq: number;
  /** Logger schema version (currently 1). */
  log_version: number;
  /** App version, sourced from `__APP_VERSION__`. */
  game_version: string;
  /** Run identifier, e.g. `run-2026-05-01-0244-<rand>`. */
  run_id: string;
  /** In-game elapsed seconds at write-time. */
  occurred_at_game_seconds: number;
  /** Wall-clock ISO 8601 timestamp at write-time. */
  occurred_at_real_time: string;
  /** Discriminant — narrowed by each variant. */
  type: string;
  /** Source — narrowed by each variant. */
  source: LogSource;
}

// --- Per-type payload shapes (ADR-002 / design §9) ----------------------------

export interface SystemRunStartPayload {
  game_version: string;
  schema_version: string;
}

export interface SystemRunEndPayload {
  reason: "reset" | "unload";
}

export interface PlayerCallChoicePayload {
  call_id: string;
  choice_key: string;
  crew_id: string | null;
}

export interface PlayerMoveTargetPayload {
  crew_id: string;
  tile_id: string;
}

export interface PlayerActionDispatchPayload {
  crew_id: string;
  action_id: string;
  action_kind: string;
}

export interface EventTriggerPayload {
  trigger: TriggerContext;
}

export interface EventNodeEnterPayload {
  event_id: string;
  from_node_id: string | null;
  to_node_id: string;
}

export interface EventResolvedPayload {
  event_log_id: string;
  event_id: string;
  event_definition_id: string;
  result_key: string | null;
  summary: string | null;
  importance: string;
}

export interface ActionCompletePayload {
  crew_id: string;
  action_id: string;
  action_kind: string;
  status: "completed" | "interrupted" | "failed" | "cancelled";
}

// --- Discriminated union (the 9 variants) -------------------------------------

/**
 * Helper that builds one `LogEntry` variant: a full envelope with `type`,
 * `source`, and `payload` narrowed to literal-precise types.
 */
type EnvelopeOf<T extends string, S extends LogSource, P> = Omit<
  LogEntryEnvelope,
  "type" | "source"
> & {
  type: T;
  source: S;
  payload: P;
};

export type SystemRunStartEntry = EnvelopeOf<"system.run.start", "system", SystemRunStartPayload>;
export type SystemRunEndEntry = EnvelopeOf<"system.run.end", "system", SystemRunEndPayload>;
export type PlayerCallChoiceEntry = EnvelopeOf<
  "player.call.choice",
  "player_command",
  PlayerCallChoicePayload
>;
export type PlayerMoveTargetEntry = EnvelopeOf<
  "player.move.target",
  "player_command",
  PlayerMoveTargetPayload
>;
export type PlayerActionDispatchEntry = EnvelopeOf<
  "player.action.dispatch",
  "player_command",
  PlayerActionDispatchPayload
>;
export type EventTriggerEntry = EnvelopeOf<"event.trigger", "event_engine", EventTriggerPayload>;
export type EventNodeEnterEntry = EnvelopeOf<
  "event.node.enter",
  "event_engine",
  EventNodeEnterPayload
>;
export type EventResolvedEntry = EnvelopeOf<
  "event.resolved",
  "event_engine",
  EventResolvedPayload
>;
export type ActionCompleteEntry = EnvelopeOf<
  "action.complete",
  "time_loop",
  ActionCompletePayload
>;

/**
 * The closed discriminated union of all 9 log entry variants. Narrow by `type`
 * to access the variant-specific `payload`.
 */
export type LogEntry =
  | SystemRunStartEntry
  | SystemRunEndEntry
  | PlayerCallChoiceEntry
  | PlayerMoveTargetEntry
  | PlayerActionDispatchEntry
  | EventTriggerEntry
  | EventNodeEnterEntry
  | EventResolvedEntry
  | ActionCompleteEntry;

/**
 * Write-side input shape: only the fields a caller fills in. The logger facade
 * stamps the envelope auto-fields (`seq` / `run_id` / `log_version` / etc) so
 * those are intentionally absent from `LogInput`.
 *
 * Derived from `LogEntry` via `Pick` so that adding a new variant or changing
 * a payload propagates here automatically.
 */
export type LogInput = LogEntry extends infer E
  ? E extends LogEntry
    ? Pick<E, "type" | "source" | "payload">
    : never
  : never;

// --- Run archive metadata -----------------------------------------------------

export interface RunArchive {
  run_id: string;
  created_at_real_time: string;
  updated_at_real_time: string;
  size_bytes: number;
  /** Optional — backends may omit when counting is expensive. */
  entry_count?: number;
  is_current: boolean;
}

// --- LoggerError --------------------------------------------------------------

export type LoggerErrorCode =
  | "opfs_unavailable"
  | "run_not_found"
  | "writer_busy"
  | "init_failed";

export interface LoggerErrorOptions {
  code: LoggerErrorCode;
  message: string;
  cause?: unknown;
}

/**
 * Structured error thrown by the logger pipeline. The `code` field lets callers
 * branch on the failure mode without parsing message strings.
 *
 * `cause` is exposed as an own property so it remains accessible on TS lib
 * targets (ES2020) that predate `Error.cause` in the standard typings.
 */
export class LoggerError extends Error {
  public readonly code: LoggerErrorCode;
  public readonly cause: unknown;

  constructor(options: LoggerErrorOptions) {
    super(options.message);
    this.name = "LoggerError";
    this.code = options.code;
    this.cause = options.cause;
  }
}
