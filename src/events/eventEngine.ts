import type { EventContentIndex } from "./contentIndex";
import { advanceRuntimeEvent, type GraphRunnerGameState, type GraphRunnerResult } from "./graphRunner";
import type { GameSeconds, Id, RuntimeCall, RuntimeEvent, TriggerContext } from "./types";

export type EventEngineErrorCode =
  | "missing_call"
  | "call_not_active"
  | "missing_event"
  | "missing_event_definition"
  | "option_unavailable"
  | "graph_runner_error";

export interface EventEngineError {
  code: EventEngineErrorCode;
  call_id: Id;
  option_id?: Id;
  event_id?: Id;
  path: string;
  message: string;
}

export interface EventEngineResult {
  state: GraphRunnerGameState;
  event?: RuntimeEvent;
  errors: EventEngineError[];
  graph_result?: GraphRunnerResult;
}

export interface SelectCallOptionInput {
  state: GraphRunnerGameState;
  index: EventContentIndex;
  call_id: Id;
  option_id: Id;
  occurred_at: GameSeconds;
}

const ACTIVE_CALL_STATUSES = new Set<RuntimeCall["status"]>(["incoming", "connected", "awaiting_choice"]);

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
