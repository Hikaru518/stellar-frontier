import type { MapEditorState } from "./types";

export type MapEditorTool = "select" | "semanticBrush";

interface ToolbarProps {
  state: MapEditorState;
  selectedTileId: string | null;
  activeTool: MapEditorTool;
  activeMapFilePath: string | null;
  dirty: boolean;
  saving: boolean;
  onToolChange: (tool: MapEditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
}

const TOOL_OPTIONS: Array<{ id: MapEditorTool; label: string }> = [
  { id: "select", label: "Select" },
  { id: "semanticBrush", label: "Semantic Brush" },
];

export default function Toolbar({
  state,
  selectedTileId,
  activeTool,
  activeMapFilePath,
  dirty,
  saving,
  onToolChange,
  onUndo,
  onRedo,
  onSave,
}: ToolbarProps) {
  return (
    <div className="map-canvas-toolbar">
      <div>
        <h3>{state.draft.name}</h3>
        <p className="muted-text">
          <code>{activeMapFilePath ?? `content/maps/${state.draft.id}.json`}</code>
        </p>
      </div>
      <div className="map-toolbar-actions" aria-label="Map editor toolbar">
        <div className="map-tool-segment" role="group" aria-label="Map editing tools">
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
        <span className="status-tag status-muted">Radar {state.draft.radar.world.width} x {state.draft.radar.world.height}</span>
        <span className={dirty ? "status-tag status-warning" : "status-tag status-success"}>{dirty ? "Unsaved" : "Saved"}</span>
        <button type="button" onClick={onUndo} disabled={state.history.past.length === 0}>
          Undo
        </button>
        <button type="button" onClick={onRedo} disabled={state.history.future.length === 0}>
          Redo
        </button>
        <button type="button" onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
