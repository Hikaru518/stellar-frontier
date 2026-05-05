import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  createDomain,
  createDraft,
  EventEditorApiError,
  HELPER_START_COMMAND,
  loadDraft,
  loadEventEditorLibrary,
} from "./apiClient";
import DraftBrowser from "./authoring/DraftBrowser";
import EventAuthoringWorkspace from "./authoring/EventAuthoringWorkspace";
import EventBrowser from "./EventBrowser";
import GraphPanel from "./GraphPanel";
import SchemaPanel from "./SchemaPanel";
import type {
  CreateDomainResponse,
  CreateDraftRequest,
  CreateDraftResponse,
  EditorEventAsset,
  EventDraftEnvelope,
  EventEditorLibraryResponse,
} from "./types";

type LoadLibrary = () => Promise<EventEditorLibraryResponse>;
type CreateDraftRequestHandler = (request: CreateDraftRequest) => Promise<CreateDraftResponse>;
type LoadDraftRequestHandler = (draftId: string) => Promise<EventDraftEnvelope>;
type CreateDomainRequestHandler = (domainId: string) => Promise<CreateDomainResponse>;

interface EventEditorPageProps {
  loadLibrary?: LoadLibrary;
  createDraftRequest?: CreateDraftRequestHandler;
  loadDraftRequest?: LoadDraftRequestHandler;
  createDomainRequest?: CreateDomainRequestHandler;
}

type InspectorTab = "schema" | "graph";

const BROWSER_PANE_STORAGE_KEY = "editor.browserPane.v1";
const DEFAULT_BROWSER_PANE_WIDTH = 320;
const MIN_BROWSER_PANE_WIDTH = 220;
const MAX_BROWSER_PANE_WIDTH = 720;

export default function EventEditorPage({
  loadLibrary = loadEventEditorLibrary,
  createDraftRequest = defaultCreateDraftRequest,
  loadDraftRequest = defaultLoadDraftRequest,
  createDomainRequest = defaultCreateDomainRequest,
}: EventEditorPageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [library, setLibrary] = useState<EventEditorLibraryResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [actionError, setActionError] = useState<Error | null>(null);
  const [domainActionError, setDomainActionError] = useState<Error | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [activeAsset, setActiveAsset] = useState<EditorEventAsset<unknown> | null>(null);
  const [activeDraft, setActiveDraft] = useState<EventDraftEnvelope | null>(null);
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

  if (!library) {
    return null;
  }

  if (browserAssets.length === 0 && library.domains.length === 0 && library.drafts.length === 0) {
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

  return (
    <section className="panel panel-accent editor-main">
      <Header statusLabel="READY" />
      <EventLibraryStatusBar library={library} />
      {actionError ? <ActionErrorCard error={actionError} /> : null}

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
          <DraftBrowser
            domains={library.domains}
            drafts={library.drafts}
            isBusy={busyAction !== null}
            busyLabel={busyAction}
            errorMessage={actionError ? formatActionError(actionError).message : null}
            domainErrorMessage={domainActionError ? formatActionError(domainActionError).message : null}
            onOpenDraft={handleOpenDraft}
            onCreateDraft={handleCreateDraft}
            onCreateDomain={handleCreateDomain}
          />
          <EventBrowser
            library={library}
            selectedAsset={activeAsset}
            onSelectAsset={(asset) => {
              setActiveDraft(null);
              setActiveAsset(asset);
            }}
            onEditDefinition={handleEditDefinition}
          />
        </EventBrowserPane>

        <div className="event-detail-pane" aria-label="Selected event workspace">
          {activeDraft ? (
            <EventAuthoringWorkspace draft={activeDraft} onDraftChange={setActiveDraft} />
          ) : activeAsset ? (
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
    const normalizedLibrary = normalizeEventEditorLibrary(nextLibrary);
    const assets = getBrowserAssets(normalizedLibrary);
    setLibrary(normalizedLibrary);
    setActiveAsset(assets[0] ?? null);
    setActiveDraft(null);
    setInspectorTab("schema");
  }

  async function refreshLibraryAfterAction({ keepDraft = false }: { keepDraft?: boolean } = {}): Promise<void> {
    const nextLibrary = normalizeEventEditorLibrary(await loadLibrary());
    const assets = getBrowserAssets(nextLibrary);
    setLibrary(nextLibrary);

    if (!keepDraft) {
      setActiveDraft(null);
      setActiveAsset(resolvePreservedAsset(activeAsset, assets) ?? assets[0] ?? null);
    }
  }

  async function handleCreateDraft(request: CreateDraftRequest): Promise<void> {
    setBusyAction("Creating draft...");
    setActionError(null);
    setDomainActionError(null);

    try {
      const response = await createDraftRequest(request);
      setActiveDraft(response.draft);
      setActiveAsset(null);
      await refreshLibraryAfterAction({ keepDraft: true });
    } catch (nextError: unknown) {
      setActionError(toError(nextError));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleOpenDraft(draftId: string): Promise<void> {
    setBusyAction("Opening draft...");
    setActionError(null);
    setDomainActionError(null);

    try {
      const draft = await loadDraftRequest(draftId);
      setActiveDraft(draft);
      setActiveAsset(null);
    } catch (nextError: unknown) {
      setActionError(toError(nextError));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateDomain(domainId: string): Promise<void> {
    setBusyAction("Creating domain...");
    setActionError(null);
    setDomainActionError(null);

    try {
      await createDomainRequest(domainId);
      await refreshLibraryAfterAction({ keepDraft: activeDraft !== null });
    } catch (nextError: unknown) {
      const normalizedError = toError(nextError);
      setDomainActionError(normalizedError);
      throw normalizedError;
    } finally {
      setBusyAction(null);
    }
  }

  function handleEditDefinition(asset: EventEditorLibraryResponse["definitions"][number]): void {
    void handleCreateDraft({
      mode: "edit_existing",
      definition_id: asset.id,
      domain: asset.domain,
    });
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
      <span>{formatCount(library.domains.length, "domain")}</span>
      <span>{formatCount(library.drafts.filter((draft) => draft.status === "active").length, "active draft")}</span>
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

function ActionErrorCard({ error }: { error: Error }) {
  const formatted = formatActionError(error);
  return (
    <div className="editor-state-card event-action-error-card" role="alert">
      <h3>{formatted.title}</h3>
      <p>{formatted.message}</p>
    </div>
  );
}

function Header({ statusLabel }: { statusLabel: string }) {
  return (
    <div className="editor-panel-heading">
      <div>
        <h2 className="panel-title">Event Editor</h2>
        <p className="muted-text">Structured event assets, drafts, and local helper authoring actions.</p>
      </div>
      <span className="status-tag status-success">{statusLabel}</span>
    </div>
  );
}

function getBrowserAssets(library: EventEditorLibraryResponse): EditorEventAsset<unknown>[] {
  return [...library.definitions, ...library.call_templates, ...library.presets, ...library.handlers];
}

function normalizeEventEditorLibrary(library: EventEditorLibraryResponse): EventEditorLibraryResponse {
  return {
    definitions: library.definitions ?? [],
    call_templates: library.call_templates ?? [],
    presets: library.presets ?? [],
    handlers: library.handlers ?? [],
    schemas: library.schemas ?? {},
    domains: library.domains ?? [],
    drafts: library.drafts ?? [],
  };
}

function resolvePreservedAsset(
  currentAsset: EditorEventAsset<unknown> | null,
  assets: EditorEventAsset<unknown>[],
): EditorEventAsset<unknown> | null {
  if (!currentAsset) {
    return null;
  }

  const currentKey = getAssetKey(currentAsset);
  return assets.find((asset) => getAssetKey(asset) === currentKey) ?? null;
}

function getAssetKey(asset: EditorEventAsset<unknown>): string {
  return `${asset.asset_type}:${asset.file_path}:${asset.id}`;
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

function formatActionError(error: Error): { title: string; message: string } {
  if (isHelperUnavailable(error)) {
    return {
      title: "Helper unavailable",
      message: error.message,
    };
  }

  return {
    title: "Action failed",
    message: error.message || "The local helper returned an unknown error.",
  };
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error("Unknown helper error.");
}

function defaultCreateDraftRequest(request: CreateDraftRequest): Promise<CreateDraftResponse> {
  return createDraft({ request });
}

function defaultLoadDraftRequest(draftId: string): Promise<EventDraftEnvelope> {
  return loadDraft({ draftId });
}

function defaultCreateDomainRequest(domainId: string): Promise<CreateDomainResponse> {
  return createDomain({ domainId });
}
