import type { MapEditorState } from "./types";

interface ToolbarProps {
  state: MapEditorState;
  selectedTileId: string | null;
  soloLayerId: string | null;
  activeMapFilePath: string | null;
  onUndo: () => void;
  onRedo: () => void;
}

export default function Toolbar({ state, selectedTileId, soloLayerId, activeMapFilePath, onUndo, onRedo }: ToolbarProps) {
  const activeLayer = state.draft.visual.layers.find((layer) => layer.id === state.activeLayerId);
  const soloLayer = state.draft.visual.layers.find((layer) => layer.id === soloLayerId);

  return (
    <div className="map-canvas-toolbar">
      <div>
        <h3>{state.draft.name}</h3>
        <p className="muted-text">
          <code>{activeMapFilePath ?? `content/maps/${state.draft.id}.json`}</code>
        </p>
      </div>
      <div className="map-toolbar-actions" aria-label="Map editor toolbar">
        <span className="status-tag status-muted">{state.draft.size.rows} x {state.draft.size.cols}</span>
        <span className="status-tag status-muted">{selectedTileId ?? "No tile"}</span>
        <span className="status-tag status-muted">{activeLayer ? activeLayer.name : "No layer"}</span>
        {soloLayer ? <span className="status-tag status-warning">Solo {soloLayer.name}</span> : null}
        <button type="button" onClick={onUndo} disabled={state.history.past.length === 0}>
          Undo
        </button>
        <button type="button" onClick={onRedo} disabled={state.history.future.length === 0}>
          Redo
        </button>
      </div>
    </div>
  );
}
