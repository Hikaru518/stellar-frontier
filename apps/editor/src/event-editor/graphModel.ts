import { graphlib, layout as dagreLayout } from "@dagrejs/dagre";
import type {
  CallTemplate,
  Effect,
  EventDefinition,
  EventEdge,
  EventLogTemplate,
  EventNode,
  Id,
} from "../../../pc-client/src/events/types";
import type { EventEditorLibraryResponse } from "./types";

export const TRIGGER_NODE_ID = "__event_trigger__";

export type EdgeMechanism =
  | { kind: "option"; optionId: Id; isDefault: boolean }
  | { kind: "on_missed" }
  | { kind: "branch"; branchId: Id; weight?: number }
  | { kind: "default_branch" }
  | { kind: "wait_next" }
  | { kind: "on_interrupted" }
  | { kind: "on_accepted" }
  | { kind: "on_completed" }
  | { kind: "on_failed" }
  | { kind: "on_created" }
  | { kind: "spawn_next" }
  | { kind: "log_next" }
  | { kind: "auto_next" }
  | { kind: "timeout" }
  | { kind: "manual"; via?: string | null };

export interface DerivedEdge {
  fromNodeId: Id;
  toNodeId: Id;
  mechanism: EdgeMechanism;
  effectRefs: Id[];
  key: string;
}

export interface GraphPosition {
  x: number;
  y: number;
}

export interface GraphLayout {
  nodePositions: Record<Id, GraphPosition>;
  triggerPosition: GraphPosition;
}

const NODE_WIDTH = 220;
const NODE_HEIGHT = 104;
const TRIGGER_WIDTH = 180;
const TRIGGER_HEIGHT = 72;

export function deriveGraphEdges(definition: EventDefinition): DerivedEdge[] {
  const derived = definition.event_graph.nodes.flatMap((node) => deriveNodeEdges(node));
  return mergeManualEdges(derived, definition.event_graph.edges);
}

export function formatEdgeMechanism(mechanism: EdgeMechanism): string {
  switch (mechanism.kind) {
    case "option":
      return mechanism.isDefault ? `option:${mechanism.optionId} · default` : `option:${mechanism.optionId}`;
    case "branch":
      return mechanism.weight === undefined ? `branch:${mechanism.branchId}` : `branch:${mechanism.branchId} (w=${mechanism.weight})`;
    case "default_branch":
      return "default";
    case "wait_next":
      return "wait_next";
    case "spawn_next":
      return "spawn_next";
    case "log_next":
      return "log_next";
    case "auto_next":
      return "auto";
    case "manual":
      return mechanism.via ? `manual:${mechanism.via}` : "manual";
    default:
      return mechanism.kind;
  }
}

export function resolveEffectRefs(definition: EventDefinition, ids: readonly Id[] = []): Effect[] {
  const groups = definition.effect_groups ?? [];
  return ids.flatMap((id) => groups.find((group) => group.id === id)?.effects ?? []);
}

export function resolveLogTemplate(definition: EventDefinition, id?: Id | null): EventLogTemplate | null {
  if (!id) {
    return null;
  }

  return definition.log_templates?.find((template) => template.id === id) ?? null;
}

export function findCallTemplate(library: EventEditorLibraryResponse, definitionId: Id, nodeId: Id): CallTemplate | null {
  return library.call_templates.map((asset) => asset.data).find((template) => template.event_definition_id === definitionId && template.node_id === nodeId) ?? null;
}

export function layoutGraph(nodes: readonly EventNode[], edges: readonly DerivedEdge[], entryNodeId: Id): GraphLayout {
  const graph = new graphlib.Graph();
  graph.setGraph({ rankdir: "LR", nodesep: 72, ranksep: 180, marginx: 48, marginy: 48 });
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setNode(TRIGGER_NODE_ID, { width: TRIGGER_WIDTH, height: TRIGGER_HEIGHT });

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  graph.setEdge(TRIGGER_NODE_ID, entryNodeId);
  for (const edge of edges) {
    graph.setEdge(edge.fromNodeId, edge.toNodeId);
  }

  dagreLayout(graph);

  const triggerPosition = toTopLeftPosition(graph.node(TRIGGER_NODE_ID), TRIGGER_WIDTH, TRIGGER_HEIGHT);
  const nodePositions: Record<Id, GraphPosition> = {};
  for (const node of nodes) {
    nodePositions[node.id] = toTopLeftPosition(graph.node(node.id), NODE_WIDTH, NODE_HEIGHT);
  }

  return { nodePositions, triggerPosition };
}

function deriveNodeEdges(node: EventNode): DerivedEdge[] {
  const edges: DerivedEdge[] = [];

  switch (node.type) {
    case "call": {
      for (const option of node.options) {
        const toNodeId = node.option_node_mapping[option.id];
        if (toNodeId) {
          edges.push(createEdge(node.id, toNodeId, { kind: "option", optionId: option.id, isDefault: option.is_default === true }, option.effect_refs ?? []));
        }
      }
      if (node.on_missed?.next_node_id) {
        edges.push(createEdge(node.id, node.on_missed.next_node_id, { kind: "on_missed" }, node.on_missed.effect_refs ?? []));
      }
      break;
    }
    case "wait":
      edges.push(createEdge(node.id, node.next_node_id, { kind: "wait_next" }));
      if (node.on_interrupted?.next_node_id) {
        edges.push(createEdge(node.id, node.on_interrupted.next_node_id, { kind: "on_interrupted" }, node.on_interrupted.effect_refs ?? []));
      }
      break;
    case "check":
      for (const branch of node.branches) {
        edges.push(createEdge(node.id, branch.next_node_id, { kind: "branch", branchId: branch.id }, branch.effect_refs ?? []));
      }
      edges.push(createEdge(node.id, node.default_next_node_id, { kind: "default_branch" }));
      break;
    case "random":
      for (const branch of node.branches) {
        edges.push(createEdge(node.id, branch.next_node_id, { kind: "branch", branchId: branch.id, weight: branch.weight }, branch.effect_refs ?? []));
      }
      if (node.default_next_node_id) {
        edges.push(createEdge(node.id, node.default_next_node_id, { kind: "default_branch" }));
      }
      break;
    case "action_request":
      if (node.on_accepted_node_id) {
        edges.push(createEdge(node.id, node.on_accepted_node_id, { kind: "on_accepted" }));
      }
      edges.push(createEdge(node.id, node.on_completed_node_id, { kind: "on_completed" }));
      edges.push(createEdge(node.id, node.on_failed_node_id, { kind: "on_failed" }));
      break;
    case "objective":
      if (node.on_created_node_id) {
        edges.push(createEdge(node.id, node.on_created_node_id, { kind: "on_created" }));
      }
      edges.push(createEdge(node.id, node.on_completed_node_id, { kind: "on_completed" }));
      if (node.on_failed_node_id) {
        edges.push(createEdge(node.id, node.on_failed_node_id, { kind: "on_failed" }));
      }
      break;
    case "spawn_event":
      edges.push(createEdge(node.id, node.next_node_id, { kind: "spawn_next" }));
      break;
    case "log_only":
      edges.push(createEdge(node.id, node.next_node_id, { kind: "log_next" }, node.effect_refs ?? []));
      break;
    case "end":
      break;
  }

  if (node.auto_next_node_id) {
    edges.push(createEdge(node.id, node.auto_next_node_id, { kind: "auto_next" }));
  }
  if (node.timeout?.next_node_id) {
    edges.push(createEdge(node.id, node.timeout.next_node_id, { kind: "timeout" }, node.timeout.effect_refs ?? []));
  }

  return edges;
}

function mergeManualEdges(derived: DerivedEdge[], manualEdges: readonly EventEdge[]): DerivedEdge[] {
  const merged = [...derived];
  for (const manualEdge of manualEdges) {
    if (derived.some((edge) => edge.fromNodeId === manualEdge.from_node_id && edge.toNodeId === manualEdge.to_node_id && matchesManualVia(edge, manualEdge.via))) {
      continue;
    }

    merged.push(createEdge(manualEdge.from_node_id, manualEdge.to_node_id, { kind: "manual", via: manualEdge.via }, []));
  }

  return merged;
}

function matchesManualVia(edge: DerivedEdge, via?: string | null): boolean {
  if (!via) {
    return true;
  }
  if (edge.mechanism.kind === "option") {
    return edge.mechanism.optionId === via;
  }
  if (edge.mechanism.kind === "branch") {
    return edge.mechanism.branchId === via;
  }
  return formatEdgeMechanism(edge.mechanism) === via;
}

function createEdge(fromNodeId: Id, toNodeId: Id, mechanism: EdgeMechanism, effectRefs: Id[] = []): DerivedEdge {
  return {
    fromNodeId,
    toNodeId,
    mechanism,
    effectRefs,
    key: `${fromNodeId}:${toNodeId}:${mechanismKey(mechanism)}`,
  };
}

function mechanismKey(mechanism: EdgeMechanism): string {
  switch (mechanism.kind) {
    case "option":
      return `option:${mechanism.optionId}`;
    case "branch":
      return `branch:${mechanism.branchId}`;
    case "manual":
      return `manual:${mechanism.via ?? ""}`;
    default:
      return mechanism.kind;
  }
}

function toTopLeftPosition(position: { x: number; y: number } | undefined, width: number, height: number): GraphPosition {
  if (!position) {
    return { x: 0, y: 0 };
  }

  return {
    x: Math.round(position.x - width / 2),
    y: Math.round(position.y - height / 2),
  };
}
