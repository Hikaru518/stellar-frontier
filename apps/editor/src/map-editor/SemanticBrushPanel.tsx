import { TERRAIN_OPTIONS, WEATHER_OPTIONS } from "./TileInspector";
import type { MapEditorCommand, MapEditorDraft, SemanticBrush } from "./types";

interface SemanticBrushPanelProps {
  draft: MapEditorDraft;
  selectedTileId: string | null;
  activeBrush: SemanticBrush | null;
  onActiveBrushChange: (brush: SemanticBrush | null) => void;
  onCommand: (command: MapEditorCommand) => void;
}

export default function SemanticBrushPanel({
  draft,
  selectedTileId,
  activeBrush,
  onActiveBrushChange,
  onCommand,
}: SemanticBrushPanelProps) {
  const selectedTile = selectedTileId ? draft.tiles.find((tile) => tile.id === selectedTileId) : null;
  const selectedDiscovered = selectedTileId ? draft.initialDiscoveredTileIds.includes(selectedTileId) : false;

  return (
    <section className="map-summary-card semantic-brush-panel" aria-label="Semantic brush">
      <div className="map-panel-subheading">
        <h3>Semantic Brush</h3>
        <button type="button" onClick={() => onActiveBrushChange(null)} disabled={!activeBrush}>
          Clear
        </button>
      </div>
      <p className="muted-text">Applies explicit gameplay edits to clicked tiles.</p>

      <label>
        Terrain brush
        <select
          aria-label="Terrain brush"
          value={activeBrush?.kind === "terrain" ? activeBrush.value : ""}
          onChange={(event) => {
            if (event.target.value) {
              onActiveBrushChange({ kind: "terrain", value: event.target.value });
            }
          }}
        >
          <option value="">Choose terrain</option>
          {TERRAIN_OPTIONS.map((terrain) => (
            <option key={terrain} value={terrain}>
              {terrain}
            </option>
          ))}
        </select>
      </label>

      <label>
        Weather brush
        <select
          aria-label="Weather brush"
          value={activeBrush?.kind === "weather" ? activeBrush.value : ""}
          onChange={(event) => {
            if (event.target.value) {
              onActiveBrushChange({ kind: "weather", value: event.target.value });
            }
          }}
        >
          <option value="">Choose weather</option>
          {WEATHER_OPTIONS.map((weather) => (
            <option key={weather} value={weather}>
              {weather}
            </option>
          ))}
        </select>
      </label>

      <div className="semantic-brush-actions">
        <button type="button" onClick={() => onActiveBrushChange({ kind: "origin" })} aria-pressed={activeBrush?.kind === "origin"}>
          Origin Brush
        </button>
        <button
          type="button"
          onClick={() => onActiveBrushChange({ kind: "discovered", discovered: true })}
          aria-pressed={activeBrush?.kind === "discovered" && activeBrush.discovered}
        >
          Discover Brush
        </button>
        <button
          type="button"
          onClick={() => onActiveBrushChange({ kind: "discovered", discovered: false })}
          aria-pressed={activeBrush?.kind === "discovered" && !activeBrush.discovered}
        >
          Hide Brush
        </button>
      </div>

      <div className="semantic-brush-actions">
        <button type="button" onClick={() => selectedTileId && onCommand({ type: "gameplay/setOrigin", tileId: selectedTileId })} disabled={!selectedTileId}>
          Set selected origin
        </button>
        <button
          type="button"
          onClick={() =>
            selectedTileId && onCommand({ type: "gameplay/setDiscovered", tileId: selectedTileId, discovered: !selectedDiscovered })
          }
          disabled={!selectedTileId}
        >
          Toggle selected discovered
        </button>
      </div>

      <dl className="inspector-summary">
        <div>
          <dt>Armed</dt>
          <dd>{formatBrush(activeBrush)}</dd>
        </div>
        <div>
          <dt>Selected</dt>
          <dd>{selectedTile ? `${selectedTile.id} · ${selectedTile.terrain} · ${selectedTile.weather}` : "No tile"}</dd>
        </div>
      </dl>
    </section>
  );
}

function formatBrush(brush: SemanticBrush | null): string {
  if (!brush) {
    return "None";
  }
  if (brush.kind === "terrain" || brush.kind === "weather") {
    return `${brush.kind}: ${brush.value}`;
  }
  if (brush.kind === "discovered") {
    return brush.discovered ? "initial discovered: on" : "initial discovered: off";
  }
  return "origin";
}
