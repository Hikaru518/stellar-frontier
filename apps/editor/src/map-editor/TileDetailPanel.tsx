import { getFeaturesForTile } from "./mapEditorModel";
import type { FeatureActionDefinition, MapEditorDraft, MapFeatureDefinition } from "./types";

interface TileDetailPanelProps {
  draft: MapEditorDraft;
  selectedTileId: string | null;
  selectedFeatureId: string | null;
  onSelectFeature: (featureId: string | null) => void;
}

export default function TileDetailPanel({ draft, selectedTileId, selectedFeatureId, onSelectFeature }: TileDetailPanelProps) {
  const tile = selectedTileId ? draft.tiles.find((candidate) => candidate.id === selectedTileId) : null;
  if (!tile) {
    return (
      <section className="tile-detail-panel" aria-label="Selected tile detail">
        <h3>Tile Detail</h3>
        <p className="muted-text">Select a tile in the grid.</p>
      </section>
    );
  }

  const radarGlyph = draft.radar.glyphRows[tile.row - 1]?.[tile.col - 1] ?? ".";
  const radarTone = draft.radar.toneRows[tile.row - 1]?.[tile.col - 1] ?? "g";
  const features = getFeaturesForTile(draft, tile.id);

  return (
    <section className="tile-detail-panel" aria-label="Selected tile detail">
      <div className="map-panel-subheading">
        <h3>Tile Detail</h3>
        <code>{tile.id}</code>
      </div>

      <dl className="inspector-summary">
        <div>
          <dt>Coord</dt>
          <dd>
            row {tile.row}, col {tile.col}
          </dd>
        </div>
        <div>
          <dt>Terrain</dt>
          <dd>{tile.terrain}</dd>
        </div>
        <div>
          <dt>Weather</dt>
          <dd>{tile.weather}</dd>
        </div>
        <div>
          <dt>Radar</dt>
          <dd>
            glyph <code>{radarGlyph}</code> · tone <code>{radarTone}</code>
          </dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{formatEnvironment(tile.environment)}</dd>
        </div>
        <div>
          <dt>States</dt>
          <dd>{tile.specialStates.length ? tile.specialStates.map((state) => `${state.name} (${state.severity})`).join(", ") : "None"}</dd>
        </div>
      </dl>

      <div className="tile-feature-overlaps" aria-label="Selected tile feature overlaps">
        <div className="map-panel-subheading">
          <h4>Feature overlaps</h4>
          <span className={features.length > 1 ? "status-tag status-warning" : "status-tag status-muted"}>{formatCount(features.length, "feature")}</span>
        </div>
        {features.length === 0 ? <p className="muted-text">No feature footprint on this tile.</p> : null}
        {features.length > 0 ? (
          <ul className="tile-detail-feature-list">
            {features.map((feature) => (
              <li key={feature.id}>
                <button
                  type="button"
                  className={feature.id === selectedFeatureId ? "tile-feature-overlap-row tile-feature-overlap-row-selected" : "tile-feature-overlap-row"}
                  aria-label={`Select overlapping feature ${feature.id}`}
                  aria-pressed={feature.id === selectedFeatureId}
                  onClick={() => onSelectFeature(feature.id)}
                >
                  <span>{feature.name}</span>
                  <span>
                    <code>{feature.id}</code> · {feature.kind}
                  </span>
                </button>
                <FeatureDetail feature={feature} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

function FeatureDetail({ feature }: { feature: MapFeatureDefinition }) {
  return (
    <div className="tile-detail-feature-card">
      <dl className="inspector-summary">
        <div>
          <dt>Visibility</dt>
          <dd>{feature.visibility}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{feature.priority}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{feature.investigatable ? feature.initial_status ?? "Unset" : "Context feature"}</dd>
        </div>
        <div>
          <dt>Tags</dt>
          <dd>{feature.tags?.length ? feature.tags.join(", ") : "None"}</dd>
        </div>
      </dl>
      {feature.description ? <p className="tile-detail-description">{feature.description}</p> : null}
      <FeatureActions actions={feature.actions ?? []} />
    </div>
  );
}

function FeatureActions({ actions }: { actions: FeatureActionDefinition[] }) {
  return (
    <div className="tile-detail-actions" aria-label="Feature actions and events">
      <div className="map-panel-subheading">
        <h5>Actions / Events</h5>
        <span className="status-tag status-muted">{formatCount(actions.length, "action")}</span>
      </div>
      {actions.length === 0 ? <p className="muted-text">No feature actions.</p> : null}
      {actions.length > 0 ? (
        <ul className="tile-detail-action-list">
          {actions.map((action) => (
            <li key={action.id}>
              <strong>{action.label}</strong>
              <span>
                <code>{action.id}</code> · {action.tone ?? "neutral"}
              </span>
              <span>
                event <code>{action.event_id ?? "none"}</code>
              </span>
              {action.local_action ? <span>{formatLocalAction(action.local_action)}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function formatEnvironment(environment: MapEditorDraft["tiles"][number]["environment"]): string {
  return [
    `${environment.temperatureCelsius}C`,
    `${environment.humidityPercent}% humidity`,
    `${environment.magneticFieldMicroTesla}uT`,
    environment.atmosphericPressureKpa !== undefined ? `${environment.atmosphericPressureKpa}kPa` : null,
    `radiation ${environment.radiationLevel}`,
    `toxicity ${environment.toxicityLevel ?? "none"}`,
  ].filter(Boolean).join(" · ");
}

function formatLocalAction(localAction: unknown): string {
  if (!localAction || typeof localAction !== "object") {
    return "local action";
  }
  const record = localAction as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind : "local_action";
  const duration = typeof record.duration_seconds === "number" ? ` · ${record.duration_seconds}s` : "";
  return `${kind}${duration}`;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}
