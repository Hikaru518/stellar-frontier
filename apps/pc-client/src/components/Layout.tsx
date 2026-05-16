import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { SystemLog, Tone } from "../data/gameData";
import {
  PERFORMANCE_DIAGNOSTIC_SOURCES,
  recordPerformanceDiagnostic,
  subscribePerformanceDiagnostics,
  type PerformanceDiagnosticSnapshot,
} from "../performanceDiagnostics";

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

interface GameConsoleStatusItem {
  label: string;
  value: ReactNode;
}

interface GameConsoleNavItem {
  id: string;
  label: string;
  meta?: string;
  active?: boolean;
  attention?: boolean;
  onClick?: () => void;
}

interface GameConsoleLayoutProps {
  title: string;
  subtitle: string;
  gameTimeLabel?: string;
  statusItems?: GameConsoleStatusItem[];
  navItems: GameConsoleNavItem[];
  crewPanel: ReactNode;
  rightPanel: ReactNode;
  bottomBar: ReactNode;
  children: ReactNode;
}

const GAME_CONSOLE_STAGE_WIDTH = 1600;
const GAME_CONSOLE_STAGE_HEIGHT = 900;

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

export function GameConsoleLayout({
  title,
  subtitle,
  gameTimeLabel,
  statusItems = [],
  navItems,
  crewPanel,
  rightPanel,
  bottomBar,
  children,
}: GameConsoleLayoutProps) {
  const screenRef = useRef<HTMLDivElement | null>(null);
  const performanceMonitor = useConsolePerformanceSnapshot();
  const [isPerformancePanelOpen, setIsPerformancePanelOpen] = useState(false);
  const stageScale = useGameConsoleStageScale();
  const stageStyle = {
    "--game-console-stage-width": `${GAME_CONSOLE_STAGE_WIDTH}px`,
    "--game-console-stage-height": `${GAME_CONSOLE_STAGE_HEIGHT}px`,
    "--game-console-stage-scale": stageScale.toFixed(4),
  } as CSSProperties;

  useEffect(() => {
    const screen = screenRef.current;
    if (!screen) {
      return;
    }

    const prefersReducedMotion =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : { matches: false };
    let frame = 0;
    let rafId: number | null = null;

    const tick = () => {
      if (prefersReducedMotion.matches) {
        screen.dataset.glitch = "off";
        screen.style.setProperty("--glitch-shift", "0px");
        screen.style.setProperty("--glitch-band", "46%");
        screen.style.setProperty("--glitch-opacity", "0");
        return;
      }

      const burst = frame % 118 < 7 || Math.sin(frame * 0.071) > 0.992;
      screen.dataset.glitch = burst ? "on" : "off";
      screen.style.setProperty("--glitch-shift", burst ? `${Math.round(Math.sin(frame * 1.7) * 3)}px` : "0px");
      screen.style.setProperty("--glitch-band", `${32 + (frame * 7) % 36}%`);
      screen.style.setProperty("--glitch-opacity", burst ? "1" : "0");
      frame += 1;
      rafId = window.requestAnimationFrame(tick);
    };

    tick();
    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return (
    <div className="game-console-viewport" style={stageStyle}>
      <div className="game-console-stage">
        <main className="game-console-shell">
          <header className="game-console-topbar">
            <div className="game-console-titleblock">
              <p className="game-console-kicker">stellar frontier / game console direction</p>
              <h1>{title}</h1>
            </div>
            <div className="game-console-status-cluster">
              <div className="game-console-status-copy">
                <div className="game-console-status-strip">
                  {gameTimeLabel ? (
                    <div className="console-status-card console-status-card-wide">
                      <span>time</span>
                      <strong>{gameTimeLabel}</strong>
                    </div>
                  ) : null}
                  {statusItems.map((item) => (
                    <div key={item.label} className="console-status-card">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
                {subtitle ? <p className="console-status-summary">{subtitle}</p> : null}
              </div>
              <ConsolePerformanceStatusButton
                isOpen={isPerformancePanelOpen}
                snapshot={performanceMonitor.snapshot}
                onToggle={() => setIsPerformancePanelOpen((value) => !value)}
              />
            </div>
          </header>

          <section className="game-console-main">
            <aside className="game-console-left">
              <section className="console-column-panel">
                <div className="console-column-header">
                  <span>interface view</span>
                </div>
                <div className="console-nav-list">
                  {navItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`console-nav-button ${item.active ? "console-nav-button-active" : ""}`}
                      onClick={item.onClick}
                    >
                      <span className="console-nav-label">
                        {item.label}
                        {item.attention ? <span className="console-nav-attention" aria-label="有更新">*</span> : null}
                      </span>
                      {item.meta ? <span className="console-nav-meta">{item.meta}</span> : null}
                    </button>
                  ))}
                </div>
              </section>

              <section className="console-column-panel">
                <div className="console-column-header">
                  <span>crew list</span>
                </div>
                {crewPanel}
              </section>
            </aside>

            <section className="game-console-center">
              <div className="console-display-case">
                <div className="console-display-bezel">
                  <div ref={screenRef} className="console-display-screen" data-glitch="off">
                    {isPerformancePanelOpen ? (
                      <ConsolePerformanceDetails
                        diagnostics={performanceMonitor.diagnostics}
                        snapshot={performanceMonitor.snapshot}
                      />
                    ) : (
                      children
                    )}
                  </div>
                </div>
              </div>
            </section>

            <aside className="game-console-right">{rightPanel}</aside>
          </section>

          <footer className="game-console-bottom">{bottomBar}</footer>
        </main>
      </div>
    </div>
  );
}

function useGameConsoleStageScale() {
  const [scale, setScale] = useState(() => getGameConsoleStageScale());

  useEffect(() => {
    const updateScale = () => setScale(getGameConsoleStageScale());

    updateScale();
    window.addEventListener("resize", updateScale);
    window.visualViewport?.addEventListener("resize", updateScale);

    return () => {
      window.removeEventListener("resize", updateScale);
      window.visualViewport?.removeEventListener("resize", updateScale);
    };
  }, []);

  return scale;
}

function getGameConsoleStageScale() {
  if (typeof window === "undefined") {
    return 1;
  }

  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const fitScale = Math.min(viewportWidth / GAME_CONSOLE_STAGE_WIDTH, viewportHeight / GAME_CONSOLE_STAGE_HEIGHT);
  return Math.min(1, Math.max(0.4, fitScale));
}

type PerformanceTone = "stable" | "busy" | "lag";
type PerformanceSourcePriority = "normal" | "warn" | "danger";

interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  jankCount: number;
  longTaskCount: number;
  longTaskMs: number;
  tone: PerformanceTone;
}

interface PerformanceCounters {
  frames: number;
  lastFrameAt: number;
  lastPublishAt: number;
  latestFrameMs: number;
  jankCount: number;
  longTaskCount: number;
  longTaskMs: number;
}

interface PerformanceSourceView {
  label: string;
  value: string;
  durationMs: number;
  priority: PerformanceSourcePriority;
}

const INITIAL_PERFORMANCE_SNAPSHOT: PerformanceSnapshot = {
  fps: 0,
  frameMs: 0,
  jankCount: 0,
  longTaskCount: 0,
  longTaskMs: 0,
  tone: "stable",
};

const INITIAL_PERFORMANCE_DIAGNOSTICS = createInitialPerformanceDiagnostics();

function createInitialPerformanceDiagnostics(): PerformanceDiagnosticSnapshot {
  return PERFORMANCE_DIAGNOSTIC_SOURCES.reduce((snapshot, source) => {
    snapshot[source] = { source, durationMs: 0, count: 0, updatedAt: 0 };
    return snapshot;
  }, {} as PerformanceDiagnosticSnapshot);
}

function getPerformanceTone(snapshot: Omit<PerformanceSnapshot, "tone">): PerformanceTone {
  if (snapshot.fps > 0 && (snapshot.fps < 30 || snapshot.frameMs > 80 || snapshot.longTaskCount >= 2)) {
    return "lag";
  }

  if (snapshot.fps > 0 && (snapshot.fps < 50 || snapshot.frameMs > 34 || snapshot.jankCount > 0 || snapshot.longTaskCount > 0)) {
    return "busy";
  }

  return "stable";
}

function useConsolePerformanceSnapshot() {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot>(INITIAL_PERFORMANCE_SNAPSHOT);
  const [diagnostics, setDiagnostics] = useState<PerformanceDiagnosticSnapshot>(INITIAL_PERFORMANCE_DIAGNOSTICS);
  const countersRef = useRef<PerformanceCounters>({
    frames: 0,
    lastFrameAt: 0,
    lastPublishAt: 0,
    latestFrameMs: 0,
    jankCount: 0,
    longTaskCount: 0,
    longTaskMs: 0,
  });

  useEffect(() => subscribePerformanceDiagnostics(setDiagnostics), []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function" ||
      (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent))
    ) {
      return;
    }

    let rafId: number | null = null;
    let observer: PerformanceObserver | null = null;
    const counters = countersRef.current;

    if (
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask")
    ) {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          counters.longTaskCount += 1;
          counters.longTaskMs += entry.duration;
        }
      });
      observer.observe({ entryTypes: ["longtask"] });
    }

    const tick = (now: number) => {
      if (counters.lastFrameAt > 0) {
        const delta = now - counters.lastFrameAt;
        counters.latestFrameMs = delta;
        if (delta > 50) {
          counters.jankCount += 1;
        }
      }

      counters.lastFrameAt = now;
      counters.frames += 1;

      if (counters.lastPublishAt === 0) {
        counters.lastPublishAt = now;
      }

      const elapsed = now - counters.lastPublishAt;
      if (elapsed >= 1000) {
        recordPerformanceDiagnostic("longtask", counters.longTaskMs, counters.longTaskCount);
        const nextSnapshot = {
          fps: Math.round((counters.frames * 1000) / Math.max(1, elapsed)),
          frameMs: Math.round(counters.latestFrameMs),
          jankCount: counters.jankCount,
          longTaskCount: counters.longTaskCount,
          longTaskMs: Math.round(counters.longTaskMs),
        };

        setSnapshot({
          ...nextSnapshot,
          tone: getPerformanceTone(nextSnapshot),
        });

        counters.frames = 0;
        counters.jankCount = 0;
        counters.longTaskCount = 0;
        counters.longTaskMs = 0;
        counters.lastPublishAt = now;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
      observer?.disconnect();
    };
  }, []);

  return { snapshot, diagnostics };
}

function getPerformanceToneLabel(tone: PerformanceTone) {
  return tone === "lag" ? "lag" : tone === "busy" ? "busy" : "ok";
}

function formatPerformanceEntry(entry: PerformanceDiagnosticSnapshot[keyof PerformanceDiagnosticSnapshot]) {
  if (entry.durationMs <= 0) {
    return "--";
  }

  return `${entry.durationMs}ms${entry.count > 1 ? ` x${entry.count}` : ""}`;
}

function getPerformanceSourcePriority(durationMs: number): PerformanceSourcePriority {
  if (durationMs >= 80) {
    return "danger";
  }
  if (durationMs >= 34) {
    return "warn";
  }
  return "normal";
}

function getSourceDiagnosticViews(diagnostics: PerformanceDiagnosticSnapshot): PerformanceSourceView[] {
  const prioritySources = PERFORMANCE_DIAGNOSTIC_SOURCES.filter((source) => source !== "render").map((source) => {
    const entry = diagnostics[source];
    return {
      label: source,
      value: formatPerformanceEntry(entry),
      durationMs: entry.durationMs,
      priority: getPerformanceSourcePriority(entry.durationMs),
    };
  });

  const activeSources = prioritySources
    .filter((source) => source.durationMs > 0)
    .sort((left, right) => right.durationMs - left.durationMs)
    .slice(0, 6);

  if (activeSources.length > 0) {
    return activeSources;
  }

  return [
    {
      label: "render",
      value: formatPerformanceEntry(diagnostics.render),
      durationMs: diagnostics.render.durationMs,
      priority: getPerformanceSourcePriority(diagnostics.render.durationMs),
    },
  ];
}

function getPerformanceDiagnosticLog(snapshot: PerformanceSnapshot, diagnostics: PerformanceDiagnosticSnapshot): string[] {
  const lines: string[] = [];
  const tick = diagnostics.tick.durationMs;
  const settle = diagnostics.settle.durationMs;
  const wakeups = diagnostics.wakeups.durationMs;
  const eventState = diagnostics.eventState.durationMs;
  const eventWake = diagnostics.eventWake.durationMs;
  const save = diagnostics.save.durationMs;
  const render = diagnostics.render.durationMs;

  if (snapshot.tone === "stable" && snapshot.longTaskCount === 0 && Math.max(tick, save, render) < 34) {
    return ["OK frame budget is clear", "NO ACTIVE BOTTLENECK"];
  }

  if (snapshot.longTaskCount > 0) {
    lines.push(`LONGTASK ${snapshot.longTaskCount}/${snapshot.longTaskMs}ms main thread blocked`);
  }

  if (eventState >= 80) {
    lines.push(`ROOT eventState conversion dominates wakeups (${eventState}ms)`);
    lines.push("CHECK full GameState to event engine projection");
  } else if (eventWake >= 80) {
    lines.push(`ROOT event wakeup execution is hot (${eventWake}ms)`);
    lines.push("CHECK processEventWakeups / graph runner");
  } else if (wakeups >= 80) {
    lines.push(`ROOT event wakeup pipeline is hot (${wakeups}ms)`);
  } else if (settle >= 80) {
    lines.push(`ROOT game settlement is hot (${settle}ms)`);
  } else if (tick >= 80) {
    lines.push(`ROOT global tick is hot (${tick}ms)`);
  }

  if (save >= 50) {
    lines.push(`STORAGE saveGameState cost ${save}ms`);
  }

  if (render >= 34) {
    lines.push(`RENDER app commit cost ${render}ms`);
  }

  return lines.length > 0 ? lines : ["BUSY transient frame pressure", "WATCH source spikes"];
}

function ConsolePerformanceStatusButton({
  snapshot,
  isOpen,
  onToggle,
}: {
  snapshot: PerformanceSnapshot;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const toneLabel = getPerformanceToneLabel(snapshot.tone);
  return (
    <button
      type="button"
      className={`console-performance-button console-performance-button-${snapshot.tone}`}
      aria-label={`性能监控：${toneLabel}`}
      aria-pressed={isOpen}
      onClick={onToggle}
    >
      <span className="console-performance-light" aria-hidden="true" />
      <span className="console-performance-button-copy">
        <span>perf</span>
        <strong>{toneLabel}</strong>
      </span>
    </button>
  );
}

function ConsolePerformanceDetails({
  snapshot,
  diagnostics,
}: {
  snapshot: PerformanceSnapshot;
  diagnostics: PerformanceDiagnosticSnapshot;
}) {
  const toneLabel = getPerformanceToneLabel(snapshot.tone);
  const sources = getSourceDiagnosticViews(diagnostics);
  const logLines = getPerformanceDiagnosticLog(snapshot, diagnostics);

  return (
    <div className={`console-screen-content console-performance-details console-performance-details-${snapshot.tone}`} aria-label="性能监控详情">
      <header className="console-performance-details-header">
        <div>
          <span>performance monitor</span>
          <strong>{toneLabel}</strong>
        </div>
      </header>
      <dl className="console-performance-details-grid">
        <div>
          <dt>fps</dt>
          <dd>{snapshot.fps || "--"}</dd>
        </div>
        <div>
          <dt>frame</dt>
          <dd>{snapshot.frameMs ? `${snapshot.frameMs}ms` : "--"}</dd>
        </div>
        <div>
          <dt>jank</dt>
          <dd>{snapshot.jankCount}</dd>
        </div>
        <div>
          <dt>long</dt>
          <dd>{snapshot.longTaskCount ? `${snapshot.longTaskCount}/${snapshot.longTaskMs}ms` : "0"}</dd>
        </div>
      </dl>
      <section className="console-performance-source-panel">
        <p className="console-screen-section">[ SOURCE DIAGNOSTICS ]</p>
        <dl>
          {sources.map((source) => (
            <div key={source.label} className={`console-performance-source-${source.priority}`}>
              <dt>{source.label}</dt>
              <dd>{source.value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="console-performance-log-panel">
        <p className="console-screen-section">[ ROOT CAUSE LOG ]</p>
        <ol>
          {logLines.map((line) => (
            <li key={line}>
              <span>]</span>
              {line}
            </li>
          ))}
        </ol>
      </section>
    </div>
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
