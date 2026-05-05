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

export type GraphHealthStatus = "healthy" | "incomplete";

export type GraphHealthIssueCode =
  | "missing_event_graph"
  | "missing_entry_node"
  | "missing_terminal_node"
  | "unmapped_call_option"
  | "missing_edge_source"
  | "missing_edge_target";

export interface GraphHealthIssue {
  code: GraphHealthIssueCode;
  severity: "error" | "warning";
  message: string;
  nodeId?: Id;
  optionId?: Id;
  edgeKey?: string;
  sourceNodeId?: Id;
  targetNodeId?: Id;
}

export interface GraphHealthSummary {
  status: GraphHealthStatus;
  issues: GraphHealthIssue[];
  canRenderPreview: boolean;
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

export function analyzeGraphHealth(definition: unknown, edges?: readonly DerivedEdge[]): GraphHealthSummary {
  const graph = readEventGraphRecord(definition);
  const issues: GraphHealthIssue[] = [];

  if (!graph) {
    issues.push({
      code: "missing_event_graph",
      severity: "error",
      message: "No event_graph is available yet.",
    });

    return { status: "incomplete", issues, canRenderPreview: false };
  }

  const nodeRecords = readRecordArray(graph.nodes);
  const nodeIds = createNodeIdSet(nodeRecords);
  const entryNodeId = readString(graph.entry_node_id);

  if (!entryNodeId || !nodeIds.has(entryNodeId)) {
    issues.push({
      code: "missing_entry_node",
      severity: "error",
      message: entryNodeId ? `Entry node not found: ${entryNodeId}.` : "Entry node is not set.",
      nodeId: entryNodeId ?? undefined,
    });
  }

  for (const terminalNodeId of readStringArray(graph.terminal_node_ids)) {
    if (!nodeIds.has(terminalNodeId)) {
      issues.push({
        code: "missing_terminal_node",
        severity: "error",
        message: `Terminal node not found: ${terminalNodeId}.`,
        nodeId: terminalNodeId,
      });
    }
  }

  for (const node of nodeRecords) {
    if (node.type !== "call") {
      continue;
    }

    const nodeId = readString(node.id);
    const options = readRecordArray(node.options);
    const optionNodeMapping = isRecord(node.option_node_mapping) ? node.option_node_mapping : {};

    for (const option of options) {
      const optionId = readString(option.id);
      if (!nodeId || !optionId) {
        continue;
      }

      const mappedNodeId = readString(optionNodeMapping[optionId]);
      if (!mappedNodeId) {
        issues.push({
          code: "unmapped_call_option",
          severity: "error",
          message: `Call option ${nodeId}.${optionId} has no option_node_mapping target.`,
          nodeId,
          optionId,
        });
      }
    }
  }

  for (const edge of readEdgesForHealth(graph, edges)) {
    if (!nodeIds.has(edge.fromNodeId)) {
      issues.push({
        code: "missing_edge_source",
        severity: "error",
        message: `Edge source node not found: ${edge.fromNodeId}.`,
        edgeKey: edge.key,
        sourceNodeId: edge.fromNodeId,
      });
    }

    if (!nodeIds.has(edge.toNodeId)) {
      issues.push({
        code: "missing_edge_target",
        severity: "error",
        message: `Edge target node not found: ${edge.toNodeId}.`,
        edgeKey: edge.key,
        targetNodeId: edge.toNodeId,
      });
    }
  }

  return {
    status: issues.length === 0 ? "healthy" : "incomplete",
    issues,
    canRenderPreview: Boolean(entryNodeId && nodeIds.has(entryNodeId)),
  };
}

export function filterRenderableGraphEdges(nodes: readonly EventNode[], edges: readonly DerivedEdge[]): DerivedEdge[] {
  const nodeIds = createNodeIdSet(nodes);
  return edges.filter((edge) => nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId));
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
  const nodeId = readString((node as { id?: unknown }).id);
  if (!nodeId) {
    return [];
  }

  const edges: DerivedEdge[] = [];

  switch (node.type) {
    case "call": {
      const options = Array.isArray(node.options) ? node.options : [];
      const optionNodeMapping = isRecord(node.option_node_mapping) ? node.option_node_mapping : {};

      for (const option of options) {
        const optionId = readString(option.id);
        if (!optionId) {
          continue;
        }

        const toNodeId = readString(optionNodeMapping[optionId]);
        if (toNodeId) {
          edges.push(createEdge(nodeId, toNodeId, { kind: "option", optionId, isDefault: option.is_default === true }, readEffectRefs(option.effect_refs)));
        }
      }
      if (node.on_missed?.next_node_id) {
        edges.push(createEdge(nodeId, node.on_missed.next_node_id, { kind: "on_missed" }, readEffectRefs(node.on_missed.effect_refs)));
      }
      break;
    }
    case "wait": {
      const nextNodeId = readString(node.next_node_id);
      if (nextNodeId) {
        edges.push(createEdge(nodeId, nextNodeId, { kind: "wait_next" }));
      }
      if (node.on_interrupted?.next_node_id) {
        edges.push(createEdge(nodeId, node.on_interrupted.next_node_id, { kind: "on_interrupted" }, readEffectRefs(node.on_interrupted.effect_refs)));
      }
      break;
    }
    case "check":
      for (const branch of Array.isArray(node.branches) ? node.branches : []) {
        const branchId = readString(branch.id);
        const nextNodeId = readString(branch.next_node_id);
        if (branchId && nextNodeId) {
          edges.push(createEdge(nodeId, nextNodeId, { kind: "branch", branchId }, readEffectRefs(branch.effect_refs)));
        }
      }
      if (readString(node.default_next_node_id)) {
        edges.push(createEdge(nodeId, node.default_next_node_id, { kind: "default_branch" }));
      }
      break;
    case "random":
      for (const branch of Array.isArray(node.branches) ? node.branches : []) {
        const branchId = readString(branch.id);
        const nextNodeId = readString(branch.next_node_id);
        if (branchId && nextNodeId) {
          edges.push(createEdge(nodeId, nextNodeId, { kind: "branch", branchId, weight: branch.weight }, readEffectRefs(branch.effect_refs)));
        }
      }
      if (node.default_next_node_id) {
        edges.push(createEdge(nodeId, node.default_next_node_id, { kind: "default_branch" }));
      }
      break;
    case "action_request":
      if (node.on_accepted_node_id) {
        edges.push(createEdge(nodeId, node.on_accepted_node_id, { kind: "on_accepted" }));
      }
      if (readString(node.on_completed_node_id)) {
        edges.push(createEdge(nodeId, node.on_completed_node_id, { kind: "on_completed" }));
      }
      if (readString(node.on_failed_node_id)) {
        edges.push(createEdge(nodeId, node.on_failed_node_id, { kind: "on_failed" }));
      }
      break;
    case "objective":
      if (node.on_created_node_id) {
        edges.push(createEdge(nodeId, node.on_created_node_id, { kind: "on_created" }));
      }
      if (readString(node.on_completed_node_id)) {
        edges.push(createEdge(nodeId, node.on_completed_node_id, { kind: "on_completed" }));
      }
      if (node.on_failed_node_id) {
        edges.push(createEdge(nodeId, node.on_failed_node_id, { kind: "on_failed" }));
      }
      break;
    case "spawn_event": {
      const nextNodeId = readString(node.next_node_id);
      if (nextNodeId) {
        edges.push(createEdge(nodeId, nextNodeId, { kind: "spawn_next" }));
      }
      break;
    }
    case "log_only": {
      const nextNodeId = readString(node.next_node_id);
      if (nextNodeId) {
        edges.push(createEdge(nodeId, nextNodeId, { kind: "log_next" }, readEffectRefs(node.effect_refs)));
      }
      break;
    }
    case "end":
      break;
  }

  if (node.auto_next_node_id) {
    edges.push(createEdge(nodeId, node.auto_next_node_id, { kind: "auto_next" }));
  }
  if (node.timeout?.next_node_id) {
    edges.push(createEdge(nodeId, node.timeout.next_node_id, { kind: "timeout" }, readEffectRefs(node.timeout.effect_refs)));
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

function readEventGraphRecord(definition: unknown): Record<string, unknown> | null {
  if (!isRecord(definition) || !isRecord(definition.event_graph)) {
    return null;
  }

  return definition.event_graph;
}

function readEdgesForHealth(graph: Record<string, unknown>, edges: readonly DerivedEdge[] | undefined): DerivedEdge[] {
  if (edges) {
    return [...edges];
  }

  return [
    ...readRecordArray(graph.nodes).flatMap((node) => deriveNodeEdges(node as unknown as EventNode)),
    ...readManualEdgesForHealth(graph),
  ];
}

function readManualEdgesForHealth(graph: Record<string, unknown>): DerivedEdge[] {
  return readRecordArray(graph.edges).flatMap((edge, index): DerivedEdge[] => {
    const fromNodeId = readString(edge.from_node_id);
    const toNodeId = readString(edge.to_node_id);

    if (!fromNodeId || !toNodeId) {
      return [];
    }

    return [
      {
        fromNodeId,
        toNodeId,
        mechanism: { kind: "manual", via: readString(edge.via) },
        effectRefs: [],
        key: `graph-edge:${index}:${fromNodeId}:${toNodeId}`,
      },
    ];
  });
}

function createNodeIdSet(nodes: readonly unknown[]): Set<Id> {
  return new Set(nodes.map((node) => (isRecord(node) ? readString(node.id) : null)).filter((id): id is Id => id !== null));
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readEffectRefs(value: unknown): Id[] {
  return readStringArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
