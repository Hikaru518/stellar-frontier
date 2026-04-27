import { evaluateConditions, type ConditionEvaluationContext } from "./conditions";
import type {
  CrewActionState,
  CrewActionType,
  CrewState,
  EventRuntimeState,
  GameSeconds,
  Id,
  JsonObject,
  Objective,
  ObjectiveNode,
  RuntimeEvent,
  TargetRef,
  TileState,
  TriggerContext,
} from "./types";

export interface ObjectiveGameState extends EventRuntimeState {
  elapsed_game_seconds?: number;
  elapsedGameSeconds?: number;
  crew: Record<Id, CrewState>;
  tiles: Record<Id, TileState>;
}

export type ObjectiveRuntimeErrorCode =
  | "missing_objective"
  | "missing_crew"
  | "missing_parent_event"
  | "objective_not_available"
  | "crew_not_eligible";

export interface ObjectiveRuntimeError {
  code: ObjectiveRuntimeErrorCode;
  objective_id?: Id;
  crew_id?: Id;
  event_id?: Id;
  path: string;
  message: string;
}

export interface CreateObjectiveFromNodeInput {
  state: ObjectiveGameState;
  event: RuntimeEvent;
  node: ObjectiveNode;
  trigger_context: TriggerContext;
}

export interface CreateObjectiveFromNodeResult {
  state: ObjectiveGameState;
  event: RuntimeEvent;
  objective: Objective;
}

export interface AssignObjectiveToCrewInput {
  state: ObjectiveGameState;
  objective_id: Id;
  crew_id: Id;
  occurred_at: GameSeconds;
  handler_registry?: ConditionEvaluationContext["handler_registry"];
  condition_handlers?: ConditionEvaluationContext["condition_handlers"];
}

export interface AssignObjectiveToCrewResult {
  state: ObjectiveGameState;
  objective?: Objective;
  action?: CrewActionState;
  errors: ObjectiveRuntimeError[];
}

export interface MarkObjectiveCompletedInput {
  state: ObjectiveGameState;
  objective_id: Id;
  occurred_at: GameSeconds;
  result_key?: string | null;
}

export interface MarkObjectiveCompletedResult {
  state: ObjectiveGameState;
  objective?: Objective;
  trigger_context?: TriggerContext;
  errors: ObjectiveRuntimeError[];
}

export function createObjectiveFromNode(input: CreateObjectiveFromNodeInput): CreateObjectiveFromNodeResult {
  const objectiveId = `${input.event.id}:${input.node.id}:objective`;
  const existing = input.state.objectives[objectiveId];
  const objective =
    existing ??
    ({
      id: objectiveId,
      status: "available",
      parent_event_id: input.event.id,
      created_by_node_id: input.node.id,
      title: input.node.objective_template.title,
      summary: input.node.objective_template.summary,
      target_tile_id: resolveTargetTileId(input.node.objective_template.target_tile_ref ?? null, input.event, input.trigger_context),
      eligible_crew_conditions: input.node.objective_template.eligible_crew_conditions ?? [],
      required_action_type: input.node.objective_template.required_action_type,
      required_action_params: input.node.objective_template.required_action_params,
      assigned_crew_id: null,
      action_id: null,
      created_at: now(input.trigger_context, input.state),
      deadline_at:
        typeof input.node.expires_in_seconds === "number"
          ? now(input.trigger_context, input.state) + input.node.expires_in_seconds
          : null,
      completion_trigger_type: "objective_completed",
      result_key: null,
    } satisfies Objective);
  const event = {
    ...input.event,
    objective_ids: input.event.objective_ids.includes(objectiveId)
      ? input.event.objective_ids
      : [...input.event.objective_ids, objectiveId],
  };

  return {
    state: {
      ...input.state,
      active_events: {
        ...input.state.active_events,
        [event.id]: event,
      },
      objectives: {
        ...input.state.objectives,
        [objectiveId]: objective,
      },
    },
    event,
    objective,
  };
}

export function assignObjectiveToCrew(input: AssignObjectiveToCrewInput): AssignObjectiveToCrewResult {
  const objective = input.state.objectives[input.objective_id];
  if (!objective) {
    return failed(input.state, {
      code: "missing_objective",
      objective_id: input.objective_id,
      path: `objectives.${input.objective_id}`,
      message: `Objective ${input.objective_id} does not exist.`,
    });
  }

  const crew = input.state.crew[input.crew_id];
  if (!crew) {
    return failed(input.state, {
      code: "missing_crew",
      objective_id: objective.id,
      crew_id: input.crew_id,
      path: `crew.${input.crew_id}`,
      message: `Crew ${input.crew_id} does not exist.`,
    });
  }

  if (objective.status !== "available") {
    return failed(input.state, {
      code: "objective_not_available",
      objective_id: objective.id,
      crew_id: crew.id,
      path: `objectives.${objective.id}.status`,
      message: `Objective ${objective.id} is ${objective.status} and cannot be assigned.`,
    });
  }

  const triggerContext = objectiveTriggerContext(objective, crew.id, input.occurred_at, "objective_created");
  const eligibility = evaluateConditions(
    objective.eligible_crew_conditions,
    {
      state: input.state,
      trigger_context: triggerContext,
      active_event_id: objective.parent_event_id,
      handler_registry: input.handler_registry,
      condition_handlers: input.condition_handlers,
    },
    `objectives.${objective.id}.eligible_crew_conditions`,
  );
  if (!eligibility.passed || eligibility.errors.length > 0) {
    return failed(input.state, {
      code: "crew_not_eligible",
      objective_id: objective.id,
      crew_id: crew.id,
      path: `objectives.${objective.id}.eligible_crew_conditions`,
      message: eligibility.errors[0]?.message ?? `Crew ${crew.id} is not eligible for objective ${objective.id}.`,
    });
  }

  const actionId = objective.action_id ?? `${objective.id}:${crew.id}:action`;
  const action = input.state.crew_actions[actionId] ?? createObjectiveAction(objective, crew, actionId);
  const assignedObjective: Objective = {
    ...objective,
    status: "assigned",
    assigned_crew_id: crew.id,
    action_id: action.id,
    assigned_at: input.occurred_at,
  };

  return {
    state: {
      ...input.state,
      objectives: {
        ...input.state.objectives,
        [objective.id]: assignedObjective,
      },
      crew: {
        ...input.state.crew,
        [crew.id]: {
          ...crew,
          status: "acting",
          current_action_id: action.id,
        },
      },
      crew_actions: {
        ...input.state.crew_actions,
        [action.id]: action,
      },
    },
    objective: assignedObjective,
    action,
    errors: [],
  };
}

export function markObjectiveCompleted(input: MarkObjectiveCompletedInput): MarkObjectiveCompletedResult {
  const objective = input.state.objectives[input.objective_id];
  if (!objective) {
    return {
      state: input.state,
      errors: [
        {
          code: "missing_objective",
          objective_id: input.objective_id,
          path: `objectives.${input.objective_id}`,
          message: `Objective ${input.objective_id} does not exist.`,
        },
      ],
    };
  }

  const parentEvent = input.state.active_events[objective.parent_event_id];
  if (!parentEvent) {
    return {
      state: input.state,
      objective,
      errors: [
        {
          code: "missing_parent_event",
          objective_id: objective.id,
          event_id: objective.parent_event_id,
          path: `active_events.${objective.parent_event_id}`,
          message: `Parent event ${objective.parent_event_id} does not exist for objective ${objective.id}.`,
        },
      ],
    };
  }

  const completedObjective: Objective = {
    ...objective,
    status: "completed",
    completed_at: input.occurred_at,
    result_key: input.result_key ?? objective.result_key ?? null,
  };
  const action = completedObjective.action_id ? input.state.crew_actions[completedObjective.action_id] : undefined;
  const crew = completedObjective.assigned_crew_id ? input.state.crew[completedObjective.assigned_crew_id] : undefined;
  const nextActions =
    action && completedObjective.action_id
      ? {
          ...input.state.crew_actions,
          [completedObjective.action_id]: {
            ...action,
            status: "completed" as const,
          },
        }
      : input.state.crew_actions;
  const nextCrew =
    crew && completedObjective.assigned_crew_id
      ? {
          ...input.state.crew,
          [completedObjective.assigned_crew_id]: {
            ...crew,
            status: "idle" as const,
            current_action_id: crew.current_action_id === completedObjective.action_id ? null : crew.current_action_id,
          },
        }
      : input.state.crew;
  const triggerContext = objectiveTriggerContext(completedObjective, completedObjective.assigned_crew_id ?? parentEvent.primary_crew_id ?? null, input.occurred_at, "objective_completed");

  return {
    state: {
      ...input.state,
      objectives: {
        ...input.state.objectives,
        [completedObjective.id]: completedObjective,
      },
      crew: nextCrew,
      crew_actions: nextActions,
    },
    objective: completedObjective,
    trigger_context: triggerContext,
    errors: [],
  };
}

function createObjectiveAction(objective: Objective, crew: CrewState, actionId: Id): CrewActionState {
  const params = objective.required_action_params;
  const targetTileId = stringParam(params.target_tile_id) ?? objective.target_tile_id ?? undefined;
  return {
    id: actionId,
    crew_id: crew.id,
    type: objective.required_action_type as CrewActionType,
    status: "queued",
    source: "objective",
    parent_event_id: objective.parent_event_id,
    objective_id: objective.id,
    from_tile_id: crew.tile_id,
    to_tile_id: stringParam(params.to_tile_id),
    target_tile_id: targetTileId,
    path_tile_ids: readStringArray(params.path_tile_ids),
    progress_seconds: numberParam(params.progress_seconds, 0),
    duration_seconds: numberParam(params.duration_seconds, 0),
    can_interrupt: booleanParam(params.can_interrupt, true),
    interrupt_duration_seconds: numberParam(params.interrupt_duration_seconds, 10),
    completion_trigger_context: objectiveTriggerContext(objective, crew.id, 0, "objective_completed"),
  };
}

function objectiveTriggerContext(
  objective: Objective,
  crewId: Id | null,
  occurredAt: GameSeconds,
  triggerType: "objective_created" | "objective_completed",
): TriggerContext {
  return {
    trigger_type: triggerType,
    occurred_at: occurredAt,
    source: "objective",
    crew_id: crewId,
    tile_id: objective.target_tile_id ?? null,
    action_id: objective.action_id ?? null,
    event_id: objective.parent_event_id,
    event_definition_id: null,
    node_id: objective.created_by_node_id,
    call_id: null,
    objective_id: objective.id,
    selected_option_id: null,
    world_flag_key: null,
    proximity: null,
    payload: {
      result_key: objective.result_key ?? null,
      status: objective.status,
    },
  };
}

function resolveTargetTileId(target: TargetRef | null, event: RuntimeEvent, triggerContext: TriggerContext): Id | null {
  if (target?.type === "tile_id") {
    return target.id ?? target.ref ?? null;
  }
  return event.primary_tile_id ?? triggerContext.tile_id ?? null;
}

function failed(state: ObjectiveGameState, error: ObjectiveRuntimeError): AssignObjectiveToCrewResult {
  return { state, errors: [error] };
}

function now(triggerContext: TriggerContext, state: ObjectiveGameState): GameSeconds {
  return triggerContext.occurred_at ?? state.elapsed_game_seconds ?? state.elapsedGameSeconds ?? 0;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberParam(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanParam(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}
