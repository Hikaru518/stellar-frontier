import type {
  CallNode,
  Effect,
  EffectFailurePolicy,
  EffectGroup,
  EffectType,
  EndNode,
  EventLogImportance,
  EventLogTemplate,
  EventLogVisibility,
  EventNode,
  HistoryWrite,
  JsonObject,
  LogOnlyNode,
  TargetRef,
  WorldHistoryScope,
} from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope } from "../types";
import { effectCapabilities, effectHandlerOptions, getEffectCapability } from "./capabilityCatalog";
import { eventAuthoringReducer, type EventAuthoringAction } from "./eventAuthoringReducer";
import { createDefaultEffectTemplate } from "./templates";

interface EffectsStepProps {
  draft: EventDraftEnvelope;
  selectedEffectGroupId: string | null;
  onSelectedEffectGroupIdChange: (groupId: string | null) => void;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}

type ParamRow = {
  key: string;
  value: string;
};
type UpdateEndNodeFields = Extract<EventAuthoringAction, { type: "update_end_node" }>["fields"];
type UpdateLogOnlyNodeFields = Extract<EventAuthoringAction, { type: "update_log_only_node" }>["fields"];

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

const FAILURE_POLICIES: readonly EffectFailurePolicy[] = ["fail_event", "skip_effect", "skip_group", "retry_later"];
const LOG_IMPORTANCE: readonly EventLogImportance[] = ["minor", "normal", "major", "critical"];
const LOG_VISIBILITY: readonly EventLogVisibility[] = ["player_visible", "hidden_until_resolved"];
const WORLD_HISTORY_SCOPES: readonly WorldHistoryScope[] = ["world", "crew", "tile", "crew_tile", "objective", "event"];

export default function EffectsStep({
  draft,
  selectedEffectGroupId,
  onSelectedEffectGroupIdChange,
  onDraftChange,
}: EffectsStepProps) {
  const effectGroups = draft.working_definition.effect_groups ?? [];
  const logTemplates = draft.working_definition.log_templates ?? [];
  const resolvedSelectedGroupId =
    selectedEffectGroupId && effectGroups.some((group) => group.id === selectedEffectGroupId)
      ? selectedEffectGroupId
      : (effectGroups[0]?.id ?? null);
  const missingEffectRefs = collectMissingEffectRefs(draft);

  return (
    <form className="event-effects-step-form" aria-label="Effects and logs fields">
      <fieldset aria-label="Effect refs validation">
        <legend>Effect refs validation</legend>
        {missingEffectRefs.length > 0 ? (
          <ul className="event-authoring-helper-list" aria-label="Effect refs warnings">
            {missingEffectRefs.map((warning) => (
              <li key={`${warning.ref}-${warning.source}`}>
                <strong>Missing effect group</strong>
                <span>
                  <code>{warning.ref}</code> referenced by {warning.source}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-text">All effect_refs resolve to effect groups in this working definition.</p>
        )}
      </fieldset>

      <fieldset aria-label="Effect groups">
        <legend>Effect groups</legend>
        <button type="button" onClick={addEffectGroup}>
          Add effect group
        </button>
        {effectGroups.length > 0 ? (
          <>
            <label>
              Current effect group
              <select
                aria-label="Current effect group"
                value={resolvedSelectedGroupId ?? ""}
                onChange={(event) => onSelectedEffectGroupIdChange(event.target.value || null)}
              >
                {effectGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.id}
                  </option>
                ))}
              </select>
            </label>
            <ol className="event-trigger-condition-list">
              {effectGroups.map((group) => (
                <EffectGroupEditor
                  key={group.id}
                  draft={draft}
                  group={group}
                  isSelected={group.id === resolvedSelectedGroupId}
                  onSelect={() => onSelectedEffectGroupIdChange(group.id)}
                  onDraftChange={onDraftChange}
                />
              ))}
            </ol>
          </>
        ) : (
          <p className="muted-text">No effect groups.</p>
        )}
      </fieldset>

      <fieldset aria-label="Log templates">
        <legend>Log templates</legend>
        <button type="button" onClick={addLogTemplate}>
          Add log template
        </button>
        {logTemplates.length > 0 ? (
          <ol className="event-trigger-condition-list">
            {logTemplates.map((template) => (
              <LogTemplateEditor key={template.id} draft={draft} template={template} onDraftChange={onDraftChange} />
            ))}
          </ol>
        ) : (
          <p className="muted-text">No log templates.</p>
        )}
      </fieldset>

      <fieldset aria-label="Node history writes">
        <legend>Node history writes</legend>
        {getHistoryEditableNodes(draft).length > 0 ? (
          <ol className="event-trigger-condition-list">
            {getHistoryEditableNodes(draft).map((node) => (
              <NodeHistoryEditor key={node.id} draft={draft} node={node} onDraftChange={onDraftChange} />
            ))}
          </ol>
        ) : (
          <p className="muted-text">No graph nodes with history writes.</p>
        )}
      </fieldset>
    </form>
  );

  function addEffectGroup(): void {
    const nextDraft = eventAuthoringReducer(draft, { type: "add_effect_group" });
    const nextEffectGroups = nextDraft.working_definition.effect_groups ?? [];
    const addedGroup = nextEffectGroups[nextEffectGroups.length - 1] ?? null;

    onSelectedEffectGroupIdChange(addedGroup?.id ?? null);
    onDraftChange(nextDraft);
  }

  function addLogTemplate(): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "add_log_template" }));
  }
}

function NodeHistoryEditor({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: EndNode | LogOnlyNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const historyWrites = node.history_writes ?? [];

  return (
    <li>
      <fieldset aria-label={`Node ${node.id} history writes`}>
        <legend>Node {node.id}</legend>
        {node.type === "end" ? (
          <label>
            Final effect refs
            <input
              aria-label={`Node ${node.id} final effect refs`}
              value={formatList(node.final_effect_refs)}
              onChange={(event) => updateEndNode(draft, node.id, { final_effect_refs: parseList(event.target.value) }, onDraftChange)}
            />
          </label>
        ) : null}
        <button type="button" onClick={addHistoryWrite}>
          Add history write
        </button>
        {historyWrites.length > 0 ? (
          <ol className="event-trigger-condition-list">
            {historyWrites.map((historyWrite, index) => (
              <li key={`${historyWrite.key_template}-${index}`}>
                <fieldset aria-label={`Node ${node.id} history write ${index + 1}`}>
                  <legend>History write {index + 1}</legend>
                  <label>
                    Key template
                    <input
                      aria-label={`Node ${node.id} history write ${index + 1} key template`}
                      value={historyWrite.key_template}
                      onChange={(event) => updateHistoryWrite(index, { ...historyWrite, key_template: event.target.value })}
                    />
                  </label>
                  <label>
                    Scope
                    <select
                      aria-label={`Node ${node.id} history write ${index + 1} scope`}
                      value={historyWrite.scope}
                      onChange={(event) =>
                        updateHistoryWrite(index, { ...historyWrite, scope: event.target.value as WorldHistoryScope })
                      }
                    >
                      {WORLD_HISTORY_SCOPES.map((scope) => (
                        <option key={scope} value={scope}>
                          {scope}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Value
                    <input
                      aria-label={`Node ${node.id} history write ${index + 1} value`}
                      value={formatParamValue(historyWrite.value)}
                      onChange={(event) => updateHistoryWrite(index, { ...historyWrite, value: parseParamValue(event.target.value) })}
                    />
                  </label>
                  <button type="button" onClick={() => removeHistoryWrite(index)}>
                    Delete history write
                  </button>
                </fieldset>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted-text">No history writes on this node.</p>
        )}
      </fieldset>
    </li>
  );

  function addHistoryWrite(): void {
    updateHistoryWrites([...historyWrites, { key_template: "TODO_HISTORY_KEY", scope: "event" }]);
  }

  function updateHistoryWrite(index: number, historyWrite: HistoryWrite): void {
    updateHistoryWrites(historyWrites.map((item, itemIndex) => (itemIndex === index ? historyWrite : item)));
  }

  function removeHistoryWrite(index: number): void {
    updateHistoryWrites(historyWrites.filter((_item, itemIndex) => itemIndex !== index));
  }

  function updateHistoryWrites(history_writes: HistoryWrite[]): void {
    if (node.type === "end") {
      updateEndNode(draft, node.id, { history_writes }, onDraftChange);
      return;
    }

    updateLogOnlyNode(draft, node.id, { history_writes }, onDraftChange);
  }
}

function EffectGroupEditor({
  draft,
  group,
  isSelected,
  onSelect,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  group: EffectGroup;
  isSelected: boolean;
  onSelect: () => void;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  return (
    <li>
      <fieldset aria-label={`Effect group ${group.id}`}>
        <legend>
          Effect group {group.id} {isSelected ? "(current)" : ""}
        </legend>
        <button type="button" onClick={onSelect}>
          Select effect group
        </button>
        <label>
          Group id
          <input
            aria-label={`Effect group ${group.id} id`}
            value={group.id}
            onChange={(event) => updateGroup({ id: event.target.value })}
          />
        </label>
        <label>
          Description
          <textarea
            aria-label={`Effect group ${group.id} description`}
            value={group.description ?? ""}
            onChange={(event) => updateGroup({ description: event.target.value })}
          />
        </label>
        <button type="button" onClick={() => removeGroup()}>
          Delete effect group
        </button>

        <div aria-label={`Effects in ${group.id}`}>
          <button type="button" onClick={addEffect}>
            Add effect
          </button>
          {group.effects.length > 0 ? (
            <ol className="event-trigger-condition-list">
              {group.effects.map((effect) => (
                <EffectEditor
                  key={effect.id}
                  draft={draft}
                  groupId={group.id}
                  effect={effect}
                  onDraftChange={onDraftChange}
                />
              ))}
            </ol>
          ) : (
            <p className="muted-text">No effects in this group.</p>
          )}
        </div>
      </fieldset>
    </li>
  );

  function updateGroup(fields: Partial<Pick<EffectGroup, "id" | "description">>): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "update_effect_group", groupId: group.id, fields }));
  }

  function removeGroup(): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "remove_effect_group", groupId: group.id }));
  }

  function addEffect(): void {
    const effectId = createUniqueEffectId(group, "effect");
    onDraftChange(
      eventAuthoringReducer(draft, {
        type: "add_effect",
        groupId: group.id,
        effect: createDefaultEffectTemplate({ type: "set_world_flag", effectId }),
      }),
    );
  }
}

function EffectEditor({
  draft,
  groupId,
  effect,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  groupId: string;
  effect: Effect;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  return (
    <li>
      <fieldset aria-label={`Effect ${effect.id}`}>
        <legend>Effect {effect.id}</legend>
        <label>
          Effect id
          <input
            aria-label={`Effect ${effect.id} id`}
            value={effect.id}
            onChange={(event) => updateEffect({ id: event.target.value })}
          />
        </label>
        <label>
          Type
          <select
            aria-label={`Effect ${effect.id} type`}
            value={effect.type}
            onChange={(event) => updateEffectType(event.target.value as EffectType)}
          >
            {effectCapabilities.map((capability) => (
              <option key={capability.type} value={capability.type}>
                {capability.label}
              </option>
            ))}
          </select>
        </label>
        <TargetEditor effect={effect} onUpdate={updateEffect} />
        <ParamsEditor effect={effect} onUpdate={updateEffect} />
        <label>
          Failure policy
          <select
            aria-label={`Effect ${effect.id} failure policy`}
            value={effect.failure_policy}
            onChange={(event) => updateEffect({ failure_policy: event.target.value as EffectFailurePolicy })}
          >
            {FAILURE_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {policy}
              </option>
            ))}
          </select>
        </label>
        <fieldset aria-label={`Effect ${effect.id} record policy`}>
          <legend>Record policy</legend>
          <label>
            <input
              aria-label={`Effect ${effect.id} write event log`}
              type="checkbox"
              checked={effect.record_policy.write_event_log}
              onChange={(event) =>
                updateEffect({
                  record_policy: {
                    ...effect.record_policy,
                    write_event_log: event.target.checked,
                  },
                })
              }
            />
            Write event log
          </label>
          <label>
            <input
              aria-label={`Effect ${effect.id} write world history`}
              type="checkbox"
              checked={effect.record_policy.write_world_history}
              onChange={(event) =>
                updateEffect({
                  record_policy: {
                    ...effect.record_policy,
                    write_world_history: event.target.checked,
                  },
                })
              }
            />
            Write world history
          </label>
          <label>
            History key template
            <input
              aria-label={`Effect ${effect.id} history key template`}
              value={effect.record_policy.history_key_template ?? ""}
              onChange={(event) =>
                updateEffect({
                  record_policy: {
                    ...effect.record_policy,
                    history_key_template: event.target.value.trim() || null,
                  },
                })
              }
            />
          </label>
        </fieldset>
        <label>
          Handler type
          <select
            aria-label={`Effect ${effect.id} handler type`}
            value={effect.handler_type ?? ""}
            onChange={(event) => updateEffect({ handler_type: event.target.value || null })}
          >
            <option value="">None</option>
            {effectHandlerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={removeEffect}>
          Delete effect
        </button>
      </fieldset>
    </li>
  );

  function updateEffect(fields: Partial<Effect>): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "update_effect", groupId, effectId: effect.id, fields }));
  }

  function updateEffectType(type: EffectType): void {
    const template = getEffectCapability(type).template;
    updateEffect({
      ...template,
      id: effect.id,
    });
  }

  function removeEffect(): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "remove_effect", groupId, effectId: effect.id }));
  }
}

function TargetEditor({ effect, onUpdate }: { effect: Effect; onUpdate: (fields: Partial<Effect>) => void }) {
  return (
    <fieldset aria-label={`Effect ${effect.id} target`}>
      <legend>Target</legend>
      <label>
        Target type
        <select
          aria-label={`Effect ${effect.id} target type`}
          value={effect.target.type}
          onChange={(event) =>
            onUpdate({
              target: {
                ...effect.target,
                type: event.target.value as TargetRef["type"],
              },
            })
          }
        >
          {TARGET_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        Target id
        <input
          aria-label={`Effect ${effect.id} target id`}
          value={effect.target.id ?? ""}
          onChange={(event) =>
            onUpdate({
              target: {
                ...effect.target,
                id: event.target.value.trim() || null,
              },
            })
          }
        />
      </label>
      <label>
        Target ref
        <input
          aria-label={`Effect ${effect.id} target ref`}
          value={effect.target.ref ?? ""}
          onChange={(event) =>
            onUpdate({
              target: {
                ...effect.target,
                ref: event.target.value.trim() || null,
              },
            })
          }
        />
      </label>
    </fieldset>
  );
}

function ParamsEditor({ effect, onUpdate }: { effect: Effect; onUpdate: (fields: Partial<Effect>) => void }) {
  const rows = paramsToRows(effect.params);

  return (
    <fieldset aria-label={`Effect ${effect.id} params`}>
      <legend>Params</legend>
      <button type="button" onClick={() => onUpdate({ params: { ...effect.params, param_key: "" } })}>
        Add param
      </button>
      {rows.length > 0 ? (
        <ol className="event-trigger-condition-list">
          {rows.map((row, index) => (
            <li key={`${row.key}-${index}`}>
              <fieldset aria-label={`Effect ${effect.id} param ${index + 1}`}>
                <legend>Param {index + 1}</legend>
                <label>
                  Key
                  <input
                    aria-label={`Effect ${effect.id} param ${index + 1} key`}
                    value={row.key}
                    onChange={(event) => updateParam(index, { ...row, key: event.target.value })}
                  />
                </label>
                <label>
                  Value
                  <input
                    aria-label={`Effect ${effect.id} param ${index + 1} value`}
                    value={row.value}
                    onChange={(event) => updateParam(index, { ...row, value: event.target.value })}
                  />
                </label>
                <button type="button" onClick={() => removeParam(index)}>
                  Delete param
                </button>
              </fieldset>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted-text">No params.</p>
      )}
    </fieldset>
  );

  function updateParam(index: number, row: ParamRow): void {
    const nextRows = [...rows];
    nextRows[index] = row;
    onUpdate({ params: rowsToParams(nextRows) });
  }

  function removeParam(index: number): void {
    onUpdate({ params: rowsToParams(rows.filter((_row, rowIndex) => rowIndex !== index)) });
  }
}

function LogTemplateEditor({
  draft,
  template,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  template: EventLogTemplate;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  return (
    <li>
      <fieldset aria-label={`Log template ${template.id}`}>
        <legend>Log template {template.id}</legend>
        <label>
          Log template id
          <input
            aria-label={`Log template ${template.id} id`}
            value={template.id}
            onChange={(event) => updateTemplate({ id: event.target.value })}
          />
        </label>
        <label>
          Summary
          <textarea
            aria-label={`Log template ${template.id} summary`}
            value={template.summary}
            onChange={(event) => updateTemplate({ summary: event.target.value })}
          />
        </label>
        <label>
          Importance
          <select
            aria-label={`Log template ${template.id} importance`}
            value={template.importance}
            onChange={(event) => updateTemplate({ importance: event.target.value as EventLogImportance })}
          >
            {LOG_IMPORTANCE.map((importance) => (
              <option key={importance} value={importance}>
                {importance}
              </option>
            ))}
          </select>
        </label>
        <label>
          Visibility
          <select
            aria-label={`Log template ${template.id} visibility`}
            value={template.visibility}
            onChange={(event) => updateTemplate({ visibility: event.target.value as EventLogVisibility })}
          >
            {LOG_VISIBILITY.map((visibility) => (
              <option key={visibility} value={visibility}>
                {visibility}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={removeTemplate}>
          Delete log template
        </button>
      </fieldset>
    </li>
  );

  function updateTemplate(fields: Partial<EventLogTemplate>): void {
    onDraftChange(
      eventAuthoringReducer(draft, {
        type: "update_log_template",
        logTemplateId: template.id,
        fields,
      }),
    );
  }

  function removeTemplate(): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "remove_log_template", logTemplateId: template.id }));
  }
}

function paramsToRows(params: JsonObject): ParamRow[] {
  return Object.entries(params).map(([key, value]) => ({
    key,
    value: formatParamValue(value),
  }));
}

function rowsToParams(rows: readonly ParamRow[]): JsonObject {
  const params: JsonObject = {};

  for (const row of rows) {
    const key = row.key.trim();
    if (key) {
      params[key] = parseParamValue(row.value);
    }
  }

  return params;
}

function formatParamValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function parseParamValue(value: string): unknown {
  const trimmedValue = value.trim();

  if (trimmedValue === "true") {
    return true;
  }
  if (trimmedValue === "false") {
    return false;
  }
  if (trimmedValue === "null") {
    return null;
  }
  if (trimmedValue !== "" && Number.isFinite(Number(trimmedValue))) {
    return Number(trimmedValue);
  }

  return value;
}

function createUniqueEffectId(group: EffectGroup, baseId: string): string {
  let index = 1;
  let candidate = baseId;
  const existingIds = new Set(group.effects.map((effect) => effect.id));

  while (existingIds.has(candidate)) {
    index += 1;
    candidate = `${baseId}_${index}`;
  }

  return candidate;
}

function collectMissingEffectRefs(draft: EventDraftEnvelope): { ref: string; source: string }[] {
  const definedEffectGroupIds = new Set((draft.working_definition.effect_groups ?? []).map((group) => group.id));
  const refs = collectEffectRefs(draft.working_definition.event_graph?.nodes ?? []);
  const seen = new Set<string>();

  return refs.filter(({ ref, source }) => {
    const key = `${ref}:${source}`;
    if (definedEffectGroupIds.has(ref) || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function collectEffectRefs(nodes: readonly EventNode[]): { ref: string; source: string }[] {
  const refs: { ref: string; source: string }[] = [];

  for (const node of nodes) {
    appendRefs(refs, node.enter_effect_refs, `node ${node.id} enter_effect_refs`);
    appendRefs(refs, node.exit_effect_refs, `node ${node.id} exit_effect_refs`);

    switch (node.type) {
      case "call":
        appendRefs(refs, node.on_missed?.effect_refs, `call node ${node.id} on_missed.effect_refs`);
        appendCallOptionRefs(refs, node);
        break;
      case "wait":
        appendRefs(refs, node.on_interrupted?.effect_refs, `wait node ${node.id} on_interrupted.effect_refs`);
        break;
      case "check":
        node.branches.forEach((branch) => appendRefs(refs, branch.effect_refs, `check node ${node.id} branch ${branch.id}`));
        break;
      case "random":
        node.branches.forEach((branch) => appendRefs(refs, branch.effect_refs, `random node ${node.id} branch ${branch.id}`));
        break;
      case "log_only":
        appendRefs(refs, node.effect_refs, `log node ${node.id} effect_refs`);
        break;
      case "end":
        appendRefs(refs, node.final_effect_refs, `end node ${node.id} final_effect_refs`);
        break;
      case "action_request":
      case "objective":
      case "spawn_event":
        break;
    }
  }

  return refs;
}

function appendCallOptionRefs(refs: { ref: string; source: string }[], node: CallNode): void {
  for (const option of node.options) {
    appendRefs(refs, option.effect_refs, `call node ${node.id} option ${option.id}`);
  }
}

function appendRefs(refs: { ref: string; source: string }[], values: readonly string[] | undefined, source: string): void {
  for (const value of values ?? []) {
    if (value.trim()) {
      refs.push({ ref: value, source });
    }
  }
}

function getHistoryEditableNodes(draft: EventDraftEnvelope): Array<EndNode | LogOnlyNode> {
  return (draft.working_definition.event_graph?.nodes ?? []).filter(
    (node): node is EndNode | LogOnlyNode => node.type === "end" || node.type === "log_only",
  );
}

function updateEndNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateEndNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_end_node", nodeId, fields, preserveEditorState: true }));
}

function updateLogOnlyNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateLogOnlyNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_log_only_node", nodeId, fields, preserveEditorState: true }));
}

function formatList(values: readonly string[] | undefined): string {
  return values?.join(", ") ?? "";
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
