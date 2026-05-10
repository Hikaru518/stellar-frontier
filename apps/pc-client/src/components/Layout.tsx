import { useEffect, useRef, type ReactNode } from "react";
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

interface GameConsoleStatusItem {
  label: string;
  value: ReactNode;
}

interface GameConsoleNavItem {
  id: string;
  label: string;
  meta?: string;
  active?: boolean;
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
          <ConsoleScope />
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
                  <span className="console-nav-label">{item.label}</span>
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
                {children}
              </div>
            </div>
          </div>
        </section>

        <aside className="game-console-right">{rightPanel}</aside>
      </section>

      <footer className="game-console-bottom">{bottomBar}</footer>
    </main>
  );
}

function ConsoleScope() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent)) {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    let frame = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const width = canvas.width / Math.max(1, window.devicePixelRatio || 1);
      const height = canvas.height / Math.max(1, window.devicePixelRatio || 1);

      context.fillStyle = "#15120e";
      context.fillRect(0, 0, width, height);

      context.strokeStyle = "rgba(116,166,166,0.16)";
      context.lineWidth = 1;
      for (let x = 0; x < width; x += 16) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let y = 0; y < height; y += 10) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      const bandX = (frame * 1.7) % width;
      context.fillStyle = "rgba(240,166,77,0.12)";
      context.fillRect(bandX, 0, 4, height);

      const tone = "#ffb85a";
      const fillTone = "rgba(255,184,90,0.22)";
      const freq = 2.2;

      for (let x = 0; x < width; x += 3) {
        const t = x / Math.max(1, width);
        const wave = Math.sin(t * Math.PI * 2 * freq + frame * 0.08);
        const beat = Math.sin(t * Math.PI * 6.8 - frame * 0.04);
        const y = height / 2 + (wave * 0.28 + beat * 0.12) * height;
        const pixelY = Math.round(y / 3) * 3;
        context.fillStyle = fillTone;
        context.fillRect(x, pixelY, 3, 3);
        if ((x / 3 + Math.floor(frame * 0.6)) % 6 === 0) {
          context.fillStyle = tone;
          context.fillRect(x, pixelY, 3, 3);
        }
      }

      frame += 1;
      frameRef.current = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="console-scope-box" aria-hidden="true">
      <canvas ref={canvasRef} className="console-scope-canvas" />
      <div className="console-scope-readout">
        <span>echo</span>
        <span>65%</span>
      </div>
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
