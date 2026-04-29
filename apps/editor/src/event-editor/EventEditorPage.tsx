import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { EventEditorApiError, HELPER_START_COMMAND, loadEventEditorLibrary } from "./apiClient";
import EventBrowser from "./EventBrowser";
import GraphPanel from "./GraphPanel";
import SchemaPanel from "./SchemaPanel";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

type LoadLibrary = () => Promise<EventEditorLibraryResponse>;

interface EventEditorPageProps {
  loadLibrary?: LoadLibrary;
}

type InspectorTab = "schema" | "graph";

const BROWSER_PANE_STORAGE_KEY = "editor.browserPane.v1";
const DEFAULT_BROWSER_PANE_WIDTH = 320;
const MIN_BROWSER_PANE_WIDTH = 220;
const MAX_BROWSER_PANE_WIDTH = 720;

export default function EventEditorPage({ loadLibrary = loadEventEditorLibrary }: EventEditorPageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [library, setLibrary] = useState<EventEditorLibraryResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [activeAsset, setActiveAsset] = useState<EditorEventAsset<unknown> | null>(null);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("schema");
  const [browserPaneState, setBrowserPaneState] = useState(loadBrowserPaneState);

  useEffect(() => {
    let isActive = true;

    setStatus("loading");
    setError(null);
    loadLibrary()
      .then((nextLibrary) => {
        if (!isActive) {
          return;
        }

        applyLoadedLibrary(nextLibrary);
        setStatus("loaded");
      })
      .catch((nextError: unknown) => {
        if (!isActive) {
          return;
        }

        setError(nextError instanceof Error ? nextError : new Error("Unknown helper error."));
        setStatus("error");
      });

    return () => {
      isActive = false;
    };
  }, [loadLibrary]);

  useEffect(() => {
    saveBrowserPaneState(browserPaneState);
  }, [browserPaneState]);

  const browserAssets = useMemo(() => (library ? getBrowserAssets(library) : []), [library]);

  if (status === "loading") {
    return (
      <section className="panel panel-accent editor-main" aria-live="polite">
        <Header statusLabel="LOADING" />
        <p>Loading event library...</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="panel panel-accent editor-main" aria-live="assertive">
        <Header statusLabel="ERROR" />
        <div className="editor-state-card">
          <h3>{isHelperUnavailable(error) ? "Helper unavailable" : "Library load failed"}</h3>
          <p>{error?.message ?? "The local helper returned an unknown error."}</p>
          <p className="muted-text">
            From the repository root, run <code>{HELPER_START_COMMAND}</code>, then refresh the editor.
          </p>
        </div>
      </section>
    );
  }

  if (browserAssets.length === 0) {
    return (
      <section className="panel panel-accent editor-main">
        <Header statusLabel="EMPTY" />
        <div className="editor-state-card">
          <h3>No event assets found</h3>
          <p className="muted-text">The helper responded, but the event library did not include structured event assets.</p>
        </div>
      </section>
    );
  }

  if (!library) {
    return null;
  }

  return (
    <section className="panel panel-accent editor-main">
      <Header statusLabel="READY" />
      <EventLibraryStatusBar library={library} />

      <div
        className={browserPaneState.collapsed ? "event-workspace-2col event-workspace-browser-collapsed" : "event-workspace-2col"}
        style={{
          gridTemplateColumns: browserPaneState.collapsed ? "48px minmax(0, 1fr)" : `${browserPaneState.width}px minmax(0, 1fr)`,
        }}
      >
        <EventBrowserPane
          collapsed={browserPaneState.collapsed}
          onCollapse={() => setBrowserPaneState((current) => ({ ...current, collapsed: true }))}
          onExpand={() => setBrowserPaneState((current) => ({ ...current, collapsed: false }))}
          onResizeStart={startBrowserResize}
        >
          <EventBrowser library={library} selectedAsset={activeAsset} onSelectAsset={setActiveAsset} />
        </EventBrowserPane>

        <div className="event-detail-pane" aria-label="Selected event workspace">
          {activeAsset ? (
            <>
              <AssetHeaderStrip asset={activeAsset} />
              <EventInspectorPanel
                activeTab={inspectorTab}
                asset={activeAsset}
                library={library}
                onSelectTab={setInspectorTab}
              />
            </>
          ) : (
            <div className="editor-state-card">
              <h3>Select an asset</h3>
              <p className="muted-text">Pick an event definition or call template from the browser to view its schema and graph.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );

  function applyLoadedLibrary(nextLibrary: EventEditorLibraryResponse): void {
    const assets = getBrowserAssets(nextLibrary);
    setLibrary(nextLibrary);
    setActiveAsset(assets[0] ?? null);
    setInspectorTab("schema");
  }

  function startBrowserResize(event: ReactMouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    const initialX = event.clientX;
    const initialWidth = browserPaneState.width;

    function handleMouseMove(moveEvent: MouseEvent): void {
      const nextWidth = clampBrowserPaneWidth(initialWidth + moveEvent.clientX - initialX);
      setBrowserPaneState((current) => ({ ...current, width: nextWidth, collapsed: false }));
    }

    function handleMouseUp(): void {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }
}

function EventLibraryStatusBar({ library }: { library: EventEditorLibraryResponse }) {
  return (
    <div className="editor-library-status-pill" aria-label="Event library status">
      <strong>Loaded</strong>
      <span>{formatCount(library.definitions.length, "definition")}</span>
      <span>{formatCount(library.call_templates.length, "call template")}</span>
      <span>{formatCount(library.presets.length, "preset")}</span>
      <span>{formatCount(library.handlers.length, "handler")}</span>
    </div>
  );
}

function EventBrowserPane({
  children,
  collapsed,
  onCollapse,
  onExpand,
  onResizeStart,
}: {
  children: ReactNode;
  collapsed: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onResizeStart: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  if (collapsed) {
    return (
      <aside className="browser-pane browser-pane-collapsed" aria-label="Event browser pane">
        <button type="button" className="browser-pane-expand" aria-label="Expand event browser" onClick={onExpand}>
          <span aria-hidden="true">E</span>
          <span className="browser-pane-rail-label">EVENT BROWSER</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="browser-pane" aria-label="Event browser pane">
      <div className="browser-pane-toolbar">
        <button type="button" className="browser-pane-toggle" aria-label="Collapse event browser" onClick={onCollapse}>
          {"<"}
        </button>
      </div>
      {children}
      <div className="pane-resizer" role="separator" aria-label="Resize event browser" aria-orientation="vertical" onMouseDown={onResizeStart} />
    </aside>
  );
}

function EventInspectorPanel({
  activeTab,
  asset,
  library,
  onSelectTab,
}: {
  activeTab: InspectorTab;
  asset: EditorEventAsset<unknown>;
  library: EventEditorLibraryResponse;
  onSelectTab: (tab: InspectorTab) => void;
}) {
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: "schema", label: "Schema" },
    { id: "graph", label: "Graph" },
  ];

  return (
    <section className="event-inspector" aria-label="Event inspector">
      <div className="inspector-tabs" role="tablist" aria-label="Inspector tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-label={tab.id === "graph" ? "Inspector Graph" : undefined}
            className={activeTab === tab.id ? "inspector-tab inspector-tab-active" : "inspector-tab"}
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "schema" ? <SchemaPanel asset={asset} draft={asset.data} library={library} /> : null}
      {activeTab === "graph" ? <GraphPanel asset={asset} draft={asset.data} library={library} /> : null}
    </section>
  );
}

function AssetHeaderStrip({ asset }: { asset: EditorEventAsset<unknown> }) {
  return (
    <section className="asset-header-strip" aria-label="Selection summary">
      <h3>Selection summary</h3>
      <div className="asset-header-main">
        <strong>{asset.id}</strong>
        <span className="status-tag status-muted">{asset.asset_type}</span>
      </div>
      <dl className="asset-header-meta">
        <div>
          <dt>Domain</dt>
          <dd>{asset.domain}</dd>
        </div>
        <div>
          <dt>File</dt>
          <dd>
            <code>{asset.file_path}</code>
          </dd>
        </div>
        <div>
          <dt>JSON path</dt>
          <dd>
            <code>{asset.json_path}</code>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function Header({ statusLabel }: { statusLabel: string }) {
  return (
    <div className="editor-panel-heading">
      <div>
        <h2 className="panel-title">Event Inspector</h2>
        <p className="muted-text">Read-only view of structured event assets served by the local helper.</p>
      </div>
      <span className="status-tag status-success">{statusLabel}</span>
    </div>
  );
}

function getBrowserAssets(library: EventEditorLibraryResponse): EditorEventAsset<unknown>[] {
  return [...library.definitions, ...library.call_templates, ...library.presets, ...library.handlers];
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function loadBrowserPaneState(): { width: number; collapsed: boolean } {
  try {
    const rawState = window.localStorage.getItem(BROWSER_PANE_STORAGE_KEY);
    if (!rawState) {
      return { width: DEFAULT_BROWSER_PANE_WIDTH, collapsed: false };
    }

    const parsedState = JSON.parse(rawState) as Partial<{ width: number; collapsed: boolean }>;
    return {
      width: clampBrowserPaneWidth(typeof parsedState.width === "number" ? parsedState.width : DEFAULT_BROWSER_PANE_WIDTH),
      collapsed: parsedState.collapsed === true,
    };
  } catch {
    return { width: DEFAULT_BROWSER_PANE_WIDTH, collapsed: false };
  }
}

function saveBrowserPaneState(state: { width: number; collapsed: boolean }): void {
  try {
    window.localStorage.setItem(BROWSER_PANE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Browser storage is a convenience for layout preference; ignore unavailable storage.
  }
}

function clampBrowserPaneWidth(width: number): number {
  return Math.max(MIN_BROWSER_PANE_WIDTH, Math.min(MAX_BROWSER_PANE_WIDTH, Math.round(width)));
}

function isHelperUnavailable(error: Error | null): boolean {
  return error instanceof EventEditorApiError && error.code === "helper_unavailable";
}
