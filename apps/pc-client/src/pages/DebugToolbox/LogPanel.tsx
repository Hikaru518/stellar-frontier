import { useEffect, useState } from "react";
import { Panel } from "../../components/Layout";
import { logger } from "../../logger";
import type { LogStatus, LoggerFacade } from "../../logger";
import type { LogSource } from "../../logger/types";

type Mode = "current" | "archive";
type SourceFilter = "all" | LogSource;

export interface LogPanelProps {
  /** Optional injection seam for tests; defaults to the production singleton. */
  facade?: LoggerFacade;
}

export function LogPanel({ facade = logger }: LogPanelProps) {
  const [mode, setMode] = useState<Mode>("current");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [status, setStatus] = useState<LogStatus>(() => facade.getStatus());

  // Subscribe so banners stay in sync when worker transitions to memory_only or
  // (post TASK-015) writerRole flips. Real-time tail rendering is TASK-012.
  useEffect(() => {
    const unsubscribe = facade.subscribe(() => {
      setStatus(facade.getStatus());
    });
    return unsubscribe;
  }, [facade]);

  const isMemoryOnly = status.mode === "memory_only";

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

      <div className="log-panel-list" aria-label="日志列表">
        {/* TASK-012 implements the real-time tail; TASK-018 implements the archive list. */}
        <div className="muted-text">（实时 tail 与历史列表将在后续 task 中接入）</div>
      </div>
    </Panel>
  );
}
