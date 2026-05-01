import { useState } from "react";
import type { MapEditorMapObject } from "./apiClient";
import type {
  MapEditorCommand,
  MapEditorDraft,
  MapRadiationLevel,
  MapSpecialStateSeverity,
  MapTileDefinition,
  MapVisibility,
} from "./types";

export const TERRAIN_OPTIONS = ["平原", "水", "森林 / 山", "丘陵", "旧医疗前哨", "坠落广播塔", "沙漠", "裂谷", "高地", "荒原"];
export const WEATHER_OPTIONS = ["晴朗", "阴天", "薄雾", "强风", "沙尘", "酸雨", "静电风暴"];
export const RADIATION_OPTIONS: MapRadiationLevel[] = ["none", "low", "medium", "high", "critical"];
export const SPECIAL_SEVERITY_OPTIONS: MapSpecialStateSeverity[] = ["low", "medium", "high", "critical"];
export const VISIBILITY_OPTIONS: MapVisibility[] = ["onDiscovered", "onInvestigated", "hidden"];

interface TileInspectorProps {
  draft: MapEditorDraft;
  selectedTileId: string | null;
  mapObjects: MapEditorMapObject[];
  onCommand: (command: MapEditorCommand) => void;
}

interface SpecialStateForm {
  id: string;
  name: string;
  severity: MapSpecialStateSeverity;
  visibility: MapVisibility;
  startsActive: boolean;
}

export default function TileInspector({ draft, selectedTileId, mapObjects, onCommand }: TileInspectorProps) {
  const [specialStateForm, setSpecialStateForm] = useState<SpecialStateForm>({
    id: "",
    name: "",
    severity: "medium",
    visibility: "onDiscovered",
    startsActive: true,
  });

  const tile = selectedTileId ? draft.tiles.find((candidate) => candidate.id === selectedTileId) : null;

  if (!tile) {
    return (
      <section className="map-summary-card tile-inspector" aria-label="Tile gameplay inspector">
        <h3>Gameplay Inspector</h3>
        <p className="muted-text">Select a tile in the grid.</p>
      </section>
    );
  }

  return (
    <section className="map-summary-card tile-inspector" aria-label="Tile gameplay inspector">
      <div className="map-panel-subheading">
        <h3>Gameplay Inspector</h3>
        <code>{tile.id}</code>
      </div>

      <label>
        Area name
        <input
          type="text"
          value={tile.areaName}
          onChange={(event) => updateTile(tile.id, { areaName: event.target.value })}
        />
      </label>

      <div className="tile-inspector-two-column">
        <label>
          Terrain
          <select value={tile.terrain} onChange={(event) => updateTile(tile.id, { terrain: event.target.value })}>
            {TERRAIN_OPTIONS.map((terrain) => (
              <option key={terrain} value={terrain}>
                {terrain}
              </option>
            ))}
          </select>
        </label>
        <label>
          Weather
          <select value={tile.weather} onChange={(event) => updateTile(tile.id, { weather: event.target.value })}>
            {WEATHER_OPTIONS.map((weather) => (
              <option key={weather} value={weather}>
                {weather}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend>Environment</legend>
        <div className="tile-inspector-two-column">
          <NumberField tile={tile} name="temperatureCelsius" label="Temp C" onCommand={onCommand} />
          <NumberField tile={tile} name="humidityPercent" label="Humidity %" onCommand={onCommand} />
          <NumberField tile={tile} name="magneticFieldMicroTesla" label="Magnetic uT" onCommand={onCommand} />
          <NumberField tile={tile} name="atmosphericPressureKpa" label="Pressure kPa" onCommand={onCommand} />
          <label>
            Radiation
            <select
              value={tile.environment.radiationLevel}
              onChange={(event) =>
                updateTile(tile.id, { environment: { ...tile.environment, radiationLevel: event.target.value as MapRadiationLevel } })
              }
            >
              {RADIATION_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label>
            Toxicity
            <select
              value={tile.environment.toxicityLevel ?? "none"}
              onChange={(event) =>
                updateTile(tile.id, { environment: { ...tile.environment, toxicityLevel: event.target.value as MapRadiationLevel } })
              }
            >
              {RADIATION_OPTIONS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Objects</legend>
        <div className="tile-inspector-checkbox-list">
          {mapObjects.length === 0 ? <p className="muted-text">No map object library loaded.</p> : null}
          {mapObjects.map((object) => (
            <label key={object.id}>
              <input
                type="checkbox"
                checked={tile.objectIds.includes(object.id)}
                onChange={(event) => toggleObject(tile, object.id, event.target.checked)}
              />
              <span>
                {object.name} <code>{object.id}</code>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Special states</legend>
        <ul className="tile-inspector-special-list">
          {tile.specialStates.map((state) => (
            <li key={state.id}>
              <span>
                <strong>{state.name}</strong> <code>{state.id}</code> · {state.severity} · {state.visibility}
              </span>
              <button type="button" onClick={() => removeSpecialState(tile, state.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>

        <div className="tile-inspector-special-form" aria-label="Add special state">
          <input
            aria-label="Special state id"
            placeholder="id"
            value={specialStateForm.id}
            onChange={(event) => setSpecialStateForm((current) => ({ ...current, id: event.target.value }))}
          />
          <input
            aria-label="Special state name"
            placeholder="name"
            value={specialStateForm.name}
            onChange={(event) => setSpecialStateForm((current) => ({ ...current, name: event.target.value }))}
          />
          <select
            aria-label="Special state severity"
            value={specialStateForm.severity}
            onChange={(event) =>
              setSpecialStateForm((current) => ({ ...current, severity: event.target.value as MapSpecialStateSeverity }))
            }
          >
            {SPECIAL_SEVERITY_OPTIONS.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
          <select
            aria-label="Special state visibility"
            value={specialStateForm.visibility}
            onChange={(event) => setSpecialStateForm((current) => ({ ...current, visibility: event.target.value as MapVisibility }))}
          >
            {VISIBILITY_OPTIONS.map((visibility) => (
              <option key={visibility} value={visibility}>
                {visibility}
              </option>
            ))}
          </select>
          <label>
            <input
              type="checkbox"
              checked={specialStateForm.startsActive}
              onChange={(event) => setSpecialStateForm((current) => ({ ...current, startsActive: event.target.checked }))}
            />
            Starts active
          </label>
          <button type="button" onClick={() => addSpecialState(tile)} disabled={!specialStateForm.id.trim() || !specialStateForm.name.trim()}>
            Add special
          </button>
        </div>
      </fieldset>
    </section>
  );

  function updateTile(tileId: string, patch: Extract<MapEditorCommand, { type: "gameplay/updateTile" }>["patch"]) {
    onCommand({ type: "gameplay/updateTile", tileId, patch });
  }

  function toggleObject(tileDefinition: MapTileDefinition, objectId: string, checked: boolean) {
    updateTile(tileDefinition.id, {
      objectIds: checked
        ? [...tileDefinition.objectIds, objectId]
        : tileDefinition.objectIds.filter((candidate) => candidate !== objectId),
    });
  }

  function addSpecialState(tileDefinition: MapTileDefinition) {
    const id = specialStateForm.id.trim();
    const name = specialStateForm.name.trim();
    if (!id || !name || tileDefinition.specialStates.some((state) => state.id === id)) {
      return;
    }

    updateTile(tileDefinition.id, {
      specialStates: [
        ...tileDefinition.specialStates,
        {
          id,
          name,
          severity: specialStateForm.severity,
          visibility: specialStateForm.visibility,
          startsActive: specialStateForm.startsActive,
        },
      ],
    });
    setSpecialStateForm({ id: "", name: "", severity: "medium", visibility: "onDiscovered", startsActive: true });
  }

  function removeSpecialState(tileDefinition: MapTileDefinition, stateId: string) {
    updateTile(tileDefinition.id, {
      specialStates: tileDefinition.specialStates.filter((state) => state.id !== stateId),
    });
  }
}

function NumberField({
  tile,
  name,
  label,
  onCommand,
}: {
  tile: MapTileDefinition;
  name: keyof Pick<
    MapTileDefinition["environment"],
    "temperatureCelsius" | "humidityPercent" | "magneticFieldMicroTesla" | "atmosphericPressureKpa"
  >;
  label: string;
  onCommand: (command: MapEditorCommand) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={tile.environment[name] ?? ""}
        onChange={(event) => {
          const value = event.target.valueAsNumber;
          if (Number.isNaN(value)) {
            return;
          }
          onCommand({
            type: "gameplay/updateTile",
            tileId: tile.id,
            patch: { environment: { ...tile.environment, [name]: value } },
          });
        }}
      />
    </label>
  );
}
