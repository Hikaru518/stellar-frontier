import { useState } from "react";
import type { Condition, TriggerDefinition, TriggerType } from "../../../../pc-client/src/events/types";
import {
  conditionCapabilities,
  triggerCapabilities,
  type ConditionCapability,
  type TriggerCapability,
} from "./capabilityCatalog";

interface CapabilityCatalogPanelProps {
  onSelectTriggerTemplate?: (template: TriggerDefinition) => void;
  onInsertConditionTemplate?: (template: Condition) => void;
}

export default function CapabilityCatalogPanel({
  onSelectTriggerTemplate,
  onInsertConditionTemplate,
}: CapabilityCatalogPanelProps) {
  const [selectedTriggerType, setSelectedTriggerType] = useState<TriggerType>(triggerCapabilities[0].type);

  return (
    <section className="capability-catalog-panel" aria-label="Capability catalog">
      <div className="event-authoring-section-heading">
        <h3>Capability Catalog</h3>
        <span className="status-tag status-muted">trigger</span>
      </div>

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
