import type { ActiveAction, CrewMember, MapTile, SystemLog, Tone } from "./data/gameData";
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

  if (member.emergencyEvent && !member.emergencyEvent.settled) {
    return blockedPreview(member, targetTileId, "需先处理当前紧急事件。");
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
    const durationSeconds = tile ? getTerrainMoveCost(tile) : 60;
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
    summary: `${member.name} 已接收移动请求。抵达后将原地待命。`,
    activeAction: action,
    hasIncoming: false,
    lastContactTime: elapsedGameSeconds,
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
        summary: `${nextMember.name} 抵达 ${targetCoord}，原地待命。`,
        activeAction: undefined,
      };
      nextLogs = appendMovementLog(nextLogs, `${nextMember.name} 抵达 ${targetCoord}，移动行动完成。`, "neutral", elapsedGameSeconds);
      break;
    }

    const nextTile = getTile(tiles, action.route[routeStepIndex]);
    const nextStepDuration = nextTile ? getTerrainMoveCost(nextTile) : 60;
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

export function syncTileCrew(tiles: MapTile[], crew: CrewMember[]) {
  return tiles.map((tile) => ({
    ...tile,
    crew: crew.filter((member) => member.currentTile === tile.id && !member.unavailable).map((member) => member.id),
  }));
}

export function normalizeCrewMember(member: CrewMember, initialMember: CrewMember): CrewMember {
  return {
    ...initialMember,
    ...member,
    currentTile: member.currentTile ?? initialMember.currentTile,
    canCommunicate: member.canCommunicate ?? !member.unavailable,
    lastContactTime: member.lastContactTime ?? 0,
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

function isTilePassable(tile: MapTile) {
  return !tile.terrain.includes("水");
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
    location: tile ? getTileLocation(tile) : member.location,
  };
}

function getTileLocation(tile: MapTile) {
  return tile.resources[0] ?? tile.terrain;
}

function getTargetLabel(targetTileId: string | undefined, tiles: MapTile[]) {
  if (!targetTileId) {
    return "未知目标";
  }

  const tile = getTile(tiles, targetTileId);
  return tile?.coord ?? targetTileId;
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
