import { useEffect, useMemo, useState } from "react";
import { CallPage } from "./pages/CallPage";
import { CommunicationStation } from "./pages/CommunicationStation";
import { ControlCenter } from "./pages/ControlCenter";
import { DebugToolbox, type TimeMultiplier } from "./pages/DebugToolbox";
import { MapPage } from "./pages/MapPage";
import { applyImmediateOrCreateAction, settleAction, type ActionSettlementPatch, type SettlementActiveAction } from "./callActionSettlement";
import { advanceCrewMovement, createActiveActionFromCrewAction, createMovePreview, normalizeCrewMember, startCrewMove, syncTileCrew } from "./crewSystem";
import { appendDiaryEntry } from "./diarySystem";
import { eventContentLibrary, type MapCandidateAction, type MapObjectDefinition } from "./content/contentData";
import { buildEventContentIndex } from "./events/contentIndex";
import { completeObjective, processEventWakeups, processTrigger, selectCallOption } from "./events/eventEngine";
import type { GraphRunnerGameState } from "./events/graphRunner";
import {
  createEmptyEventRuntimeState,
  type CrewState,
  type CrewActionState,
  type EventRuntimeState,
  type Id,
  type InventoryState,
  type RuntimeCall,
  type TileState,
  type TriggerContext,
} from "./events/types";
import { defaultMapConfig } from "./content/contentData";
import { canMoveToTile, deriveLegacyTiles, getTileLocationLabel, getVisibleTileWindow } from "./mapSystem";
import {
  createBaseInventoryFromResources,
  createInitialMapState,
  initialCrew,
  initialLogs,
  resources as initialResources,
  type ActiveAction,
  type CallContext,
  type CrewId,
  type GameState,
  type CrewMember,
  type GameMapState,
  type MapReturnTarget,
  type MapTile,
  type PageId,
  type ResourceSummary,
  type SystemLog,
  type Tone,
} from "./data/gameData";
import { clearGameSaves, formatDuration, formatGameTime, loadGameSave, saveGameState } from "./timeSystem";
import { GAME_SAVE_SCHEMA_VERSION, isCompatibleGameSaveState } from "./timeSystem";

const eventContentIndexResult = buildEventContentIndex(eventContentLibrary);
if (eventContentIndexResult.errors.length > 0) {
  throw new Error(`Event content index failed: ${eventContentIndexResult.errors.map((error) => error.message).join("; ")}`);
}
const eventContentIndex = eventContentIndexResult.index;

type SavedCrewMember = Partial<CrewMember> & { id: CrewId; bag?: unknown };

type SavedGameState = Partial<Omit<GameState, "crew">> & {
  crew?: SavedCrewMember[];
};

function App() {
  const initialState = useMemo(createInitialGameState, []);
  const [gameState, setGameState] = useState<GameState>(initialState);
  const [page, setPage] = useState<PageId>("control");
  const [currentCall, setCurrentCall] = useState<CallContext | null>(null);
  const [mapReturnTarget, setMapReturnTarget] = useState<MapReturnTarget>("control");
  const [timeMultiplier, setTimeMultiplier] = useState<TimeMultiplier>(1);
  const [debugOpen, setDebugOpen] = useState(false);

  const { elapsedGameSeconds, crew, map, tiles, logs, resources } = gameState;
  const gameTimeLabel = formatGameTime(elapsedGameSeconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGameState((state) => settleGameTime({ ...state, elapsedGameSeconds: state.elapsedGameSeconds + timeMultiplier }));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [timeMultiplier]);

  useEffect(() => {
    saveGameState(gameState);
  }, [gameState]);

  function appendLog(text: string, tone: Tone = "neutral") {
    setGameState((state) => ({
      ...state,
      logs: appendLogEntry(state.logs, text, tone, state.elapsedGameSeconds),
    }));
  }

  function openStation() {
    setPage("station");
  }

  function openMap(returnTarget: MapReturnTarget) {
    setMapReturnTarget(returnTarget);
    setPage("map");
  }

  function returnFromMap() {
    setPage(mapReturnTarget === "call" && currentCall ? "call" : "control");
  }

  function resetGame() {
    clearGameSaves();
    const freshState = createInitialGameState();
    setGameState(freshState);
    setCurrentCall(null);
    setMapReturnTarget("control");
    setPage("control");
    setDebugOpen(false);
  }

  function startCall(crewId: CrewId) {
    const member = crew.find((item) => item.id === crewId);
    if (!member || member.unavailable) {
      appendLog("通讯台尝试接入失败。信号像一条拒绝工作的蛇。", "muted");
      return;
    }

    const runtimeCall = findRuntimeCallForCrew(gameState, crewId);
    const type = "normal";
    setCurrentCall({ crewId, type, settled: false, runtimeCallId: runtimeCall?.id });
    setGameState((state) => ({
      ...state,
      crew: state.crew.map((item) => (item.id === crewId ? { ...item, hasIncoming: false } : item)),
      logs: appendLogEntry(
        state.logs,
        `${member.name} 的普通通话已接通。`,
        "neutral",
        state.elapsedGameSeconds,
      ),
    }));
    setPage("call");
  }

  function endCall() {
    if (currentCall && !currentCall.settled) {
      appendLog("通话尚未下达指令，通讯台将其标记为待决策。", "accent");
    }

    setPage("station");
  }

  function handleDecision(actionId: string) {
    if (!currentCall) {
      return;
    }

    if (actionId === "move") {
      setCurrentCall((call) =>
        call
          ? {
              ...call,
              selectingMoveTarget: true,
              selectedTargetTileId: undefined,
              result: "请在地图中标记候选目的地。移动指令仍需回到通话中确认。",
            }
          : call,
      );
      appendLog("通话进入目的地选择模式。地图只记录候选坐标，不直接下达移动指令。", "accent");
      return;
    }

    if (currentCall.settled) {
      return;
    }

    if (currentCall.runtimeCallId) {
      setGameState((state) =>
        mergeEventRuntimeState(
          state,
          selectCallOption({
            state: toEventEngineState(state),
            index: eventContentIndex,
            call_id: currentCall.runtimeCallId!,
            option_id: actionId,
            occurred_at: state.elapsedGameSeconds,
          }).state,
        ),
      );
      setCurrentCall((call) => (call ? { ...call, settled: true, result: "事件选项已提交。" } : call));
      return;
    }

    setGameState((state) => {
      const actionViewId = resolveActionViewIdForCurrentTile(state, currentCall.crewId, actionId);
      const applied = applyImmediateOrCreateAction({
        state,
        crewId: currentCall.crewId,
        actionViewId,
        occurredAt: state.elapsedGameSeconds,
      });
      const settledState = settleGameTime(applied.state);

      return applied.patch.triggerContexts.reduce(processAppEventTrigger, settledState);
    });

    setCurrentCall((call) =>
      call
        ? {
            ...call,
            settled: true,
            result: "行动指令已提交。",
          }
        : call,
    );
  }

  function selectMoveTarget(tileId: string) {
    const targetLabel = getMoveTargetSelectionLabel(gameState.map, tileId);
    setCurrentCall((call) =>
      call?.selectingMoveTarget
        ? {
            ...call,
            selectedTargetTileId: tileId,
            result: `已标记候选目的地 ${targetLabel}。返回通话后确认是否下达移动指令。`,
          }
        : call,
    );
    setPage("call");
  }

  function clearMoveTarget() {
    setCurrentCall((call) =>
      call
        ? {
            ...call,
            selectedTargetTileId: undefined,
            result: "候选目的地已清除。地图仍然愿意假装自己是可靠的。",
          }
        : call,
    );
  }

  function confirmMove() {
    if (!currentCall?.selectedTargetTileId) {
      appendLog("移动确认失败：没有候选目的地。", "muted");
      return;
    }

    setGameState((state) => {
      const member = state.crew.find((item) => item.id === currentCall.crewId);
      if (!member) {
        return state;
      }

      const targetTileId = currentCall.selectedTargetTileId!;
      if (!canMoveToTile(defaultMapConfig, state.map, targetTileId)) {
        return {
          ...state,
          logs: appendLogEntry(state.logs, "移动确认失败：目标不在当前已发现或 frontier 信号范围内。", "danger", state.elapsedGameSeconds),
        };
      }

      const preview = createMovePreview(member, targetTileId, state.tiles);
      if (!preview.canMove) {
        return {
          ...state,
          logs: appendLogEntry(state.logs, `移动确认失败：${preview.reason ?? "目标不可达。"}`, "danger", state.elapsedGameSeconds),
        };
      }

      const targetTile = state.tiles.find((tile) => tile.id === preview.targetTileId);
      const updatedCrew = state.crew.map((item) =>
        item.id === currentCall.crewId ? startCrewMove(item, preview, state.tiles, state.elapsedGameSeconds) : item,
      );

      const nextMap = syncMapCrew(state.map, updatedCrew);
      return {
        ...state,
        crew: updatedCrew,
        map: nextMap,
        tiles: syncTileCrew(deriveLegacyTiles(defaultMapConfig, nextMap), updatedCrew),
        logs: appendLogEntry(
          state.logs,
          `${member.name} 开始前往 ${targetTile?.coord ?? preview.targetTileId}，预计 ${formatDuration(preview.totalDurationSeconds)}。`,
          "accent",
          state.elapsedGameSeconds,
        ),
      };
    });

    setCurrentCall((call) =>
      call
        ? {
            ...call,
            settled: true,
            selectingMoveTarget: false,
            result: "移动请求已确认。队员开始按路线逐格推进，抵达后会原地待命。",
          }
        : call,
    );
  }

  if (page === "station") {
    return (
      <CommunicationStation
        crew={crew}
        activeCalls={gameState.active_calls}
        objectives={gameState.objectives}
        eventLogs={gameState.event_logs}
        elapsedGameSeconds={elapsedGameSeconds}
        gameTimeLabel={gameTimeLabel}
        onBack={() => setPage("control")}
        onStartCall={startCall}
      />
    );
  }

  if (page === "call") {
    return (
        <CallPage
          call={currentCall}
          crew={crew}
          tiles={tiles}
          map={map}
          activeCalls={gameState.active_calls}
          elapsedGameSeconds={elapsedGameSeconds}
          gameTimeLabel={gameTimeLabel}
          onDecision={handleDecision}
          onConfirmMove={confirmMove}
          onClearMoveTarget={clearMoveTarget}
          onSelectMoveTarget={selectMoveTarget}
          onOpenMap={() => openMap("call")}
          onEndCall={endCall}
          onOpenStation={() => setPage("station")}
      />
    );
  }

  if (page === "map") {
    return (
        <MapPage
          tiles={tiles}
          map={map}
          crew={crew}
          eventLogs={gameState.event_logs}
          elapsedGameSeconds={elapsedGameSeconds}
          gameTimeLabel={gameTimeLabel}
          returnTarget={mapReturnTarget}
          moveSelectionCrewId={currentCall?.selectingMoveTarget ? currentCall.crewId : null}
          selectedMoveTargetId={currentCall?.selectedTargetTileId}
          onSelectMoveTarget={selectMoveTarget}
          onReturn={returnFromMap}
        />
    );
  }

  return (
    <>
      <ControlCenter
        crew={crew}
        logs={logs}
        eventLogs={gameState.event_logs}
        objectives={gameState.objectives}
        resources={resources}
        gameTimeLabel={gameTimeLabel}
        onOpenStation={openStation}
        onOpenMap={() => openMap("control")}
        onOpenDebug={() => setDebugOpen(true)}
        onAppendLog={appendLog}
        map={map}
      />
      {debugOpen ? (
        <DebugToolbox
          timeMultiplier={timeMultiplier}
          onSetTimeMultiplier={setTimeMultiplier}
          onResetGame={resetGame}
          onClose={() => setDebugOpen(false)}
        />
      ) : null}
    </>
  );
}

export default App;

function createInitialGameState(): GameState {
  const saved = loadGameSave<SavedGameState>(isCompatibleGameSaveState);
  const now = new Date().toISOString();
  const emptyEventState = createEmptyEventRuntimeState();

  if (saved && Number.isFinite(saved.elapsedGameSeconds) && saved.crew && saved.map && saved.logs && saved.resources) {
    const normalizedCrew = saved.crew.map((member) => {
      const initialMember = initialCrew.find((item) => item.id === member.id) ?? member;
      const { bag: _deprecatedBag, ...memberWithoutBag } = member;
      const normalizedMember = normalizeCrewMember(memberWithoutBag as CrewMember, initialMember as CrewMember);

      return {
        ...normalizedMember,
        inventory: Array.isArray(member.inventory) ? member.inventory : (initialMember as CrewMember).inventory,
      };
    });
    const savedCrewIds = new Set(normalizedCrew.map((member) => member.id));
    const crewWithNewDefaults = [...normalizedCrew, ...initialCrew.filter((member) => !savedCrewIds.has(member.id))];
    const map = normalizeSavedMap(saved.map);
    const syncedMap = syncMapCrew(map, crewWithNewDefaults);
    return {
      ...saved,
      schema_version: GAME_SAVE_SCHEMA_VERSION,
      created_at_real_time: saved.created_at_real_time ?? now,
      updated_at_real_time: now,
      crew: crewWithNewDefaults,
      baseInventory: Array.isArray(saved.baseInventory)
        ? saved.baseInventory
        : createBaseInventoryFromResources(saved.resources),
      map: syncedMap,
      tiles: syncTileCrew(deriveLegacyTiles(defaultMapConfig, syncedMap), crewWithNewDefaults),
      eventHistory: saved.eventHistory ?? {},
      active_events: saved.active_events ?? emptyEventState.active_events,
      active_calls: saved.active_calls ?? emptyEventState.active_calls,
      objectives: saved.objectives ?? emptyEventState.objectives,
      event_logs: saved.event_logs ?? emptyEventState.event_logs,
      world_history: saved.world_history ?? emptyEventState.world_history,
      world_flags: saved.world_flags ?? emptyEventState.world_flags,
      crew_actions: saved.crew_actions ?? emptyEventState.crew_actions,
      inventories: saved.inventories ?? emptyEventState.inventories,
      rng_state: saved.rng_state ?? emptyEventState.rng_state,
    } as GameState;
  }

  const map = syncMapCrew(createInitialMapState(), initialCrew);
  const state = {
    schema_version: GAME_SAVE_SCHEMA_VERSION,
    created_at_real_time: now,
    updated_at_real_time: now,
    elapsedGameSeconds: 0,
    crew: initialCrew,
    baseInventory: createBaseInventoryFromResources(initialResources),
    map,
    tiles: deriveLegacyTiles(defaultMapConfig, map),
    logs: initialLogs,
    resources: initialResources,
    eventHistory: {},
    ...emptyEventState,
  };

  return { ...state, tiles: syncTileCrew(state.tiles, state.crew) };
}

function getMoveTargetSelectionLabel(map: GameMapState, tileId: string) {
  const cell = getVisibleTileWindow(defaultMapConfig, map).cells.find((item) => item.id === tileId);
  if (cell?.status === "frontier") {
    return `未探索信号（${cell.displayX},${cell.displayY}）`;
  }

  return getTileLocationLabel(defaultMapConfig, tileId);
}

function settleGameTime(state: GameState): GameState {
  let changed = false;
  let resources = state.resources;
  let map = state.map;
  let tiles = state.tiles;
  let logs = state.logs;
  let baseInventory = state.baseInventory;
  const triggerContexts: TriggerContext[] = [];

  const crew = state.crew.map((member) => {
    let nextMember = member;

    if (member.activeAction?.actionType === "move" && member.activeAction.route) {
      const settled = advanceCrewMovement(member, tiles, logs, state.elapsedGameSeconds);
      nextMember = settled.member;
      logs = settled.logs;
      changed = changed || settled.changed;

      if (settled.changed && member.activeAction && !nextMember.activeAction) {
        map = discoverMapTile(map, nextMember.currentTile);
        tiles = syncTileCrew(deriveLegacyTiles(defaultMapConfig, map), state.crew.map((crewMember) => (crewMember.id === nextMember.id ? nextMember : crewMember)));
        nextMember = appendArrivalDiary(nextMember, state.elapsedGameSeconds);
        triggerContexts.push({
          trigger_type: "arrival",
          occurred_at: state.elapsedGameSeconds,
          source: "crew_action",
          crew_id: nextMember.id,
          tile_id: nextMember.currentTile,
          action_id: member.activeAction.id,
          payload: {
            action_type: "move",
            from_tile_id: member.activeAction.fromTile ?? null,
            target_tile_id: member.activeAction.targetTile ?? null,
          },
        });
      }
    } else if (member.activeAction?.status === "inProgress" && state.elapsedGameSeconds >= member.activeAction.finishTime) {
      const settled = settleCrewAction(member, state.elapsedGameSeconds, resources, baseInventory, tiles, logs, map);
      nextMember = settled.member;
      resources = settled.resources;
      tiles = settled.tiles;
      logs = settled.logs;
      map = settled.map;
      baseInventory = settled.baseInventory ?? baseInventory;
      triggerContexts.push(...settled.triggerContexts);
      changed = true;
    }

    return nextMember;
  });

  const syncedMap = syncMapCrew(map, crew);
  let nextState = changed ? { ...state, crew, resources, baseInventory, map: syncedMap, tiles: syncTileCrew(tiles, crew), logs } : state;
  nextState = processObjectiveCompletions(nextState, triggerContexts);

  for (const context of triggerContexts) {
    nextState = processAppEventTrigger(nextState, context);
  }

  return processAppEventWakeups(nextState);
}

function settleCrewAction(
  member: CrewMember,
  elapsedGameSeconds: number,
  resources: ResourceSummary,
  baseInventory: GameState["baseInventory"],
  tiles: MapTile[],
  logs: SystemLog[],
  map: GameMapState,
): ActionSettlementPatch {
  const action = member.activeAction;
  if (!action) {
    return { member, resources, baseInventory, tiles, logs, map, triggerContexts: [] };
  }

  return settleAction({
    member,
    action: enrichActionForSettlement(member, action),
    occurredAt: elapsedGameSeconds,
    resources,
    baseInventory,
    tiles,
    map,
    logs,
  });
}

function resolveActionViewIdForCurrentTile(state: GameState, crewId: CrewId, actionId: string) {
  if (actionId.includes(":") || actionId === "survey" || actionId === "standby" || actionId === "stop") {
    return actionId;
  }

  const member = state.crew.find((item) => item.id === crewId);
  const actionObject = member ? findCandidateObject(member.currentTile, actionId, state.map) : undefined;

  return actionObject ? `${actionId}:${actionObject.id}` : actionId;
}

function enrichActionForSettlement(member: CrewMember, action: ActiveAction): ActiveAction | SettlementActiveAction {
  if (hasSettlementMetadata(action)) {
    return action;
  }

  if (isObjectCandidateAction(action.actionType)) {
    const object = findCandidateObject(action.targetTile ?? member.currentTile, action.actionType);
    return {
      ...action,
      objectId: object?.id,
      params: {
        ...createLegacyYieldParams(action, object),
        ...action.params,
      },
      handler: action.actionType,
      actionDefId: action.actionType,
    };
  }

  if (action.actionType === "survey" || action.actionType === "standby") {
    return {
      ...action,
      params: action.params ?? {},
      handler: action.actionType,
      actionDefId: action.actionType,
    };
  }

  return action;
}

function hasSettlementMetadata(action: ActiveAction): action is ActiveAction & SettlementActiveAction {
  return "handler" in action && typeof action.handler === "string";
}

function isObjectCandidateAction(actionType: ActiveAction["actionType"]): actionType is Extract<MapCandidateAction, "gather" | "build"> {
  return actionType === "gather" || actionType === "build";
}

function findCandidateObject(tileId: string, actionId: string, map?: GameMapState): MapObjectDefinition | undefined {
  const configTile = defaultMapConfig.tiles.find((tile) => tile.id === tileId);
  return configTile?.objects.find((object) => object.candidateActions?.includes(actionId as MapCandidateAction) && isObjectVisible(tileId, object, map));
}

function isObjectVisible(tileId: string, object: MapObjectDefinition, map?: GameMapState) {
  if (!map) {
    return true;
  }

  const runtimeTile = map.tilesById[tileId];
  return (
    object.visibility === "onDiscovered" ||
    runtimeTile?.revealedObjectIds?.includes(object.id) ||
    (object.visibility === "onInvestigated" && runtimeTile?.investigated)
  );
}

function createLegacyYieldParams(action: ActiveAction, object: MapObjectDefinition | undefined) {
  const resourceId = action.resource ?? object?.legacyResource;
  if (action.actionType !== "gather" || !resourceId) {
    return {};
  }

  return {
    perRoundYieldByResource: {
      [resourceId]: action.perRoundYield ?? 1,
    },
  };
}

function processAppEventTrigger(state: GameState, context: TriggerContext): GameState {
  const result = processTrigger({
    state: toEventEngineState(state),
    index: eventContentIndex,
    context,
  });

  return mergeEventRuntimeState(state, result.state);
}

function processAppEventWakeups(state: GameState): GameState {
  const result = processEventWakeups({
    state: toEventEngineState(state),
    index: eventContentIndex,
    elapsed_game_seconds: state.elapsedGameSeconds,
  });

  return mergeEventRuntimeState(state, result.state);
}

function processObjectiveCompletions(state: GameState, contexts: TriggerContext[]): GameState {
  let nextState = state;

  for (const context of contexts) {
    if (context.trigger_type !== "action_complete" || !context.action_id) {
      continue;
    }

    const objective = Object.values(nextState.objectives).find(
      (item) => item.action_id === context.action_id && (item.status === "assigned" || item.status === "in_progress"),
    );
    if (!objective) {
      continue;
    }

    const completed = completeObjective({
      state: toEventEngineState(nextState),
      index: eventContentIndex,
      objective_id: objective.id,
      occurred_at: context.occurred_at,
      result_key: "action_completed",
    });
    nextState = mergeEventRuntimeState(nextState, completed.state);
  }

  return nextState;
}

function findRuntimeCallForCrew(state: GameState, crewId: CrewId): RuntimeCall | undefined {
  return Object.values(state.active_calls).find(
    (call) =>
      call.crew_id === crewId &&
      (call.status === "incoming" || call.status === "connected" || call.status === "awaiting_choice") &&
      (typeof call.expires_at !== "number" || call.expires_at > state.elapsedGameSeconds),
  );
}

function toEventEngineState(state: GameState): GraphRunnerGameState {
  return {
    ...state,
    elapsed_game_seconds: state.elapsedGameSeconds,
    crew: Object.fromEntries(state.crew.map((member) => [member.id, toCrewState(member)])),
    tiles: Object.fromEntries(state.tiles.map((tile) => [tile.id, toTileState(tile)])),
    resources: numericResources(state.resources),
    inventories: {
      ...toInventoryStates(state),
      ...state.inventories,
    },
  };
}

function mergeEventRuntimeState(state: GameState, eventState: GraphRunnerGameState): GameState {
  const views = syncEventRuntimeToViews(state, eventState);
  const bridged = bridgeCrewActions({ ...state, crew: views.crew }, eventState);

  return {
    ...state,
    crew: bridged.crew,
    tiles: views.tiles,
    logs: bridged.logs,
    active_events: eventState.active_events,
    active_calls: eventState.active_calls,
    objectives: eventState.objectives,
    event_logs: eventState.event_logs,
    world_history: eventState.world_history,
    world_flags: eventState.world_flags,
    crew_actions: eventState.crew_actions,
    inventories: eventState.inventories,
    rng_state: eventState.rng_state,
  };
}

function bridgeCrewActions(state: GameState, eventState: GraphRunnerGameState): { crew: CrewMember[]; logs: SystemLog[] } {
  const actionByCrew = collectBridgeableCrewActions(eventState.crew_actions);
  let logs = state.logs;

  const crew = state.crew.map((member) => {
    const eventAction = actionByCrew.get(member.id);
    if (!eventAction) {
      return member;
    }

    const isSameAction = member.activeAction?.id === eventAction.id;
    const activeAction = isSameAction ? member.activeAction : createActiveActionFromCrewAction(member, eventAction);
    if (member.activeAction && !isSameAction) {
      logs = appendLogEntry(logs, `${member.name} 的当前行动被中断，事件指令接管。`, "accent", state.elapsedGameSeconds);
    }

    if (eventAction.type === "event_waiting") {
      return {
        ...member,
        status: "遭遇事件，等待通讯接通。",
        statusTone: "danger" as Tone,
        activeAction,
        unavailable: true,
        canCommunicate: true,
      };
    }

    return {
      ...member,
      activeAction,
    };
  });

  return { crew, logs };
}

function collectBridgeableCrewActions(crewActions: Record<Id, CrewActionState>) {
  const actionByCrew = new Map<Id, CrewActionState>();

  for (const action of Object.values(crewActions)) {
    if (action.source !== "event_action_request" || action.status !== "active") {
      continue;
    }

    const existing = actionByCrew.get(action.crew_id);
    if (!existing || compareCrewActionRecency(action, existing) > 0) {
      actionByCrew.set(action.crew_id, action);
    }
  }

  return actionByCrew;
}

function compareCrewActionRecency(left: CrewActionState, right: CrewActionState) {
  const leftStartedAt = left.started_at ?? 0;
  const rightStartedAt = right.started_at ?? 0;
  return leftStartedAt === rightStartedAt ? left.id.localeCompare(right.id) : leftStartedAt - rightStartedAt;
}

function syncEventRuntimeToViews(state: GameState, eventState: GraphRunnerGameState) {
  return {
    crew: state.crew.map((member) => {
      const runtimeCrew = eventState.crew[member.id];
      if (!runtimeCrew) {
        return member;
      }

      return {
        ...member,
        personalityTags: mergeStringLists(member.personalityTags, runtimeCrew.personality_tags),
        conditions: mergeStringLists(member.conditions, runtimeCrew.condition_tags),
      };
    }),
    tiles: state.tiles.map((tile) => {
      const runtimeTile = eventState.tiles[tile.id];
      if (!runtimeTile) {
        return tile;
      }

      return {
        ...tile,
        dangerTags: mergeStringLists(tile.dangerTags ?? [], runtimeTile.danger_tags),
        eventMarks: mergeEventMarks(tile.eventMarks ?? [], runtimeTile.event_marks),
      };
    }),
  };
}

function mergeStringLists(existing: string[], incoming: string[]) {
  return Array.from(new Set([...existing, ...incoming]));
}

function mergeEventMarks(existing: NonNullable<MapTile["eventMarks"]>, incoming: NonNullable<TileState["event_marks"]>) {
  const marksById = new Map(existing.map((mark) => [mark.id, mark]));
  for (const mark of incoming) {
    marksById.set(mark.id, mark);
  }
  return Array.from(marksById.values()).sort((left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id));
}

function toCrewState(member: CrewMember): CrewState {
  return {
    id: member.id,
    display_name: member.name,
    tile_id: member.currentTile,
    status: toCrewRuntimeStatus(member),
    attributes: {
      strength: member.attributes.physical,
      agility: member.attributes.agility,
      intelligence: member.attributes.intellect,
      perception: member.attributes.perception,
      luck: member.attributes.luck,
    },
    personality_tags: member.personalityTags,
    expertise_tags: member.expertise.map((item) => item.expertiseId),
    condition_tags: member.conditions,
    communication_state: member.unavailable || !member.canCommunicate ? "lost_contact" : "available",
    current_action_id: member.activeAction?.id ?? null,
    blocking_event_id: null,
    blocking_call_id: null,
    background_event_ids: [],
    inventory_id: crewInventoryId(member.id),
    diary_entry_ids: member.diaryEntries.map((entry) => entry.entryId),
    event_history_keys: [],
  };
}

function toTileState(tile: MapTile): TileState {
  return {
    id: tile.id,
    coordinates: {
      x: tile.col,
      y: tile.row,
    },
    terrain_type: tile.terrain,
    tags: inferTileTags(tile),
    danger_tags: inferTileDangerTags(tile),
    discovery_state: tile.investigated ? "mapped" : "known",
    survey_state: tile.investigated ? "surveyed" : "unsurveyed",
    visibility: "visible",
    current_crew_ids: tile.crew,
    resource_nodes: tile.resources.map((resource) => ({
      id: `${tile.id}:${resource}`,
      resource_id: resource,
      amount: 1,
      state: "discovered" as const,
    })),
    site_objects: tile.instruments.map((instrument) => ({ id: `${tile.id}:${instrument}`, object_type: instrument, tags: [] })),
    buildings: tile.buildings.map((building) => ({ id: `${tile.id}:${building}`, building_type: building, status: "active" })),
    event_marks: tile.eventMarks ?? [],
    history_keys: [],
  };
}

function toInventoryStates(state: GameState): Record<Id, InventoryState> {
  const crewInventories = Object.fromEntries(
    state.crew.map((member) => [
      crewInventoryId(member.id),
      {
        id: crewInventoryId(member.id),
        owner_type: "crew" as const,
        owner_id: member.id,
        items: member.inventory.map((item) => ({ item_id: item.itemId, quantity: item.quantity })),
        resources: {},
      },
    ]),
  );

  return {
    base: {
      id: "base",
      owner_type: "base",
      owner_id: "base",
      items: state.baseInventory.map((item) => ({ item_id: item.itemId, quantity: item.quantity })),
      resources: numericResources(state.resources),
    },
    ...crewInventories,
  };
}

function toCrewRuntimeStatus(member: CrewMember): CrewState["status"] {
  if (member.unavailable) {
    return "unavailable";
  }
  if (!member.canCommunicate) {
    return "lost_contact";
  }
  if (member.activeAction?.actionType === "move") {
    return "moving";
  }
  if (member.activeAction) {
    return "acting";
  }
  return "idle";
}

function numericResources(resources: ResourceSummary): Record<string, number> {
  return {
    energy: resources.energy,
    iron: resources.iron,
    wood: resources.wood,
    food: resources.food,
    water: resources.water,
    baseIntegrity: resources.baseIntegrity,
    sol: resources.sol,
    power: resources.power,
  };
}

function crewInventoryId(crewId: CrewId) {
  return `crew:${crewId}`;
}

function inferTileTags(tile: MapTile) {
  const text = [tile.terrain, tile.status, tile.danger, ...tile.resources, ...tile.buildings, ...tile.instruments].join(" ");
  const tags = new Set<string>();

  if (/森林|木材|野生动物/.test(text)) {
    tags.add("forest");
  }
  if (/山|丘陵/.test(text)) {
    tags.add("mountain");
  }
  if (/断续信号|广播塔|中继器|回声/.test(text)) {
    tags.add("mountain_signal");
  }
  if (/沙漠/.test(text)) {
    tags.add("desert");
  }
  if (/火山|灰|ash/i.test(text)) {
    tags.add("volcanic");
  }

  return Array.from(tags);
}

function inferTileDangerTags(tile: MapTile) {
  if (tile.dangerTags) {
    return tile.dangerTags;
  }

  if (tile.danger === "未发现即时危险") {
    return [];
  }

  const configTile = defaultMapConfig.tiles.find((item) => item.id === tile.id);
  const configDangerTags =
    configTile?.specialStates
      .filter((state) => state.legacyDanger === tile.danger)
      .flatMap((state) => ("dangerTags" in state && Array.isArray(state.dangerTags) ? state.dangerTags : state.tags ?? [])) ?? [];

  return configDangerTags.length > 0 ? configDangerTags : [tile.danger];
}

function appendLogEntry(logs: SystemLog[], text: string, tone: Tone, elapsedGameSeconds: number, reportId?: string) {
  const id = logs.reduce((highest, log) => Math.max(highest, log.id), 0) + 1;
  return [...logs, { id, time: formatGameTime(elapsedGameSeconds), text, tone, ...(reportId ? { reportId } : {}) }];
}

function normalizeSavedMap(map: Partial<GameMapState>): GameMapState {
  const fresh = createInitialMapState();
  if (map.configId !== defaultMapConfig.id || map.configVersion !== defaultMapConfig.version) {
    return fresh;
  }

  const discoveredTileIds = Array.isArray(map.discoveredTileIds) ? map.discoveredTileIds.filter((id) => defaultMapConfig.tiles.some((tile) => tile.id === id)) : fresh.discoveredTileIds;
  return {
    configId: defaultMapConfig.id,
    configVersion: defaultMapConfig.version,
    rows: defaultMapConfig.size.rows,
    cols: defaultMapConfig.size.cols,
    originTileId: defaultMapConfig.originTileId,
    tilesById: { ...fresh.tilesById, ...(map.tilesById ?? {}) },
    discoveredTileIds,
    investigationReportsById: map.investigationReportsById ?? {},
  };
}

function syncMapCrew(map: GameMapState, crew: CrewMember[]): GameMapState {
  const tilesById = { ...map.tilesById };
  for (const tile of defaultMapConfig.tiles) {
    tilesById[tile.id] = {
      ...tilesById[tile.id],
      crew: crew.filter((member) => member.currentTile === tile.id && !member.unavailable).map((member) => member.id),
    };
  }

  return { ...map, tilesById };
}

function discoverMapTile(map: GameMapState, tileId: string): GameMapState {
  const configTile = defaultMapConfig.tiles.find((tile) => tile.id === tileId);
  if (!configTile) {
    return map;
  }

  const discoveredTileIds = map.discoveredTileIds.includes(tileId) ? map.discoveredTileIds : [...map.discoveredTileIds, tileId];
  const previous = map.tilesById[tileId] ?? {};
  return {
    ...map,
    discoveredTileIds,
    tilesById: {
      ...map.tilesById,
      [tileId]: {
        ...previous,
        discovered: true,
        revealedObjectIds: addUnique(previous.revealedObjectIds ?? [], ...configTile.objects.filter((object) => object.visibility === "onDiscovered").map((object) => object.id)),
        revealedSpecialStateIds: addUnique(
          previous.revealedSpecialStateIds ?? [],
          ...configTile.specialStates.filter((state) => state.visibility === "onDiscovered" && (previous.activeSpecialStateIds ?? []).includes(state.id)).map((state) => state.id),
        ),
      },
    },
  };
}

function addUnique<T>(items: T[], ...values: T[]) {
  return [...items, ...values.filter((value) => !items.includes(value))];
}

function appendArrivalDiary(member: CrewMember, elapsedGameSeconds: number) {
  if (member.id !== "mike") {
    return member;
  }

  return appendDiaryEntry(member, {
    entryId: "mike_arrival_lake",
    triggerNode: "抵达湖泊边缘",
    gameSecond: elapsedGameSeconds,
    text: "湖没有声音，但通讯里有回声。它离地图更近，也离我更近。先不要让 Amy 知道我这么写。",
  });
}
