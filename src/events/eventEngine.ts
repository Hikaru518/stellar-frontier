import type { EventContentIndex } from "./contentIndex";
import { evaluateConditions } from "./conditions";
import { advanceRuntimeEvent, startRuntimeEvent, type GraphRunnerGameState, type GraphRunnerResult } from "./graphRunner";
import { assignObjectiveToCrew, markObjectiveCompleted, type ObjectiveRuntimeError } from "./objectives";
import { pickHighestPriorityWeightedBranch } from "./random";
import type { EventDefinition, GameSeconds, Id, RuntimeCall, RuntimeEvent, TriggerContext, WorldHistoryEntry } from "./types";

export type EventEngineErrorCode =
  | "missing_call"
  | "call_not_active"
  | "missing_event"
  | "missing_event_definition"
  | "missing_objective"
  | "missing_crew"
  | "missing_parent_event"
  | "objective_not_available"
  | "crew_not_eligible"
  | "option_unavailable"
  | "graph_runner_error";

export interface EventEngineError {
  code: EventEngineErrorCode;
  call_id?: Id;
  option_id?: Id;
  objective_id?: Id;
  crew_id?: Id;
  event_id?: Id;
  path: string;
  message: string;
}

export interface EventEngineResult {
  state: GraphRunnerGameState;
  event?: RuntimeEvent;
  events?: RuntimeEvent[];
  errors: EventEngineError[];
  graph_result?: GraphRunnerResult;
  graph_results?: GraphRunnerResult[];
  candidate_report?: EventCandidateSelectionReport;
}

export interface EventCandidateSelectionReport {
  trigger_context: TriggerContext;
  candidate_event_definition_ids: Id[];
  passed_condition_ids: Id[];
  filtered_by_history_ids: Id[];
  filtered_by_mutex_ids: Id[];
  filtered_by_blocking_ids: Id[];
  selected_event_definition_ids: Id[];
  roll_seed: string | null;
  created_event_ids: Id[];
}

export interface SelectCallOptionInput {
  state: GraphRunnerGameState;
  index: EventContentIndex;
  call_id: Id;
  option_id: Id;
  occurred_at: GameSeconds;
}

export interface ProcessTriggerInput {
  state: GraphRunnerGameState;
  index: EventContentIndex;
  context: TriggerContext;
}

export interface ProcessEventWakeupsInput {
  state: GraphRunnerGameState;
  index: EventContentIndex;
  elapsed_game_seconds: GameSeconds;
}

export interface AssignObjectiveInput {
  state: GraphRunnerGameState;
  index: EventContentIndex;
  objective_id: Id;
  crew_id: Id;
  occurred_at: GameSeconds;
}

export interface CompleteObjectiveInput {
  state: GraphRunnerGameState;
  index: EventContentIndex;
  objective_id: Id;
  occurred_at: GameSeconds;
  result_key?: string | null;
}

const ACTIVE_CALL_STATUSES = new Set<RuntimeCall["status"]>(["incoming", "connected", "awaiting_choice"]);
const ACTIVE_EVENT_STATUSES = new Set<RuntimeEvent["status"]>([
  "active",
  "waiting_call",
  "waiting_time",
  "waiting_action",
  "waiting_objective",
  "resolving",
]);

interface Candidate {
  id: Id;
  definition: EventDefinition;
  historyKey: string;
  priority: number;
  weight: number;
}

export function processTrigger(input: ProcessTriggerInput): EventEngineResult {
  if (input.context.trigger_type === "call_choice" && input.context.call_id && input.context.selected_option_id) {
    return selectCallOption({
      state: input.state,
      index: input.index,
      call_id: input.context.call_id,
      option_id: input.context.selected_option_id,
      occurred_at: input.context.occurred_at,
    });
  }

  if (input.context.event_id) {
    return advanceExistingEvent(input);
  }

  const report = emptyCandidateReport(input.context, input.index.getDefinitionsByTriggerType(input.context.trigger_type));
  const conditionCandidates = collectConditionCandidates(input, report);
  const historyCandidates = filterHistoryCandidates(input, conditionCandidates, report);
  const mutexCandidates = filterMutexCandidates(input, historyCandidates, report);
  const blockingCandidates = filterBlockingCandidates(input, mutexCandidates, report);
  const rollSeed = candidateRollSeed(input.context);
  const pick = pickHighestPriorityWeightedBranch(blockingCandidates, rollSeed);
  report.roll_seed = blockingCandidates.length > 0 ? rollSeed : null;
  if (!pick.branch) {
    return { state: input.state, errors: [], events: [], candidate_report: report, graph_results: [] };
  }

  const selected = pick.branch;
  report.selected_event_definition_ids = [selected.definition.id];
  const eventId = nextEventId(input.state, selected.definition.id, input.context.occurred_at);
  const triggerContext = { ...input.context, event_id: eventId, event_definition_id: selected.definition.id };
  const graphResult = startRuntimeEvent(input.state, selected.definition, triggerContext, {
    event_id: eventId,
    content_index: input.index,
    handler_registry: input.index.handlersByType,
  });
  const stateWithHistory = writeTriggerHistory(
    graphResult.state,
    selected.definition,
    selected.historyKey,
    eventId,
    triggerContext,
  );
  const event = stateWithHistory.active_events[eventId] ?? graphResult.event;
  report.created_event_ids = [eventId];

  return {
    state: stateWithHistory,
    event,
    events: [event],
    errors: graphResult.errors.map((error) => ({
      code: "graph_runner_error",
      event_id: eventId,
      path: error.path,
      message: error.message,
    })),
    graph_result: graphResult,
    graph_results: [graphResult],
    candidate_report: report,
  };
}

export function processEventWakeups(input: ProcessEventWakeupsInput): EventEngineResult {
  let state: GraphRunnerGameState = { ...input.state, elapsed_game_seconds: input.elapsed_game_seconds };
  const events: RuntimeEvent[] = [];
  const errors: EventEngineError[] = [];
  const graphResults: GraphRunnerResult[] = [];

  const dueEvents = Object.values(state.active_events)
    .filter((event) => isDueTimedEvent(event, input.elapsed_game_seconds))
    .sort((left, right) => eventDueAt(left) - eventDueAt(right) || left.id.localeCompare(right.id));

  for (const dueEvent of dueEvents) {
    const result = processTrigger({
      state,
      index: input.index,
      context: {
        ...dueEvent.trigger_context_snapshot,
        trigger_type: "time_wakeup",
        source: "time_system",
        occurred_at: input.elapsed_game_seconds,
        event_id: dueEvent.id,
        event_definition_id: dueEvent.event_definition_id,
        crew_id: dueEvent.primary_crew_id ?? dueEvent.trigger_context_snapshot.crew_id ?? null,
        tile_id: dueEvent.primary_tile_id ?? dueEvent.trigger_context_snapshot.tile_id ?? null,
      },
    });
    state = result.state;
    errors.push(...result.errors);
    if (result.event) {
      events.push(result.event);
    }
    if (result.graph_result) {
      graphResults.push(result.graph_result);
    }
  }

  return { state, events, event: events[events.length - 1], errors, graph_results: graphResults };
}

function isDueTimedEvent(event: RuntimeEvent, elapsedGameSeconds: GameSeconds): boolean {
  if (event.status === "waiting_time") {
    return typeof event.next_wakeup_at === "number" && event.next_wakeup_at <= elapsedGameSeconds;
  }

  if (event.status === "waiting_call") {
    return typeof event.deadline_at === "number" && event.deadline_at <= elapsedGameSeconds;
  }

  return false;
}

function eventDueAt(event: RuntimeEvent): GameSeconds {
  if (event.status === "waiting_time") {
    return event.next_wakeup_at ?? Number.POSITIVE_INFINITY;
  }

  return event.deadline_at ?? Number.POSITIVE_INFINITY;
}

export function assignObjective(input: AssignObjectiveInput): EventEngineResult {
  const result = assignObjectiveToCrew({
    state: input.state,
    objective_id: input.objective_id,
    crew_id: input.crew_id,
    occurred_at: input.occurred_at,
    handler_registry: input.index.handlersByType,
  });
  const event = result.objective ? result.state.active_events[result.objective.parent_event_id] : undefined;

  return {
    state: result.state,
    event,
    errors: result.errors.map(objectiveError),
  };
}

export function completeObjective(input: CompleteObjectiveInput): EventEngineResult {
  const marked = markObjectiveCompleted({
    state: input.state,
    objective_id: input.objective_id,
    occurred_at: input.occurred_at,
    result_key: input.result_key ?? null,
  });
  if (marked.errors.length > 0 || !marked.objective || !marked.trigger_context) {
    return {
      state: marked.state,
      errors: marked.errors.map(objectiveError),
    };
  }

  const event = marked.state.active_events[marked.objective.parent_event_id];
  const definition = event ? input.index.definitionsById.get(event.event_definition_id) : undefined;
  if (!event || !definition) {
    return failed(marked.state, {
      code: event ? "missing_event_definition" : "missing_event",
      objective_id: marked.objective.id,
      event_id: marked.objective.parent_event_id,
      path: event ? "event_definitions" : "active_events",
      message: event
        ? `Event definition ${event.event_definition_id} for runtime event ${event.id} does not exist.`
        : `Runtime event ${marked.objective.parent_event_id} does not exist.`,
    });
  }

  const context: TriggerContext = {
    ...marked.trigger_context,
    event_id: event.id,
    event_definition_id: event.event_definition_id,
    tile_id: marked.trigger_context.tile_id ?? event.primary_tile_id ?? null,
    crew_id: marked.trigger_context.crew_id ?? event.primary_crew_id ?? null,
  };
  const graphResult = advanceRuntimeEvent(marked.state, definition, event.id, context, {
    content_index: input.index,
    handler_registry: input.index.handlersByType,
  });

  return {
    state: graphResult.state,
    event: graphResult.event,
    events: [graphResult.event],
    errors: graphResult.errors.map((error) => ({
      code: "graph_runner_error",
      objective_id: marked.objective?.id,
      event_id: event.id,
      path: error.path,
      message: error.message,
    })),
    graph_result: graphResult,
    graph_results: [graphResult],
  };
}

export function selectCallOption(input: SelectCallOptionInput): EventEngineResult {
  const call = input.state.active_calls[input.call_id];
  if (!call) {
    return failed(input.state, {
      code: "missing_call",
      call_id: input.call_id,
      option_id: input.option_id,
      path: "active_calls",
      message: `Runtime call ${input.call_id} does not exist.`,
    });
  }

  if (!ACTIVE_CALL_STATUSES.has(call.status)) {
    return failed(input.state, {
      code: "call_not_active",
      call_id: input.call_id,
      option_id: input.option_id,
      event_id: call.event_id,
      path: `active_calls.${input.call_id}.status`,
      message: `Runtime call ${input.call_id} is ${call.status} and cannot accept options.`,
    });
  }

  if (!call.available_options.some((option) => option.option_id === input.option_id)) {
    return failed(input.state, {
      code: "option_unavailable",
      call_id: input.call_id,
      option_id: input.option_id,
      event_id: call.event_id,
      path: `active_calls.${input.call_id}.available_options`,
      message: `Option ${input.option_id} is not available on runtime call ${input.call_id}.`,
    });
  }

  const event = input.state.active_events[call.event_id];
  if (!event) {
    return failed(input.state, {
      code: "missing_event",
      call_id: input.call_id,
      option_id: input.option_id,
      event_id: call.event_id,
      path: "active_events",
      message: `Runtime event ${call.event_id} for call ${input.call_id} does not exist.`,
    });
  }

  const definition = input.index.definitionsById.get(event.event_definition_id);
  if (!definition) {
    return failed(input.state, {
      code: "missing_event_definition",
      call_id: input.call_id,
      option_id: input.option_id,
      event_id: event.id,
      path: "event_definitions",
      message: `Event definition ${event.event_definition_id} for runtime event ${event.id} does not exist.`,
    });
  }

  const graphResult = advanceRuntimeEvent(input.state, definition, event.id, callChoiceContext(call, event, input.option_id, input.occurred_at), {
    content_index: input.index,
  });
  if (graphResult.errors.length > 0) {
    return {
      state: graphResult.state,
      event: graphResult.event,
      errors: graphResult.errors.map((error) => ({
        code: "graph_runner_error",
        call_id: input.call_id,
        option_id: input.option_id,
        event_id: event.id,
        path: error.path,
        message: error.message,
      })),
      graph_result: graphResult,
    };
  }

  return { state: graphResult.state, event: graphResult.event, errors: [], graph_result: graphResult };
}

function advanceExistingEvent(input: ProcessTriggerInput): EventEngineResult {
  const event = input.state.active_events[input.context.event_id ?? ""];
  if (!event) {
    return failed(input.state, {
      code: "missing_event",
      event_id: input.context.event_id ?? undefined,
      path: "active_events",
      message: `Runtime event ${input.context.event_id ?? "<missing>"} does not exist.`,
    });
  }

  const definition = input.index.definitionsById.get(input.context.event_definition_id ?? event.event_definition_id);
  if (!definition) {
    return failed(input.state, {
      code: "missing_event_definition",
      event_id: event.id,
      path: "event_definitions",
      message: `Event definition ${input.context.event_definition_id ?? event.event_definition_id} for runtime event ${event.id} does not exist.`,
    });
  }

  const graphResult = advanceRuntimeEvent(input.state, definition, event.id, input.context, {
    content_index: input.index,
    handler_registry: input.index.handlersByType,
  });

  return {
    state: graphResult.state,
    event: graphResult.event,
    events: [graphResult.event],
    errors: graphResult.errors.map((error) => ({
      code: "graph_runner_error",
      event_id: event.id,
      path: error.path,
      message: error.message,
    })),
    graph_result: graphResult,
    graph_results: [graphResult],
  };
}

function emptyCandidateReport(context: TriggerContext, definitions: EventDefinition[]): EventCandidateSelectionReport {
  return {
    trigger_context: context,
    candidate_event_definition_ids: definitions.map((definition) => definition.id),
    passed_condition_ids: [],
    filtered_by_history_ids: [],
    filtered_by_mutex_ids: [],
    filtered_by_blocking_ids: [],
    selected_event_definition_ids: [],
    roll_seed: null,
    created_event_ids: [],
  };
}

function collectConditionCandidates(input: ProcessTriggerInput, report: EventCandidateSelectionReport): Candidate[] {
  return input.index
    .getDefinitionsByTriggerType(input.context.trigger_type)
    .filter((definition) => definition.status !== "disabled")
    .filter((definition) => requiredContextPresent(definition, input.context))
    .flatMap((definition): Candidate[] => {
      const conditions = evaluateConditions(
        definition.trigger.conditions ?? [],
        {
          state: input.state,
          trigger_context: input.context,
          handler_registry: input.index.handlersByType,
        },
        `event_definitions.${definition.id}.trigger.conditions`,
      );
      if (!conditions.passed || conditions.errors.length > 0) {
        return [];
      }

      report.passed_condition_ids.push(definition.id);
      return [
        {
          id: definition.id,
          definition,
          historyKey: renderHistoryKey(definition, input.context),
          priority: definition.candidate_selection.priority,
          weight: definition.candidate_selection.weight,
        },
      ];
    });
}

function filterHistoryCandidates(
  input: ProcessTriggerInput,
  candidates: Candidate[],
  report: EventCandidateSelectionReport,
): Candidate[] {
  return candidates.filter((candidate) => {
    const entry = input.state.world_history[candidate.historyKey];
    const maxTriggerCount = candidate.definition.repeat_policy.max_trigger_count;
    const cooldownUntil = entry?.cooldown_until ?? cooldownFromLastTrigger(candidate.definition, entry);
    const isMaxed = typeof maxTriggerCount === "number" && (entry?.trigger_count ?? 0) >= maxTriggerCount;
    const isCoolingDown = typeof cooldownUntil === "number" && cooldownUntil > input.context.occurred_at;
    const activeBlocked =
      !candidate.definition.repeat_policy.allow_while_active && hasActiveDefinition(input.state, candidate.definition.id, candidate.historyKey);

    if (isMaxed || isCoolingDown || activeBlocked) {
      report.filtered_by_history_ids.push(candidate.definition.id);
      return false;
    }

    return true;
  });
}

function filterMutexCandidates(
  input: ProcessTriggerInput,
  candidates: Candidate[],
  report: EventCandidateSelectionReport,
): Candidate[] {
  const withoutActiveConflicts = candidates.filter((candidate) => {
    const mutexGroup = candidate.definition.candidate_selection.mutex_group;
    if (mutexGroup && hasActiveMutexGroup(input.state, input.index, mutexGroup)) {
      report.filtered_by_mutex_ids.push(candidate.definition.id);
      return false;
    }
    return true;
  });
  const kept: Candidate[] = [];
  const groups = new Map<string, Candidate[]>();

  for (const candidate of withoutActiveConflicts) {
    const mutexGroup = candidate.definition.candidate_selection.mutex_group;
    if (!mutexGroup) {
      kept.push(candidate);
      continue;
    }
    groups.set(mutexGroup, [...(groups.get(mutexGroup) ?? []), candidate]);
  }

  for (const [mutexGroup, groupCandidates] of groups) {
    const pick = pickHighestPriorityWeightedBranch(groupCandidates, `${candidateRollSeed(input.context)}:${mutexGroup}`);
    if (pick.branch) {
      kept.push(pick.branch);
    }
    for (const candidate of groupCandidates) {
      if (candidate.definition.id !== pick.branch?.definition.id) {
        report.filtered_by_mutex_ids.push(candidate.definition.id);
      }
    }
  }

  return kept;
}

function filterBlockingCandidates(
  input: ProcessTriggerInput,
  candidates: Candidate[],
  report: EventCandidateSelectionReport,
): Candidate[] {
  return candidates.filter((candidate) => {
    if (!candidate.definition.candidate_selection.requires_blocking_slot || hasAvailableBlockingSlot(input.state, input.context)) {
      return true;
    }

    report.filtered_by_blocking_ids.push(candidate.definition.id);
    return false;
  });
}

function writeTriggerHistory(
  state: GraphRunnerGameState,
  definition: EventDefinition,
  key: string,
  eventId: Id,
  context: TriggerContext,
): GraphRunnerGameState {
  const existing = state.world_history[key];
  const entry: WorldHistoryEntry = {
    key,
    scope: definition.repeat_policy.scope,
    event_definition_id: definition.id,
    event_id: eventId,
    crew_id: context.crew_id ?? existing?.crew_id ?? null,
    tile_id: context.tile_id ?? existing?.tile_id ?? null,
    objective_id: context.objective_id ?? existing?.objective_id ?? null,
    first_triggered_at: existing?.first_triggered_at ?? context.occurred_at,
    last_triggered_at: context.occurred_at,
    trigger_count: (existing?.trigger_count ?? 0) + 1,
    last_result: existing?.last_result ?? null,
    cooldown_until:
      definition.repeat_policy.cooldown_seconds > 0 ? context.occurred_at + definition.repeat_policy.cooldown_seconds : null,
    value: existing?.value,
  };
  const event = state.active_events[eventId];

  return {
    ...state,
    active_events: event
      ? {
          ...state.active_events,
          [eventId]: {
            ...event,
            history_keys: event.history_keys.includes(key) ? event.history_keys : [...event.history_keys, key],
          },
        }
      : state.active_events,
    world_history: {
      ...state.world_history,
      [key]: entry,
    },
  };
}

function requiredContextPresent(definition: EventDefinition, context: TriggerContext): boolean {
  return (definition.trigger.required_context ?? []).every((field) => readContextField(context, field) !== undefined && readContextField(context, field) !== null);
}

function readContextField(context: TriggerContext, field: string): unknown {
  return field.split(".").reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null || !(segment in current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, context);
}

function renderHistoryKey(definition: EventDefinition, context: TriggerContext): string {
  return definition.repeat_policy.history_key_template
    .replace(/\{event_definition_id\}/g, definition.id)
    .replace(/\{crew_id\}/g, context.crew_id ?? "")
    .replace(/\{tile_id\}/g, context.tile_id ?? "")
    .replace(/\{objective_id\}/g, context.objective_id ?? "");
}

function cooldownFromLastTrigger(definition: EventDefinition, entry: WorldHistoryEntry | undefined): number | null {
  if (!entry || definition.repeat_policy.cooldown_seconds <= 0) {
    return null;
  }
  return entry.last_triggered_at + definition.repeat_policy.cooldown_seconds;
}

function hasActiveDefinition(state: GraphRunnerGameState, definitionId: Id, historyKey: string): boolean {
  return Object.values(state.active_events).some(
    (event) =>
      event.event_definition_id === definitionId &&
      ACTIVE_EVENT_STATUSES.has(event.status) &&
      (event.history_keys.length === 0 || event.history_keys.includes(historyKey)),
  );
}

function hasActiveMutexGroup(state: GraphRunnerGameState, index: EventContentIndex, mutexGroup: string): boolean {
  return Object.values(state.active_events).some((event) => {
    if (!ACTIVE_EVENT_STATUSES.has(event.status)) {
      return false;
    }
    return index.definitionsById.get(event.event_definition_id)?.candidate_selection.mutex_group === mutexGroup;
  });
}

function hasAvailableBlockingSlot(state: GraphRunnerGameState, context: TriggerContext): boolean {
  const crewId = context.crew_id;
  const crew = crewId ? state.crew[crewId] : undefined;
  if (!crew) {
    return false;
  }
  if (crew.blocking_event_id || crew.blocking_call_id || crew.communication_state === "blocked" || crew.communication_state === "busy_call") {
    return false;
  }
  const crewHasBlockingEvent = Object.values(state.active_events).some(
    (event) => event.primary_crew_id === crewId && ACTIVE_EVENT_STATUSES.has(event.status) && event.blocking_claim_ids.length > 0,
  );
  const crewHasBlockingCall = Object.values(state.active_calls).some(
    (call) => call.crew_id === crewId && ACTIVE_CALL_STATUSES.has(call.status) && Boolean(call.blocking_claim_id),
  );
  return !crewHasBlockingEvent && !crewHasBlockingCall;
}

function candidateRollSeed(context: TriggerContext): string {
  return `${context.trigger_type}:${context.occurred_at}:${context.crew_id ?? ""}:${context.tile_id ?? ""}`;
}

function nextEventId(state: GraphRunnerGameState, definitionId: Id, occurredAt: GameSeconds): Id {
  const baseId = `${definitionId}:${occurredAt}`;
  if (!state.active_events[baseId]) {
    return baseId;
  }

  let suffix = 2;
  while (state.active_events[`${baseId}:${suffix}`]) {
    suffix += 1;
  }
  return `${baseId}:${suffix}`;
}

function callChoiceContext(call: RuntimeCall, event: RuntimeEvent, optionId: Id, occurredAt: GameSeconds): TriggerContext {
  return {
    trigger_type: "call_choice",
    occurred_at: occurredAt,
    source: "call",
    crew_id: call.crew_id,
    tile_id: event.primary_tile_id ?? null,
    action_id: null,
    event_id: event.id,
    event_definition_id: event.event_definition_id,
    node_id: call.event_node_id,
    call_id: call.id,
    objective_id: null,
    selected_option_id: optionId,
    world_flag_key: null,
    proximity: null,
    payload: {},
  };
}

function failed(state: GraphRunnerGameState, error: EventEngineError): EventEngineResult {
  return { state, errors: [error] };
}

function objectiveError(error: ObjectiveRuntimeError): EventEngineError {
  return {
    code: error.code,
    objective_id: error.objective_id,
    crew_id: error.crew_id,
    event_id: error.event_id,
    path: error.path,
    message: error.message,
  };
}
