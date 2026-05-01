import { useEffect, useMemo, useState } from "react";
import { MapEditorApiError, HELPER_START_COMMAND, loadMapEditorLibrary } from "./apiClient";
import { createInitialMapEditorState, normalizeMapEditorDraft } from "./mapEditorModel";
import type { MapEditorLibraryMap, MapEditorLibraryResponse } from "./apiClient";
import type { MapEditorDraft, MapEditorState } from "./types";

type LoadLibrary = () => Promise<MapEditorLibraryResponse>;

interface MapEditorPageProps {
  loadLibrary?: LoadLibrary;
}

export default function MapEditorPage({ loadLibrary = loadMapEditorLibrary }: MapEditorPageProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [library, setLibrary] = useState<MapEditorLibraryResponse | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);

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
        setSelectedMapId(nextLibrary.maps[0]?.id ?? null);
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

  const selectedMap = useMemo(
    () => library?.maps.find((map) => map.id === selectedMapId) ?? library?.maps[0] ?? null,
    [library, selectedMapId],
  );
  const selectedMapState = useMemo(() => (selectedMap ? createInitialMapEditorState(toDraft(selectedMap.data)) : null), [selectedMap]);

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

  if (library.maps.length === 0) {
    return (
      <section className="panel panel-accent editor-main">
        <Header statusLabel="EMPTY" />
        <div className="editor-state-card">
          <h3>No map files found</h3>
          <p className="muted-text">The helper responded, but the map library did not include content/maps JSON files.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel panel-accent editor-main">
      <Header statusLabel="READY" />
      <MapLibraryStatusBar library={library} />

      <div className="map-editor-workspace">
        <MapFilePanel maps={library.maps} selectedMapId={selectedMap?.id ?? null} onSelectMap={setSelectedMapId} />

        <MapCanvasShell selectedMap={selectedMap} selectedMapState={selectedMapState} />

        <MapSummaryPanel library={library} selectedMap={selectedMap} selectedMapState={selectedMapState} />
      </div>
    </section>
  );
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

function MapFilePanel({
  maps,
  selectedMapId,
  onSelectMap,
}: {
  maps: MapEditorLibraryMap[];
  selectedMapId: string | null;
  onSelectMap: (mapId: string) => void;
}) {
  return (
    <aside className="map-file-panel" aria-label="Map file library">
      <div className="map-panel-heading">
        <h3>Map Files</h3>
        <span className="status-tag status-muted">{maps.length}</span>
      </div>
      <ul className="map-file-list">
        {maps.map((map) => (
          <li key={map.file_path}>
            <button
              type="button"
              className={map.id === selectedMapId ? "map-file-row map-file-row-selected" : "map-file-row"}
              aria-label={`Select ${map.id}`}
              aria-pressed={map.id === selectedMapId}
              onClick={() => onSelectMap(map.id)}
            >
              <span className="map-file-row-title">{map.data.name || map.id}</span>
              <code>{map.file_path}</code>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function MapCanvasShell({
  selectedMap,
  selectedMapState,
}: {
  selectedMap: MapEditorLibraryMap | null;
  selectedMapState: MapEditorState | null;
}) {
  if (!selectedMap || !selectedMapState) {
    return null;
  }

  const { draft } = selectedMapState;
  return (
    <section className="map-canvas-shell" aria-label="Map editor workspace">
      <div className="map-canvas-toolbar">
        <div>
          <h3>{draft.name}</h3>
          <p className="muted-text">
            <code>{selectedMap.file_path}</code>
          </p>
        </div>
        <span className="status-tag status-muted">SHELL</span>
      </div>

      <div
        className="map-grid-placeholder"
        aria-label={`${draft.name} grid preview placeholder`}
        style={{
          gridTemplateColumns: `repeat(${Math.min(draft.size.cols, 12)}, minmax(18px, 1fr))`,
        }}
      >
        {draft.tiles.slice(0, Math.min(draft.tiles.length, 96)).map((tile) => (
          <div key={tile.id} className={tile.id === draft.originTileId ? "map-grid-cell map-grid-cell-origin" : "map-grid-cell"} title={tile.id}>
            <span>{tile.id}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function MapSummaryPanel({
  library,
  selectedMap,
  selectedMapState,
}: {
  library: MapEditorLibraryResponse;
  selectedMap: MapEditorLibraryMap | null;
  selectedMapState: MapEditorState | null;
}) {
  if (!selectedMap || !selectedMapState) {
    return null;
  }

  const { draft, activeLayerId } = selectedMapState;
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
