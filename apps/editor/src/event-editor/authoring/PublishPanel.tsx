import type { EventDraftEnvelope, EventEditorIssue, PublishDraftResponse } from "../types";
import EventValidationPanel from "./EventValidationPanel";

interface PublishPanelProps {
  draft: EventDraftEnvelope;
  isDirty: boolean;
  isPublishing?: boolean;
  errorMessage?: string | null;
  result?: PublishDraftResponse | null;
  issues?: EventEditorIssue[];
  onPublish?: () => void;
  onIssueJump?: (issue: EventEditorIssue) => void;
}

export default function PublishPanel({
  draft,
  isDirty,
  isPublishing = false,
  errorMessage = null,
  result = null,
  issues = [],
  onPublish,
  onIssueJump,
}: PublishPanelProps) {
  const generatedDefinition = result?.generated?.definition ?? draft.working_definition;
  const generatedCallTemplates = result?.generated?.call_templates ?? draft.working_call_templates;
  const canPublish = Boolean(onPublish) && !isDirty && !isPublishing;

  return (
    <section className="publish-panel" aria-label="Publish panel">
      <div className="event-authoring-section-heading">
        <div>
          <h3>Publish</h3>
          <p className="muted-text">Publish writes formal content files and archives this active draft on success.</p>
        </div>
        <span className={result?.published ? "status-tag status-success" : isDirty ? "status-tag status-warning" : "status-tag status-muted"}>
          {result?.published ? "published" : isDirty ? "save required" : "ready"}
        </span>
      </div>

      <dl className="event-authoring-step-summary" aria-label="Publish generated summary">
        <div>
          <dt>Definition</dt>
          <dd>{String(generatedDefinition.id ?? draft.target.definition_id)}</dd>
        </div>
        <div>
          <dt>Domain</dt>
          <dd>{String(generatedDefinition.domain ?? draft.target.domain)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{String(generatedDefinition.status ?? "draft")}</dd>
        </div>
        <div>
          <dt>Call templates</dt>
          <dd>{generatedCallTemplates.length}</dd>
        </div>
      </dl>

      {isDirty ? <p className="muted-text">Save Draft before publishing so the helper can compare the latest draft hash.</p> : null}

      <div className="publish-actions">
        <button type="button" onClick={onPublish} disabled={!canPublish}>
          {isPublishing ? "Publishing..." : "Publish Draft"}
        </button>
      </div>

      {errorMessage ? (
        <div className="editor-state-card event-action-error-card" role="alert">
          <h3>Publish failed</h3>
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {result?.published ? (
        <section aria-label="Publish result">
          <h4>Written Files</h4>
          <ul className="event-authoring-helper-list">
            {result.written_files.map((filePath) => (
              <li key={filePath}>
                <code>{filePath}</code>
              </li>
            ))}
          </ul>
          {result.archived_draft_path ? (
            <p className="muted-text">
              Archived draft: <code>{result.archived_draft_path}</code>
            </p>
          ) : null}
        </section>
      ) : null}

      {issues.length > 0 ? (
        <EventValidationPanel issues={issues} status="complete" onIssueJump={onIssueJump} />
      ) : null}
    </section>
  );
}
