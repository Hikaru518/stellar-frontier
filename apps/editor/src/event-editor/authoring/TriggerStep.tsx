import { useEffect, useId, useState } from "react";
import type {
  CompareOp,
  Condition,
  ConditionType,
  JsonObject,
  TargetRef,
  TriggerType,
} from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope } from "../types";
import {
  conditionCapabilities,
  conditionHandlerOptions,
  getConditionCapability,
  triggerCapabilities,
} from "./capabilityCatalog";
import { eventAuthoringReducer } from "./eventAuthoringReducer";

interface TriggerStepProps {
  draft: EventDraftEnvelope;
  conditionInsertIndex: number;
  onConditionInsertIndexChange: (index: number) => void;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}

const COMPARE_OPS: readonly CompareOp[] = [
  "equals",
  "not_equals",
  "gt",
  "gte",
  "lt",
  "lte",
  "includes",
  "not_includes",
];

const TARGET_TYPES: readonly TargetRef["type"][] = [
  "primary_crew",
  "related_crew",
  "crew_id",
  "event_tile",
  "tile_id",
  "active_event",
  "parent_event",
  "child_event",
  "objective_id",
  "crew_inventory",
  "base_inventory",
  "base_resources",
  "tile_resources",
  "world_flags",
  "world_history",
  "event_log",
];

export default function TriggerStep({
  draft,
  conditionInsertIndex,
  onConditionInsertIndexChange,
  onDraftChange,
}: TriggerStepProps) {
  const trigger = draft.working_definition.trigger ?? getTriggerTemplate("arrival");
  const conditions = trigger.conditions ?? [];
  const resolvedInsertIndex = Math.min(Math.max(conditionInsertIndex, 0), conditions.length);
  const probabilityErrorId = `${useId()}-probability-base`;
  const [probabilityBaseText, setProbabilityBaseText] = useState(formatOptionalNumber(trigger.probability?.base));
  const [probabilityBaseError, setProbabilityBaseError] = useState<string | null>(null);

  useEffect(() => {
    setProbabilityBaseText(formatOptionalNumber(trigger.probability?.base));
    setProbabilityBaseError(null);
  }, [trigger.probability?.base]);

  return (
    <form className="event-trigger-step-form" aria-label="Trigger event fields">
      <fieldset aria-label="Trigger definition">
        <legend>Trigger definition</legend>
        <label>
          Trigger type
          <select
            aria-label="Trigger type"
            value={trigger.type}
            onChange={(event) => updateTriggerType(event.target.value as TriggerType)}
          >
            {triggerCapabilities.map((capability) => (
              <option key={capability.type} value={capability.type}>
                {capability.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Required context
          <input
            aria-label="Required context"
            value={(trigger.required_context ?? []).join(", ")}
            onChange={(event) => updateRequiredContext(event.target.value)}
          />
        </label>
        <label>
          Probability base
          <input
            aria-label="Probability base"
            inputMode="decimal"
            value={probabilityBaseText}
            aria-invalid={Boolean(probabilityBaseError)}
            aria-describedby={probabilityErrorId}
            onChange={(event) => updateProbabilityBase(event.target.value)}
          />
          <FieldError id={probabilityErrorId} message={probabilityBaseError} />
        </label>
      </fieldset>

      <fieldset aria-label="Trigger conditions">
        <legend>Trigger conditions</legend>
        <label>
          Condition insert position
          <select
            aria-label="Condition insert position"
            value={resolvedInsertIndex}
            onChange={(event) => onConditionInsertIndexChange(Number.parseInt(event.target.value, 10))}
          >
            {Array.from({ length: conditions.length + 1 }, (_value, index) => (
              <option key={index} value={index}>
                {index === conditions.length ? "At end" : `Before condition ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
        {conditions.length > 0 ? (
          <ol className="event-trigger-condition-list">
            {conditions.map((condition, index) => (
              <ConditionEditor
                key={`${index}-${condition.type}`}
                condition={condition}
                index={index}
                onUpdate={(nextCondition) => updateCondition(index, nextCondition)}
                onRemove={() => removeCondition(index)}
              />
            ))}
          </ol>
        ) : (
          <p className="muted-text">No trigger conditions.</p>
        )}
      </fieldset>
    </form>
  );

  function updateTriggerType(triggerType: TriggerType): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "update_trigger_type", triggerType }));
  }

  function updateRequiredContext(value: string): void {
    onDraftChange(
      eventAuthoringReducer(draft, {
        type: "update_trigger_required_context",
        requiredContext: parseCommaSeparatedList(value),
      }),
    );
  }

  function updateProbabilityBase(value: string): void {
    setProbabilityBaseText(value);

    if (!value.trim()) {
      setProbabilityBaseError(null);
      onDraftChange(eventAuthoringReducer(draft, { type: "update_trigger_probability", probability: undefined }));
      return;
    }

    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue)) {
      setProbabilityBaseError("Probability base must be a valid number.");
      return;
    }

    setProbabilityBaseError(null);
    onDraftChange(
      eventAuthoringReducer(draft, {
        type: "update_trigger_probability",
        probability: {
          ...trigger.probability,
          base: parsedValue,
        },
      }),
    );
  }

  function updateCondition(index: number, condition: Condition): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "update_trigger_condition", index, condition }));
  }

  function removeCondition(index: number): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "remove_trigger_condition", index }));
    onConditionInsertIndexChange(Math.min(resolvedInsertIndex, Math.max(conditions.length - 1, 0)));
  }
}

function ConditionEditor({
  condition,
  index,
  onUpdate,
  onRemove,
}: {
  condition: Condition;
  index: number;
  onUpdate: (condition: Condition) => void;
  onRemove: () => void;
}) {
  const displayIndex = index + 1;

  return (
    <li>
      <fieldset aria-label={`Condition ${displayIndex}`}>
        <legend>Condition {displayIndex}</legend>
        <label>
          Type
          <select
            aria-label={`Condition ${displayIndex} type`}
            value={condition.type}
            onChange={(event) => onUpdate(clonePlain(getConditionCapability(event.target.value as ConditionType).template))}
          >
            {conditionCapabilities.map((capability) => (
              <option key={capability.type} value={capability.type}>
                {capability.label}
              </option>
            ))}
          </select>
        </label>
        <TargetEditor condition={condition} displayIndex={displayIndex} onUpdate={onUpdate} />
        <label>
          Field
          <input
            aria-label={`Condition ${displayIndex} field`}
            value={condition.field ?? ""}
            onChange={(event) => onUpdate({ ...condition, field: event.target.value.trim() || null })}
          />
        </label>
        <label>
          Operator
          <select
            aria-label={`Condition ${displayIndex} operator`}
            value={condition.op ?? ""}
            onChange={(event) =>
              onUpdate({
                ...condition,
                op: event.target.value ? (event.target.value as CompareOp) : null,
              })
            }
          >
            <option value="">None</option>
            {COMPARE_OPS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
        </label>
        <label>
          Value
          <input
            aria-label={`Condition ${displayIndex} value`}
            value={formatUnknownValue(condition.value)}
            onChange={(event) => onUpdate({ ...condition, value: parseUnknownValue(event.target.value) })}
          />
        </label>
        {condition.type === "handler_condition" ? (
          <HandlerConditionFields condition={condition} displayIndex={displayIndex} onUpdate={onUpdate} />
        ) : null}
        <button type="button" onClick={onRemove}>
          Remove condition {displayIndex}
        </button>
      </fieldset>
    </li>
  );
}

function TargetEditor({
  condition,
  displayIndex,
  onUpdate,
}: {
  condition: Condition;
  displayIndex: number;
  onUpdate: (condition: Condition) => void;
}) {
  const target = condition.target ?? null;

  return (
    <>
      <label>
        Target type
        <select
          aria-label={`Condition ${displayIndex} target type`}
          value={target?.type ?? ""}
          onChange={(event) => {
            const targetType = event.target.value as TargetRef["type"] | "";
            onUpdate({
              ...condition,
              target: targetType ? { ...(target ?? {}), type: targetType } : null,
            });
          }}
        >
          <option value="">None</option>
          {TARGET_TYPES.map((targetType) => (
            <option key={targetType} value={targetType}>
              {targetType}
            </option>
          ))}
        </select>
      </label>
      <label>
        Target id
        <input
          aria-label={`Condition ${displayIndex} target id`}
          value={target?.id ?? ""}
          onChange={(event) => {
            const nextTarget: TargetRef = {
              ...(target ?? { type: "primary_crew" }),
              id: event.target.value.trim() || null,
            };

            onUpdate({
              ...condition,
              target: nextTarget,
            });
          }}
        />
      </label>
    </>
  );
}

function HandlerConditionFields({
  condition,
  displayIndex,
  onUpdate,
}: {
  condition: Condition;
  displayIndex: number;
  onUpdate: (condition: Condition) => void;
}) {
  return (
    <>
      <label>
        Handler type
        <select
          aria-label={`Condition ${displayIndex} handler type`}
          value={condition.handler_type ?? ""}
          onChange={(event) => onUpdate({ ...condition, handler_type: event.target.value || null })}
        >
          <option value="">Select handler</option>
          {conditionHandlerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <ParamsObjectEditor condition={condition} displayIndex={displayIndex} onUpdate={onUpdate} />
    </>
  );
}

function ParamsObjectEditor({
  condition,
  displayIndex,
  onUpdate,
}: {
  condition: Condition;
  displayIndex: number;
  onUpdate: (condition: Condition) => void;
}) {
  const errorId = `${useId()}-params-object`;
  const [paramsText, setParamsText] = useState(formatJsonObject(condition.params));
  const [paramsError, setParamsError] = useState<string | null>(null);

  useEffect(() => {
    setParamsText(formatJsonObject(condition.params));
    setParamsError(null);
  }, [condition.params]);

  return (
    <label>
      Params object
      <textarea
        aria-label={`Condition ${displayIndex} params object`}
        value={paramsText}
        aria-invalid={Boolean(paramsError)}
        aria-describedby={errorId}
        onChange={(event) => updateParams(event.target.value)}
      />
      <FieldError id={errorId} message={paramsError} />
    </label>
  );

  function updateParams(value: string): void {
    setParamsText(value);

    if (!value.trim()) {
      setParamsError(null);
      onUpdate({ ...condition, params: {} });
      return;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (!isJsonObject(parsed)) {
        setParamsError("Params object must be a JSON object.");
        return;
      }

      setParamsError(null);
      onUpdate({ ...condition, params: parsed });
    } catch (_error) {
      setParamsError("Params object must be valid JSON.");
    }
  }
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <span id={id} role="alert" className="map-form-errors">
      {message}
    </span>
  );
}

function parseCommaSeparatedList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatOptionalNumber(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

function parseUnknownValue(value: string): unknown {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }
  if (trimmedValue === "true") {
    return true;
  }
  if (trimmedValue === "false") {
    return false;
  }
  if (trimmedValue === "null") {
    return null;
  }

  const numericValue = Number(trimmedValue);
  if (trimmedValue !== "" && Number.isFinite(numericValue)) {
    return numericValue;
  }

  if (trimmedValue.startsWith("{") || trimmedValue.startsWith("[")) {
    try {
      return JSON.parse(trimmedValue) as unknown;
    } catch (_error) {
      return value;
    }
  }

  return value;
}

function formatUnknownValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }

  return JSON.stringify(value);
}

function formatJsonObject(value: JsonObject | undefined): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getTriggerTemplate(triggerType: TriggerType) {
  const capability = triggerCapabilities.find((candidate) => candidate.type === triggerType);

  if (!capability) {
    throw new Error(`Unknown trigger capability: ${triggerType}`);
  }

  return capability.template;
}
