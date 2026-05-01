import { useEffect, useState } from "react";
import { MapEditorApiError, HELPER_START_COMMAND, loadMapEditorLibrary, saveMapDraft, validateMapDraft } from "./apiClient";
import { createInitialMapEditorState, normalizeMapEditorDraft } from "./mapEditorModel";
import { mapEditorReducer } from "./mapEditorReducer";
import LayerPanel from "./LayerPanel";
import MapFilePanel from "./MapFilePanel";
import MapGrid from "./MapGrid";
import SemanticBrushPanel from "./SemanticBrushPanel";
import TileInspector from "./TileInspector";
import TilePalette from "./TilePalette";
import Toolbar, { type MapEditorTool } from "./Toolbar";
import ValidationPanel, { getIssueLayerId, getIssueTileId } from "./ValidationPanel";
import type { MapEditorLibraryMap, MapEditorLibraryResponse, MapValidationIssue, SaveMapResponse, ValidateMapResponse } from "./apiClient";
import type { MapEditorCommand, MapEditorDraft, MapEditorState, MapVisualCellDefinition, SemanticBrush } from "./types";

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
  const [soloLayerId, setSoloLayerId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<MapEditorTool>("select");
  const [selectedBrush, setSelectedBrush] = useState<MapVisualCellDefinition | null>(null);
  const [activeSemanticBrush, setActiveSemanticBrush] = useState<SemanticBrush | null>(null);
  const [gameplayOverlay, setGameplayOverlay] = useState(false);
  const [recentTiles, setRecentTiles] = useState<MapVisualCellDefinition[]>([]);
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
        setSelectedMapId(firstMap?.id ?? null);
        const firstDraft = firstMap ? toDraft(firstMap.data) : null;
        setEditorState(firstDraft ? createInitialMapEditorState(firstDraft) : null);
        setActiveMapFilePath(firstMap?.file_path ?? null);
        setSavedDraft(firstDraft);
        setSelectedTileId(firstMap?.data.originTileId ?? null);
        setSoloLayerId(null);
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
    setSoloLayerId(null);
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
    setSoloLayerId(null);
    setValidationIssues({ errors: [], warnings: [] });
    setNotice(null);
  }

  function dispatch(command: MapEditorCommand) {
    setEditorState((current) => {
      if (!current) {
        return current;
      }

      const nextState = mapEditorReducer(current, command);
      if (command.type === "layer/delete" && soloLayerId === command.layerId) {
        setSoloLayerId(null);
      }
      return nextState;
    });
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
        data: editorState.draft,
      };
      setLibrary((current) => (current ? upsertLibraryMap(current, savedMap) : current));
      setSelectedMapId(savedMap.id);
      setActiveMapFilePath(filePath);
      setSavedDraft(editorState.draft);
      setNotice(`Saved ${filePath}.`);
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
    const layerId = getIssueLayerId(issue);
    if (tileId) {
      setSelectedTileId(tileId);
    }
    if (layerId) {
      dispatch({ type: "layer/setActive", layerId });
      setSoloLayerId(null);
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
          tilesets={library.tileset_registry.tilesets}
          selectedTileId={selectedTileId}
          activeTool={activeTool}
          selectedBrush={selectedBrush}
          activeSemanticBrush={activeSemanticBrush}
          soloLayerId={soloLayerId}
          gameplayOverlay={gameplayOverlay}
          notice={notice}
          dirty={isDirty}
          saving={saveState !== "idle"}
          onSelectTile={setSelectedTileId}
          onToolChange={changeTool}
          onSelectBrush={selectBrush}
          onNotice={setNotice}
          onGameplayOverlayChange={setGameplayOverlay}
          onSave={handleSave}
          onCommand={dispatch}
        />

        <MapSummaryPanel
          library={library}
          editorState={editorState}
          selectedTileId={selectedTileId}
          selectedBrush={selectedBrush}
          activeSemanticBrush={activeSemanticBrush}
          recentTiles={recentTiles}
          soloLayerId={soloLayerId}
          gameplayOverlay={gameplayOverlay}
          validationIssues={validationIssues}
          onSelectBrush={selectBrush}
          onActiveSemanticBrushChange={changeSemanticBrush}
          onSoloLayerChange={setSoloLayerId}
          onGameplayOverlayChange={setGameplayOverlay}
          onIssueSelect={handleIssueSelect}
          onCommand={dispatch}
        />
      </div>
    </section>
  );

  function selectBrush(tile: MapVisualCellDefinition) {
    setSelectedBrush(tile);
    setActiveTool("brush");
    setActiveSemanticBrush(null);
    setRecentTiles((current) => [tile, ...current.filter((candidate) => !isSameVisualCell(candidate, tile))].slice(0, 8));
    setNotice(null);
  }

  function changeTool(tool: MapEditorTool) {
    setActiveTool(tool);
    setActiveSemanticBrush(null);
  }

  function changeSemanticBrush(brush: SemanticBrush | null) {
    setActiveSemanticBrush(brush);
    if (brush) {
      setActiveTool("select");
    }
    setNotice(null);
  }
}

function Header({ statusLabel }: { statusLabel: string }) {
  return (
    <div className="editor-panel-heading">
      <div>
        <h2 className="panel-title">Map Editor</h2>
        <p className="muted-text">Authoring shell for map files, tilesets, gameplay tiles, and visual layers.</p>
      </div>
      <span className="status-tag status-success">{statusLabel}</span>
    </div>
  );
}

function MapLibraryStatusBar({ library }: { library: MapEditorLibraryResponse }) {
  const tilesetCount = library.tileset_registry.tilesets.length;
  return (
    <div className="editor-library-status-pill" aria-label="Map library status">
      <strong>Loaded</strong>
      <span>{formatCount(library.maps.length, "map")}</span>
      <span>{formatCount(tilesetCount, "tileset")}</span>
      <span>{formatCount(library.map_objects.length, "map object")}</span>
    </div>
  );
}

function MapCanvasShell({
  activeMapFilePath,
  editorState,
  tilesets,
  selectedTileId,
  activeTool,
  selectedBrush,
  activeSemanticBrush,
  soloLayerId,
  gameplayOverlay,
  notice,
  dirty,
  saving,
  onSelectTile,
  onToolChange,
  onSelectBrush,
  onNotice,
  onGameplayOverlayChange,
  onSave,
  onCommand,
}: {
  activeMapFilePath: string | null;
  editorState: MapEditorState | null;
  tilesets: MapEditorLibraryResponse["tileset_registry"]["tilesets"];
  selectedTileId: string | null;
  activeTool: MapEditorTool;
  selectedBrush: MapVisualCellDefinition | null;
  activeSemanticBrush: SemanticBrush | null;
  soloLayerId: string | null;
  gameplayOverlay: boolean;
  notice: string | null;
  dirty: boolean;
  saving: boolean;
  onSelectTile: (tileId: string) => void;
  onToolChange: (tool: MapEditorTool) => void;
  onSelectBrush: (tile: MapVisualCellDefinition) => void;
  onNotice: (message: string | null) => void;
  onGameplayOverlayChange: (enabled: boolean) => void;
  onSave: () => void;
  onCommand: (command: MapEditorCommand) => void;
}) {
  const [rectangleStartTileId, setRectangleStartTileId] = useState<string | null>(null);

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
        soloLayerId={soloLayerId}
        activeMapFilePath={activeMapFilePath}
        dirty={dirty}
        saving={saving}
        onToolChange={(tool) => {
          setRectangleStartTileId(null);
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
          Final Art
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
        tilesets={tilesets}
        selectedTileId={selectedTileId}
        soloLayerId={soloLayerId}
        gameplayOverlay={gameplayOverlay}
        onSelectTile={onSelectTile}
        onTilePointerDown={handleTilePointerDown}
        onTilePointerEnter={handleTilePointerEnter}
        onTilePointerUp={handleTilePointerUp}
      />
    </section>
  );

  function handleTilePointerDown(tileId: string) {
    onSelectTile(tileId);

    if (activeSemanticBrush) {
      onCommand({ type: "gameplay/applySemanticBrush", tileId, brush: activeSemanticBrush });
      onNotice(`Applied ${formatSemanticBrush(activeSemanticBrush)} to ${tileId}.`);
      return;
    }

    if (activeTool === "select") {
      return;
    }

    if (activeTool === "eyedropper") {
      const pickedCell = pickTopVisibleCell(state.draft, tileId);
      if (pickedCell) {
        onSelectBrush(pickedCell);
        onNotice(`Selected tile index ${pickedCell.tileIndex}.`);
      } else {
        onNotice("No visible visual tile on this map cell.");
      }
      return;
    }

    if (activeTool === "rectangleFill") {
      if (!canModifyActiveLayer(state, onNotice)) {
        return;
      }
      if (!selectedBrush) {
        onNotice("Select a palette tile before filling.");
        return;
      }
      setRectangleStartTileId(tileId);
      onNotice("Rectangle fill anchor set.");
      return;
    }

    applyVisualTool(tileId);
  }

  function handleTilePointerEnter(tileId: string) {
    if (activeSemanticBrush) {
      onCommand({ type: "gameplay/applySemanticBrush", tileId, brush: activeSemanticBrush });
      return;
    }

    if (activeTool === "brush") {
      applyVisualTool(tileId);
    }
  }

  function handleTilePointerUp(tileId: string) {
    if (activeTool !== "rectangleFill" || !rectangleStartTileId) {
      return;
    }
    if (!canModifyActiveLayer(state, onNotice) || !selectedBrush) {
      setRectangleStartTileId(null);
      return;
    }

    onCommand({ type: "visual/rectangleFill", fromTileId: rectangleStartTileId, toTileId: tileId, cell: selectedBrush });
    onNotice(null);
    setRectangleStartTileId(null);
  }

  function applyVisualTool(tileId: string) {
    if (!canModifyActiveLayer(state, onNotice)) {
      return;
    }

    if (activeTool === "brush") {
      if (!selectedBrush) {
        onNotice("Select a palette tile before painting.");
        return;
      }
      onCommand({ type: "visual/brush", tileId, cell: selectedBrush });
      onNotice(null);
      return;
    }

    if (activeTool === "eraser") {
      onCommand({ type: "visual/eraser", tileId });
      onNotice(null);
      return;
    }

    if (activeTool === "bucketFill") {
      if (!selectedBrush) {
        onNotice("Select a palette tile before filling.");
        return;
      }
      onCommand({ type: "visual/bucketFill", tileId, cell: selectedBrush });
      onNotice(null);
    }
  }
}

function MapSummaryPanel({
  library,
  editorState,
  selectedTileId,
  selectedBrush,
  activeSemanticBrush,
  recentTiles,
  soloLayerId,
  gameplayOverlay,
  validationIssues,
  onSelectBrush,
  onActiveSemanticBrushChange,
  onSoloLayerChange,
  onGameplayOverlayChange,
  onIssueSelect,
  onCommand,
}: {
  library: MapEditorLibraryResponse;
  editorState: MapEditorState | null;
  selectedTileId: string | null;
  selectedBrush: MapVisualCellDefinition | null;
  activeSemanticBrush: SemanticBrush | null;
  recentTiles: MapVisualCellDefinition[];
  soloLayerId: string | null;
  gameplayOverlay: boolean;
  validationIssues: { errors: MapValidationIssue[]; warnings: MapValidationIssue[] };
  onSelectBrush: (tile: MapVisualCellDefinition) => void;
  onActiveSemanticBrushChange: (brush: SemanticBrush | null) => void;
  onSoloLayerChange: (layerId: string | null) => void;
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

  const { draft, activeLayerId } = editorState;
  const firstTileset = library.tileset_registry.tilesets[0];
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
            <dt>Layers</dt>
            <dd>{draft.visual.layers.length}</dd>
          </div>
          <div>
            <dt>Active layer</dt>
            <dd>{activeLayerId ? <code>{activeLayerId}</code> : "None"}</dd>
          </div>
        </dl>
      </section>

      <LayerPanel state={editorState} soloLayerId={soloLayerId} onSoloLayerChange={onSoloLayerChange} onCommand={onCommand} />

      <section className="map-summary-card">
        <div className="map-panel-subheading">
          <h3>Preview</h3>
          <span className="status-tag status-muted">{gameplayOverlay ? "Gameplay Overlay" : "Final Art"}</span>
        </div>
        <div className="map-preview-toggle" role="group" aria-label="Gameplay overlay toggle">
          <button type="button" aria-pressed={!gameplayOverlay} onClick={() => onGameplayOverlayChange(false)}>
            Final Art
          </button>
          <button type="button" aria-pressed={gameplayOverlay} onClick={() => onGameplayOverlayChange(true)}>
            Gameplay Overlay
          </button>
        </div>
      </section>

      <TilePalette
        registry={library.tileset_registry}
        selectedTile={selectedBrush}
        recentTiles={recentTiles}
        onSelectTile={onSelectBrush}
      />

      <SemanticBrushPanel
        draft={draft}
        selectedTileId={selectedTileId}
        activeBrush={activeSemanticBrush}
        onActiveBrushChange={onActiveSemanticBrushChange}
        onCommand={onCommand}
      />

      <TileInspector draft={draft} selectedTileId={selectedTileId} mapObjects={library.map_objects} onCommand={onCommand} />

      <section className="map-summary-card">
        <h3>Tilesets</h3>
        {firstTileset ? (
          <p className="muted-text">
            {firstTileset.name} · {firstTileset.tileCount} tiles
          </p>
        ) : (
          <p className="muted-text">No tilesets loaded.</p>
        )}
      </section>

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

function canModifyActiveLayer(state: MapEditorState, onNotice: (message: string | null) => void): boolean {
  const activeLayer = state.draft.visual.layers.find((layer) => layer.id === state.activeLayerId);
  if (!activeLayer) {
    onNotice("Add or activate a visual layer before painting.");
    return false;
  }
  if (activeLayer.locked) {
    onNotice(`Layer "${activeLayer.name}" is locked.`);
    return false;
  }
  return true;
}

function pickTopVisibleCell(draft: MapEditorDraft, tileId: string): MapVisualCellDefinition | null {
  for (let index = draft.visual.layers.length - 1; index >= 0; index -= 1) {
    const layer = draft.visual.layers[index];
    if (!layer?.visible) {
      continue;
    }

    const cell = layer.cells[tileId];
    if (cell) {
      return { ...cell };
    }
  }
  return null;
}

function isSameVisualCell(left: MapVisualCellDefinition, right: MapVisualCellDefinition): boolean {
  return left.tilesetId === right.tilesetId && left.tileIndex === right.tileIndex;
}

function formatSemanticBrush(brush: SemanticBrush): string {
  if (brush.kind === "terrain" || brush.kind === "weather") {
    return `${brush.kind} ${brush.value}`;
  }
  if (brush.kind === "discovered") {
    return brush.discovered ? "initial discovered" : "initial hidden";
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
