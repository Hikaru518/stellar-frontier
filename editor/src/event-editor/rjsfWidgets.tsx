import type { FieldProps, RegistryFieldsType, RegistryWidgetsType, RJSFSchema, WidgetProps } from "@rjsf/utils";

type JsonRecord = Record<string, unknown>;

type EventEditorFieldProps = FieldProps<unknown, RJSFSchema>;
type EventEditorWidgetProps = WidgetProps<unknown, RJSFSchema>;

export const rjsfFields: RegistryFieldsType<unknown, RJSFSchema> = {
  conditionsArray: ConditionsArrayField,
  effectGroups: EffectGroupsField,
  eventGraph: EventGraphField,
  jsonObject: JsonObjectField,
  targetRef: TargetRefField,
};

export const rjsfWidgets: RegistryWidgetsType<unknown, RJSFSchema> = {
  referenceText: ReferenceTextWidget,
};

function EventGraphField({ formData, onChange }: EventEditorFieldProps) {
  const graph = asRecord(formData);
  const nodes = asArray(graph.nodes);
  const edges = asArray(graph.edges);
  const terminalNodeIds = asArray(graph.terminal_node_ids);

  return (
    <section className="structured-editor graph-editor" aria-label="Structured event graph editor">
      <div className="structured-editor-heading">
        <h4>Graph outline</h4>
        <span className="status-tag status-muted">NO CANVAS</span>
      </div>
      <label>
        Entry node
        <input
          aria-label="Graph entry node"
          value={toInputValue(graph.entry_node_id)}
          onChange={(event) => changeField(onChange, { ...graph, entry_node_id: event.target.value })}
        />
      </label>
      <div className="structured-editor-stats">
        <span>{formatCount(nodes.length, "node")}</span>
        <span>{formatCount(edges.length, "edge")}</span>
        <span>{formatCount(terminalNodeIds.length, "terminal")}</span>
      </div>
      {nodes.length > 0 ? (
        <ul className="structured-card-list" aria-label="Event graph nodes">
          {nodes.map((node, index) => {
            const nodeRecord = asRecord(node);
            return (
              <li key={`${toInputValue(nodeRecord.id)}-${index}`} className="structured-card">
                <strong>{toInputValue(nodeRecord.id) || `node ${index + 1}`}</strong>
                <span>{toInputValue(nodeRecord.type) || "unknown type"}</span>
                {nodeRecord.title ? <span>{toInputValue(nodeRecord.title)}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted-text">No nodes defined yet.</p>
      )}
    </section>
  );
}

function ConditionsArrayField({ formData, onChange }: EventEditorFieldProps) {
  const conditions = asArray(formData).map(asRecord);

  return (
    <section className="structured-editor" aria-label="Structured condition editor">
      <div className="structured-editor-heading">
        <h4>Condition builder</h4>
        <span className="status-tag status-muted">{formatCount(conditions.length, "condition")}</span>
      </div>
      {conditions.length > 0 ? (
        <ul className="structured-card-list">
          {conditions.map((condition, index) => (
            <li key={`${toInputValue(condition.type)}-${index}`} className="structured-card">
              <label>
                Condition type
                <input
                  aria-label={`Condition ${index + 1} type`}
                  value={toInputValue(condition.type)}
                  onChange={(event) => changeField(onChange, updateArrayItem(conditions, index, { ...condition, type: event.target.value }))}
                />
              </label>
              <strong>{toInputValue(condition.type) || "condition"}</strong>
              {condition.target ? (
                <TargetRefSummary
                  value={condition.target}
                  onChange={(target) => changeField(onChange, updateArrayItem(conditions, index, { ...condition, target }))}
                />
              ) : null}
              {condition.field ? <span>field: {toInputValue(condition.field)}</span> : null}
              {condition.op ? <span>op: {toInputValue(condition.op)}</span> : null}
              {condition.handler_type ? <span>handler: {toInputValue(condition.handler_type)}</span> : null}
              {condition.params ? <JsonObjectSummary value={condition.params} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">No conditions. Add or reorder condition blocks in JSON for this MVP.</p>
      )}
    </section>
  );
}

function EffectGroupsField({ formData, onChange }: EventEditorFieldProps) {
  const groups = asArray(formData).map(asRecord);

  return (
    <section className="structured-editor" aria-label="Structured effect editor">
      <div className="structured-editor-heading">
        <h4>Effect editor</h4>
        <span className="status-tag status-muted">{formatCount(groups.length, "group")}</span>
      </div>
      {groups.length > 0 ? (
        <ul className="structured-card-list">
          {groups.map((group, groupIndex) => {
            const effects = asArray(group.effects).map(asRecord);
            return (
              <li key={`${toInputValue(group.id)}-${groupIndex}`} className="structured-card">
                <strong>{toInputValue(group.id) || `group ${groupIndex + 1}`}</strong>
                {effects.map((effect, effectIndex) => (
                  <div key={`${toInputValue(effect.id)}-${effectIndex}`} className="structured-subcard">
                    <label>
                      Effect type
                      <input
                        aria-label={`Effect ${effectIndex + 1} type`}
                        value={toInputValue(effect.type)}
                        onChange={(event) =>
                          changeField(onChange, updateEffect(groups, groupIndex, effectIndex, { ...effect, type: event.target.value }))
                        }
                      />
                    </label>
                    <strong>{toInputValue(effect.type) || "effect"}</strong>
                    {effect.handler_type ? <span>handler: {toInputValue(effect.handler_type)}</span> : null}
                    {effect.target ? (
                      <TargetRefSummary
                        value={effect.target}
                        onChange={(target) => changeField(onChange, updateEffect(groups, groupIndex, effectIndex, { ...effect, target }))}
                      />
                    ) : null}
                    {effect.params ? <JsonObjectSummary value={effect.params} /> : null}
                  </div>
                ))}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted-text">No effect groups. Add effect blocks in JSON for this MVP.</p>
      )}
    </section>
  );
}

function JsonObjectField({ formData, onChange }: EventEditorFieldProps) {
  const record = asRecord(formData);

  return (
    <section className="structured-editor" aria-label="Handler params editor">
      <div className="structured-editor-heading">
        <h4>Handler params</h4>
        <span className="status-tag status-muted">{formatCount(Object.keys(record).length, "param")}</span>
      </div>
      <JsonObjectSummary
        value={record}
        onChange={(nextRecord) => {
          changeField(onChange, nextRecord);
        }}
      />
    </section>
  );
}

function TargetRefField({ formData, onChange }: EventEditorFieldProps) {
  return <TargetRefSummary value={formData} onChange={(value) => changeField(onChange, value)} />;
}

function TargetRefSummary({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const target = asRecord(value);

  return (
    <div className="reference-editor" aria-label="Target reference editor">
      <span>target: {toInputValue(target.type) || "unset"}</span>
      <label>
        Type
        <input
          aria-label="Target reference type"
          value={toInputValue(target.type)}
          onChange={(event) => onChange({ ...target, type: event.target.value })}
        />
      </label>
      {target.id ? <span>id: {toInputValue(target.id)}</span> : null}
      {target.ref ? <span>ref: {toInputValue(target.ref)}</span> : null}
    </div>
  );
}

function JsonObjectSummary({ value, onChange }: { value: unknown; onChange?: (value: JsonRecord) => void }) {
  const record = asRecord(value);
  const entries = Object.entries(record);

  if (entries.length === 0) {
    return <p className="muted-text">No params.</p>;
  }

  return (
    <dl className="json-object-summary">
      {entries.map(([key, childValue]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>
            {isScalar(childValue) && onChange ? (
              <input
                aria-label={`Param ${key}`}
                value={String(childValue)}
                onChange={(event) => onChange({ ...record, [key]: coerceParamValue(childValue, event.target.value) })}
              />
            ) : (
              `${key}: ${formatJsonValue(childValue)}`
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReferenceTextWidget({ id, value, disabled, readonly, options = {}, onChange }: EventEditorWidgetProps) {
  const referenceKind = typeof options.referenceKind === "string" ? options.referenceKind : "content";

  return (
    <div className="reference-widget">
      <input
        id={id}
        value={toInputValue(value)}
        disabled={disabled || readonly}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="muted-text">Reference: {referenceKind}</span>
    </div>
  );
}

function updateArrayItem(items: JsonRecord[], index: number, value: JsonRecord): JsonRecord[] {
  return items.map((item, itemIndex) => (itemIndex === index ? value : item));
}

function changeField(onChange: EventEditorFieldProps["onChange"], value: unknown): void {
  onChange(value, []);
}

function updateEffect(groups: JsonRecord[], groupIndex: number, effectIndex: number, effect: JsonRecord): JsonRecord[] {
  return groups.map((group, currentGroupIndex) => {
    if (currentGroupIndex !== groupIndex) {
      return group;
    }

    return {
      ...group,
      effects: asArray(group.effects).map((currentEffect, currentEffectIndex) =>
        currentEffectIndex === effectIndex ? effect : currentEffect,
      ),
    };
  });
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function toInputValue(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function formatJsonValue(value: unknown): string {
  if (isScalar(value)) {
    return String(value);
  }

  return JSON.stringify(value);
}

function coerceParamValue(previousValue: unknown, nextValue: string): unknown {
  if (typeof previousValue === "number") {
    return Number(nextValue);
  }
  if (typeof previousValue === "boolean") {
    return nextValue === "true";
  }
  return nextValue;
}

function isScalar(value: unknown): value is string | number | boolean | null {
  return value === null || ["string", "number", "boolean"].includes(typeof value);
}

function formatCount(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

export type EventEditorRjsfSchema = RJSFSchema;
