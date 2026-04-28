import { useEffect, useMemo, useState } from "react";
import { EventEditorApiError, HELPER_START_COMMAND, loadEventEditorLibrary } from "./apiClient";
import { loadDraft, saveDraft } from "./draftStorage";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

type LoadLibrary = () => Promise<EventEditorLibraryResponse>;

interface DraftState {
  restoredCount: number;
  activeAsset: EditorEventAsset<unknown> | null;
  text: string;
  error: string | null;
}

export default function EventEditorPage({ loadLibrary = loadEventEditorLibrary }: { loadLibrary?: LoadLibrary }) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [library, setLibrary] = useState<EventEditorLibraryResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [draftState, setDraftState] = useState<DraftState>({
    restoredCount: 0,
    activeAsset: null,
    text: "",
    error: null,
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
        const restoredDrafts = editableAssets
          .map((asset) => ({ asset, draft: loadDraft<unknown>(asset) }))
          .filter((entry): entry is { asset: EditorEventAsset<unknown>; draft: unknown } => entry.draft !== null);
        const activeAsset = restoredDrafts[0]?.asset ?? editableAssets[0] ?? null;
        const activeDraft = activeAsset ? (loadDraft(activeAsset) ?? activeAsset.data) : null;

        setLibrary(nextLibrary);
        setDraftState({
          restoredCount: restoredDrafts.length,
          activeAsset,
          text: activeDraft ? JSON.stringify(activeDraft, null, 2) : "",
          error: null,
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

  const editableAssets = useMemo(() => (library ? getEditableAssets(library) : []), [library]);

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

  if (editableAssets.length === 0) {
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

      {draftState.activeAsset ? (
        <div className="rjsf-preview" aria-label="Draft storage preview">
          <h3>Local draft scratchpad</h3>
          <p className="muted-text">
            Previewing local-only draft storage for <code>{draftState.activeAsset.id}</code>. Save UX arrives in a later task.
          </p>
          <label className="draft-scratchpad-label" htmlFor="draft-json-scratchpad">
            Draft JSON scratchpad
          </label>
          <textarea
            id="draft-json-scratchpad"
            aria-label="Draft JSON scratchpad"
            value={draftState.text}
            onChange={(event) => updateDraftText(event.target.value)}
            rows={10}
          />
          {draftState.error ? <p className="status-error">{draftState.error}</p> : null}
        </div>
      ) : null}
    </section>
  );

  function updateDraftText(text: string): void {
    if (!draftState.activeAsset) {
      return;
    }

    try {
      const parsedDraft = JSON.parse(text);
      saveDraft(draftState.activeAsset, parsedDraft);
      setDraftState((current) => ({ ...current, text, error: null }));
    } catch {
      setDraftState((current) => ({ ...current, text, error: "Draft JSON is invalid and was not saved." }));
    }
  }
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
    (asset) => asset.editable,
  );
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function isHelperUnavailable(error: Error | null): boolean {
  return error instanceof EventEditorApiError && error.code === "helper_unavailable";
}
