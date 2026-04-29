import type {
  CompareOp,
  Condition,
  EventRuntimeState,
  HandlerDefinition,
  Id,
  InventoryItemStack,
  JsonObject,
  TargetRef,
  TileResourceNode,
  TriggerContext,
} from "./types";

export type ConditionEvaluationErrorCode =
  | "invalid_condition"
  | "missing_target"
  | "missing_field"
  | "missing_value"
  | "missing_operator"
  | "incompatible_operator"
  | "unknown_handler_type"
  | "invalid_handler_kind"
  | "invalid_handler_params"
  | "invalid_handler_target"
  | "missing_handler_implementation"
  | "handler_error";

export interface ConditionEvaluationError {
  code: ConditionEvaluationErrorCode;
  path: string;
  message: string;
}

export interface ConditionEvaluationResult {
  passed: boolean;
  errors: ConditionEvaluationError[];
}

export interface ConditionGameState extends Partial<EventRuntimeState> {
  elapsed_game_seconds?: number;
  elapsedGameSeconds?: number;
  crew?: Record<Id, unknown> | unknown[];
  tiles?: Record<Id, unknown> | unknown[];
  resources?: Record<string, unknown>;
  baseInventory?: unknown[];
}

export interface ConditionHandlerInput {
  condition: Condition;
  context: ConditionEvaluationContext;
  target?: ResolvedTarget;
  path: string;
  params: JsonObject;
}

export type ConditionHandler = (input: ConditionHandlerInput) => ConditionEvaluationResult | boolean;

export interface ConditionEvaluationContext {
  state: ConditionGameState;
  trigger_context?: TriggerContext;
  active_event_id?: Id | null;
  handler_registry?: HandlerDefinition[] | Map<string, HandlerDefinition>;
  condition_handlers?: Record<string, ConditionHandler>;
}

interface ResolvedTarget {
  type: TargetRef["type"];
  id?: Id;
  value: unknown;
}

interface FieldReadResult {
  ok: boolean;
  value?: unknown;
  missingPath?: string;
}

const builtInConditionHandlers: Record<string, ConditionHandler> = {
  all_available_crew_at_tile({ context, condition, path, params }) {
    const tileId = readStringParam(params, "tile_id", `${path}.params.tile_id`, condition.handler_type ?? "handler");
    if (tileId.errors.length > 0) {
      return tileId;
    }

    return pass(getCrewEntries(context.state.crew).filter(isAvailableCommunicableCrew).every((member) => getCrewTileId(member) === tileId.value));
  },
  world_history_value_equals({ context, condition, path, params }) {
    const key = readStringParam(params, "key", `${path}.params.key`, condition.handler_type ?? "handler");
    if (key.errors.length > 0) {
      return key;
    }

    const entry = context.state.world_history?.[key.value];
    return pass(Boolean(entry && Object.is(readFieldValue(entry, "value"), params.value)));
  },
  trigger_context_value_equals({ context, condition, path, params }) {
    const field = readStringParam(params, "field", `${path}.params.field`, condition.handler_type ?? "handler");
    if (field.errors.length > 0) {
      return field;
    }

    const read = readField(context.trigger_context, field.value);
    return pass(read.ok && Object.is(read.value, params.value));
  },
  object_status_equals({ context, condition, path, params }) {
    const objectId = readStringParam(params, "object_id", `${path}.params.object_id`, condition.handler_type ?? "handler");
    if (objectId.errors.length > 0) {
      return objectId;
    }
    const status = readStringParam(params, "status", `${path}.params.status`, condition.handler_type ?? "handler");
    if (status.errors.length > 0) {
      return status;
    }

    const mapObjects = (context.state as ConditionGameState & { map?: { mapObjects?: Record<string, { status_enum?: string }> } }).map
      ?.mapObjects;
    const entry = mapObjects?.[objectId.value];
    return pass(Boolean(entry && entry.status_enum === status.value));
  },
};

/**
 * Built-in handler definitions registered alongside `builtInConditionHandlers`.
 *
 * These let condition `handler_type` references resolve without requiring the
 * caller to inject the metadata via `context.handler_registry`. The registry
 * stays the source of truth for content-defined handlers; built-ins are looked
 * up from this table as a fallback.
 */
const builtInHandlerDefinitions: Record<string, HandlerDefinition> = {
  object_status_equals: {
    handler_type: "object_status_equals",
    kind: "condition",
    description: "Checks whether a runtime map object's status_enum equals the requested value.",
    params_schema_ref: "#/$defs/object_status_equals_params",
    allowed_target_types: [],
    deterministic: true,
    uses_random: false,
    failure_policy: "fail_event",
    sample_fixtures: [],
  },
};

export function evaluateConditions(
  conditions: Condition[],
  context: ConditionEvaluationContext,
  basePath = "conditions",
): ConditionEvaluationResult {
  const errors: ConditionEvaluationError[] = [];
  let passed = true;

  conditions.forEach((condition, index) => {
    const result = evaluateCondition(condition, context, `${basePath}[${index}]`);
    errors.push(...result.errors);
    passed = passed && result.passed;
  });

  return { passed: errors.length === 0 && passed, errors };
}

export function evaluateCondition(
  condition: Condition,
  context: ConditionEvaluationContext,
  path = "condition",
): ConditionEvaluationResult {
  switch (condition.type) {
    case "all_of":
      return evaluateAllOf(condition, context, path);
    case "any_of":
      return evaluateAnyOf(condition, context, path);
    case "not":
      return evaluateNot(condition, context, path);
    case "compare_field":
      return evaluateCompareField(condition, context, path);
    case "has_tag":
      return evaluateTag(condition, context, path, true);
    case "lacks_tag":
      return evaluateTag(condition, context, path, false);
    case "has_condition":
      return evaluateCrewCondition(condition, context, path);
    case "attribute_check":
      return evaluateAttributeCheck(condition, context, path);
    case "inventory_has_item":
      return evaluateInventoryHasItem(condition, context, path);
    case "resource_amount":
      return evaluateResourceAmount(condition, context, path);
    case "tile_discovery_state":
      return evaluateTileState(condition, context, path, "discovery_state");
    case "tile_survey_state":
      return evaluateTileState(condition, context, path, "survey_state");
    case "world_flag_equals":
      return evaluateWorldFlagEquals(condition, context, path);
    case "world_history_exists":
      return evaluateWorldHistoryExists(condition, context, path);
    case "world_history_count":
      return evaluateWorldHistoryCount(condition, context, path);
    case "objective_status":
      return evaluateRecordStatus(condition, context, path, "objectives", "status");
    case "event_status":
      return evaluateRecordStatus(condition, context, path, "active_events", "status");
    case "event_current_node":
      return evaluateRecordStatus(condition, context, path, "active_events", "current_node_id");
    case "crew_action_status":
      return evaluateCrewActionStatus(condition, context, path);
    case "time_compare":
      return evaluateTimeCompare(condition, context, path);
    case "handler_condition":
      return evaluateHandlerCondition(condition, context, path);
    default:
      return fail("invalid_condition", `${path}.type`, `Unsupported condition type: ${condition.type}`);
  }
}

function evaluateAllOf(condition: Condition, context: ConditionEvaluationContext, path: string): ConditionEvaluationResult {
  const children = condition.conditions ?? [];
  return evaluateConditions(children, context, `${path}.conditions`);
}

function evaluateAnyOf(condition: Condition, context: ConditionEvaluationContext, path: string): ConditionEvaluationResult {
  const children = condition.conditions ?? [];
  const results = children.map((child, index) => evaluateCondition(child, context, `${path}.conditions[${index}]`));
  const errors = results.flatMap((result) => result.errors);

  return { passed: errors.length === 0 && results.some((result) => result.passed), errors };
}

function evaluateNot(condition: Condition, context: ConditionEvaluationContext, path: string): ConditionEvaluationResult {
  const children = condition.conditions ?? [];
  if (children.length !== 1) {
    return fail("invalid_condition", `${path}.conditions`, "`not` conditions must contain exactly one child condition.");
  }

  const result = evaluateCondition(children[0], context, `${path}.conditions[0]`);
  return result.errors.length > 0 ? result : pass(!result.passed);
}

function evaluateCompareField(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  const target = resolveTarget(condition.target ?? null, context, path);
  if (target.errors.length > 0 || !target.target) {
    return target;
  }

  const field = requireString(condition.field, `${path}.field`, "compare_field requires a field path.");
  if (field.errors.length > 0) {
    return field;
  }

  const read = readField(target.target.value, field.value);
  if (!read.ok) {
    return fail(
      "missing_field",
      `${path}.field`,
      `Field ${field.value} does not exist on target ${target.target.type}.`,
    );
  }

  return compare(read.value, condition.op ?? null, condition.value, `${path}.op`, field.value);
}

function evaluateTag(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
  expectedPresence: boolean,
): ConditionEvaluationResult {
  const target = resolveTarget(condition.target ?? null, context, path);
  if (target.errors.length > 0 || !target.target) {
    return target;
  }

  const tag = stringFromConditionValue(condition, "tag", path);
  if (tag.errors.length > 0) {
    return tag;
  }

  const tags = collectTags(target.target.value, condition.field ?? undefined);
  return pass(tags.includes(tag.value) === expectedPresence);
}

function evaluateCrewCondition(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  const target = resolveTarget(condition.target ?? { type: "primary_crew" }, context, path);
  if (target.errors.length > 0 || !target.target) {
    return target;
  }

  const conditionTag = stringFromConditionValue(condition, "condition", path);
  if (conditionTag.errors.length > 0) {
    return conditionTag;
  }

  return pass(collectStringArray(target.target.value, ["condition_tags", "conditions"]).includes(conditionTag.value));
}

function evaluateAttributeCheck(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  const target = resolveTarget(condition.target ?? { type: "primary_crew" }, context, path);
  if (target.errors.length > 0 || !target.target) {
    return target;
  }

  const attribute = condition.field ?? stringParam(condition.params, "attribute");
  const field = requireString(attribute, `${path}.field`, "attribute_check requires an attribute field.");
  if (field.errors.length > 0) {
    return field;
  }

  const read = readField(target.target.value, `attributes.${field.value}`);
  if (!read.ok) {
    return fail("missing_field", `${path}.field`, `Attribute ${field.value} does not exist on target crew.`);
  }

  return compare(read.value, condition.op ?? null, condition.value, `${path}.op`, `attributes.${field.value}`);
}

function evaluateInventoryHasItem(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  const target = resolveTarget(condition.target ?? { type: "base_inventory" }, context, path);
  if (target.errors.length > 0 || !target.target) {
    return target;
  }

  const itemId = stringFromConditionValue(condition, "item_id", path);
  if (itemId.errors.length > 0) {
    return itemId;
  }

  const minQuantity = numberParam(condition.params, "min_quantity", 1);
  if (!Number.isFinite(minQuantity) || minQuantity < 1) {
    return fail("invalid_condition", `${path}.params.min_quantity`, "inventory_has_item min_quantity must be a positive number.");
  }

  const quantity = inventoryItems(target.target.value).reduce(
    (total, item) => (item.item_id === itemId.value ? total + item.quantity : total),
    0,
  );
  return pass(quantity >= minQuantity);
}

function evaluateResourceAmount(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  const target = resolveTarget(condition.target ?? { type: "base_resources" }, context, path);
  if (target.errors.length > 0 || !target.target) {
    return target;
  }

  const resourceId = condition.field ?? stringParam(condition.params, "resource_id");
  const resource = requireString(resourceId, `${path}.field`, "resource_amount requires a resource field.");
  if (resource.errors.length > 0) {
    return resource;
  }

  return compare(resourceAmount(target.target.value, resource.value), condition.op ?? null, condition.value, `${path}.op`, resource.value);
}

function evaluateTileState(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
  field: "discovery_state" | "survey_state",
): ConditionEvaluationResult {
  const target = resolveTarget(condition.target ?? { type: "event_tile" }, context, path);
  if (target.errors.length > 0 || !target.target) {
    return target;
  }

  const read = readField(target.target.value, field);
  if (!read.ok) {
    return fail("missing_field", `${path}.field`, `Tile field ${field} does not exist.`);
  }

  return compare(read.value, condition.op ?? "equals", condition.value, `${path}.op`, field);
}

function evaluateWorldFlagEquals(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  const key = condition.field ?? stringParam(condition.params, "key") ?? context.trigger_context?.world_flag_key ?? undefined;
  const flagKey = requireString(key, `${path}.field`, "world_flag_equals requires a flag key.");
  if (flagKey.errors.length > 0) {
    return flagKey;
  }

  const flag = context.state.world_flags?.[flagKey.value];
  return pass(Boolean(flag && Object.is(flag.value, condition.value)));
}

function evaluateWorldHistoryExists(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  const key = condition.field ?? stringParam(condition.params, "key");
  const historyKey = requireString(key, `${path}.field`, "world_history_exists requires a history key.");
  if (historyKey.errors.length > 0) {
    return historyKey;
  }

  return pass(Boolean(context.state.world_history?.[historyKey.value]));
}

function evaluateWorldHistoryCount(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  const key = condition.field ?? stringParam(condition.params, "key");
  const historyKey = requireString(key, `${path}.field`, "world_history_count requires a history key.");
  if (historyKey.errors.length > 0) {
    return historyKey;
  }

  const count = context.state.world_history?.[historyKey.value]?.trigger_count ?? 0;
  return compare(count, condition.op ?? null, condition.value, `${path}.op`, `${historyKey.value}.trigger_count`);
}

function evaluateRecordStatus(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
  collection: "objectives" | "active_events",
  field: "status" | "current_node_id",
): ConditionEvaluationResult {
  const target = resolveTarget(
    condition.target ?? { type: collection === "objectives" ? "objective_id" : "active_event" },
    context,
    path,
  );
  if (target.errors.length > 0 || !target.target) {
    return target;
  }

  const read = readField(target.target.value, field);
  if (!read.ok) {
    return fail("missing_field", `${path}.field`, `Field ${field} does not exist on target ${target.target.type}.`);
  }

  return compare(read.value, condition.op ?? "equals", condition.value, `${path}.op`, field);
}

function evaluateCrewActionStatus(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  const crew = resolveTarget(condition.target ?? { type: "primary_crew" }, context, path);
  if (crew.errors.length > 0 || !crew.target) {
    return crew;
  }

  const actionId = stringFieldValue(crew.target.value, ["current_action_id", "currentActionId"]);
  if (!actionId) {
    return pass(false);
  }

  const action = context.state.crew_actions?.[actionId];
  if (!action) {
    return pass(false);
  }

  return compare(action.status, condition.op ?? "equals", condition.value, `${path}.op`, "crew_action.status");
}

function evaluateTimeCompare(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  if (condition.target) {
    const target = resolveTarget(condition.target, context, path);
    if (target.errors.length > 0 || !target.target) {
      return target;
    }
    const field = requireString(condition.field, `${path}.field`, "time_compare with a target requires a field.");
    if (field.errors.length > 0) {
      return field;
    }
    const read = readField(target.target.value, field.value);
    if (!read.ok) {
      return fail("missing_field", `${path}.field`, `Field ${field.value} does not exist on target ${target.target.type}.`);
    }
    return compare(read.value, condition.op ?? null, condition.value, `${path}.op`, field.value);
  }

  const now =
    context.state.elapsed_game_seconds ?? context.state.elapsedGameSeconds ?? context.trigger_context?.occurred_at ?? undefined;
  if (typeof now !== "number") {
    return fail("missing_field", `${path}.field`, "time_compare requires elapsed game seconds or trigger_context.occurred_at.");
  }

  return compare(now, condition.op ?? null, condition.value, `${path}.op`, "elapsed_game_seconds");
}

function evaluateHandlerCondition(
  condition: Condition,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult {
  const handlerType = requireString(
    condition.handler_type,
    `${path}.handler_type`,
    "handler_condition requires handler_type.",
  );
  if (handlerType.errors.length > 0) {
    return handlerType;
  }

  const definition = getHandlerDefinition(context.handler_registry, handlerType.value);
  if (!definition) {
    return fail(
      "unknown_handler_type",
      `${path}.handler_type`,
      `handler_condition references missing handler_type ${handlerType.value}.`,
    );
  }

  if (definition.kind !== "condition") {
    return fail(
      "invalid_handler_kind",
      `${path}.handler_type`,
      `handler_condition ${handlerType.value} must reference a condition handler, but registry kind is ${definition.kind}.`,
    );
  }

  const target = condition.target ? resolveTarget(condition.target, context, path) : passWithTarget(undefined);
  if (target.errors.length > 0) {
    return target;
  }

  if (condition.target && !definition.allowed_target_types.includes(condition.target.type)) {
    return fail(
      "invalid_handler_target",
      `${path}.target.type`,
      `Handler ${handlerType.value} cannot access target type ${condition.target.type}.`,
    );
  }

  const params = condition.params ?? {};
  if (!isRecord(params)) {
    return fail("invalid_handler_params", `${path}.params`, `Handler ${handlerType.value} params must be an object.`);
  }

  const handler = context.condition_handlers?.[handlerType.value] ?? builtInConditionHandlers[handlerType.value];
  if (!handler) {
    return fail(
      "missing_handler_implementation",
      `${path}.handler_type`,
      `No condition handler implementation is registered for ${handlerType.value}.`,
    );
  }

  try {
    const result = handler({
      condition,
      context,
      target: target.target,
      path,
      params,
    });
    return typeof result === "boolean" ? pass(result) : result;
  } catch (error) {
    return fail(
      "handler_error",
      `${path}.handler_type`,
      `Handler ${handlerType.value} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function resolveTarget(
  target: TargetRef | null,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult & { target?: ResolvedTarget } {
  if (!target) {
    return failWithTarget("missing_target", `${path}.target`, "Condition requires a target.");
  }

  const currentEventId = context.active_event_id ?? context.trigger_context?.event_id ?? undefined;
  const currentEvent = currentEventId ? context.state.active_events?.[currentEventId] : undefined;

  switch (target.type) {
    case "primary_crew": {
      const crewId = target.id ?? target.ref ?? context.trigger_context?.crew_id ?? currentEvent?.primary_crew_id ?? undefined;
      return resolveCollectionTarget(target.type, crewId, context.state.crew, ["id", "crewId"], path);
    }
    case "related_crew": {
      const crewId = target.id ?? target.ref ?? currentEvent?.related_crew_ids[0] ?? undefined;
      return resolveCollectionTarget(target.type, crewId, context.state.crew, ["id", "crewId"], path);
    }
    case "crew_id":
      return resolveCollectionTarget(target.type, target.id ?? target.ref ?? undefined, context.state.crew, ["id", "crewId"], path);
    case "event_tile": {
      const tileId = target.id ?? target.ref ?? context.trigger_context?.tile_id ?? currentEvent?.primary_tile_id ?? undefined;
      return resolveCollectionTarget(target.type, tileId, context.state.tiles, ["id"], path);
    }
    case "tile_id":
      return resolveCollectionTarget(target.type, target.id ?? target.ref ?? undefined, context.state.tiles, ["id"], path);
    case "active_event": {
      const eventId = target.id ?? target.ref ?? currentEventId;
      return resolveRecordTarget(target.type, eventId, context.state.active_events, path);
    }
    case "parent_event": {
      const eventId = target.id ?? target.ref ?? currentEvent?.parent_event_id ?? undefined;
      return resolveRecordTarget(target.type, eventId, context.state.active_events, path);
    }
    case "child_event": {
      const eventId = target.id ?? target.ref ?? currentEvent?.child_event_ids[0] ?? undefined;
      return resolveRecordTarget(target.type, eventId, context.state.active_events, path);
    }
    case "objective_id":
      return resolveRecordTarget(target.type, target.id ?? target.ref ?? context.trigger_context?.objective_id ?? undefined, context.state.objectives, path);
    case "crew_inventory":
      return resolveCrewInventory(target, context, path);
    case "base_inventory":
      return resolveBaseInventory(context, path);
    case "base_resources":
      return passWithTarget({ type: target.type, id: target.id ?? undefined, value: resolveBaseResources(context.state) });
    case "tile_resources": {
      const tileId = target.id ?? target.ref ?? context.trigger_context?.tile_id ?? currentEvent?.primary_tile_id ?? undefined;
      const tile = getCollectionItem(context.state.tiles, tileId, ["id"]);
      if (!tile) {
        return failWithTarget("missing_target", `${path}.target`, `Target tile ${tileId ?? "<missing>"} does not exist.`);
      }
      return passWithTarget({ type: target.type, id: tileId, value: tile });
    }
    case "world_flags":
      return passWithTarget({ type: target.type, value: context.state.world_flags ?? {} });
    case "world_history":
      return passWithTarget({ type: target.type, value: context.state.world_history ?? {} });
    case "event_log":
      return passWithTarget({ type: target.type, value: context.state.event_logs ?? [] });
    default:
      return failWithTarget("missing_target", `${path}.target.type`, `Unsupported target type: ${target.type}`);
  }
}

function resolveCollectionTarget(
  type: TargetRef["type"],
  id: string | null | undefined,
  collection: Record<string, unknown> | unknown[] | undefined,
  idFields: string[],
  path: string,
): ConditionEvaluationResult & { target?: ResolvedTarget } {
  const item = getCollectionItem(collection, id, idFields);
  if (!item) {
    return failWithTarget("missing_target", `${path}.target`, `Target ${type} ${id ?? "<missing>"} does not exist.`);
  }

  return passWithTarget({ type, id: id ?? undefined, value: item });
}

function resolveRecordTarget<T>(
  type: TargetRef["type"],
  id: string | null | undefined,
  collection: Record<string, T> | undefined,
  path: string,
): ConditionEvaluationResult & { target?: ResolvedTarget } {
  const item = id ? collection?.[id] : undefined;
  if (!item) {
    return failWithTarget("missing_target", `${path}.target`, `Target ${type} ${id ?? "<missing>"} does not exist.`);
  }

  return passWithTarget({ type, id: id ?? undefined, value: item });
}

function resolveCrewInventory(
  target: TargetRef,
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult & { target?: ResolvedTarget } {
  if (target.id && context.state.inventories?.[target.id]) {
    return passWithTarget({ type: target.type, id: target.id, value: context.state.inventories[target.id] });
  }

  const crewId = target.ref ?? context.trigger_context?.crew_id ?? undefined;
  const crew = getCollectionItem(context.state.crew, crewId, ["id", "crewId"]);
  const inventoryId = crew ? stringFieldValue(crew, ["inventory_id", "inventoryId"]) : undefined;
  if (inventoryId && context.state.inventories?.[inventoryId]) {
    return passWithTarget({ type: target.type, id: inventoryId, value: context.state.inventories[inventoryId] });
  }

  const inlineInventory = crew && readFieldValue(crew, "inventory");
  if (Array.isArray(inlineInventory)) {
    return passWithTarget({ type: target.type, id: crewId, value: inlineInventory });
  }

  return failWithTarget("missing_target", `${path}.target`, `Crew inventory ${target.id ?? crewId ?? "<missing>"} does not exist.`);
}

function resolveBaseInventory(
  context: ConditionEvaluationContext,
  path: string,
): ConditionEvaluationResult & { target?: ResolvedTarget } {
  const inventory = Object.values(context.state.inventories ?? {}).find((item) => item.owner_type === "base");
  if (inventory) {
    return passWithTarget({ type: "base_inventory", id: inventory.id, value: inventory });
  }

  if (context.state.baseInventory) {
    return passWithTarget({ type: "base_inventory", value: context.state.baseInventory });
  }

  return failWithTarget("missing_target", `${path}.target`, "Base inventory does not exist.");
}

function resolveBaseResources(state: ConditionGameState): unknown {
  const inventoryResources = Object.values(state.inventories ?? {}).find((inventory) => inventory.owner_type === "base")?.resources;
  return inventoryResources ?? state.resources ?? {};
}

function getCollectionItem(
  collection: Record<string, unknown> | unknown[] | undefined,
  id: string | null | undefined,
  idFields: string[],
): unknown {
  if (!id || !collection) {
    return undefined;
  }

  if (Array.isArray(collection)) {
    return collection.find((item) => idFields.some((field) => readFieldValue(item, field) === id));
  }

  return collection[id];
}

function getCrewEntries(crew: Record<Id, unknown> | unknown[] | undefined): unknown[] {
  if (!crew) {
    return [];
  }

  return Array.isArray(crew) ? crew : Object.values(crew);
}

function isAvailableCommunicableCrew(member: unknown): boolean {
  if (!isRecord(member)) {
    return false;
  }

  const status = stringFieldValue(member, ["status"]);
  const communicationState = stringFieldValue(member, ["communication_state", "communicationState"]);
  const unavailable = readFieldValue(member, "unavailable") === true;
  const canCommunicate = readFieldValue(member, "canCommunicate");
  const conditions = collectStringArray(member, ["condition_tags", "conditions"]);

  if (unavailable || canCommunicate === false || communicationState === "lost_contact") {
    return false;
  }

  return ![status, ...conditions].some((value) => value === "lost" || value === "lost_contact" || value === "dead" || value === "unavailable");
}

function getCrewTileId(member: unknown): string | undefined {
  return stringFieldValue(member, ["tile_id", "tileId", "currentTile"]);
}

function readField(value: unknown, field: string): FieldReadResult {
  const segments = field.split(".");
  let current = value;

  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { ok: false, missingPath: segment };
      }
      current = current[index];
      continue;
    }

    if (!isRecord(current) || !(segment in current)) {
      return { ok: false, missingPath: segment };
    }

    current = current[segment];
  }

  return { ok: true, value: current };
}

function readFieldValue(value: unknown, field: string): unknown {
  const result = readField(value, field);
  return result.ok ? result.value : undefined;
}

function compare(
  actual: unknown,
  op: CompareOp | null,
  expected: unknown,
  opPath: string,
  field: string,
): ConditionEvaluationResult {
  if (!op) {
    return fail("missing_operator", opPath, `Comparison for ${field} requires an operator.`);
  }

  switch (op) {
    case "equals":
      return pass(Object.is(actual, expected));
    case "not_equals":
      return pass(!Object.is(actual, expected));
    case "gt":
    case "gte":
    case "lt":
    case "lte":
      if (typeof actual !== "number" || typeof expected !== "number") {
        return fail("incompatible_operator", opPath, `Operator ${op} requires numeric values for ${field}.`);
      }
      return pass(compareNumbers(actual, op, expected));
    case "includes":
    case "not_includes": {
      const includes = includesValue(actual, expected);
      if (includes === null) {
        return fail("incompatible_operator", opPath, `Operator ${op} requires an array or string field for ${field}.`);
      }
      return pass(op === "includes" ? includes : !includes);
    }
    default:
      return fail("incompatible_operator", opPath, `Unsupported operator ${op} for ${field}.`);
  }
}

function compareNumbers(actual: number, op: CompareOp, expected: number): boolean {
  switch (op) {
    case "gt":
      return actual > expected;
    case "gte":
      return actual >= expected;
    case "lt":
      return actual < expected;
    case "lte":
      return actual <= expected;
    default:
      return false;
  }
}

function includesValue(actual: unknown, expected: unknown): boolean | null {
  if (Array.isArray(actual)) {
    return actual.includes(expected);
  }
  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }
  return null;
}

function collectTags(value: unknown, field?: string): string[] {
  if (field) {
    return collectStringArray(value, [field]);
  }

  return [
    ...collectStringArray(value, ["tags"]),
    ...collectStringArray(value, ["danger_tags", "dangerTags"]),
    ...collectStringArray(value, ["personality_tags", "personalityTags"]),
    ...collectStringArray(value, ["expertise_tags", "expertiseTags"]),
    ...collectExpertiseTags(value),
    ...collectStringArray(value, ["condition_tags", "conditions"]),
  ];
}

function collectExpertiseTags(value: unknown): string[] {
  const expertise = readFieldValue(value, "expertise");
  if (!Array.isArray(expertise)) {
    return [];
  }

  return expertise.flatMap((item) => {
    const id = readFieldValue(item, "expertiseId");
    return typeof id === "string" ? [id] : [];
  });
}

function collectStringArray(value: unknown, fields: string[]): string[] {
  for (const field of fields) {
    const fieldValue = readFieldValue(value, field);
    if (Array.isArray(fieldValue)) {
      return fieldValue.filter((item): item is string => typeof item === "string");
    }
  }

  return [];
}

function inventoryItems(value: unknown): InventoryItemStack[] {
  const rawItems = Array.isArray(value) ? value : readFieldValue(value, "items");
  if (!Array.isArray(rawItems)) {
    return [];
  }

  return rawItems.flatMap((item): InventoryItemStack[] => {
    const itemId = stringFieldValue(item, ["item_id", "itemId"]);
    const quantity = readFieldValue(item, "quantity");
    return itemId && typeof quantity === "number" ? [{ item_id: itemId, quantity }] : [];
  });
}

function resourceAmount(value: unknown, resourceId: string): number {
  const directAmount = readFieldValue(value, resourceId);
  if (typeof directAmount === "number") {
    return directAmount;
  }

  const resources = readFieldValue(value, "resources");
  if (isRecord(resources) && typeof resources[resourceId] === "number") {
    return resources[resourceId];
  }

  const resourceNodes = readFieldValue(value, "resource_nodes");
  if (Array.isArray(resourceNodes)) {
    return resourceNodes.reduce((total, node) => {
      const typedNode = node as TileResourceNode;
      return typedNode.resource_id === resourceId ? total + typedNode.amount : total;
    }, 0);
  }

  const resourceList = readFieldValue(value, "resources");
  if (Array.isArray(resourceList)) {
    return resourceList.includes(resourceId) ? 1 : 0;
  }

  return 0;
}

function stringFromConditionValue(
  condition: Condition,
  paramName: string,
  path: string,
): ConditionEvaluationResult & { value: string } {
  const value = typeof condition.value === "string" ? condition.value : stringParam(condition.params, paramName);
  return requireString(value, `${path}.value`, `Condition ${condition.type} requires a string ${paramName}.`);
}

function readStringParam(
  params: JsonObject,
  name: string,
  path: string,
  handlerType: string,
): ConditionEvaluationResult & { value: string } {
  const value = params[name];
  if (typeof value !== "string" || value.length === 0) {
    return {
      passed: false,
      errors: [
        {
          code: "invalid_handler_params",
          path,
          message: `Handler ${handlerType} requires string param ${name}.`,
        },
      ],
      value: "",
    };
  }

  return { passed: true, errors: [], value };
}

function requireString(
  value: unknown,
  path: string,
  message: string,
): ConditionEvaluationResult & { value: string } {
  if (typeof value !== "string" || value.length === 0) {
    return {
      passed: false,
      errors: [{ code: "missing_field", path, message }],
      value: "",
    };
  }

  return { passed: true, errors: [], value };
}

function stringParam(params: JsonObject | undefined, name: string): string | undefined {
  const value = params?.[name];
  return typeof value === "string" ? value : undefined;
}

function numberParam(params: JsonObject | undefined, name: string, fallback: number): number {
  const value = params?.[name];
  return typeof value === "number" ? value : fallback;
}

function stringFieldValue(value: unknown, fields: string[]): string | undefined {
  for (const field of fields) {
    const fieldValue = readFieldValue(value, field);
    if (typeof fieldValue === "string") {
      return fieldValue;
    }
  }

  return undefined;
}

function getHandlerDefinition(
  registry: HandlerDefinition[] | Map<string, HandlerDefinition> | undefined,
  handlerType: string,
): HandlerDefinition | undefined {
  if (registry) {
    const fromRegistry = registry instanceof Map
      ? registry.get(handlerType)
      : registry.find((handler) => handler.handler_type === handlerType);
    if (fromRegistry) {
      return fromRegistry;
    }
  }

  return builtInHandlerDefinitions[handlerType];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pass(passed: boolean): ConditionEvaluationResult {
  return { passed, errors: [] };
}

function fail(code: ConditionEvaluationErrorCode, path: string, message: string): ConditionEvaluationResult {
  return { passed: false, errors: [{ code, path, message }] };
}

function passWithTarget(target: ResolvedTarget | undefined): ConditionEvaluationResult & { target?: ResolvedTarget } {
  return { passed: true, errors: [], target };
}

function failWithTarget(
  code: ConditionEvaluationErrorCode,
  path: string,
  message: string,
): ConditionEvaluationResult & { target?: ResolvedTarget } {
  return { passed: false, errors: [{ code, path, message }] };
}
