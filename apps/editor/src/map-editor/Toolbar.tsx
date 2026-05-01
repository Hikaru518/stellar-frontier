import type { MapEditorState } from "./types";

export type MapEditorTool = "select" | "brush" | "eraser" | "bucketFill" | "rectangleFill" | "eyedropper";

interface ToolbarProps {
  state: MapEditorState;
  selectedTileId: string | null;
  activeTool: MapEditorTool;
  soloLayerId: string | null;
  activeMapFilePath: string | null;
  onToolChange: (tool: MapEditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const TOOL_OPTIONS: Array<{ id: MapEditorTool; label: string }> = [
  { id: "select", label: "Select" },
  { id: "brush", label: "Brush" },
  { id: "eraser", label: "Eraser" },
  { id: "bucketFill", label: "Bucket Fill" },
  { id: "rectangleFill", label: "Rectangle Fill" },
  { id: "eyedropper", label: "Eyedropper" },
];

export default function Toolbar({
  state,
  selectedTileId,
  activeTool,
  soloLayerId,
  activeMapFilePath,
  onToolChange,
  onUndo,
  onRedo,
}: ToolbarProps) {
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
        <div className="map-tool-segment" role="group" aria-label="Map painting tools">
          {TOOL_OPTIONS.map((tool) => (
            <button
              key={tool.id}
              type="button"
              aria-pressed={activeTool === tool.id}
              onClick={() => onToolChange(tool.id)}
            >
              {tool.label}
            </button>
          ))}
        </div>
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
