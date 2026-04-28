import { useEffect, useMemo, useState } from "react";
import type { EventDefinition, EventGraph } from "../../../pc-client/src/events/types";
import GraphCanvas from "./GraphCanvas";
import GraphDetailPanel, { TriggerSummary, type GraphSelection } from "./GraphDetailPanel";
import { deriveGraphEdges } from "./graphModel";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

interface GraphPanelProps {
  asset: EditorEventAsset<unknown>;
  draft: unknown;
  library: EventEditorLibraryResponse;
}

export default function GraphPanel({ asset, draft, library }: GraphPanelProps) {
  const definition = resolveDefinition(asset, draft, library);
  const graph = definition?.event_graph;
  const edges = useMemo(() => (definition ? deriveGraphEdges(definition) : []), [definition]);
  const [selection, setSelection] = useState<GraphSelection>({ type: "trigger" });

  useEffect(() => {
    setSelection(graph ? { type: "node", nodeId: graph.entry_node_id } : { type: "trigger" });
  }, [definition?.id, graph?.entry_node_id]);

  return (
    <section className="inspector-panel" aria-label="Graph inspector">
      <h4>Graph Canvas</h4>
      {definition ? (
        <p className="muted-text">
          Read-only graph for <code>{definition.id}</code>. Transitions are derived from node fields and explicit graph edges.
        </p>
      ) : (
        <p className="muted-text">No structured event graph is available for this asset.</p>
      )}

      {graph ? (
        <div className="graph-inspector-workspace">
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
              <dd>{edges.length}</dd>
            </div>
          </dl>

          <TriggerSummary definition={definition} />
          <GraphCanvas definition={definition} edges={edges} selection={selection} onSelect={setSelection} />
          <GraphDetailPanel definition={definition} library={library} edges={edges} selection={selection} onSelect={setSelection} />
        </div>
      ) : null}
    </section>
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

function isEventDefinition(value: unknown): value is EventDefinition {
  return isRecord(value) && isEventGraph(value.event_graph);
}

function isEventGraph(value: unknown): value is EventGraph {
  return isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges) && Array.isArray(value.terminal_node_ids);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
