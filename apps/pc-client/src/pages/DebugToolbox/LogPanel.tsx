import { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../../components/Layout";
import { logger } from "../../logger";
import type { LogStatus, LoggerFacade } from "../../logger";
import type { LogEntry, LogSource, RunArchive } from "../../logger/types";

type Mode = "current" | "archive";
type SourceFilter = "all" | LogSource;

/**
 * Maximum number of entries kept in the panel state. Aligned with the logger
 * ring buffer's default capacity; we still cap defensively here so the
 * component cannot grow unbounded if the upstream buffer is misconfigured.
 */
const ENTRY_CAP = 2000;

/** Max characters for the inline payload preview before truncation. */
const PAYLOAD_PREVIEW_MAX = 200;

export interface LogPanelProps {
  /** Optional injection seam for tests; defaults to the production singleton. */
  facade?: LoggerFacade;
}

export function LogPanel({ facade = logger }: LogPanelProps) {
  const [mode, setMode] = useState<Mode>("current");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [status, setStatus] = useState<LogStatus>(() => facade.getStatus());
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const errorTimerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // --- Archive mode state (TASK-018) -----------------------------------------
  // When `mode === "archive"` we maintain an independent state machine on top
  // of the current-mode tail. `viewingRunId === null` shows the list view;
  // `viewingRunId !== null` shows the read-only entries view for that run.
  // The two views are mutually exclusive so the user can only inspect one
  // surface at a time.
  const [runs, setRuns] = useState<RunArchive[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [viewingRunId, setViewingRunId] = useState<string | null>(null);
  const [viewingEntries, setViewingEntries] = useState<LogEntry[]>([]);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Mount: seed from snapshot, then subscribe for incremental deltas.
  // Subscription also keeps the status banners in sync (worker fatal,
  // writerRole flip post TASK-015, etc).
  useEffect(() => {
    setEntries(facade.getRingBufferSnapshot());
    const unsubscribe = facade.subscribe(({ entries: delta }) => {
      if (delta.length > 0) {
        setEntries((prev) => {
          const next = prev.concat(delta);
          return next.length > ENTRY_CAP ? next.slice(next.length - ENTRY_CAP) : next;
        });
      }
      setStatus(facade.getStatus());
    });
    return unsubscribe;
  }, [facade]);

  // Derived view: filter by type prefix + exact source.
  const visibleEntries = useMemo(() => {
    if (!typeFilter && sourceFilter === "all") {
      return entries;
    }
    return entries.filter((e) => {
      if (typeFilter && !e.type.startsWith(typeFilter)) return false;
      if (sourceFilter !== "all" && e.source !== sourceFilter) return false;
      return true;
    });
  }, [entries, typeFilter, sourceFilter]);

  // Auto-scroll to bottom on every change. MVP: always pin to bottom.
  // TODO: respect "user scrolled up" so live tail does not interrupt manual
  // inspection (e.g. only auto-scroll when distance-to-bottom < 50px).
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleEntries]);

  // Clear the auto-dismiss timer on unmount so a tail-end timer cannot fire
  // into an unmounted component (would only warn under StrictMode but is
  // still a leak and triggers React warnings in tests).
  useEffect(() => {
    return () => {
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
        errorTimerRef.current = null;
      }
    };
  }, []);

  // Load the archive list whenever the user enters archive mode. The
  // `cancelled` flag guards against late resolutions if the user toggles
  // back to current mode before the promise settles.
  useEffect(() => {
    if (mode !== "archive") {
      // Reset view state so re-entry always lands on the fresh list.
      setViewingRunId(null);
      setViewingEntries([]);
      return;
    }
    let cancelled = false;
    setArchiveLoading(true);
    setArchiveError(null);
    facade
      .listRuns()
      .then((rs) => {
        if (!cancelled) setRuns(rs);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setArchiveError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setArchiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, facade]);

  const isMemoryOnly = status.mode === "memory_only";
  const hasFilter = typeFilter !== "" || sourceFilter !== "all";

  async function handleView(runId: string): Promise<void> {
    setArchiveError(null);
    setViewingRunId(runId);
    setViewingEntries([]);
    try {
      const bytes = await facade.readRun(runId);
      const text = new TextDecoder().decode(bytes);
      const lines = text.split("\n").filter((l) => l.length > 0);
      const parsed: LogEntry[] = [];
      for (const line of lines) {
        try {
          parsed.push(JSON.parse(line) as LogEntry);
        } catch {
          // Skip malformed lines but warn so the user/dev sees the corruption.
          // Truncate the offending payload so the console stays readable when
          // a whole file is garbled.
          // eslint-disable-next-line no-console
          console.warn("[LogPanel] skipped bad jsonl line:", line.slice(0, 80));
        }
      }
      setViewingEntries(parsed);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : String(err));
      setViewingRunId(null);
    }
  }

  function exitView(): void {
    setViewingRunId(null);
    setViewingEntries([]);
  }

  async function handleDelete(runId: string): Promise<void> {
    if (!window.confirm(`确定删除 run ${runId}？`)) return;
    setArchiveError(null);
    try {
      await facade.deleteRun(runId);
      const rs = await facade.listRuns();
      setRuns(rs);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleExport(): Promise<void> {
    if (isMemoryOnly || isExporting) return;
    setIsExporting(true);
    try {
      await facade.flush();
      await facade.exportCurrent();
      setExportError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportError(msg);
      if (errorTimerRef.current !== null) {
        window.clearTimeout(errorTimerRef.current);
      }
      errorTimerRef.current = window.setTimeout(() => {
        setExportError(null);
        errorTimerRef.current = null;
      }, 10000);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Panel title="游戏日志">
      {isMemoryOnly && (
        <div className="log-panel-warn" role="alert">
          日志未持久化（OPFS 不可用 / 已降级到内存模式）
          {status.reason ? `：${status.reason}` : ""}
        </div>
      )}
      {status.writerRole === "reader" && (
        <div className="log-panel-info" role="status">
          当前 tab 为只读模式（writer 在另一标签）
        </div>
      )}

      <div className="log-panel-controls" role="group">
        <button
          type="button"
          className={mode === "current" ? "primary-button" : "secondary-button"}
          onClick={() => setMode("current")}
        >
          实时
        </button>
        <button
          type="button"
          className={mode === "archive" ? "primary-button" : "secondary-button"}
          onClick={() => setMode("archive")}
        >
          历史
        </button>

        <input
          type="text"
          placeholder="按 type 前缀过滤（如 event.）"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="type 过滤"
        />

        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          aria-label="source 过滤"
        >
          <option value="all">all</option>
          <option value="player_command">player_command</option>
          <option value="event_engine">event_engine</option>
          <option value="time_loop">time_loop</option>
          <option value="system">system</option>
        </select>

        <button
          type="button"
          className="secondary-button"
          disabled={isMemoryOnly || isExporting}
          title={isMemoryOnly ? "OPFS 不可用，无法导出" : undefined}
          onClick={handleExport}
        >
          {isExporting ? "导出中…" : "导出当前 run"}
        </button>
      </div>

      {exportError && (
        <div className="log-panel-export-error" role="alert">
          导出失败：{exportError}
        </div>
      )}

      {mode === "current" && (
        <div
          ref={listRef}
          className="log-panel-list"
          style={{ maxHeight: 360, overflowY: "auto" }}
          aria-label="日志列表"
        >
          {visibleEntries.length === 0 ? (
            <div className="muted-text">
              {hasFilter ? "暂无日志（过滤后无匹配）" : "暂无日志"}
            </div>
          ) : (
            visibleEntries.map((entry) => (
              <div
                key={`${entry.run_id}#${entry.seq}`}
                className="log-panel-row"
                data-type={entry.type}
                data-source={entry.source}
              >
                <span className="log-panel-seq">#{entry.seq}</span>{" "}
                <span className="log-panel-time">
                  {formatHms(entry.occurred_at_real_time)}
                </span>{" "}
                <span className="log-panel-type-chip">{entry.type}</span>{" "}
                <span className="log-panel-source">{entry.source}</span>{" "}
                <span
                  className="log-panel-payload"
                  title={safeStringify(entry.payload)}
                >
                  {truncate(safeStringify(entry.payload), PAYLOAD_PREVIEW_MAX)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {mode === "archive" && archiveError !== null && (
        <div className="log-panel-export-error" role="alert">
          {archiveError}
        </div>
      )}

      {mode === "archive" && viewingRunId === null && (
        <div className="log-panel-archive-list" aria-label="历史 run 列表">
          {archiveLoading ? (
            <div className="muted-text">加载中…</div>
          ) : runs.length === 0 ? (
            <div className="muted-text">暂无历史 run</div>
          ) : (
            runs.map((run) => (
              <div
                key={run.run_id}
                className="log-panel-archive-row"
                data-run-id={run.run_id}
              >
                <span className="log-panel-archive-id">{run.run_id}</span>
                {run.is_current ? (
                  <span className="log-panel-archive-current">当前</span>
                ) : (
                  <span aria-hidden="true" />
                )}
                <span className="log-panel-archive-time">
                  {formatDateTime(run.created_at_real_time)}
                </span>
                <span className="log-panel-archive-size">
                  {formatBytes(run.size_bytes)}
                </span>
                <span className="log-panel-archive-count">
                  {run.entry_count !== undefined ? `${run.entry_count} 条` : "—"}
                </span>
                <button
                  type="button"
                  className="secondary-button"
                  data-action="view"
                  onClick={() => {
                    void handleView(run.run_id);
                  }}
                >
                  查看
                </button>{" "}
                <button
                  type="button"
                  className="secondary-button"
                  data-action="export"
                  disabled={isMemoryOnly}
                  onClick={() => {
                    void facade.exportRun(run.run_id);
                  }}
                >
                  导出
                </button>{" "}
                <button
                  type="button"
                  className="secondary-button"
                  data-action="delete"
                  disabled={run.is_current}
                  onClick={() => {
                    void handleDelete(run.run_id);
                  }}
                >
                  删除
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {mode === "archive" && viewingRunId !== null && (
        <div className="log-panel-archive-view" aria-label="查看 run">
          <div className="log-panel-archive-view-header">
            <strong>查看 {viewingRunId}</strong>{" "}
            <button
              type="button"
              className="secondary-button"
              onClick={exitView}
            >
              返回列表
            </button>
          </div>
          <div
            className="log-panel-list"
            style={{ maxHeight: 360, overflowY: "auto" }}
          >
            {viewingEntries.length === 0 ? (
              <div className="muted-text">该 run 无可解析条目</div>
            ) : (
              viewingEntries.map((entry, i) => (
                <div
                  key={`${entry.run_id ?? "x"}#${entry.seq ?? i}`}
                  className="log-panel-row"
                  data-type={entry.type}
                  data-source={entry.source}
                >
                  <span className="log-panel-seq">#{entry.seq}</span>{" "}
                  <span className="log-panel-time">
                    {formatHms(entry.occurred_at_real_time)}
                  </span>{" "}
                  <span className="log-panel-type-chip">{entry.type}</span>{" "}
                  <span className="log-panel-source">{entry.source}</span>{" "}
                  <span
                    className="log-panel-payload"
                    title={safeStringify(entry.payload)}
                  >
                    {truncate(safeStringify(entry.payload), PAYLOAD_PREVIEW_MAX)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/**
 * Extract the `HH:MM:SS` segment from an ISO 8601 timestamp. Falls back to the
 * raw string if the regex does not match (defensive — `occurred_at_real_time`
 * is always populated via `Date.toISOString()`).
 */
function formatHms(iso: string): string {
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : iso;
}

/** JSON.stringify guarded against circular structures. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Cap a string at `max` chars, replacing the tail with `...` when needed. */
function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 3) + "...";
}

/**
 * Human-friendly byte size: B / KB / MB. We round at fixed precision rather
 * than localised formatters to keep the test fixtures and snapshots stable.
 */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Render the archive row's timestamp as `YYYY-MM-DD HH:MM` (drop seconds /
 * milliseconds / TZ marker). For an archive index a row-per-run view does
 * not need second-level precision.
 */
function formatDateTime(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  return m ? `${m[1]} ${m[2]}` : iso;
}
