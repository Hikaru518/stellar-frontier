import type { EditorEventAsset, EventEditorLibraryResponse, ValidationIssue } from "./types";

interface ValidationPanelProps {
  asset: EditorEventAsset<unknown>;
  library: EventEditorLibraryResponse;
  selectedJsonPath: string | null;
  onOpenIssue: (issue: ValidationIssue) => void;
}

export default function ValidationPanel({ asset, library, selectedJsonPath, onOpenIssue }: ValidationPanelProps) {
  const issues = library.validation.issues;
  const currentAssetIssues = issues.filter((issue) => issue.asset_id === asset.id && issue.asset_type === asset.asset_type);
  const otherIssues = issues.filter((issue) => !currentAssetIssues.includes(issue));
  const orderedIssues = [...currentAssetIssues, ...otherIssues];

  return (
    <section className="inspector-panel" aria-label="Validation inspector">
      <h4>Validation Issues</h4>
      <p className="muted-text">
        {library.validation.passed ? "Library validation passed." : `${issues.length} structured issue${issues.length === 1 ? "" : "s"} reported.`}
      </p>

      {selectedJsonPath ? (
        <div className="inspector-selected-path" aria-label="Selected JSON path">
          <strong>Selected JSON path</strong>
          <code>{selectedJsonPath}</code>
        </div>
      ) : null}

      {orderedIssues.length > 0 ? (
        <ul className="inspector-list" aria-label="Validation issues">
          {orderedIssues.map((issue, index) => (
            <li key={`${issue.asset_type ?? "unknown"}:${issue.asset_id ?? "unknown"}:${issue.code}:${issue.json_path ?? index}`} className="inspector-card">
              <button type="button" className="validation-issue-button" aria-label={`Open issue ${issue.code}`} onClick={() => onOpenIssue(issue)}>
                <span className={`status-tag ${issue.severity === "error" ? "status-error-tag" : "status-warning"}`}>
                  {issue.severity.toUpperCase()}
                </span>
                <strong>{issue.code}</strong>
              </button>
              <p>{issue.message}</p>
              <dl className="inspector-summary">
                {issue.asset_id ? (
                  <div>
                    <dt>Asset</dt>
                    <dd>{issue.asset_id}</dd>
                  </div>
                ) : null}
                {issue.json_path ? (
                  <div>
                    <dt>JSON path</dt>
                    <dd>{issue.json_path}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">No validation issues for the current library.</p>
      )}
    </section>
  );
}
