import { useEffect, useState } from "react";
import type { Effect, EffectGroup } from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope, EventEditorIssue, EventEditorStep, ValidateDraftResponse } from "../types";
import BasicStep from "./BasicStep";
import CapabilityCatalogPanel from "./CapabilityCatalogPanel";
import EffectsStep from "./EffectsStep";
import EventValidationPanel from "./EventValidationPanel";
import GraphStructureEditor from "./GraphStructureEditor";
import StructuredJsonViewer from "./StructuredJsonViewer";
import TriggerStep from "./TriggerStep";
import { eventAuthoringReducer } from "./eventAuthoringReducer";
import { mapIssueJsonPathToDraftPath } from "./jsonPath";

type AuthoringStep = Exclude<EventEditorStep, "domain">;

interface EventAuthoringWorkspaceProps {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
  onValidateDraft?: (draft: EventDraftEnvelope) => Promise<ValidateDraftResponse>;
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

export default function EventAuthoringWorkspace({ draft, onDraftChange, onValidateDraft }: EventAuthoringWorkspaceProps) {
  const activeStep = resolveActiveStep(draft.editor_state.active_step);
  const activeStepConfig = AUTHORING_STEPS.find((step) => step.id === activeStep) ?? AUTHORING_STEPS[0];
  const isLockedTarget = draft.mode === "edit_existing";
  const triggerConditions = draft.working_definition.trigger?.conditions ?? [];
  const effectGroups = draft.working_definition.effect_groups ?? [];
  const selectionEffectGroupId = readSelectionString(draft.editor_state.selection, "effectGroupId");
  const [conditionInsertIndex, setConditionInsertIndex] = useState(triggerConditions.length);
  const [selectedEffectGroupId, setSelectedEffectGroupId] = useState<string | null>(effectGroups[0]?.id ?? null);
  const [validationIssues, setValidationIssues] = useState<EventEditorIssue[]>([]);
  const [validationStatus, setValidationStatus] = useState<"idle" | "running" | "complete" | "error">("idle");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [focusedJsonPath, setFocusedJsonPath] = useState<string | null>(null);
  const resolvedConditionInsertIndex = Math.min(Math.max(conditionInsertIndex, 0), triggerConditions.length);
  const resolvedSelectedEffectGroupId =
    selectedEffectGroupId && effectGroups.some((group) => group.id === selectedEffectGroupId)
      ? selectedEffectGroupId
      : selectionEffectGroupId && effectGroups.some((group) => group.id === selectionEffectGroupId)
        ? selectionEffectGroupId
      : (effectGroups[0]?.id ?? null);

  useEffect(() => {
    setValidationIssues([]);
    setValidationStatus("idle");
    setValidationError(null);
    setFocusedJsonPath(null);
  }, [draft.draft_id]);

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
              {activeStep === "basic" ||
              activeStep === "trigger" ||
              activeStep === "graph" ||
              activeStep === "effects" ||
              activeStep === "review"
                ? "editable"
                : "placeholder"}
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
            <GraphStructureEditor draft={draft} onDraftChange={onDraftChange} />
          ) : activeStep === "effects" ? (
            <EffectsStep
              draft={draft}
              selectedEffectGroupId={resolvedSelectedEffectGroupId}
              onSelectedEffectGroupIdChange={setSelectedEffectGroupId}
              onDraftChange={onDraftChange}
            />
          ) : activeStep === "review" ? (
            <ReviewStep
              draft={draft}
              issues={validationIssues}
              status={validationStatus}
              errorMessage={validationError}
              focusedJsonPath={focusedJsonPath}
              onValidate={onValidateDraft ? runValidation : undefined}
              onIssueJump={jumpToIssue}
            />
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
          ) : activeStep === "effects" ? (
            <CapabilityCatalogPanel
              activeKind="effects"
              onInsertEffectTemplate={(effect) => {
                const selectedGroup = effectGroups.find((group) => group.id === resolvedSelectedEffectGroupId);
                if (!selectedGroup) {
                  return;
                }

                onDraftChange(
                  eventAuthoringReducer(draft, {
                    type: "add_effect",
                    groupId: selectedGroup.id,
                    effect: withUniqueEffectId(selectedGroup, effect),
                  }),
                );
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

  async function runValidation(): Promise<void> {
    if (!onValidateDraft) {
      return;
    }

    setValidationStatus("running");
    setValidationError(null);

    try {
      const result = await onValidateDraft(draft);
      setValidationIssues(result.issues);
      setValidationStatus(result.valid ? "complete" : "complete");
    } catch (error: unknown) {
      setValidationError(error instanceof Error ? error.message : "Unknown validation error.");
      setValidationStatus("error");
    }
  }

  function jumpToIssue(issue: EventEditorIssue): void {
    setFocusedJsonPath(mapIssueJsonPathToDraftPath(issue.json_path ?? issue.editor_location?.field_path ?? null));

    if (issue.editor_location?.effect_group_id) {
      setSelectedEffectGroupId(issue.editor_location.effect_group_id);
    }

    onDraftChange(
      eventAuthoringReducer(draft, {
        type: "jump_to_editor_location",
        location: issue.editor_location,
        jsonPath: issue.json_path,
      }),
    );
  }
}

function ReviewStep({
  draft,
  issues,
  status,
  errorMessage,
  focusedJsonPath,
  onValidate,
  onIssueJump,
}: {
  draft: EventDraftEnvelope;
  issues: EventEditorIssue[];
  status: "idle" | "running" | "complete" | "error";
  errorMessage: string | null;
  focusedJsonPath: string | null;
  onValidate?: () => void;
  onIssueJump: (issue: EventEditorIssue) => void;
}) {
  return (
    <div className="event-review-step" aria-label="Review step">
      <dl className="event-authoring-step-summary">
        <div>
          <dt>Draft target</dt>
          <dd>
            <code>
              {draft.target.domain}/{draft.target.definition_id}
            </code>
          </dd>
        </div>
        <div>
          <dt>Working call templates</dt>
          <dd>{draft.working_call_templates.length}</dd>
        </div>
        <div>
          <dt>Draft hash</dt>
          <dd>{formatDraftHash(draft.hashes.draft)}</dd>
        </div>
      </dl>
      <EventValidationPanel
        issues={issues}
        status={status}
        errorMessage={errorMessage}
        onValidate={onValidate}
        onIssueJump={onIssueJump}
      />
      <StructuredJsonViewer draft={draft} focusPath={focusedJsonPath} />
    </div>
  );
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

function readSelectionString(selection: unknown, key: string): string | null {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    return null;
  }

  const value = (selection as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

function formatDraftHash(hash: string | null): string {
  return hash ? hash.slice(0, 8) : "unsaved";
}

function withUniqueEffectId(group: EffectGroup, effect: Effect): Effect {
  if (!group.effects.some((candidate) => candidate.id === effect.id)) {
    return effect;
  }

  let index = 1;
  let candidateId = effect.id;
  const existingIds = new Set(group.effects.map((candidate) => candidate.id));

  while (existingIds.has(candidateId)) {
    index += 1;
    candidateId = `${effect.id}_${index}`;
  }

  return {
    ...effect,
    id: candidateId,
  };
}
