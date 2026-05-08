import { useEffect, useMemo, useState } from "react";
import type { EventDefinition, EventEdge, EventGraph, EventNode, Id } from "../../../../pc-client/src/events/types";
import GraphCanvas from "../GraphCanvas";
import type { GraphSelection } from "../GraphDetailPanel";
import {
  analyzeGraphHealth,
  deriveGraphEdges,
  filterRenderableGraphEdges,
  formatEdgeMechanism,
  type DerivedEdge,
} from "../graphModel";
import type { EventDraftEnvelope, EventDraftWorkingDefinition } from "../types";

interface GraphPreviewPanelProps {
  draft?: EventDraftEnvelope | null;
  workingDefinition?: EventDraftWorkingDefinition | EventDefinition | null;
}

export default function GraphPreviewPanel({ draft, workingDefinition }: GraphPreviewPanelProps) {
  const sourceDefinition = workingDefinition ?? draft?.working_definition ?? null;
  const graphDefinition = useMemo(() => coerceGraphDefinition(sourceDefinition), [sourceDefinition]);
  const health = useMemo(() => analyzeGraphHealth(sourceDefinition), [sourceDefinition]);
  const edges = useMemo(() => (graphDefinition ? safelyDeriveGraphEdges(graphDefinition) : []), [graphDefinition]);
  const renderableEdges = useMemo(
    () => (graphDefinition ? filterRenderableGraphEdges(graphDefinition.event_graph.nodes, edges) : []),
    [edges, graphDefinition],
  );
  const nodes = graphDefinition?.event_graph.nodes ?? [];
  const canRenderGraph = Boolean(graphDefinition && health.canRenderPreview);
  const defaultSelection = useMemo<GraphSelection>(
    () => (canRenderGraph && graphDefinition ? { type: "node", nodeId: graphDefinition.event_graph.entry_node_id } : { type: "trigger" }),
    [canRenderGraph, graphDefinition],
  );
  const [selection, setSelection] = useState<GraphSelection>(() => defaultSelection);

  useEffect(() => {
    setSelection((currentSelection) => (isSameSelection(currentSelection, defaultSelection) ? currentSelection : defaultSelection));
  }, [defaultSelection]);

  return (
    <section className="graph-detail-panel graph-preview-panel" aria-label="Graph preview panel">
      <div className="event-authoring-section-heading">
        <div>
          <h3>Graph Preview</h3>
          <p className="muted-text">
            Working definition <code>{readDisplayId(sourceDefinition)}</code>
          </p>
        </div>
        <span className={health.status === "healthy" ? "status-tag status-success" : "status-tag status-warning"}>
          {health.status}
        </span>
      </div>

      <dl className="inspector-summary" aria-label="Graph preview summary">
        <div>
          <dt>Nodes</dt>
          <dd>{nodes.length}</dd>
        </div>
        <div>
          <dt>Transitions</dt>
          <dd>{edges.length}</dd>
        </div>
        <div>
          <dt>Renderable</dt>
          <dd>{renderableEdges.length}</dd>
        </div>
      </dl>

      <section aria-labelledby="graph-preview-health-heading">
        <div className="graph-section-heading">
          <h4 id="graph-preview-health-heading">Graph Health</h4>
          <span className={health.issues.length === 0 ? "status-tag status-success" : "status-tag status-warning"}>
            {health.issues.length} issues
          </span>
        </div>
        {health.issues.length === 0 ? (
          <p className="muted-text">No structural issues detected.</p>
        ) : (
          <>
            <p className="muted-text">Graph preview is incomplete.</p>
            <ul className="event-authoring-helper-list" aria-label="Graph health issues">
              {health.issues.map((issue, index) => (
                <li key={`${issue.code}:${issue.message}:${index}`}>
                  <strong>{issue.code}</strong>
                  <span>{issue.message}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {nodes.length > 0 ? (
        <section aria-labelledby="graph-preview-nodes-heading">
          <div className="graph-section-heading">
            <h4 id="graph-preview-nodes-heading">Nodes</h4>
            <span className="status-tag status-muted">{nodes.length}</span>
          </div>
          <ul className="event-authoring-helper-list" aria-label="Graph preview nodes">
            {nodes.map((node) => (
              <li key={node.id}>
                <strong>
                  <code>{node.id}</code>
                </strong>
                <span>{node.title}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="muted-text">No graph nodes are available yet.</p>
      )}

      {edges.length > 0 ? (
        <section aria-labelledby="graph-preview-transitions-heading">
          <div className="graph-section-heading">
            <h4 id="graph-preview-transitions-heading">Transitions</h4>
            <span className="status-tag status-muted">{edges.length}</span>
          </div>
          <ul className="event-authoring-helper-list" aria-label="Graph preview transitions">
            {edges.map((edge) => (
              <li key={edge.key}>
                <strong>
                  <code>
                    {edge.fromNodeId} {"->"} {edge.toNodeId}
                  </code>
                </strong>
                <span>{formatEdgeMechanism(edge.mechanism)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="muted-text">No transitions are available yet.</p>
      )}

      {canRenderGraph && graphDefinition ? (
        <GraphCanvas
          definition={graphDefinition}
          edges={renderableEdges}
          selection={selection}
          onSelect={setSelection}
          interactive={false}
        />
      ) : null}
    </section>
  );
}

function safelyDeriveGraphEdges(definition: EventDefinition): DerivedEdge[] {
  try {
    return deriveGraphEdges(definition);
  } catch {
    return [];
  }
}

function isSameSelection(left: GraphSelection, right: GraphSelection): boolean {
  if (left.type !== right.type) {
    return false;
  }

  if (left.type === "node" && right.type === "node") {
    return left.nodeId === right.nodeId;
  }

  if (left.type === "edge" && right.type === "edge") {
    return left.edgeKey === right.edgeKey;
  }

  return true;
}

function coerceGraphDefinition(value: unknown): EventDefinition | null {
  if (!isRecord(value) || !isRecord(value.event_graph)) {
    return null;
  }

  const graph = coerceEventGraph(value.event_graph);
  if (!graph) {
    return null;
  }

  return {
    ...value,
    schema_version: readString(value.schema_version) ?? "event-program-model-v1",
    id: readString(value.id) ?? "working_definition",
    version: typeof value.version === "number" ? value.version : 1,
    domain: readString(value.domain) ?? "draft",
    title: readString(value.title) ?? readString(value.id) ?? "Working definition",
    summary: readString(value.summary) ?? "",
    status: readStatus(value.status),
    trigger: readTrigger(value.trigger),
    candidate_selection: isRecord(value.candidate_selection)
      ? value.candidate_selection
      : {
          priority: 0,
          weight: 1,
          max_instances_per_trigger: 1,
          requires_blocking_slot: false,
        },
    repeat_policy: isRecord(value.repeat_policy)
      ? value.repeat_policy
      : {
          scope: "event",
          cooldown_seconds: 0,
          history_key_template: readString(value.id) ?? "working_definition",
          allow_while_active: false,
        },
    event_graph: graph,
    sample_contexts: Array.isArray(value.sample_contexts) ? value.sample_contexts : [],
  } as EventDefinition;
}

function coerceEventGraph(value: Record<string, unknown>): EventGraph | null {
  const nodes = readNodeArray(value.nodes);

  if (!Array.isArray(value.nodes)) {
    return null;
  }

  return {
    entry_node_id: readString(value.entry_node_id) ?? "",
    terminal_node_ids: readStringArray(value.terminal_node_ids),
    graph_rules: isRecord(value.graph_rules)
      ? value.graph_rules
      : { acyclic: true, max_active_nodes: 1, allow_parallel_nodes: false },
    edges: readEdgeArray(value.edges),
    nodes,
  } as EventGraph;
}

function readNodeArray(value: unknown): EventNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((node): EventNode[] => {
    if (!isRecord(node)) {
      return [];
    }

    const id = readString(node.id);
    if (!id) {
      return [];
    }

    return [
      {
        ...node,
        id,
        type: readString(node.type) ?? "end",
        title: readString(node.title) ?? id,
        blocking: isRecord(node.blocking)
          ? node.blocking
          : { occupies_crew_action: false, occupies_communication: false },
      } as unknown as EventNode,
    ];
  });
}

function readEdgeArray(value: unknown): EventEdge[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((edge): EventEdge[] => {
    if (!isRecord(edge)) {
      return [];
    }

    const fromNodeId = readString(edge.from_node_id);
    const toNodeId = readString(edge.to_node_id);
    if (!fromNodeId || !toNodeId) {
      return [];
    }

    return [{ from_node_id: fromNodeId, to_node_id: toNodeId, via: readString(edge.via) }];
  });
}

function readTrigger(value: unknown): EventDefinition["trigger"] {
  if (!isRecord(value)) {
    return { type: "arrival" };
  }

  return {
    ...value,
    type: readString(value.type) ?? "arrival",
  } as EventDefinition["trigger"];
}

function readStatus(value: unknown): EventDefinition["status"] {
  return value === "ready_for_test" || value === "approved" || value === "disabled" ? value : "draft";
}

function readDisplayId(value: unknown): Id {
  return isRecord(value) ? readString(value.id) ?? "working_definition" : "working_definition";
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
