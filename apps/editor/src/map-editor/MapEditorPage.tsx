import { useEffect, useState } from "react";
import { MapEditorApiError, HELPER_START_COMMAND, loadMapEditorLibrary, saveMapDraft, validateMapDraft } from "./apiClient";
import { createInitialMapEditorState, normalizeMapEditorDraft } from "./mapEditorModel";
import { mapEditorReducer } from "./mapEditorReducer";
import MapFilePanel from "./MapFilePanel";
import MapGrid from "./MapGrid";
import SemanticBrushPanel from "./SemanticBrushPanel";
import TileInspector from "./TileInspector";
import Toolbar, { type MapEditorTool } from "./Toolbar";
import ValidationPanel, { getIssueTileId } from "./ValidationPanel";
import type { MapEditorLibraryMap, MapEditorLibraryResponse, MapValidationIssue, SaveMapResponse, ValidateMapResponse } from "./apiClient";
import type { MapEditorCommand, MapEditorDraft, MapEditorState, SemanticBrush } from "./types";

type LoadLibrary = () => Promise<MapEditorLibraryResponse>;
type ValidateMap = (input: { filePath?: string | null; data: MapEditorDraft }) => Promise<ValidateMapResponse>;
type SaveMap = (input: { filePath?: string | null; data: MapEditorDraft }) => Promise<SaveMapResponse>;

interface MapEditorPageProps {
  loadLibrary?: LoadLibrary;
  validateMap?: ValidateMap;
  saveMap?: SaveMap;
}

export default function MapEditorPage({
  loadLibrary = loadMapEditorLibrary,
  validateMap = validateMapDraft,
  saveMap = saveMapDraft,
}: MapEditorPageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [library, setLibrary] = useState<MapEditorLibraryResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<MapEditorState | null>(null);
  const [activeMapFilePath, setActiveMapFilePath] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState<MapEditorDraft | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<MapEditorTool>("select");
  const [activeSemanticBrush, setActiveSemanticBrush] = useState<SemanticBrush | null>(null);
  const [gameplayOverlay, setGameplayOverlay] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<{ errors: MapValidationIssue[]; warnings: MapValidationIssue[] }>({
    errors: [],
    warnings: [],
  });
  const [saveState, setSaveState] = useState<"idle" | "validating" | "saving">("idle");

  useEffect(() => {
    let isActive = true;

    setStatus("loading");
    setError(null);
    loadLibrary()
      .then((nextLibrary) => {
        if (!isActive) {
          return;
        }

        setLibrary(nextLibrary);
        const firstMap = nextLibrary.maps[0] ?? null;
        const firstDraft = firstMap ? toDraft(firstMap.data) : null;
        setSelectedMapId(firstMap?.id ?? null);
        setEditorState(firstDraft ? createInitialMapEditorState(firstDraft) : null);
        setActiveMapFilePath(firstMap?.file_path ?? null);
        setSavedDraft(firstDraft);
        setSelectedTileId(firstDraft?.originTileId ?? null);
        setValidationIssues({ errors: [], warnings: [] });
        setNotice(null);
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

  function selectMap(mapId: string) {
    const map = library?.maps.find((candidate) => candidate.id === mapId);
    if (!map) {
      return;
    }

    const nextState = createInitialMapEditorState(toDraft(map.data));
    setSelectedMapId(map.id);
    setEditorState(nextState);
    setActiveMapFilePath(map.file_path);
    setSavedDraft(nextState.draft);
    setSelectedTileId(nextState.draft.originTileId);
    setValidationIssues({ errors: [], warnings: [] });
    setNotice(null);
  }

  function createMap(draft: MapEditorDraft) {
    const nextState = createInitialMapEditorState(draft);
    setSelectedMapId(draft.id);
    setEditorState(nextState);
    setActiveMapFilePath(null);
    setSavedDraft(null);
    setSelectedTileId(draft.originTileId);
    setValidationIssues({ errors: [], warnings: [] });
    setNotice(null);
  }

  function dispatch(command: MapEditorCommand) {
    setEditorState((current) => (current ? mapEditorReducer(current, command) : current));
  }

  const isDirty = editorState ? !savedDraft || serializeDraft(editorState.draft) !== serializeDraft(savedDraft) : false;

  async function handleSave() {
    if (!editorState || saveState !== "idle") {
      return;
    }

    const request = { filePath: activeMapFilePath, data: editorState.draft };
    setSaveState("validating");
    setNotice("Validating map draft...");

    try {
      const validation = await validateMap(request);
      setValidationIssues({ errors: validation.errors, warnings: validation.warnings });
      if (!validation.valid || validation.errors.length > 0) {
        setNotice("Validation failed. Fix the listed issues before saving.");
        setSaveState("idle");
        return;
      }

      setSaveState("saving");
      setNotice("Saving map draft...");
      const result = await saveMap(request);
      setValidationIssues({ errors: result.errors ?? [], warnings: result.warnings ?? validation.warnings });
      if (!result.saved) {
        setNotice("Save failed. Fix the listed issues before saving.");
        setSaveState("idle");
        return;
      }

      const filePath = result.file_path ?? activeMapFilePath ?? `content/maps/${editorState.draft.id}.json`;
      const savedMap: MapEditorLibraryMap = {
        id: editorState.draft.id,
        file_path: filePath,
        radar_file_path: result.radar_file_path ?? editorState.draft.radarPath,
        data: editorState.draft,
      };
      setLibrary((current) => (current ? upsertLibraryMap(current, savedMap) : current));
      setSelectedMapId(savedMap.id);
      setActiveMapFilePath(filePath);
      setSavedDraft(editorState.draft);
      setNotice(`Saved ${filePath} and ${savedMap.radar_file_path}.`);
    } catch (saveError) {
      const issue = issueFromSaveError(saveError);
      setValidationIssues({ errors: [issue], warnings: [] });
      setNotice(issue.message);
    } finally {
      setSaveState("idle");
    }
  }

  function handleIssueSelect(issue: MapValidationIssue) {
    const tileId = getIssueTileId(issue);
    if (tileId) {
      setSelectedTileId(tileId);
    }
  }

  if (status === "loading") {
    return (
      <section className="panel panel-accent editor-main" aria-live="polite">
        <Header statusLabel="LOADING" />
        <p>Loading map library...</p>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="panel panel-accent editor-main" aria-live="assertive">
        <Header statusLabel="ERROR" />
        <div className="editor-state-card">
          <h3>{isHelperUnavailable(error) ? "Helper unavailable" : "Map library load failed"}</h3>
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

  return (
    <section className="panel panel-accent editor-main">
      <Header statusLabel={library.maps.length === 0 ? "EMPTY" : "READY"} />
      <MapLibraryStatusBar library={library} />

      <div className="map-editor-workspace">
        <MapFilePanel maps={library.maps} selectedMapId={selectedMapId} onSelectMap={selectMap} onCreateMap={createMap} />

        <MapCanvasShell
          activeMapFilePath={activeMapFilePath}
          editorState={editorState}
          selectedTileId={selectedTileId}
          activeTool={activeTool}
          activeSemanticBrush={activeSemanticBrush}
          gameplayOverlay={gameplayOverlay}
          notice={notice}
          dirty={isDirty}
          saving={saveState !== "idle"}
          onSelectTile={setSelectedTileId}
          onToolChange={changeTool}
          onNotice={setNotice}
          onGameplayOverlayChange={setGameplayOverlay}
          onSave={handleSave}
          onCommand={dispatch}
        />

        <MapSummaryPanel
          library={library}
          editorState={editorState}
          selectedTileId={selectedTileId}
          activeSemanticBrush={activeSemanticBrush}
          gameplayOverlay={gameplayOverlay}
          validationIssues={validationIssues}
          onActiveSemanticBrushChange={changeSemanticBrush}
          onGameplayOverlayChange={setGameplayOverlay}
          onIssueSelect={handleIssueSelect}
          onCommand={dispatch}
        />
      </div>
    </section>
  );

  function changeTool(tool: MapEditorTool) {
    setActiveTool(tool);
    if (tool === "select") {
      setActiveSemanticBrush(null);
    }
  }

  function changeSemanticBrush(brush: SemanticBrush | null) {
    setActiveSemanticBrush(brush);
    if (brush) {
      setActiveTool("semanticBrush");
    }
    setNotice(null);
  }
}

function Header({ statusLabel }: { statusLabel: string }) {
  return (
    <div className="editor-panel-heading">
      <div>
        <h2 className="panel-title">Map Editor</h2>
        <p className="muted-text">Semantic authoring shell for explicit map tiles and radar presentation JSON.</p>
      </div>
      <span className="status-tag status-success">{statusLabel}</span>
    </div>
  );
}

function MapLibraryStatusBar({ library }: { library: MapEditorLibraryResponse }) {
  return (
    <div className="editor-library-status-pill" aria-label="Map library status">
      <strong>Loaded</strong>
      <span>{formatCount(library.maps.length, "map")}</span>
      <span>{formatCount(library.map_objects.length, "map object")}</span>
    </div>
  );
}

function MapCanvasShell({
  activeMapFilePath,
  editorState,
  selectedTileId,
  activeTool,
  activeSemanticBrush,
  gameplayOverlay,
  notice,
  dirty,
  saving,
  onSelectTile,
  onToolChange,
  onNotice,
  onGameplayOverlayChange,
  onSave,
  onCommand,
}: {
  activeMapFilePath: string | null;
  editorState: MapEditorState | null;
  selectedTileId: string | null;
  activeTool: MapEditorTool;
  activeSemanticBrush: SemanticBrush | null;
  gameplayOverlay: boolean;
  notice: string | null;
  dirty: boolean;
  saving: boolean;
  onSelectTile: (tileId: string) => void;
  onToolChange: (tool: MapEditorTool) => void;
  onNotice: (message: string | null) => void;
  onGameplayOverlayChange: (enabled: boolean) => void;
  onSave: () => void;
  onCommand: (command: MapEditorCommand) => void;
}) {
  if (!editorState) {
    return (
      <section className="map-canvas-shell" aria-label="Map editor workspace">
        <div className="editor-state-card">
          <h3>No map draft open</h3>
          <p className="muted-text">Create a new map or select an existing file to begin editing.</p>
        </div>
      </section>
    );
  }

  const state = editorState;

  return (
    <section className="map-canvas-shell" aria-label="Map editor workspace">
      <Toolbar
        state={state}
        selectedTileId={selectedTileId}
        activeTool={activeTool}
        activeMapFilePath={activeMapFilePath}
        dirty={dirty}
        saving={saving}
        onToolChange={(tool) => {
          onToolChange(tool);
          onNotice(null);
        }}
        onUndo={() => onCommand({ type: "history/undo" })}
        onRedo={() => onCommand({ type: "history/redo" })}
        onSave={onSave}
      />

      <div className="map-preview-toggle" role="group" aria-label="Preview mode">
        <button
          type="button"
          aria-pressed={!gameplayOverlay}
          onClick={() => {
            onGameplayOverlayChange(false);
            onNotice(null);
          }}
        >
          Radar
        </button>
        <button
          type="button"
          aria-pressed={gameplayOverlay}
          onClick={() => {
            onGameplayOverlayChange(true);
            onNotice(null);
          }}
        >
          Gameplay Overlay
        </button>
      </div>

      {notice ? (
        <p className="map-editor-notice" role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}

      <MapGrid
        draft={state.draft}
        selectedTileId={selectedTileId}
        gameplayOverlay={gameplayOverlay}
        onSelectTile={onSelectTile}
        onTilePointerDown={handleTilePointerDown}
        onTilePointerEnter={handleTilePointerEnter}
        onTilePointerUp={() => undefined}
      />
    </section>
  );

  function handleTilePointerDown(tileId: string) {
    onSelectTile(tileId);
    if (activeSemanticBrush) {
      onCommand({ type: "gameplay/applySemanticBrush", tileId, brush: activeSemanticBrush });
      onNotice(`Applied ${formatSemanticBrush(activeSemanticBrush)} to ${tileId}.`);
    }
  }

  function handleTilePointerEnter(tileId: string) {
    if (activeSemanticBrush) {
      onCommand({ type: "gameplay/applySemanticBrush", tileId, brush: activeSemanticBrush });
    }
  }
}

function MapSummaryPanel({
  library,
  editorState,
  selectedTileId,
  activeSemanticBrush,
  gameplayOverlay,
  validationIssues,
  onActiveSemanticBrushChange,
  onGameplayOverlayChange,
  onIssueSelect,
  onCommand,
}: {
  library: MapEditorLibraryResponse;
  editorState: MapEditorState | null;
  selectedTileId: string | null;
  activeSemanticBrush: SemanticBrush | null;
  gameplayOverlay: boolean;
  validationIssues: { errors: MapValidationIssue[]; warnings: MapValidationIssue[] };
  onActiveSemanticBrushChange: (brush: SemanticBrush | null) => void;
  onGameplayOverlayChange: (enabled: boolean) => void;
  onIssueSelect: (issue: MapValidationIssue) => void;
  onCommand: (command: MapEditorCommand) => void;
}) {
  if (!editorState) {
    return (
      <aside className="map-summary-panel" aria-label="Map editor summary">
        <section className="map-summary-card">
          <h3>Selection</h3>
          <p className="muted-text">No map draft open.</p>
        </section>
      </aside>
    );
  }

  const { draft } = editorState;
  const selectedTile = selectedTileId ? draft.tiles.find((tile) => tile.id === selectedTileId) : null;
  return (
    <aside className="map-summary-panel" aria-label="Map editor summary">
      <section className="map-summary-card">
        <h3>Selection</h3>
        <dl className="inspector-summary">
          <div>
            <dt>ID</dt>
            <dd>
              <code>{draft.id}</code>
            </dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {draft.size.rows} x {draft.size.cols}
            </dd>
          </div>
          <div>
            <dt>Origin</dt>
            <dd>
              <code>{draft.originTileId}</code>
            </dd>
          </div>
          <div>
            <dt>Radar</dt>
            <dd>
              {draft.radar.world.width} x {draft.radar.world.height}
            </dd>
          </div>
          <div>
            <dt>Selected</dt>
            <dd>{selectedTile ? `${selectedTile.id} · ${selectedTile.areaName}` : "None"}</dd>
          </div>
        </dl>
      </section>

      <section className="map-summary-card">
        <div className="map-panel-subheading">
          <h3>Preview</h3>
          <span className="status-tag status-muted">{gameplayOverlay ? "Gameplay Overlay" : "Radar"}</span>
        </div>
        <div className="map-preview-toggle" role="group" aria-label="Gameplay overlay toggle">
          <button type="button" aria-pressed={!gameplayOverlay} onClick={() => onGameplayOverlayChange(false)}>
            Radar
          </button>
          <button type="button" aria-pressed={gameplayOverlay} onClick={() => onGameplayOverlayChange(true)}>
            Gameplay Overlay
          </button>
        </div>
      </section>

      <SemanticBrushPanel
        draft={draft}
        selectedTileId={selectedTileId}
        activeBrush={activeSemanticBrush}
        onActiveBrushChange={onActiveSemanticBrushChange}
        onCommand={onCommand}
      />

      <TileInspector draft={draft} selectedTileId={selectedTileId} mapObjects={library.map_objects} onCommand={onCommand} />

      <ValidationPanel
        errors={validationIssues.errors}
        warnings={validationIssues.warnings}
        onIssueSelect={onIssueSelect}
      />
    </aside>
  );
}

function toDraft(data: MapEditorDraft): MapEditorDraft {
  return normalizeMapEditorDraft(data);
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function isHelperUnavailable(error: Error | null): boolean {
  return error instanceof MapEditorApiError && error.code === "helper_unavailable";
}

function formatSemanticBrush(brush: SemanticBrush): string {
  if (brush.kind === "terrain" || brush.kind === "weather") {
    return `${brush.kind} ${brush.value}`;
  }
  if (brush.kind === "discovered") {
    return brush.discovered ? "initial discovered" : "initial hidden";
  }
  if (brush.kind === "radarGlyph") {
    return `radar glyph ${brush.glyph}`;
  }
  if (brush.kind === "radarTone") {
    return `radar tone ${brush.tone}`;
  }
  return "origin";
}

function serializeDraft(draft: MapEditorDraft): string {
  return JSON.stringify(draft);
}

function upsertLibraryMap(library: MapEditorLibraryResponse, savedMap: MapEditorLibraryMap): MapEditorLibraryResponse {
  const existingIndex = library.maps.findIndex(
    (map) => map.file_path === savedMap.file_path || map.id === savedMap.id,
  );
  const maps = existingIndex >= 0
    ? library.maps.map((map, index) => (index === existingIndex ? savedMap : map))
    : [...library.maps, savedMap];

  return {
    ...library,
    maps,
  };
}

function issueFromSaveError(error: unknown): MapValidationIssue {
  if (error instanceof MapEditorApiError) {
    return {
      severity: "error",
      code: error.code,
      message: error.code === "file_exists"
        ? "A map file with this id already exists. Rename the new map before saving."
        : error.message,
      target: { kind: "map" },
    };
  }

  return {
    severity: "error",
    code: "save_failed",
    message: error instanceof Error ? error.message : "Save failed.",
    target: { kind: "map" },
  };
}
