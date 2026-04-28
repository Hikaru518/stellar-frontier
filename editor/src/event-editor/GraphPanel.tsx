import type { EventDefinition, EventEdge, EventGraph, EventNode } from "../../../apps/pc-client/src/events/types";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

interface GraphPanelProps {
  asset: EditorEventAsset<unknown>;
  draft: unknown;
  library: EventEditorLibraryResponse;
}

export default function GraphPanel({ asset, draft, library }: GraphPanelProps) {
  const definition = resolveDefinition(asset, draft, library);
  const graph = definition?.event_graph;

  return (
    <section className="inspector-panel" aria-label="Graph inspector">
      <h4>Graph Outline</h4>
      {definition ? (
        <p className="muted-text">
          Read-only graph for <code>{definition.id}</code>
        </p>
      ) : (
        <p className="muted-text">No structured event graph is available for this asset.</p>
      )}

      {graph ? (
        <>
          <dl className="inspector-summary">
            <div>
              <dt>Entry</dt>
              <dd>{graph.entry_node_id}</dd>
            </div>
            <div>
              <dt>Nodes</dt>
              <dd>{graph.nodes.length}</dd>
            </div>
            <div>
              <dt>Transitions</dt>
              <dd>{graph.edges.length}</dd>
            </div>
          </dl>

          <NodeList nodes={graph.nodes} />
          <EdgeList edges={graph.edges} />
          <GraphList title="Terminal Nodes" label="Terminal graph nodes" items={graph.terminal_node_ids} />
        </>
      ) : null}
    </section>
  );
}

function NodeList({ nodes }: { nodes: EventNode[] }) {
  return (
    <>
      <h5>Nodes</h5>
      {nodes.length > 0 ? (
        <ul className="inspector-list" aria-label="Graph nodes">
          {nodes.map((node) => (
            <li key={node.id} className="inspector-card">
              <div className="inspector-card-heading">
                <code>{node.id}</code>
                <span className="status-tag status-muted">{node.type}</span>
              </div>
              <p>{node.title}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">No nodes recorded.</p>
      )}
    </>
  );
}

function EdgeList({ edges }: { edges: EventEdge[] }) {
  return (
    <>
      <h5>Transitions</h5>
      {edges.length > 0 ? (
        <ul className="inspector-list" aria-label="Graph transitions">
          {edges.map((edge) => (
            <li key={`${edge.from_node_id}:${edge.to_node_id}:${edge.via ?? ""}`} className="inspector-card">
              <code>{formatEdge(edge)}</code>
              {edge.via ? <p className="muted-text">via {edge.via}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">No transitions recorded.</p>
      )}
    </>
  );
}

function GraphList({ title, label, items }: { title: string; label: string; items: string[] }) {
  return (
    <>
      <h5>{title}</h5>
      {items.length > 0 ? (
        <ul className="inspector-list" aria-label={label}>
          {items.map((item) => (
            <li key={item} className="inspector-card">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted-text">No {title.toLowerCase()} recorded.</p>
      )}
    </>
  );
}

function resolveDefinition(asset: EditorEventAsset<unknown>, draft: unknown, library: EventEditorLibraryResponse): EventDefinition | null {
  if (asset.asset_type === "event_definition" && isEventDefinition(draft)) {
    return draft;
  }

  if (asset.asset_type === "call_template" && isRecord(draft) && typeof draft.event_definition_id === "string") {
    const definition = library.definitions.map((candidate) => candidate.data).find((candidate) => isEventDefinition(candidate) && candidate.id === draft.event_definition_id);
    return definition ?? null;
  }

  return null;
}

function formatEdge(edge: EventEdge): string {
  return `${edge.from_node_id} -> ${edge.to_node_id}`;
}

function isEventDefinition(value: unknown): value is EventDefinition {
  return isRecord(value) && isEventGraph(value.event_graph);
}

function isEventGraph(value: unknown): value is EventGraph {
  return isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges) && Array.isArray(value.terminal_node_ids);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
