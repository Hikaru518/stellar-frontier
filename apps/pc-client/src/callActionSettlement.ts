import { defaultMapConfig, type FeatureRuntimeState, type MapFeatureDefinition, type Tone } from "./content/contentData";
import { mapObjectDefinitionById, type MapObjectDefinition } from "./content/mapObjects";
import type { CrewMember, GameMapState, MapTile, ResourceSummary, SystemLog } from "./data/gameData";
import { executeEffects } from "./events/effects";
import type { Effect } from "./events/types";
import type { InventoryEntry } from "./inventorySystem";
import { getFeatureRuntimeState } from "./mapSystem";
import { addInventoryItem } from "./inventorySystem";
import { formatGameTime } from "./timeSystem";
import type { CrewActionState, TriggerContext } from "./events/types";

type SettlementRuntimeActionType = Extract<CrewActionState["type"], "survey" | "gather" | "build" | "extract" | "repair">;

interface SettlementRuntimeAction {
  id: string;
  actionType: SettlementRuntimeActionType;
  targetTile?: string | null;
  targetFeatureId?: string;
  actionDefId?: string;
  objectId?: string;
  params: Record<string, unknown>;
  handler?: string;
}

export interface ActionSettlementPatch {
  member: CrewMember;
  resources: ResourceSummary;
  tiles: MapTile[];
  map: GameMapState;
  logs: SystemLog[];
  baseInventory?: InventoryEntry[];
  triggerContexts: TriggerContext[];
}

interface SettleActionArgs {
  member: CrewMember;
  action: CrewActionState;
  occurredAt: number;
  resources: ResourceSummary;
  baseInventory?: InventoryEntry[];
  tiles: MapTile[];
  map: GameMapState;
  logs: SystemLog[];
}

interface HandlerContext {
  member: CrewMember;
  action: SettlementRuntimeAction;
  occurredAt: number;
  resources: ResourceSummary;
  baseInventory?: InventoryEntry[];
  tiles: MapTile[];
  map: GameMapState;
  logs: SystemLog[];
  tile?: TileWithContent;
  object?: MapObjectDefinition;
  feature?: MapFeatureDefinition;
}

type ActionHandler = (ctx: HandlerContext) => ActionSettlementPatch;

type TileWithContent = MapTile & {
  tags?: string[];
};

const actionHandlers: Partial<Record<string, ActionHandler>> = {
  survey: settleSurvey,
  gather: settleGather,
  build: settleGenericCompletion,
  extract: settleGenericCompletion,
  repair: settleRepair,
  timed_generic: settleGenericCompletion,
};

export function settleAction(args: SettleActionArgs): ActionSettlementPatch {
  const action = normalizeSettlementAction(args.action);
  const handlerId = action.handler ?? action.actionType;
  const handler = actionHandlers[handlerId];
  const tile = findTile(args.tiles, action.targetTile ?? args.member.currentTile);
  const object = action.objectId ? mapObjectDefinitionById.get(action.objectId) : undefined;
  const feature = action.targetFeatureId ? findFeature(action.targetFeatureId) : undefined;

  if (!handler) {
    return createPatch({
      ...args,
      member: { ...args.member, activeAction: undefined },
      logs: appendLogEntry(args.logs, `行动完成失败：动作处理器 ${handlerId} 未注册。`, "danger", args.occurredAt),
    });
  }

  return handler({
    member: args.member,
    action,
    occurredAt: args.occurredAt,
    resources: args.resources,
    baseInventory: args.baseInventory,
    tiles: args.tiles,
    map: args.map,
    logs: args.logs,
    tile,
    object,
    feature,
  });
}

function settleSurvey(ctx: HandlerContext): ActionSettlementPatch {
  if (ctx.action.targetFeatureId) {
    return settleFeatureSurvey(ctx, ctx.action.targetFeatureId);
  }

  const tileId = ctx.action.targetTile ?? ctx.member.currentTile;
  const tile = ctx.tile;
  const objects = getTileObjectsForTile(tile, ctx.map);
  const revealedObjects = objects.filter((object) => object.visibility === "onInvestigated");
  const revealedObjectIds = revealedObjects.map((object) => object.id);
  const previous = ctx.map.tilesById[tileId] ?? {};
  const map = {
    ...ctx.map,
    discoveredTileIds: addUnique(ctx.map.discoveredTileIds, tileId),
    tilesById: {
      ...ctx.map.tilesById,
      [tileId]: {
        ...previous,
        discovered: true,
        investigated: true,
        status: "已调查",
        revealedObjectIds: addUnique(previous.revealedObjectIds ?? [], ...revealedObjectIds),
      },
    },
  };
  const tiles = patchTile(ctx.tiles, tileId, { investigated: true, status: "已调查" });
  const member = {
    ...ctx.member,
    status: "调查完成，待命中。",
    statusTone: "neutral" as Tone,
    activeAction: undefined,
  };

  return createPatch({
    ...ctx,
    member,
    tiles,
    map,
    logs: appendLogEntry(ctx.logs, `${ctx.member.name} 完成一轮调查。`, "neutral", ctx.occurredAt),
    triggerContexts: [createActionCompleteTrigger(ctx, getPayloadObjects(ctx, revealedObjects))],
  });
}

function settleFeatureSurvey(ctx: HandlerContext, featureId: string): ActionSettlementPatch {
  const feature = findFeature(featureId);
  if (!feature) {
    return createPatch({
      ...ctx,
      member: {
        ...ctx.member,
        status: "调查失败，待命中。",
        statusTone: "danger",
        activeAction: undefined,
      },
      logs: appendLogEntry(ctx.logs, `行动完成失败：调查目标 ${featureId} 不存在。`, "danger", ctx.occurredAt),
      triggerContexts: [],
    });
  }

  const tileId = ctx.action.targetTile ?? ctx.member.currentTile;
  const previousTile = ctx.map.tilesById[tileId] ?? {};
  const nextFeatureState = createSurveyedFeatureState(ctx, feature);
  const map = {
    ...ctx.map,
    discoveredTileIds: addUnique(ctx.map.discoveredTileIds, tileId),
    tilesById: {
      ...ctx.map.tilesById,
      [tileId]: {
        ...previousTile,
        discovered: true,
        investigated: true,
        status: "已调查",
      },
    },
    featuresById: {
      ...(ctx.map.featuresById ?? {}),
      [feature.id]: nextFeatureState.state,
    },
  };
  const tiles = patchTile(ctx.tiles, tileId, { investigated: true, status: "已调查" });
  const member = {
    ...ctx.member,
    status: "调查完成，待命中。",
    statusTone: "neutral" as Tone,
    activeAction: undefined,
  };

  return createPatch({
    ...ctx,
    member,
    tiles,
    map,
    logs: appendLogEntry(ctx.logs, `${ctx.member.name} 完成一轮调查。`, "neutral", ctx.occurredAt),
    triggerContexts: [createActionCompleteTrigger(ctx, [], createFeatureSurveyPayload(ctx, feature, nextFeatureState.firstInvestigation))],
  });
}

function settleGather(ctx: HandlerContext): ActionSettlementPatch {
  const object = ctx.object;
  const resourceId = getGatherResourceId(ctx.action);
  const amount = resourceId ? getResourceYield(ctx.action, resourceId) : 0;
  const inventory = resourceId && amount > 0 ? addInventoryItem(ctx.member.inventory, resourceId, amount) : ctx.member.inventory;
  const member = {
    ...ctx.member,
    inventory,
    status: "采集完成，待命中。",
    statusTone: "success" as Tone,
    activeAction: undefined,
  };
  const logText =
    resourceId && amount > 0
      ? `${ctx.member.name} 完成采集，获得 ${amount} 个 ${resourceId}。`
      : `${ctx.member.name} 完成采集，但没有获得可入库资源。`;

  return createPatch({
    ...ctx,
    member,
    logs: appendLogEntry(ctx.logs, logText, amount > 0 ? "success" : "muted", ctx.occurredAt),
    triggerContexts: [createActionCompleteTrigger(ctx, object ? [object] : [])],
  });
}

function settleGenericCompletion(ctx: HandlerContext): ActionSettlementPatch {
  const statusText = stringParam(ctx.action.params.completion_status) ?? "行动完成，待命中。";
  const logText = stringParam(ctx.action.params.completion_log) ?? `${ctx.member.name} 的行动已完成。`;
  const member = {
    ...ctx.member,
    status: statusText,
    statusTone: "neutral" as Tone,
    activeAction: undefined,
  };

  return createPatch({
    ...ctx,
    member,
    logs: appendLogEntry(ctx.logs, logText, "neutral", ctx.occurredAt),
    triggerContexts: [createActionCompleteTrigger(ctx, ctx.object ? [ctx.object] : [])],
  });
}

function settleRepair(ctx: HandlerContext): ActionSettlementPatch {
  const repairCheck = readRepairSuccessCheck(ctx.action.params.success_check);
  const repairResult = repairCheck
    ? (rollRepairOutcome(repairCheck, ctx.member.attributes.agility) ? "success" : "failure")
    : ctx.action.targetFeatureId
      ? "success"
      : "failure";
  const repairEffects = readRepairEffects(
    repairResult === "success" ? ctx.action.params.success_effects : ctx.action.params.failure_effects,
  );
  const map = applyRepairEffects(ctx, repairEffects);
  const member = {
    ...ctx.member,
    status: repairResult === "success" ? "维修完成，待命中。" : "维修失败，待命中。",
    statusTone: repairResult === "success" ? ("success" as Tone) : ("muted" as Tone),
    activeAction: undefined,
  };
  const logText =
    repairResult === "success"
      ? `${ctx.member.name} 完成维修，目标已恢复。`
      : `${ctx.member.name} 完成维修尝试，但未能修复目标。`;

  return createPatch({
    ...ctx,
    member,
    map,
    logs: appendLogEntry(ctx.logs, logText, repairResult === "success" ? "success" : "muted", ctx.occurredAt),
    triggerContexts: [
      createActionCompleteTrigger(ctx, ctx.object ? [ctx.object] : [], {
        ...(ctx.action.actionDefId ? { action_def_id: ctx.action.actionDefId } : {}),
        repair_result: repairResult,
      }),
    ],
  });
}

function createPatch(args: {
  member: CrewMember;
  resources: ResourceSummary;
  tiles: MapTile[];
  map: GameMapState;
  logs: SystemLog[];
  baseInventory?: InventoryEntry[];
  triggerContexts?: TriggerContext[];
}): ActionSettlementPatch {
  return {
    member: args.member,
    resources: args.resources,
    tiles: args.tiles,
    map: args.map,
    logs: args.logs,
    ...(args.baseInventory ? { baseInventory: args.baseInventory } : {}),
    triggerContexts: args.triggerContexts ?? [],
  };
}

function normalizeSettlementAction(action: CrewActionState): SettlementRuntimeAction {
  return {
    id: action.id,
    actionType: action.type as SettlementRuntimeActionType,
    targetTile: action.target_tile_id ?? action.to_tile_id,
    targetFeatureId: stringParam(action.action_params.target_feature_id),
    actionDefId: stringParam(action.action_params.action_def_id),
    objectId: stringParam(action.action_params.object_id),
    params: action.action_params,
    handler: stringParam(action.action_params.handler),
  };
}

function findTile(tiles: MapTile[], tileId: string | undefined): TileWithContent | undefined {
  if (!tileId) {
    return undefined;
  }

  const tile = tiles.find((item) => item.id === tileId) as TileWithContent | undefined;
  if (tile) {
    return tile;
  }

  const configTile = defaultMapConfig.tiles.find((item) => item.id === tileId);
  if (!configTile) {
    return undefined;
  }

  return {
    id: configTile.id,
    coord: `(${configTile.row},${configTile.col})`,
    row: configTile.row,
    col: configTile.col,
    terrain: configTile.terrain,
    crew: [],
    status: "已发现",
    investigated: false,
  };
}

function getTileObjectsForTile(tile: TileWithContent | undefined, map: GameMapState): MapObjectDefinition[] {
  if (!tile) {
    return [];
  }

  return Array.from(new Set(map.tilesById[tile.id]?.revealedObjectIds ?? []))
    .map((id) => mapObjectDefinitionById.get(id))
    .filter((definition): definition is MapObjectDefinition => Boolean(definition));
}

function getPayloadObjects(ctx: HandlerContext, fallbackObjects: MapObjectDefinition[]) {
  if (ctx.object) {
    return [ctx.object];
  }

  return fallbackObjects;
}

function findFeature(featureId: string): MapFeatureDefinition | undefined {
  return defaultMapConfig.features.find((feature) => feature.id === featureId);
}

function createSurveyedFeatureState(
  ctx: HandlerContext,
  feature: MapFeatureDefinition,
): { state: FeatureRuntimeState; firstInvestigation: boolean } {
  const previousState = getFeatureRuntimeState(ctx.map, feature);
  const previousHistoryKeys = previousState.historyKeys ?? [];
  const revealHistoryKey = getFeatureSurveyRevealHistoryKey(feature.id);
  const firstInvestigation = previousState.investigated !== true && !previousHistoryKeys.includes(revealHistoryKey);
  const nextHistoryKeys = firstInvestigation ? addUnique(previousHistoryKeys, revealHistoryKey) : previousState.historyKeys;
  const state: FeatureRuntimeState = {
    ...previousState,
    id: feature.id,
    revealed: true,
    investigated: true,
    investigatedAt: previousState.investigatedAt ?? ctx.occurredAt,
    lastTriggeredAt: firstInvestigation ? ctx.occurredAt : previousState.lastTriggeredAt,
    ...(nextHistoryKeys ? { historyKeys: nextHistoryKeys } : {}),
  };

  return { state, firstInvestigation };
}

function createFeatureSurveyPayload(
  ctx: HandlerContext,
  feature: MapFeatureDefinition,
  firstInvestigation: boolean,
): Record<string, unknown> {
  const featureTags = feature.tags ?? [];
  return {
    ...(ctx.action.actionDefId ? { action_def_id: ctx.action.actionDefId } : {}),
    feature_id: feature.id,
    feature_kind: feature.kind,
    feature_tags: featureTags,
    feature_first_investigation: firstInvestigation,
    tags: mergeTags(getTileTags(ctx.tile), featureTags),
  };
}

function getFeatureSurveyRevealHistoryKey(featureId: string): string {
  return `survey:${featureId}:revealed`;
}

function createActionCompleteTrigger(
  ctx: HandlerContext,
  objects: MapObjectDefinition[],
  payloadPatch: Record<string, unknown> = {},
): TriggerContext {
  const featureTags = ctx.feature?.tags ?? [];
  return {
    trigger_type: "action_complete",
    occurred_at: ctx.occurredAt,
    source: "crew_action",
    crew_id: ctx.member.id,
    tile_id: ctx.action.targetTile ?? ctx.member.currentTile,
    action_id: ctx.action.id,
    payload: {
      action_type: ctx.action.actionType,
      object_id: ctx.object?.id ?? null,
      ...(ctx.feature
        ? {
            feature_id: ctx.feature.id,
            feature_kind: ctx.feature.kind,
            feature_tags: featureTags,
          }
        : {}),
      tags: mergeTags(getTileTags(ctx.tile), objects.flatMap((object) => object.tags ?? []), featureTags),
      ...payloadPatch,
    },
  };
}

interface RepairSuccessCheck {
  base: number;
  ratio: number;
  bias: number;
  difficulty: number;
  min: number;
  max: number;
}

function applyRepairEffects(ctx: HandlerContext, effects: Effect[]): GameMapState {
  if (effects.length === 0) {
    return ctx.map;
  }

  const result = executeEffects(effects, {
    state: {
      elapsedGameSeconds: ctx.occurredAt,
      crew: {},
      tiles: {},
      inventories: {},
      crew_actions: {},
      active_events: {},
      active_calls: {},
      objectives: {},
      event_logs: [],
      world_history: {},
      world_flags: {},
      rng_state: null,
      map: {
        tilesById: ctx.map.tilesById,
        featuresById: ctx.map.featuresById,
        mapObjects: ctx.map.mapObjects,
      },
    },
    trigger_context: {
      trigger_type: "action_complete",
      occurred_at: ctx.occurredAt,
      source: "crew_action",
      action_id: ctx.action.id,
      crew_id: ctx.member.id,
      tile_id: ctx.action.targetTile ?? ctx.member.currentTile,
    },
  });

  return {
    ...ctx.map,
    tilesById: result.state.map?.tilesById ?? ctx.map.tilesById,
    featuresById: result.state.map?.featuresById ?? ctx.map.featuresById,
    mapObjects: result.state.map?.mapObjects ?? ctx.map.mapObjects,
  };
}

function rollRepairOutcome(check: RepairSuccessCheck, agility: number) {
  const chance = clamp(check.min, check.max, check.base + agility * check.ratio + check.bias - check.difficulty);
  return Math.random() < chance;
}

function readRepairSuccessCheck(value: unknown): RepairSuccessCheck | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const record = value;

  return {
    base: numberParam(record.base),
    ratio: numberParam(record.ratio),
    bias: numberParam(record.bias),
    difficulty: numberParam(record.difficulty),
    min: numberParam(record.min),
    max: numberParam(record.max, 1),
  };
}

function readRepairEffects(value: unknown): Effect[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry, index) => toRepairEffect(entry, index))
    .filter((effect): effect is Effect => Boolean(effect));
}

function toRepairEffect(value: unknown, index: number): Effect | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const status = stringParam(value.status);
  if (!status) {
    return undefined;
  }

  if (value.type === "set_feature_status") {
    const featureId = stringParam(value.feature_id);
    if (!featureId) {
      return undefined;
    }

    return {
      id: `repair_effect_${index}_${featureId}`,
      type: "set_feature_status",
      target: { type: "world_flags" },
      params: { feature_id: featureId, status },
      failure_policy: "fail_event",
      record_policy: { write_event_log: false, write_world_history: false },
    };
  }

  if (value.type === "set_object_status") {
    const objectId = stringParam(value.object_id);
    if (!objectId) {
      return undefined;
    }

    return {
      id: `repair_effect_${index}_${objectId}`,
      type: "set_object_status",
      target: { type: "world_flags" },
      params: { object_id: objectId, status },
      failure_policy: "fail_event",
      record_policy: { write_event_log: false, write_world_history: false },
    };
  }

  return undefined;
}

function clamp(min: number, max: number, value: number) {
  return Math.min(max, Math.max(min, value));
}

function getTileTags(tile: TileWithContent | undefined) {
  return mergeTags(tile?.tags ?? [], tile?.dangerTags ?? []);
}

function getGatherResourceId(action: SettlementRuntimeAction) {
  const yields = readYieldMap(action);
  return yields ? Object.keys(yields)[0] : undefined;
}

function getResourceYield(action: SettlementRuntimeAction, resourceId: string) {
  return readYieldMap(action)?.[resourceId] ?? 0;
}

function readYieldMap(action: SettlementRuntimeAction): Record<string, number> | undefined {
  const value = action.params.perRoundYieldByResource;
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
}

function patchTile(tiles: MapTile[], id: string, patch: Partial<MapTile>) {
  return tiles.map((tile) => (tile.id === id ? { ...tile, ...patch } : tile));
}

function appendLogEntry(logs: SystemLog[], text: string, tone: Tone, elapsedGameSeconds: number) {
  const id = logs.reduce((highest, log) => Math.max(highest, log.id), 0) + 1;
  return [...logs, { id, time: formatGameTime(elapsedGameSeconds), text, tone }];
}

function addUnique<T>(items: T[], ...nextItems: T[]) {
  const result = [...items];
  for (const item of nextItems) {
    if (!result.includes(item)) {
      result.push(item);
    }
  }
  return result;
}

function mergeTags(...groups: Array<Array<string | undefined>>) {
  return addUnique(
    [],
    ...groups.flatMap((group) => group.filter((tag): tag is string => typeof tag === "string" && tag.length > 0)),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberParam(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
