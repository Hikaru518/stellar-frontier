import { useState } from "react";
import type { Condition, Effect, EffectType, TriggerDefinition, TriggerType } from "../../../../pc-client/src/events/types";
import {
  conditionCapabilities,
  effectCapabilities,
  triggerCapabilities,
  type ConditionCapability,
  type EffectCapability,
  type TriggerCapability,
} from "./capabilityCatalog";

interface CapabilityCatalogPanelProps {
  activeKind?: "trigger" | "effects";
  onSelectTriggerTemplate?: (template: TriggerDefinition) => void;
  onInsertConditionTemplate?: (template: Condition) => void;
  onInsertEffectTemplate?: (template: Effect) => void;
}

export default function CapabilityCatalogPanel({
  activeKind = "trigger",
  onSelectTriggerTemplate,
  onInsertConditionTemplate,
  onInsertEffectTemplate,
}: CapabilityCatalogPanelProps) {
  const [selectedTriggerType, setSelectedTriggerType] = useState<TriggerType>(triggerCapabilities[0].type);
  const [selectedEffectType, setSelectedEffectType] = useState<EffectType>(effectCapabilities[0].type);

  return (
    <section className="capability-catalog-panel" aria-label="Capability catalog">
      <div className="event-authoring-section-heading">
        <h3>Capability Catalog</h3>
        <span className="status-tag status-muted">{activeKind === "effects" ? "effects" : "trigger"}</span>
      </div>

      {activeKind === "effects" ? (
        <section aria-label="Effect capabilities">
          <h4>Effects</h4>
          <div className="capability-catalog-apply-row">
            <label>
              Effect template
              <select
                aria-label="Effect template"
                value={selectedEffectType}
                onChange={(event) => setSelectedEffectType(event.target.value as EffectType)}
              >
                {effectCapabilities.map((capability) => (
                  <option key={capability.type} value={capability.type}>
                    {capability.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!onInsertEffectTemplate}
              onClick={() => onInsertEffectTemplate?.(clonePlain(getEffectTemplate(selectedEffectType)))}
            >
              Insert effect template
            </button>
          </div>
          <ul className="event-authoring-helper-list">
            {effectCapabilities.map((capability) => (
              <EffectCapabilityCard
                key={capability.type}
                capability={capability}
                onInsertEffectTemplate={onInsertEffectTemplate}
              />
            ))}
          </ul>
        </section>
      ) : (
        <>
          <section aria-label="Trigger capabilities">
            <h4>Triggers</h4>
            <div className="capability-catalog-apply-row">
              <label>
                Trigger template
                <select
                  aria-label="Trigger template"
                  value={selectedTriggerType}
                  onChange={(event) => setSelectedTriggerType(event.target.value as TriggerType)}
                >
                  {triggerCapabilities.map((capability) => (
                    <option key={capability.type} value={capability.type}>
                      {capability.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!onSelectTriggerTemplate}
                onClick={() => onSelectTriggerTemplate?.(clonePlain(getTriggerTemplate(selectedTriggerType)))}
              >
                Apply trigger template
              </button>
            </div>
            <ul className="event-authoring-helper-list">
              {triggerCapabilities.map((capability) => (
                <TriggerCapabilityCard
                  key={capability.type}
                  capability={capability}
                  onSelectTriggerTemplate={onSelectTriggerTemplate}
                />
              ))}
            </ul>
          </section>

          <section aria-label="Condition capabilities">
            <h4>Conditions</h4>
            <ul className="event-authoring-helper-list">
              {conditionCapabilities.map((capability) => (
                <ConditionCapabilityCard
                  key={capability.type}
                  capability={capability}
                  onInsertConditionTemplate={onInsertConditionTemplate}
                />
              ))}
            </ul>
          </section>
        </>
      )}
    </section>
  );
}

function TriggerCapabilityCard({
  capability,
  onSelectTriggerTemplate,
}: {
  capability: TriggerCapability;
  onSelectTriggerTemplate: CapabilityCatalogPanelProps["onSelectTriggerTemplate"];
}) {
  return (
    <li aria-label={`Trigger capability ${capability.type}`}>
      <h5>
        {capability.label} <code>{capability.type}</code>
      </h5>
      <p className="muted-text">{capability.description}</p>
      <CapabilityMetadata
        requiredFields={capability.requiredFields}
        commonUse={capability.commonUse}
        extraRows={[
          {
            label: "Required context",
            value: formatList(capability.template.required_context),
          },
        ]}
      />
      <button
        type="button"
        disabled={!onSelectTriggerTemplate}
        onClick={() => onSelectTriggerTemplate?.(clonePlain(capability.template))}
      >
        Use {capability.label} trigger template
      </button>
    </li>
  );
}

function ConditionCapabilityCard({
  capability,
  onInsertConditionTemplate,
}: {
  capability: ConditionCapability;
  onInsertConditionTemplate: CapabilityCatalogPanelProps["onInsertConditionTemplate"];
}) {
  return (
    <li aria-label={`Condition capability ${capability.type}`}>
      <h5>
        {capability.label} <code>{capability.type}</code>
      </h5>
      <p className="muted-text">{capability.description}</p>
      <CapabilityMetadata requiredFields={capability.requiredFields} commonUse={capability.commonUse} />
      <button
        type="button"
        disabled={!onInsertConditionTemplate}
        onClick={() => onInsertConditionTemplate?.(clonePlain(capability.template))}
      >
        Insert {capability.label} template
      </button>
    </li>
  );
}

function EffectCapabilityCard({
  capability,
  onInsertEffectTemplate,
}: {
  capability: EffectCapability;
  onInsertEffectTemplate: CapabilityCatalogPanelProps["onInsertEffectTemplate"];
}) {
  return (
    <li aria-label={`Effect capability ${capability.type}`}>
      <h5>
        {capability.label} <code>{capability.type}</code>
      </h5>
      <p className="muted-text">{capability.description}</p>
      <CapabilityMetadata requiredFields={capability.requiredFields} commonUse={capability.commonUse} />
      <button
        type="button"
        disabled={!onInsertEffectTemplate}
        onClick={() => onInsertEffectTemplate?.(clonePlain(capability.template))}
      >
        Insert {capability.label} template
      </button>
    </li>
  );
}

function CapabilityMetadata({
  requiredFields,
  commonUse,
  extraRows = [],
}: {
  requiredFields: readonly string[];
  commonUse: string;
  extraRows?: readonly { label: string; value: string }[];
}) {
  return (
    <dl className="event-authoring-step-summary">
      <div>
        <dt>Required fields</dt>
        <dd>{formatList(requiredFields)}</dd>
      </div>
      {extraRows.map((row) => (
        <div key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
      <div>
        <dt>Common use</dt>
        <dd>{commonUse}</dd>
      </div>
    </dl>
  );
}

function formatList(values: readonly string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "None";
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getTriggerTemplate(triggerType: TriggerType): TriggerDefinition {
  const capability = triggerCapabilities.find((candidate) => candidate.type === triggerType);

  if (!capability) {
    throw new Error(`Unknown trigger capability: ${triggerType}`);
  }

  return capability.template;
}

function getEffectTemplate(effectType: EffectType): Effect {
  const capability = effectCapabilities.find((candidate) => candidate.type === effectType);

  if (!capability) {
    throw new Error(`Unknown effect capability: ${effectType}`);
  }

  return capability.template;
}
