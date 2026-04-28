import type { EventContentLibrary } from "./contentIndex";
import type {
  CallNode,
  CallTemplate,
  Condition,
  Effect,
  EventDefinition,
  EventGraph,
  EventNode,
  HandlerDefinition,
  Id,
  TextVariantGroup,
} from "./types";

export type EventValidationIssueCode =
  | "missing_entry_node"
  | "orphan_node"
  | "cycle_detected"
  | "no_terminal_path"
  | "unsupported_graph_rule"
  | "unknown_node_ref"
  | "terminal_node_not_end"
  | "missing_option_node_mapping"
  | "extra_option_node_mapping"
  | "unknown_effect_ref"
  | "unknown_log_template"
  | "unknown_handler_type"
  | "invalid_handler_kind"
  | "unknown_call_template"
  | "call_template_event_mismatch"
  | "call_template_node_mismatch"
  | "call_template_node_not_call"
  | "missing_call_template_option_line"
  | "extra_call_template_option_line";

export interface EventValidationIssue {
  code: EventValidationIssueCode;
  path: string;
  message: string;
  severity: "error";
  asset_id: string;
  asset_type: "event_definition" | "call_template";
}

interface TransitionRef {
  from_node_id: Id;
  to_node_id: Id;
  path: string;
}

interface DefinitionContext {
  definition: EventDefinition;
  definitionIndex: number;
  issues: EventValidationIssue[];
  nodeIndexesById: Map<Id, number>;
  nodesById: Map<Id, EventNode>;
  effectGroupIds: Set<Id>;
  logTemplateIds: Set<Id>;
  callTemplatesById: Map<Id, CallTemplate>;
  callTemplateIndexesById: Map<Id, number>;
  definitionsById: Map<Id, EventDefinition>;
  handlersByType: Map<string, HandlerDefinition>;
}

export function validateEventContentLibrary(library: EventContentLibrary): EventValidationIssue[] {
  const issues: EventValidationIssue[] = [];
  const definitionsById = new Map(library.event_definitions.map((definition) => [definition.id, definition]));
  const definitionIndexesById = new Map(library.event_definitions.map((definition, index) => [definition.id, index]));
  const callTemplatesById = new Map(library.call_templates.map((template) => [template.id, template]));
  const callTemplateIndexesById = new Map(library.call_templates.map((template, index) => [template.id, index]));
  const handlersByType = new Map(library.handlers.map((handler) => [handler.handler_type, handler]));

  library.event_definitions.forEach((definition, definitionIndex) => {
    validateDefinition({
      definition,
      definitionIndex,
      issues,
      nodeIndexesById: buildNodeIndex(definition.event_graph.nodes),
      nodesById: new Map(definition.event_graph.nodes.map((node) => [node.id, node])),
      effectGroupIds: new Set((definition.effect_groups ?? []).map((group) => group.id)),
      logTemplateIds: new Set((definition.log_templates ?? []).map((template) => template.id)),
      callTemplatesById,
      callTemplateIndexesById,
      definitionsById,
      handlersByType,
    });
  });

  library.call_templates.forEach((template, templateIndex) => {
    validateCallTemplateReference(template, templateIndex, definitionsById, definitionIndexesById, issues);
  });

  return issues;
}

function validateDefinition(context: DefinitionContext): void {
  validateGraphRules(context);
  const transitions = collectGraphTransitions(context);

  validateEntryNode(context);
  validateTerminalNodes(context);
  validateTransitionTargets(context, transitions);
  validateReachability(context, transitions);
  validateAcyclicGraph(context, transitions);
  validateTerminalPaths(context, transitions);

  context.definition.event_graph.nodes.forEach((node, nodeIndex) => {
    validateNodeReferences(context, node, nodeIndex);
  });

  context.definition.trigger.conditions?.forEach((condition, conditionIndex) => {
    validateConditionHandlers(
      context,
      condition,
      `event_definitions[${context.definitionIndex}].trigger.conditions[${conditionIndex}]`,
    );
  });
  context.definition.trigger.probability?.modifiers?.forEach((modifier, modifierIndex) => {
    modifier.conditions.forEach((condition, conditionIndex) => {
      validateConditionHandlers(
        context,
        condition,
        `event_definitions[${context.definitionIndex}].trigger.probability.modifiers[${modifierIndex}].conditions[${conditionIndex}]`,
      );
    });
  });
  context.definition.effect_groups?.forEach((group, groupIndex) => {
    group.effects.forEach((effect, effectIndex) => {
      validateEffectHandler(
        context,
        effect,
        `event_definitions[${context.definitionIndex}].effect_groups[${groupIndex}].effects[${effectIndex}]`,
      );
    });
  });
}

function validateGraphRules({ definition, definitionIndex, issues }: DefinitionContext): void {
  const rules = definition.event_graph.graph_rules;

  if (!rules.acyclic) {
    addDefinitionIssue(
      issues,
      definition,
      "unsupported_graph_rule",
      `event_definitions[${definitionIndex}].event_graph.graph_rules.acyclic`,
      `Event definition ${definition.id} must require acyclic event graphs.`,
    );
  }

  if (rules.max_active_nodes !== 1) {
    addDefinitionIssue(
      issues,
      definition,
      "unsupported_graph_rule",
      `event_definitions[${definitionIndex}].event_graph.graph_rules.max_active_nodes`,
      `Event definition ${definition.id} must use a single active node.`,
    );
  }

  if (rules.allow_parallel_nodes) {
    addDefinitionIssue(
      issues,
      definition,
      "unsupported_graph_rule",
      `event_definitions[${definitionIndex}].event_graph.graph_rules.allow_parallel_nodes`,
      `Event definition ${definition.id} must not allow parallel nodes.`,
    );
  }
}

function validateEntryNode({ definition, definitionIndex, nodeIndexesById, issues }: DefinitionContext): void {
  if (nodeIndexesById.has(definition.event_graph.entry_node_id)) {
    return;
  }

  addDefinitionIssue(
    issues,
    definition,
    "missing_entry_node",
    `event_definitions[${definitionIndex}].event_graph.entry_node_id`,
    `Event definition ${definition.id} references missing entry node ${definition.event_graph.entry_node_id}.`,
  );
}

function validateTerminalNodes(context: DefinitionContext): void {
  const { definition, definitionIndex, nodesById, nodeIndexesById, issues } = context;

  definition.event_graph.terminal_node_ids.forEach((nodeId, terminalIndex) => {
    const node = nodesById.get(nodeId);
    if (!node) {
      addDefinitionIssue(
        issues,
        definition,
        "unknown_node_ref",
        `event_definitions[${definitionIndex}].event_graph.terminal_node_ids[${terminalIndex}]`,
        `Event definition ${definition.id} terminal node ${nodeId} does not exist.`,
      );
      return;
    }

    if (node.type !== "end") {
      addDefinitionIssue(
        issues,
        definition,
        "terminal_node_not_end",
        `event_definitions[${definitionIndex}].event_graph.nodes[${nodeIndexesById.get(nodeId) ?? 0}].type`,
        `Event definition ${definition.id} terminal node ${nodeId} must be an end node.`,
      );
    }
  });
}

function validateTransitionTargets(context: DefinitionContext, transitions: TransitionRef[]): void {
  const { definition, nodeIndexesById, issues } = context;

  for (const transition of transitions) {
    if (!nodeIndexesById.has(transition.from_node_id)) {
      addDefinitionIssue(
        issues,
        definition,
        "unknown_node_ref",
        transition.path,
        `Event definition ${definition.id} references missing source node ${transition.from_node_id}.`,
      );
    }

    if (!nodeIndexesById.has(transition.to_node_id)) {
      addDefinitionIssue(
        issues,
        definition,
        "unknown_node_ref",
        transition.path,
        `Event definition ${definition.id} references missing target node ${transition.to_node_id}.`,
      );
    }
  }
}

function validateReachability(context: DefinitionContext, transitions: TransitionRef[]): void {
  const { definition, definitionIndex, nodeIndexesById, issues } = context;

  if (!nodeIndexesById.has(definition.event_graph.entry_node_id)) {
    return;
  }

  const reachable = walkFrom(definition.event_graph.entry_node_id, transitions);
  definition.event_graph.nodes.forEach((node, nodeIndex) => {
    if (!reachable.has(node.id)) {
      addDefinitionIssue(
        issues,
        definition,
        "orphan_node",
        `event_definitions[${definitionIndex}].event_graph.nodes[${nodeIndex}].id`,
        `Event definition ${definition.id} contains orphan node ${node.id}.`,
      );
    }
  });
}

function validateAcyclicGraph(context: DefinitionContext, transitions: TransitionRef[]): void {
  const { definition, issues } = context;
  const outgoing = buildOutgoingTransitions(transitions);
  const visiting = new Set<Id>();
  const visited = new Set<Id>();

  const visit = (nodeId: Id): boolean => {
    if (visiting.has(nodeId)) {
      return true;
    }
    if (visited.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);
    for (const transition of outgoing.get(nodeId) ?? []) {
      if (visit(transition.to_node_id)) {
        addDefinitionIssue(
          issues,
          definition,
          "cycle_detected",
          transition.path,
          `Event definition ${definition.id} contains a cycle through node ${transition.to_node_id}.`,
        );
        return true;
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  for (const node of definition.event_graph.nodes) {
    if (visit(node.id)) {
      return;
    }
  }
}

function validateTerminalPaths(context: DefinitionContext, transitions: TransitionRef[]): void {
  const { definition, definitionIndex, nodeIndexesById, issues } = context;

  if (!nodeIndexesById.has(definition.event_graph.entry_node_id)) {
    return;
  }

  const reachable = walkFrom(definition.event_graph.entry_node_id, transitions);
  const terminalNodeIds = new Set(definition.event_graph.terminal_node_ids);
  const outgoing = buildOutgoingTransitions(transitions);
  const memo = new Map<Id, boolean>();

  const canReachTerminal = (nodeId: Id, visiting = new Set<Id>()): boolean => {
    if (terminalNodeIds.has(nodeId)) {
      return true;
    }
    const cached = memo.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }
    if (visiting.has(nodeId)) {
      return false;
    }

    visiting.add(nodeId);
    const reachesTerminal = (outgoing.get(nodeId) ?? []).some((transition) =>
      canReachTerminal(transition.to_node_id, new Set(visiting)),
    );
    memo.set(nodeId, reachesTerminal);
    return reachesTerminal;
  };

  definition.event_graph.nodes.forEach((node, nodeIndex) => {
    if (reachable.has(node.id) && !canReachTerminal(node.id)) {
      addDefinitionIssue(
        issues,
        definition,
        "no_terminal_path",
        `event_definitions[${definitionIndex}].event_graph.nodes[${nodeIndex}].id`,
        `Event definition ${definition.id} node ${node.id} has no path to a terminal node.`,
      );
    }
  });
}

function validateNodeReferences(context: DefinitionContext, node: EventNode, nodeIndex: number): void {
  const nodePath = `event_definitions[${context.definitionIndex}].event_graph.nodes[${nodeIndex}]`;

  validateEffectRefs(context, node.enter_effect_refs ?? [], `${nodePath}.enter_effect_refs`);
  validateEffectRefs(context, node.exit_effect_refs ?? [], `${nodePath}.exit_effect_refs`);
  validateLogTemplateRef(context, node.event_log_template_id, `${nodePath}.event_log_template_id`);
  validateTransitionRef(context, node.timeout?.next_node_id ?? null, `${nodePath}.timeout.next_node_id`);
  validateEffectRefs(context, node.timeout?.effect_refs ?? [], `${nodePath}.timeout.effect_refs`);
  validateTransitionRef(context, node.auto_next_node_id ?? null, `${nodePath}.auto_next_node_id`);
  node.requirements?.forEach((condition, conditionIndex) => {
    validateConditionHandlers(context, condition, `${nodePath}.requirements[${conditionIndex}]`);
  });
  node.inline_effects?.forEach((effect, effectIndex) => {
    validateEffectHandler(context, effect, `${nodePath}.inline_effects[${effectIndex}]`);
  });

  switch (node.type) {
    case "call":
      validateCallNode(context, node, nodePath);
      break;
    case "wait":
      validateTransitionRef(context, node.next_node_id, `${nodePath}.next_node_id`);
      validateTransitionRef(context, node.on_interrupted?.next_node_id ?? null, `${nodePath}.on_interrupted.next_node_id`);
      validateEffectRefs(context, node.on_interrupted?.effect_refs ?? [], `${nodePath}.on_interrupted.effect_refs`);
      break;
    case "check":
      node.branches.forEach((branch, branchIndex) => {
        const branchPath = `${nodePath}.branches[${branchIndex}]`;
        validateTransitionRef(context, branch.next_node_id, `${branchPath}.next_node_id`);
        validateEffectRefs(context, branch.effect_refs ?? [], `${branchPath}.effect_refs`);
        branch.conditions.forEach((condition, conditionIndex) => {
          validateConditionHandlers(context, condition, `${branchPath}.conditions[${conditionIndex}]`);
        });
      });
      validateTransitionRef(context, node.default_next_node_id, `${nodePath}.default_next_node_id`);
      break;
    case "random":
      node.branches.forEach((branch, branchIndex) => {
        const branchPath = `${nodePath}.branches[${branchIndex}]`;
        validateTransitionRef(context, branch.next_node_id, `${branchPath}.next_node_id`);
        validateEffectRefs(context, branch.effect_refs ?? [], `${branchPath}.effect_refs`);
        branch.conditions?.forEach((condition, conditionIndex) => {
          validateConditionHandlers(context, condition, `${branchPath}.conditions[${conditionIndex}]`);
        });
      });
      validateTransitionRef(context, node.default_next_node_id ?? null, `${nodePath}.default_next_node_id`);
      break;
    case "action_request":
      validateTransitionRef(context, node.on_accepted_node_id ?? null, `${nodePath}.on_accepted_node_id`);
      validateTransitionRef(context, node.on_completed_node_id, `${nodePath}.on_completed_node_id`);
      validateTransitionRef(context, node.on_failed_node_id, `${nodePath}.on_failed_node_id`);
      node.acceptance_conditions?.forEach((condition, conditionIndex) => {
        validateConditionHandlers(context, condition, `${nodePath}.acceptance_conditions[${conditionIndex}]`);
      });
      node.completion_trigger.conditions?.forEach((condition, conditionIndex) => {
        validateConditionHandlers(context, condition, `${nodePath}.completion_trigger.conditions[${conditionIndex}]`);
      });
      break;
    case "objective":
      validateTransitionRef(context, node.on_created_node_id ?? null, `${nodePath}.on_created_node_id`);
      validateTransitionRef(context, node.on_completed_node_id, `${nodePath}.on_completed_node_id`);
      validateTransitionRef(context, node.on_failed_node_id ?? null, `${nodePath}.on_failed_node_id`);
      node.objective_template.eligible_crew_conditions?.forEach((condition, conditionIndex) => {
        validateConditionHandlers(
          context,
          condition,
          `${nodePath}.objective_template.eligible_crew_conditions[${conditionIndex}]`,
        );
      });
      break;
    case "spawn_event":
      validateSpawnEventRef(context, node.event_definition_id, `${nodePath}.event_definition_id`);
      validateTransitionRef(context, node.next_node_id, `${nodePath}.next_node_id`);
      break;
    case "log_only":
      validateLogTemplateRef(context, node.event_log_template_id, `${nodePath}.event_log_template_id`);
      validateEffectRefs(context, node.effect_refs ?? [], `${nodePath}.effect_refs`);
      validateTransitionRef(context, node.next_node_id, `${nodePath}.next_node_id`);
      break;
    case "end":
      validateLogTemplateRef(context, node.event_log_template_id, `${nodePath}.event_log_template_id`);
      validateEffectRefs(context, node.final_effect_refs ?? [], `${nodePath}.final_effect_refs`);
      break;
  }
}

function validateCallNode(context: DefinitionContext, node: CallNode, nodePath: string): void {
  const template = context.callTemplatesById.get(node.call_template_id);
  if (!template) {
    addDefinitionIssue(
      context.issues,
      context.definition,
      "unknown_call_template",
      `${nodePath}.call_template_id`,
      `Event definition ${context.definition.id} call node ${node.id} references missing call template ${node.call_template_id}.`,
    );
  } else {
    validateCallTemplateBinding(context, node, template);
  }

  const optionIds = new Set(node.options.map((option) => option.id));
  for (const option of node.options) {
    if (!(option.id in node.option_node_mapping)) {
      addDefinitionIssue(
        context.issues,
        context.definition,
        "missing_option_node_mapping",
        `${nodePath}.option_node_mapping.${option.id}`,
        `Event definition ${context.definition.id} call node ${node.id} is missing option_node_mapping for option ${option.id}.`,
      );
    }
  }

  for (const optionId of Object.keys(node.option_node_mapping)) {
    if (!optionIds.has(optionId)) {
      addDefinitionIssue(
        context.issues,
        context.definition,
        "extra_option_node_mapping",
        `${nodePath}.option_node_mapping.${optionId}`,
        `Event definition ${context.definition.id} call node ${node.id} has extra option_node_mapping for option ${optionId}.`,
      );
    }
  }

  node.options.forEach((option, optionIndex) => {
    const optionPath = `${nodePath}.options[${optionIndex}]`;
    validateEffectRefs(context, option.effect_refs ?? [], `${optionPath}.effect_refs`);
    option.requirements?.forEach((condition, conditionIndex) => {
      validateConditionHandlers(context, condition, `${optionPath}.requirements[${conditionIndex}]`);
    });
  });

  validateTransitionRef(context, node.on_missed?.next_node_id ?? null, `${nodePath}.on_missed.next_node_id`);
  validateEffectRefs(context, node.on_missed?.effect_refs ?? [], `${nodePath}.on_missed.effect_refs`);
}

function validateCallTemplateBinding(context: DefinitionContext, node: CallNode, template: CallTemplate): void {
  const templateIndex = context.callTemplateIndexesById.get(template.id) ?? 0;

  if (template.event_definition_id !== context.definition.id) {
    addTemplateIssue(
      context.issues,
      template,
      "call_template_event_mismatch",
      `call_templates[${templateIndex}].event_definition_id`,
      `Call template ${template.id} belongs to ${template.event_definition_id}, not event definition ${context.definition.id}.`,
    );
  }

  if (template.node_id !== node.id) {
    addTemplateIssue(
      context.issues,
      template,
      "call_template_node_mismatch",
      `call_templates[${templateIndex}].node_id`,
      `Call template ${template.id} belongs to node ${template.node_id}, not call node ${node.id}.`,
    );
  }

  validateCallTemplateOptions(template, templateIndex, node, context.issues);
  validateCallTemplateConditionHandlers(context, template, templateIndex);
}

function validateCallTemplateReference(
  template: CallTemplate,
  templateIndex: number,
  definitionsById: Map<Id, EventDefinition>,
  definitionIndexesById: Map<Id, number>,
  issues: EventValidationIssue[],
): void {
  const definition = definitionsById.get(template.event_definition_id);
  if (!definition) {
    addTemplateIssue(
      issues,
      template,
      "call_template_event_mismatch",
      `call_templates[${templateIndex}].event_definition_id`,
      `Call template ${template.id} references missing event definition ${template.event_definition_id}.`,
    );
    return;
  }

  const nodeIndex = definition.event_graph.nodes.findIndex((node) => node.id === template.node_id);
  const node = definition.event_graph.nodes[nodeIndex];
  if (!node) {
    addTemplateIssue(
      issues,
      template,
      "call_template_node_mismatch",
      `call_templates[${templateIndex}].node_id`,
      `Call template ${template.id} references missing node ${template.node_id} in event definition ${definition.id}.`,
    );
    return;
  }

  if (node.type !== "call") {
    addTemplateIssue(
      issues,
      template,
      "call_template_node_not_call",
      `event_definitions[${definitionIndexesById.get(definition.id) ?? 0}].event_graph.nodes[${nodeIndex}].type`,
      `Call template ${template.id} references non-call node ${template.node_id} in event definition ${definition.id}.`,
    );
    return;
  }

  validateCallTemplateOptions(template, templateIndex, node, issues);
}

function validateCallTemplateOptions(
  template: CallTemplate,
  templateIndex: number,
  node: CallNode,
  issues: EventValidationIssue[],
): void {
  const nodeOptionIds = new Set(node.options.map((option) => option.id));
  const templateOptionIds = new Set(Object.keys(template.option_lines));

  for (const optionId of nodeOptionIds) {
    if (!templateOptionIds.has(optionId)) {
      addTemplateIssue(
        issues,
        template,
        "missing_call_template_option_line",
        `call_templates[${templateIndex}].option_lines.${optionId}`,
        `Call template ${template.id} is missing option line for option ${optionId}.`,
      );
    }
  }

  for (const optionId of templateOptionIds) {
    if (!nodeOptionIds.has(optionId)) {
      addTemplateIssue(
        issues,
        template,
        "extra_call_template_option_line",
        `call_templates[${templateIndex}].option_lines.${optionId}`,
        `Call template ${template.id} has extra option line for option ${optionId}.`,
      );
    }
  }
}

function validateCallTemplateConditionHandlers(context: DefinitionContext, template: CallTemplate, templateIndex: number): void {
  validateVariantGroupHandlers(context, template.opening_lines, `call_templates[${templateIndex}].opening_lines`);
  template.body_lines?.forEach((group, groupIndex) => {
    validateVariantGroupHandlers(context, group, `call_templates[${templateIndex}].body_lines[${groupIndex}]`);
  });
  Object.entries(template.option_lines).forEach(([optionId, group]) => {
    validateVariantGroupHandlers(context, group, `call_templates[${templateIndex}].option_lines.${optionId}`);
  });
}

function validateVariantGroupHandlers(context: DefinitionContext, group: TextVariantGroup, groupPath: string): void {
  group.variants.forEach((variant, variantIndex) => {
    variant.when?.forEach((condition, conditionIndex) => {
      validateConditionHandlers(context, condition, `${groupPath}.variants[${variantIndex}].when[${conditionIndex}]`);
    });
  });
}

function validateEffectRefs(context: DefinitionContext, effectRefs: Id[], basePath: string): void {
  effectRefs.forEach((effectRef, effectRefIndex) => {
    if (!context.effectGroupIds.has(effectRef)) {
      addDefinitionIssue(
        context.issues,
        context.definition,
        "unknown_effect_ref",
        `${basePath}[${effectRefIndex}]`,
        `Event definition ${context.definition.id} references missing effect group ${effectRef}.`,
      );
    }
  });
}

function validateLogTemplateRef(context: DefinitionContext, logTemplateId: Id | null | undefined, path: string): void {
  if (!logTemplateId || context.logTemplateIds.has(logTemplateId)) {
    return;
  }

  addDefinitionIssue(
    context.issues,
    context.definition,
    "unknown_log_template",
    path,
    `Event definition ${context.definition.id} references missing log template ${logTemplateId}.`,
  );
}

function validateTransitionRef(context: DefinitionContext, nodeId: Id | null | undefined, path: string): void {
  if (!nodeId || context.nodeIndexesById.has(nodeId)) {
    return;
  }

  addDefinitionIssue(
    context.issues,
    context.definition,
    "unknown_node_ref",
    path,
    `Event definition ${context.definition.id} references missing node ${nodeId}.`,
  );
}

function validateSpawnEventRef(context: DefinitionContext, eventDefinitionId: Id, path: string): void {
  if (context.definitionsById.has(eventDefinitionId)) {
    return;
  }

  addDefinitionIssue(
    context.issues,
    context.definition,
    "unknown_node_ref",
    path,
    `Event definition ${context.definition.id} references missing spawn_event definition ${eventDefinitionId}.`,
  );
}

function validateConditionHandlers(context: DefinitionContext, condition: Condition, conditionPath: string): void {
  if (condition.handler_type) {
    validateHandlerRef(context, condition.handler_type, "condition", `${conditionPath}.handler_type`);
  }

  condition.conditions?.forEach((childCondition, childIndex) => {
    validateConditionHandlers(context, childCondition, `${conditionPath}.conditions[${childIndex}]`);
  });
}

function validateEffectHandler(context: DefinitionContext, effect: Effect, effectPath: string): void {
  if (effect.handler_type) {
    validateHandlerRef(context, effect.handler_type, "effect", `${effectPath}.handler_type`);
  }
}

function validateHandlerRef(
  context: DefinitionContext,
  handlerType: string,
  expectedKind: "condition" | "effect",
  path: string,
): void {
  const handler = context.handlersByType.get(handlerType);
  if (!handler) {
    addDefinitionIssue(
      context.issues,
      context.definition,
      "unknown_handler_type",
      path,
      `Event definition ${context.definition.id} references missing handler_type ${handlerType}.`,
    );
    return;
  }

  if (handler.kind !== expectedKind) {
    addDefinitionIssue(
      context.issues,
      context.definition,
      "invalid_handler_kind",
      path,
      `Event definition ${context.definition.id} references ${handlerType} as ${expectedKind}, but registry kind is ${handler.kind}.`,
    );
  }
}

function collectGraphTransitions({ definition, definitionIndex }: DefinitionContext): TransitionRef[] {
  const graph = definition.event_graph;
  const transitions: TransitionRef[] = graph.edges.map((edge, edgeIndex) => ({
    from_node_id: edge.from_node_id,
    to_node_id: edge.to_node_id,
    path: `event_definitions[${definitionIndex}].event_graph.edges[${edgeIndex}]`,
  }));

  graph.nodes.forEach((node, nodeIndex) => {
    const nodePath = `event_definitions[${definitionIndex}].event_graph.nodes[${nodeIndex}]`;
    collectNodeTransitions(node, nodePath, transitions);
  });

  return transitions;
}

function collectNodeTransitions(node: EventNode, nodePath: string, transitions: TransitionRef[]): void {
  pushTransition(node.id, node.auto_next_node_id, `${nodePath}.auto_next_node_id`, transitions);
  pushTransition(node.id, node.timeout?.next_node_id, `${nodePath}.timeout.next_node_id`, transitions);

  switch (node.type) {
    case "call":
      Object.entries(node.option_node_mapping).forEach(([optionId, toNodeId]) => {
        pushTransition(node.id, toNodeId, `${nodePath}.option_node_mapping.${optionId}`, transitions);
      });
      pushTransition(node.id, node.on_missed?.next_node_id, `${nodePath}.on_missed.next_node_id`, transitions);
      break;
    case "wait":
      pushTransition(node.id, node.next_node_id, `${nodePath}.next_node_id`, transitions);
      pushTransition(node.id, node.on_interrupted?.next_node_id, `${nodePath}.on_interrupted.next_node_id`, transitions);
      break;
    case "check":
      node.branches.forEach((branch, branchIndex) => {
        pushTransition(node.id, branch.next_node_id, `${nodePath}.branches[${branchIndex}].next_node_id`, transitions);
      });
      pushTransition(node.id, node.default_next_node_id, `${nodePath}.default_next_node_id`, transitions);
      break;
    case "random":
      node.branches.forEach((branch, branchIndex) => {
        pushTransition(node.id, branch.next_node_id, `${nodePath}.branches[${branchIndex}].next_node_id`, transitions);
      });
      pushTransition(node.id, node.default_next_node_id, `${nodePath}.default_next_node_id`, transitions);
      break;
    case "action_request":
      pushTransition(node.id, node.on_accepted_node_id, `${nodePath}.on_accepted_node_id`, transitions);
      pushTransition(node.id, node.on_completed_node_id, `${nodePath}.on_completed_node_id`, transitions);
      pushTransition(node.id, node.on_failed_node_id, `${nodePath}.on_failed_node_id`, transitions);
      break;
    case "objective":
      pushTransition(node.id, node.on_created_node_id, `${nodePath}.on_created_node_id`, transitions);
      pushTransition(node.id, node.on_completed_node_id, `${nodePath}.on_completed_node_id`, transitions);
      pushTransition(node.id, node.on_failed_node_id, `${nodePath}.on_failed_node_id`, transitions);
      break;
    case "spawn_event":
      pushTransition(node.id, node.next_node_id, `${nodePath}.next_node_id`, transitions);
      break;
    case "log_only":
      pushTransition(node.id, node.next_node_id, `${nodePath}.next_node_id`, transitions);
      break;
    case "end":
      break;
  }
}

function pushTransition(fromNodeId: Id, toNodeId: Id | null | undefined, path: string, transitions: TransitionRef[]): void {
  if (!toNodeId) {
    return;
  }

  transitions.push({
    from_node_id: fromNodeId,
    to_node_id: toNodeId,
    path,
  });
}

function walkFrom(entryNodeId: Id, transitions: TransitionRef[]): Set<Id> {
  const outgoing = buildOutgoingTransitions(transitions);
  const visited = new Set<Id>();
  const stack = [entryNodeId];

  while (stack.length > 0) {
    const nodeId = stack.pop();
    if (!nodeId || visited.has(nodeId)) {
      continue;
    }

    visited.add(nodeId);
    for (const transition of outgoing.get(nodeId) ?? []) {
      stack.push(transition.to_node_id);
    }
  }

  return visited;
}

function buildOutgoingTransitions(transitions: TransitionRef[]): Map<Id, TransitionRef[]> {
  const outgoing = new Map<Id, TransitionRef[]>();
  for (const transition of transitions) {
    const existing = outgoing.get(transition.from_node_id);
    if (existing) {
      existing.push(transition);
    } else {
      outgoing.set(transition.from_node_id, [transition]);
    }
  }
  return outgoing;
}

function buildNodeIndex(nodes: EventGraph["nodes"]): Map<Id, number> {
  return new Map(nodes.map((node, index) => [node.id, index]));
}

function addDefinitionIssue(
  issues: EventValidationIssue[],
  definition: EventDefinition,
  code: EventValidationIssueCode,
  path: string,
  message: string,
): void {
  issues.push({
    code,
    path,
    message,
    severity: "error",
    asset_id: definition.id,
    asset_type: "event_definition",
  });
}

function addTemplateIssue(
  issues: EventValidationIssue[],
  template: CallTemplate,
  code: EventValidationIssueCode,
  path: string,
  message: string,
): void {
  issues.push({
    code,
    path,
    message,
    severity: "error",
    asset_id: template.id,
    asset_type: "call_template",
  });
}
