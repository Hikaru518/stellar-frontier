import { useEffect, useId, useMemo, useState } from "react";
import type {
  ActionRequestNode,
  CallNode,
  CheckNode,
  Condition,
  EndNode,
  EventGraph,
  EventNode,
  EventNodeType,
  EventTerminalStatus,
  JsonObject,
  LogOnlyNode,
  ObjectiveNode,
  RandomNode,
  SpawnEventNode,
  TargetRef,
  TriggerDefinition,
  TriggerType,
  WaitNode,
} from "../../../../pc-client/src/events/types";
import { analyzeGraphHealth } from "../graphModel";
import type { EventDraftEnvelope } from "../types";
import { conditionCapabilities, getNodeCapability } from "./capabilityCatalog";
import { eventAuthoringReducer, type EventAuthoringAction } from "./eventAuthoringReducer";
import GraphPreviewPanel from "./GraphPreviewPanel";
import { createDefaultGraphRules, isSafeEventId } from "./templates";

interface GraphStructureEditorProps {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}

type EditableGraphNodeType = Extract<
  EventNodeType,
  "call" | "check" | "random" | "action_request" | "objective" | "spawn_event" | "end" | "log_only" | "wait"
>;
type UpdateNodeCommonFields = Extract<EventAuthoringAction, { type: "update_node_common_fields" }>["fields"];
type UpdateEndNodeFields = Extract<EventAuthoringAction, { type: "update_end_node" }>["fields"];
type UpdateLogOnlyNodeFields = Extract<EventAuthoringAction, { type: "update_log_only_node" }>["fields"];
type UpdateWaitNodeFields = Extract<EventAuthoringAction, { type: "update_wait_node" }>["fields"];
type UpdateCallNodeFields = Extract<EventAuthoringAction, { type: "update_call_node" }>["fields"];
type UpdateCallOptionFields = Extract<EventAuthoringAction, { type: "update_call_option" }>["fields"];
type UpdateCheckNodeFields = Extract<EventAuthoringAction, { type: "update_check_node" }>["fields"];
type UpdateRandomNodeFields = Extract<EventAuthoringAction, { type: "update_random_node" }>["fields"];
type UpdateActionRequestNodeFields = Extract<EventAuthoringAction, { type: "update_action_request_node" }>["fields"];
type UpdateObjectiveNodeFields = Extract<EventAuthoringAction, { type: "update_objective_node" }>["fields"];
type UpdateSpawnEventNodeFields = Extract<EventAuthoringAction, { type: "update_spawn_event_node" }>["fields"];

const EDITABLE_GRAPH_NODE_TYPES = [
  "call",
  "check",
  "random",
  "action_request",
  "objective",
  "spawn_event",
  "wait",
  "log_only",
  "end",
] as const satisfies readonly EditableGraphNodeType[];
const TERMINAL_RESOLUTIONS = ["resolved", "cancelled", "expired", "failed"] as const satisfies readonly EventTerminalStatus[];
const WAKE_TRIGGER_TYPES = ["time_wakeup", "event_node_finished"] as const satisfies readonly WaitNode["wake_trigger_type"][];
const INTERRUPT_POLICIES = [
  "not_interruptible",
  "player_can_cancel",
  "event_can_cancel",
] as const satisfies readonly WaitNode["interrupt_policy"][];
const CALL_URGENCIES = ["normal", "urgent", "emergency"] as const satisfies readonly CallNode["urgency"][];
const CALL_DELIVERIES = ["incoming_call", "auto_report", "queued_message"] as const satisfies readonly CallNode["delivery"][];
const ACTION_REQUEST_ACTION_TYPES = [
  "move",
  "survey",
  "gather",
  "build",
  "extract",
  "return_to_base",
  "event_waiting",
  "guarding_event_site",
  "custom_handler_action",
] as const satisfies readonly ActionRequestNode["action_type"][];
const OBJECTIVE_MODES = ["create_and_wait", "create_and_continue"] as const satisfies readonly ObjectiveNode["mode"][];
const SPAWN_POLICIES = ["immediate", "deferred_until_trigger"] as const satisfies readonly SpawnEventNode["spawn_policy"][];
const TRIGGER_TYPES = [
  "arrival",
  "proximity",
  "action_complete",
  "idle_time",
  "call_choice",
  "event_node_finished",
  "objective_created",
  "objective_completed",
  "world_flag_changed",
  "time_wakeup",
] as const satisfies readonly TriggerType[];
const TARGET_REF_TYPES = [
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
] as const satisfies readonly TargetRef["type"][];
const RANDOM_SEED_SCOPES = ["event_instance", "node_entry", "trigger_context"] as const satisfies readonly RandomNode["seed_scope"][];
const CONDITION_TYPES = conditionCapabilities.map((capability) => capability.type) satisfies readonly Condition["type"][];
const COMPARE_OPS = ["equals", "not_equals", "gt", "gte", "lt", "lte", "includes", "not_includes"] as const;

export default function GraphStructureEditor({ draft, onDraftChange }: GraphStructureEditorProps) {
  const graph = readGraph(draft);
  const health = useMemo(() => analyzeGraphHealth(draft.working_definition), [draft.working_definition]);
  const selectedNode = resolveSelectedNode(graph, draft.editor_state.selection);
  const [newNodeType, setNewNodeType] = useState<EditableGraphNodeType>("wait");
  const [newNodeId, setNewNodeId] = useState("");
  const [nodeIdError, setNodeIdError] = useState<string | null>(null);
  const [addNodeError, setAddNodeError] = useState<string | null>(null);

  return (
    <div className="event-graph-structure-editor">
      <section aria-labelledby="graph-structure-heading">
        <div className="event-authoring-section-heading">
          <div>
            <h3 id="graph-structure-heading">Graph Structure Editor</h3>
            <p className="muted-text">Structured node list and fields. The preview remains read-only.</p>
          </div>
          <span className={health.status === "healthy" ? "status-tag status-success" : "status-tag status-warning"}>
            {health.status}
          </span>
        </div>

        <GraphHealthPanel health={health} />

        <form aria-label="Add graph node" className="event-create-draft-form" onSubmit={handleAddNode}>
          <label>
            Node type
            <select
              aria-label="Node type"
              value={newNodeType}
              onChange={(event) => setNewNodeType(event.target.value as EditableGraphNodeType)}
            >
              {EDITABLE_GRAPH_NODE_TYPES.map((nodeType) => (
                <option key={nodeType} value={nodeType}>
                  {getNodeCapability(nodeType).label}
                </option>
              ))}
            </select>
          </label>
          <label>
            New node id
            <input
              aria-label="New node id"
              value={newNodeId}
              aria-invalid={Boolean(addNodeError)}
              onChange={(event) => {
                setNewNodeId(event.target.value);
                setAddNodeError(null);
              }}
              placeholder={suggestNodeId(graph, newNodeType)}
            />
          </label>
          {addNodeError ? (
            <span role="alert" className="map-form-errors">
              {addNodeError}
            </span>
          ) : null}
          <button type="submit">
            Add node
          </button>
        </form>

        <div className="event-authoring-shell">
          <section aria-labelledby="graph-node-list-heading">
            <div className="graph-section-heading">
              <h4 id="graph-node-list-heading">Nodes</h4>
              <span className="status-tag status-muted">{graph.nodes.length}</span>
            </div>
            {graph.nodes.length > 0 ? (
              <ul className="event-authoring-helper-list" aria-label="Graph structure nodes">
                {graph.nodes.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      aria-label={`Select node ${node.id}`}
                      aria-pressed={selectedNode?.id === node.id}
                      className={selectedNode?.id === node.id ? "event-authoring-step event-authoring-step-active" : "event-authoring-step"}
                      onClick={() => selectNode(node.id)}
                    >
                      <code>{node.id}</code>
                    </button>
                    <span>
                      {getNodeCapability(node.type).label} · {node.title}
                    </span>
                    <button type="button" aria-label={`Delete node ${node.id}`} onClick={() => deleteNode(node.id)}>
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted-text">No nodes are available yet. Add the first node to initialize event_graph.</p>
            )}
          </section>

          <section aria-labelledby="graph-node-fields-heading">
            <div className="graph-section-heading">
              <h4 id="graph-node-fields-heading">Selected Node</h4>
              <span className="status-tag status-muted">{selectedNode?.type ?? "none"}</span>
            </div>
            {selectedNode ? (
              <form aria-label="Selected graph node fields" className="event-create-draft-form">
                <CommonNodeFields
                  graph={graph}
                  node={selectedNode}
                  nodeIdError={nodeIdError}
                  onNodeIdError={setNodeIdError}
                  onUpdate={(fields) =>
                    onDraftChange(
                      eventAuthoringReducer(draft, {
                        type: "update_node_common_fields",
                        nodeId: selectedNode.id,
                        fields,
                      }),
                    )
                  }
                />
                <TypedNodeFields draft={draft} node={selectedNode} onDraftChange={onDraftChange} />
              </form>
            ) : (
              <p className="muted-text">Select or add a node to edit its fields.</p>
            )}
          </section>
        </div>
      </section>

      <section aria-label="Graph structure preview">
        <GraphPreviewPanel draft={draft} />
      </section>
    </div>
  );

  function handleAddNode(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const requestedNodeId = newNodeId.trim();
    const validationError = requestedNodeId ? validateNodeId(graph, requestedNodeId) : null;

    if (validationError) {
      setAddNodeError(validationError);
      return;
    }

    setAddNodeError(null);
    const nextDraft = eventAuthoringReducer(draft, {
      type: "add_node",
      nodeType: newNodeType,
      nodeId: requestedNodeId || undefined,
    });

    setNewNodeId("");
    onDraftChange(nextDraft);
  }

  function selectNode(nodeId: string): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "select_node", nodeId }));
  }

  function deleteNode(nodeId: string): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "delete_node", nodeId }));
  }
}

function GraphHealthPanel({ health }: { health: ReturnType<typeof analyzeGraphHealth> }) {
  const issues = dedupeGraphHealthIssues(health.issues);

  return (
    <section aria-labelledby="graph-structure-health-heading">
      <div className="graph-section-heading">
        <h4 id="graph-structure-health-heading">Graph Structure Health</h4>
        <span className={issues.length === 0 ? "status-tag status-success" : "status-tag status-warning"}>
          {issues.length} warnings
        </span>
      </div>
      {issues.length === 0 ? (
        <p className="muted-text">No structural warnings.</p>
      ) : (
        <ul className="event-authoring-helper-list" aria-label="Graph structure health issues">
          {issues.map((issue, index) => (
            <li key={`${issue.code}:${issue.message}:${index}`}>
              <strong>{issue.code}</strong>
              <span>{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommonNodeFields({
  graph,
  node,
  nodeIdError,
  onNodeIdError,
  onUpdate,
}: {
  graph: EventGraph;
  node: EventNode;
  nodeIdError: string | null;
  onNodeIdError: (message: string | null) => void;
  onUpdate: (fields: UpdateNodeCommonFields) => void;
}) {
  return (
    <fieldset aria-label="Common node fields">
      <legend>Common node fields</legend>
      <label>
        Node id
        <input
          aria-label="Node id"
          value={node.id}
          aria-invalid={Boolean(nodeIdError)}
          onChange={(event) => {
            const nextNodeId = event.target.value.trim();
            const validationError = validateNodeId(graph, nextNodeId, node.id);
            if (validationError) {
              onNodeIdError(validationError);
              return;
            }

            onNodeIdError(null);
            onUpdate({ id: nextNodeId });
          }}
        />
        {nodeIdError ? (
          <span role="alert" className="map-form-errors">
            {nodeIdError}
          </span>
        ) : null}
      </label>
      <label>
        Title
        <input aria-label="Title" value={node.title} onChange={(event) => onUpdate({ title: event.target.value })} />
      </label>
      <label>
        Description
        <textarea
          aria-label="Description"
          value={node.description ?? ""}
          onChange={(event) => onUpdate({ description: event.target.value.trim() || undefined })}
        />
      </label>
      <label>
        <input
          aria-label="Occupies crew action"
          type="checkbox"
          checked={node.blocking.occupies_crew_action}
          onChange={(event) => onUpdate({ blocking: { occupies_crew_action: event.target.checked } })}
        />
        Occupies crew action
      </label>
      <label>
        <input
          aria-label="Occupies communication"
          type="checkbox"
          checked={node.blocking.occupies_communication}
          onChange={(event) => onUpdate({ blocking: { occupies_communication: event.target.checked } })}
        />
        Occupies communication
      </label>
      <label>
        Blocking key template
        <input
          aria-label="Blocking key template"
          value={node.blocking.blocking_key_template ?? ""}
          onChange={(event) => onUpdate({ blocking: { blocking_key_template: event.target.value.trim() || null } })}
        />
      </label>
      <label>
        Enter effect refs
        <input
          aria-label="Enter effect refs"
          value={formatList(node.enter_effect_refs)}
          onChange={(event) => onUpdate({ enter_effect_refs: parseList(event.target.value) })}
        />
      </label>
      <label>
        Exit effect refs
        <input
          aria-label="Exit effect refs"
          value={formatList(node.exit_effect_refs)}
          onChange={(event) => onUpdate({ exit_effect_refs: parseList(event.target.value) })}
        />
      </label>
      <label>
        Auto next node id
        <input
          aria-label="Auto next node id"
          value={node.auto_next_node_id ?? ""}
          onChange={(event) => onUpdate({ auto_next_node_id: event.target.value.trim() || undefined })}
        />
      </label>
    </fieldset>
  );
}

function TypedNodeFields({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: EventNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  if (node.type === "end") {
    return <EndNodeFields draft={draft} node={node} onDraftChange={onDraftChange} />;
  }
  if (node.type === "log_only") {
    return <LogOnlyNodeFields draft={draft} node={node} onDraftChange={onDraftChange} />;
  }
  if (node.type === "wait") {
    return <WaitNodeFields draft={draft} node={node} onDraftChange={onDraftChange} />;
  }
  if (node.type === "call") {
    return <CallNodeFields draft={draft} node={node} onDraftChange={onDraftChange} />;
  }
  if (node.type === "check") {
    return <CheckNodeFields draft={draft} node={node} onDraftChange={onDraftChange} />;
  }
  if (node.type === "random") {
    return <RandomNodeFields draft={draft} node={node} onDraftChange={onDraftChange} />;
  }
  if (node.type === "action_request") {
    return <ActionRequestNodeFields draft={draft} node={node} onDraftChange={onDraftChange} />;
  }
  if (node.type === "objective") {
    return <ObjectiveNodeFields draft={draft} node={node} onDraftChange={onDraftChange} />;
  }
  if (node.type === "spawn_event") {
    return <SpawnEventNodeFields draft={draft} node={node} onDraftChange={onDraftChange} />;
  }

  return null;
}

function EndNodeFields({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: EndNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  return (
    <fieldset aria-label="End node fields">
      <legend>End node fields</legend>
      <label>
        Resolution
        <select
          aria-label="Resolution"
          value={node.resolution}
          onChange={(event) => updateEndNode(draft, node.id, { resolution: event.target.value as EventTerminalStatus }, onDraftChange)}
        >
          {TERMINAL_RESOLUTIONS.map((resolution) => (
            <option key={resolution} value={resolution}>
              {resolution}
            </option>
          ))}
        </select>
      </label>
      <label>
        Result key
        <input
          aria-label="Result key"
          value={node.result_key}
          onChange={(event) => updateEndNode(draft, node.id, { result_key: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Event log template id
        <input
          aria-label="Event log template id"
          value={node.event_log_template_id}
          onChange={(event) => updateEndNode(draft, node.id, { event_log_template_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        <input
          aria-label="Release blocking claims"
          type="checkbox"
          checked={node.cleanup_policy.release_blocking_claims}
          onChange={(event) =>
            updateEndNode(draft, node.id, { cleanup_policy: { release_blocking_claims: event.target.checked } }, onDraftChange)
          }
        />
        Release blocking claims
      </label>
      <label>
        <input
          aria-label="Delete active calls"
          type="checkbox"
          checked={node.cleanup_policy.delete_active_calls}
          onChange={(event) =>
            updateEndNode(draft, node.id, { cleanup_policy: { delete_active_calls: event.target.checked } }, onDraftChange)
          }
        />
        Delete active calls
      </label>
      <label>
        <input
          aria-label="Keep player summary"
          type="checkbox"
          checked={node.cleanup_policy.keep_player_summary}
          onChange={(event) =>
            updateEndNode(draft, node.id, { cleanup_policy: { keep_player_summary: event.target.checked } }, onDraftChange)
          }
        />
        Keep player summary
      </label>
    </fieldset>
  );
}

function LogOnlyNodeFields({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: LogOnlyNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  return (
    <fieldset aria-label="Log only node fields">
      <legend>Log only node fields</legend>
      <label>
        Event log template id
        <input
          aria-label="Event log template id"
          value={node.event_log_template_id}
          onChange={(event) => updateLogOnlyNode(draft, node.id, { event_log_template_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Effect refs
        <input
          aria-label="Effect refs"
          value={formatList(node.effect_refs)}
          onChange={(event) => updateLogOnlyNode(draft, node.id, { effect_refs: parseList(event.target.value) }, onDraftChange)}
        />
      </label>
      <label>
        Next node id
        <input
          aria-label="Next node id"
          value={node.next_node_id}
          onChange={(event) => updateLogOnlyNode(draft, node.id, { next_node_id: event.target.value }, onDraftChange)}
        />
      </label>
    </fieldset>
  );
}

function WaitNodeFields({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: WaitNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  return (
    <fieldset aria-label="Wait node fields">
      <legend>Wait node fields</legend>
      <label>
        Duration seconds
        <input
          aria-label="Duration seconds"
          inputMode="decimal"
          value={node.duration_seconds}
          onChange={(event) => {
            const durationSeconds = Number(event.target.value);
            if (Number.isFinite(durationSeconds) && durationSeconds >= 0) {
              updateWaitNode(draft, node.id, { duration_seconds: durationSeconds }, onDraftChange);
            }
          }}
        />
      </label>
      <label>
        Wake trigger type
        <select
          aria-label="Wake trigger type"
          value={node.wake_trigger_type}
          onChange={(event) =>
            updateWaitNode(draft, node.id, { wake_trigger_type: event.target.value as WaitNode["wake_trigger_type"] }, onDraftChange)
          }
        >
          {WAKE_TRIGGER_TYPES.map((wakeTriggerType) => (
            <option key={wakeTriggerType} value={wakeTriggerType}>
              {wakeTriggerType}
            </option>
          ))}
        </select>
      </label>
      <label>
        Next node id
        <input
          aria-label="Next node id"
          value={node.next_node_id}
          onChange={(event) => updateWaitNode(draft, node.id, { next_node_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Interrupt policy
        <select
          aria-label="Interrupt policy"
          value={node.interrupt_policy}
          onChange={(event) =>
            updateWaitNode(draft, node.id, { interrupt_policy: event.target.value as WaitNode["interrupt_policy"] }, onDraftChange)
          }
        >
          {INTERRUPT_POLICIES.map((interruptPolicy) => (
            <option key={interruptPolicy} value={interruptPolicy}>
              {interruptPolicy}
            </option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}

function CallNodeFields({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: CallNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const [newOptionId, setNewOptionId] = useState("");
  const [newOptionNextNodeId, setNewOptionNextNodeId] = useState("");
  const [newOptionError, setNewOptionError] = useState<string | null>(null);
  const [optionIdErrors, setOptionIdErrors] = useState<Record<string, string | null>>({});

  return (
    <fieldset aria-label="Call node fields">
      <legend>Call node fields</legend>
      <label>
        Speaker type
        <select
          aria-label="Speaker type"
          value={node.speaker_crew_ref.type}
          onChange={(event) =>
            updateCallNode(
              draft,
              node.id,
              { speaker_crew_ref: normalizeTargetRef({ ...node.speaker_crew_ref, type: event.target.value as TargetRef["type"] }) },
              onDraftChange,
            )
          }
        >
          {TARGET_REF_TYPES.map((targetType) => (
            <option key={targetType} value={targetType}>
              {targetType}
            </option>
          ))}
        </select>
      </label>
      <label>
        Speaker id
        <input
          aria-label="Speaker id"
          value={node.speaker_crew_ref.id ?? ""}
          onChange={(event) =>
            updateCallNode(
              draft,
              node.id,
              { speaker_crew_ref: normalizeTargetRef({ ...node.speaker_crew_ref, id: event.target.value }) },
              onDraftChange,
            )
          }
        />
      </label>
      <label>
        Speaker ref
        <input
          aria-label="Speaker ref"
          value={node.speaker_crew_ref.ref ?? ""}
          onChange={(event) =>
            updateCallNode(
              draft,
              node.id,
              { speaker_crew_ref: normalizeTargetRef({ ...node.speaker_crew_ref, ref: event.target.value }) },
              onDraftChange,
            )
          }
        />
      </label>
      <label>
        Urgency
        <select
          aria-label="Urgency"
          value={node.urgency}
          onChange={(event) => updateCallNode(draft, node.id, { urgency: event.target.value as CallNode["urgency"] }, onDraftChange)}
        >
          {CALL_URGENCIES.map((urgency) => (
            <option key={urgency} value={urgency}>
              {urgency}
            </option>
          ))}
        </select>
      </label>
      <label>
        Delivery
        <select
          aria-label="Delivery"
          value={node.delivery}
          onChange={(event) => updateCallNode(draft, node.id, { delivery: event.target.value as CallNode["delivery"] }, onDraftChange)}
        >
          {CALL_DELIVERIES.map((delivery) => (
            <option key={delivery} value={delivery}>
              {delivery}
            </option>
          ))}
        </select>
      </label>
      <label>
        Expires in seconds
        <input
          aria-label="Expires in seconds"
          inputMode="decimal"
          value={formatNullableNumber(node.expires_in_seconds)}
          onChange={(event) => {
            const value = event.target.value.trim();
            if (!value) {
              updateCallNode(draft, node.id, { expires_in_seconds: null }, onDraftChange);
              return;
            }

            const expiresInSeconds = Number(value);
            if (Number.isFinite(expiresInSeconds) && expiresInSeconds >= 0) {
              updateCallNode(draft, node.id, { expires_in_seconds: expiresInSeconds }, onDraftChange);
            }
          }}
        />
      </label>
      <label>
        On missed next node id
        <input
          aria-label="On missed next node id"
          value={node.on_missed?.next_node_id ?? ""}
          onChange={(event) => updateCallMissed(draft, node, { next_node_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        On missed effect refs
        <input
          aria-label="On missed effect refs"
          value={formatList(node.on_missed?.effect_refs)}
          onChange={(event) => updateCallMissed(draft, node, { effect_refs: parseList(event.target.value) }, onDraftChange)}
        />
      </label>

      <section aria-label="Call options">
        <div className="graph-section-heading">
          <h4>Call Options</h4>
          <span className="status-tag status-muted">{node.options.length}</span>
        </div>
        {node.options.map((option) => (
          <fieldset key={option.id} aria-label={`Call option ${option.id}`}>
            <legend>Option {option.id}</legend>
            <label>
              Option id
              <input
                aria-label={`Option ${option.id} id`}
                value={option.id}
                aria-invalid={Boolean(optionIdErrors[option.id])}
                onChange={(event) => renameOption(option.id, event.target.value)}
              />
              <FieldError id={`call-option-${option.id}-error`} message={optionIdErrors[option.id] ?? null} />
            </label>
            <label>
              Next node id
              <input
                aria-label={`Option ${option.id} next node id`}
                value={node.option_node_mapping[option.id] ?? ""}
                onChange={(event) =>
                  updateCallOption(draft, node.id, option.id, { next_node_id: event.target.value }, onDraftChange)
                }
              />
            </label>
            <label>
              Effect refs
              <input
                aria-label={`Option ${option.id} effect refs`}
                value={formatList(option.effect_refs)}
                onChange={(event) =>
                  updateCallOption(draft, node.id, option.id, { effect_refs: parseList(event.target.value) }, onDraftChange)
                }
              />
            </label>
            <button type="button" aria-label={`Delete option ${option.id}`} onClick={() => removeOption(option.id)}>
              Delete option
            </button>
          </fieldset>
        ))}
        <fieldset aria-label="Add call option">
          <legend>Add call option</legend>
          <label>
            New option id
            <input
              aria-label="New option id"
              value={newOptionId}
              aria-invalid={Boolean(newOptionError)}
              onChange={(event) => {
                setNewOptionId(event.target.value);
                setNewOptionError(null);
              }}
            />
          </label>
          <label>
            New option next node id
            <input
              aria-label="New option next node id"
              value={newOptionNextNodeId}
              onChange={(event) => setNewOptionNextNodeId(event.target.value)}
            />
          </label>
          <FieldError id="new-call-option-error" message={newOptionError} />
          <button type="button" onClick={addOption}>
            Add option
          </button>
        </fieldset>
      </section>
    </fieldset>
  );

  function addOption(): void {
    const optionId = newOptionId.trim();
    const validationError = validateChildId(node.options.map((option) => option.id), optionId, "Option id");

    if (validationError) {
      setNewOptionError(validationError);
      return;
    }

    setNewOptionError(null);
    setNewOptionId("");
    setNewOptionNextNodeId("");
    onDraftChange(
      eventAuthoringReducer(draft, {
        type: "add_call_option",
        nodeId: node.id,
        optionId,
        nextNodeId: newOptionNextNodeId.trim() || undefined,
      }),
    );
  }

  function renameOption(fromOptionId: string, nextOptionIdValue: string): void {
    const toOptionId = nextOptionIdValue.trim();
    const validationError = validateChildId(
      node.options.map((option) => option.id),
      toOptionId,
      "Option id",
      fromOptionId,
    );

    if (validationError) {
      setOptionIdErrors((current) => ({ ...current, [fromOptionId]: validationError }));
      return;
    }

    setOptionIdErrors((current) => ({ ...current, [fromOptionId]: null }));
    onDraftChange(
      eventAuthoringReducer(draft, {
        type: "rename_call_option",
        nodeId: node.id,
        fromOptionId,
        toOptionId,
      }),
    );
  }

  function removeOption(optionId: string): void {
    onDraftChange(eventAuthoringReducer(draft, { type: "remove_call_option", nodeId: node.id, optionId }));
  }
}

function CheckNodeFields({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: CheckNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const [newBranchId, setNewBranchId] = useState("");
  const [newBranchError, setNewBranchError] = useState<string | null>(null);
  const [branchIdErrors, setBranchIdErrors] = useState<Record<string, string | null>>({});

  return (
    <fieldset aria-label="Check node fields">
      <legend>Check node fields</legend>
      <label>
        Check default next node id
        <input
          aria-label="Check default next node id"
          value={node.default_next_node_id}
          onChange={(event) => updateCheckNode(draft, node.id, { default_next_node_id: event.target.value }, onDraftChange)}
        />
      </label>
      {node.branches.map((branch, index) => (
        <fieldset key={branch.id} aria-label={`Check branch ${branch.id}`}>
          <legend>Branch {branch.id}</legend>
          <label>
            Branch id
            <input
              aria-label={`Check branch ${branch.id} id`}
              value={branch.id}
              aria-invalid={Boolean(branchIdErrors[branch.id])}
              onChange={(event) => renameCheckBranch(index, branch.id, event.target.value)}
            />
            <FieldError id={`check-branch-${branch.id}-error`} message={branchIdErrors[branch.id] ?? null} />
          </label>
          <ConditionsArrayEditor
            label={`Check branch ${branch.id} conditions JSON`}
            conditions={branch.conditions}
            onUpdate={(conditions) => updateCheckBranch(index, { conditions })}
          />
          <label>
            Next node id
            <input
              aria-label={`Check branch ${branch.id} next node id`}
              value={branch.next_node_id}
              onChange={(event) => updateCheckBranch(index, { next_node_id: event.target.value })}
            />
          </label>
          <label>
            Effect refs
            <input
              aria-label={`Check branch ${branch.id} effect refs`}
              value={formatList(branch.effect_refs)}
              onChange={(event) => updateCheckBranch(index, { effect_refs: parseList(event.target.value) })}
            />
          </label>
          <button type="button" aria-label={`Delete check branch ${branch.id}`} onClick={() => removeCheckBranch(index)}>
            Delete branch
          </button>
        </fieldset>
      ))}
      <fieldset aria-label="Add check branch">
        <legend>Add check branch</legend>
        <label>
          New check branch id
          <input
            aria-label="New check branch id"
            value={newBranchId}
            aria-invalid={Boolean(newBranchError)}
            onChange={(event) => {
              setNewBranchId(event.target.value);
              setNewBranchError(null);
            }}
          />
        </label>
        <FieldError id="new-check-branch-error" message={newBranchError} />
        <button type="button" onClick={addCheckBranch}>
          Add check branch
        </button>
      </fieldset>
    </fieldset>
  );

  function updateCheckBranch(index: number, fields: Partial<CheckNode["branches"][number]>): void {
    const branches = node.branches.map((branch, branchIndex) => (branchIndex === index ? { ...branch, ...fields } : branch));
    updateCheckNode(draft, node.id, { branches }, onDraftChange);
  }

  function renameCheckBranch(index: number, fromBranchId: string, value: string): void {
    const branchId = value.trim();
    const validationError = validateChildId(
      node.branches.map((branch) => branch.id),
      branchId,
      "Branch id",
      fromBranchId,
    );

    if (validationError) {
      setBranchIdErrors((current) => ({ ...current, [fromBranchId]: validationError }));
      return;
    }

    setBranchIdErrors((current) => ({ ...current, [fromBranchId]: null }));
    updateCheckBranch(index, { id: branchId });
  }

  function addCheckBranch(): void {
    const branchId = newBranchId.trim();
    const validationError = validateChildId(node.branches.map((branch) => branch.id), branchId, "Branch id");

    if (validationError) {
      setNewBranchError(validationError);
      return;
    }

    setNewBranchError(null);
    setNewBranchId("");
    updateCheckNode(
      draft,
      node.id,
      {
        branches: [...node.branches, { id: branchId, conditions: [], next_node_id: node.default_next_node_id }],
      },
      onDraftChange,
    );
  }

  function removeCheckBranch(index: number): void {
    updateCheckNode(draft, node.id, { branches: node.branches.filter((_branch, branchIndex) => branchIndex !== index) }, onDraftChange);
  }
}

function RandomNodeFields({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: RandomNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const [newBranchId, setNewBranchId] = useState("");
  const [newBranchError, setNewBranchError] = useState<string | null>(null);
  const [branchIdErrors, setBranchIdErrors] = useState<Record<string, string | null>>({});

  return (
    <fieldset aria-label="Random node fields">
      <legend>Random node fields</legend>
      <label>
        Seed scope
        <select
          aria-label="Seed scope"
          value={node.seed_scope}
          onChange={(event) =>
            updateRandomNode(draft, node.id, { seed_scope: event.target.value as RandomNode["seed_scope"] }, onDraftChange)
          }
        >
          {RANDOM_SEED_SCOPES.map((seedScope) => (
            <option key={seedScope} value={seedScope}>
              {seedScope}
            </option>
          ))}
        </select>
      </label>
      <label>
        Random default next node id
        <input
          aria-label="Random default next node id"
          value={node.default_next_node_id ?? ""}
          onChange={(event) => updateRandomNode(draft, node.id, { default_next_node_id: event.target.value || null }, onDraftChange)}
        />
      </label>
      <label>
        Store result as
        <input
          aria-label="Store result as"
          value={node.store_result_as}
          onChange={(event) => updateRandomNode(draft, node.id, { store_result_as: event.target.value }, onDraftChange)}
        />
      </label>
      {node.branches.map((branch, index) => (
        <fieldset key={branch.id} aria-label={`Random branch ${branch.id}`}>
          <legend>Branch {branch.id}</legend>
          <label>
            Branch id
            <input
              aria-label={`Random branch ${branch.id} id`}
              value={branch.id}
              aria-invalid={Boolean(branchIdErrors[branch.id])}
              onChange={(event) => renameRandomBranch(index, branch.id, event.target.value)}
            />
            <FieldError id={`random-branch-${branch.id}-error`} message={branchIdErrors[branch.id] ?? null} />
          </label>
          <label>
            Weight
            <input
              aria-label={`Random branch ${branch.id} weight`}
              inputMode="decimal"
              value={branch.weight}
              onChange={(event) => {
                const weight = Number(event.target.value);
                if (Number.isFinite(weight) && weight >= 0) {
                  updateRandomBranch(index, { weight });
                }
              }}
            />
          </label>
          <ConditionsArrayEditor
            label={`Random branch ${branch.id} conditions JSON`}
            conditions={branch.conditions ?? []}
            onUpdate={(conditions) => updateRandomBranch(index, { conditions })}
          />
          <label>
            Next node id
            <input
              aria-label={`Random branch ${branch.id} next node id`}
              value={branch.next_node_id}
              onChange={(event) => updateRandomBranch(index, { next_node_id: event.target.value })}
            />
          </label>
          <label>
            Effect refs
            <input
              aria-label={`Random branch ${branch.id} effect refs`}
              value={formatList(branch.effect_refs)}
              onChange={(event) => updateRandomBranch(index, { effect_refs: parseList(event.target.value) })}
            />
          </label>
          <button type="button" aria-label={`Delete random branch ${branch.id}`} onClick={() => removeRandomBranch(index)}>
            Delete branch
          </button>
        </fieldset>
      ))}
      <fieldset aria-label="Add random branch">
        <legend>Add random branch</legend>
        <label>
          New random branch id
          <input
            aria-label="New random branch id"
            value={newBranchId}
            aria-invalid={Boolean(newBranchError)}
            onChange={(event) => {
              setNewBranchId(event.target.value);
              setNewBranchError(null);
            }}
          />
        </label>
        <FieldError id="new-random-branch-error" message={newBranchError} />
        <button type="button" onClick={addRandomBranch}>
          Add random branch
        </button>
      </fieldset>
    </fieldset>
  );

  function updateRandomBranch(index: number, fields: Partial<RandomNode["branches"][number]>): void {
    const branches = node.branches.map((branch, branchIndex) => (branchIndex === index ? { ...branch, ...fields } : branch));
    updateRandomNode(draft, node.id, { branches }, onDraftChange);
  }

  function renameRandomBranch(index: number, fromBranchId: string, value: string): void {
    const branchId = value.trim();
    const validationError = validateChildId(
      node.branches.map((branch) => branch.id),
      branchId,
      "Branch id",
      fromBranchId,
    );

    if (validationError) {
      setBranchIdErrors((current) => ({ ...current, [fromBranchId]: validationError }));
      return;
    }

    setBranchIdErrors((current) => ({ ...current, [fromBranchId]: null }));
    updateRandomBranch(index, { id: branchId });
  }

  function addRandomBranch(): void {
    const branchId = newBranchId.trim();
    const validationError = validateChildId(node.branches.map((branch) => branch.id), branchId, "Branch id");

    if (validationError) {
      setNewBranchError(validationError);
      return;
    }

    setNewBranchError(null);
    setNewBranchId("");
    updateRandomNode(
      draft,
      node.id,
      {
        branches: [...node.branches, { id: branchId, weight: 1, next_node_id: node.default_next_node_id ?? "" }],
      },
      onDraftChange,
    );
  }

  function removeRandomBranch(index: number): void {
    updateRandomNode(draft, node.id, { branches: node.branches.filter((_branch, branchIndex) => branchIndex !== index) }, onDraftChange);
  }
}

function ActionRequestNodeFields({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: ActionRequestNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  return (
    <fieldset aria-label="Action request node fields">
      <legend>Action request node fields</legend>
      <RequiredTransitionWarnings
        transitions={[
          { label: "Completed node id", value: node.on_completed_node_id },
          { label: "Failed node id", value: node.on_failed_node_id },
        ]}
      />
      <label>
        Request id
        <input
          aria-label="Request id"
          value={node.request_id}
          onChange={(event) => updateActionRequestNode(draft, node.id, { request_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Action type
        <select
          aria-label="Action type"
          value={node.action_type}
          onChange={(event) =>
            updateActionRequestNode(
              draft,
              node.id,
              { action_type: event.target.value as ActionRequestNode["action_type"] },
              onDraftChange,
            )
          }
        >
          {renderOptionsWithCurrent(ACTION_REQUEST_ACTION_TYPES, node.action_type)}
        </select>
      </label>
      <TargetRefFields
        label="Target crew"
        value={node.target_crew_ref}
        onUpdate={(target_crew_ref) => updateActionRequestNode(draft, node.id, { target_crew_ref }, onDraftChange)}
      />
      <TargetRefFields
        label="Target tile"
        value={node.target_tile_ref ?? { type: "event_tile" }}
        onUpdate={(target_tile_ref) => updateActionRequestNode(draft, node.id, { target_tile_ref }, onDraftChange)}
        onClear={() => updateActionRequestNode(draft, node.id, { target_tile_ref: null }, onDraftChange)}
      />
      <KeyValueObjectEditor
        label="Action params"
        value={node.action_params}
        onUpdate={(action_params) => updateActionRequestNode(draft, node.id, { action_params }, onDraftChange)}
      />
      <StructuredConditionsEditor
        label="Acceptance conditions"
        conditions={node.acceptance_conditions ?? []}
        onUpdate={(acceptance_conditions) =>
          updateActionRequestNode(draft, node.id, { acceptance_conditions }, onDraftChange)
        }
      />
      <TriggerDefinitionFields
        label="Completion trigger"
        trigger={node.completion_trigger}
        onUpdate={(completion_trigger) => updateActionRequestNode(draft, node.id, { completion_trigger }, onDraftChange)}
      />
      <label>
        Accepted node id
        <input
          aria-label="Accepted node id"
          value={node.on_accepted_node_id ?? ""}
          onChange={(event) => updateActionRequestNode(draft, node.id, { on_accepted_node_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Completed node id
        <input
          aria-label="Completed node id"
          value={node.on_completed_node_id}
          onChange={(event) => updateActionRequestNode(draft, node.id, { on_completed_node_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Failed node id
        <input
          aria-label="Failed node id"
          value={node.on_failed_node_id}
          onChange={(event) => updateActionRequestNode(draft, node.id, { on_failed_node_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Expires in seconds
        <input
          aria-label="Action request expires in seconds"
          inputMode="decimal"
          value={formatNullableNumber(node.expires_in_seconds)}
          onChange={(event) => {
            const expiresInSeconds = parseOptionalNonNegativeNumber(event.target.value);
            if (expiresInSeconds !== undefined) {
              updateActionRequestNode(draft, node.id, { expires_in_seconds: expiresInSeconds }, onDraftChange);
            }
          }}
        />
      </label>
      <label>
        <input
          aria-label="Occupies crew action request"
          type="checkbox"
          checked={node.occupies_crew_action}
          onChange={(event) => updateActionRequestNode(draft, node.id, { occupies_crew_action: event.target.checked }, onDraftChange)}
        />
        Occupies crew action
      </label>
    </fieldset>
  );
}

function ObjectiveNodeFields({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: ObjectiveNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const template = node.objective_template;

  return (
    <fieldset aria-label="Objective node fields">
      <legend>Objective node fields</legend>
      <RequiredTransitionWarnings transitions={[{ label: "Completed node id", value: node.on_completed_node_id }]} />
      <label>
        Objective title
        <input
          aria-label="Objective title"
          value={template.title}
          onChange={(event) =>
            updateObjectiveNode(draft, node.id, { objective_template: { title: event.target.value } }, onDraftChange)
          }
        />
      </label>
      <label>
        Objective summary
        <textarea
          aria-label="Objective summary"
          value={template.summary}
          onChange={(event) =>
            updateObjectiveNode(draft, node.id, { objective_template: { summary: event.target.value } }, onDraftChange)
          }
        />
      </label>
      <TargetRefFields
        label="Objective target tile"
        value={template.target_tile_ref ?? { type: "event_tile" }}
        onUpdate={(target_tile_ref) =>
          updateObjectiveNode(draft, node.id, { objective_template: { target_tile_ref } }, onDraftChange)
        }
        onClear={() => updateObjectiveNode(draft, node.id, { objective_template: { target_tile_ref: null } }, onDraftChange)}
      />
      <StructuredConditionsEditor
        label="Eligible crew conditions"
        conditions={template.eligible_crew_conditions ?? []}
        onUpdate={(eligible_crew_conditions) =>
          updateObjectiveNode(draft, node.id, { objective_template: { eligible_crew_conditions } }, onDraftChange)
        }
      />
      <label>
        Required action type
        <select
          aria-label="Required action type"
          value={template.required_action_type}
          onChange={(event) =>
            updateObjectiveNode(
              draft,
              node.id,
              { objective_template: { required_action_type: event.target.value } },
              onDraftChange,
            )
          }
        >
          {renderOptionsWithCurrent(ACTION_REQUEST_ACTION_TYPES, template.required_action_type)}
        </select>
      </label>
      <KeyValueObjectEditor
        label="Required action params"
        value={template.required_action_params}
        onUpdate={(required_action_params) =>
          updateObjectiveNode(draft, node.id, { objective_template: { required_action_params } }, onDraftChange)
        }
      />
      <label>
        Mode
        <select
          aria-label="Mode"
          value={node.mode}
          onChange={(event) => updateObjectiveNode(draft, node.id, { mode: event.target.value as ObjectiveNode["mode"] }, onDraftChange)}
        >
          {OBJECTIVE_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
      <label>
        Created node id
        <input
          aria-label="Created node id"
          value={node.on_created_node_id ?? ""}
          onChange={(event) => updateObjectiveNode(draft, node.id, { on_created_node_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Completed node id
        <input
          aria-label="Completed node id"
          value={node.on_completed_node_id}
          onChange={(event) => updateObjectiveNode(draft, node.id, { on_completed_node_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Failed node id
        <input
          aria-label="Failed node id"
          value={node.on_failed_node_id ?? ""}
          onChange={(event) => updateObjectiveNode(draft, node.id, { on_failed_node_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Expires in seconds
        <input
          aria-label="Objective expires in seconds"
          inputMode="decimal"
          value={formatNullableNumber(node.expires_in_seconds)}
          onChange={(event) => {
            const expiresInSeconds = parseOptionalNonNegativeNumber(event.target.value);
            if (expiresInSeconds !== undefined) {
              updateObjectiveNode(draft, node.id, { expires_in_seconds: expiresInSeconds }, onDraftChange);
            }
          }}
        />
      </label>
      <label>
        <input
          aria-label="Parent event link"
          type="checkbox"
          checked={node.parent_event_link}
          onChange={(event) => updateObjectiveNode(draft, node.id, { parent_event_link: event.target.checked }, onDraftChange)}
        />
        Parent event link
      </label>
    </fieldset>
  );
}

function SpawnEventNodeFields({
  draft,
  node,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  node: SpawnEventNode;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  return (
    <fieldset aria-label="Spawn event node fields">
      <legend>Spawn event node fields</legend>
      <RequiredTransitionWarnings transitions={[{ label: "Next node id", value: node.next_node_id }]} />
      <label>
        Event definition id
        <input
          aria-label="Event definition id"
          value={node.event_definition_id}
          onChange={(event) => updateSpawnEventNode(draft, node.id, { event_definition_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Spawn policy
        <select
          aria-label="Spawn policy"
          value={node.spawn_policy}
          onChange={(event) =>
            updateSpawnEventNode(draft, node.id, { spawn_policy: event.target.value as SpawnEventNode["spawn_policy"] }, onDraftChange)
          }
        >
          {SPAWN_POLICIES.map((spawnPolicy) => (
            <option key={spawnPolicy} value={spawnPolicy}>
              {spawnPolicy}
            </option>
          ))}
        </select>
      </label>
      <KeyValueObjectEditor
        label="Context mapping"
        value={node.context_mapping}
        valueMode="string"
        onUpdate={(context_mapping) => updateSpawnEventNode(draft, node.id, { context_mapping: stringifyRecord(context_mapping) }, onDraftChange)}
      />
      <label>
        Dedupe key template
        <input
          aria-label="Dedupe key template"
          value={node.dedupe_key_template ?? ""}
          onChange={(event) => updateSpawnEventNode(draft, node.id, { dedupe_key_template: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        Next node id
        <input
          aria-label="Next node id"
          value={node.next_node_id}
          onChange={(event) => updateSpawnEventNode(draft, node.id, { next_node_id: event.target.value }, onDraftChange)}
        />
      </label>
      <label>
        <input
          aria-label="Parent event link"
          type="checkbox"
          checked={node.parent_event_link}
          onChange={(event) => updateSpawnEventNode(draft, node.id, { parent_event_link: event.target.checked }, onDraftChange)}
        />
        Parent event link
      </label>
    </fieldset>
  );
}

function ConditionsArrayEditor({
  label,
  conditions,
  onUpdate,
}: {
  label: string;
  conditions: Condition[];
  onUpdate: (conditions: Condition[]) => void;
}) {
  const errorId = `${useId()}-conditions`;
  const [conditionsText, setConditionsText] = useState(formatJsonArray(conditions));
  const [conditionsError, setConditionsError] = useState<string | null>(null);

  useEffect(() => {
    setConditionsText(formatJsonArray(conditions));
    setConditionsError(null);
  }, [conditions]);

  return (
    <label>
      Conditions
      <textarea
        aria-label={label}
        value={conditionsText}
        aria-invalid={Boolean(conditionsError)}
        aria-describedby={errorId}
        onChange={(event) => updateConditions(event.target.value)}
      />
      <FieldError id={errorId} message={conditionsError} />
    </label>
  );

  function updateConditions(value: string): void {
    setConditionsText(value);

    if (!value.trim()) {
      setConditionsError(null);
      onUpdate([]);
      return;
    }

    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        setConditionsError("Conditions must be a JSON array.");
        return;
      }

      setConditionsError(null);
      onUpdate(parsed as Condition[]);
    } catch (_error) {
      setConditionsError("Conditions must be valid JSON.");
    }
  }
}

function TriggerDefinitionFields({
  label,
  trigger,
  onUpdate,
}: {
  label: string;
  trigger: TriggerDefinition;
  onUpdate: (trigger: TriggerDefinition) => void;
}) {
  return (
    <fieldset aria-label={label}>
      <legend>{label}</legend>
      <label>
        Type
        <select
          aria-label={`${label} type`}
          value={trigger.type}
          onChange={(event) => onUpdate({ ...trigger, type: event.target.value as TriggerType })}
        >
          {renderOptionsWithCurrent(TRIGGER_TYPES, trigger.type)}
        </select>
      </label>
      <label>
        Required context
        <input
          aria-label={`${label} required context`}
          value={formatList(trigger.required_context)}
          onChange={(event) => onUpdate({ ...trigger, required_context: parseList(event.target.value) })}
        />
      </label>
      <label>
        Dedupe key template
        <input
          aria-label={`${label} dedupe key template`}
          value={trigger.dedupe_key_template ?? ""}
          onChange={(event) => onUpdate({ ...trigger, dedupe_key_template: event.target.value.trim() || undefined })}
        />
      </label>
      <StructuredConditionsEditor
        label={`${label} conditions`}
        conditions={trigger.conditions ?? []}
        onUpdate={(conditions) => onUpdate({ ...trigger, conditions })}
      />
    </fieldset>
  );
}

function StructuredConditionsEditor({
  label,
  conditions,
  onUpdate,
}: {
  label: string;
  conditions: Condition[];
  onUpdate: (conditions: Condition[]) => void;
}) {
  return (
    <fieldset aria-label={label}>
      <legend>{label}</legend>
      {conditions.length === 0 ? <p className="muted-text">No conditions.</p> : null}
      {conditions.map((condition, index) => (
        <fieldset key={index} aria-label={`${label} condition ${index + 1}`}>
          <legend>Condition {index + 1}</legend>
          <label>
            Condition type
            <select
              aria-label={`${label} condition ${index + 1} type`}
              value={condition.type}
              onChange={(event) => updateCondition(index, { type: event.target.value as Condition["type"] })}
            >
              {renderOptionsWithCurrent(CONDITION_TYPES, condition.type)}
            </select>
          </label>
          <TargetRefFields
            label={`${label} condition ${index + 1} target`}
            value={condition.target ?? { type: "primary_crew" }}
            onUpdate={(target) => updateCondition(index, { target })}
            onClear={() => updateCondition(index, { target: null })}
          />
          <label>
            Field
            <input
              aria-label={`${label} condition ${index + 1} field`}
              value={condition.field ?? ""}
              onChange={(event) => updateCondition(index, { field: event.target.value.trim() || null })}
            />
          </label>
          <label>
            Operator
            <select
              aria-label={`${label} condition ${index + 1} operator`}
              value={condition.op ?? ""}
              onChange={(event) =>
                updateCondition(index, { op: event.target.value ? (event.target.value as Condition["op"]) : null })
              }
            >
              <option value="">none</option>
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
              aria-label={`${label} condition ${index + 1} value`}
              value={formatScalarValue(condition.value)}
              onChange={(event) => updateCondition(index, { value: parseScalarValue(event.target.value) })}
            />
          </label>
          <label>
            Handler type
            <input
              aria-label={`${label} condition ${index + 1} handler type`}
              value={condition.handler_type ?? ""}
              onChange={(event) => updateCondition(index, { handler_type: event.target.value.trim() || null })}
            />
          </label>
          <KeyValueObjectEditor
            label={`${label} condition ${index + 1} params`}
            value={condition.params ?? {}}
            onUpdate={(params) => updateCondition(index, { params })}
          />
          <button type="button" aria-label={`Delete ${label} condition ${index + 1}`} onClick={() => removeCondition(index)}>
            Delete condition
          </button>
        </fieldset>
      ))}
      <button type="button" aria-label={`Add ${label} condition`} onClick={addCondition}>
        Add condition
      </button>
    </fieldset>
  );

  function updateCondition(index: number, fields: Partial<Condition>): void {
    onUpdate(conditions.map((condition, conditionIndex) => (conditionIndex === index ? { ...condition, ...fields } : condition)));
  }

  function addCondition(): void {
    onUpdate([...conditions, { type: "world_flag_equals", field: "", value: "" }]);
  }

  function removeCondition(index: number): void {
    onUpdate(conditions.filter((_condition, conditionIndex) => conditionIndex !== index));
  }
}

function TargetRefFields({
  label,
  value,
  onUpdate,
  onClear,
}: {
  label: string;
  value: TargetRef;
  onUpdate: (value: TargetRef) => void;
  onClear?: () => void;
}) {
  return (
    <fieldset aria-label={`${label} ref`}>
      <legend>{label}</legend>
      <label>
        Type
        <select
          aria-label={`${label} type`}
          value={value.type}
          onChange={(event) => onUpdate(normalizeTargetRef({ ...value, type: event.target.value as TargetRef["type"] }))}
        >
          {TARGET_REF_TYPES.map((targetType) => (
            <option key={targetType} value={targetType}>
              {targetType}
            </option>
          ))}
        </select>
      </label>
      <label>
        Id
        <input
          aria-label={`${label} id`}
          value={value.id ?? ""}
          onChange={(event) => onUpdate(normalizeTargetRef({ ...value, id: event.target.value }))}
        />
      </label>
      <label>
        Ref
        <input
          aria-label={`${label} ref`}
          value={value.ref ?? ""}
          onChange={(event) => onUpdate(normalizeTargetRef({ ...value, ref: event.target.value }))}
        />
      </label>
      {onClear ? (
        <button type="button" aria-label={`Clear ${label}`} onClick={onClear}>
          Clear
        </button>
      ) : null}
    </fieldset>
  );
}

function KeyValueObjectEditor({
  label,
  value,
  valueMode = "json",
  onUpdate,
}: {
  label: string;
  value: Record<string, unknown>;
  valueMode?: "json" | "string";
  onUpdate: (value: JsonObject) => void;
}) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entries = Object.entries(value);

  return (
    <fieldset aria-label={label}>
      <legend>{label}</legend>
      {entries.length === 0 ? <p className="muted-text">No params.</p> : null}
      {entries.map(([entryKey, entryValue], index) => (
        <fieldset key={entryKey} aria-label={`${label} row ${index + 1}`}>
          <legend>{entryKey}</legend>
          <label>
            Key
            <input
              aria-label={`${label} row ${index + 1} key`}
              value={entryKey}
              onChange={(event) => updateEntryKey(entryKey, event.target.value)}
            />
          </label>
          <label>
            Value
            <input
              aria-label={`${label} row ${index + 1} value`}
              value={formatScalarValue(entryValue)}
              onChange={(event) => updateEntryValue(entryKey, event.target.value)}
            />
          </label>
          <button type="button" aria-label={`Delete ${label} row ${index + 1}`} onClick={() => deleteEntry(entryKey)}>
            Delete row
          </button>
        </fieldset>
      ))}
      <fieldset aria-label={`Add ${label} row`}>
        <legend>Add {label} row</legend>
        <label>
          Key
          <input
            aria-label={`New ${label} key`}
            value={newKey}
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              setNewKey(event.target.value);
              setError(null);
            }}
          />
        </label>
        <label>
          Value
          <input
            aria-label={`New ${label} value`}
            value={newValue}
            onChange={(event) => {
              setNewValue(event.target.value);
              setError(null);
            }}
          />
        </label>
        <FieldError id={`${label}-key-value-error`} message={error} />
        <button type="button" onClick={addEntry}>
          Add {label} row
        </button>
      </fieldset>
    </fieldset>
  );

  function addEntry(): void {
    const key = newKey.trim();
    const validationError = validateObjectKey(value, key);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setNewKey("");
    setNewValue("");
    onUpdate({
      ...value,
      [key]: parseObjectEditorValue(newValue, valueMode),
    });
  }

  function updateEntryKey(currentKey: string, nextKeyValue: string): void {
    const nextKey = nextKeyValue.trim();
    const validationError = validateObjectKey(value, nextKey, currentKey);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    onUpdate(renameRecordKey(value, currentKey, nextKey));
  }

  function updateEntryValue(entryKey: string, nextValue: string): void {
    onUpdate({
      ...value,
      [entryKey]: parseObjectEditorValue(nextValue, valueMode),
    });
  }

  function deleteEntry(entryKey: string): void {
    onUpdate(omitRecordKey(value, entryKey));
  }
}

function RequiredTransitionWarnings({
  transitions,
}: {
  transitions: Array<{ label: string; value: string | null | undefined }>;
}) {
  const missingTransitions = transitions.filter((transition) => !transition.value?.trim());

  if (missingTransitions.length === 0) {
    return null;
  }

  return (
    <ul aria-label="Required transition warnings" className="event-authoring-helper-list">
      {missingTransitions.map((transition) => (
        <li key={transition.label}>
          <span role="alert" className="map-form-errors">
            Missing required transition: {transition.label}.
          </span>
        </li>
      ))}
    </ul>
  );
}

function updateEndNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateEndNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_end_node", nodeId, fields }));
}

function updateLogOnlyNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateLogOnlyNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_log_only_node", nodeId, fields }));
}

function updateWaitNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateWaitNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_wait_node", nodeId, fields }));
}

function updateCallNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateCallNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_call_node", nodeId, fields }));
}

function updateCallOption(
  draft: EventDraftEnvelope,
  nodeId: string,
  optionId: string,
  fields: UpdateCallOptionFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_call_option", nodeId, optionId, fields }));
}

function updateCallMissed(
  draft: EventDraftEnvelope,
  node: CallNode,
  fields: NonNullable<CallNode["on_missed"]>,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  updateCallNode(
    draft,
    node.id,
    {
      on_missed: {
        ...node.on_missed,
        ...fields,
      },
    },
    onDraftChange,
  );
}

function updateCheckNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateCheckNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_check_node", nodeId, fields }));
}

function updateRandomNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateRandomNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_random_node", nodeId, fields }));
}

function updateActionRequestNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateActionRequestNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_action_request_node", nodeId, fields }));
}

function updateObjectiveNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateObjectiveNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_objective_node", nodeId, fields }));
}

function updateSpawnEventNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: UpdateSpawnEventNodeFields,
  onDraftChange: (draft: EventDraftEnvelope) => void,
): void {
  onDraftChange(eventAuthoringReducer(draft, { type: "update_spawn_event_node", nodeId, fields }));
}

function resolveSelectedNode(graph: EventGraph | null, selection: unknown): EventNode | null {
  if (!graph) {
    return null;
  }

  const selectedNodeId = readSelectedNodeId(selection);
  return (
    graph.nodes.find((node) => node.id === selectedNodeId) ??
    graph.nodes.find((node) => node.id === graph.entry_node_id) ??
    graph.nodes[0] ??
    null
  );
}

function readSelectedNodeId(selection: unknown): string | null {
  return isRecord(selection) && typeof selection.nodeId === "string" ? selection.nodeId : null;
}

function dedupeGraphHealthIssues(
  issues: ReturnType<typeof analyzeGraphHealth>["issues"],
): ReturnType<typeof analyzeGraphHealth>["issues"] {
  const seenIssueKeys = new Set<string>();
  const dedupedIssues: ReturnType<typeof analyzeGraphHealth>["issues"] = [];

  for (const issue of issues) {
    const issueKey = `${issue.code}:${issue.message}:${issue.nodeId ?? ""}:${issue.targetNodeId ?? ""}:${issue.sourceNodeId ?? ""}`;
    if (seenIssueKeys.has(issueKey)) {
      continue;
    }

    seenIssueKeys.add(issueKey);
    dedupedIssues.push(issue);
  }

  return dedupedIssues;
}

function readGraph(draft: EventDraftEnvelope): EventGraph {
  const graph = draft.working_definition.event_graph;

  return graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges) && Array.isArray(graph.terminal_node_ids)
    ? graph
    : {
        entry_node_id: "",
        nodes: [],
        edges: [],
        terminal_node_ids: [],
        graph_rules: createDefaultGraphRules(),
      };
}

function validateNodeId(graph: EventGraph, nodeId: string, currentNodeId?: string): string | null {
  if (!isSafeEventId(nodeId)) {
    return "Node id must use lowercase letters, numbers, underscores, or hyphens.";
  }

  if (nodeId !== currentNodeId && graph.nodes.some((node) => node.id === nodeId)) {
    return `Node id ${nodeId} already exists.`;
  }

  return null;
}

function suggestNodeId(graph: EventGraph, nodeType: EditableGraphNodeType): string {
  const existingNodeIds = new Set(graph.nodes.map((node) => node.id));
  let index = 1;
  let candidate: string = nodeType;

  while (existingNodeIds.has(candidate)) {
    index += 1;
    candidate = `${nodeType}_${index}`;
  }

  return candidate;
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

function formatNullableNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function formatJsonArray(value: readonly unknown[] | undefined): string {
  return JSON.stringify(value ?? [], null, 2);
}

function validateChildId(
  existingIds: readonly string[],
  value: string,
  label: string,
  currentValue?: string,
): string | null {
  if (!isSafeEventId(value)) {
    return `${label} must use lowercase letters, numbers, underscores, or hyphens.`;
  }

  if (value !== currentValue && existingIds.includes(value)) {
    return `${label} ${value} already exists.`;
  }

  return null;
}

function normalizeTargetRef(value: TargetRef): TargetRef {
  const id = value.id?.trim();
  const ref = value.ref?.trim();
  const normalized: TargetRef = { type: value.type };

  if (id) {
    normalized.id = id;
  }
  if (ref) {
    normalized.ref = ref;
  }

  return normalized;
}

function renderOptionsWithCurrent(values: readonly string[], currentValue: string) {
  const options = currentValue && !values.includes(currentValue) ? [...values, currentValue] : values;

  return options.map((value) => (
    <option key={value} value={value}>
      {value}
    </option>
  ));
}

function parseOptionalNonNegativeNumber(value: string): number | null | undefined {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  const numberValue = Number(trimmedValue);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : undefined;
}

function formatScalarValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

function parseScalarValue(value: string): unknown {
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
  if (trimmedValue && /^-?\d+(\.\d+)?$/.test(trimmedValue)) {
    return Number(trimmedValue);
  }

  return value;
}

function parseObjectEditorValue(value: string, valueMode: "json" | "string"): unknown {
  return valueMode === "string" ? value : parseScalarValue(value);
}

function stringifyRecord(record: JsonObject): Record<string, string> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, formatScalarValue(value)]));
}

function validateObjectKey(record: Record<string, unknown>, key: string, currentKey?: string): string | null {
  if (!key) {
    return "Key is required.";
  }

  if (key !== currentKey && Object.prototype.hasOwnProperty.call(record, key)) {
    return `Key ${key} already exists.`;
  }

  return null;
}

function omitRecordKey(record: Record<string, unknown>, keyToOmit: string): JsonObject {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== keyToOmit));
}

function renameRecordKey(record: Record<string, unknown>, fromKey: string, toKey: string): JsonObject {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key === fromKey ? toKey : key, value]));
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
