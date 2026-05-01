import { createVisualLayer } from "./mapEditorModel";
import type { MapEditorCommand, MapEditorState } from "./types";

interface LayerPanelProps {
  state: MapEditorState;
  soloLayerId: string | null;
  onSoloLayerChange: (layerId: string | null) => void;
  onCommand: (command: MapEditorCommand) => void;
}

export default function LayerPanel({ state, soloLayerId, onSoloLayerChange, onCommand }: LayerPanelProps) {
  const layers = state.draft.visual.layers;

  function addLayer() {
    const nextNumber = layers.length + 1;
    onCommand({
      type: "layer/add",
      layer: createVisualLayer(createUniqueLayerId(layers.map((layer) => layer.id), `layer-${nextNumber}`), `Layer ${nextNumber}`),
    });
  }

  return (
    <section className="map-layer-panel" aria-label="Visual layers">
      <div className="map-panel-heading">
        <h3>Layers</h3>
        <button type="button" className="map-command-button" onClick={addLayer}>
          Add Layer
        </button>
      </div>

      {layers.length === 0 ? <p className="muted-text">No visual layers. Add one before painting.</p> : null}

      <ol className="map-layer-list">
        {layers.map((layer, index) => (
          <li key={layer.id} className={state.activeLayerId === layer.id ? "map-layer-row map-layer-row-active" : "map-layer-row"}>
            <div className="map-layer-main">
              <input
                aria-label={`Layer name ${layer.id}`}
                value={layer.name}
                onChange={(event) => onCommand({ type: "layer/rename", layerId: layer.id, name: event.target.value })}
              />
              <button
                type="button"
                className="map-layer-active-button"
                aria-pressed={state.activeLayerId === layer.id}
                onClick={() => onCommand({ type: "layer/setActive", layerId: layer.id })}
              >
                Active
              </button>
            </div>

            <div className="map-layer-controls">
              <button
                type="button"
                aria-label={`Move ${layer.name} up`}
                disabled={index === 0}
                onClick={() => onCommand({ type: "layer/move", layerId: layer.id, direction: "up" })}
              >
                Up
              </button>
              <button
                type="button"
                aria-label={`Move ${layer.name} down`}
                disabled={index === layers.length - 1}
                onClick={() => onCommand({ type: "layer/move", layerId: layer.id, direction: "down" })}
              >
                Down
              </button>
              <button type="button" aria-label={`Delete ${layer.name}`} onClick={() => onCommand({ type: "layer/delete", layerId: layer.id })}>
                Delete
              </button>
            </div>

            <div className="map-layer-toggles">
              <label>
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={(event) => onCommand({ type: "layer/setVisible", layerId: layer.id, visible: event.target.checked })}
                />
                Visible
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={layer.locked}
                  onChange={(event) => onCommand({ type: "layer/setLocked", layerId: layer.id, locked: event.target.checked })}
                />
                Locked
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={soloLayerId === layer.id}
                  onChange={(event) => onSoloLayerChange(event.target.checked ? layer.id : null)}
                />
                Solo
              </label>
            </div>

            <label className="map-opacity-control">
              Opacity
              <input
                type="range"
                aria-label="Opacity"
                min="0"
                max="100"
                value={Math.round(layer.opacity * 100)}
                onChange={(event) =>
                  onCommand({ type: "layer/setOpacity", layerId: layer.id, opacity: Number(event.target.value) / 100 })
                }
              />
              <span>{Math.round(layer.opacity * 100)}%</span>
            </label>

            <code>{layer.id}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}

function createUniqueLayerId(existingIds: string[], baseId: string): string {
  const existing = new Set(existingIds);
  if (!existing.has(baseId)) {
    return baseId;
  }

  for (let index = 2; ; index += 1) {
    const candidate = `${baseId}-${index}`;
    if (!existing.has(candidate)) {
      return candidate;
    }
  }
}
