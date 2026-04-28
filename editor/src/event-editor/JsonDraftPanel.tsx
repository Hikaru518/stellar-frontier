interface JsonDraftPanelProps {
  jsonText: string;
  parseError: string | null;
  onJsonTextChange: (text: string) => void;
}

export default function JsonDraftPanel({ jsonText, parseError, onJsonTextChange }: JsonDraftPanelProps) {
  return (
    <section className="event-detail-panel json-draft-panel" aria-label="Raw JSON editor">
      <div className="event-detail-panel-heading">
        <h3>Raw JSON</h3>
        <span className={`status-tag ${parseError ? "status-error-tag" : "status-success"}`}>
          {parseError ? "PARSE ERROR" : "VALID JSON"}
        </span>
      </div>
      <label className="draft-scratchpad-label" htmlFor="event-detail-json-draft">
        Raw JSON draft
      </label>
      <textarea
        id="event-detail-json-draft"
        aria-label="Raw JSON draft"
        value={jsonText}
        onChange={(event) => onJsonTextChange(event.target.value)}
        rows={24}
        spellCheck={false}
      />
      {parseError ? (
        <p className="status-error" role="alert">
          JSON parse error: {parseError}
        </p>
      ) : (
        <p className="muted-text">Valid edits sync back to the schema form and local draft storage.</p>
      )}
    </section>
  );
}
