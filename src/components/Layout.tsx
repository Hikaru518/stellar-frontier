import type { ReactNode } from "react";
import type { SystemLog, Tone } from "../data/gameData";

interface ConsoleShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  gameTimeLabel?: string;
  actions?: ReactNode;
}

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
  tone?: Tone;
}

interface ModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
}

export function ConsoleShell({ title, subtitle, children, gameTimeLabel, actions }: ConsoleShellProps) {
  return (
    <main className="console-shell">
      <header className="page-header">
        <div>
          {gameTimeLabel ? <p className="global-time">{gameTimeLabel}</p> : null}
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </header>
      {children}
    </main>
  );
}

export function Panel({ title, children, className = "", tone = "neutral" }: PanelProps) {
  return (
    <section className={`panel panel-${tone} ${className}`}>
      {title ? <h2 className="panel-title">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Modal({ title, children, onClose }: ModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-window" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-titlebar">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="small-button" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </section>
    </div>
  );
}

export function StatusTag({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`status-tag status-${tone}`}>{children}</span>;
}

export function SystemLogPanel({ logs, onOpenReport }: { logs: SystemLog[]; onOpenReport?: (reportId: string) => void }) {
  return (
    <Panel title="系统日志" className="system-log">
      <ol>
        {logs.slice(-6).map((log) => (
          <li key={log.id} className={`log-${log.tone}`}>
            <span>[{log.time}]</span> {log.text}
            {log.reportId && onOpenReport ? (
              <button type="button" className="small-button log-report-button" onClick={() => onOpenReport(log.reportId!)}>
                查看报告
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </Panel>
  );
}

export function FieldList({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="field-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
