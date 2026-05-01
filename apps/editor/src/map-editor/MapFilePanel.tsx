import { useState } from "react";
import type { FormEvent } from "react";
import { createMapEditorDraft } from "./mapEditorModel";
import type { MapEditorLibraryMap } from "./apiClient";
import type { MapEditorDraft } from "./types";

interface MapFilePanelProps {
  maps: MapEditorLibraryMap[];
  selectedMapId: string | null;
  onSelectMap: (mapId: string) => void;
  onCreateMap: (draft: MapEditorDraft) => void;
}

interface NewMapFormState {
  id: string;
  name: string;
  rows: string;
  cols: string;
}

const MAP_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

export default function MapFilePanel({ maps, selectedMapId, onSelectMap, onCreateMap }: MapFilePanelProps) {
  const [form, setForm] = useState<NewMapFormState>({
    id: "",
    name: "",
    rows: "8",
    cols: "8",
  });
  const [errors, setErrors] = useState<string[]>([]);

  function updateField(field: keyof NewMapFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors([]);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateNewMapForm(form);
    if (nextErrors.length > 0) {
      setErrors(nextErrors);
      return;
    }

    const rows = Number(form.rows);
    const cols = Number(form.cols);
    const draft = createMapEditorDraft({
      id: form.id.trim(),
      name: form.name.trim(),
      rows,
      cols,
    });
    onCreateMap(draft);
  }

  return (
    <aside className="map-file-panel" aria-label="Map file library">
      <div className="map-panel-heading">
        <h3>Map Files</h3>
        <span className="status-tag status-muted">{maps.length}</span>
      </div>

      <form className="map-new-form" aria-label="New Map" noValidate onSubmit={handleSubmit}>
        <div className="map-panel-subheading">
          <h4>New Map</h4>
          <span className="status-tag status-muted">{Number(form.rows) * Number(form.cols) || 0} tiles</span>
        </div>
        <label>
          ID
          <input
            value={form.id}
            onChange={(event) => updateField("id", event.target.value)}
            placeholder="crash-site"
            aria-invalid={errors.some((error) => error.includes("id"))}
          />
        </label>
        <label>
          Name
          <input value={form.name} onChange={(event) => updateField("name", event.target.value)} placeholder="Crash Site" />
        </label>
        <div className="map-new-form-size">
          <label>
            Rows
            <input
              type="number"
              min="1"
              value={form.rows}
              onChange={(event) => updateField("rows", event.target.value)}
              aria-invalid={errors.some((error) => error.includes("rows"))}
            />
          </label>
          <label>
            Cols
            <input
              type="number"
              min="1"
              value={form.cols}
              onChange={(event) => updateField("cols", event.target.value)}
              aria-invalid={errors.some((error) => error.includes("cols"))}
            />
          </label>
        </div>
        {errors.length > 0 ? (
          <ul className="map-form-errors" aria-label="New Map errors">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : null}
        <button type="submit" className="map-command-button">
          New Map
        </button>
      </form>

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

function validateNewMapForm(form: NewMapFormState): string[] {
  const errors: string[] = [];
  const id = form.id.trim();
  const name = form.name.trim();
  const rows = Number(form.rows);
  const cols = Number(form.cols);

  if (!MAP_ID_PATTERN.test(id)) {
    errors.push("Map id must start with a lowercase letter and use lowercase letters, numbers, underscores, or hyphens.");
  }
  if (name.length === 0) {
    errors.push("Map name is required.");
  }
  if (!Number.isInteger(rows) || rows < 1) {
    errors.push("Map rows must be at least 1.");
  }
  if (!Number.isInteger(cols) || cols < 1) {
    errors.push("Map cols must be at least 1.");
  }

  return errors;
}
