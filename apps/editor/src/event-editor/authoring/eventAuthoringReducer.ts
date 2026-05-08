import type {
  ActionRequestNode,
  BlockingRequirement,
  CallNode,
  CallOption,
  CheckNode,
  Condition,
  Effect,
  EffectGroup,
  EndNode,
  EventEdge,
  EventDefinition,
  EventGraph,
  EventLogTemplate,
  EventNode,
  EventNodeBase,
  EventNodeType,
  JsonObject,
  LogOnlyNode,
  ObjectiveNode,
  ObjectiveTemplate,
  RandomNode,
  SpawnEventNode,
  TargetRef,
  TriggerDefinition,
  TriggerType,
  WaitNode,
  TextVariantGroup,
} from "../../../../pc-client/src/events/types";
import type {
  EventDraftEnvelope,
  EventDraftWorkingCallTemplate,
  EventDraftWorkingDefinition,
  EventEditorIssue,
  EventEditorStep,
} from "../types";
import { triggerCapabilities } from "./capabilityCatalog";
import {
  createDefaultBlocking,
  createDefaultCallOptionTextVariantGroup,
  createDefaultCallTemplateShell,
  createDefaultGraphRules,
  createDefaultNodeTemplate,
  isSafeEventId,
} from "./templates";

type BasicFieldsUpdate = Partial<Pick<EventDefinition, "title" | "summary" | "tags">>;
type CandidateSelectionUpdate = Partial<EventDefinition["candidate_selection"]>;
type RepeatPolicyUpdate = Partial<EventDefinition["repeat_policy"]>;
type TriggerProbability = TriggerDefinition["probability"];
type EditableGraphNodeType = Extract<
  EventNodeType,
  "call" | "check" | "random" | "action_request" | "objective" | "spawn_event" | "end" | "log_only" | "wait"
>;
type NodeCommonFieldsUpdate = Partial<
  Pick<EventNodeBase, "id" | "title" | "description" | "enter_effect_refs" | "exit_effect_refs" | "auto_next_node_id">
> & {
  blocking?: Partial<BlockingRequirement>;
};
type EndNodeFieldsUpdate = Partial<Omit<Pick<EndNode, "resolution" | "result_key" | "event_log_template_id" | "cleanup_policy">, "cleanup_policy">> & {
  final_effect_refs?: EndNode["final_effect_refs"];
  history_writes?: EndNode["history_writes"];
  cleanup_policy?: Partial<EndNode["cleanup_policy"]>;
};
type LogOnlyNodeFieldsUpdate = Partial<Pick<LogOnlyNode, "event_log_template_id" | "effect_refs" | "history_writes" | "next_node_id">>;
type WaitNodeFieldsUpdate = Partial<
  Pick<WaitNode, "duration_seconds" | "wake_trigger_type" | "next_node_id" | "set_next_wakeup_at" | "interrupt_policy">
>;
type CallNodeFieldsUpdate = Partial<Pick<CallNode, "speaker_crew_ref" | "urgency" | "delivery" | "expires_in_seconds" | "on_missed">>;
type CallOptionFieldsUpdate = Partial<Pick<CallOption, "requirements" | "effect_refs" | "is_default">> & {
  next_node_id?: string;
};
type CheckNodeFieldsUpdate = Partial<Pick<CheckNode, "branches" | "default_next_node_id" | "evaluation_order">>;
type RandomNodeFieldsUpdate = Partial<Pick<RandomNode, "seed_scope" | "branches" | "default_next_node_id" | "store_result_as">>;
type ActionRequestNodeFieldsUpdate = Partial<
  Pick<
    ActionRequestNode,
    | "request_id"
    | "action_type"
    | "target_crew_ref"
    | "target_tile_ref"
    | "action_params"
    | "acceptance_conditions"
    | "completion_trigger"
    | "on_accepted_node_id"
    | "on_completed_node_id"
    | "on_failed_node_id"
    | "expires_in_seconds"
    | "occupies_crew_action"
  >
>;
type ObjectiveTemplateFieldsUpdate = Partial<ObjectiveTemplate>;
type ObjectiveNodeFieldsUpdate = Partial<
  Pick<
    ObjectiveNode,
    "mode" | "on_created_node_id" | "on_completed_node_id" | "on_failed_node_id" | "expires_in_seconds" | "parent_event_link"
  >
> & {
  objective_template?: ObjectiveTemplateFieldsUpdate;
};
type SpawnEventNodeFieldsUpdate = Partial<
  Pick<
    SpawnEventNode,
    "event_definition_id" | "spawn_policy" | "context_mapping" | "parent_event_link" | "dedupe_key_template" | "next_node_id"
  >
>;
type EffectGroupFieldsUpdate = Partial<Pick<EffectGroup, "id" | "description">>;
type EffectFieldsUpdate = Partial<Effect>;
type LogTemplateFieldsUpdate = Partial<EventLogTemplate>;
type EditorLocation = NonNullable<EventEditorIssue["editor_location"]>;

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
      type: "jump_to_editor_location";
      location: EditorLocation | null | undefined;
      jsonPath?: string;
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
      nodeType: EditableGraphNodeType;
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
      preserveEditorState?: boolean;
    }
  | {
      type: "update_log_only_node";
      nodeId: string;
      fields: LogOnlyNodeFieldsUpdate;
      preserveEditorState?: boolean;
    }
  | {
      type: "update_wait_node";
      nodeId: string;
      fields: WaitNodeFieldsUpdate;
    }
  | {
      type: "update_call_node";
      nodeId: string;
      fields: CallNodeFieldsUpdate;
    }
  | {
      type: "update_call_option";
      nodeId: string;
      optionId: string;
      fields: CallOptionFieldsUpdate;
    }
  | {
      type: "update_check_node";
      nodeId: string;
      fields: CheckNodeFieldsUpdate;
    }
  | {
      type: "update_random_node";
      nodeId: string;
      fields: RandomNodeFieldsUpdate;
    }
  | {
      type: "update_action_request_node";
      nodeId: string;
      fields: ActionRequestNodeFieldsUpdate;
    }
  | {
      type: "update_objective_node";
      nodeId: string;
      fields: ObjectiveNodeFieldsUpdate;
    }
  | {
      type: "update_spawn_event_node";
      nodeId: string;
      fields: SpawnEventNodeFieldsUpdate;
    }
  | {
      type: "delete_node";
      nodeId: string;
    }
  | {
      type: "add_effect_group";
      groupId?: string;
    }
  | {
      type: "update_effect_group";
      groupId: string;
      fields: EffectGroupFieldsUpdate;
    }
  | {
      type: "remove_effect_group";
      groupId: string;
    }
  | {
      type: "add_effect";
      groupId: string;
      effect: Effect;
    }
  | {
      type: "update_effect";
      groupId: string;
      effectId: string;
      fields: EffectFieldsUpdate;
    }
  | {
      type: "remove_effect";
      groupId: string;
      effectId: string;
    }
  | {
      type: "add_log_template";
      logTemplateId?: string;
    }
  | {
      type: "update_log_template";
      logTemplateId: string;
      fields: LogTemplateFieldsUpdate;
    }
  | {
      type: "remove_log_template";
      logTemplateId: string;
    };

export function eventAuthoringReducer(draft: EventDraftEnvelope, action: EventAuthoringAction): EventDraftEnvelope {
  switch (action.type) {
    case "select_step":
      return selectStep(draft, action.step, action.selection);
    case "jump_to_editor_location":
      return jumpToEditorLocation(draft, action.location, action.jsonPath);
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
      return updateEndNode(draft, action.nodeId, action.fields, action.preserveEditorState);
    case "update_log_only_node":
      return updateLogOnlyNode(draft, action.nodeId, action.fields, action.preserveEditorState);
    case "update_wait_node":
      return updateWaitNode(draft, action.nodeId, action.fields);
    case "update_call_node":
      return updateCallNode(draft, action.nodeId, action.fields);
    case "update_call_option":
      return updateCallOption(draft, action.nodeId, action.optionId, action.fields);
    case "update_check_node":
      return updateCheckNode(draft, action.nodeId, action.fields);
    case "update_random_node":
      return updateRandomNode(draft, action.nodeId, action.fields);
    case "update_action_request_node":
      return updateActionRequestNode(draft, action.nodeId, action.fields);
    case "update_objective_node":
      return updateObjectiveNode(draft, action.nodeId, action.fields);
    case "update_spawn_event_node":
      return updateSpawnEventNode(draft, action.nodeId, action.fields);
    case "delete_node":
      return deleteNode(draft, action.nodeId);
    case "add_effect_group":
      return addEffectGroup(draft, action.groupId);
    case "update_effect_group":
      return updateEffectGroup(draft, action.groupId, action.fields);
    case "remove_effect_group":
      return removeEffectGroup(draft, action.groupId);
    case "add_effect":
      return addEffect(draft, action.groupId, action.effect);
    case "update_effect":
      return updateEffect(draft, action.groupId, action.effectId, action.fields);
    case "remove_effect":
      return removeEffect(draft, action.groupId, action.effectId);
    case "add_log_template":
      return addLogTemplate(draft, action.logTemplateId);
    case "update_log_template":
      return updateLogTemplateFields(draft, action.logTemplateId, action.fields);
    case "remove_log_template":
      return removeLogTemplate(draft, action.logTemplateId);
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

function jumpToEditorLocation(
  draft: EventDraftEnvelope,
  location: EditorLocation | null | undefined,
  jsonPath: string | undefined,
): EventDraftEnvelope {
  if (!location) {
    return selectStep(draft, "review", {
      step: "review",
      fieldPath: jsonPath ?? null,
    });
  }

  return selectStep(draft, location.step, {
    step: location.step,
    section: location.section ?? null,
    nodeId: location.node_id ?? null,
    optionId: location.option_id ?? null,
    effectGroupId: location.effect_group_id ?? null,
    effectId: location.effect_id ?? null,
    callTemplateId: location.call_template_id ?? null,
    fieldPath: location.field_path ?? jsonPath ?? null,
  });
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
  nodeType: EditableGraphNodeType,
  requestedNodeId: string | undefined,
): EventDraftEnvelope {
  const graph = getGraphOrDefault(draft);
  const nodeId = requestedNodeId?.trim() || createUniqueNodeId(graph, nodeType);
  const nextNodeId = getDefaultTransitionTargetNodeId(graph, nodeId);

  requireSafeUniqueNodeId(graph, nodeId);

  const node = createDefaultNodeTemplate({
    type: nodeType,
    eventDefinitionId: getEventDefinitionId(draft),
    nodeId,
    nextNodeId,
  });
  const updatedGraph: EventGraph = {
    ...graph,
    entry_node_id: graph.entry_node_id || nodeId,
    nodes: [...graph.nodes, node],
    terminal_node_ids: node.type === "end" ? appendIdIfMissing(graph.terminal_node_ids, nodeId) : graph.terminal_node_ids,
  };

  if (node.type === "call") {
    const callTemplate: EventDraftWorkingCallTemplate = {
      ...createDefaultCallTemplateShell({
        domain: draft.target.domain,
        eventDefinitionId: getEventDefinitionId(draft),
        nodeId,
      }),
    };

    return {
      ...draft,
      working_definition: appendCallTemplateRef(
        {
          ...draft.working_definition,
          event_graph: updatedGraph,
        },
        node.call_template_id,
      ),
      working_call_templates: [...draft.working_call_templates, callTemplate],
      editor_state: createGraphNodeSelectionState(draft, nodeId),
    };
  }

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

function updateEndNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: EndNodeFieldsUpdate,
  preserveEditorState = false,
): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "end");
  const { cleanup_policy: cleanupPolicyFields, ...flatFields } = fields;
  const updatedNode: EndNode = {
    ...node,
    ...flatFields,
    final_effect_refs: fields.final_effect_refs ? [...fields.final_effect_refs] : node.final_effect_refs,
    history_writes: fields.history_writes ? clonePlain(fields.history_writes) : node.history_writes,
    cleanup_policy: cleanupPolicyFields
      ? {
          ...node.cleanup_policy,
          ...cleanupPolicyFields,
        }
      : node.cleanup_policy,
  };

  return updateDraftGraph(draft, replaceNode(graph, updatedNode), nodeId, preserveEditorState);
}

function updateLogOnlyNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: LogOnlyNodeFieldsUpdate,
  preserveEditorState = false,
): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "log_only");
  const updatedNode: LogOnlyNode = {
    ...node,
    ...fields,
    effect_refs: fields.effect_refs ? [...fields.effect_refs] : node.effect_refs,
    history_writes: fields.history_writes ? clonePlain(fields.history_writes) : node.history_writes,
  };

  return updateDraftGraph(draft, replaceNode(graph, updatedNode), nodeId, preserveEditorState);
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

function updateCallNode(draft: EventDraftEnvelope, nodeId: string, fields: CallNodeFieldsUpdate): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "call");
  const updatedNode: CallNode = {
    ...node,
    speaker_crew_ref: fields.speaker_crew_ref ? clonePlain(fields.speaker_crew_ref) : node.speaker_crew_ref,
    urgency: fields.urgency ?? node.urgency,
    delivery: fields.delivery ?? node.delivery,
    expires_in_seconds: hasOwn(fields, "expires_in_seconds") ? (fields.expires_in_seconds ?? null) : node.expires_in_seconds,
    on_missed: hasOwn(fields, "on_missed") ? normalizeCallOnMissed(fields.on_missed) : node.on_missed,
  };

  return updateDraftGraph(draft, replaceNode(graph, updatedNode), nodeId);
}

function updateCallOption(
  draft: EventDraftEnvelope,
  nodeId: string,
  optionId: string,
  fields: CallOptionFieldsUpdate,
): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "call");

  if (!node.options.some((option) => option.id === optionId)) {
    throw new Error(`Call option "${optionId}" does not exist on call node "${nodeId}".`);
  }

  const hasNextNodeUpdate = hasOwn(fields, "next_node_id");
  const nextNodeId = hasNextNodeUpdate ? fields.next_node_id?.trim() ?? "" : node.option_node_mapping[optionId];
  const updatedNode: CallNode = {
    ...node,
    options: node.options.map((option) => (option.id === optionId ? updateCallOptionFields(option, fields) : option)),
    option_node_mapping: hasNextNodeUpdate
      ? {
          ...node.option_node_mapping,
          [optionId]: nextNodeId,
        }
      : node.option_node_mapping,
  };
  const updatedGraph = replaceNode(graph, updatedNode);

  return updateDraftGraph(
    draft,
    {
      ...updatedGraph,
      edges: hasNextNodeUpdate ? replaceViaEdge(graph.edges, nodeId, optionId, nextNodeId) : graph.edges,
    },
    nodeId,
  );
}

function updateCheckNode(draft: EventDraftEnvelope, nodeId: string, fields: CheckNodeFieldsUpdate): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "check");
  const updatedNode: CheckNode = {
    ...node,
    evaluation_order: fields.evaluation_order ?? node.evaluation_order,
    default_next_node_id: hasOwn(fields, "default_next_node_id")
      ? fields.default_next_node_id ?? ""
      : node.default_next_node_id,
    branches: hasOwn(fields, "branches") && fields.branches
      ? fields.branches.map((branch) => normalizeCheckBranch(branch))
      : node.branches,
  };

  return updateDraftGraph(draft, replaceNode(graph, updatedNode), nodeId);
}

function updateRandomNode(draft: EventDraftEnvelope, nodeId: string, fields: RandomNodeFieldsUpdate): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "random");
  const updatedNode: RandomNode = {
    ...node,
    seed_scope: fields.seed_scope ?? node.seed_scope,
    default_next_node_id: hasOwn(fields, "default_next_node_id")
      ? fields.default_next_node_id ?? null
      : node.default_next_node_id,
    store_result_as: fields.store_result_as ?? node.store_result_as,
    branches: hasOwn(fields, "branches") && fields.branches
      ? fields.branches.map((branch) => normalizeRandomBranch(branch))
      : node.branches,
  };

  return updateDraftGraph(draft, replaceNode(graph, updatedNode), nodeId);
}

function updateActionRequestNode(
  draft: EventDraftEnvelope,
  nodeId: string,
  fields: ActionRequestNodeFieldsUpdate,
): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "action_request");
  const updatedNode: ActionRequestNode = {
    ...node,
    request_id: fields.request_id ?? node.request_id,
    action_type: fields.action_type ?? node.action_type,
    target_crew_ref: hasOwn(fields, "target_crew_ref") ? clonePlain(fields.target_crew_ref ?? node.target_crew_ref) : node.target_crew_ref,
    target_tile_ref: hasOwn(fields, "target_tile_ref") ? cloneNullableTargetRef(fields.target_tile_ref) : node.target_tile_ref,
    action_params: hasOwn(fields, "action_params") ? cloneJsonObject(fields.action_params) : node.action_params,
    acceptance_conditions: hasOwn(fields, "acceptance_conditions")
      ? clonePlain(fields.acceptance_conditions ?? [])
      : node.acceptance_conditions,
    completion_trigger: hasOwn(fields, "completion_trigger")
      ? clonePlain(fields.completion_trigger ?? node.completion_trigger)
      : node.completion_trigger,
    on_accepted_node_id: hasOwn(fields, "on_accepted_node_id")
      ? normalizeNullableString(fields.on_accepted_node_id)
      : node.on_accepted_node_id,
    on_completed_node_id: hasOwn(fields, "on_completed_node_id")
      ? normalizeRequiredString(fields.on_completed_node_id)
      : node.on_completed_node_id,
    on_failed_node_id: hasOwn(fields, "on_failed_node_id") ? normalizeRequiredString(fields.on_failed_node_id) : node.on_failed_node_id,
    expires_in_seconds: hasOwn(fields, "expires_in_seconds") ? (fields.expires_in_seconds ?? null) : node.expires_in_seconds,
    occupies_crew_action: fields.occupies_crew_action ?? node.occupies_crew_action,
  };

  return updateDraftGraph(draft, replaceNode(graph, updatedNode), nodeId);
}

function updateObjectiveNode(draft: EventDraftEnvelope, nodeId: string, fields: ObjectiveNodeFieldsUpdate): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "objective");
  const updatedNode: ObjectiveNode = {
    ...node,
    objective_template: fields.objective_template
      ? updateObjectiveTemplate(node.objective_template, fields.objective_template)
      : node.objective_template,
    mode: fields.mode ?? node.mode,
    on_created_node_id: hasOwn(fields, "on_created_node_id")
      ? normalizeNullableString(fields.on_created_node_id)
      : node.on_created_node_id,
    on_completed_node_id: hasOwn(fields, "on_completed_node_id")
      ? normalizeRequiredString(fields.on_completed_node_id)
      : node.on_completed_node_id,
    on_failed_node_id: hasOwn(fields, "on_failed_node_id") ? normalizeNullableString(fields.on_failed_node_id) : node.on_failed_node_id,
    expires_in_seconds: hasOwn(fields, "expires_in_seconds") ? (fields.expires_in_seconds ?? null) : node.expires_in_seconds,
    parent_event_link: fields.parent_event_link ?? node.parent_event_link,
  };

  return updateDraftGraph(draft, replaceNode(graph, updatedNode), nodeId);
}

function updateSpawnEventNode(draft: EventDraftEnvelope, nodeId: string, fields: SpawnEventNodeFieldsUpdate): EventDraftEnvelope {
  const graph = requireGraph(draft);
  const node = requireTypedNode(graph, nodeId, "spawn_event");
  const updatedNode: SpawnEventNode = {
    ...node,
    event_definition_id: fields.event_definition_id ?? node.event_definition_id,
    spawn_policy: fields.spawn_policy ?? node.spawn_policy,
    context_mapping: hasOwn(fields, "context_mapping") ? cloneStringRecord(fields.context_mapping) : node.context_mapping,
    parent_event_link: fields.parent_event_link ?? node.parent_event_link,
    dedupe_key_template: hasOwn(fields, "dedupe_key_template")
      ? normalizeNullableString(fields.dedupe_key_template)
      : node.dedupe_key_template,
    next_node_id: hasOwn(fields, "next_node_id") ? normalizeRequiredString(fields.next_node_id) : node.next_node_id,
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

function addEffectGroup(draft: EventDraftEnvelope, groupId: string | undefined): EventDraftEnvelope {
  const effectGroups = draft.working_definition.effect_groups ?? [];
  const resolvedGroupId = groupId ?? createUniqueEffectGroupId(effectGroups);

  requireSafeUniqueEffectGroupId(effectGroups, resolvedGroupId);

  return updateWorkingDefinition(draft, {
    effect_groups: [
      ...effectGroups,
      {
        id: resolvedGroupId,
        description: "",
        effects: [],
      },
    ],
  });
}

function updateEffectGroup(
  draft: EventDraftEnvelope,
  groupId: string,
  fields: EffectGroupFieldsUpdate,
): EventDraftEnvelope {
  const effectGroups = draft.working_definition.effect_groups ?? [];
  const group = requireEffectGroup(effectGroups, groupId);
  const nextGroupId = fields.id ?? group.id;

  if (nextGroupId !== group.id) {
    requireSafeUniqueEffectGroupId(effectGroups, nextGroupId, group.id);
  }

  return updateWorkingDefinition(draft, {
    effect_groups: effectGroups.map((candidate) =>
      candidate.id === groupId
        ? {
            ...candidate,
            id: nextGroupId,
            description: hasOwn(fields, "description") ? fields.description : candidate.description,
          }
        : candidate,
    ),
  });
}

function removeEffectGroup(draft: EventDraftEnvelope, groupId: string): EventDraftEnvelope {
  const effectGroups = draft.working_definition.effect_groups ?? [];
  requireEffectGroup(effectGroups, groupId);

  return updateWorkingDefinition(draft, {
    effect_groups: effectGroups.filter((group) => group.id !== groupId),
  });
}

function addEffect(draft: EventDraftEnvelope, groupId: string, effect: Effect): EventDraftEnvelope {
  const effectGroups = draft.working_definition.effect_groups ?? [];
  const group = requireEffectGroup(effectGroups, groupId);

  if (group.effects.some((candidate) => candidate.id === effect.id)) {
    throw new Error(`Effect group "${groupId}" already has effect "${effect.id}".`);
  }

  return updateEffectGroups(draft, effectGroups, groupId, {
    ...group,
    effects: [...group.effects, clonePlain(effect)],
  });
}

function updateEffect(
  draft: EventDraftEnvelope,
  groupId: string,
  effectId: string,
  fields: EffectFieldsUpdate,
): EventDraftEnvelope {
  const effectGroups = draft.working_definition.effect_groups ?? [];
  const group = requireEffectGroup(effectGroups, groupId);
  const effect = requireEffect(group, effectId);
  const nextEffectId = fields.id ?? effect.id;

  if (nextEffectId !== effect.id && group.effects.some((candidate) => candidate.id === nextEffectId)) {
    throw new Error(`Effect group "${groupId}" already has effect "${nextEffectId}".`);
  }

  return updateEffectGroups(draft, effectGroups, groupId, {
    ...group,
    effects: group.effects.map((candidate) =>
      candidate.id === effectId
        ? {
            ...candidate,
            ...clonePlain(fields),
            id: nextEffectId,
            target: hasOwn(fields, "target") ? clonePlain(fields.target as Effect["target"]) : candidate.target,
            params: hasOwn(fields, "params") ? cloneJsonObject(fields.params) : candidate.params,
            record_policy: hasOwn(fields, "record_policy")
              ? clonePlain(fields.record_policy as Effect["record_policy"])
              : candidate.record_policy,
          }
        : candidate,
    ),
  });
}

function removeEffect(draft: EventDraftEnvelope, groupId: string, effectId: string): EventDraftEnvelope {
  const effectGroups = draft.working_definition.effect_groups ?? [];
  const group = requireEffectGroup(effectGroups, groupId);
  requireEffect(group, effectId);

  return updateEffectGroups(draft, effectGroups, groupId, {
    ...group,
    effects: group.effects.filter((effect) => effect.id !== effectId),
  });
}

function addLogTemplate(draft: EventDraftEnvelope, logTemplateId: string | undefined): EventDraftEnvelope {
  const logTemplates = draft.working_definition.log_templates ?? [];
  const resolvedLogTemplateId = logTemplateId ?? createUniqueLogTemplateId(logTemplates);

  if (logTemplates.some((template) => template.id === resolvedLogTemplateId)) {
    throw new Error(`Log template "${resolvedLogTemplateId}" already exists.`);
  }

  return updateWorkingDefinition(draft, {
    log_templates: [
      ...logTemplates,
      {
        id: resolvedLogTemplateId,
        summary: "TODO event log summary.",
        importance: "normal",
        visibility: "player_visible",
      },
    ],
  });
}

function updateLogTemplateFields(
  draft: EventDraftEnvelope,
  logTemplateId: string,
  fields: LogTemplateFieldsUpdate,
): EventDraftEnvelope {
  const logTemplates = draft.working_definition.log_templates ?? [];
  const template = requireLogTemplate(logTemplates, logTemplateId);
  const nextLogTemplateId = fields.id ?? template.id;

  if (nextLogTemplateId !== template.id && logTemplates.some((candidate) => candidate.id === nextLogTemplateId)) {
    throw new Error(`Log template "${nextLogTemplateId}" already exists.`);
  }

  return updateWorkingDefinition(draft, {
    log_templates: logTemplates.map((candidate) =>
      candidate.id === logTemplateId
        ? {
            ...candidate,
            ...fields,
            id: nextLogTemplateId,
          }
        : candidate,
    ),
  });
}

function removeLogTemplate(draft: EventDraftEnvelope, logTemplateId: string): EventDraftEnvelope {
  const logTemplates = draft.working_definition.log_templates ?? [];
  requireLogTemplate(logTemplates, logTemplateId);

  return updateWorkingDefinition(draft, {
    log_templates: logTemplates.filter((template) => template.id !== logTemplateId),
  });
}

function updateWorkingDefinition(
  draft: EventDraftEnvelope,
  fields: Partial<EventDraftWorkingDefinition>,
): EventDraftEnvelope {
  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      ...fields,
    },
  };
}

function updateEffectGroups(
  draft: EventDraftEnvelope,
  effectGroups: EffectGroup[],
  groupId: string,
  updatedGroup: EffectGroup,
): EventDraftEnvelope {
  return updateWorkingDefinition(draft, {
    effect_groups: effectGroups.map((group) => (group.id === groupId ? updatedGroup : group)),
  });
}

function updateDraftGraph(
  draft: EventDraftEnvelope,
  graph: EventGraph,
  selectedNodeId: string | null = null,
  preserveEditorState = false,
): EventDraftEnvelope {
  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      event_graph: graph,
    },
    editor_state: preserveEditorState ? draft.editor_state : createGraphNodeSelectionState(draft, selectedNodeId),
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

function requireEffectGroup(effectGroups: EffectGroup[], groupId: string): EffectGroup {
  const group = effectGroups.find((candidate) => candidate.id === groupId);

  if (!group) {
    throw new Error(`Event draft is missing effect group "${groupId}".`);
  }

  return group;
}

function requireEffect(effectGroup: EffectGroup, effectId: string): Effect {
  const effect = effectGroup.effects.find((candidate) => candidate.id === effectId);

  if (!effect) {
    throw new Error(`Effect group "${effectGroup.id}" is missing effect "${effectId}".`);
  }

  return effect;
}

function requireLogTemplate(logTemplates: EventLogTemplate[], logTemplateId: string): EventLogTemplate {
  const template = logTemplates.find((candidate) => candidate.id === logTemplateId);

  if (!template) {
    throw new Error(`Event draft is missing log template "${logTemplateId}".`);
  }

  return template;
}

function getOptionLines(template: EventDraftWorkingCallTemplate): Record<string, TextVariantGroup> {
  return template.option_lines ?? {};
}

function updateCallOptionFields(option: CallOption, fields: CallOptionFieldsUpdate): CallOption {
  const updatedOption: CallOption = {
    ...option,
    is_default: hasOwn(fields, "is_default") ? fields.is_default : option.is_default,
  };

  if (hasOwn(fields, "effect_refs")) {
    if (fields.effect_refs && fields.effect_refs.length > 0) {
      updatedOption.effect_refs = [...fields.effect_refs];
    } else {
      delete updatedOption.effect_refs;
    }
  }

  if (hasOwn(fields, "requirements")) {
    if (fields.requirements && fields.requirements.length > 0) {
      updatedOption.requirements = clonePlain(fields.requirements);
    } else {
      delete updatedOption.requirements;
    }
  }

  return updatedOption;
}

function normalizeCallOnMissed(onMissed: CallNode["on_missed"] | undefined): CallNode["on_missed"] {
  const nextNodeId = normalizeOptionalString(onMissed?.next_node_id ?? undefined);
  const effectRefs = onMissed?.effect_refs?.filter((effectRef) => effectRef.trim().length > 0);

  if (!nextNodeId && (!effectRefs || effectRefs.length === 0)) {
    return undefined;
  }

  return {
    next_node_id: nextNodeId ?? null,
    effect_refs: effectRefs && effectRefs.length > 0 ? [...effectRefs] : undefined,
  };
}

function normalizeCheckBranch(branch: CheckNode["branches"][number]): CheckNode["branches"][number] {
  const updatedBranch: CheckNode["branches"][number] = {
    ...branch,
    conditions: clonePlain(branch.conditions ?? []),
  };

  if (branch.effect_refs && branch.effect_refs.length > 0) {
    updatedBranch.effect_refs = [...branch.effect_refs];
  } else {
    delete updatedBranch.effect_refs;
  }

  return updatedBranch;
}

function normalizeRandomBranch(branch: RandomNode["branches"][number]): RandomNode["branches"][number] {
  const updatedBranch: RandomNode["branches"][number] = {
    ...branch,
    weight: Number.isFinite(branch.weight) ? branch.weight : 0,
  };

  if (branch.conditions) {
    updatedBranch.conditions = clonePlain(branch.conditions);
  }
  if (branch.effect_refs && branch.effect_refs.length > 0) {
    updatedBranch.effect_refs = [...branch.effect_refs];
  } else {
    delete updatedBranch.effect_refs;
  }

  return updatedBranch;
}

function updateObjectiveTemplate(
  template: ObjectiveTemplate,
  fields: ObjectiveTemplateFieldsUpdate,
): ObjectiveTemplate {
  return {
    ...template,
    title: fields.title ?? template.title,
    summary: fields.summary ?? template.summary,
    target_tile_ref: hasOwn(fields, "target_tile_ref") ? cloneNullableTargetRef(fields.target_tile_ref) : template.target_tile_ref,
    eligible_crew_conditions: hasOwn(fields, "eligible_crew_conditions")
      ? clonePlain(fields.eligible_crew_conditions ?? [])
      : template.eligible_crew_conditions,
    required_action_type: fields.required_action_type ?? template.required_action_type,
    required_action_params: hasOwn(fields, "required_action_params")
      ? cloneJsonObject(fields.required_action_params)
      : template.required_action_params,
  };
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

function replaceViaEdge(edges: EventEdge[], fromNodeId: string, via: string, toNodeId: string): EventEdge[] {
  const remainingEdges = edges.filter((edge) => !(edge.from_node_id === fromNodeId && edge.via === via));

  if (!toNodeId) {
    return remainingEdges;
  }

  return appendEdgeIfMissing(remainingEdges, {
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    via,
  });
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

function appendCallTemplateRef(
  workingDefinition: EventDraftWorkingDefinition,
  callTemplateId: string,
): EventDraftWorkingDefinition {
  return {
    ...workingDefinition,
    content_refs: {
      ...workingDefinition.content_refs,
      call_template_ids: appendIdIfMissing(workingDefinition.content_refs?.call_template_ids ?? [], callTemplateId),
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

function createUniqueNodeId(graph: EventGraph, nodeType: EditableGraphNodeType): string {
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

function requireSafeUniqueEffectGroupId(effectGroups: EffectGroup[], groupId: string, currentGroupId?: string): void {
  if (!isSafeEventId(groupId)) {
    throw new Error(`Effect group id "${groupId}" must use lowercase letters, numbers, underscores, or hyphens.`);
  }

  if (groupId !== currentGroupId && effectGroups.some((group) => group.id === groupId)) {
    throw new Error(`Event draft already has effect group "${groupId}".`);
  }
}

function createUniqueEffectGroupId(effectGroups: EffectGroup[]): string {
  let index = 1;
  let candidate = "effect_group";
  const existingIds = new Set(effectGroups.map((group) => group.id));

  while (existingIds.has(candidate)) {
    index += 1;
    candidate = `effect_group_${index}`;
  }

  return candidate;
}

function createUniqueLogTemplateId(logTemplates: EventLogTemplate[]): string {
  let index = 1;
  let candidate = "event_log";
  const existingIds = new Set(logTemplates.map((template) => template.id));

  while (existingIds.has(candidate)) {
    index += 1;
    candidate = `event_log_${index}`;
  }

  return candidate;
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

function normalizeNullableString(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : null;
}

function normalizeRequiredString(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function cloneNullableTargetRef(value: TargetRef | null | undefined): TargetRef | null {
  return value ? clonePlain(value) : null;
}

function cloneJsonObject(value: JsonObject | undefined): JsonObject {
  return value ? clonePlain(value) : {};
}

function cloneStringRecord(value: Record<string, string> | undefined): Record<string, string> {
  return value ? { ...value } : {};
}

function hasOwn<T extends object, TKey extends PropertyKey>(value: T, key: TKey): value is T & Record<TKey, unknown> {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
