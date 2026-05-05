import { useMemo, useState } from "react";
import type {
  EndNode,
  EventGraph,
  EventNode,
  EventNodeType,
  EventTerminalStatus,
  LogOnlyNode,
  WaitNode,
} from "../../../../pc-client/src/events/types";
import { analyzeGraphHealth } from "../graphModel";
import type { EventDraftEnvelope } from "../types";
import { getNodeCapability } from "./capabilityCatalog";
import { eventAuthoringReducer, type EventAuthoringAction } from "./eventAuthoringReducer";
import GraphPreviewPanel from "./GraphPreviewPanel";
import { createDefaultGraphRules, isSafeEventId } from "./templates";

interface GraphStructureEditorProps {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}

type EditableBasicNodeType = Extract<EventNodeType, "end" | "log_only" | "wait">;
type UpdateNodeCommonFields = Extract<EventAuthoringAction, { type: "update_node_common_fields" }>["fields"];
type UpdateEndNodeFields = Extract<EventAuthoringAction, { type: "update_end_node" }>["fields"];
type UpdateLogOnlyNodeFields = Extract<EventAuthoringAction, { type: "update_log_only_node" }>["fields"];
type UpdateWaitNodeFields = Extract<EventAuthoringAction, { type: "update_wait_node" }>["fields"];

const EDITABLE_BASIC_NODE_TYPES = ["wait", "log_only", "end"] as const satisfies readonly EditableBasicNodeType[];
const TERMINAL_RESOLUTIONS = ["resolved", "cancelled", "expired", "failed"] as const satisfies readonly EventTerminalStatus[];
const WAKE_TRIGGER_TYPES = ["time_wakeup", "event_node_finished"] as const satisfies readonly WaitNode["wake_trigger_type"][];
const INTERRUPT_POLICIES = [
  "not_interruptible",
  "player_can_cancel",
  "event_can_cancel",
] as const satisfies readonly WaitNode["interrupt_policy"][];

export default function GraphStructureEditor({ draft, onDraftChange }: GraphStructureEditorProps) {
  const graph = readGraph(draft);
  const health = useMemo(() => analyzeGraphHealth(draft.working_definition), [draft.working_definition]);
  const selectedNode = resolveSelectedNode(graph, draft.editor_state.selection);
  const [newNodeType, setNewNodeType] = useState<EditableBasicNodeType>("wait");
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
              onChange={(event) => setNewNodeType(event.target.value as EditableBasicNodeType)}
            >
              {EDITABLE_BASIC_NODE_TYPES.map((nodeType) => (
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
  return (
    <section aria-labelledby="graph-structure-health-heading">
      <div className="graph-section-heading">
        <h4 id="graph-structure-health-heading">Graph Structure Health</h4>
        <span className={health.issues.length === 0 ? "status-tag status-success" : "status-tag status-warning"}>
          {health.issues.length} warnings
        </span>
      </div>
      {health.issues.length === 0 ? (
        <p className="muted-text">No structural warnings.</p>
      ) : (
        <ul className="event-authoring-helper-list" aria-label="Graph structure health issues">
          {health.issues.map((issue, index) => (
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

  return (
    <section aria-label="Unsupported node fields">
      <p className="muted-text">{getNodeCapability(node.type).label} specific fields arrive in later graph editor tasks.</p>
    </section>
  );
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

function suggestNodeId(graph: EventGraph, nodeType: EditableBasicNodeType): string {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
