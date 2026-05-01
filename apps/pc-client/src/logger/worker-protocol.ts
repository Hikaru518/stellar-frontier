import type { LogEntry, RunArchive } from "./types";

/**
 * Messages sent from the main thread (logger facade) to the dedicated logger
 * Worker. Discriminated by `kind`.
 */
export type LogWorkerCommand =
  | { kind: "init"; runId: string }
  | { kind: "append"; entries: LogEntry[] }
  | { kind: "flush" }
  | { kind: "rotate"; newRunId: string }
  | { kind: "list_runs" }
  | { kind: "read_run"; runId: string }
  | { kind: "delete_run"; runId: string };

/**
 * Messages sent from the Worker back to the main thread. Discriminated by
 * `kind`. The `error` event echoes the originating command's `kind` so the
 * caller can correlate failures with the request.
 */
export type LogWorkerEvent =
  | { kind: "ready"; runId: string }
  | { kind: "fatal"; reason: "opfs_unavailable" | "init_failed"; detail?: string }
  | { kind: "ack"; upToSeq: number }
  | { kind: "runs"; runs: RunArchive[] }
  | { kind: "run_data"; runId: string; bytes: ArrayBuffer }
  | { kind: "error"; cmdKind: LogWorkerCommand["kind"]; reason: string };
