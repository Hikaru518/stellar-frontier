import { useEffect, useId, useState } from "react";
import type { EventDefinition, WorldHistoryScope } from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope } from "../types";
import { eventAuthoringReducer } from "./eventAuthoringReducer";

interface BasicStepProps {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}

type CandidateSelection = EventDefinition["candidate_selection"];
type RepeatPolicy = EventDefinition["repeat_policy"];

type NumericField =
  | "candidatePriority"
  | "candidateWeight"
  | "candidateMaxInstances"
  | "repeatMaxTriggerCount"
  | "repeatCooldownSeconds";

type NumericValues = Record<NumericField, string>;
type NumericErrors = Partial<Record<NumericField, string>>;

const WORLD_HISTORY_SCOPES: readonly WorldHistoryScope[] = ["world", "crew", "tile", "crew_tile", "objective", "event"];

const DEFAULT_CANDIDATE_SELECTION: CandidateSelection = {
  priority: 0,
  weight: 1,
  mutex_group: null,
  max_instances_per_trigger: 1,
  requires_blocking_slot: false,
};

const DEFAULT_REPEAT_POLICY: RepeatPolicy = {
  scope: "event",
  max_trigger_count: null,
  cooldown_seconds: 0,
  history_key_template: "",
  allow_while_active: false,
};

export default function BasicStep({ draft, onDraftChange }: BasicStepProps) {
  const candidateSelection = getCandidateSelection(draft);
  const repeatPolicy = getRepeatPolicy(draft);
  const errorIdPrefix = useId();
  const [numericValues, setNumericValues] = useState(() => createNumericValues(candidateSelection, repeatPolicy));
  const [numericErrors, setNumericErrors] = useState<NumericErrors>({});
  const isLockedTarget = draft.mode === "edit_existing";

  useEffect(() => {
    setNumericValues(createNumericValues(candidateSelection, repeatPolicy));
  }, [
    candidateSelection.priority,
    candidateSelection.weight,
    candidateSelection.max_instances_per_trigger,
    repeatPolicy.max_trigger_count,
    repeatPolicy.cooldown_seconds,
  ]);

  return (
    <form className="event-basic-step-form" aria-label="Basic event fields">
      <fieldset aria-label="Draft identity">
        <legend>Draft identity</legend>
        <label>
          Domain
          <input aria-label="Domain" value={draft.target.domain} readOnly disabled />
        </label>
        <label>
          Definition id
          <input aria-label="Definition id" value={draft.target.definition_id} readOnly disabled />
        </label>
        {isLockedTarget ? <span className="status-tag status-locked">Locked</span> : null}
      </fieldset>

      <fieldset aria-label="Definition summary">
        <legend>Definition summary</legend>
        <label>
          Title
          <input
            aria-label="Title"
            value={draft.working_definition.title ?? ""}
            onChange={(event) => updateBasicFields({ title: event.target.value })}
          />
        </label>
        <label>
          Summary
          <textarea
            aria-label="Summary"
            value={draft.working_definition.summary ?? ""}
            onChange={(event) => updateBasicFields({ summary: event.target.value })}
          />
        </label>
        <label>
          Tags
          <input
            aria-label="Tags"
            value={(draft.working_definition.tags ?? []).join(", ")}
            onChange={(event) => updateBasicFields({ tags: parseTags(event.target.value) })}
          />
        </label>
      </fieldset>

      <fieldset aria-label="Candidate selection">
        <legend>Candidate selection</legend>
        <label>
          Priority
          <input
            aria-label="Priority"
            inputMode="decimal"
            value={numericValues.candidatePriority}
            aria-invalid={Boolean(numericErrors.candidatePriority)}
            aria-describedby={getErrorId("candidatePriority")}
            onChange={(event) =>
              updateNumericField("candidatePriority", event.target.value, {
                label: "Priority",
                onValid: (value) => {
                  if (value !== null) {
                    updateCandidateSelection({ priority: value });
                  }
                },
              })
            }
          />
          <FieldError id={getErrorId("candidatePriority")} message={numericErrors.candidatePriority} />
        </label>
        <label>
          Weight
          <input
            aria-label="Weight"
            inputMode="decimal"
            value={numericValues.candidateWeight}
            aria-invalid={Boolean(numericErrors.candidateWeight)}
            aria-describedby={getErrorId("candidateWeight")}
            onChange={(event) =>
              updateNumericField("candidateWeight", event.target.value, {
                label: "Weight",
                min: 0,
                onValid: (value) => {
                  if (value !== null) {
                    updateCandidateSelection({ weight: value });
                  }
                },
              })
            }
          />
          <FieldError id={getErrorId("candidateWeight")} message={numericErrors.candidateWeight} />
        </label>
        <label>
          Mutex group
          <input
            aria-label="Mutex group"
            value={candidateSelection.mutex_group ?? ""}
            onChange={(event) => updateCandidateSelection({ mutex_group: event.target.value.trim() || null })}
          />
        </label>
        <label>
          Max instances per trigger
          <input
            aria-label="Max instances per trigger"
            inputMode="numeric"
            value={numericValues.candidateMaxInstances}
            aria-invalid={Boolean(numericErrors.candidateMaxInstances)}
            aria-describedby={getErrorId("candidateMaxInstances")}
            onChange={(event) =>
              updateNumericField("candidateMaxInstances", event.target.value, {
                label: "Max instances per trigger",
                integer: true,
                min: 1,
                onValid: (value) => {
                  if (value !== null) {
                    updateCandidateSelection({ max_instances_per_trigger: value });
                  }
                },
              })
            }
          />
          <FieldError id={getErrorId("candidateMaxInstances")} message={numericErrors.candidateMaxInstances} />
        </label>
        <label>
          <input
            aria-label="Requires blocking slot"
            type="checkbox"
            checked={candidateSelection.requires_blocking_slot}
            onChange={(event) => updateCandidateSelection({ requires_blocking_slot: event.target.checked })}
          />
          Requires blocking slot
        </label>
      </fieldset>

      <fieldset aria-label="Repeat policy">
        <legend>Repeat policy</legend>
        <label>
          Scope
          <select
            aria-label="Scope"
            value={repeatPolicy.scope}
            onChange={(event) => updateRepeatPolicy({ scope: event.target.value as WorldHistoryScope })}
          >
            {WORLD_HISTORY_SCOPES.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
        </label>
        <label>
          Max trigger count
          <input
            aria-label="Max trigger count"
            inputMode="numeric"
            value={numericValues.repeatMaxTriggerCount}
            aria-invalid={Boolean(numericErrors.repeatMaxTriggerCount)}
            aria-describedby={getErrorId("repeatMaxTriggerCount")}
            onChange={(event) =>
              updateNumericField("repeatMaxTriggerCount", event.target.value, {
                label: "Max trigger count",
                integer: true,
                min: 1,
                optional: true,
                onValid: (value) => updateRepeatPolicy({ max_trigger_count: value }),
              })
            }
          />
          <FieldError id={getErrorId("repeatMaxTriggerCount")} message={numericErrors.repeatMaxTriggerCount} />
        </label>
        <label>
          Cooldown seconds
          <input
            aria-label="Cooldown seconds"
            inputMode="decimal"
            value={numericValues.repeatCooldownSeconds}
            aria-invalid={Boolean(numericErrors.repeatCooldownSeconds)}
            aria-describedby={getErrorId("repeatCooldownSeconds")}
            onChange={(event) =>
              updateNumericField("repeatCooldownSeconds", event.target.value, {
                label: "Cooldown seconds",
                min: 0,
                onValid: (value) => {
                  if (value !== null) {
                    updateRepeatPolicy({ cooldown_seconds: value });
                  }
                },
              })
            }
          />
          <FieldError id={getErrorId("repeatCooldownSeconds")} message={numericErrors.repeatCooldownSeconds} />
        </label>
        <label>
          History key template
          <input
            aria-label="History key template"
            value={repeatPolicy.history_key_template}
            onChange={(event) => updateRepeatPolicy({ history_key_template: event.target.value })}
          />
        </label>
        <label>
          <input
            aria-label="Allow while active"
            type="checkbox"
            checked={repeatPolicy.allow_while_active}
            onChange={(event) => updateRepeatPolicy({ allow_while_active: event.target.checked })}
          />
          Allow while active
        </label>
      </fieldset>
    </form>
  );

  function updateBasicFields(fields: Partial<Pick<EventDefinition, "title" | "summary" | "tags">>): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "update_basic_fields", fields }));
  }

  function updateCandidateSelection(fields: Partial<CandidateSelection>): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "update_candidate_selection", fields }));
  }

  function updateRepeatPolicy(fields: Partial<RepeatPolicy>): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "update_repeat_policy", fields }));
  }

  function updateNumericField(
    field: NumericField,
    rawValue: string,
    options: {
      label: string;
      integer?: boolean;
      min?: number;
      optional?: boolean;
      onValid: (value: number | null) => void;
    },
  ): void {
    setNumericValues((current) => ({ ...current, [field]: rawValue }));
    const result = parseNumericInput(rawValue, options);

    if (!result.valid) {
      setNumericErrors((current) => ({ ...current, [field]: result.error }));
      return;
    }

    setNumericErrors((current) => {
      const { [field]: _removed, ...remaining } = current;
      return remaining;
    });
    options.onValid(result.value);
  }

  function getErrorId(field: NumericField): string | undefined {
    return numericErrors[field] ? `${errorIdPrefix}-${field}-error` : undefined;
  }
}

function FieldError({ id, message }: { id: string | undefined; message: string | undefined }) {
  if (!message || !id) {
    return null;
  }

  return (
    <span id={id} className="event-action-error" role="alert">
      {message}
    </span>
  );
}

function getCandidateSelection(draft: EventDraftEnvelope): CandidateSelection {
  return {
    ...DEFAULT_CANDIDATE_SELECTION,
    ...draft.working_definition.candidate_selection,
  };
}

function getRepeatPolicy(draft: EventDraftEnvelope): RepeatPolicy {
  return {
    ...DEFAULT_REPEAT_POLICY,
    ...draft.working_definition.repeat_policy,
  };
}

function createNumericValues(candidateSelection: CandidateSelection, repeatPolicy: RepeatPolicy): NumericValues {
  return {
    candidatePriority: String(candidateSelection.priority),
    candidateWeight: String(candidateSelection.weight),
    candidateMaxInstances: String(candidateSelection.max_instances_per_trigger),
    repeatMaxTriggerCount: repeatPolicy.max_trigger_count == null ? "" : String(repeatPolicy.max_trigger_count),
    repeatCooldownSeconds: String(repeatPolicy.cooldown_seconds),
  };
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseNumericInput(
  value: string,
  options: { label: string; integer?: boolean; min?: number; optional?: boolean },
): { valid: true; value: number | null } | { valid: false; error: string } {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    if (options.optional) {
      return { valid: true, value: null };
    }

    return { valid: false, error: `${options.label} must be a valid number.` };
  }

  const numericValue = Number(trimmedValue);

  if (!Number.isFinite(numericValue)) {
    return { valid: false, error: `${options.label} must be a valid number.` };
  }
  if (options.integer && !Number.isInteger(numericValue)) {
    return { valid: false, error: `${options.label} must be an integer.` };
  }
  if (options.min !== undefined && numericValue < options.min) {
    return { valid: false, error: `${options.label} must be at least ${options.min}.` };
  }

  return { valid: true, value: numericValue };
}
