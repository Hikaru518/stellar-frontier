import { useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../../components/Layout";
import { logger } from "../../logger";
import type { LogStatus, LoggerFacade } from "../../logger";
import type { LogEntry, LogSource } from "../../logger/types";

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
  const listRef = useRef<HTMLDivElement | null>(null);

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

  const isMemoryOnly = status.mode === "memory_only";
  const hasFilter = typeFilter !== "" || sourceFilter !== "all";

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
          disabled={isMemoryOnly}
          title={isMemoryOnly ? "OPFS 不可用，无法导出" : undefined}
        >
          导出当前 run
        </button>
      </div>

      {mode === "current" ? (
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
      ) : (
        <div className="log-panel-list muted-text">
          （历史 run 列表将在 TASK-018 接入）
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
