import type { EditorEventAsset } from "./types";

export type SavePanelState =
  | { status: "idle" }
  | { status: "validating" }
  | { status: "saving" }
  | { status: "success"; message: string }
  | { status: "validation_failed"; message: string }
  | { status: "conflict"; message: string; currentBaseHash?: string }
  | { status: "error"; message: string };

interface SavePanelProps {
  asset: EditorEventAsset<unknown>;
  changeSummary: string;
  state: SavePanelState;
  onSave: () => void;
}

export default function SavePanel({ asset, changeSummary, state, onSave }: SavePanelProps) {
  const isBusy = state.status === "validating" || state.status === "saving";
  const isSaved = state.status === "success";

  return (
    <section className="save-panel" aria-label="Save draft panel" aria-live="polite">
      <div className="event-detail-panel-heading">
        <div>
          <h3>Save Draft</h3>
          <p className="muted-text">Writes the active draft back into repository content.</p>
        </div>
        <span className={`status-tag ${isSaved ? "status-success" : "status-warning"}`}>{isSaved ? "SAVED" : "UNSAVED"}</span>
      </div>

      <dl className="inspector-summary">
        <div>
          <dt>Writes to content target</dt>
          <dd>
            <code>{asset.file_path}</code>
          </dd>
        </div>
        <div>
          <dt>Asset</dt>
          <dd>{asset.id}</dd>
        </div>
        <div>
          <dt>Change summary</dt>
          <dd>{changeSummary}</dd>
        </div>
      </dl>

      {state.status === "validating" ? <p className="muted-text">Validating draft before save...</p> : null}
      {state.status === "saving" ? <p className="muted-text">Writing validated draft to content...</p> : null}
      {state.status === "success" ? <p className="status-success-text">{state.message}</p> : null}
      {state.status === "validation_failed" ? <p className="status-error">{state.message}</p> : null}
      {state.status === "conflict" ? (
        <div className="save-panel-alert">
          <p className="status-error">{state.message}</p>
          <p className="muted-text">
            Reload the library or manually merge the local draft with the changed content file before saving again.
          </p>
          {state.currentBaseHash ? (
            <p className="muted-text">
              Current content hash: <code>{state.currentBaseHash}</code>
            </p>
          ) : null}
        </div>
      ) : null}
      {state.status === "error" ? <p className="status-error">{state.message}</p> : null}

      {isSaved ? null : (
        <button type="button" onClick={onSave} disabled={isBusy}>
          Save draft to content
        </button>
      )}
    </section>
  );
}
