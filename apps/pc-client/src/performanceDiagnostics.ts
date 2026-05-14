export const PERFORMANCE_DIAGNOSTIC_SOURCES = [
  "tick",
  "settle",
  "due",
  "crew",
  "sync",
  "objectives",
  "triggers",
  "wakeups",
  "wakeDue",
  "eventState",
  "eventWake",
  "wakeLog",
  "wakeMerge",
  "wakeDiff",
  "diff",
  "save",
  "render",
  "longtask",
] as const;

export type PerformanceDiagnosticSource = (typeof PERFORMANCE_DIAGNOSTIC_SOURCES)[number];

export interface PerformanceDiagnosticEntry {
  source: PerformanceDiagnosticSource;
  durationMs: number;
  count: number;
  updatedAt: number;
}

export type PerformanceDiagnosticSnapshot = Record<PerformanceDiagnosticSource, PerformanceDiagnosticEntry>;

type Listener = (snapshot: PerformanceDiagnosticSnapshot) => void;

const diagnostics = PERFORMANCE_DIAGNOSTIC_SOURCES.reduce((snapshot, source) => {
  snapshot[source] = {
    source,
    durationMs: 0,
    count: 0,
    updatedAt: 0,
  };
  return snapshot;
}, {} as PerformanceDiagnosticSnapshot);

const listeners = new Set<Listener>();
let notifyQueued = false;

export function recordPerformanceDiagnostic(source: PerformanceDiagnosticSource, durationMs: number, count = 1) {
  diagnostics[source] = {
    source,
    durationMs: Math.max(0, Math.round(durationMs)),
    count,
    updatedAt: Date.now(),
  };

  queueDiagnosticsNotification();
}

function queueDiagnosticsNotification() {
  if (notifyQueued) {
    return;
  }

  notifyQueued = true;
  const notify = () => {
    notifyQueued = false;
    notifyPerformanceDiagnostics();
  };

  if (typeof queueMicrotask === "function") {
    queueMicrotask(notify);
    return;
  }

  Promise.resolve().then(notify);
}

function notifyPerformanceDiagnostics() {
  const snapshot = getPerformanceDiagnosticsSnapshot();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function subscribePerformanceDiagnostics(listener: Listener) {
  listeners.add(listener);
  listener(getPerformanceDiagnosticsSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function getPerformanceDiagnosticsSnapshot(): PerformanceDiagnosticSnapshot {
  return { ...diagnostics };
}
