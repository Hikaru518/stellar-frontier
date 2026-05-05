import type {
  CallNode,
  EventEdge,
  EventDefinition,
  EventGraph,
  EventNode,
  TextVariantGroup,
} from "../../../../pc-client/src/events/types";
import type {
  EventDraftEnvelope,
  EventDraftWorkingCallTemplate,
  EventDraftWorkingDefinition,
  EventEditorStep,
} from "../types";
import { createDefaultCallOptionTextVariantGroup } from "./templates";

type BasicFieldsUpdate = Partial<Pick<EventDefinition, "title" | "summary" | "tags">>;
type CandidateSelectionUpdate = Partial<EventDefinition["candidate_selection"]>;
type RepeatPolicyUpdate = Partial<EventDefinition["repeat_policy"]>;

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
    case "add_call_option":
      return addCallOption(draft, action.nodeId, action.optionId, action.nextNodeId);
    case "remove_call_option":
      return removeCallOption(draft, action.nodeId, action.optionId);
    case "rename_call_option":
      return renameCallOption(draft, action.nodeId, action.fromOptionId, action.toOptionId);
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

function deleteNode(draft: EventDraftEnvelope, nodeId: string): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Event graph is missing node "${nodeId}".`);
  }

  const remainingNodes = graph.nodes.filter((candidate) => candidate.id !== nodeId);
  const updatedGraph: EventGraph = {
    ...graph,
    entry_node_id: graph.entry_node_id === nodeId ? getReplacementEntryNodeId(remainingNodes, nodeId) : graph.entry_node_id,
    nodes: remainingNodes,
    edges: graph.edges.filter((edge) => edge.from_node_id !== nodeId && edge.to_node_id !== nodeId),
    terminal_node_ids: graph.terminal_node_ids.filter((terminalNodeId) => terminalNodeId !== nodeId),
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

function requireCallNode(graph: EventGraph, nodeId: string): CallNode {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Event graph is missing node "${nodeId}".`);
  }
  if (node.type !== "call") {
    throw new Error(`Event graph node "${nodeId}" is not a call node.`);
  }

  return node;
}

function replaceNode(graph: EventGraph, updatedNode: EventNode): EventGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (node.id === updatedNode.id ? updatedNode : node)),
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

function getReplacementEntryNodeId(nodes: EventNode[], deletedNodeId: string): string {
  const replacementNodeId = nodes[0]?.id;

  if (!replacementNodeId) {
    throw new Error(`Cannot delete the only event graph node "${deletedNodeId}".`);
  }

  return replacementNodeId;
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
