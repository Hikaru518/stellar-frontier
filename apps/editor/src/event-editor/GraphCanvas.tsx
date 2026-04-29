import "@xyflow/react/dist/style.css";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import { useEffect, useMemo } from "react";
import type { EventDefinition, EventNode, Id } from "../../../pc-client/src/events/types";
import {
  TRIGGER_NODE_ID,
  formatEdgeMechanism,
  layoutGraph,
  type DerivedEdge,
} from "./graphModel";
import type { GraphSelection } from "./GraphDetailPanel";

interface GraphCanvasProps {
  definition: EventDefinition;
  edges: DerivedEdge[];
  selection: GraphSelection;
  onSelect: (selection: GraphSelection) => void;
}

interface EventNodeData extends Record<string, unknown> {
  node: EventNode;
  isEntry: boolean;
  isTerminal: boolean;
}

interface TriggerNodeData extends Record<string, unknown> {
  triggerType: string;
}

type EventFlowNode = FlowNode<EventNodeData, "eventNode">;
type TriggerFlowNode = FlowNode<TriggerNodeData, "triggerNode">;
type GraphFlowNode = EventFlowNode | TriggerFlowNode;

const nodeTypes: NodeTypes = {
  eventNode: EventGraphNode,
  triggerNode: TriggerGraphNode,
};

export default function GraphCanvas({ definition, edges, selection, onSelect }: GraphCanvasProps) {
  const { flowNodes, flowEdges } = useMemo(() => buildFlowGraph(definition, edges), [definition, edges]);
  const [nodes, setNodes, onNodesChange] = useNodesState<GraphFlowNode>(flowNodes);
  const [reactFlowEdges, setReactFlowEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setReactFlowEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setReactFlowEdges]);

  useEffect(() => {
    setNodes((currentNodes) => currentNodes.map((node) => ({ ...node, selected: isSelectedNode(node.id, selection) })));
    setReactFlowEdges((currentEdges) => currentEdges.map((edge) => ({ ...edge, selected: selection.type === "edge" && selection.edgeKey === edge.id })));
  }, [selection, setNodes, setReactFlowEdges]);

  return (
    <section className="graph-canvas-frame" aria-label="Event graph canvas">
      <ReactFlow
        nodes={nodes}
        edges={reactFlowEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable
        nodesConnectable={false}
        edgesReconnectable={false}
        elementsSelectable
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => {
          onSelect(node.id === TRIGGER_NODE_ID ? { type: "trigger" } : { type: "node", nodeId: node.id });
        }}
        onEdgeClick={(_, edge) => onSelect({ type: "edge", edgeKey: edge.id })}
        onPaneClick={() => onSelect({ type: "trigger" })}
      >
        <Background gap={24} />
        <MiniMap pannable zoomable />
        <Controls showInteractive={false} />
      </ReactFlow>
    </section>
  );
}

function buildFlowGraph(definition: EventDefinition, edges: DerivedEdge[]): { flowNodes: GraphFlowNode[]; flowEdges: FlowEdge[] } {
  const layout = layoutGraph(definition.event_graph.nodes, edges, definition.event_graph.entry_node_id);
  const flowNodes: GraphFlowNode[] = [
    {
      id: TRIGGER_NODE_ID,
      type: "triggerNode",
      position: layout.triggerPosition,
      data: { triggerType: definition.trigger.type },
      draggable: true,
      selectable: true,
    },
    ...definition.event_graph.nodes.map((node): EventFlowNode => ({
      id: node.id,
      type: "eventNode",
      position: layout.nodePositions[node.id] ?? { x: 0, y: 0 },
      data: {
        node,
        isEntry: node.id === definition.event_graph.entry_node_id,
        isTerminal: definition.event_graph.terminal_node_ids.includes(node.id),
      },
      draggable: true,
      selectable: true,
    })),
  ];
  const flowEdges: FlowEdge[] = [
    {
      id: `${TRIGGER_NODE_ID}:${definition.event_graph.entry_node_id}:trigger`,
      source: TRIGGER_NODE_ID,
      target: definition.event_graph.entry_node_id,
      label: "trigger",
      type: "smoothstep",
      animated: true,
      className: "graph-trigger-edge",
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 2,
      markerEnd: { type: MarkerType.ArrowClosed },
    },
    ...edges.map((edge) => ({
      id: edge.key,
      source: edge.fromNodeId,
      target: edge.toNodeId,
      label: formatEdgeMechanism(edge.mechanism),
      type: "smoothstep",
      zIndex: 10,
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 2,
      markerEnd: { type: MarkerType.ArrowClosed },
      className: "graph-transition-edge",
    })),
  ];

  return { flowNodes, flowEdges };
}

function EventGraphNode({ data, selected }: NodeProps<EventFlowNode>) {
  return (
    <article className={selected ? "graph-flow-node graph-flow-node-selected" : "graph-flow-node"}>
      <Handle type="target" position={Position.Left} className="graph-flow-handle" />
      <div className="graph-flow-node-heading">
        <span className="status-tag status-muted">{data.node.type}</span>
        {data.isEntry ? <span className="status-tag status-success">ENTRY</span> : null}
        {data.isTerminal ? <span className="status-tag status-warning">END</span> : null}
      </div>
      <code>{data.node.id}</code>
      <strong>{data.node.title}</strong>
      <Handle type="source" position={Position.Right} className="graph-flow-handle" />
    </article>
  );
}

function TriggerGraphNode({ data, selected }: NodeProps<TriggerFlowNode>) {
  return (
    <article className={selected ? "graph-flow-node graph-trigger-node graph-flow-node-selected" : "graph-flow-node graph-trigger-node"}>
      <span className="status-tag status-muted">TRIGGER</span>
      <strong>{data.triggerType}</strong>
      <Handle type="source" position={Position.Right} className="graph-flow-handle" />
    </article>
  );
}

function isSelectedNode(nodeId: Id, selection: GraphSelection): boolean {
  return (nodeId === TRIGGER_NODE_ID && selection.type === "trigger") || (selection.type === "node" && selection.nodeId === nodeId);
}
