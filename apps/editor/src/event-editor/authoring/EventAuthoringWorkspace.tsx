import { useState } from "react";
import type { EventDraftEnvelope, EventEditorStep } from "../types";
import BasicStep from "./BasicStep";
import CapabilityCatalogPanel from "./CapabilityCatalogPanel";
import GraphPreviewPanel from "./GraphPreviewPanel";
import TriggerStep from "./TriggerStep";
import { eventAuthoringReducer } from "./eventAuthoringReducer";

type AuthoringStep = Exclude<EventEditorStep, "domain">;

interface EventAuthoringWorkspaceProps {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}

const AUTHORING_STEPS = [
  {
    id: "basic",
    label: "Basic",
    responsibility: "Draft identity, title, summary, content references, and authoring metadata.",
  },
  {
    id: "trigger",
    label: "Trigger",
    responsibility: "Trigger type, required context, conditions, candidate selection, and repeat policy.",
  },
  {
    id: "graph",
    label: "Graph",
    responsibility: "Call nodes, non-call nodes, options, transitions, and graph-level rules.",
  },
  {
    id: "effects",
    label: "Effects",
    responsibility: "Effect groups, handler effects, target refs, params, and failure policies.",
  },
  {
    id: "review",
    label: "Review",
    responsibility: "Generated definition preview, validation issues, publish readiness, and diff checks.",
  },
] as const satisfies readonly { id: AuthoringStep; label: string; responsibility: string }[];

export default function EventAuthoringWorkspace({ draft, onDraftChange }: EventAuthoringWorkspaceProps) {
  const activeStep = resolveActiveStep(draft.editor_state.active_step);
  const activeStepConfig = AUTHORING_STEPS.find((step) => step.id === activeStep) ?? AUTHORING_STEPS[0];
  const isLockedTarget = draft.mode === "edit_existing";
  const triggerConditions = draft.working_definition.trigger?.conditions ?? [];
  const [conditionInsertIndex, setConditionInsertIndex] = useState(triggerConditions.length);
  const resolvedConditionInsertIndex = Math.min(Math.max(conditionInsertIndex, 0), triggerConditions.length);

  return (
    <section className="event-authoring-workspace" aria-label="Event authoring workspace">
      <header className="event-authoring-header">
        <div className="event-authoring-title-block">
          <h3>Event Authoring Workspace</h3>
          <p className="muted-text">Wizard shell for editing the draft envelope. Detailed forms arrive in later tasks.</p>
        </div>
        <dl className="event-authoring-meta" aria-label="Draft metadata">
          <MetaItem label="Draft id" value={draft.draft_id} />
          <MetaItem label="Mode" value={draft.mode} tagClassName={draft.mode === "edit_existing" ? "status-warning" : "status-muted"} />
          <MetaItem label="Status" value={draft.status} tagClassName="status-success" />
          <MetaItem label="Active step" value={activeStep} />
          <MetaItem label="Hash" value={formatDraftHash(draft.hashes.draft)} code />
          <MetaItem label="Domain" value={draft.target.domain} locked={isLockedTarget} ariaLabel="Draft domain" />
          <MetaItem label="Definition id" value={draft.target.definition_id} locked={isLockedTarget} ariaLabel="Draft definition id" />
        </dl>
      </header>

      <div className="event-authoring-shell">
        <nav className="event-authoring-step-nav" aria-label="Event authoring steps">
          {AUTHORING_STEPS.map((step) => {
            const isActive = step.id === activeStep;

            return (
              <button
                key={step.id}
                type="button"
                className={isActive ? "event-authoring-step event-authoring-step-active" : "event-authoring-step"}
                aria-current={isActive ? "step" : undefined}
                onClick={() => selectStep(step.id)}
              >
                {step.label}
              </button>
            );
          })}
        </nav>

        <section className="event-authoring-step-panel" aria-label="Authoring step panel">
          <div className="event-authoring-section-heading">
            <div>
              <h3>{activeStepConfig.label}</h3>
              <p className="muted-text">{activeStepConfig.responsibility}</p>
            </div>
            <span className="status-tag status-muted">
              {activeStep === "basic" || activeStep === "trigger" ? "editable" : activeStep === "graph" ? "preview" : "placeholder"}
            </span>
          </div>
          {activeStep === "basic" ? (
            <BasicStep draft={draft} onDraftChange={onDraftChange} />
          ) : activeStep === "trigger" ? (
            <TriggerStep
              draft={draft}
              conditionInsertIndex={resolvedConditionInsertIndex}
              onConditionInsertIndexChange={setConditionInsertIndex}
              onDraftChange={onDraftChange}
            />
          ) : activeStep === "graph" ? (
            <GraphPreviewPanel draft={draft} />
          ) : (
            <StepPlaceholder step={activeStepConfig} draft={draft} />
          )}
        </section>

        <aside className="event-authoring-helper-panel" aria-label="Authoring helper panel">
          {activeStep === "trigger" ? (
            <CapabilityCatalogPanel
              onSelectTriggerTemplate={(template) =>
                onDraftChange(
                  eventAuthoringReducer(draft, {
                    type: "update_trigger_type",
                    triggerType: template.type,
                  }),
                )
              }
              onInsertConditionTemplate={(condition) => {
                const nextDraft = eventAuthoringReducer(draft, {
                  type: "add_trigger_condition",
                  condition,
                  index: resolvedConditionInsertIndex,
                });

                setConditionInsertIndex(resolvedConditionInsertIndex + 1);
                onDraftChange(nextDraft);
              }}
            />
          ) : (
            <>
              <div className="event-authoring-section-heading">
                <h3>Helper Panel</h3>
                <span className="status-tag status-muted">later</span>
              </div>
              <ul className="event-authoring-helper-list">
                <li>
                  <strong>Capability catalog</strong>
                  <span>Trigger, node, condition, effect, and handler references.</span>
                </li>
                <li>
                  <strong>Preview</strong>
                  <span>Generated definition and call template preview.</span>
                </li>
                <li>
                  <strong>Validation</strong>
                  <span>Draft and publish checks mapped back to authoring locations.</span>
                </li>
              </ul>
            </>
          )}
        </aside>
      </div>
    </section>
  );

  function selectStep(step: AuthoringStep): void {
    onDraftChange(
      eventAuthoringReducer(draft, {
        type: "select_step",
        step,
        selection: { step },
      }),
    );
  }
}

function StepPlaceholder({
  step,
  draft,
}: {
  step: (typeof AUTHORING_STEPS)[number];
  draft: EventDraftEnvelope;
}) {
  return (
    <dl className="event-authoring-step-summary">
      <div>
        <dt>Current step</dt>
        <dd>{step.id}</dd>
      </div>
      <div>
        <dt>Expected responsibility</dt>
        <dd>{step.responsibility}</dd>
      </div>
      <div>
        <dt>Draft target</dt>
        <dd>
          <code>
            {draft.target.domain}/{draft.target.definition_id}
          </code>
        </dd>
      </div>
    </dl>
  );
}

function MetaItem({
  label,
  value,
  ariaLabel,
  code = false,
  locked = false,
  tagClassName,
}: {
  label: string;
  value: string;
  ariaLabel?: string;
  code?: boolean;
  locked?: boolean;
  tagClassName?: string;
}) {
  return (
    <div aria-label={ariaLabel}>
      <dt>{label}</dt>
      <dd>
        {tagClassName ? (
          <span className={`status-tag ${tagClassName}`}>{value}</span>
        ) : code ? (
          <code>{value}</code>
        ) : (
          <span>{value}</span>
        )}
        {locked ? <span className="status-tag status-locked">Locked</span> : null}
      </dd>
    </div>
  );
}

function resolveActiveStep(step: EventEditorStep): AuthoringStep {
  return step === "domain" ? "basic" : step;
}

function formatDraftHash(hash: string | null): string {
  return hash ? hash.slice(0, 8) : "unsaved";
}
