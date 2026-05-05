import type {
  BlockingRequirement,
  CallNode,
  Condition,
  EndNode,
  EventEdge,
  EventDefinition,
  EventGraph,
  EventNode,
  EventNodeBase,
  EventNodeType,
  LogOnlyNode,
  TriggerDefinition,
  TriggerType,
  WaitNode,
  TextVariantGroup,
} from "../../../../pc-client/src/events/types";
import type {
  EventDraftEnvelope,
  EventDraftWorkingCallTemplate,
  EventDraftWorkingDefinition,
  EventEditorStep,
} from "../types";
import { triggerCapabilities } from "./capabilityCatalog";
import {
  createDefaultBlocking,
  createDefaultCallOptionTextVariantGroup,
  createDefaultGraphRules,
  createDefaultNodeTemplate,
  isSafeEventId,
} from "./templates";

type BasicFieldsUpdate = Partial<Pick<EventDefinition, "title" | "summary" | "tags">>;
type CandidateSelectionUpdate = Partial<EventDefinition["candidate_selection"]>;
type RepeatPolicyUpdate = Partial<EventDefinition["repeat_policy"]>;
type TriggerProbability = TriggerDefinition["probability"];
type EditableBasicNodeType = Extract<EventNodeType, "end" | "log_only" | "wait">;
type NodeCommonFieldsUpdate = Partial<
  Pick<EventNodeBase, "id" | "title" | "description" | "enter_effect_refs" | "exit_effect_refs" | "auto_next_node_id">
> & {
  blocking?: Partial<BlockingRequirement>;
};
type EndNodeFieldsUpdate = Partial<Omit<Pick<EndNode, "resolution" | "result_key" | "event_log_template_id" | "cleanup_policy">, "cleanup_policy">> & {
  cleanup_policy?: Partial<EndNode["cleanup_policy"]>;
};
type LogOnlyNodeFieldsUpdate = Partial<Pick<LogOnlyNode, "event_log_template_id" | "effect_refs" | "next_node_id">>;
type WaitNodeFieldsUpdate = Partial<
  Pick<WaitNode, "duration_seconds" | "wake_trigger_type" | "next_node_id" | "set_next_wakeup_at" | "interrupt_policy">
>;

const DEFAULT_CANDIDATE_SELECTION: EventDefinition["candidate_selection"] = {
  priority: 0,
  weight: 1,
  mutex_group: null,
  max_instances_per_trigger: 1,
  requires_blocking_slot: false,
};

const DEFAULT_REPEAT_POLICY: EventDefinition["repeat_policy"] = {
  scope: "event",
  max_trigger_count: null,
  cooldown_seconds: 0,
  history_key_template: "",
  allow_while_active: false,
};

export type EventAuthoringAction =
  | {
      type: "select_step";
      step: EventEditorStep;
      selection?: unknown;
    }
  | {
      type: "update_basic_fields";
      fields: BasicFieldsUpdate;
    }
  | {
      type: "update_candidate_selection";
      fields: CandidateSelectionUpdate;
    }
  | {
      type: "update_repeat_policy";
      fields: RepeatPolicyUpdate;
    }
  | {
      type: "update_trigger_type";
      triggerType: TriggerType;
    }
  | {
      type: "update_trigger_required_context";
      requiredContext: string[];
    }
  | {
      type: "update_trigger_probability";
      probability: TriggerProbability | undefined;
    }
  | {
      type: "add_trigger_condition";
      condition: Condition;
      index?: number;
    }
  | {
      type: "update_trigger_condition";
      index: number;
      condition: Condition;
    }
  | {
      type: "remove_trigger_condition";
      index: number;
    }
  | {
      type: "add_call_option";
      nodeId: string;
      optionId: string;
      nextNodeId?: string;
    }
  | {
      type: "remove_call_option";
      nodeId: string;
      optionId: string;
    }
  | {
      type: "rename_call_option";
      nodeId: string;
      fromOptionId: string;
      toOptionId: string;
    }
  | {
      type: "add_node";
      nodeType: EditableBasicNodeType;
      nodeId?: string;
    }
  | {
      type: "select_node";
      nodeId: string;
    }
  | {
      type: "update_node_common_fields";
      nodeId: string;
      fields: NodeCommonFieldsUpdate;
    }
  | {
      type: "update_end_node";
      nodeId: string;
      fields: EndNodeFieldsUpdate;
    }
  | {
      type: "update_log_only_node";
      nodeId: string;
      fields: LogOnlyNodeFieldsUpdate;
    }
  | {
      type: "update_wait_node";
      nodeId: string;
      fields: WaitNodeFieldsUpdate;
    }
  | {
      type: "delete_node";
      nodeId: string;
    };

export function eventAuthoringReducer(draft: EventDraftEnvelope, action: EventAuthoringAction): EventDraftEnvelope {
  switch (action.type) {
    case "select_step":
      return selectStep(draft, action.step, action.selection);
    case "update_basic_fields":
      return updateBasicFields(draft, action.fields);
    case "update_candidate_selection":
      return updateCandidateSelection(draft, action.fields);
    case "update_repeat_policy":
      return updateRepeatPolicy(draft, action.fields);
    case "update_trigger_type":
      return updateTriggerType(draft, action.triggerType);
    case "update_trigger_required_context":
      return updateTriggerRequiredContext(draft, action.requiredContext);
    case "update_trigger_probability":
      return updateTriggerProbability(draft, action.probability);
    case "add_trigger_condition":
      return addTriggerCondition(draft, action.condition, action.index);
    case "update_trigger_condition":
      return updateTriggerCondition(draft, action.index, action.condition);
    case "remove_trigger_condition":
      return removeTriggerCondition(draft, action.index);
    case "add_call_option":
      return addCallOption(draft, action.nodeId, action.optionId, action.nextNodeId);
    case "remove_call_option":
      return removeCallOption(draft, action.nodeId, action.optionId);
    case "rename_call_option":
      return renameCallOption(draft, action.nodeId, action.fromOptionId, action.toOptionId);
    case "add_node":
      return addNode(draft, action.nodeType, action.nodeId);
    case "select_node":
      return selectNode(draft, action.nodeId);
    case "update_node_common_fields":
      return updateNodeCommonFields(draft, action.nodeId, action.fields);
    case "update_end_node":
      return updateEndNode(draft, action.nodeId, action.fields);
    case "update_log_only_node":
      return updateLogOnlyNode(draft, action.nodeId, action.fields);
    case "update_wait_node":
      return updateWaitNode(draft, action.nodeId, action.fields);
    case "delete_node":
      return deleteNode(draft, action.nodeId);
  }
}

function selectStep(draft: EventDraftEnvelope, step: EventEditorStep, selection: unknown | undefined): EventDraftEnvelope {
  return {
    ...draft,
    editor_state: {
      ...draft.editor_state,
      active_step: step,
      selection: selection ?? null,
    },
  };
}

function updateBasicFields(draft: EventDraftEnvelope, fields: BasicFieldsUpdate): EventDraftEnvelope {
  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      ...fields,
      id: draft.working_definition.id,
      domain: draft.working_definition.domain,
    },
  };
}

function updateCandidateSelection(draft: EventDraftEnvelope, fields: CandidateSelectionUpdate): EventDraftEnvelope {
  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      candidate_selection: {
        ...DEFAULT_CANDIDATE_SELECTION,
        ...draft.working_definition.candidate_selection,
        ...fields,
      },
    },
  };
}

function updateRepeatPolicy(draft: EventDraftEnvelope, fields: RepeatPolicyUpdate): EventDraftEnvelope {
  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      repeat_policy: {
        ...DEFAULT_REPEAT_POLICY,
        ...draft.working_definition.repeat_policy,
        ...fields,
      },
    },
  };
}

function updateTriggerType(draft: EventDraftEnvelope, triggerType: TriggerType): EventDraftEnvelope {
  const currentTrigger = getWorkingTrigger(draft);
  const template = clonePlain(getTriggerTemplate(triggerType));
  const currentConditions = currentTrigger.conditions;

  return updateWorkingTrigger(draft, {
    ...currentTrigger,
    ...template,
    conditions: Array.isArray(currentConditions) ? clonePlain(currentConditions) : (template.conditions ?? []),
  });
}

function updateTriggerRequiredContext(draft: EventDraftEnvelope, requiredContext: string[]): EventDraftEnvelope {
  return updateWorkingTrigger(draft, {
    ...getWorkingTrigger(draft),
    required_context: [...requiredContext],
  });
}

function updateTriggerProbability(
  draft: EventDraftEnvelope,
  probability: TriggerProbability | undefined,
): EventDraftEnvelope {
  const currentTrigger = getWorkingTrigger(draft);

  if (probability === undefined) {
    const { probability: _removedProbability, ...triggerWithoutProbability } = currentTrigger;
    return updateWorkingTrigger(draft, triggerWithoutProbability);
  }

  return updateWorkingTrigger(draft, {
    ...currentTrigger,
    probability: clonePlain(probability),
  });
}

function addTriggerCondition(
  draft: EventDraftEnvelope,
  condition: Condition,
  index: number | undefined,
): EventDraftEnvelope {
  const currentTrigger = getWorkingTrigger(draft);
  const conditions = [...(currentTrigger.conditions ?? [])];
  const insertIndex = clampInsertIndex(index ?? conditions.length, conditions.length);

  conditions.splice(insertIndex, 0, clonePlain(condition));

  return updateWorkingTrigger(draft, {
    ...currentTrigger,
    conditions,
  });
}

function updateTriggerCondition(
  draft: EventDraftEnvelope,
  index: number,
  condition: Condition,
): EventDraftEnvelope {
  const currentTrigger = getWorkingTrigger(draft);
  const conditions = [...(currentTrigger.conditions ?? [])];

  requireConditionIndex(conditions, index, "update");
  conditions[index] = clonePlain(condition);

  return updateWorkingTrigger(draft, {
    ...currentTrigger,
    conditions,
  });
}

function removeTriggerCondition(draft: EventDraftEnvelope, index: number): EventDraftEnvelope {
  const currentTrigger = getWorkingTrigger(draft);
  const conditions = [...(currentTrigger.conditions ?? [])];

  requireConditionIndex(conditions, index, "remove");
  conditions.splice(index, 1);

  return updateWorkingTrigger(draft, {
    ...currentTrigger,
    conditions,
  });
}

function addCallOption(
  draft: EventDraftEnvelope,
  nodeId: string,
  optionId: string,
  nextNodeId: string | undefined,
): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const callNode = requireCallNode(graph, nodeId);

  if (callNode.options.some((option) => option.id === optionId)) {
    throw new Error(`Call option "${optionId}" already exists on call node "${nodeId}".`);
  }

  const resolvedNextNodeId = nextNodeId ?? getDefaultNextNodeId(graph, callNode);
  const updatedNode: CallNode = {
    ...callNode,
    options: [...callNode.options, { id: optionId }],
    option_node_mapping: {
      ...callNode.option_node_mapping,
      [optionId]: resolvedNextNodeId,
    },
  };
  const updatedGraph: EventGraph = {
    ...replaceNode(graph, updatedNode),
    edges: appendEdgeIfMissing(graph.edges, {
      from_node_id: nodeId,
      to_node_id: resolvedNextNodeId,
      via: optionId,
    }),
  };

  return updateDraftGraphAndTemplates(
    draft,
    updatedGraph,
    updateCallTemplate(draft.working_call_templates, callNode.call_template_id, (template) => {
      const optionLines = getOptionLines(template);

      if (Object.prototype.hasOwnProperty.call(optionLines, optionId)) {
        throw new Error(`Call template "${callNode.call_template_id}" already has option line "${optionId}".`);
      }

      return {
        ...template,
        option_lines: {
          ...optionLines,
          [optionId]: createDefaultCallOptionTextVariantGroup(optionId),
        },
      };
    }),
  );
}

function removeCallOption(draft: EventDraftEnvelope, nodeId: string, optionId: string): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const callNode = requireCallNode(graph, nodeId);

  if (!callNode.options.some((option) => option.id === optionId)) {
    throw new Error(`Call option "${optionId}" does not exist on call node "${nodeId}".`);
  }

  const updatedNode: CallNode = {
    ...callNode,
    options: callNode.options.filter((option) => option.id !== optionId),
    option_node_mapping: omitRecordKey(callNode.option_node_mapping, optionId),
  };
  const updatedGraph: EventGraph = {
    ...replaceNode(graph, updatedNode),
    edges: graph.edges.filter((edge) => !(edge.from_node_id === nodeId && edge.via === optionId)),
  };

  return updateDraftGraphAndTemplates(
    draft,
    updatedGraph,
    updateCallTemplate(draft.working_call_templates, callNode.call_template_id, (template) => ({
      ...template,
      option_lines: omitRecordKey(getOptionLines(template), optionId),
    })),
  );
}

function renameCallOption(
  draft: EventDraftEnvelope,
  nodeId: string,
  fromOptionId: string,
  toOptionId: string,
): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const callNode = requireCallNode(graph, nodeId);

  if (!callNode.options.some((option) => option.id === fromOptionId)) {
    throw new Error(`Call option "${fromOptionId}" does not exist on call node "${nodeId}".`);
  }
  if (callNode.options.some((option) => option.id === toOptionId)) {
    throw new Error(`Call option "${toOptionId}" already exists on call node "${nodeId}".`);
  }
  if (!Object.prototype.hasOwnProperty.call(callNode.option_node_mapping, fromOptionId)) {
    throw new Error(`Call node "${nodeId}" is missing option mapping "${fromOptionId}".`);
  }

  const updatedNode: CallNode = {
    ...callNode,
    options: callNode.options.map((option) => (option.id === fromOptionId ? { ...option, id: toOptionId } : option)),
    option_node_mapping: renameRecordKey(callNode.option_node_mapping, fromOptionId, toOptionId),
  };
  const updatedGraph: EventGraph = {
    ...replaceNode(graph, updatedNode),
    edges: graph.edges.map((edge) =>
      edge.from_node_id === nodeId && edge.via === fromOptionId
        ? {
            ...edge,
            via: toOptionId,
          }
        : edge,
    ),
  };

  return updateDraftGraphAndTemplates(
    draft,
    updatedGraph,
    updateCallTemplate(draft.working_call_templates, callNode.call_template_id, (template) => {
      const optionLines = getOptionLines(template);

      if (!Object.prototype.hasOwnProperty.call(optionLines, fromOptionId)) {
        throw new Error(`Call template "${callNode.call_template_id}" is missing option line "${fromOptionId}".`);
      }
      if (Object.prototype.hasOwnProperty.call(optionLines, toOptionId)) {
        throw new Error(`Call template "${callNode.call_template_id}" already has option line "${toOptionId}".`);
      }

      return {
        ...template,
        option_lines: renameRecordKey(optionLines, fromOptionId, toOptionId),
      };
    }),
  );
}

function addNode(
  draft: EventDraftEnvelope,
  nodeType: EditableBasicNodeType,
  requestedNodeId: string | undefined,
): EventDraftEnvelope {
  const graph = getGraphOrDefault(draft);
  const nodeId = requestedNodeId?.trim() || createUniqueNodeId(graph, nodeType);

  requireSafeUniqueNodeId(graph, nodeId);

  const node = createDefaultNodeTemplate({
    type: nodeType,
    eventDefinitionId: getEventDefinitionId(draft),
    nodeId,
    nextNodeId: getDefaultTransitionTargetNodeId(graph, nodeId),
  });
  const updatedGraph: EventGraph = {
    ...graph,
    entry_node_id: graph.entry_node_id || nodeId,
    nodes: [...graph.nodes, node],
    terminal_node_ids: node.type === "end" ? appendIdIfMissing(graph.terminal_node_ids, nodeId) : graph.terminal_node_ids,
  };

  return updateDraftGraph(draft, updatedGraph, nodeId);
}

function selectNode(draft: EventDraftEnvelope, nodeId: string): EventDraftEnvelope {
  const graph = requireGraph(draft);
  requireNode(graph, nodeId);

  return {
    ...draft,
    editor_state: createGraphNodeSelectionState(draft, nodeId),
  };
}

function updateNodeCommonFields(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: NodeCommonFieldsUpdate,
): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireNode(graph, nodeId);
  const nextNodeId = fields.id?.trim() || node.id;

  if (nextNodeId !== node.id) {
    requireSafeUniqueNodeId(graph, nextNodeId, node.id);
  }

  const updatedNode = {
    ...node,
    id: nextNodeId,
    title: fields.title ?? node.title,
    description: hasOwn(fields, "description") ? normalizeOptionalString(fields.description) : node.description,
    enter_effect_refs: fields.enter_effect_refs ? [...fields.enter_effect_refs] : node.enter_effect_refs,
    exit_effect_refs: fields.exit_effect_refs ? [...fields.exit_effect_refs] : node.exit_effect_refs,
    auto_next_node_id: hasOwn(fields, "auto_next_node_id")
      ? normalizeOptionalString(fields.auto_next_node_id ?? undefined)
      : node.auto_next_node_id,
    blocking: fields.blocking
      ? {
          ...createDefaultBlocking(),
          ...node.blocking,
          ...fields.blocking,
        }
      : node.blocking,
  } as EventNode;

  return updateDraftGraph(draft, replaceNode(graph, updatedNode, nodeId), nextNodeId);
}

function updateEndNode(draft: EventDraftEnvelope, nodeId: string, fields: EndNodeFieldsUpdate): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "end");
  const { cleanup_policy: cleanupPolicyFields, ...flatFields } = fields;
  const updatedNode: EndNode = {
    ...node,
    ...flatFields,
    cleanup_policy: cleanupPolicyFields
      ? {
          ...node.cleanup_policy,
          ...cleanupPolicyFields,
        }
      : node.cleanup_policy,
  };

  return updateDraftGraph(draft, replaceNode(graph, updatedNode), nodeId);
}

function updateLogOnlyNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: LogOnlyNodeFieldsUpdate,
): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "log_only");
  const updatedNode: LogOnlyNode = {
    ...node,
    ...fields,
    effect_refs: fields.effect_refs ? [...fields.effect_refs] : node.effect_refs,
  };

  return updateDraftGraph(draft, replaceNode(graph, updatedNode), nodeId);
}

function updateWaitNode(draft: EventDraftEnvelope, nodeId: string, fields: WaitNodeFieldsUpdate): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "wait");
  const updatedNode: WaitNode = {
    ...node,
    ...fields,
  };

  return updateDraftGraph(draft, replaceNode(graph, updatedNode), nodeId);
}

function deleteNode(draft: EventDraftEnvelope, nodeId: string): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Event graph is missing node "${nodeId}".`);
  }

  const remainingNodes = graph.nodes.filter((candidate) => candidate.id !== nodeId);
  const updatedGraph: EventGraph = {
    ...graph,
    nodes: remainingNodes,
  };
  let workingDefinition: EventDraftWorkingDefinition = {
    ...draft.working_definition,
    event_graph: updatedGraph,
  };
  let workingCallTemplates = draft.working_call_templates;

  if (node.type === "call") {
    workingCallTemplates = workingCallTemplates.filter((template) => template.id !== node.call_template_id);
    workingDefinition = removeCallTemplateRef(workingDefinition, node.call_template_id);
  }

  return {
    ...draft,
    working_definition: workingDefinition,
    working_call_templates: workingCallTemplates,
    editor_state: createGraphNodeSelectionState(draft, remainingNodes[0]?.id ?? null),
  };
}

function updateDraftGraph(
  draft: EventDraftEnvelope,
  graph: EventGraph,
  selectedNodeId: string | null = null,
): EventDraftEnvelope {
  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      event_graph: graph,
    },
    editor_state: createGraphNodeSelectionState(draft, selectedNodeId),
  };
}

function updateDraftGraphAndTemplates(
  draft: EventDraftEnvelope,
  graph: EventGraph,
  workingCallTemplates: EventDraftWorkingCallTemplate[],
): EventDraftEnvelope {
  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      event_graph: graph,
    },
    working_call_templates: workingCallTemplates,
  };
}

function requireGraph(draft: EventDraftEnvelope): EventGraph {
  const graph = draft.working_definition.event_graph;

  if (!graph) {
    throw new Error("Event draft is missing an event graph.");
  }

  return graph;
}

function getGraphOrDefault(draft: EventDraftEnvelope): EventGraph {
  return (
    draft.working_definition.event_graph ?? {
      entry_node_id: "",
      nodes: [],
      edges: [],
      terminal_node_ids: [],
      graph_rules: createDefaultGraphRules(),
    }
  );
}

function getWorkingTrigger(draft: EventDraftEnvelope): TriggerDefinition {
  const trigger = draft.working_definition.trigger;

  if (trigger) {
    return trigger;
  }

  return clonePlain(getTriggerTemplate("arrival"));
}

function getTriggerTemplate(triggerType: TriggerType): TriggerDefinition {
  const capability = triggerCapabilities.find((candidate) => candidate.type === triggerType);

  if (!capability) {
    throw new Error(`Unknown trigger capability: ${triggerType}`);
  }

  return capability.template;
}

function updateWorkingTrigger(draft: EventDraftEnvelope, trigger: TriggerDefinition): EventDraftEnvelope {
  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      trigger,
    },
  };
}

function clampInsertIndex(index: number, length: number): number {
  if (!Number.isInteger(index)) {
    return length;
  }

  return Math.min(Math.max(index, 0), length);
}

function requireConditionIndex(conditions: Condition[], index: number, action: "update" | "remove"): void {
  if (!Number.isInteger(index) || index < 0 || index >= conditions.length) {
    throw new Error(`Cannot ${action} trigger condition at index ${index}.`);
  }
}

function requireCallNode(graph: EventGraph, nodeId: string): CallNode {
  const node = requireNode(graph, nodeId);
  if (node.type !== "call") {
    throw new Error(`Event graph node "${nodeId}" is not a call node.`);
  }

  return node;
}

function requireTypedNode<TType extends EventNode["type"]>(
  graph: EventGraph,
  nodeId: string,
  type: TType,
): Extract<EventNode, { type: TType }> {
  const node = requireNode(graph, nodeId);

  if (node.type !== type) {
    throw new Error(`Event graph node "${nodeId}" is not a ${type} node.`);
  }

  return node as Extract<EventNode, { type: TType }>;
}

function requireNode(graph: EventGraph, nodeId: string): EventNode {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Event graph is missing node "${nodeId}".`);
  }

  return node;
}

function replaceNode(graph: EventGraph, updatedNode: EventNode, replacedNodeId = updatedNode.id): EventGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === replacedNodeId ? updatedNode : node)),
  };
}

function updateCallTemplate(
  templates: EventDraftWorkingCallTemplate[],
  templateId: string,
  update: (template: EventDraftWorkingCallTemplate) => EventDraftWorkingCallTemplate,
): EventDraftWorkingCallTemplate[] {
  let foundTemplate = false;

  const updatedTemplates = templates.map((template) => {
    if (template.id !== templateId) {
      return template;
    }

    foundTemplate = true;
    return update(template);
  });

  if (!foundTemplate) {
    throw new Error(`Event draft is missing call template "${templateId}".`);
  }

  return updatedTemplates;
}

function getOptionLines(template: EventDraftWorkingCallTemplate): Record<string, TextVariantGroup> {
  return template.option_lines ?? {};
}

function appendEdgeIfMissing(edges: EventEdge[], nextEdge: EventEdge): EventEdge[] {
  if (
    edges.some(
      (edge) =>
        edge.from_node_id === nextEdge.from_node_id && edge.to_node_id === nextEdge.to_node_id && edge.via === nextEdge.via,
    )
  ) {
    return edges;
  }

  return [...edges, nextEdge];
}

function omitRecordKey<T>(record: Record<string, T>, keyToOmit: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== keyToOmit));
}

function renameRecordKey<T>(record: Record<string, T>, fromKey: string, toKey: string): Record<string, T> {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key === fromKey ? toKey : key, value]));
}

function getDefaultNextNodeId(graph: EventGraph, callNode: CallNode): string {
  const firstMappedNodeId = Object.values(callNode.option_node_mapping)[0];

  if (firstMappedNodeId) {
    return firstMappedNodeId;
  }

  const firstTerminalNodeId = graph.terminal_node_ids[0];

  if (firstTerminalNodeId) {
    return firstTerminalNodeId;
  }

  throw new Error(`Call node "${callNode.id}" needs a next node id for the new option.`);
}

function removeCallTemplateRef(
  workingDefinition: EventDraftWorkingDefinition,
  callTemplateId: string,
): EventDraftWorkingDefinition {
  const callTemplateIds = workingDefinition.content_refs?.call_template_ids;

  if (!callTemplateIds) {
    return workingDefinition;
  }

  return {
    ...workingDefinition,
    content_refs: {
      ...workingDefinition.content_refs,
      call_template_ids: callTemplateIds.filter((candidate) => candidate !== callTemplateId),
    },
  };
}

function createGraphNodeSelectionState(draft: EventDraftEnvelope, nodeId: string | null): EventDraftEnvelope["editor_state"] {
  return {
    ...draft.editor_state,
    active_step: "graph",
    selection: nodeId ? { step: "graph", nodeId } : { step: "graph" },
  };
}

function createUniqueNodeId(graph: EventGraph, nodeType: EditableBasicNodeType): string {
  let index = 1;
  let candidate: string = nodeType;
  const existingNodeIds = new Set(graph.nodes.map((node) => node.id));

  while (existingNodeIds.has(candidate)) {
    index += 1;
    candidate = `${nodeType}_${index}`;
  }

  return candidate;
}

function requireSafeUniqueNodeId(graph: EventGraph, nodeId: string, currentNodeId?: string): void {
  if (!isSafeEventId(nodeId)) {
    throw new Error(`Node id "${nodeId}" must use lowercase letters, numbers, underscores, or hyphens.`);
  }

  if (nodeId !== currentNodeId && graph.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`Event graph already has node "${nodeId}".`);
  }
}

function getEventDefinitionId(draft: EventDraftEnvelope): string {
  return typeof draft.working_definition.id === "string" && draft.working_definition.id
    ? draft.working_definition.id
    : draft.target.definition_id;
}

function getDefaultTransitionTargetNodeId(graph: EventGraph, nodeId: string): string {
  return graph.terminal_node_ids.find((terminalNodeId) => terminalNodeId !== nodeId) ?? graph.nodes[0]?.id ?? nodeId;
}

function appendIdIfMissing(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function hasOwn<T extends object, TKey extends PropertyKey>(value: T, key: TKey): value is T & Record<TKey, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
