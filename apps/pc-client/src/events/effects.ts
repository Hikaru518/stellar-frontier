import { appendDiaryEntryId } from "../diarySystem";
import type { MapObjectDefinition, RuntimeMapObjectsState } from "../content/mapObjects";
import type {
  CrewActionState,
  CrewActionType,
  CrewState,
  Effect,
  EffectExecutionErrorCode,
  EffectExecutionStatus,
  EventLog,
  EventRuntimeState,
  HandlerDefinition,
  Id,
  InventoryItemStack,
  InventoryState,
  JsonObject,
  Objective,
  ObjectiveStatus,
  RuntimeEvent,
  TargetRef,
  TileResourceNode,
  TileState,
  TriggerContext,
  WorldFlag,
  WorldHistoryEntry,
  WorldHistoryScope,
} from "./types";

export interface EffectGameState extends EventRuntimeState {
  elapsed_game_seconds?: number;
  elapsedGameSeconds?: number;
  crew: Record<Id, CrewState>;
  tiles: Record<Id, TileState>;
  resources?: Record<string, number>;
  map?: {
    tilesById?: Record<string, { revealedObjectIds?: string[] } | undefined>;
    mapObjects?: RuntimeMapObjectsState;
  };
}

export interface EffectExecutionError {
  code: EffectExecutionErrorCode;
  effect_id: Id;
  path: string;
  message: string;
  failure_policy: Effect["failure_policy"];
}

export interface EffectExecutionResult {
  status: EffectExecutionStatus;
  state: EffectGameState;
  errors: EffectExecutionError[];
  applied_effect_ids: Id[];
  skipped_effect_ids: Id[];
}

export interface ResolvedEffectTarget {
  type: TargetRef["type"];
  id?: Id;
  value: unknown;
}

export interface EffectHandlerInput {
  effect: Effect;
  context: EffectExecutionContext;
  target?: ResolvedEffectTarget;
  path: string;
  params: JsonObject;
}

export type EffectHandlerResult = { state: EffectGameState; errors?: EffectExecutionError[] } | EffectGameState;

export type EffectHandler = (input: EffectHandlerInput) => EffectHandlerResult;

export interface EffectExecutionContext {
  state: EffectGameState;
  trigger_context?: TriggerContext;
  active_event_id?: Id | null;
  handler_registry?: HandlerDefinition[] | Map<string, HandlerDefinition>;
  effect_handlers?: Record<string, EffectHandler>;
}

interface ApplyResult {
  state: EffectGameState;
  errors: EffectExecutionError[];
}

interface TargetResolution {
  target?: ResolvedEffectTarget;
  errors: EffectExecutionError[];
}

export function executeEffects(
  effects: Effect[],
  context: EffectExecutionContext,
  basePath = "effects",
): EffectExecutionResult {
  let state = cloneState(context.state);
  const errors: EffectExecutionError[] = [];
  const appliedEffectIds: Id[] = [];
  const skippedEffectIds: Id[] = [];

  for (const [index, effect] of effects.entries()) {
    const path = `${basePath}[${index}]`;
    const result = applyEffect(effect, { ...context, state }, path);

    if (result.errors.length > 0) {
      errors.push(...result.errors);

      if (effect.failure_policy === "skip_effect") {
        skippedEffectIds.push(effect.id);
        continue;
      }

      if (effect.failure_policy === "skip_group") {
        return {
          status: "skipped",
          state,
          errors,
          applied_effect_ids: appliedEffectIds,
          skipped_effect_ids: [...skippedEffectIds, ...effects.slice(index).map((item) => item.id)],
        };
      }

      if (effect.failure_policy === "retry_later") {
        return {
          status: "retry_later",
          state,
          errors,
          applied_effect_ids: appliedEffectIds,
          skipped_effect_ids: skippedEffectIds,
        };
      }

      return {
        status: "failed",
        state,
        errors,
        applied_effect_ids: appliedEffectIds,
        skipped_effect_ids: skippedEffectIds,
      };
    }

    state = applyRecordPolicy(result.state, effect, { ...context, state: result.state }, path);
    appliedEffectIds.push(effect.id);
  }

  return {
    status: "success",
    state,
    errors,
    applied_effect_ids: appliedEffectIds,
    skipped_effect_ids: skippedEffectIds,
  };
}

function applyEffect(effect: Effect, context: EffectExecutionContext, path: string): ApplyResult {
  const target = resolveTarget(effect.target, context, effect, path);
  if (target.errors.length > 0) {
    return { state: context.state, errors: target.errors };
  }

  switch (effect.type) {
    case "add_crew_condition":
      return updateCrewArrayField(effect, context, target.target, path, "condition_tags", readString(effect, "condition", path, ["condition", "tag"]), "add");
    case "remove_crew_condition":
      return updateCrewArrayField(effect, context, target.target, path, "condition_tags", readString(effect, "condition", path, ["condition", "tag"]), "remove");
    case "update_crew_attribute":
      return updateCrewAttribute(effect, context, target.target, path);
    case "add_personality_tag":
      return updateCrewArrayField(effect, context, target.target, path, "personality_tags", readString(effect, "tag", path), "add");
    case "remove_personality_tag":
      return updateCrewArrayField(effect, context, target.target, path, "personality_tags", readString(effect, "tag", path), "remove");
    case "add_expertise_tag":
      return updateCrewArrayField(effect, context, target.target, path, "expertise_tags", readString(effect, "tag", path), "add");
    case "update_crew_location":
      return updateCrewLocation(effect, context, target.target, path);
    case "create_crew_action":
      return createCrewAction(effect, context, target.target, path);
    case "cancel_crew_action":
      return updateCrewAction(effect, context, target.target, path, { status: "cancelled" });
    case "update_crew_action":
      return updateCrewAction(effect, context, target.target, path, readObject(effect, "patch", path, false).value ?? effect.params);
    case "update_tile_field":
      return updateTileField(effect, context, target.target, path);
    case "update_tile_state":
      return updateTileState(effect, context, target.target, path);
    case "add_tile_tag":
      return updateTileArrayField(effect, context, target.target, path, "tags", readString(effect, "tag", path), "add");
    case "add_danger_tag":
      return updateTileArrayField(effect, context, target.target, path, "danger_tags", readString(effect, "tag", path), "add");
    case "set_discovery_state":
      return updateTileLiteralField(effect, context, target.target, path, "discovery_state", readString(effect, "state", path, ["state", "value"]));
    case "set_survey_state":
      return updateTileLiteralField(effect, context, target.target, path, "survey_state", readString(effect, "state", path, ["state", "value"]));
    case "add_event_mark":
      return addEventMark(effect, context, target.target, path);
    case "add_item":
      return updateInventoryItem(effect, context, target.target, path, "add");
    case "remove_item":
      return updateInventoryItem(effect, context, target.target, path, "remove");
    case "transfer_item":
      return transferInventoryItem(effect, context, target.target, path);
    case "add_resource":
      return updateInventoryResource(effect, context, target.target, path, "add");
    case "remove_resource":
      return updateInventoryResource(effect, context, target.target, path, "remove");
    case "update_tile_resource":
      return updateTileResource(effect, context, target.target, path);
    case "create_objective":
      return createObjective(effect, context, path);
    case "update_objective":
      return updateObjective(effect, context, target.target, path, readObject(effect, "patch", path, false).value ?? effect.params);
    case "complete_objective":
      return updateObjective(effect, context, target.target, path, { status: "completed", completed_at: now(context), result_key: effect.params.result_key ?? null });
    case "fail_objective":
      return updateObjective(effect, context, target.target, path, { status: effect.params.status ?? "failed", result_key: effect.params.result_key ?? null });
    case "set_world_flag":
      return setWorldFlag(effect, context, path);
    case "increment_world_counter":
      return incrementWorldCounter(effect, context, path);
    case "write_world_history":
      return writeWorldHistory(effect, context, path);
    case "add_event_log":
      return addEventLog(effect, context, path);
    case "add_diary_entry":
      return addDiaryEntry(effect, context, target.target, path);
    case "spawn_event":
      return spawnEvent(effect, context, path);
    case "unlock_event_definition":
      return unlockEventDefinition(effect, context, path);
    case "handler_effect":
      return applyHandlerEffect(effect, context, target.target, path);
    case "set_object_status":
      return setObjectStatus(effect, context, path);
    default:
      return fail(context.state, effect, "invalid_effect", `${path}.type`, `Unsupported effect type: ${effect.type}`);
  }
}

// TODO(Task 2): replace this placeholder with a real import of
// `mapObjectDefinitionById` from "../content/mapObjects" once the glob loader
// lands. For now we read from a hook on globalThis so tests can inject a
// fixture without forcing Task 1 to bring up the loader.
function getMapObjectDefinition(objectId: string): MapObjectDefinition | undefined {
  const lookup = (globalThis as { __mapObjectDefinitionById?: Map<string, MapObjectDefinition> }).__mapObjectDefinitionById;
  if (!lookup) {
    return undefined;
  }
  return lookup.get(objectId);
}

function setObjectStatus(effect: Effect, context: EffectExecutionContext, path: string): ApplyResult {
  const objectId = readString(effect, "object_id", path);
  const status = readString(effect, "status", path);
  if (objectId.errors.length > 0 || status.errors.length > 0) {
    return { state: context.state, errors: [...objectId.errors, ...status.errors] };
  }

  // TODO(Task 2): replace these soft warnings with hard `missing_target`
  // failures once `mapObjectDefinitionById` is wired up via the glob loader.
  // For Task 1 the lookup is best-effort so tests can run without the loader.
  const def = getMapObjectDefinition(objectId.value);
  if (!def) {
    console.warn(
      `[set_object_status] Object definition for ${objectId.value} not found; writing status anyway (Task 1 placeholder).`,
    );
  } else if (!def.status_options.includes(status.value)) {
    console.warn(
      `[set_object_status] status ${status.value} not in options for ${objectId.value}.`,
    );
  }

  const previousMap = context.state.map ?? {};
  const previousObjects = previousMap.mapObjects ?? {};
  const previousEntry = previousObjects[objectId.value];
  const nextObjects: RuntimeMapObjectsState = {
    ...previousObjects,
    [objectId.value]: {
      ...(previousEntry ?? { id: objectId.value, status_enum: status.value }),
      id: objectId.value,
      status_enum: status.value,
    },
  };

  return {
    state: {
      ...context.state,
      map: {
        ...previousMap,
        mapObjects: nextObjects,
      },
    },
    errors: [],
  };
}

function updateCrewArrayField(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
  field: "condition_tags" | "personality_tags" | "expertise_tags",
  value: ReadParam<string>,
  operation: "add" | "remove",
): ApplyResult {
  if (value.errors.length > 0) {
    return { state: context.state, errors: value.errors };
  }
  const crew = requireTarget<CrewState>(effect, context, target, path);
  if (crew.errors.length > 0 || !crew.target?.id) {
    return { state: context.state, errors: crew.errors };
  }

  const current = crew.target.value[field];
  const nextValues =
    operation === "add" ? addUnique(current, value.value) : current.filter((item) => item !== value.value);
  return {
    state: {
      ...context.state,
      crew: {
        ...context.state.crew,
        [crew.target.id]: { ...crew.target.value, [field]: nextValues },
      },
    },
    errors: [],
  };
}

function updateCrewAttribute(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): ApplyResult {
  const crew = requireTarget<CrewState>(effect, context, target, path);
  const attribute = readString(effect, "attribute", path);
  if (crew.errors.length > 0 || attribute.errors.length > 0 || !crew.target?.id) {
    return { state: context.state, errors: [...crew.errors, ...attribute.errors] };
  }

  if (!(attribute.value in crew.target.value.attributes)) {
    return fail(context.state, effect, "missing_field", `${path}.params.attribute`, `Crew attribute ${attribute.value} does not exist.`);
  }

  const current = crew.target.value.attributes[attribute.value as keyof CrewState["attributes"]];
  const value = typeof effect.params.value === "number" ? effect.params.value : current + numberParam(effect.params.delta, 0);
  return {
    state: {
      ...context.state,
      crew: {
        ...context.state.crew,
        [crew.target.id]: {
          ...crew.target.value,
          attributes: {
            ...crew.target.value.attributes,
            [attribute.value]: value,
          },
        },
      },
    },
    errors: [],
  };
}

function updateCrewLocation(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): ApplyResult {
  const crew = requireTarget<CrewState>(effect, context, target, path);
  const tileId = readString(effect, "tile_id", path, ["tile_id", "target_tile_id"]);
  if (crew.errors.length > 0 || tileId.errors.length > 0 || !crew.target?.id) {
    return { state: context.state, errors: [...crew.errors, ...tileId.errors] };
  }

  const targetTile = context.state.tiles[tileId.value];
  if (!targetTile) {
    return fail(context.state, effect, "missing_target", `${path}.params.tile_id`, `Target tile ${tileId.value} does not exist.`);
  }

  const previousTile = context.state.tiles[crew.target.value.tile_id];
  return {
    state: {
      ...context.state,
      crew: {
        ...context.state.crew,
        [crew.target.id]: { ...crew.target.value, tile_id: tileId.value },
      },
      tiles: {
        ...context.state.tiles,
        ...(previousTile
          ? {
              [previousTile.id]: {
                ...previousTile,
                current_crew_ids: previousTile.current_crew_ids.filter((crewId) => crewId !== crew.target?.id),
              },
            }
          : {}),
        [targetTile.id]: {
          ...targetTile,
          current_crew_ids: addUnique(targetTile.current_crew_ids, crew.target.id),
        },
      },
    },
    errors: [],
  };
}

function createCrewAction(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): ApplyResult {
  const crew = requireTarget<CrewState>(effect, context, target, path);
  const actionType = readString(effect, "action_type", path, ["action_type", "type"]);
  if (crew.errors.length > 0 || actionType.errors.length > 0 || !crew.target?.id) {
    return { state: context.state, errors: [...crew.errors, ...actionType.errors] };
  }

  const actionId = stringParam(effect.params.action_id) ?? `${effect.id}:action`;
  const startedAt = numberParam(effect.params.started_at, now(context));
  const actionParams = readObject(effect, "action_params", path, false).value ?? {};
  const targetTileId = stringParam(effect.params.target_tile_id) ?? stringParam(effect.params.to_tile_id) ?? crew.target.value.tile_id;
  const durationSeconds = numberParam(effect.params.duration_seconds, 0);
  const action: CrewActionState = {
    id: actionId,
    crew_id: crew.target.id,
    type: actionType.value as CrewActionType,
    status: "active",
    source: "event_action_request",
    parent_event_id: currentEventId(context) ?? null,
    objective_id: stringParam(effect.params.objective_id) ?? null,
    action_request_id: stringParam(effect.params.action_request_id) ?? null,
    from_tile_id: crew.target.value.tile_id,
    to_tile_id: stringParam(effect.params.to_tile_id),
    target_tile_id: targetTileId,
    path_tile_ids: readStringArray(effect.params.path_tile_ids),
    started_at: startedAt,
    ends_at: startedAt + durationSeconds,
    progress_seconds: numberParam(effect.params.progress_seconds, 0),
    duration_seconds: durationSeconds,
    action_params: actionParams,
    can_interrupt: booleanParam(effect.params.can_interrupt, true),
    interrupt_duration_seconds: numberParam(effect.params.interrupt_duration_seconds, 10),
  };

  return {
    state: {
      ...context.state,
      crew: {
        ...context.state.crew,
        [crew.target.id]: { ...crew.target.value, current_action_id: actionId, status: "acting" },
      },
      crew_actions: {
        ...context.state.crew_actions,
        [actionId]: action,
      },
    },
    errors: [],
  };
}

function updateCrewAction(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
  patch: JsonObject,
): ApplyResult {
  const requestedActionId = stringParam(effect.params.action_id);
  const targetActionId = isCrewTarget(target?.value) ? target.value.current_action_id ?? undefined : undefined;
  const actionId = requestedActionId || targetActionId || context.trigger_context?.action_id;
  const action = actionId ? context.state.crew_actions[actionId] : undefined;
  if (!actionId || !action) {
    return fail(context.state, effect, "missing_target", `${path}.params.action_id`, `Crew action ${actionId ?? "<missing>"} does not exist.`);
  }

  return {
    state: {
      ...context.state,
      crew_actions: {
        ...context.state.crew_actions,
        [actionId]: { ...action, ...patch },
      },
    },
    errors: [],
  };
}

function updateTileField(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): ApplyResult {
  const tile = requireTarget<TileState>(effect, context, target, path);
  const field = readString(effect, "field", path);
  if (tile.errors.length > 0 || field.errors.length > 0 || !tile.target?.id) {
    return { state: context.state, errors: [...tile.errors, ...field.errors] };
  }

  if (!(field.value in tile.target.value)) {
    return fail(context.state, effect, "missing_field", `${path}.params.field`, `Tile field ${field.value} does not exist.`);
  }

  return {
    state: {
      ...context.state,
      tiles: {
        ...context.state.tiles,
        [tile.target.id]: { ...tile.target.value, [field.value]: effect.params.value },
      },
    },
    errors: [],
  };
}

function updateTileState(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): ApplyResult {
  const tile = requireTarget<TileState>(effect, context, target, path);
  const objectId = readString(effect, "object_id", path);
  if (tile.errors.length > 0 || objectId.errors.length > 0 || !tile.target?.id) {
    return { state: context.state, errors: [...tile.errors, ...objectId.errors] };
  }

  const reveal = booleanParam(effect.params.revealed, true);
  const nextState = updateMapRevealedObject(context.state, tile.target.id, objectId.value, reveal);
  return {
    state: {
      ...nextState,
      tiles: {
        ...nextState.tiles,
        [tile.target.id]: updateTileSiteObject(tile.target.value, objectId.value, reveal),
      },
    },
    errors: [],
  };
}

function updateTileSiteObject(tile: TileState, objectId: string, reveal: boolean): TileState {
  const existing = tile.site_objects.find((object) => object.id === objectId);
  if (!existing && !reveal) {
    return tile;
  }

  const nextObject = {
    ...(existing ?? { id: objectId, object_type: objectId, tags: [] }),
    tags: reveal ? addUnique(existing?.tags ?? [], "revealed") : (existing?.tags ?? []).filter((tag) => tag !== "revealed"),
  };

  return {
    ...tile,
    site_objects: existing
      ? tile.site_objects.map((object) => (object.id === objectId ? nextObject : object))
      : [...tile.site_objects, nextObject],
  };
}

function updateMapRevealedObject(state: EffectGameState, tileId: string, objectId: string, reveal: boolean): EffectGameState {
  if (!state.map?.tilesById) {
    return state;
  }

  const previousTile = state.map.tilesById[tileId] ?? {};
  const previousIds = previousTile.revealedObjectIds ?? [];
  const revealedObjectIds = reveal ? addUnique(previousIds, objectId) : previousIds.filter((id) => id !== objectId);

  return {
    ...state,
    map: {
      ...state.map,
      tilesById: {
        ...state.map.tilesById,
        [tileId]: {
          ...previousTile,
          revealedObjectIds,
        },
      },
    },
  };
}

function updateTileArrayField(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
  field: "tags" | "danger_tags",
  value: ReadParam<string>,
  operation: "add",
): ApplyResult {
  const tile = requireTarget<TileState>(effect, context, target, path);
  if (tile.errors.length > 0 || value.errors.length > 0 || !tile.target?.id) {
    return { state: context.state, errors: [...tile.errors, ...value.errors] };
  }

  return {
    state: {
      ...context.state,
      tiles: {
        ...context.state.tiles,
        [tile.target.id]: { ...tile.target.value, [field]: operation === "add" ? addUnique(tile.target.value[field], value.value) : tile.target.value[field] },
      },
    },
    errors: [],
  };
}

function updateTileLiteralField<K extends "discovery_state" | "survey_state">(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
  field: K,
  value: ReadParam<string>,
): ApplyResult {
  const tile = requireTarget<TileState>(effect, context, target, path);
  if (tile.errors.length > 0 || value.errors.length > 0 || !tile.target?.id) {
    return { state: context.state, errors: [...tile.errors, ...value.errors] };
  }

  return {
    state: {
      ...context.state,
      tiles: {
        ...context.state.tiles,
        [tile.target.id]: { ...tile.target.value, [field]: value.value as TileState[K] },
      },
    },
    errors: [],
  };
}

function addEventMark(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): ApplyResult {
  const tile = requireTarget<TileState>(effect, context, target, path);
  const label = readString(effect, "label", path);
  if (tile.errors.length > 0 || label.errors.length > 0 || !tile.target?.id) {
    return { state: context.state, errors: [...tile.errors, ...label.errors] };
  }

  const mark = {
    id: stringParam(effect.params.id) ?? `${currentEventId(context) ?? "event"}:${effect.id}`,
    event_id: currentEventId(context) ?? stringParam(effect.params.event_id) ?? effect.id,
    label: label.value,
    created_at: now(context),
  };

  if (tile.target.value.event_marks.some((item) => item.id === mark.id)) {
    return { state: context.state, errors: [] };
  }

  return {
    state: {
      ...context.state,
      tiles: {
        ...context.state.tiles,
        [tile.target.id]: { ...tile.target.value, event_marks: [...tile.target.value.event_marks, mark] },
      },
    },
    errors: [],
  };
}

function updateInventoryItem(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
  operation: "add" | "remove",
): ApplyResult {
  const inventory = requireTarget<InventoryState>(effect, context, target, path);
  const itemId = readString(effect, "item_id", path);
  if (inventory.errors.length > 0 || itemId.errors.length > 0 || !inventory.target?.id) {
    return { state: context.state, errors: [...inventory.errors, ...itemId.errors] };
  }

  const quantity = numberParam(effect.params.quantity, numberParam(effect.params.amount, 1));
  const nextItems = updateItemStacks(inventory.target.value.items, itemId.value, quantity, operation);
  return {
    state: updateInventory(context.state, inventory.target.id, { ...inventory.target.value, items: nextItems }),
    errors: [],
  };
}

function transferInventoryItem(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): ApplyResult {
  const from = requireTarget<InventoryState>(effect, context, target, path);
  const toInventoryId = readString(effect, "to_inventory_id", path, ["to_inventory_id", "target_inventory_id"]);
  const itemId = readString(effect, "item_id", path);
  if (from.errors.length > 0 || toInventoryId.errors.length > 0 || itemId.errors.length > 0 || !from.target?.id) {
    return { state: context.state, errors: [...from.errors, ...toInventoryId.errors, ...itemId.errors] };
  }

  const destination = context.state.inventories[toInventoryId.value];
  if (!destination) {
    return fail(context.state, effect, "missing_target", `${path}.params.to_inventory_id`, `Inventory ${toInventoryId.value} does not exist.`);
  }

  const quantity = numberParam(effect.params.quantity, numberParam(effect.params.amount, 1));
  const stateWithSource = updateInventory(context.state, from.target.id, {
    ...from.target.value,
    items: updateItemStacks(from.target.value.items, itemId.value, quantity, "remove"),
  });
  return {
    state: updateInventory(stateWithSource, destination.id, {
      ...destination,
      items: updateItemStacks(destination.items, itemId.value, quantity, "add"),
    }),
    errors: [],
  };
}

function updateInventoryResource(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
  operation: "add" | "remove",
): ApplyResult {
  const inventory = requireTarget<InventoryState>(effect, context, target, path);
  const resourceId = readString(effect, "resource_id", path);
  if (inventory.errors.length > 0 || resourceId.errors.length > 0 || !inventory.target?.id) {
    return { state: context.state, errors: [...inventory.errors, ...resourceId.errors] };
  }

  const amount = numberParam(effect.params.amount, 1);
  const current = inventory.target.value.resources[resourceId.value] ?? 0;
  const nextAmount = operation === "add" ? current + amount : Math.max(0, current - amount);
  return {
    state: updateInventory(context.state, inventory.target.id, {
      ...inventory.target.value,
      resources: { ...inventory.target.value.resources, [resourceId.value]: nextAmount },
    }),
    errors: [],
  };
}

function updateTileResource(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): ApplyResult {
  const tile = requireTarget<TileState>(effect, context, target, path);
  const resourceId = readString(effect, "resource_id", path);
  if (tile.errors.length > 0 || resourceId.errors.length > 0 || !tile.target?.id) {
    return { state: context.state, errors: [...tile.errors, ...resourceId.errors] };
  }

  const nodeId = stringParam(effect.params.resource_node_id) ?? stringParam(effect.params.node_id);
  const nodeIndex = tile.target.value.resource_nodes.findIndex((node) =>
    nodeId ? node.id === nodeId : node.resource_id === resourceId.value,
  );
  if (nodeIndex < 0) {
    return fail(context.state, effect, "missing_target", `${path}.params.resource_id`, `Tile resource ${resourceId.value} does not exist.`);
  }

  const nodes = tile.target.value.resource_nodes.map((node, index): TileResourceNode => {
    if (index !== nodeIndex) {
      return node;
    }

    const amount =
      typeof effect.params.amount === "number"
        ? effect.params.amount
        : Math.max(0, node.amount + numberParam(effect.params.amount_delta, 0));
    return {
      ...node,
      amount,
      state: typeof effect.params.state === "string" ? (effect.params.state as TileResourceNode["state"]) : node.state,
      event_tags: Array.isArray(effect.params.event_tags)
        ? effect.params.event_tags.filter((item): item is string => typeof item === "string")
        : node.event_tags,
    };
  });

  return {
    state: {
      ...context.state,
      tiles: {
        ...context.state.tiles,
        [tile.target.id]: { ...tile.target.value, resource_nodes: nodes },
      },
    },
    errors: [],
  };
}

function createObjective(effect: Effect, context: EffectExecutionContext, path: string): ApplyResult {
  const objectiveId = readString(effect, "objective_id", path, ["objective_id", "id"]);
  const title = readString(effect, "title", path);
  const summary = readString(effect, "summary", path);
  if (objectiveId.errors.length > 0 || title.errors.length > 0 || summary.errors.length > 0) {
    return { state: context.state, errors: [...objectiveId.errors, ...title.errors, ...summary.errors] };
  }

  const objective: Objective = {
    id: objectiveId.value,
    status: "available",
    parent_event_id: currentEventId(context) ?? stringParam(effect.params.parent_event_id) ?? effect.id,
    created_by_node_id: context.trigger_context?.node_id ?? stringParam(effect.params.created_by_node_id) ?? effect.id,
    title: title.value,
    summary: summary.value,
    target_tile_id: stringParam(effect.params.target_tile_id) ?? context.trigger_context?.tile_id ?? null,
    eligible_crew_conditions: [],
    required_action_type: stringParam(effect.params.required_action_type) ?? "event_waiting",
    required_action_params: readObject(effect, "required_action_params", path, false).value ?? {},
    assigned_crew_id: stringParam(effect.params.assigned_crew_id) ?? null,
    action_id: stringParam(effect.params.action_id) ?? null,
    created_at: now(context),
    deadline_at: typeof effect.params.deadline_at === "number" ? effect.params.deadline_at : null,
    completion_trigger_type: "objective_completed",
  };

  return {
    state: {
      ...context.state,
      objectives: {
        ...context.state.objectives,
        [objective.id]: objective,
      },
    },
    errors: [],
  };
}

function updateObjective(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
  patch: JsonObject,
): ApplyResult {
  const objective = requireTarget<Objective>(effect, context, target, path);
  if (objective.errors.length > 0 || !objective.target?.id) {
    return { state: context.state, errors: objective.errors };
  }

  return {
    state: {
      ...context.state,
      objectives: {
        ...context.state.objectives,
        [objective.target.id]: {
          ...objective.target.value,
          ...patch,
          status: typeof patch.status === "string" ? (patch.status as ObjectiveStatus) : objective.target.value.status,
        },
      },
    },
    errors: [],
  };
}

function setWorldFlag(effect: Effect, context: EffectExecutionContext, path: string): ApplyResult {
  const key = readString(effect, "key", path, ["key", "flag_key"]);
  if (key.errors.length > 0) {
    return { state: context.state, errors: key.errors };
  }

  const value = effect.params.value;
  if (!isWorldFlagValue(value)) {
    return fail(context.state, effect, "missing_value", `${path}.params.value`, "set_world_flag requires a boolean, number, or string value.");
  }

  const existing = context.state.world_flags[key.value];
  const flag: WorldFlag = {
    key: key.value,
    value,
    value_type: worldFlagValueType(value),
    created_at: existing?.created_at ?? now(context),
    updated_at: now(context),
    source_event_id: currentEventId(context) ?? null,
    tags: readStringArray(effect.params.tags),
  };

  return {
    state: {
      ...context.state,
      world_flags: {
        ...context.state.world_flags,
        [key.value]: flag,
      },
    },
    errors: [],
  };
}

function incrementWorldCounter(effect: Effect, context: EffectExecutionContext, path: string): ApplyResult {
  const key = readString(effect, "key", path, ["key", "flag_key"]);
  if (key.errors.length > 0) {
    return { state: context.state, errors: key.errors };
  }

  const existing = context.state.world_flags[key.value];
  const current = typeof existing?.value === "number" ? existing.value : 0;
  return setWorldFlag(
    {
      ...effect,
      params: { ...effect.params, key: key.value, value: current + numberParam(effect.params.amount, 1) },
    },
    context,
    path,
  );
}

function writeWorldHistory(effect: Effect, context: EffectExecutionContext, path: string): ApplyResult {
  const key = readString(effect, "key", path);
  if (key.errors.length > 0) {
    return { state: context.state, errors: key.errors };
  }

  return {
    state: writeHistoryEntry(context.state, effect, context, key.value, effect.params),
    errors: [],
  };
}

function addEventLog(effect: Effect, context: EffectExecutionContext, path: string): ApplyResult {
  const summary = readString(effect, "summary", path);
  if (summary.errors.length > 0) {
    return { state: context.state, errors: summary.errors };
  }

  return {
    state: appendEventLog(context.state, effect, context, summary.value),
    errors: [],
  };
}

function addDiaryEntry(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): ApplyResult {
  const crew = requireTarget<CrewState>(effect, context, target, path);
  const entryId = readString(effect, "entry_id", path, ["entry_id", "id"]);
  if (crew.errors.length > 0 || entryId.errors.length > 0 || !crew.target?.id) {
    return { state: context.state, errors: [...crew.errors, ...entryId.errors] };
  }

  return {
    state: {
      ...context.state,
      crew: {
        ...context.state.crew,
        [crew.target.id]: {
          ...crew.target.value,
          diary_entry_ids: appendDiaryEntryId(crew.target.value.diary_entry_ids, entryId.value),
        },
      },
    },
    errors: [],
  };
}

function spawnEvent(effect: Effect, context: EffectExecutionContext, path: string): ApplyResult {
  const eventId = readString(effect, "event_id", path, ["event_id", "id"]);
  const definitionId = readString(effect, "event_definition_id", path);
  const currentNodeId = readString(effect, "current_node_id", path, ["current_node_id", "node_id"]);
  if (eventId.errors.length > 0 || definitionId.errors.length > 0 || currentNodeId.errors.length > 0) {
    return { state: context.state, errors: [...eventId.errors, ...definitionId.errors, ...currentNodeId.errors] };
  }

  const runtimeEvent: RuntimeEvent = {
    id: eventId.value,
    event_definition_id: definitionId.value,
    event_definition_version: numberParam(effect.params.event_definition_version, 1),
    status: "active",
    current_node_id: currentNodeId.value,
    primary_crew_id: stringParam(effect.params.primary_crew_id) ?? context.trigger_context?.crew_id ?? null,
    related_crew_ids: readStringArray(effect.params.related_crew_ids),
    primary_tile_id: stringParam(effect.params.primary_tile_id) ?? context.trigger_context?.tile_id ?? null,
    related_tile_ids: readStringArray(effect.params.related_tile_ids),
    parent_event_id: booleanParam(effect.params.parent_event_link, false) ? currentEventId(context) ?? null : null,
    child_event_ids: [],
    objective_ids: [],
    selected_options: {},
    random_results: {},
    blocking_claim_ids: [],
    created_at: now(context),
    updated_at: now(context),
    trigger_context_snapshot: context.trigger_context ?? {
      trigger_type: "event_node_finished",
      occurred_at: now(context),
      source: "event_node",
      payload: {},
    },
    history_keys: [],
  };

  return {
    state: {
      ...context.state,
      active_events: {
        ...context.state.active_events,
        [eventId.value]: runtimeEvent,
      },
    },
    errors: [],
  };
}

function unlockEventDefinition(effect: Effect, context: EffectExecutionContext, path: string): ApplyResult {
  const definitionId = readString(effect, "event_definition_id", path, ["event_definition_id", "definition_id"]);
  if (definitionId.errors.length > 0) {
    return { state: context.state, errors: definitionId.errors };
  }

  return setWorldFlag(
    {
      ...effect,
      params: {
        key: `event_definition_unlocked:${definitionId.value}`,
        value: true,
        tags: ["event_definition_unlock"],
      },
    },
    context,
    path,
  );
}

function applyHandlerEffect(
  effect: Effect,
  context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): ApplyResult {
  const handlerType = readHandlerType(effect, path);
  if (handlerType.errors.length > 0) {
    return { state: context.state, errors: handlerType.errors };
  }

  const definition = getHandlerDefinition(context.handler_registry, handlerType.value);
  if (!definition) {
    return fail(
      context.state,
      effect,
      "unknown_handler_type",
      `${path}.handler_type`,
      `handler_effect references missing handler_type ${handlerType.value}.`,
    );
  }

  if (definition.kind !== "effect") {
    return fail(
      context.state,
      effect,
      "invalid_handler_kind",
      `${path}.handler_type`,
      `handler_effect ${handlerType.value} must reference an effect handler, but registry kind is ${definition.kind}.`,
    );
  }

  if (!definition.allowed_target_types.includes(effect.target.type)) {
    return fail(
      context.state,
      effect,
      "invalid_handler_target",
      `${path}.target.type`,
      `Handler ${handlerType.value} cannot access target type ${effect.target.type}.`,
    );
  }

  const handler = context.effect_handlers?.[handlerType.value];
  if (!handler) {
    return fail(
      context.state,
      effect,
      "missing_handler_implementation",
      `${path}.handler_type`,
      `No effect handler implementation is registered for ${handlerType.value}.`,
    );
  }

  try {
    const result = handler({ effect, context, target, path, params: effect.params });
    if ("state" in result) {
      return { state: result.state, errors: result.errors ?? [] };
    }
    return { state: result, errors: [] };
  } catch (error) {
    return fail(
      context.state,
      effect,
      "handler_error",
      `${path}.handler_type`,
      `Handler ${handlerType.value} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function applyRecordPolicy(state: EffectGameState, effect: Effect, context: EffectExecutionContext, path: string): EffectGameState {
  let nextState = state;

  if (effect.record_policy.write_event_log && effect.type !== "add_event_log") {
    const summary = stringParam(effect.params.log_summary) ?? stringParam(effect.params.summary) ?? `Effect ${effect.id} applied.`;
    nextState = appendEventLog(nextState, effect, { ...context, state: nextState }, summary);
  }

  if (effect.record_policy.write_world_history && effect.record_policy.history_key_template) {
    const key = renderTemplate(effect.record_policy.history_key_template, effect, context);
    nextState = writeHistoryEntry(nextState, effect, { ...context, state: nextState }, key, {
      scope: "event",
      value: stringParam(effect.params.history_summary) ?? stringParam(effect.params.summary) ?? effect.type,
      last_result: stringParam(effect.params.result_key) ?? effect.type,
    });
  }

  return nextState;
}

function resolveTarget(
  target: TargetRef,
  context: EffectExecutionContext,
  effect: Effect,
  path: string,
): TargetResolution {
  const eventId = currentEventId(context);
  const currentEvent = eventId ? context.state.active_events[eventId] : undefined;

  switch (target.type) {
    case "primary_crew": {
      const crewId = target.id ?? target.ref ?? context.trigger_context?.crew_id ?? currentEvent?.primary_crew_id ?? undefined;
      return resolveRecordTarget(target.type, crewId, context.state.crew, effect, path);
    }
    case "related_crew": {
      const crewId = target.id ?? target.ref ?? currentEvent?.related_crew_ids[0] ?? undefined;
      return resolveRecordTarget(target.type, crewId, context.state.crew, effect, path);
    }
    case "crew_id":
      return resolveRecordTarget(target.type, target.id ?? target.ref ?? undefined, context.state.crew, effect, path);
    case "event_tile": {
      const tileId = target.id ?? target.ref ?? context.trigger_context?.tile_id ?? currentEvent?.primary_tile_id ?? undefined;
      return resolveRecordTarget(target.type, tileId, context.state.tiles, effect, path);
    }
    case "tile_id":
      return resolveRecordTarget(target.type, target.id ?? target.ref ?? undefined, context.state.tiles, effect, path);
    case "active_event":
      return resolveRecordTarget(target.type, target.id ?? target.ref ?? eventId, context.state.active_events, effect, path);
    case "parent_event":
      return resolveRecordTarget(target.type, target.id ?? target.ref ?? currentEvent?.parent_event_id ?? undefined, context.state.active_events, effect, path);
    case "child_event":
      return resolveRecordTarget(target.type, target.id ?? target.ref ?? currentEvent?.child_event_ids[0] ?? undefined, context.state.active_events, effect, path);
    case "objective_id":
      return resolveRecordTarget(target.type, target.id ?? target.ref ?? context.trigger_context?.objective_id ?? currentEvent?.objective_ids[0] ?? undefined, context.state.objectives, effect, path);
    case "crew_inventory":
      return resolveCrewInventory(target, context, effect, path);
    case "base_inventory":
    case "base_resources":
      return resolveBaseInventory(context, effect, path, target.type);
    case "tile_resources": {
      const tileId = target.id ?? target.ref ?? context.trigger_context?.tile_id ?? currentEvent?.primary_tile_id ?? undefined;
      return resolveRecordTarget(target.type, tileId, context.state.tiles, effect, path);
    }
    case "world_flags":
      return { target: { type: target.type, value: context.state.world_flags }, errors: [] };
    case "world_history":
      return { target: { type: target.type, value: context.state.world_history }, errors: [] };
    case "event_log":
      return { target: { type: target.type, value: context.state.event_logs }, errors: [] };
    default:
      return {
        errors: [
          error(effect, "missing_target", `${path}.target.type`, `Unsupported target type: ${target.type}`),
        ],
      };
  }
}

function resolveRecordTarget<T>(
  type: TargetRef["type"],
  id: Id | null | undefined,
  collection: Record<Id, T>,
  effect: Effect,
  path: string,
): TargetResolution {
  const value = id ? collection[id] : undefined;
  if (!id || !value) {
    return { errors: [error(effect, "missing_target", `${path}.target`, `Target ${type} ${id ?? "<missing>"} does not exist.`)] };
  }
  return { target: { type, id, value }, errors: [] };
}

function resolveCrewInventory(
  target: TargetRef,
  context: EffectExecutionContext,
  effect: Effect,
  path: string,
): TargetResolution {
  if (target.id && context.state.inventories[target.id]) {
    return { target: { type: target.type, id: target.id, value: context.state.inventories[target.id] }, errors: [] };
  }

  const eventId = currentEventId(context);
  const currentEvent = eventId ? context.state.active_events[eventId] : undefined;
  const crewId = target.ref ?? context.trigger_context?.crew_id ?? currentEvent?.primary_crew_id ?? undefined;
  const crew = crewId ? context.state.crew[crewId] : undefined;
  const inventory = crew ? context.state.inventories[crew.inventory_id] : undefined;
  if (!inventory) {
    return {
      errors: [
        error(effect, "missing_target", `${path}.target`, `Crew inventory ${target.id ?? crewId ?? "<missing>"} does not exist.`),
      ],
    };
  }

  return { target: { type: target.type, id: inventory.id, value: inventory }, errors: [] };
}

function resolveBaseInventory(
  context: EffectExecutionContext,
  effect: Effect,
  path: string,
  type: TargetRef["type"],
): TargetResolution {
  const inventory = Object.values(context.state.inventories).find((item) => item.owner_type === "base");
  if (!inventory) {
    return { errors: [error(effect, "missing_target", `${path}.target`, "Base inventory does not exist.")] };
  }

  return { target: { type, id: inventory.id, value: inventory }, errors: [] };
}

function requireTarget<T>(
  effect: Effect,
  _context: EffectExecutionContext,
  target: ResolvedEffectTarget | undefined,
  path: string,
): { target?: ResolvedEffectTarget & { value: T }; errors: EffectExecutionError[] } {
  if (!target?.id) {
    return {
      errors: [
        error(effect, "missing_target", `${path}.target`, `Effect ${effect.type} requires a concrete target id.`),
      ],
    };
  }

  return { target: target as ResolvedEffectTarget & { value: T }, errors: [] };
}

function appendEventLog(
  state: EffectGameState,
  effect: Effect,
  context: EffectExecutionContext,
  summary: string,
): EffectGameState {
  const eventId = currentEventId(context) ?? stringParam(effect.params.event_id) ?? effect.id;
  const runtimeEvent = state.active_events[eventId];
  const log: EventLog = {
    id: stringParam(effect.params.log_id) ?? stringParam(effect.params.id) ?? `${eventId}:${effect.id}`,
    event_id: eventId,
    event_definition_id:
      stringParam(effect.params.event_definition_id) ??
      context.trigger_context?.event_definition_id ??
      runtimeEvent?.event_definition_id ??
      eventId,
    occurred_at: now(context),
    summary,
    crew_ids: readStringArray(effect.params.crew_ids, [context.trigger_context?.crew_id, runtimeEvent?.primary_crew_id]),
    tile_ids: readStringArray(effect.params.tile_ids, [context.trigger_context?.tile_id, runtimeEvent?.primary_tile_id]),
    objective_ids: readStringArray(effect.params.objective_ids, [context.trigger_context?.objective_id]),
    result_key: stringParam(effect.params.result_key) ?? null,
    importance: typeof effect.params.importance === "string" ? (effect.params.importance as EventLog["importance"]) : "normal",
    visibility: typeof effect.params.visibility === "string" ? (effect.params.visibility as EventLog["visibility"]) : "player_visible",
    history_keys: readStringArray(effect.params.history_keys),
  };

  return {
    ...state,
    event_logs: [...state.event_logs, log],
  };
}

function writeHistoryEntry(
  state: EffectGameState,
  effect: Effect,
  context: EffectExecutionContext,
  key: string,
  params: JsonObject,
): EffectGameState {
  const existing = state.world_history[key];
  const eventId = currentEventId(context) ?? stringParam(params.event_id) ?? null;
  const runtimeEvent = eventId ? state.active_events[eventId] : undefined;
  const entry: WorldHistoryEntry = {
    key,
    scope: (stringParam(params.scope) as WorldHistoryScope | undefined) ?? existing?.scope ?? "world",
    event_definition_id:
      stringParam(params.event_definition_id) ??
      context.trigger_context?.event_definition_id ??
      runtimeEvent?.event_definition_id ??
      existing?.event_definition_id ??
      null,
    event_id: eventId ?? existing?.event_id ?? null,
    crew_id: stringParam(params.crew_id) ?? context.trigger_context?.crew_id ?? runtimeEvent?.primary_crew_id ?? existing?.crew_id,
    tile_id: stringParam(params.tile_id) ?? context.trigger_context?.tile_id ?? runtimeEvent?.primary_tile_id ?? existing?.tile_id,
    objective_id: stringParam(params.objective_id) ?? context.trigger_context?.objective_id ?? existing?.objective_id,
    first_triggered_at: existing?.first_triggered_at ?? now(context),
    last_triggered_at: now(context),
    trigger_count: (existing?.trigger_count ?? 0) + 1,
    last_result: stringParam(params.last_result) ?? stringParam(params.result_key) ?? existing?.last_result ?? null,
    cooldown_until: typeof params.cooldown_until === "number" ? params.cooldown_until : existing?.cooldown_until ?? null,
    value: "value" in params ? params.value : existing?.value,
  };

  const nextActiveEvents =
    eventId && state.active_events[eventId]
      ? {
          ...state.active_events,
          [eventId]: {
            ...state.active_events[eventId],
            history_keys: addUnique(state.active_events[eventId].history_keys, key),
          },
        }
      : state.active_events;

  return {
    ...state,
    active_events: nextActiveEvents,
    world_history: {
      ...state.world_history,
      [key]: entry,
    },
  };
}

function updateInventory(state: EffectGameState, inventoryId: Id, inventory: InventoryState): EffectGameState {
  return {
    ...state,
    inventories: {
      ...state.inventories,
      [inventoryId]: inventory,
    },
  };
}

function updateItemStacks(
  items: InventoryItemStack[],
  itemId: Id,
  quantity: number,
  operation: "add" | "remove",
): InventoryItemStack[] {
  const current = items.find((item) => item.item_id === itemId);
  if (!current && operation === "add") {
    return [...items, { item_id: itemId, quantity }];
  }

  return items
    .map((item) => {
      if (item.item_id !== itemId) {
        return item;
      }
      const nextQuantity = operation === "add" ? item.quantity + quantity : Math.max(0, item.quantity - quantity);
      return { ...item, quantity: nextQuantity };
    })
    .filter((item) => item.quantity > 0);
}

function currentEventId(context: EffectExecutionContext): Id | undefined {
  return context.active_event_id ?? context.trigger_context?.event_id ?? undefined;
}

function now(context: EffectExecutionContext): number {
  return context.trigger_context?.occurred_at ?? context.state.elapsed_game_seconds ?? context.state.elapsedGameSeconds ?? 0;
}

function getHandlerDefinition(
  registry: HandlerDefinition[] | Map<string, HandlerDefinition> | undefined,
  handlerType: string,
): HandlerDefinition | undefined {
  if (!registry) {
    return undefined;
  }

  return registry instanceof Map ? registry.get(handlerType) : registry.find((handler) => handler.handler_type === handlerType);
}

interface ReadParam<T> {
  value: T;
  errors: EffectExecutionError[];
}

function readString(effect: Effect, name: string, path: string, aliases: string[] = [name]): ReadParam<string> {
  for (const alias of aliases) {
    const value = effect.params[alias];
    if (typeof value === "string" && value.length > 0) {
      return { value, errors: [] };
    }
  }

  return {
    value: "",
    errors: [error(effect, "missing_value", `${path}.params.${name}`, `${effect.type} requires string param ${name}.`)],
  };
}

function readHandlerType(effect: Effect, path: string): ReadParam<string> {
  if (typeof effect.handler_type === "string" && effect.handler_type.length > 0) {
    return { value: effect.handler_type, errors: [] };
  }
  return readString(effect, "handler_type", path);
}

function readObject(effect: Effect, name: string, path: string, required: boolean): ReadParam<JsonObject | undefined> {
  const value = effect.params[name];
  if (isRecord(value)) {
    return { value, errors: [] };
  }
  if (!required) {
    return { value: undefined, errors: [] };
  }
  return {
    value: undefined,
    errors: [error(effect, "missing_value", `${path}.params.${name}`, `${effect.type} requires object param ${name}.`)],
  };
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

function readStringArray(value: unknown, fallbackValues: Array<string | null | undefined> = []): string[] {
  const values = Array.isArray(value) ? value : fallbackValues;
  return Array.from(new Set(values.filter((item): item is string => typeof item === "string" && item.length > 0)));
}

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}

function isWorldFlagValue(value: unknown): value is WorldFlag["value"] {
  return typeof value === "boolean" || typeof value === "number" || typeof value === "string";
}

function worldFlagValueType(value: WorldFlag["value"]): WorldFlag["value_type"] {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number") {
    return "number";
  }
  return "string";
}

function isCrewTarget(value: unknown): value is CrewState {
  return isRecord(value) && typeof value.current_action_id !== "undefined";
}

function renderTemplate(template: string, effect: Effect, context: EffectExecutionContext): string {
  return template
    .replace(/\{effect_id\}/g, effect.id)
    .replace(/\{event_id\}/g, currentEventId(context) ?? "")
    .replace(/\{crew_id\}/g, context.trigger_context?.crew_id ?? "")
    .replace(/\{tile_id\}/g, context.trigger_context?.tile_id ?? "");
}

function cloneState(state: EffectGameState): EffectGameState {
  return structuredClone(state);
}

function fail(
  state: EffectGameState,
  effect: Effect,
  code: EffectExecutionErrorCode,
  path: string,
  message: string,
): ApplyResult {
  return { state, errors: [error(effect, code, path, message)] };
}

function error(effect: Effect, code: EffectExecutionErrorCode, path: string, message: string): EffectExecutionError {
  return {
    code,
    effect_id: effect.id,
    path,
    message,
    failure_policy: effect.failure_policy,
  };
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
