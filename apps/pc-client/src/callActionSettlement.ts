import { defaultMapConfig, type Tone } from "./content/contentData";
import { mapObjectDefinitionById, type MapObjectDefinition } from "./content/mapObjects";
import type { CrewMember, GameMapState, MapTile, ResourceSummary, SystemLog } from "./data/gameData";
import type { InventoryEntry } from "./inventorySystem";
import { addInventoryItem } from "./inventorySystem";
import { formatGameTime } from "./timeSystem";
import type { CrewActionState, TriggerContext } from "./events/types";

type SettlementRuntimeActionType = Extract<CrewActionState["type"], "survey" | "gather" | "build" | "extract">;

interface SettlementRuntimeAction {
  id: string;
  actionType: SettlementRuntimeActionType;
  targetTile?: string | null;
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
};

export function settleAction(args: SettleActionArgs): ActionSettlementPatch {
  const action = normalizeSettlementAction(args.action);
  const handlerId = action.handler ?? action.actionType;
  const handler = actionHandlers[handlerId];
  const tile = findTile(args.tiles, action.targetTile ?? args.member.currentTile);
  const object = action.objectId ? mapObjectDefinitionById.get(action.objectId) : undefined;

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
  });
}

function settleSurvey(ctx: HandlerContext): ActionSettlementPatch {
  const tileId = ctx.action.targetTile ?? ctx.member.currentTile;
  const tile = ctx.tile;
  const objects = getTileObjectsForTile(tile);
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
  const member = {
    ...ctx.member,
    status: "行动完成，待命中。",
    statusTone: "neutral" as Tone,
    activeAction: undefined,
  };

  return createPatch({
    ...ctx,
    member,
    logs: appendLogEntry(ctx.logs, `${ctx.member.name} 的行动已完成。`, "neutral", ctx.occurredAt),
    triggerContexts: [createActionCompleteTrigger(ctx, ctx.object ? [ctx.object] : [])],
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
    resources: [],
    buildings: [],
    instruments: [],
    crew: [],
    danger: "未发现即时危险",
    status: "已发现",
    investigated: false,
  };
}

function getTileObjectsForTile(tile: TileWithContent | undefined): MapObjectDefinition[] {
  if (!tile) {
    return [];
  }

  const configTile = defaultMapConfig.tiles.find((configItem) => configItem.id === tile.id);
  if (!configTile) {
    return [];
  }
  return configTile.objectIds
    .map((id) => mapObjectDefinitionById.get(id))
    .filter((definition): definition is MapObjectDefinition => Boolean(definition));
}

function getPayloadObjects(ctx: HandlerContext, fallbackObjects: MapObjectDefinition[]) {
  if (ctx.object) {
    return [ctx.object];
  }

  return fallbackObjects;
}

function createActionCompleteTrigger(ctx: HandlerContext, objects: MapObjectDefinition[]): TriggerContext {
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
      tags: mergeTags(getTileTags(ctx.tile), objects.flatMap((object) => object.tags ?? [])),
    },
  };
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
