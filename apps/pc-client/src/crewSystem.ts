import { defaultMapConfig } from "./content/contentData";
import type { ActiveAction, CrewMember, MapTile, SystemLog, Tone } from "./data/gameData";
import type { CrewActionState, CrewState, RuntimeCall } from "./events/types";
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

export type CrewActionViewStatus = "idle" | "moving" | "acting" | "waiting_call" | "blocked" | "unavailable";

export interface CrewActionViewModel {
  crewId: CrewMember["id"];
  actionStatus: CrewActionViewStatus;
  actionTitle: string;
  statusText: string;
  statusTone: Tone;
  timingText: string;
  progressPercent: number | null;
  canCommunicate: boolean;
  canStartCall: boolean;
  currentActionId?: string;
  activeCallId?: string;
  blockingReason?: string;
  derivedActiveAction?: ActiveAction;
}

export interface CrewActionViewModelInput {
  member: CrewMember;
  runtimeCrew?: CrewState | null;
  crewActions: Record<string, CrewActionState>;
  activeCalls: Record<string, RuntimeCall>;
  elapsedGameSeconds: number;
  tiles?: MapTile[];
}

interface MovementSettlement {
  member: CrewMember;
  logs: SystemLog[];
  changed: boolean;
}

export interface StartedCrewMove {
  member: CrewMember;
  action: CrewActionState;
}

export interface MoveActionSettlement {
  member: CrewMember;
  action: CrewActionState;
  logs: SystemLog[];
  changed: boolean;
  arrived: boolean;
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

export function startCrewMove(member: CrewMember, preview: MovePreview, tiles: MapTile[], elapsedGameSeconds: number): StartedCrewMove {
  const targetTile = getTile(tiles, preview.targetTileId);
  const firstStep = preview.steps[0];

  if (!preview.canMove || !targetTile || !firstStep) {
    return {
      member,
      action: createIdleMoveAction(member, preview, elapsedGameSeconds),
    };
  }

  const action: CrewActionState = {
    id: `${member.id}-move-${preview.targetTileId}-${elapsedGameSeconds}`,
    crew_id: member.id,
    type: "move",
    status: "active",
    source: "player_command",
    parent_event_id: null,
    objective_id: null,
    action_request_id: null,
    from_tile_id: preview.fromTileId,
    to_tile_id: preview.targetTileId,
    target_tile_id: preview.targetTileId,
    path_tile_ids: preview.route,
    started_at: elapsedGameSeconds,
    ends_at: elapsedGameSeconds + preview.totalDurationSeconds,
    progress_seconds: 0,
    duration_seconds: preview.totalDurationSeconds,
    action_params: {
      route_step_index: 0,
      step_started_at: elapsedGameSeconds,
      step_finish_time: elapsedGameSeconds + firstStep.durationSeconds,
      step_durations_seconds: preview.steps.map((step) => step.durationSeconds),
    },
    can_interrupt: true,
    interrupt_duration_seconds: 10,
  };

  return {
    member: {
      ...member,
      status: "待命中。",
      statusTone: "neutral" as Tone,
      activeAction: undefined,
      hasIncoming: false,
      lastContactTime: elapsedGameSeconds,
    },
    action,
  };
}

function createIdleMoveAction(member: CrewMember, preview: MovePreview, elapsedGameSeconds: number): CrewActionState {
  return {
    id: `${member.id}-move-${preview.targetTileId}-${elapsedGameSeconds}`,
    crew_id: member.id,
    type: "move",
    status: "failed",
    source: "player_command",
    parent_event_id: null,
    objective_id: null,
    action_request_id: null,
    from_tile_id: preview.fromTileId,
    to_tile_id: preview.targetTileId,
    target_tile_id: preview.targetTileId,
    path_tile_ids: preview.route,
    started_at: elapsedGameSeconds,
    ends_at: elapsedGameSeconds,
    progress_seconds: 0,
    duration_seconds: 0,
    action_params: {},
    can_interrupt: true,
    interrupt_duration_seconds: 10,
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

export function deriveCrewActionViewModel({
  member,
  runtimeCrew,
  crewActions,
  activeCalls,
  elapsedGameSeconds,
  tiles = [],
}: CrewActionViewModelInput): CrewActionViewModel {
  const activeCall = findActiveRuntimeCall(member.id, activeCalls, elapsedGameSeconds);
  const crewAction = selectCrewActionForView(member, runtimeCrew, crewActions);
  const currentActionId = crewAction?.id ?? runtimeCrew?.current_action_id ?? undefined;
  const blockingReason = getCrewActionBlockingReason(runtimeCrew);
  const communicationBlocked = Boolean(blockingReason) || runtimeCrew?.communication_state === "blocked";
  const canCommunicate = Boolean(activeCall) || (!member.unavailable && member.canCommunicate && !communicationBlocked);

  if (activeCall) {
    return {
      crewId: member.id,
      actionStatus: "waiting_call",
      actionTitle: "等待通讯接入",
      statusText: activeCall.rendered_lines[0]?.text ?? "事件通话等待接入。",
      statusTone: "accent",
      timingText: getRuntimeCallTimingText(activeCall, elapsedGameSeconds),
      progressPercent: null,
      canCommunicate,
      canStartCall: canCommunicate,
      currentActionId,
      activeCallId: activeCall.id,
    };
  }

  if (communicationBlocked) {
    return {
      crewId: member.id,
      actionStatus: "blocked",
      actionTitle: getCrewActionTitle(crewAction, tiles, member),
      statusText: "事件占用主要行动。",
      statusTone: "danger",
      timingText: crewAction ? getCrewActionTimingText(crewAction, elapsedGameSeconds) : "无进行中的计时行动",
      progressPercent: crewAction ? getCrewActionProgressPercent(crewAction, elapsedGameSeconds) : null,
      canCommunicate: false,
      canStartCall: false,
      currentActionId,
      blockingReason: blockingReason ?? "通讯被事件阻塞。",
      derivedActiveAction: crewAction ? createActiveActionFromCrewAction(member, crewAction) : undefined,
    };
  }

  if (crewAction) {
    const derivedActiveAction = createActiveActionFromCrewAction(member, crewAction);
    const actionStatus = crewAction.type === "move" ? "moving" : "acting";
    return {
      crewId: member.id,
      actionStatus,
      actionTitle: getCrewActionTitle(crewAction, tiles, member),
      statusText: getCrewActionStatusText(crewAction, tiles, member),
      statusTone: actionStatus === "moving" ? "muted" : "accent",
      timingText: getCrewActionTimingText(crewAction, elapsedGameSeconds),
      progressPercent: getCrewActionProgressPercent(crewAction, elapsedGameSeconds),
      canCommunicate,
      canStartCall: canCommunicate,
      currentActionId,
      derivedActiveAction,
    };
  }

  if (member.unavailable || !member.canCommunicate || runtimeCrew?.communication_state === "lost_contact") {
    return {
      crewId: member.id,
      actionStatus: "unavailable",
      actionTitle: "信号中断",
      statusText: member.status || "失联。",
      statusTone: "danger",
      timingText: "无进行中的计时行动",
      progressPercent: null,
      canCommunicate: false,
      canStartCall: false,
      currentActionId,
      blockingReason: "信号中断，无法通讯。",
    };
  }

  return {
    crewId: member.id,
    actionStatus: "idle",
    actionTitle: "原地待命",
    statusText: member.status || "待命中。",
    statusTone: member.statusTone,
    timingText: "无进行中的计时行动",
    progressPercent: null,
    canCommunicate: true,
    canStartCall: true,
    currentActionId,
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

export function advanceCrewMoveAction(
  member: CrewMember,
  action: CrewActionState,
  tiles: MapTile[],
  logs: SystemLog[],
  elapsedGameSeconds: number,
): MoveActionSettlement {
  if (action.type !== "move" || action.status !== "active") {
    return { member, action, logs, changed: false, arrived: false };
  }

  let nextMember = member.activeAction?.id === action.id ? { ...member, activeAction: undefined } : member;
  let nextAction = hydrateMoveCrewActionRoute(nextMember, action, tiles);
  let nextLogs = logs;
  const route = nextAction.path_tile_ids ?? [];
  const stepDurations = getMoveActionStepDurations(nextMember, nextAction, tiles);
  let routeStepIndex = readNumberParam(nextAction.action_params.route_step_index) ?? inferRouteStepIndex(nextMember.currentTile, route);
  let stepStartedAt = readNumberParam(nextAction.action_params.step_started_at) ?? nextAction.started_at ?? elapsedGameSeconds;
  let stepFinishTime = readNumberParam(nextAction.action_params.step_finish_time) ?? stepStartedAt + (stepDurations[routeStepIndex] ?? 0);
  let changed = nextMember !== member || nextAction !== action;
  let arrived = false;

  if (
    nextAction.ends_at === null ||
    nextAction.ends_at === undefined ||
    readNumberParam(nextAction.action_params.route_step_index) === undefined ||
    readNumberParam(nextAction.action_params.step_started_at) === undefined ||
    readNumberParam(nextAction.action_params.step_finish_time) === undefined ||
    readNumberArray(nextAction.action_params.step_durations_seconds).length !== route.length
  ) {
    nextAction = {
      ...nextAction,
      ends_at: nextAction.ends_at ?? (nextAction.started_at ?? stepStartedAt) + nextAction.duration_seconds,
      action_params: {
        ...nextAction.action_params,
        route_step_index: routeStepIndex,
        step_started_at: stepStartedAt,
        step_finish_time: stepFinishTime,
        step_durations_seconds: stepDurations,
      },
    };
    changed = true;
  }

  while (routeStepIndex < route.length && elapsedGameSeconds >= stepFinishTime) {
    const arrivedTileId = route[routeStepIndex];
    const arrivedTile = getTile(tiles, arrivedTileId);
    routeStepIndex += 1;
    changed = true;

    nextMember = updateCrewTile(nextMember, arrivedTileId, arrivedTile);

    if (routeStepIndex >= route.length) {
      const targetCoord = arrivedTile?.coord ?? arrivedTileId;
      nextMember = {
        ...nextMember,
        status: `位于 ${targetCoord}，待命中。`,
        statusTone: "neutral" as Tone,
        activeAction: undefined,
      };
      nextAction = {
        ...nextAction,
        status: "completed",
        ends_at: nextAction.ends_at ?? elapsedGameSeconds,
        progress_seconds: nextAction.duration_seconds,
        action_params: {
          ...nextAction.action_params,
          route_step_index: routeStepIndex,
          step_started_at: stepStartedAt,
          step_finish_time: stepFinishTime,
          step_durations_seconds: stepDurations,
        },
      };
      nextLogs = appendMovementLog(nextLogs, `${nextMember.name} 抵达 ${targetCoord}，移动行动完成。`, "neutral", elapsedGameSeconds);
      arrived = true;
      break;
    }

    stepStartedAt = stepFinishTime;
    stepFinishTime = stepStartedAt + (stepDurations[routeStepIndex] ?? getMoveStepDuration(nextMember, getTile(tiles, route[routeStepIndex])));
    nextAction = {
      ...nextAction,
      progress_seconds: Math.min(nextAction.duration_seconds, Math.max(0, elapsedGameSeconds - (nextAction.started_at ?? elapsedGameSeconds))),
      action_params: {
        ...nextAction.action_params,
        route_step_index: routeStepIndex,
        step_started_at: stepStartedAt,
        step_finish_time: stepFinishTime,
        step_durations_seconds: stepDurations,
      },
    };
  }

  return { member: nextMember, action: nextAction, logs: nextLogs, changed, arrived };
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

function hydrateMoveCrewActionRoute(member: CrewMember, action: CrewActionState, tiles: MapTile[]): CrewActionState {
  if (action.type !== "move" || action.status !== "active") {
    return action;
  }

  const targetTileId = action.target_tile_id ?? action.to_tile_id;
  if (!targetTileId) {
    return action;
  }

  const route = action.path_tile_ids ?? [];
  const shouldHydrate = route.length === 0 || (route.length === 1 && route[0] === targetTileId && !isAdjacentTile(member.currentTile, targetTileId, tiles));
  if (!shouldHydrate) {
    return action;
  }

  const hydratedRoute = findRoute(tiles, member.currentTile, targetTileId);
  if (!hydratedRoute.length) {
    return action;
  }

  const stepDurations = hydratedRoute.map((tileId) => getMoveStepDuration(member, getTile(tiles, tileId)));
  const stepStartedAt = readNumberParam(action.action_params.step_started_at) ?? action.started_at ?? 0;
  return {
    ...action,
    path_tile_ids: hydratedRoute,
    duration_seconds: action.duration_seconds || stepDurations.reduce((total, duration) => total + duration, 0),
    ends_at: action.ends_at ?? stepStartedAt + stepDurations.reduce((total, duration) => total + duration, 0),
    action_params: {
      ...action.action_params,
      route_step_index: 0,
      step_started_at: stepStartedAt,
      step_finish_time: stepStartedAt + (stepDurations[0] ?? 0),
      step_durations_seconds: stepDurations,
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

function getMoveActionStepDurations(member: CrewMember, action: CrewActionState, tiles: MapTile[]) {
  const route = action.path_tile_ids ?? [];
  const configured = readNumberArray(action.action_params.step_durations_seconds);
  if (configured.length === route.length) {
    return configured;
  }

  if (route.length > 0 && action.duration_seconds > 0 && action.source === "event_action_request") {
    const perStepDuration = action.duration_seconds / route.length;
    return route.map(() => perStepDuration);
  }

  return route.map((tileId) => getMoveStepDuration(member, getTile(tiles, tileId)));
}

function inferRouteStepIndex(currentTileId: string, route: string[]) {
  const currentIndex = route.indexOf(currentTileId);
  return currentIndex >= 0 ? currentIndex + 1 : 0;
}

function readNumberParam(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
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
    case "standby":
    case "stop":
      return "standby";
    case "event_waiting":
    case "guarding_event_site":
    case "extract":
    case "return_to_base":
    default:
      return "event";
  }
}

function selectCrewActionForView(
  member: CrewMember,
  runtimeCrew: CrewState | null | undefined,
  crewActions: Record<string, CrewActionState>,
) {
  if (runtimeCrew?.current_action_id) {
    return crewActions[runtimeCrew.current_action_id];
  }

  return Object.values(crewActions)
    .filter((action) => action.crew_id === member.id && isDisplayableCrewAction(action))
    .sort(compareCrewActionForView)[0];
}

function isDisplayableCrewAction(action: CrewActionState) {
  return action.status === "queued" || action.status === "active" || action.status === "paused";
}

function compareCrewActionForView(left: CrewActionState, right: CrewActionState) {
  const statusScore = crewActionStatusScore(right) - crewActionStatusScore(left);
  if (statusScore !== 0) {
    return statusScore;
  }

  const leftStartedAt = left.started_at ?? 0;
  const rightStartedAt = right.started_at ?? 0;
  return rightStartedAt === leftStartedAt ? right.id.localeCompare(left.id) : rightStartedAt - leftStartedAt;
}

function crewActionStatusScore(action: CrewActionState) {
  if (action.status === "active") {
    return 3;
  }
  if (action.status === "paused") {
    return 2;
  }
  if (action.status === "queued") {
    return 1;
  }
  return 0;
}

function findActiveRuntimeCall(crewId: CrewMember["id"], activeCalls: Record<string, RuntimeCall>, elapsedGameSeconds: number) {
  return Object.values(activeCalls)
    .filter((call) => call.crew_id === crewId && isRuntimeCallActiveForView(call, elapsedGameSeconds))
    .sort((left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id))[0];
}

function isRuntimeCallActiveForView(call: RuntimeCall, elapsedGameSeconds: number) {
  return (
    (call.status === "incoming" || call.status === "connected" || call.status === "awaiting_choice") &&
    (typeof call.expires_at !== "number" || call.expires_at > elapsedGameSeconds)
  );
}

function getCrewActionBlockingReason(runtimeCrew: CrewState | null | undefined) {
  if (runtimeCrew?.blocking_event_id) {
    return `事件 ${runtimeCrew.blocking_event_id} 占用主要行动。`;
  }
  if (runtimeCrew?.blocking_call_id) {
    return `通话 ${runtimeCrew.blocking_call_id} 占用通讯。`;
  }
  if (runtimeCrew?.communication_state === "blocked") {
    return "通讯被事件阻塞。";
  }
  return undefined;
}

function getCrewActionTitle(action: CrewActionState | undefined, tiles: MapTile[], member: CrewMember) {
  if (!action) {
    return "事件行动锁定";
  }

  const targetLabel = getCrewActionTargetLabel(action, tiles, member);
  switch (action.type) {
    case "move":
      return `移动至 ${targetLabel}`;
    case "survey":
      return "调查当前区域";
    case "gather":
      return "采集资源";
    case "build":
      return "建设 / 安装";
    case "standby":
      return "原地待命";
    case "stop":
      return "停止当前行动";
    case "extract":
      return "撤离";
    case "return_to_base":
      return "返回基地";
    case "event_waiting":
      return "等待事件处理";
    case "guarding_event_site":
      return "事件行动锁定";
    default:
      return "行动进行中";
  }
}

function getCrewActionStatusText(action: CrewActionState, tiles: MapTile[], member: CrewMember) {
  const targetLabel = getCrewActionTargetLabel(action, tiles, member);
  switch (action.type) {
    case "move":
      return `正在前往 ${targetLabel}。`;
    case "survey":
      return `正在调查 ${targetLabel}。`;
    case "gather":
      return `正在采集 ${targetLabel} 的资源。`;
    case "build":
      return `正在处理 ${targetLabel} 的建设任务。`;
    case "standby":
      return "正在原地待命。";
    case "stop":
      return "正在停止当前行动。";
    case "extract":
      return "正在撤离。";
    case "return_to_base":
      return "正在返回基地。";
    case "event_waiting":
    case "guarding_event_site":
      return "事件占用主要行动。";
    default:
      return "行动进行中。";
  }
}

function getCrewActionTargetLabel(action: CrewActionState, tiles: MapTile[], member: CrewMember) {
  const targetTileId = action.target_tile_id ?? action.to_tile_id ?? action.from_tile_id ?? member.currentTile;
  const tile = targetTileId ? getTile(tiles, targetTileId) : undefined;
  return tile?.coord ?? targetTileId ?? member.coord;
}

function getCrewActionTimingText(action: CrewActionState, elapsedGameSeconds: number) {
  const remaining = getCrewActionRemainingSeconds(action, elapsedGameSeconds);
  const label = action.type === "move" ? "移动剩余" : "行动剩余";
  return `${label} ${formatDuration(remaining)}`;
}

function getRuntimeCallTimingText(call: RuntimeCall, elapsedGameSeconds: number) {
  if (typeof call.expires_at === "number") {
    return `事件通话剩余 ${formatDuration(getRemainingSeconds(call.expires_at, elapsedGameSeconds))}`;
  }

  return "事件通话没有强制倒计时。";
}

function getCrewActionRemainingSeconds(action: CrewActionState, elapsedGameSeconds: number) {
  const finishTime = action.ends_at ?? (action.started_at ?? 0) + action.duration_seconds;
  return getRemainingSeconds(finishTime, elapsedGameSeconds);
}

function getCrewActionProgressPercent(action: CrewActionState, elapsedGameSeconds: number) {
  if (action.duration_seconds <= 0) {
    return null;
  }

  const elapsed = Math.max(0, action.progress_seconds || elapsedGameSeconds - (action.started_at ?? elapsedGameSeconds));
  return Math.min(100, Math.max(0, Math.round((elapsed / action.duration_seconds) * 100)));
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
