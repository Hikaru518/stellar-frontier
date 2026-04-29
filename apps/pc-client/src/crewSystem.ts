import { defaultMapConfig } from "./content/contentData";
import type { ActiveAction, CrewMember, MapTile, SystemLog, Tone } from "./data/gameData";
import type { CrewActionState } from "./events/types";
import { getTileLocationLabel } from "./mapSystem";
import { formatDuration, formatGameTime, getRemainingSeconds } from "./timeSystem";

export interface MoveStepPreview {
  tileId: string;
  coord: string;
  terrain: string;
  durationSeconds: number;
}

export interface MovePreview {
  canMove: boolean;
  reason?: string;
  fromTileId: string;
  targetTileId: string;
  route: string[];
  steps: MoveStepPreview[];
  totalDurationSeconds: number;
  interruptionWarning?: string;
}

interface MovementSettlement {
  member: CrewMember;
  logs: SystemLog[];
  changed: boolean;
}

export function createMovePreview(member: CrewMember, targetTileId: string, tiles: MapTile[]): MovePreview {
  const fromTileId = member.currentTile;
  const targetTile = getTile(tiles, targetTileId);

  if (!targetTile) {
    return blockedPreview(member, targetTileId, "目标地块不存在。");
  }

  if (member.unavailable || !member.canCommunicate) {
    return blockedPreview(member, targetTileId, "信号中断，无法下达指令。");
  }

  if (member.activeAction?.actionType === "move" && member.activeAction.status === "inProgress") {
    return blockedPreview(member, targetTileId, "移动中不能直接改派目标，需要先停止当前行动。");
  }

  if (fromTileId === targetTileId) {
    return blockedPreview(member, targetTileId, "队员已在此处。");
  }

  if (!isTilePassable(targetTile)) {
    return blockedPreview(member, targetTileId, `当前无法前往 ${targetTile.terrain}。`);
  }

  const route = findRoute(tiles, fromTileId, targetTileId);
  if (route.length === 0) {
    return blockedPreview(member, targetTileId, "当前路线不可达。");
  }

  const steps = route.map((tileId) => {
    const tile = getTile(tiles, tileId);
    const durationSeconds = getMoveStepDuration(member, tile);
    return {
      tileId,
      coord: tile?.coord ?? tileId,
      terrain: tile?.terrain ?? "未知地形",
      durationSeconds,
    };
  });

  return {
    canMove: true,
    fromTileId,
    targetTileId,
    route,
    steps,
    totalDurationSeconds: steps.reduce((total, step) => total + step.durationSeconds, 0),
    interruptionWarning: getInterruptionWarning(member),
  };
}

export function startCrewMove(member: CrewMember, preview: MovePreview, tiles: MapTile[], elapsedGameSeconds: number): CrewMember {
  const targetTile = getTile(tiles, preview.targetTileId);
  const firstStep = preview.steps[0];

  if (!preview.canMove || !targetTile || !firstStep) {
    return member;
  }

  const action: ActiveAction = {
    id: `${member.id}-move-${preview.targetTileId}-${elapsedGameSeconds}`,
    actionType: "move",
    status: "inProgress",
    startTime: elapsedGameSeconds,
    durationSeconds: preview.totalDurationSeconds,
    finishTime: elapsedGameSeconds + preview.totalDurationSeconds,
    fromTile: preview.fromTileId,
    targetTile: preview.targetTileId,
    route: preview.route,
    routeStepIndex: 0,
    stepStartedAt: elapsedGameSeconds,
    stepFinishTime: elapsedGameSeconds + firstStep.durationSeconds,
    totalDurationSeconds: preview.totalDurationSeconds,
  };

  return {
    ...member,
    status: `位于 ${member.coord}，正在前往 ${targetTile.coord}，剩余 ${formatDuration(preview.totalDurationSeconds)}。`,
    statusTone: "muted" as Tone,
    activeAction: action,
    hasIncoming: false,
    lastContactTime: elapsedGameSeconds,
  };
}

export function createActiveActionFromCrewAction(member: CrewMember, eventCrewAction: CrewActionState): ActiveAction {
  const startTime = eventCrewAction.started_at ?? 0;
  const durationSeconds = Math.max(0, eventCrewAction.duration_seconds);
  const finishTime = eventCrewAction.ends_at ?? startTime + durationSeconds;
  const targetTile = eventCrewAction.target_tile_id ?? eventCrewAction.to_tile_id ?? member.currentTile;
  const fromTile = eventCrewAction.from_tile_id ?? member.currentTile;
  const actionType = toActiveActionType(eventCrewAction.type);
  const baseAction: ActiveAction = {
    id: eventCrewAction.id,
    actionType,
    status: "inProgress",
    startTime,
    durationSeconds,
    finishTime,
    fromTile,
    targetTile,
    params: eventCrewAction.action_params,
  };

  if (actionType !== "move") {
    return baseAction;
  }

  const route = eventCrewAction.path_tile_ids?.length
    ? eventCrewAction.path_tile_ids
    : targetTile && targetTile !== fromTile
      ? [targetTile]
      : [];
  const stepDuration = route.length > 0 ? durationSeconds / route.length : durationSeconds;

  return {
    ...baseAction,
    route,
    routeStepIndex: 0,
    stepStartedAt: startTime,
    stepFinishTime: startTime + stepDuration,
    totalDurationSeconds: durationSeconds,
  };
}

export function advanceCrewMovement(
  member: CrewMember,
  tiles: MapTile[],
  logs: SystemLog[],
  elapsedGameSeconds: number,
): MovementSettlement {
  const action = member.activeAction;
  if (action?.actionType !== "move" || action.status !== "inProgress" || !action.route || action.routeStepIndex === undefined) {
    return { member, logs, changed: false };
  }

  let nextMember = member;
  let nextLogs = logs;
  let routeStepIndex = action.routeStepIndex;
  let stepStartedAt = action.stepStartedAt ?? action.startTime;
  let stepFinishTime = action.stepFinishTime ?? action.finishTime;
  let changed = false;

  while (routeStepIndex < action.route.length && elapsedGameSeconds >= stepFinishTime) {
    const arrivedTileId = action.route[routeStepIndex];
    const arrivedTile = getTile(tiles, arrivedTileId);
    routeStepIndex += 1;
    changed = true;

    nextMember = updateCrewTile(nextMember, arrivedTileId, arrivedTile);

    if (routeStepIndex >= action.route.length) {
      const targetCoord = arrivedTile?.coord ?? arrivedTileId;
      nextMember = {
        ...nextMember,
        status: `位于 ${targetCoord}，待命中。`,
        statusTone: "neutral" as Tone,
        activeAction: undefined,
      };
      nextLogs = appendMovementLog(nextLogs, `${nextMember.name} 抵达 ${targetCoord}，移动行动完成。`, "neutral", elapsedGameSeconds);
      break;
    }

    const nextTile = getTile(tiles, action.route[routeStepIndex]);
    const nextStepDuration = getMoveStepDuration(nextMember, nextTile);
    stepStartedAt = stepFinishTime;
    stepFinishTime = stepStartedAt + nextStepDuration;
    nextMember = {
      ...nextMember,
      status: `位于 ${nextMember.coord}，正在前往 ${getTargetLabel(action.targetTile, tiles)}，剩余 ${formatDuration(
        getRemainingSeconds(action.finishTime, elapsedGameSeconds),
      )}。`,
      statusTone: "muted" as Tone,
      activeAction: {
        ...action,
        routeStepIndex,
        stepStartedAt,
        stepFinishTime,
      },
    };
  }

  return { member: nextMember, logs: nextLogs, changed };
}

export function hydrateMoveActionRoute(member: CrewMember, tiles: MapTile[], _elapsedGameSeconds: number): CrewMember {
  const action = member.activeAction;
  if (action?.actionType !== "move" || action.status !== "inProgress" || !action.targetTile) {
    return member;
  }

  const route = action.route ?? [];
  const shouldHydrate = route.length === 0 || (route.length === 1 && route[0] === action.targetTile && !isAdjacentTile(member.currentTile, action.targetTile, tiles));
  if (!shouldHydrate) {
    return member;
  }

  const hydratedRoute = findRoute(tiles, member.currentTile, action.targetTile);
  const firstStep = hydratedRoute[0] ? getTile(tiles, hydratedRoute[0]) : undefined;
  if (!hydratedRoute.length || !firstStep) {
    return member;
  }

  const stepStartedAt = action.stepStartedAt ?? action.startTime;
  return {
    ...member,
    activeAction: {
      ...action,
      route: hydratedRoute,
      routeStepIndex: 0,
      stepStartedAt,
      stepFinishTime: stepStartedAt + getMoveStepDuration(member, firstStep),
    },
  };
}

export function syncTileCrew(tiles: MapTile[], crew: CrewMember[]) {
  return tiles.map((tile) => ({
    ...tile,
    crew: crew.filter((member) => member.currentTile === tile.id && !member.unavailable).map((member) => member.id),
  }));
}

export function normalizeCrewMember(member: CrewMember, initialMember: CrewMember): CrewMember {
  const hasCurrentAttributes =
    typeof member.attributes?.physical === "number" &&
    typeof member.attributes?.agility === "number" &&
    typeof member.attributes?.intellect === "number" &&
    typeof member.attributes?.perception === "number" &&
    typeof member.attributes?.luck === "number";

  return {
    ...initialMember,
    ...member,
    attributes: hasCurrentAttributes ? member.attributes : initialMember.attributes,
    profile: member.profile ?? initialMember.profile,
    voiceTone: member.voiceTone ?? initialMember.voiceTone,
    personalityTags: member.personalityTags ?? initialMember.personalityTags,
    expertise: member.expertise ?? initialMember.expertise,
    diaryEntries: member.diaryEntries ?? initialMember.diaryEntries,
    currentTile: member.currentTile ?? initialMember.currentTile,
    canCommunicate: member.canCommunicate ?? !member.unavailable,
    lastContactTime: member.lastContactTime ?? 0,
    emergencyEvent: undefined,
  };
}

export function formatMoveRoute(preview: MovePreview) {
  if (!preview.route.length) {
    return "无可用路线";
  }

  return preview.steps.map((step) => `${step.coord} ${step.terrain}`).join(" -> ");
}

export function getCrewActionTiming(member: CrewMember, elapsedGameSeconds: number) {
  if (member.activeAction?.status !== "inProgress") {
    return "无进行中的计时行动";
  }

  const remaining = getRemainingSeconds(member.activeAction.finishTime, elapsedGameSeconds);
  if (member.activeAction.actionType === "move") {
    return `移动剩余 ${formatDuration(remaining)}`;
  }

  return `行动剩余 ${formatDuration(remaining)}`;
}

function findRoute(tiles: MapTile[], fromTileId: string, targetTileId: string) {
  const start = getTile(tiles, fromTileId);
  const target = getTile(tiles, targetTileId);
  if (!start || !target) {
    return [];
  }

  const tileById = new Map(tiles.map((tile) => [tile.id, tile]));
  const queue = [fromTileId];
  const visited = new Set([fromTileId]);
  const previous = new Map<string, string>();

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) {
      break;
    }

    if (currentId === targetTileId) {
      return buildRoute(previous, fromTileId, targetTileId);
    }

    const current = tileById.get(currentId);
    if (!current) {
      continue;
    }

    for (const neighbor of getOrderedNeighbors(current, target, tiles)) {
      if (visited.has(neighbor.id) || !isTilePassable(neighbor)) {
        continue;
      }
      visited.add(neighbor.id);
      previous.set(neighbor.id, currentId);
      queue.push(neighbor.id);
    }
  }

  return [];
}

function getOrderedNeighbors(current: MapTile, target: MapTile, tiles: MapTile[]) {
  const candidates = tiles.filter((tile) => Math.abs(tile.row - current.row) + Math.abs(tile.col - current.col) === 1);
  return candidates.sort((a, b) => neighborScore(a, current, target) - neighborScore(b, current, target));
}

function neighborScore(tile: MapTile, current: MapTile, target: MapTile) {
  const horizontalTowardTarget = current.col !== target.col && tile.row === current.row && Math.abs(tile.col - target.col) < Math.abs(current.col - target.col);
  const verticalTowardTarget = current.row !== target.row && tile.col === current.col && Math.abs(tile.row - target.row) < Math.abs(current.row - target.row);
  const distance = Math.abs(tile.row - target.row) + Math.abs(tile.col - target.col);
  return (horizontalTowardTarget ? 0 : verticalTowardTarget ? 1 : 2) * 100 + distance;
}

function buildRoute(previous: Map<string, string>, fromTileId: string, targetTileId: string) {
  const route = [targetTileId];
  let cursor = targetTileId;

  while (cursor !== fromTileId) {
    const previousTile = previous.get(cursor);
    if (!previousTile) {
      return [];
    }
    cursor = previousTile;
    if (cursor !== fromTileId) {
      route.push(cursor);
    }
  }

  return route.reverse();
}

function getTerrainMoveCost(tile: MapTile) {
  if (tile.terrain.includes("丘陵")) {
    return 90;
  }
  if (tile.terrain.includes("森林")) {
    return 120;
  }
  if (tile.terrain.includes("山")) {
    return 180;
  }
  if (tile.terrain.includes("沙漠")) {
    return 150;
  }
  return 60;
}

function getMoveStepDuration(member: CrewMember, tile?: MapTile) {
  const baseDuration = tile ? getTerrainMoveCost(tile) : 60;
  return member.conditions.includes("wounded") ? baseDuration * 1.5 : baseDuration;
}

function isTilePassable(tile: MapTile) {
  return !tile.terrain.includes("不可通行");
}

function isAdjacentTile(fromTileId: string, targetTileId: string, tiles: MapTile[]) {
  const fromTile = getTile(tiles, fromTileId);
  const targetTile = getTile(tiles, targetTileId);
  if (!fromTile || !targetTile) {
    return false;
  }

  return Math.abs(fromTile.row - targetTile.row) + Math.abs(fromTile.col - targetTile.col) === 1;
}

function getInterruptionWarning(member: CrewMember) {
  const action = member.activeAction;
  if (action?.status !== "inProgress") {
    return undefined;
  }

  if (action.actionType === "gather") {
    return `${member.name} 正在采集。本次移动会中断当前采集，未完成的一轮不会结算。`;
  }
  if (action.actionType === "build") {
    return `${member.name} 正在建设。本次移动会中断建设，MVP 默认不返还材料。`;
  }
  if (action.actionType === "survey") {
    return `${member.name} 正在调查。本次移动会中断调查。`;
  }

  return undefined;
}

function updateCrewTile(member: CrewMember, tileId: string, tile?: MapTile) {
  return {
    ...member,
    currentTile: tileId,
    coord: tile?.coord ?? member.coord,
    location: getTileLocationLabel(defaultMapConfig, tileId),
  };
}

function getTargetLabel(targetTileId: string | undefined, tiles: MapTile[]) {
  if (!targetTileId) {
    return "未知目标";
  }

  const tile = getTile(tiles, targetTileId);
  return tile?.coord ?? targetTileId;
}

function toActiveActionType(type: CrewActionState["type"]): ActiveAction["actionType"] {
  switch (type) {
    case "move":
    case "survey":
    case "gather":
    case "build":
      return type;
    case "event_waiting":
    case "guarding_event_site":
    case "extract":
    case "return_to_base":
    default:
      return "event";
  }
}

function getTile(tiles: MapTile[], tileId: string) {
  return tiles.find((tile) => tile.id === tileId);
}

function blockedPreview(member: CrewMember, targetTileId: string, reason: string): MovePreview {
  return {
    canMove: false,
    reason,
    fromTileId: member.currentTile,
    targetTileId,
    route: [],
    steps: [],
    totalDurationSeconds: 0,
  };
}

function appendMovementLog(logs: SystemLog[], text: string, tone: Tone, elapsedGameSeconds: number) {
  const id = logs.reduce((highest, log) => Math.max(highest, log.id), 0) + 1;
  return [...logs, { id, time: formatGameTime(elapsedGameSeconds), text, tone }];
}
