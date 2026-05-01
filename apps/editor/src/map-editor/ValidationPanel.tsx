import type { MapValidationIssue } from "./apiClient";

interface ValidationPanelProps {
  errors: MapValidationIssue[];
  warnings: MapValidationIssue[];
  onIssueSelect: (issue: MapValidationIssue) => void;
}

export default function ValidationPanel({ errors, warnings, onIssueSelect }: ValidationPanelProps) {
  const issues = [...errors, ...warnings];

  return (
    <section className="validation-panel" aria-label="Validation panel">
      <div className="map-panel-subheading">
        <h3>Validation</h3>
        <span className={errors.length > 0 ? "status-tag status-warning" : "status-tag status-success"}>
          {errors.length > 0 ? `${errors.length} errors` : "Valid"}
        </span>
      </div>

      {issues.length === 0 ? (
        <p className="muted-text">No validation issues reported.</p>
      ) : (
        <ul className="validation-issue-list">
          {issues.map((issue, index) => {
            const targetLabel = formatIssueTarget(issue);
            const canNavigate = Boolean(getIssueTileId(issue) || getIssueLayerId(issue));
            return (
              <li key={`${issue.severity}-${issue.code}-${index}`} className={`validation-issue validation-${issue.severity}`}>
                <button type="button" disabled={!canNavigate} onClick={() => onIssueSelect(issue)}>
                  <span className="status-tag status-muted">{issue.severity}</span>
                  <span>
                    <strong>{issue.code}</strong>
                    <small>{targetLabel}</small>
                    <span>{issue.message}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function getIssueTileId(issue: MapValidationIssue): string | null {
  if (issue.target?.tileId) {
    return issue.target.tileId;
  }

  const path = issue.path ?? issue.target?.field ?? "";
  return /(?:tiles|cells|initialDiscoveredTileIds|originTileId)[.[/]([0-9]+-[0-9]+)/.exec(path)?.[1] ?? null;
}

export function getIssueLayerId(issue: MapValidationIssue): string | null {
  return issue.target?.layerId ?? null;
}

function formatIssueTarget(issue: MapValidationIssue): string {
  const parts = [
    issue.target?.kind,
    issue.target?.layerId ? `layer ${issue.target.layerId}` : null,
    issue.target?.tileId ? `tile ${issue.target.tileId}` : null,
    issue.target?.tilesetId ? `tileset ${issue.target.tilesetId}` : null,
    issue.target?.field ?? issue.path,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Map";
}
