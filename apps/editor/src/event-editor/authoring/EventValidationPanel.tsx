import type { EventEditorIssue, EventEditorStep } from "../types";
import { formatJsonPathForDisplay } from "./jsonPath";

type IssueGroupKey = EventEditorStep | "call_template" | "review_fallback";

interface EventValidationPanelProps {
  issues: EventEditorIssue[];
  status?: "idle" | "running" | "complete" | "error";
  errorMessage?: string | null;
  onValidate?: () => void;
  onIssueJump?: (issue: EventEditorIssue) => void;
}

const ISSUE_GROUPS = [
  { key: "basic", label: "Basic" },
  { key: "trigger", label: "Trigger" },
  { key: "graph", label: "Graph" },
  { key: "effects", label: "Effects" },
  { key: "call_template", label: "Call Template" },
  { key: "domain", label: "Domain / Manifest" },
  { key: "review", label: "Review" },
  { key: "review_fallback", label: "Review / Raw JSON" },
] as const satisfies readonly { key: IssueGroupKey; label: string }[];

export default function EventValidationPanel({
  issues,
  status = "idle",
  errorMessage = null,
  onValidate,
  onIssueJump,
}: EventValidationPanelProps) {
  const groupedIssues = groupIssues(issues);
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  return (
    <section className="event-validation-panel validation-panel" aria-label="Event validation panel">
      <div className="event-authoring-section-heading">
        <div>
          <h3>Validation Panel</h3>
          <p className="muted-text">Schema, manifest, and reference issues mapped to authoring locations.</p>
        </div>
        <div className="validation-summary-tags" aria-label="Validation issue summary">
          <span className={errorCount > 0 ? "status-tag status-error" : "status-tag status-success"}>{errorCount} errors</span>
          <span className={warningCount > 0 ? "status-tag status-warning" : "status-tag status-muted"}>{warningCount} warnings</span>
        </div>
      </div>

      <div className="event-validation-toolbar">
        <button type="button" onClick={onValidate} disabled={!onValidate || status === "running"}>
          {status === "running" ? "Running validation..." : "Run publish validation"}
        </button>
        <span className="status-tag status-muted">{status}</span>
      </div>

      {errorMessage ? (
        <div className="editor-state-card event-action-error-card" role="alert">
          <h3>Validation failed</h3>
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {issues.length === 0 ? (
        <p className="muted-text">No validation issues loaded.</p>
      ) : (
        ISSUE_GROUPS.map((group) => {
          const groupIssues = groupedIssues.get(group.key) ?? [];
          if (groupIssues.length === 0) {
            return null;
          }

          return (
            <section key={group.key} aria-labelledby={`event-validation-${group.key}-heading`}>
              <div className="event-authoring-section-heading">
                <h4 id={`event-validation-${group.key}-heading`}>{group.label}</h4>
                <span className="status-tag status-muted">{groupIssues.length} issues</span>
              </div>
              <ul className="validation-issue-list" aria-label={`${group.label} validation issues`}>
                {groupIssues.map((issue, index) => (
                  <ValidationIssueItem
                    key={`${issue.code}:${issue.json_path ?? "no-path"}:${index}`}
                    issue={issue}
                    groupLabel={group.label}
                    onIssueJump={onIssueJump}
                  />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}

function ValidationIssueItem({
  issue,
  groupLabel,
  onIssueJump,
}: {
  issue: EventEditorIssue;
  groupLabel: string;
  onIssueJump?: (issue: EventEditorIssue) => void;
}) {
  const path = formatJsonPathForDisplay(issue.json_path ?? issue.editor_location?.field_path ?? null);
  const location = formatLocation(issue);

  return (
    <li className={issue.severity === "error" ? "validation-issue validation-error" : "validation-issue validation-warning"}>
      <button
        type="button"
        aria-label={`Jump to ${groupLabel} issue ${issue.code}`}
        onClick={() => onIssueJump?.(issue)}
        disabled={!onIssueJump}
      >
        <span className={issue.severity === "error" ? "status-tag status-error" : "status-tag status-warning"}>{issue.severity}</span>
        <span>
          <strong>{issue.message}</strong>
          <small>{issue.code}</small>
          <small>{path}</small>
          {location ? <span className="validation-issue-location">{location}</span> : null}
        </span>
      </button>
    </li>
  );
}

function groupIssues(issues: readonly EventEditorIssue[]): Map<IssueGroupKey, EventEditorIssue[]> {
  const grouped = new Map<IssueGroupKey, EventEditorIssue[]>();

  for (const issue of issues) {
    const key = getIssueGroupKey(issue);
    grouped.set(key, [...(grouped.get(key) ?? []), issue]);
  }

  return grouped;
}

function getIssueGroupKey(issue: EventEditorIssue): IssueGroupKey {
  if (!issue.editor_location) {
    return "review_fallback";
  }

  if (
    issue.editor_location.section === "call_templates" ||
    Boolean(issue.editor_location.call_template_id) ||
    issue.asset_type === "call_template"
  ) {
    return "call_template";
  }

  if (issue.editor_location.step === "domain" || issue.asset_type === "manifest" || issue.asset_type === "domain") {
    return "domain";
  }

  return issue.editor_location.step;
}

function formatLocation(issue: EventEditorIssue): string | null {
  const location = issue.editor_location;
  if (!location) {
    return null;
  }

  const parts = [
    location.step,
    location.section,
    location.node_id ? `node:${location.node_id}` : null,
    location.option_id ? `option:${location.option_id}` : null,
    location.effect_group_id ? `effect group:${location.effect_group_id}` : null,
    location.effect_id ? `effect:${location.effect_id}` : null,
    location.call_template_id ? `call template:${location.call_template_id}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" / ") : null;
}
