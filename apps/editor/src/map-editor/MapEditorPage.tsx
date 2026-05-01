import { useEffect, useState } from "react";
import { MapEditorApiError, HELPER_START_COMMAND, loadMapEditorLibrary } from "./apiClient";
import { createInitialMapEditorState, normalizeMapEditorDraft } from "./mapEditorModel";
import { mapEditorReducer } from "./mapEditorReducer";
import LayerPanel from "./LayerPanel";
import MapFilePanel from "./MapFilePanel";
import MapGrid from "./MapGrid";
import TilePalette from "./TilePalette";
import Toolbar, { type MapEditorTool } from "./Toolbar";
import type { MapEditorLibraryResponse } from "./apiClient";
import type { MapEditorCommand, MapEditorDraft, MapEditorState, MapVisualCellDefinition } from "./types";

type LoadLibrary = () => Promise<MapEditorLibraryResponse>;

interface MapEditorPageProps {
  loadLibrary?: LoadLibrary;
}

export default function MapEditorPage({ loadLibrary = loadMapEditorLibrary }: MapEditorPageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [library, setLibrary] = useState<MapEditorLibraryResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<MapEditorState | null>(null);
  const [activeMapFilePath, setActiveMapFilePath] = useState<string | null>(null);
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  const [soloLayerId, setSoloLayerId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<MapEditorTool>("select");
  const [selectedBrush, setSelectedBrush] = useState<MapVisualCellDefinition | null>(null);
  const [recentTiles, setRecentTiles] = useState<MapVisualCellDefinition[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

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
        setEditorState(firstMap ? createInitialMapEditorState(toDraft(firstMap.data)) : null);
        setActiveMapFilePath(firstMap?.file_path ?? null);
        setSelectedTileId(firstMap?.data.originTileId ?? null);
        setSoloLayerId(null);
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
    setSelectedTileId(nextState.draft.originTileId);
    setSoloLayerId(null);
    setNotice(null);
  }

  function createMap(draft: MapEditorDraft) {
    const nextState = createInitialMapEditorState(draft);
    setSelectedMapId(draft.id);
    setEditorState(nextState);
    setActiveMapFilePath(`content/maps/${draft.id}.json`);
    setSelectedTileId(draft.originTileId);
    setSoloLayerId(null);
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
          soloLayerId={soloLayerId}
          notice={notice}
          onSelectTile={setSelectedTileId}
          onToolChange={setActiveTool}
          onSelectBrush={selectBrush}
          onNotice={setNotice}
          onCommand={dispatch}
        />

        <MapSummaryPanel
          library={library}
          editorState={editorState}
          selectedTileId={selectedTileId}
          selectedBrush={selectedBrush}
          recentTiles={recentTiles}
          soloLayerId={soloLayerId}
          onSelectBrush={selectBrush}
          onSoloLayerChange={setSoloLayerId}
          onCommand={dispatch}
        />
      </div>
    </section>
  );

  function selectBrush(tile: MapVisualCellDefinition) {
    setSelectedBrush(tile);
    setActiveTool("brush");
    setRecentTiles((current) => [tile, ...current.filter((candidate) => !isSameVisualCell(candidate, tile))].slice(0, 8));
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
  soloLayerId,
  notice,
  onSelectTile,
  onToolChange,
  onSelectBrush,
  onNotice,
  onCommand,
}: {
  activeMapFilePath: string | null;
  editorState: MapEditorState | null;
  tilesets: MapEditorLibraryResponse["tileset_registry"]["tilesets"];
  selectedTileId: string | null;
  activeTool: MapEditorTool;
  selectedBrush: MapVisualCellDefinition | null;
  soloLayerId: string | null;
  notice: string | null;
  onSelectTile: (tileId: string) => void;
  onToolChange: (tool: MapEditorTool) => void;
  onSelectBrush: (tile: MapVisualCellDefinition) => void;
  onNotice: (message: string | null) => void;
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
        onToolChange={(tool) => {
          setRectangleStartTileId(null);
          onToolChange(tool);
          onNotice(null);
        }}
        onUndo={() => onCommand({ type: "history/undo" })}
        onRedo={() => onCommand({ type: "history/redo" })}
      />

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
        onSelectTile={onSelectTile}
        onTilePointerDown={handleTilePointerDown}
        onTilePointerEnter={handleTilePointerEnter}
        onTilePointerUp={handleTilePointerUp}
      />
    </section>
  );

  function handleTilePointerDown(tileId: string) {
    onSelectTile(tileId);

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
  recentTiles,
  soloLayerId,
  onSelectBrush,
  onSoloLayerChange,
  onCommand,
}: {
  library: MapEditorLibraryResponse;
  editorState: MapEditorState | null;
  selectedTileId: string | null;
  selectedBrush: MapVisualCellDefinition | null;
  recentTiles: MapVisualCellDefinition[];
  soloLayerId: string | null;
  onSelectBrush: (tile: MapVisualCellDefinition) => void;
  onSoloLayerChange: (layerId: string | null) => void;
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

      <TilePalette
        registry={library.tileset_registry}
        selectedTile={selectedBrush}
        recentTiles={recentTiles}
        onSelectTile={onSelectBrush}
      />

      <section className="map-summary-card">
        <h3>Tile</h3>
        {selectedTile ? (
          <dl className="inspector-summary">
            <div>
              <dt>ID</dt>
              <dd>
                <code>{selectedTile.id}</code>
              </dd>
            </div>
            <div>
              <dt>Area</dt>
              <dd>{selectedTile.areaName}</dd>
            </div>
            <div>
              <dt>Terrain</dt>
              <dd>{selectedTile.terrain}</dd>
            </div>
            <div>
              <dt>Weather</dt>
              <dd>{selectedTile.weather}</dd>
            </div>
          </dl>
        ) : (
          <p className="muted-text">Select a tile in the grid.</p>
        )}
      </section>

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

      <section className="map-summary-card">
        <h3>Validation</h3>
        <p className="muted-text">Authoritative save validation will run through the local helper.</p>
      </section>
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
