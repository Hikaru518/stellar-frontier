import { renderEventEditorPreview } from "./previewRenderer";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

interface PreviewPanelProps {
  asset: EditorEventAsset<unknown>;
  draft: unknown;
  library: EventEditorLibraryResponse;
}

export default function PreviewPanel({ asset, draft, library }: PreviewPanelProps) {
  const preview = renderEventEditorPreview({ asset, draft, library });

  return (
    <section className="inspector-panel" aria-label="Call preview inspector">
      <h4>Call Preview</h4>
      <p className="muted-text">Runtime call rendering only. Effects, time progression, and player state mutations are not executed.</p>

      {preview.definitionId && preview.nodeId && preview.templateId ? (
        <dl className="inspector-summary">
          <div>
            <dt>Definition</dt>
            <dd>{preview.definitionId}</dd>
          </div>
          <div>
            <dt>Node</dt>
            <dd>{preview.nodeId}</dd>
          </div>
          <div>
            <dt>Template</dt>
            <dd>{preview.templateId}</dd>
          </div>
        </dl>
      ) : null}

      {preview.status === "unavailable" ? <p className="muted-text">{preview.reason}</p> : null}
      {preview.status === "missing_context" ? (
        <div className="inspector-warning" role="status">
          Missing preview context: {preview.missingContext.join(", ")}
        </div>
      ) : null}
      {preview.status === "error" ? (
        <div className="inspector-warning status-error" role="alert">
          {preview.reason ?? "Preview rendering reported errors."}
        </div>
      ) : null}

      {preview.errors.length > 0 ? (
        <ul className="inspector-list" aria-label="Preview render errors">
          {preview.errors.map((error) => (
            <li key={`${error.path}:${error.code}`} className="inspector-card">
              <strong>{error.code}</strong>
              <p>{error.message}</p>
              <code>{error.path}</code>
            </li>
          ))}
        </ul>
      ) : null}

      {preview.lines.length > 0 ? (
        <>
          <h5>Dialogue</h5>
          <ol className="inspector-list" aria-label="Rendered dialogue">
            {preview.lines.map((line) => (
              <li key={`${line.template_variant_id}:${line.text}`} className="inspector-card">
                <span className="status-tag status-muted">{line.speaker_crew_id}</span>
                <p>{line.text}</p>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {preview.options.length > 0 ? (
        <>
          <h5>Options</h5>
          <ul className="inspector-list" aria-label="Rendered options">
            {preview.options.map((option) => (
              <li key={option.option_id} className="inspector-card">
                <div className="inspector-card-heading">
                  <code>{option.option_id}</code>
                  {option.is_default ? <span className="status-tag status-success">DEFAULT</span> : null}
                </div>
                <p>{option.text}</p>
              </li>
            ))}
          </ul>
        </>
      ) : preview.status !== "unavailable" ? (
        <p className="muted-text">No options are available under the current sample context.</p>
      ) : null}
    </section>
  );
}
