import type { FeatureActionDefinition, MapEditorCommand, MapEditorDraft, MapFeatureDefinition, MapFeatureVisibility } from "./types";

const FEATURE_VISIBILITY_OPTIONS: MapFeatureVisibility[] = ["always", "onDiscovered", "onInvestigated", "hidden"];
const FEATURE_ACTION_TONES = ["neutral", "muted", "accent", "danger", "success"];

interface FeatureInspectorProps {
  draft: MapEditorDraft;
  selectedTileId: string | null;
  selectedFeatureId: string | null;
  onSelectFeature: (featureId: string | null) => void;
  onCommand: (command: MapEditorCommand) => void;
}

export default function FeatureInspector({
  draft,
  selectedTileId,
  selectedFeatureId,
  onSelectFeature,
  onCommand,
}: FeatureInspectorProps) {
  const selectedFeature = selectedFeatureId ? draft.features.find((feature) => feature.id === selectedFeatureId) ?? null : null;
  const kindOptions = Array.from(new Set(draft.features.map((feature) => feature.kind).filter(Boolean))).sort();

  return (
    <section className="map-summary-card feature-inspector" aria-label="Feature inspector">
      <div className="map-panel-subheading">
        <h3>Features</h3>
        <button type="button" onClick={addFeature}>
          Add feature
        </button>
      </div>

      <ul className="feature-list" aria-label="Feature list">
        {draft.features.length === 0 ? <li className="muted-text">No features.</li> : null}
        {draft.features.map((feature) => (
          <li key={feature.id}>
            <button
              type="button"
              className={feature.id === selectedFeatureId ? "feature-list-row feature-list-row-selected" : "feature-list-row"}
              aria-label={`Select feature ${feature.id}`}
              aria-pressed={feature.id === selectedFeatureId}
              onClick={() => onSelectFeature(feature.id)}
            >
              <span className="feature-list-title">{feature.name}</span>
              <span className="feature-list-meta">
                <code>{feature.id}</code>
                <span>{feature.kind}</span>
                <span>{feature.visibility}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {selectedFeature ? (
        <FeatureEditor feature={selectedFeature} kindOptions={kindOptions} onUpdate={updateFeature} onDelete={deleteFeature} />
      ) : (
        <p className="muted-text">No feature selected.</p>
      )}
    </section>
  );

  function addFeature() {
    const feature = createDefaultFeature(draft, selectedTileId);
    onCommand({ type: "feature/create", feature });
    onSelectFeature(feature.id);
  }

  function updateFeature(featureId: string, patch: Extract<MapEditorCommand, { type: "feature/update" }>["patch"]) {
    onCommand({ type: "feature/update", featureId, patch });
  }

  function deleteFeature(featureId: string) {
    onCommand({ type: "feature/delete", featureId });
    onSelectFeature(null);
  }
}

function FeatureEditor({
  feature,
  kindOptions,
  onUpdate,
  onDelete,
}: {
  feature: MapFeatureDefinition;
  kindOptions: string[];
  onUpdate: (featureId: string, patch: Extract<MapEditorCommand, { type: "feature/update" }>["patch"]) => void;
  onDelete: (featureId: string) => void;
}) {
  const isInvestigatable = feature.investigatable === true;
  const statusOptionsMissing = isInvestigatable && (!feature.status_options || feature.status_options.length === 0);
  const initialStatusMissing = isInvestigatable && !feature.initial_status?.trim();

  return (
    <div className="feature-editor" aria-label="Selected feature">
      <div className="map-panel-subheading">
        <h4>{feature.name}</h4>
        <code>{feature.id}</code>
      </div>

      <label>
        Feature name
        <input
          aria-label="Feature name"
          required
          value={feature.name}
          onChange={(event) => onUpdate(feature.id, { name: event.target.value })}
        />
      </label>

      <label>
        Feature kind
        <input
          aria-label="Feature kind"
          list="feature-kind-options"
          required
          value={feature.kind}
          onChange={(event) => onUpdate(feature.id, { kind: event.target.value })}
        />
        <datalist id="feature-kind-options">
          {kindOptions.map((kind) => (
            <option key={kind} value={kind} />
          ))}
        </datalist>
      </label>

      <div className="tile-inspector-two-column">
        <label>
          Feature priority
          <input
            aria-label="Feature priority"
            type="number"
            min={1}
            max={100}
            required
            value={feature.priority}
            onChange={(event) => onUpdate(feature.id, { priority: event.target.valueAsNumber })}
          />
        </label>
        <label>
          Feature visibility
          <select
            aria-label="Feature visibility"
            value={feature.visibility}
            onChange={(event) => onUpdate(feature.id, { visibility: event.target.value as MapFeatureVisibility })}
          >
            {FEATURE_VISIBILITY_OPTIONS.map((visibility) => (
              <option key={visibility} value={visibility}>
                {visibility}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Feature tags
        <input
          aria-label="Feature tags"
          value={feature.tags?.join(", ") ?? ""}
          onChange={(event) => onUpdate(feature.id, { tags: parseStringList(event.target.value) })}
        />
      </label>

      <dl className="inspector-summary">
        <div>
          <dt>Footprint</dt>
          <dd>{formatFootprint(feature)}</dd>
        </div>
      </dl>

      <label className="feature-inspector-checkbox">
        <input
          aria-label="Investigatable"
          type="checkbox"
          checked={isInvestigatable}
          onChange={(event) => onUpdate(feature.id, { investigatable: event.target.checked })}
        />
        Investigatable
      </label>

      {isInvestigatable ? (
        <fieldset>
          <legend>Status</legend>
          <label>
            Status options
            <input
              aria-label="Status options"
              required
              aria-invalid={statusOptionsMissing ? "true" : undefined}
              value={feature.status_options?.join(", ") ?? ""}
              onChange={(event) => onUpdate(feature.id, { status_options: parseStatusOptions(event.target.value) })}
            />
          </label>
          <label>
            Initial status
            <input
              aria-label="Initial status"
              required
              aria-invalid={initialStatusMissing ? "true" : undefined}
              value={feature.initial_status ?? ""}
              onChange={(event) => onUpdate(feature.id, { initial_status: event.target.value })}
            />
          </label>
          {statusOptionsMissing || initialStatusMissing ? (
            <ul className="feature-status-errors" role="alert">
              {statusOptionsMissing ? <li>Status options are required.</li> : null}
              {initialStatusMissing ? <li>Initial status is required.</li> : null}
            </ul>
          ) : null}
        </fieldset>
      ) : null}

      {isInvestigatable ? (
        <section className="feature-action-list" aria-label="Feature actions">
          <div className="map-panel-subheading">
            <h5>Actions</h5>
            <button type="button" onClick={addAction}>
              Add action
            </button>
          </div>
          {(feature.actions ?? []).length === 0 ? <p className="muted-text">No actions.</p> : null}
          {(feature.actions ?? []).map((action, index) => (
            <FeatureActionEditor
              key={`${action.id}:${index}`}
              action={action}
              index={index}
              onUpdate={(patch) => updateAction(index, patch)}
              onDelete={() => deleteAction(index)}
            />
          ))}
        </section>
      ) : null}

      <button type="button" className="feature-delete-button" onClick={() => onDelete(feature.id)}>
        Delete feature
      </button>
    </div>
  );

  function addAction() {
    onUpdate(feature.id, { actions: [...(feature.actions ?? []), createDefaultFeatureAction(feature)] });
  }

  function updateAction(index: number, patch: Partial<FeatureActionDefinition>) {
    const actions = [...(feature.actions ?? [])];
    const action = actions[index];
    if (!action) {
      return;
    }
    actions[index] = { ...action, ...patch, category: "feature", conditions: action.conditions ?? [] };
    onUpdate(feature.id, { actions });
  }

  function deleteAction(index: number) {
    onUpdate(feature.id, { actions: (feature.actions ?? []).filter((_, actionIndex) => actionIndex !== index) });
  }
}

function FeatureActionEditor({
  action,
  index,
  onUpdate,
  onDelete,
}: {
  action: FeatureActionDefinition;
  index: number;
  onUpdate: (patch: Partial<FeatureActionDefinition>) => void;
  onDelete: () => void;
}) {
  const actionNumber = index + 1;
  return (
    <fieldset className="feature-action-card">
      <legend>Action {actionNumber}</legend>
      <label>
        Action {actionNumber} id
        <input aria-label={`Action ${actionNumber} id`} value={action.id} onChange={(event) => onUpdate({ id: event.target.value })} />
      </label>
      <label>
        Action {actionNumber} label
        <input aria-label={`Action ${actionNumber} label`} value={action.label} onChange={(event) => onUpdate({ label: event.target.value })} />
      </label>
      <div className="tile-inspector-two-column">
        <label>
          Action {actionNumber} tone
          <select aria-label={`Action ${actionNumber} tone`} value={action.tone ?? "neutral"} onChange={(event) => onUpdate({ tone: event.target.value })}>
            {FEATURE_ACTION_TONES.map((tone) => (
              <option key={tone} value={tone}>
                {tone}
              </option>
            ))}
          </select>
        </label>
        <label>
          Action {actionNumber} event id
          <input
            aria-label={`Action ${actionNumber} event id`}
            value={action.event_id ?? ""}
            onChange={(event) => onUpdate({ event_id: event.target.value.trim() || undefined })}
          />
        </label>
      </div>
      <button type="button" onClick={onDelete}>
        Delete action
      </button>
    </fieldset>
  );
}

function createDefaultFeature(draft: MapEditorDraft, selectedTileId: string | null): MapFeatureDefinition {
  const anchorTile = draft.tiles.find((tile) => tile.id === selectedTileId) ?? draft.tiles.find((tile) => tile.id === draft.originTileId) ?? draft.tiles[0];
  const row = anchorTile?.row ?? 1;
  const col = anchorTile?.col ?? 1;

  return {
    id: createUniqueFeatureId(draft),
    name: "New Feature",
    kind: "feature",
    priority: 10,
    visibility: "onDiscovered",
    footprint: {
      type: "row_spans",
      spans: [{ row, colStart: col, colEnd: col }],
    },
  };
}

function createUniqueFeatureId(draft: MapEditorDraft): string {
  const existingIds = new Set(draft.features.map((feature) => feature.id));
  if (!existingIds.has("feature")) {
    return "feature";
  }

  let suffix = 2;
  while (existingIds.has(`feature-${suffix}`)) {
    suffix += 1;
  }
  return `feature-${suffix}`;
}

function parseStatusOptions(value: string): string[] {
  return parseStringList(value);
}

function parseStringList(value: string): string[] {
  return Array.from(new Set(value.split(",").map((option) => option.trim()).filter(Boolean)));
}

function createDefaultFeatureAction(feature: MapFeatureDefinition): FeatureActionDefinition {
  const existingIds = new Set((feature.actions ?? []).map((action) => action.id));
  let actionId = `${feature.id}:action`;
  let suffix = 2;
  while (existingIds.has(actionId)) {
    actionId = `${feature.id}:action-${suffix}`;
    suffix += 1;
  }
  return {
    id: actionId,
    category: "feature",
    label: "Action",
    tone: "neutral",
    conditions: [],
  };
}

function formatFootprint(feature: MapFeatureDefinition): string {
  return feature.footprint.spans.map((span) => `r${span.row}: c${span.colStart}-${span.colEnd}`).join(", ");
}
