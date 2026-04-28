import { useEffect, useMemo, useState } from "react";
import {
  EventEditorApiError,
  HELPER_START_COMMAND,
  loadEventEditorLibrary,
  saveEventEditorDraft,
  validateEventEditorDraft,
} from "./apiClient";
import { clearDraft, loadDraft, saveDraft } from "./draftStorage";
import EventBrowser from "./EventBrowser";
import EventDetailWorkspace from "./EventDetailWorkspace";
import GraphPanel from "./GraphPanel";
import PreviewPanel from "./PreviewPanel";
import SchemaPanel from "./SchemaPanel";
import SavePanel, { type SavePanelState } from "./SavePanel";
import type {
  EditorEventAsset,
  EventEditorDraftRequest,
  EventEditorLibraryResponse,
  EventEditorSaveResponse,
  EventEditorValidateDraftResponse,
  ValidationIssue,
  ValidationReport,
} from "./types";
import ValidationPanel from "./ValidationPanel";

type LoadLibrary = () => Promise<EventEditorLibraryResponse>;
type ValidateDraft = (request: EventEditorDraftRequest) => Promise<EventEditorValidateDraftResponse>;
type SaveDraftAsset = (request: EventEditorDraftRequest) => Promise<EventEditorSaveResponse>;

interface EventEditorPageProps {
  loadLibrary?: LoadLibrary;
  validateDraft?: ValidateDraft;
  saveDraftAsset?: SaveDraftAsset;
}

interface DraftState {
  restoredCount: number;
  activeAsset: EditorEventAsset<unknown> | null;
  draft: unknown | null;
  selectedJsonPath: string | null;
}

type InspectorTab = "schema" | "preview" | "graph" | "validation";

export default function EventEditorPage({
  loadLibrary = loadEventEditorLibrary,
  validateDraft = validateEventEditorDraft,
  saveDraftAsset = saveEventEditorDraft,
}: EventEditorPageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [library, setLibrary] = useState<EventEditorLibraryResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [draftState, setDraftState] = useState<DraftState>({
    restoredCount: 0,
    activeAsset: null,
    draft: null,
    selectedJsonPath: null,
  });
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("schema");
  const [saveState, setSaveState] = useState<SavePanelState>({ status: "idle" });

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

  const browserAssets = useMemo(() => (library ? getBrowserAssets(library) : []), [library]);
  const hasUnsavedDraft =
    draftState.activeAsset !== null &&
    draftState.draft !== null &&
    canSaveAsset(draftState.activeAsset) &&
    !jsonEqual(draftState.activeAsset.data, draftState.draft);
  const changeSummary =
    draftState.activeAsset && draftState.draft !== null ? buildChangeSummary(draftState.activeAsset.data, draftState.draft) : "";

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

          {draftState.activeAsset && canSaveAsset(draftState.activeAsset) && (hasUnsavedDraft || saveState.status === "success") ? (
            <SavePanel asset={draftState.activeAsset} changeSummary={changeSummary} state={saveState} onSave={saveActiveDraft} />
          ) : null}

          {draftState.activeAsset && library ? (
            <EventDetailWorkspace
              asset={draftState.activeAsset}
              draft={draftState.draft ?? draftState.activeAsset.data}
              library={library}
              onDraftChange={updateDraft}
            />
          ) : null}
        </div>

        {draftState.activeAsset && library ? (
          <EventInspectorSidebar
            activeTab={inspectorTab}
            asset={draftState.activeAsset}
            draft={draftState.draft ?? draftState.activeAsset.data}
            library={library}
            selectedJsonPath={draftState.selectedJsonPath}
            onSelectTab={setInspectorTab}
            onOpenIssue={openValidationIssue}
          />
        ) : null}
      </div>
    </section>
  );

  function selectAsset(asset: EditorEventAsset<unknown>): void {
    const draft = canEditAsset(asset) ? (loadDraft(asset) ?? asset.data) : null;
    setSaveState({ status: "idle" });
    setDraftState((current) => ({
      ...current,
      activeAsset: asset,
      draft,
      selectedJsonPath: null,
    }));
  }

  function openValidationIssue(issue: ValidationIssue): void {
    const asset = issue.asset_id ? findAssetForIssue(library, issue) : null;
    setInspectorTab("validation");
    setDraftState((current) => ({
      ...current,
      activeAsset: asset ?? current.activeAsset,
      draft: asset ? draftForAsset(asset) : current.draft,
      selectedJsonPath: issue.json_path ?? asset?.json_path ?? null,
    }));
  }

  function updateDraft(draft: unknown): void {
    if (!draftState.activeAsset || !canEditAsset(draftState.activeAsset)) {
      return;
    }

    saveDraft(draftState.activeAsset, draft);
    setSaveState({ status: "idle" });
    setDraftState((current) => ({ ...current, draft }));
  }

  async function saveActiveDraft(): Promise<void> {
    const asset = draftState.activeAsset;
    const draft = draftState.draft;
    if (!asset || !canSaveAsset(asset) || draft === null) {
      return;
    }

    const request = buildSaveRequest(asset, draft, buildChangeSummary(asset.data, draft));

    try {
      setSaveState({ status: "validating" });
      const validationResponse = await validateDraft(request);
      applyValidationReport(validationResponse.validation);
      if (!validationResponse.validation.passed) {
        setInspectorTab("validation");
        setSaveState({ status: "validation_failed", message: "Draft did not pass validation." });
        return;
      }

      setSaveState({ status: "saving" });
      const saveResponse = await saveDraftAsset(request);
      applyValidationReport(saveResponse.validation);
      clearDraft(asset);

      const refreshedLibrary = await loadLibrary();
      applyLoadedLibrary(refreshedLibrary, asset);
      setSaveState({ status: "success", message: `Saved to ${saveResponse.file_path}.` });
    } catch (nextError) {
      handleSaveError(nextError);
    }
  }

  function applyLoadedLibrary(nextLibrary: EventEditorLibraryResponse, preferredAsset?: EditorEventAsset<unknown>): void {
    const editableAssets = getEditableAssets(nextLibrary);
    const browserAssets = getBrowserAssets(nextLibrary);
    const restoredDrafts = editableAssets
      .map((asset) => ({ asset, draft: loadDraft<unknown>(asset) }))
      .filter((entry): entry is { asset: EditorEventAsset<unknown>; draft: unknown } => entry.draft !== null);
    const refreshedAsset = preferredAsset ? findMatchingAsset(nextLibrary, preferredAsset) : null;
    const activeAsset = refreshedAsset ?? restoredDrafts[0]?.asset ?? editableAssets[0] ?? browserAssets[0] ?? null;
    const activeDraft = activeAsset && canEditAsset(activeAsset) ? (loadDraft(activeAsset) ?? activeAsset.data) : null;

    setLibrary(nextLibrary);
    setDraftState({
      restoredCount: restoredDrafts.length,
      activeAsset,
      draft: activeDraft,
      selectedJsonPath: null,
    });
  }

  function applyValidationReport(validation: ValidationReport): void {
    setLibrary((current) => (current ? { ...current, validation } : current));
  }

  function handleSaveError(nextError: unknown): void {
    const apiError = nextError as Partial<EventEditorApiError> & { details?: Record<string, unknown> };
    const validation = apiError.details?.validation as ValidationReport | undefined;

    if (validation) {
      applyValidationReport(validation);
      setInspectorTab("validation");
    }

    if (apiError.code === "validation_failed") {
      setSaveState({ status: "validation_failed", message: "Draft did not pass validation." });
      return;
    }

    if (apiError.code === "conflict") {
      setSaveState({
        status: "conflict",
        message: "Hash conflict detected.",
        currentBaseHash: typeof apiError.details?.current_base_hash === "string" ? apiError.details.current_base_hash : undefined,
      });
      return;
    }

    if (apiError.code === "helper_unavailable") {
      setSaveState({
        status: "error",
        message: `Helper unavailable. Start it with ${HELPER_START_COMMAND}, then retry the save.`,
      });
      return;
    }

    setSaveState({
      status: "error",
      message: nextError instanceof Error ? nextError.message : "Save failed for an unknown reason.",
    });
  }
}

function EventInspectorSidebar({
  activeTab,
  asset,
  draft,
  library,
  selectedJsonPath,
  onSelectTab,
  onOpenIssue,
}: {
  activeTab: InspectorTab;
  asset: EditorEventAsset<unknown>;
  draft: unknown;
  library: EventEditorLibraryResponse;
  selectedJsonPath: string | null;
  onSelectTab: (tab: InspectorTab) => void;
  onOpenIssue: (issue: ValidationIssue) => void;
}) {
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: "schema", label: "Schema" },
    { id: "preview", label: "Preview" },
    { id: "graph", label: "Graph" },
    { id: "validation", label: "Validation" },
  ];

  return (
    <aside className="event-inspector" aria-label="Event inspector">
      <div className="event-inspector-heading">
        <div>
          <h3>Inspector</h3>
          <p className="muted-text">Schema, preview, graph, and validation context for the active asset.</p>
        </div>
      </div>

      <div className="inspector-tabs" role="tablist" aria-label="Inspector tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "inspector-tab inspector-tab-active" : "inspector-tab"}
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "schema" ? <SchemaPanel asset={asset} draft={draft} library={library} /> : null}
      {activeTab === "preview" ? <PreviewPanel asset={asset} draft={draft} library={library} /> : null}
      {activeTab === "graph" ? <GraphPanel asset={asset} draft={draft} library={library} /> : null}
      {activeTab === "validation" ? (
        <ValidationPanel asset={asset} library={library} selectedJsonPath={selectedJsonPath} onOpenIssue={onOpenIssue} />
      ) : null}
    </aside>
  );
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
        <div>
          <dt>Base hash</dt>
          <dd>{asset.base_hash}</dd>
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

function canSaveAsset(asset: EditorEventAsset<unknown>): asset is EditorEventAsset<unknown> & { asset_type: EventEditorDraftRequest["asset_type"] } {
  return asset.editable && (asset.asset_type === "event_definition" || asset.asset_type === "call_template");
}

function buildSaveRequest(
  asset: EditorEventAsset<unknown> & { asset_type: EventEditorDraftRequest["asset_type"] },
  draft: unknown,
  changeSummary: string,
): EventEditorDraftRequest {
  return {
    asset_type: asset.asset_type,
    asset_id: asset.id,
    file_path: asset.file_path,
    json_path: asset.json_path,
    base_hash: asset.base_hash,
    draft,
    change_summary: changeSummary,
  };
}

function draftForAsset(asset: EditorEventAsset<unknown>): unknown | null {
  return canEditAsset(asset) ? (loadDraft(asset) ?? asset.data) : null;
}

function findMatchingAsset(
  library: EventEditorLibraryResponse,
  target: Pick<EditorEventAsset<unknown>, "asset_type" | "id" | "file_path">,
): EditorEventAsset<unknown> | null {
  return (
    getAllAssets(library).find(
      (asset) => asset.asset_type === target.asset_type && asset.id === target.id && asset.file_path === target.file_path,
    ) ?? null
  );
}

function findAssetForIssue(library: EventEditorLibraryResponse | null, issue: ValidationIssue): EditorEventAsset<unknown> | null {
  if (!library || !issue.asset_id) {
    return null;
  }

  return (
    [...library.definitions, ...library.call_templates, ...library.presets, ...library.legacy_events].find(
      (asset) => asset.id === issue.asset_id && (!issue.asset_type || asset.asset_type === issue.asset_type),
    ) ?? null
  );
}

function getAllAssets(library: EventEditorLibraryResponse): EditorEventAsset<unknown>[] {
  return [...library.definitions, ...library.call_templates, ...library.presets, ...library.legacy_events];
}

function buildChangeSummary(original: unknown, draft: unknown): string {
  const fields = changedTopLevelFields(original, draft);

  if (fields.length === 0) {
    return "No changes detected.";
  }

  return `Changed fields: ${fields.join(", ")}`;
}

function changedTopLevelFields(original: unknown, draft: unknown): string[] {
  if (!isRecord(original) || !isRecord(draft)) {
    return jsonEqual(original, draft) ? [] : ["value"];
  }

  return Array.from(new Set([...Object.keys(original), ...Object.keys(draft)]))
    .filter((key) => !jsonEqual(original[key], draft[key]))
    .sort((first, second) => first.localeCompare(second));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonEqual(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function isHelperUnavailable(error: Error | null): boolean {
  return error instanceof EventEditorApiError && error.code === "helper_unavailable";
}
