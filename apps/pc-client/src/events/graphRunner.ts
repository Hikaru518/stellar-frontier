import { evaluateConditions, type ConditionEvaluationContext } from "./conditions";
import type { EventContentIndex } from "./contentIndex";
import { renderRuntimeCall } from "./callRenderer";
import { executeEffects, type EffectGameState } from "./effects";
import { createObjectiveFromNode } from "./objectives";
import { pickWeightedBranch } from "./random";
import type {
  ActionRequestNode,
  CallNode,
  Effect,
  EffectGroup,
  EndNode,
  EventDefinition,
  EventNode,
  EventTerminalStatus,
  GameSeconds,
  Id,
  ObjectiveNode,
  RandomNode,
  RuntimeCall,
  RuntimeEvent,
  SpawnEventNode,
  TriggerContext,
} from "./types";

export type GraphRunnerGameState = EffectGameState;

export type GraphRunnerErrorCode =
  | "missing_event"
  | "missing_node"
  | "requirements_failed"
  | "effect_failed"
  | "call_render_failed"
  | "missing_option"
  | "missing_transition"
  | "progression_limit";

export interface GraphRunnerError {
  code: GraphRunnerErrorCode;
  event_id: Id;
  node_id?: Id;
  path: string;
  message: string;
}

export interface GraphRunnerOptions {
  event_id?: Id;
  parent_event_id?: Id | null;
  handler_registry?: ConditionEvaluationContext["handler_registry"];
  condition_handlers?: ConditionEvaluationContext["condition_handlers"];
  effect_handlers?: Parameters<typeof executeEffects>[1]["effect_handlers"];
  content_index?: EventContentIndex;
}

export interface GraphRunnerResult {
  state: GraphRunnerGameState;
  event: RuntimeEvent;
  errors: GraphRunnerError[];
  transitions: Array<{ from_node_id: Id | null; to_node_id: Id }>;
}

const MAX_SYNC_TRANSITIONS = 100;

export function startRuntimeEvent(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions = {},
): GraphRunnerResult {
  const eventId = options.event_id ?? triggerContext.event_id ?? `${definition.id}:${triggerContext.occurred_at}`;
  const runtimeEvent: RuntimeEvent = {
    id: eventId,
    event_definition_id: definition.id,
    event_definition_version: definition.version,
    status: "active",
    current_node_id: definition.event_graph.entry_node_id,
    primary_crew_id: triggerContext.crew_id ?? null,
    related_crew_ids: [],
    primary_tile_id: triggerContext.tile_id ?? null,
    related_tile_ids: [],
    parent_event_id: options.parent_event_id ?? null,
    child_event_ids: [],
    objective_ids: [],
    active_call_id: null,
    selected_options: {},
    random_results: {},
    blocking_claim_ids: [],
    created_at: triggerContext.occurred_at,
    updated_at: triggerContext.occurred_at,
    deadline_at: null,
    next_wakeup_at: null,
    trigger_context_snapshot: { ...triggerContext, event_id: eventId, event_definition_id: definition.id },
    history_keys: [],
    result_key: null,
    result_summary: null,
  };
  const nextState = upsertEvent(cloneState(state), runtimeEvent);

  return enterNode(nextState, definition, runtimeEvent, runtimeEvent.current_node_id, triggerContext, options, [
    { from_node_id: null, to_node_id: runtimeEvent.current_node_id },
  ]);
}

export function advanceRuntimeEvent(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  eventId: Id,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions = {},
): GraphRunnerResult {
  const clonedState = cloneState(state);
  const event = clonedState.active_events[eventId];
  if (!event) {
    return failedResult(clonedState, missingEvent(eventId), createPlaceholderEvent(eventId, definition, triggerContext));
  }

  const node = findNode(definition, event.current_node_id);
  if (!node) {
    return failEvent(clonedState, definition, event, missingNode(event, event.current_node_id), triggerContext);
  }

  if (node.type === "call" && triggerContext.trigger_type === "call_choice") {
    return advanceCallChoice(clonedState, definition, event, node, triggerContext, options);
  }

  if (node.type === "call" && triggerContext.trigger_type === "time_wakeup" && node.on_missed?.next_node_id) {
    return advanceMissedCall(clonedState, definition, event, node, triggerContext, options);
  }

  if (node.type === "wait" && isWaitWakeup(triggerContext)) {
    const stateWithEvent = upsertEvent(clonedState, { ...event, next_wakeup_at: null, updated_at: now(triggerContext, clonedState) });
    return transitionFromNode(stateWithEvent, definition, event, node.next_node_id, triggerContext, options);
  }

  if (node.type === "action_request" && triggerContext.trigger_type === "action_complete") {
    const nextNodeId = isFailurePayload(triggerContext) ? node.on_failed_node_id : node.on_completed_node_id;
    return transitionFromNode(clonedState, definition, event, nextNodeId, triggerContext, options);
  }

  if (node.type === "objective" && triggerContext.trigger_type === "objective_completed") {
    const nextNodeId = isFailurePayload(triggerContext) ? node.on_failed_node_id : node.on_completed_node_id;
    if (!nextNodeId) {
      return failEvent(clonedState, definition, event, missingTransition(event, node.id, "objective completion"), triggerContext);
    }
    return transitionFromNode(clonedState, definition, event, nextNodeId, triggerContext, options);
  }

  if (node.auto_next_node_id && triggerContext.trigger_type === "event_node_finished") {
    return transitionFromNode(clonedState, definition, event, node.auto_next_node_id, triggerContext, options);
  }

  return {
    state: clonedState,
    event,
    errors: [missingTransition(event, node.id, `trigger ${triggerContext.trigger_type}`)],
    transitions: [],
  };
}

function enterNode(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  nodeId: Id,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
  transitions: Array<{ from_node_id: Id | null; to_node_id: Id }>,
): GraphRunnerResult {
  let currentState = state;
  let currentEvent: RuntimeEvent = {
    ...event,
    current_node_id: nodeId,
    status: "active" as const,
    updated_at: now(triggerContext, state),
  };

  for (let step = 0; step < MAX_SYNC_TRANSITIONS; step += 1) {
    const node = findNode(definition, currentEvent.current_node_id);
    if (!node) {
      return failEvent(currentState, definition, currentEvent, missingNode(currentEvent, currentEvent.current_node_id), triggerContext);
    }

    const prepared = prepareNodeEntry(currentState, definition, currentEvent, node, triggerContext, options);
    if (prepared.errors.length > 0) {
      return failEvent(prepared.state, definition, prepared.event, prepared.errors[0], triggerContext);
    }

    currentState = prepared.state;
    currentEvent = prepared.event;

    const stepResult = resolveEnteredNode(currentState, definition, currentEvent, node, triggerContext, options);
    if (stepResult.errors.length > 0) {
      return failEvent(stepResult.state, definition, stepResult.event, stepResult.errors[0], triggerContext);
    }

    if (!stepResult.next_node_id) {
      return { ...stepResult, transitions };
    }

    transitions.push({ from_node_id: node.id, to_node_id: stepResult.next_node_id });
    currentState = stepResult.state;
    currentEvent = {
      ...stepResult.event,
      current_node_id: stepResult.next_node_id,
      status: "active",
      next_wakeup_at: null,
      updated_at: now(triggerContext, stepResult.state),
    };
    currentState = upsertEvent(currentState, currentEvent);
  }

  return failEvent(currentState, definition, currentEvent, progressionLimit(currentEvent), triggerContext);
}

function prepareNodeEntry(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  node: EventNode,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): { state: GraphRunnerGameState; event: RuntimeEvent; errors: GraphRunnerError[] } {
  const requirements = evaluateConditions(node.requirements ?? [], conditionContext(state, event, triggerContext, options), `nodes.${node.id}.requirements`);
  if (!requirements.passed || requirements.errors.length > 0) {
    return {
      state,
      event,
      errors: [
        {
          code: "requirements_failed",
          event_id: event.id,
          node_id: node.id,
          path: `nodes.${node.id}.requirements`,
          message: requirements.errors[0]?.message ?? `Requirements failed for node ${node.id}.`,
        },
      ],
    };
  }

  const claimedEvent = claimBlocking(event, node);
  let nextState = upsertEvent(state, claimedEvent);
  const enterEffects = collectEffects(definition.effect_groups, node.enter_effect_refs);
  const effects = [...enterEffects, ...(node.inline_effects ?? [])];
  if (effects.length === 0) {
    return { state: nextState, event: claimedEvent, errors: [] };
  }

  const effectResult = executeEffects(effects, {
    state: nextState,
    trigger_context: runtimeTriggerContext(triggerContext, claimedEvent, node.id),
    active_event_id: claimedEvent.id,
    handler_registry: options.handler_registry,
    effect_handlers: options.effect_handlers,
  });
  nextState = effectResult.state;

  if (effectResult.status === "failed" || effectResult.status === "retry_later") {
    return {
      state: nextState,
      event: nextState.active_events[claimedEvent.id] ?? claimedEvent,
      errors: [effectError(claimedEvent, node.id, effectResult.errors[0]?.message ?? "Node enter effects failed.")],
    };
  }

  return { state: nextState, event: nextState.active_events[claimedEvent.id] ?? claimedEvent, errors: [] };
}

function resolveEnteredNode(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  node: EventNode,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): GraphRunnerResult & { next_node_id?: Id | null } {
  switch (node.type) {
    case "call":
      return waitForCall(state, event, node, triggerContext, options);
    case "wait":
      return waitForTime(state, event, node, triggerContext);
    case "check":
      return resolveCheckNode(state, definition, event, node, triggerContext, options);
    case "random":
      return resolveRandomNode(state, definition, event, node, triggerContext, options);
    case "action_request":
      return waitForActionRequest(state, event, node, triggerContext);
    case "objective":
      return enterObjectiveNode(state, event, node, triggerContext);
    case "spawn_event":
      return enterSpawnEventNode(state, event, node, definition, triggerContext);
    case "log_only":
      return runEffectsAndContinue(state, definition, event, node, node.effect_refs ?? [], node.auto_next_node_id ?? node.next_node_id, triggerContext, options);
    case "end":
      return enterEndNode(state, definition, event, node, triggerContext, options);
    default:
      return { state, event, errors: [missingNode(event, event.current_node_id)], transitions: [] };
  }
}

function advanceCallChoice(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  node: CallNode,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): GraphRunnerResult {
  const optionId = triggerContext.selected_option_id;
  const nextNodeId = optionId ? node.option_node_mapping[optionId] : undefined;
  const option = optionId ? node.options.find((item) => item.id === optionId) : undefined;
  const activeCall = event.active_call_id ? state.active_calls[event.active_call_id] : undefined;
  const optionIsAvailable = !activeCall || activeCall.available_options.some((item) => item.option_id === optionId);
  if (!optionId || !nextNodeId || !option || !optionIsAvailable) {
    return { state, event, errors: [missingOption(event, node.id, optionId)], transitions: [] };
  }

  const activeCallId = event.active_call_id;
  const nextCalls =
    activeCallId && state.active_calls[activeCallId]
      ? {
          ...state.active_calls,
          [activeCallId]: {
            ...state.active_calls[activeCallId],
            status: "ended" as const,
            selected_option_id: optionId,
            ended_at: now(triggerContext, state),
          },
        }
      : state.active_calls;
  const selectedEvent = {
    ...event,
    active_call_id: null,
    selected_options: {
      ...event.selected_options,
      [node.id]: optionId,
    },
    updated_at: now(triggerContext, state),
  };
  const stateWithSelection = upsertEvent({ ...state, active_calls: nextCalls }, selectedEvent);
  const afterOptionEffects = runEffects(stateWithSelection, definition, selectedEvent, node.id, option.effect_refs ?? [], triggerContext, options);
  if (afterOptionEffects.errors.length > 0) {
    return failEvent(afterOptionEffects.state, definition, afterOptionEffects.event, afterOptionEffects.errors[0], triggerContext);
  }

  return transitionFromNode(afterOptionEffects.state, definition, afterOptionEffects.event, nextNodeId, triggerContext, options);
}

function advanceMissedCall(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  node: CallNode,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): GraphRunnerResult {
  const onMissed = node.on_missed;
  const nextNodeId = onMissed?.next_node_id;
  if (!nextNodeId) {
    return { state, event, errors: [missingTransition(event, node.id, "missed call")], transitions: [] };
  }

  const activeCallId = event.active_call_id;
  const nextCalls =
    activeCallId && state.active_calls[activeCallId]
      ? {
          ...state.active_calls,
          [activeCallId]: {
            ...state.active_calls[activeCallId],
            status: "missed" as const,
            ended_at: now(triggerContext, state),
          },
        }
      : state.active_calls;
  const missedEvent = {
    ...event,
    deadline_at: null,
    updated_at: now(triggerContext, state),
  };
  const stateWithMissedCall = upsertEvent({ ...state, active_calls: nextCalls }, missedEvent);
  const afterMissedEffects = runEffects(stateWithMissedCall, definition, missedEvent, node.id, onMissed.effect_refs ?? [], triggerContext, options);
  if (afterMissedEffects.errors.length > 0) {
    return failEvent(afterMissedEffects.state, definition, afterMissedEffects.event, afterMissedEffects.errors[0], triggerContext);
  }

  return enterNode(afterMissedEffects.state, definition, afterMissedEffects.event, nextNodeId, triggerContext, options, [
    { from_node_id: node.id, to_node_id: nextNodeId },
  ]);
}

function transitionFromNode(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  nextNodeId: Id,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): GraphRunnerResult {
  const currentNode = findNode(definition, event.current_node_id);
  const afterExitEffects =
    currentNode?.exit_effect_refs && currentNode.exit_effect_refs.length > 0
      ? runEffects(state, definition, event, currentNode.id, currentNode.exit_effect_refs, triggerContext, options)
      : { state, event, errors: [] };
  if (afterExitEffects.errors.length > 0) {
    return failEvent(afterExitEffects.state, definition, afterExitEffects.event, afterExitEffects.errors[0], triggerContext);
  }

  return enterNode(afterExitEffects.state, definition, afterExitEffects.event, nextNodeId, triggerContext, options, [
    { from_node_id: event.current_node_id, to_node_id: nextNodeId },
  ]);
}

function resolveCheckNode(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  node: Extract<EventNode, { type: "check" }>,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): GraphRunnerResult & { next_node_id?: Id | null } {
  const branch = node.branches.find((candidate) =>
    evaluateConditions(candidate.conditions, conditionContext(state, event, triggerContext, options), `nodes.${node.id}.branches.${candidate.id}.conditions`).passed,
  );
  if (!branch) {
    return { state, event, errors: [], transitions: [], next_node_id: node.default_next_node_id };
  }

  return runEffectsAndContinue(state, definition, event, node, branch.effect_refs ?? [], branch.next_node_id, triggerContext, options);
}

function resolveRandomNode(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  node: RandomNode,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): GraphRunnerResult & { next_node_id?: Id | null } {
  const eligibleBranches = node.branches.filter(
    (branch) =>
      !branch.conditions ||
      evaluateConditions(branch.conditions, conditionContext(state, event, triggerContext, options), `nodes.${node.id}.branches.${branch.id}.conditions`).passed,
  );
  const seed = randomSeed(node, event, triggerContext);
  const pick = pickWeightedBranch(eligibleBranches, seed);
  const nextNodeId = pick.branch?.next_node_id ?? node.default_next_node_id ?? null;
  if (!nextNodeId) {
    return { state, event, errors: [missingTransition(event, node.id, "random branch")], transitions: [] };
  }

  const eventWithResult = {
    ...event,
    random_results: {
      ...event.random_results,
      [node.store_result_as]: {
        branch_id: pick.branch?.id ?? "default",
        roll: pick.roll,
        seed,
      },
    },
  };
  const stateWithResult = upsertEvent(state, eventWithResult);
  return runEffectsAndContinue(
    stateWithResult,
    definition,
    eventWithResult,
    node,
    pick.branch?.effect_refs ?? [],
    nextNodeId,
    triggerContext,
    options,
  );
}

function waitForCall(
  state: GraphRunnerGameState,
  event: RuntimeEvent,
  node: CallNode,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): GraphRunnerResult & { next_node_id?: Id | null } {
  const callId = event.active_call_id ?? `${event.id}:${node.id}:call`;
  const call = state.active_calls[callId] ?? renderCall(state, event, node, triggerContext, options);
  if (Array.isArray(call)) {
    return { state, event, errors: call, transitions: [], next_node_id: null };
  }
  const nextEvent = {
    ...event,
    status: "waiting_call" as const,
    active_call_id: callId,
    deadline_at: typeof node.expires_in_seconds === "number" ? now(triggerContext, state) + node.expires_in_seconds : event.deadline_at ?? null,
    updated_at: now(triggerContext, state),
  };
  const nextState = upsertEvent({ ...state, active_calls: { ...state.active_calls, [callId]: call } }, nextEvent);

  return { state: nextState, event: nextEvent, errors: [], transitions: [], next_node_id: null };
}

function renderCall(
  state: GraphRunnerGameState,
  event: RuntimeEvent,
  node: CallNode,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): RuntimeCall | GraphRunnerError[] {
  const template = options.content_index?.callTemplatesById.get(node.call_template_id);
  if (!template) {
    return {
      id: event.active_call_id ?? `${event.id}:${node.id}:call`,
      event_id: event.id,
      event_node_id: node.id,
      call_template_id: node.call_template_id,
      crew_id: event.primary_crew_id ?? triggerContext.crew_id ?? "unknown_crew",
      status: "incoming",
      created_at: now(triggerContext, state),
      connected_at: null,
      ended_at: null,
      expires_at: typeof node.expires_in_seconds === "number" ? now(triggerContext, state) + node.expires_in_seconds : null,
      render_context_snapshot: {},
      rendered_lines: [],
      available_options: node.options.map((option) => ({
        option_id: option.id,
        template_variant_id: "pending_renderer",
        text: option.id,
        is_default: option.is_default ?? false,
      })),
      selected_option_id: null,
      blocking_claim_id: node.blocking.occupies_communication ? `${event.id}:${node.id}:communication` : null,
    };
  }

  const rendered = renderRuntimeCall({
    state,
    event,
    node,
    template,
    trigger_context: triggerContext,
  });
  if (rendered.errors.length > 0) {
    return rendered.errors.map((error) => ({
      code: "call_render_failed" as const,
      event_id: event.id,
      node_id: node.id,
      path: error.path,
      message: error.message,
    }));
  }

  return rendered.call;
}

function waitForTime(
  state: GraphRunnerGameState,
  event: RuntimeEvent,
  node: Extract<EventNode, { type: "wait" }>,
  triggerContext: TriggerContext,
): GraphRunnerResult & { next_node_id?: Id | null } {
  const wakeupAt = node.set_next_wakeup_at ? now(triggerContext, state) + node.duration_seconds : null;
  const nextEvent = {
    ...event,
    status: "waiting_time" as const,
    next_wakeup_at: wakeupAt,
    updated_at: now(triggerContext, state),
  };

  return { state: upsertEvent(state, nextEvent), event: nextEvent, errors: [], transitions: [], next_node_id: null };
}

function waitForActionRequest(
  state: GraphRunnerGameState,
  event: RuntimeEvent,
  node: ActionRequestNode,
  triggerContext: TriggerContext,
): GraphRunnerResult & { next_node_id?: Id | null } {
  if (node.on_accepted_node_id) {
    return { state, event, errors: [], transitions: [], next_node_id: node.on_accepted_node_id };
  }

  const nextEvent = {
    ...event,
    status: "waiting_action" as const,
    deadline_at: typeof node.expires_in_seconds === "number" ? now(triggerContext, state) + node.expires_in_seconds : event.deadline_at ?? null,
    updated_at: now(triggerContext, state),
  };
  return { state: upsertEvent(state, nextEvent), event: nextEvent, errors: [], transitions: [], next_node_id: null };
}

function enterObjectiveNode(
  state: GraphRunnerGameState,
  event: RuntimeEvent,
  node: ObjectiveNode,
  triggerContext: TriggerContext,
): GraphRunnerResult & { next_node_id?: Id | null } {
  const created = createObjectiveFromNode({
    state,
    event,
    node,
    trigger_context: triggerContext,
  });

  if (node.mode === "create_and_continue" && node.on_created_node_id) {
    return { state: created.state, event: created.event, errors: [], transitions: [], next_node_id: node.on_created_node_id };
  }

  const waitingEvent = { ...created.event, status: "waiting_objective" as const, updated_at: now(triggerContext, state) };
  return { state: upsertEvent(created.state, waitingEvent), event: waitingEvent, errors: [], transitions: [], next_node_id: null };
}

function enterSpawnEventNode(
  state: GraphRunnerGameState,
  event: RuntimeEvent,
  node: SpawnEventNode,
  definition: EventDefinition,
  triggerContext: TriggerContext,
): GraphRunnerResult & { next_node_id?: Id | null } {
  const childEventId = `${event.id}:${node.id}:child`;
  const childEvent: RuntimeEvent = {
    id: childEventId,
    event_definition_id: node.event_definition_id,
    event_definition_version: 1,
    status: node.spawn_policy === "immediate" ? "active" : "waiting_time",
    current_node_id: "entry",
    primary_crew_id: event.primary_crew_id,
    related_crew_ids: [],
    primary_tile_id: event.primary_tile_id,
    related_tile_ids: [],
    parent_event_id: node.parent_event_link ? event.id : null,
    child_event_ids: [],
    objective_ids: [],
    active_call_id: null,
    selected_options: {},
    random_results: {},
    blocking_claim_ids: [],
    created_at: now(triggerContext, state),
    updated_at: now(triggerContext, state),
    deadline_at: null,
    next_wakeup_at: null,
    trigger_context_snapshot: runtimeTriggerContext(triggerContext, event, node.id),
    history_keys: [],
    result_key: null,
    result_summary: null,
  };
  const parentEvent = {
    ...event,
    child_event_ids: node.parent_event_link && !event.child_event_ids.includes(childEventId) ? [...event.child_event_ids, childEventId] : event.child_event_ids,
  };
  const nextState = upsertEvent(upsertEvent(state, childEvent), parentEvent);
  return runEffectsAndContinue(nextState, definition, parentEvent, node, [], node.next_node_id, triggerContext, {});
}

function enterEndNode(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  node: EndNode,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): GraphRunnerResult & { next_node_id?: Id | null } {
  const afterFinalEffects = runEffects(state, definition, event, node.id, node.final_effect_refs ?? [], triggerContext, options);
  if (afterFinalEffects.errors.length > 0) {
    return { ...afterFinalEffects, transitions: [], next_node_id: null };
  }

  const stateAfterCleanup = node.cleanup_policy.release_blocking_claims
    ? releaseEventCrewActions(afterFinalEffects.state, event.id, node.resolution, triggerContext)
    : afterFinalEffects.state;
  const eventAfterCleanup = stateAfterCleanup.active_events[event.id] ?? afterFinalEffects.event;
  const activeCallId = afterFinalEffects.event.active_call_id;
  const nextCalls =
    node.cleanup_policy.delete_active_calls && activeCallId
      ? omitKey(stateAfterCleanup.active_calls, activeCallId)
      : stateAfterCleanup.active_calls;
  const resultSummary = node.cleanup_policy.keep_player_summary
    ? `${findLogSummary(definition, node.event_log_template_id)}: ${node.result_key}`
    : null;
  const endedEvent = {
    ...eventAfterCleanup,
    status: node.resolution,
    result_key: node.result_key,
    result_summary: resultSummary,
    blocking_claim_ids: node.cleanup_policy.release_blocking_claims ? [] : afterFinalEffects.event.blocking_claim_ids,
    active_call_id: node.cleanup_policy.delete_active_calls ? null : afterFinalEffects.event.active_call_id,
    next_wakeup_at: null,
    updated_at: now(triggerContext, state),
  };
  const nextState = upsertEvent({ ...stateAfterCleanup, active_calls: nextCalls }, endedEvent);

  return { state: nextState, event: endedEvent, errors: [], transitions: [], next_node_id: null };
}

function releaseEventCrewActions(
  state: GraphRunnerGameState,
  eventId: Id,
  resolution: EventTerminalStatus,
  triggerContext: TriggerContext,
): GraphRunnerGameState {
  const releasedActionIds = new Set<Id>();
  const crewActions = Object.fromEntries(
    Object.entries(state.crew_actions).map(([actionId, action]) => {
      if (action.parent_event_id !== eventId || action.status !== "active") {
        return [actionId, action];
      }

      releasedActionIds.add(actionId);
      return [
        actionId,
        {
          ...action,
          status: resolution === "resolved" ? ("completed" as const) : ("cancelled" as const),
          ends_at: now(triggerContext, state),
          progress_seconds: action.duration_seconds,
        },
      ];
    }),
  );

  if (releasedActionIds.size === 0) {
    return state;
  }

  const crew = Object.fromEntries(
    Object.entries(state.crew).map(([crewId, crewState]) => [
      crewId,
      crewState.current_action_id && releasedActionIds.has(crewState.current_action_id)
        ? { ...crewState, current_action_id: null, status: "idle" as const }
        : crewState,
    ]),
  );

  return {
    ...state,
    crew,
    crew_actions: crewActions,
  };
}

function runEffectsAndContinue(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  node: EventNode,
  effectRefs: Id[],
  nextNodeId: Id,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): GraphRunnerResult & { next_node_id?: Id | null } {
  const effectResult = runEffects(state, definition, event, node.id, effectRefs, triggerContext, options);
  if (effectResult.errors.length > 0) {
    return { ...effectResult, transitions: [], next_node_id: null };
  }

  return { ...effectResult, transitions: [], next_node_id: nextNodeId };
}

function runEffects(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  event: RuntimeEvent,
  nodeId: Id,
  effectRefs: Id[],
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): { state: GraphRunnerGameState; event: RuntimeEvent; errors: GraphRunnerError[] } {
  const effects = collectEffects(definition.effect_groups, effectRefs);
  if (effects.length === 0) {
    return { state, event, errors: [] };
  }

  const result = executeEffects(effects, {
    state,
    trigger_context: runtimeTriggerContext(triggerContext, event, nodeId),
    active_event_id: event.id,
    handler_registry: options.handler_registry,
    effect_handlers: options.effect_handlers,
  });
  const nextEvent = result.state.active_events[event.id] ?? event;
  if (result.status === "failed" || result.status === "retry_later") {
    return {
      state: result.state,
      event: nextEvent,
      errors: [effectError(event, nodeId, result.errors[0]?.message ?? `Effects failed for node ${nodeId}.`)],
    };
  }

  return { state: result.state, event: nextEvent, errors: [] };
}

function collectEffects(effectGroups: EffectGroup[] | undefined, effectRefs: Id[] | undefined): Effect[] {
  if (!effectGroups || !effectRefs || effectRefs.length === 0) {
    return [];
  }

  const groupsById = new Map(effectGroups.map((group) => [group.id, group]));
  return effectRefs.flatMap((effectRef) => groupsById.get(effectRef)?.effects ?? []);
}

function claimBlocking(event: RuntimeEvent, node: EventNode): RuntimeEvent {
  const claimIds = [
    ...(node.blocking.occupies_crew_action ? [`${event.id}:${node.id}:crew_action`] : []),
    ...(node.blocking.occupies_communication ? [`${event.id}:${node.id}:communication`] : []),
  ];
  if (claimIds.length === 0) {
    return event;
  }

  return {
    ...event,
    blocking_claim_ids: Array.from(new Set([...event.blocking_claim_ids, ...claimIds])),
  };
}

function conditionContext(
  state: GraphRunnerGameState,
  event: RuntimeEvent,
  triggerContext: TriggerContext,
  options: GraphRunnerOptions,
): ConditionEvaluationContext {
  return {
    state,
    trigger_context: runtimeTriggerContext(triggerContext, event, event.current_node_id),
    active_event_id: event.id,
    handler_registry: options.handler_registry,
    condition_handlers: options.condition_handlers,
  };
}

function randomSeed(node: RandomNode, event: RuntimeEvent, triggerContext: TriggerContext): string {
  switch (node.seed_scope) {
    case "node_entry":
      return `${event.id}:${node.id}:${event.updated_at}:${node.store_result_as}`;
    case "trigger_context":
      return `${event.id}:${node.id}:${JSON.stringify(triggerContext)}:${node.store_result_as}`;
    case "event_instance":
    default:
      return `${event.id}:${node.id}:${node.store_result_as}`;
  }
}

function findNode(definition: EventDefinition, nodeId: Id): EventNode | undefined {
  return definition.event_graph.nodes.find((node) => node.id === nodeId);
}

function upsertEvent(state: GraphRunnerGameState, event: RuntimeEvent): GraphRunnerGameState {
  return {
    ...state,
    active_events: {
      ...state.active_events,
      [event.id]: event,
    },
  };
}

function failEvent(
  state: GraphRunnerGameState,
  _definition: EventDefinition,
  event: RuntimeEvent,
  error: GraphRunnerError,
  triggerContext: TriggerContext,
): GraphRunnerResult {
  const failedEvent = {
    ...event,
    status: "failed" as EventTerminalStatus,
    result_key: event.result_key ?? "runner_error",
    result_summary: error.message,
    updated_at: now(triggerContext, state),
  };
  return failedResult(upsertEvent(state, failedEvent), error, failedEvent);
}

function failedResult(state: GraphRunnerGameState, error: GraphRunnerError, event: RuntimeEvent): GraphRunnerResult {
  return {
    state,
    event,
    errors: [error],
    transitions: [],
  };
}

function runtimeTriggerContext(triggerContext: TriggerContext, event: RuntimeEvent, nodeId: Id): TriggerContext {
  return {
    ...triggerContext,
    event_id: event.id,
    event_definition_id: event.event_definition_id,
    node_id: nodeId,
  };
}

function now(triggerContext: TriggerContext, state: GraphRunnerGameState): GameSeconds {
  return triggerContext.occurred_at ?? state.elapsed_game_seconds ?? state.elapsedGameSeconds ?? 0;
}

function isWaitWakeup(triggerContext: TriggerContext): boolean {
  return triggerContext.trigger_type === "time_wakeup" || triggerContext.trigger_type === "event_node_finished";
}

function isFailurePayload(triggerContext: TriggerContext): boolean {
  const status = triggerContext.payload?.status;
  return status === "failed" || status === "cancelled" || status === "interrupted" || status === "expired";
}

function findLogSummary(definition: EventDefinition, logTemplateId: Id): string {
  return definition.log_templates?.find((template) => template.id === logTemplateId)?.summary ?? logTemplateId;
}

function omitKey<T>(record: Record<Id, T>, key: Id): Record<Id, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

function cloneState(state: GraphRunnerGameState): GraphRunnerGameState {
  return structuredClone(state);
}

function createPlaceholderEvent(eventId: Id, definition: EventDefinition, triggerContext: TriggerContext): RuntimeEvent {
  return {
    id: eventId,
    event_definition_id: definition.id,
    event_definition_version: definition.version,
    status: "failed",
    current_node_id: definition.event_graph.entry_node_id,
    primary_crew_id: triggerContext.crew_id ?? null,
    related_crew_ids: [],
    primary_tile_id: triggerContext.tile_id ?? null,
    related_tile_ids: [],
    child_event_ids: [],
    objective_ids: [],
    selected_options: {},
    random_results: {},
    blocking_claim_ids: [],
    created_at: now(triggerContext, createEmptyRunnerState()),
    updated_at: now(triggerContext, createEmptyRunnerState()),
    trigger_context_snapshot: triggerContext,
    history_keys: [],
    result_key: "missing_event",
    result_summary: `Runtime event ${eventId} does not exist.`,
  };
}

function createEmptyRunnerState(): GraphRunnerGameState {
  return {
    elapsed_game_seconds: 0,
    crew: {},
    tiles: {},
    crew_actions: {},
    inventories: {},
    active_events: {},
    active_calls: {},
    objectives: {},
    event_logs: [],
    world_history: {},
    world_flags: {},
    rng_state: null,
  };
}

function missingEvent(eventId: Id): GraphRunnerError {
  return {
    code: "missing_event",
    event_id: eventId,
    path: "active_events",
    message: `Runtime event ${eventId} does not exist.`,
  };
}

function missingNode(event: RuntimeEvent, nodeId: Id): GraphRunnerError {
  return {
    code: "missing_node",
    event_id: event.id,
    node_id: nodeId,
    path: `event_graph.nodes.${nodeId}`,
    message: `Node ${nodeId} does not exist in event definition ${event.event_definition_id}.`,
  };
}

function missingOption(event: RuntimeEvent, nodeId: Id, optionId: Id | null | undefined): GraphRunnerError {
  return {
    code: "missing_option",
    event_id: event.id,
    node_id: nodeId,
    path: `event_graph.nodes.${nodeId}.option_node_mapping`,
    message: `Option ${optionId ?? "<missing>"} cannot advance call node ${nodeId}.`,
  };
}

function missingTransition(event: RuntimeEvent, nodeId: Id, reason: string): GraphRunnerError {
  return {
    code: "missing_transition",
    event_id: event.id,
    node_id: nodeId,
    path: `event_graph.nodes.${nodeId}`,
    message: `Node ${nodeId} has no transition for ${reason}.`,
  };
}

function effectError(event: RuntimeEvent, nodeId: Id, message: string): GraphRunnerError {
  return {
    code: "effect_failed",
    event_id: event.id,
    node_id: nodeId,
    path: `event_graph.nodes.${nodeId}.effects`,
    message,
  };
}

function progressionLimit(event: RuntimeEvent): GraphRunnerError {
  return {
    code: "progression_limit",
    event_id: event.id,
    node_id: event.current_node_id,
    path: "event_graph",
    message: "Graph runner exceeded the synchronous progression limit.",
  };
}
