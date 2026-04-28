import { callActionsContent, defaultMapConfig, type CallActionDef, type CallActionId, type MapObjectDefinition, type Tone } from "./content/contentData";
import type { ActiveAction, CrewId, CrewMember, GameMapState, GameState, MapTile, ResourceSummary, SystemLog } from "./data/gameData";
import type { InventoryEntry } from "./inventorySystem";
import { addInventoryItem } from "./inventorySystem";
import { formatGameTime } from "./timeSystem";
import type { TriggerContext } from "./events/types";

type ScheduledActionType = Exclude<CallActionId, "move" | "standby" | "stop">;
type ImmediateActionType = Extract<CallActionId, "standby" | "stop">;
type SettlementActionType = ScheduledActionType | ImmediateActionType;
type SettlementRuntimeActionType = SettlementActionType | ActiveAction["actionType"] | "extract" | "scan" | "stop";

export interface SettlementActiveAction extends Omit<ActiveAction, "actionType"> {
  actionType: SettlementRuntimeActionType;
  objectId?: string;
  params: Record<string, unknown>;
  handler?: string;
  actionDefId?: CallActionId;
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

export interface ApplyActionResult {
  state: GameState;
  patch: ActionSettlementPatch;
  result: string;
  settled: boolean;
}

interface ApplyImmediateOrCreateActionArgs {
  state: GameState;
  crewId: CrewId;
  actionViewId: string;
  occurredAt: number;
}

interface SettleActionArgs {
  member: CrewMember;
  action: ActiveAction | SettlementActiveAction;
  occurredAt: number;
  resources: ResourceSummary;
  baseInventory?: InventoryEntry[];
  tiles: MapTile[];
  map: GameMapState;
  logs: SystemLog[];
}

interface ParsedActionViewId {
  actionId: string;
  objectId?: string;
}

interface HandlerContext {
  member: CrewMember;
  action: SettlementActiveAction;
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
  objects?: MapObjectDefinition[];
};

export const actionHandlers: Partial<Record<string, ActionHandler>> = {
  survey: settleSurvey,
  surveyObject: settleSurvey,
  gather: settleGather,
  build: settleGenericCompletion,
  standby: settleStandby,
  extract: settleGenericCompletion,
  scan: settleGenericCompletion,
  stop: settleStop,
};

export function applyImmediateOrCreateAction({ state, crewId, actionViewId, occurredAt }: ApplyImmediateOrCreateActionArgs): ApplyActionResult {
  const member = state.crew.find((item) => item.id === crewId);
  if (!member) {
    const patch = createFailurePatch(state, undefined, `行动失败：找不到队员 ${crewId}。`, occurredAt);
    return { state: applyPatchToState(state, patch), patch, result: "找不到队员。", settled: false };
  }

  const parsed = parseActionViewId(actionViewId);
  const definition = findActionDefinition(parsed);
  if (!definition) {
    const patch = createFailurePatch(state, member, `行动失败：未知行动 ${actionViewId}。`, occurredAt);
    return { state: applyPatchToState(state, patch), patch, result: "动作未定义。", settled: false };
  }

  const handler = actionHandlers[definition.handler];
  if (!handler) {
    const patch = createFailurePatch(state, member, `行动失败：动作处理器 ${definition.handler} 未注册。`, occurredAt);
    return { state: applyPatchToState(state, patch), patch, result: "动作未实现。", settled: false };
  }

  const tile = findTile(state.tiles, member.currentTile);
  const object = parsed.objectId ? findObjectForAction(tile, definition, parsed.objectId) : undefined;
  if (parsed.objectId && !object) {
    const patch = createFailurePatch(state, member, `行动失败：${actionViewId} 不能用于当前位置对象。`, occurredAt);
    return { state: applyPatchToState(state, patch), patch, result: "动作目标不可用。", settled: false };
  }

  const action = createSettlementAction({
    actionId: definition.id,
    handler: definition.handler,
    objectId: parsed.objectId,
    occurredAt,
    durationSeconds: definition.durationSeconds,
    targetTile: member.currentTile,
    params: definition.params ?? {},
  });

  if (isImmediateAction(action.actionType)) {
    const patch = handler(createHandlerContext({ state, member, action, occurredAt, tile, object }));
    return { state: applyPatchToState(state, patch), patch, result: "动作已结算。", settled: true };
  }

  const nextMember: CrewMember = {
    ...member,
    status: getInProgressStatus(definition.id),
    statusTone: getInProgressTone(definition.id),
    activeAction: action as unknown as ActiveAction,
  };
  const patch = createPatch({
    member: nextMember,
    resources: state.resources,
    tiles: state.tiles,
    map: state.map,
    logs: appendLogEntry(state.logs, `${member.name} 开始执行${definition.label.replace(/\s*\{objectName\}\s*/g, "")}。`, definition.tone, occurredAt),
    baseInventory: state.baseInventory,
  });

  return { state: applyPatchToState(state, patch), patch, result: "动作已开始。", settled: false };
}

export function settleAction(args: SettleActionArgs): ActionSettlementPatch {
  const action = normalizeSettlementAction(args.action);
  const handlerId = action.handler ?? action.actionType;
  const handler = actionHandlers[handlerId];
  const tile = findTile(args.tiles, action.targetTile ?? args.member.currentTile);
  const object = action.objectId ? findObjectById(tile, action.objectId) : undefined;

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

function settleStandby(ctx: HandlerContext): ActionSettlementPatch {
  const member = {
    ...ctx.member,
    status: "待命中。",
    statusTone: "muted" as Tone,
    activeAction: undefined,
  };

  return createPatch({
    ...ctx,
    member,
    logs: appendLogEntry(ctx.logs, `${ctx.member.name} 原地待命。`, "muted", ctx.occurredAt),
    triggerContexts: [
      {
        trigger_type: "idle_time",
        occurred_at: ctx.occurredAt,
        source: "crew_action",
        crew_id: ctx.member.id,
        tile_id: ctx.member.currentTile,
        action_id: "standby",
      },
    ],
  });
}

function settleStop(ctx: HandlerContext): ActionSettlementPatch {
  return createPatch({
    ...ctx,
    member: {
      ...ctx.member,
      status: "行动已停止，待命中。",
      statusTone: "muted",
      activeAction: undefined,
    },
    logs: appendLogEntry(ctx.logs, `${ctx.member.name} 停止当前行动。`, "danger", ctx.occurredAt),
  });
}

function settleSurvey(ctx: HandlerContext): ActionSettlementPatch {
  const tileId = ctx.action.targetTile ?? ctx.member.currentTile;
  const tile = ctx.tile;
  const objects = getTileObjects(tile);
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
  const resourceId = getGatherResourceId(ctx.action, object);
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

function createHandlerContext(args: {
  state: GameState;
  member: CrewMember;
  action: SettlementActiveAction;
  occurredAt: number;
  tile?: TileWithContent;
  object?: MapObjectDefinition;
}): HandlerContext {
  return {
    member: args.member,
    action: args.action,
    occurredAt: args.occurredAt,
    resources: args.state.resources,
    baseInventory: args.state.baseInventory,
    tiles: args.state.tiles,
    map: args.state.map,
    logs: args.state.logs,
    tile: args.tile,
    object: args.object,
  };
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

function createFailurePatch(state: GameState, member: CrewMember | undefined, text: string, occurredAt: number): ActionSettlementPatch {
  return createPatch({
    member: member ?? state.crew[0],
    resources: state.resources,
    tiles: state.tiles,
    map: state.map,
    logs: appendLogEntry(state.logs, text, "danger", occurredAt),
    baseInventory: state.baseInventory,
  });
}

function applyPatchToState(state: GameState, patch: ActionSettlementPatch): GameState {
  return {
    ...state,
    crew: state.crew.map((member) => (member.id === patch.member.id ? patch.member : member)),
    resources: patch.resources,
    tiles: patch.tiles,
    map: patch.map,
    logs: patch.logs,
    baseInventory: patch.baseInventory ?? state.baseInventory,
  };
}

function parseActionViewId(actionViewId: string): ParsedActionViewId {
  const separatorIndex = actionViewId.indexOf(":");
  if (separatorIndex < 0) {
    return { actionId: actionViewId };
  }

  return {
    actionId: actionViewId.slice(0, separatorIndex),
    objectId: actionViewId.slice(separatorIndex + 1),
  };
}

function findActionDefinition({ actionId, objectId }: ParsedActionViewId): CallActionDef | undefined {
  return callActionsContent.find((definition) => definition.id === actionId && definition.category === (objectId ? "object_action" : "universal"));
}

function createSettlementAction(args: {
  actionId: CallActionId;
  handler: string;
  objectId?: string;
  occurredAt: number;
  durationSeconds: number;
  targetTile: string;
  params: Record<string, unknown>;
}): SettlementActiveAction {
  return {
    id: [args.actionId, args.objectId, args.targetTile, args.occurredAt].filter(Boolean).join(":"),
    actionType: normalizeActionType(args.actionId),
    status: "inProgress",
    startTime: args.occurredAt,
    durationSeconds: args.durationSeconds,
    finishTime: args.occurredAt + args.durationSeconds,
    targetTile: args.targetTile,
    objectId: args.objectId,
    params: args.params,
    handler: args.handler,
    actionDefId: args.actionId,
  };
}

function normalizeActionType(actionId: CallActionId): SettlementActionType {
  return actionId === "move" ? "standby" : actionId;
}

function isImmediateAction(actionType: SettlementRuntimeActionType): actionType is ImmediateActionType {
  return actionType === "standby" || actionType === "stop";
}

function normalizeSettlementAction(action: ActiveAction | SettlementActiveAction): SettlementActiveAction {
  const maybeSettlementAction = action as Partial<SettlementActiveAction>;
  return {
    ...action,
    actionType: action.actionType,
    objectId: typeof maybeSettlementAction.objectId === "string" ? maybeSettlementAction.objectId : undefined,
    params: isRecord(maybeSettlementAction.params) ? maybeSettlementAction.params : {},
    handler: typeof maybeSettlementAction.handler === "string" ? maybeSettlementAction.handler : undefined,
    actionDefId: maybeSettlementAction.actionDefId,
  };
}

function getInProgressStatus(actionId: CallActionId) {
  switch (actionId) {
    case "gather":
      return "采集中。";
    case "build":
      return "建设中。";
    case "extract":
      return "回收中。";
    case "scan":
      return "扫描中。";
    case "survey":
    default:
      return "调查中。";
  }
}

function getInProgressTone(actionId: CallActionId): Tone {
  return actionId === "gather" || actionId === "build" || actionId === "extract" ? "accent" : "neutral";
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
    objects: configTile.objects,
  };
}

function findObjectForAction(tile: TileWithContent | undefined, definition: CallActionDef, objectId: string) {
  const object = findObjectById(tile, objectId);
  if (!object || !isMapCandidateAction(definition.id) || !object.candidateActions?.includes(definition.id)) {
    return undefined;
  }

  if (definition.applicableObjectKinds && !definition.applicableObjectKinds.includes(object.kind)) {
    return undefined;
  }

  return object;
}

function findObjectById(tile: TileWithContent | undefined, objectId: string) {
  return getTileObjects(tile).find((object) => object.id === objectId);
}

function getTileObjects(tile: TileWithContent | undefined): MapObjectDefinition[] {
  if (!tile) {
    return [];
  }

  if (tile.objects) {
    return tile.objects;
  }

  return defaultMapConfig.tiles.find((configTile) => configTile.id === tile.id)?.objects ?? [];
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

function getGatherResourceId(action: SettlementActiveAction, object: MapObjectDefinition | undefined) {
  if (object?.legacyResource) {
    return object.legacyResource;
  }

  const yields = readYieldMap(action);
  return yields ? Object.keys(yields)[0] : undefined;
}

function getResourceYield(action: SettlementActiveAction, resourceId: string) {
  return readYieldMap(action)?.[resourceId] ?? 0;
}

function readYieldMap(action: SettlementActiveAction): Record<string, number> | undefined {
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

function isMapCandidateAction(actionId: CallActionId): actionId is Exclude<CallActionId, "stop"> {
  return actionId !== "stop";
}
