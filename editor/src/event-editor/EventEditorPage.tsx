import { useEffect, useMemo, useState } from "react";
import { EventEditorApiError, HELPER_START_COMMAND, loadEventEditorLibrary } from "./apiClient";
import { loadDraft, saveDraft } from "./draftStorage";
import EventBrowser from "./EventBrowser";
import EventDetailWorkspace from "./EventDetailWorkspace";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

type LoadLibrary = () => Promise<EventEditorLibraryResponse>;

interface DraftState {
  restoredCount: number;
  activeAsset: EditorEventAsset<unknown> | null;
  draft: unknown | null;
}

export default function EventEditorPage({ loadLibrary = loadEventEditorLibrary }: { loadLibrary?: LoadLibrary }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [library, setLibrary] = useState<EventEditorLibraryResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [draftState, setDraftState] = useState<DraftState>({
    restoredCount: 0,
    activeAsset: null,
    draft: null,
  });

  useEffect(() => {
    let isActive = true;

    setStatus("loading");
    setError(null);
    loadLibrary()
      .then((nextLibrary) => {
        if (!isActive) {
          return;
        }

        const editableAssets = getEditableAssets(nextLibrary);
        const browserAssets = getBrowserAssets(nextLibrary);
        const restoredDrafts = editableAssets
          .map((asset) => ({ asset, draft: loadDraft<unknown>(asset) }))
          .filter((entry): entry is { asset: EditorEventAsset<unknown>; draft: unknown } => entry.draft !== null);
        const activeAsset = restoredDrafts[0]?.asset ?? editableAssets[0] ?? browserAssets[0] ?? null;
        const activeDraft = activeAsset && canEditAsset(activeAsset) ? (loadDraft(activeAsset) ?? activeAsset.data) : null;

        setLibrary(nextLibrary);
        setDraftState({
          restoredCount: restoredDrafts.length,
          activeAsset,
          draft: activeDraft,
        });
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
          <h3>No editable event assets found</h3>
          <p className="muted-text">The helper responded, but the event library did not include editable definitions, templates, or presets.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel panel-accent editor-main">
      <Header statusLabel="READY" />
      <div className="editor-library-summary" aria-label="Event library summary">
        <h3>Library loaded</h3>
        <p className="muted-text">{formatCount(library?.domains.length ?? 0, "domain")}</p>
        <ul>
          <li>{formatCount(library?.definitions.length ?? 0, "definition")}</li>
          <li>{formatCount(library?.call_templates.length ?? 0, "call template")}</li>
          <li>{formatCount(library?.handlers.length ?? 0, "handler")}</li>
          <li>{formatCount(library?.presets.length ?? 0, "preset")}</li>
          <li>{formatCount(library?.legacy_events.length ?? 0, "legacy event")}</li>
        </ul>
        <p>{formatCount(draftState.restoredCount, "local draft")} restored</p>
      </div>

      <div className="event-editor-workspace">
        {library ? <EventBrowser library={library} selectedAsset={draftState.activeAsset} onSelectAsset={selectAsset} /> : null}

        <div className="event-editor-detail">
          {draftState.activeAsset ? <SelectionSummary asset={draftState.activeAsset} /> : null}

          {draftState.activeAsset && library ? (
            <EventDetailWorkspace
              asset={draftState.activeAsset}
              draft={draftState.draft ?? draftState.activeAsset.data}
              library={library}
              onDraftChange={updateDraft}
            />
          ) : null}
        </div>
      </div>
    </section>
  );

  function selectAsset(asset: EditorEventAsset<unknown>): void {
    const draft = canEditAsset(asset) ? (loadDraft(asset) ?? asset.data) : null;
    setDraftState((current) => ({
      ...current,
      activeAsset: asset,
      draft,
    }));
  }

  function updateDraft(draft: unknown): void {
    if (!draftState.activeAsset || !canEditAsset(draftState.activeAsset)) {
      return;
    }

    saveDraft(draftState.activeAsset, draft);
    setDraftState((current) => ({ ...current, draft }));
  }
}

function SelectionSummary({ asset }: { asset: EditorEventAsset<unknown> }) {
  return (
    <div className="selection-summary" aria-label="Selection summary">
      <h3>Selection summary</h3>
      <p>
        Selected asset <code>{asset.id}</code>
      </p>
      <dl>
        <div>
          <dt>Type</dt>
          <dd>{asset.asset_type}</dd>
        </div>
        <div>
          <dt>Domain</dt>
          <dd>{asset.domain}</dd>
        </div>
        <div>
          <dt>Edit mode</dt>
          <dd>{canEditAsset(asset) ? "Local draft scratchpad" : "Read-only legacy format"}</dd>
        </div>
      </dl>
    </div>
  );
}

function Header({ statusLabel }: { statusLabel: string }) {
  return (
    <div className="editor-panel-heading">
      <div>
        <h2 className="panel-title">Event Editor</h2>
        <p className="muted-text">Loads the local helper library and keeps drafts in browser storage.</p>
      </div>
      <span className="status-tag status-success">{statusLabel}</span>
    </div>
  );
}

function getEditableAssets(library: EventEditorLibraryResponse): EditorEventAsset<unknown>[] {
  return [...library.definitions, ...library.call_templates, ...library.presets, ...library.legacy_events].filter(
    (asset) => canEditAsset(asset),
  );
}

function getBrowserAssets(library: EventEditorLibraryResponse): EditorEventAsset<unknown>[] {
  return [...library.definitions, ...library.call_templates, ...library.legacy_events];
}

function canEditAsset(asset: EditorEventAsset<unknown>): boolean {
  return asset.editable && asset.asset_type !== "legacy_event";
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function isHelperUnavailable(error: Error | null): boolean {
  return error instanceof EventEditorApiError && error.code === "helper_unavailable";
}
