import { useEffect, useMemo, useState } from "react";
import { CallPage } from "./pages/CallPage";
import { CommunicationStation } from "./pages/CommunicationStation";
import { ControlCenter } from "./pages/ControlCenter";
import { DebugToolbox, type TimeMultiplier } from "./pages/DebugToolbox";
import { EndingPage } from "./pages/EndingPage";
import { MapPage } from "./pages/MapPage";
import { applyImmediateOrCreateAction, settleAction, type ActionSettlementPatch, type SettlementActiveAction } from "./callActionSettlement";
import { advanceCrewMoveAction, createActiveActionFromCrewAction, createMovePreview, normalizeCrewMember, startCrewMove, syncTileCrew } from "./crewSystem";
import { appendDiaryEntry } from "./diarySystem";
import { eventContentLibrary } from "./content/contentData";
import { mapObjectDefinitionById, type MapObjectDefinition } from "./content/mapObjects";
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
  type WorldFlag,
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
const CURRENT_AREA_SURVEY_EMPTY_RESULT = "当前地点没有可触发的调查事件。";

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
  const returnHomeCompleted = gameState.world_flags.return_home_completed?.value === true;
  const returnHomeCompletedAt = getWorldFlagNumber(gameState, "return_home_completed_at");
  const completedAtLabel = formatGameTime(returnHomeCompletedAt ?? elapsedGameSeconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGameState((state) => settleGameTime({ ...state, elapsedGameSeconds: state.elapsedGameSeconds + timeMultiplier }));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [timeMultiplier]);

  useEffect(() => {
    saveGameState(gameState);
  }, [gameState]);

  useEffect(() => {
    if (returnHomeCompleted) {
      setPage("ending");
    }
  }, [returnHomeCompleted]);

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
    const runtimeCall = findRuntimeCallForCrew(gameState, crewId);
    if (!member || (member.unavailable && !runtimeCall)) {
      appendLog("通讯台尝试接入失败。信号像一条拒绝工作的蛇。", "muted");
      return;
    }

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

    // Runtime calls dispatch the raw option_id from the EventDefinition; no
    // translation. Handled before the legacy-dispatch translator so its
    // unknown-id warning doesn't fire for valid event choice ids.
    if (currentCall.runtimeCallId) {
      if (currentCall.settled) {
        return;
      }
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

    if (actionId === "universal:survey") {
      if (currentCall.settled) {
        return;
      }
      const applied = triggerCurrentAreaSurvey(gameState, currentCall.crewId);
      setGameState(applied.state);
      setCurrentCall((call) =>
        call
          ? {
              ...call,
              settled: true,
              result: applied.createdEvent ? "调查事件已进入通讯队列。" : CURRENT_AREA_SURVEY_EMPTY_RESULT,
            }
          : call,
      );
      return;
    }

    // Translate the new schema's action ids back to the legacy "verb[:objectId]"
    // shape `applyImmediateOrCreateAction` understands. See
    // `docs/plans/2026-04-29-01-40/technical-design.md` §7.2 — the migrated
    // action defs intentionally keep `event_id: "legacy.<verb>"`, so the
    // dispatch layer falls back to the existing handlers in `callActionSettlement.ts`.
    // TODO(map-object-action-refactor): replace this translator with real
    // EventDefinition entry points once universal/object events exist as
    // proper graph nodes (Task 4 in the next round).
    const legacyDispatch = translateActionIdToLegacyDispatch(actionId);

    if (legacyDispatch === "move") {
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

    if (legacyDispatch === "standby" || legacyDispatch === "stop") {
      setGameState((state) => {
        const nextState =
          legacyDispatch === "standby"
            ? createStandbyCrewAction(state, currentCall.crewId, state.elapsedGameSeconds)
            : createStopCrewAction(state, currentCall.crewId, state.elapsedGameSeconds);
        return settleGameTime(nextState);
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
      return;
    }

    setGameState((state) => {
      const applied = applyImmediateOrCreateAction({
        state,
        crewId: currentCall.crewId,
        actionViewId: legacyDispatch,
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

      const blockingAction = selectActiveCrewActionForCrew(state.crew_actions, member.id);
      if (blockingAction) {
        return {
          ...state,
          logs: appendLogEntry(state.logs, "移动确认失败：队员已有进行中的主要行动。", "danger", state.elapsedGameSeconds),
        };
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
      const startedMove = startCrewMove(member, preview, state.tiles, state.elapsedGameSeconds);
      const updatedCrew = state.crew.map((item) =>
        item.id === currentCall.crewId ? startedMove.member : item,
      );

      const nextMap = syncMapCrew(state.map, updatedCrew);
      return {
        ...state,
        crew: updatedCrew,
        crew_actions: {
          ...state.crew_actions,
          [startedMove.action.id]: startedMove.action,
        },
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

  if (page === "ending") {
    return (
      <EndingPage
        completedAtLabel={completedAtLabel}
        gameTimeLabel={gameTimeLabel}
        onResetGame={resetGame}
        onReturnControl={() => setPage("control")}
      />
    );
  }

  if (page === "station") {
    return (
      <CommunicationStation
        crew={crew}
        crewActions={gameState.crew_actions}
        activeCalls={gameState.active_calls}
        objectives={gameState.objectives}
        eventLogs={gameState.event_logs}
        elapsedGameSeconds={elapsedGameSeconds}
        tiles={tiles}
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
          gameState={gameState}
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
          crewActions={gameState.crew_actions}
          activeCalls={gameState.active_calls}
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

function createStandbyCrewAction(state: GameState, crewId: CrewId, occurredAt: number): GameState {
  const member = state.crew.find((item) => item.id === crewId);
  if (!member) {
    return state;
  }

  const crewActions = materializeLegacyActiveActions(state);
  if (findActiveCrewActionForMember(crewActions, member)) {
    return {
      ...state,
      logs: appendLogEntry(state.logs, `${member.name} 正在执行行动，不能切换为原地待命。`, "muted", occurredAt),
      crew_actions: crewActions,
    };
  }

  const actionId = `standby:${crewId}:${occurredAt}`;
  const action = createBasicCrewAction({
    id: actionId,
    crewId,
    type: "standby",
    source: "player_command",
    tileId: member.currentTile,
    occurredAt,
    durationSeconds: 0,
  });

  return {
    ...state,
    crew_actions: {
      ...crewActions,
      [actionId]: action,
    },
  };
}

function createStopCrewAction(state: GameState, crewId: CrewId, occurredAt: number): GameState {
  const member = state.crew.find((item) => item.id === crewId);
  if (!member) {
    return state;
  }

  const materializedActions = materializeLegacyActiveActions(state);
  const activeAction = findActiveCrewActionForMember(materializedActions, member);
  if (!activeAction) {
    return {
      ...state,
      logs: appendLogEntry(state.logs, `${member.name} 没有可停止的当前行动。`, "muted", occurredAt),
      crew_actions: materializedActions,
    };
  }

  if (!activeAction.can_interrupt) {
    return {
      ...state,
      logs: appendLogEntry(state.logs, `${member.name} 的当前行动不能被中断。`, "danger", occurredAt),
      crew_actions: materializedActions,
    };
  }

  const stopDuration = activeAction.interrupt_duration_seconds || 10;
  const stopActionId = `stop:${crewId}:${activeAction.id}:${occurredAt}`;
  const stopAction = createBasicCrewAction({
    id: stopActionId,
    crewId,
    type: "stop",
    source: "player_command",
    tileId: member.currentTile,
    occurredAt,
    durationSeconds: stopDuration,
  });
  const interruptedAction = interruptCrewActionState(activeAction, occurredAt);
  const stoppingMember = {
    ...member,
    status: "停止当前行动中。",
    statusTone: "danger" as Tone,
    activeAction: createActiveActionFromCrewAction(member, stopAction),
  };

  return {
    ...state,
    crew: state.crew.map((item) => (item.id === crewId ? stoppingMember : item)),
    logs: appendLogEntry(state.logs, `${member.name} 开始停止当前行动。`, "danger", occurredAt),
    crew_actions: {
      ...materializedActions,
      [activeAction.id]: interruptedAction,
      [stopActionId]: stopAction,
    },
  };
}

function createBasicCrewAction(args: {
  id: Id;
  crewId: Id;
  type: "standby" | "stop";
  source: CrewActionState["source"];
  tileId: Id;
  occurredAt: number;
  durationSeconds: number;
}): CrewActionState {
  return {
    id: args.id,
    crew_id: args.crewId,
    type: args.type,
    status: "active",
    source: args.source,
    parent_event_id: null,
    objective_id: null,
    action_request_id: null,
    from_tile_id: args.tileId,
    to_tile_id: null,
    target_tile_id: args.tileId,
    path_tile_ids: [],
    started_at: args.occurredAt,
    ends_at: args.occurredAt + args.durationSeconds,
    progress_seconds: 0,
    duration_seconds: args.durationSeconds,
    action_params: {},
    can_interrupt: true,
    interrupt_duration_seconds: 10,
  };
}

function findActiveCrewActionForMember(crewActions: Record<Id, CrewActionState>, member: CrewMember): CrewActionState | undefined {
  if (member.activeAction) {
    const materialized = crewActions[member.activeAction.id];
    if (materialized?.status === "active") {
      return materialized;
    }
  }

  return Object.values(crewActions)
    .filter((action) => action.crew_id === member.id && action.status === "active")
    .sort((left, right) => (right.started_at ?? 0) - (left.started_at ?? 0) || right.id.localeCompare(left.id))[0];
}

function interruptCrewActionState(action: CrewActionState, occurredAt: number): CrewActionState {
  const startedAt = action.started_at ?? occurredAt;
  return {
    ...action,
    status: "interrupted",
    ends_at: occurredAt,
    progress_seconds: Math.min(action.duration_seconds, Math.max(0, occurredAt - startedAt)),
  };
}

function settleGameTime(state: GameState): GameState {
  let changed = false;
  let resources = state.resources;
  let map = state.map;
  let tiles = state.tiles;
  let logs = state.logs;
  let baseInventory = state.baseInventory;
  let crewActions = materializeLegacyActiveActions(state);
  changed = changed || crewActions !== state.crew_actions;
  const triggerContexts: TriggerContext[] = [];
  const dueActionsByCrew = collectDueCrewActions(crewActions, state.elapsedGameSeconds);

  const crew = state.crew.map((member) => {
    let nextMember = member;
    const dueAction = dueActionsByCrew.get(member.id);
    const activeMoveAction = selectActiveCrewActionForCrew(crewActions, member.id, "move");

    if (activeMoveAction) {
      const settled = advanceCrewMoveAction(member, activeMoveAction, tiles, logs, state.elapsedGameSeconds);
      nextMember = settled.member;
      logs = settled.logs;
      crewActions = {
        ...crewActions,
        [activeMoveAction.id]: settled.action,
      };
      changed = changed || settled.changed || settled.action !== activeMoveAction;

      if (settled.changed && nextMember.currentTile !== member.currentTile) {
        map = discoverMapTile(map, nextMember.currentTile);
        tiles = syncTileCrew(deriveLegacyTiles(defaultMapConfig, map), state.crew.map((crewMember) => (crewMember.id === nextMember.id ? nextMember : crewMember)));
      }

      if (settled.arrived) {
        nextMember = appendArrivalDiary(nextMember, state.elapsedGameSeconds);
        triggerContexts.push({
          trigger_type: "arrival",
          occurred_at: state.elapsedGameSeconds,
          source: "crew_action",
          crew_id: nextMember.id,
          tile_id: nextMember.currentTile,
          action_id: activeMoveAction.id,
          payload: {
            action_type: "move",
            from_tile_id: activeMoveAction.from_tile_id ?? null,
            target_tile_id: activeMoveAction.target_tile_id ?? activeMoveAction.to_tile_id ?? null,
          },
        });
      }
    } else if (dueAction) {
      const settled = settleCrewActionState(dueAction, member, state.elapsedGameSeconds, resources, baseInventory, tiles, logs, map);
      nextMember = settled.member;
      resources = settled.resources;
      tiles = settled.tiles;
      logs = settled.logs;
      map = settled.map;
      baseInventory = settled.baseInventory ?? baseInventory;
      crewActions = {
        ...crewActions,
        [dueAction.id]: completeCrewActionState(dueAction, state.elapsedGameSeconds),
      };
      triggerContexts.push(...settled.triggerContexts);
      changed = true;
    }

    return nextMember;
  });

  const syncedMap = syncMapCrew(map, crew);
  let nextState = changed ? { ...state, crew, resources, baseInventory, map: syncedMap, tiles: syncTileCrew(tiles, crew), logs, crew_actions: crewActions } : state;
  nextState = processObjectiveCompletions(nextState, triggerContexts);

  for (const context of triggerContexts) {
    nextState = processAppEventTrigger(nextState, context);
  }

  return processAppEventWakeups(nextState);
}

type LegacySettleableCrewAction = CrewActionState & { type: "survey" | "gather" | "build" | "extract" };

function materializeLegacyActiveActions(state: GameState): Record<Id, CrewActionState> {
  let crewActions = state.crew_actions;

  for (const member of state.crew) {
    const action = member.activeAction;
    const actionType = action ? toCrewActionType(action.actionType) : null;
    if (!action || action.status !== "inProgress" || !actionType || crewActions[action.id]) {
      continue;
    }

    crewActions = {
      ...crewActions,
      [action.id]: createCrewActionStateFromActiveAction(state, member, action, actionType),
    };
  }

  return crewActions;
}

function toCrewActionType(actionType: ActiveAction["actionType"]): CrewActionState["type"] | null {
  switch (actionType) {
    case "survey":
    case "gather":
    case "build":
    case "move":
      return actionType;
    case "event":
      return "event_waiting";
    case "standby":
      return "standby";
    default:
      return null;
  }
}

function createCrewActionStateFromActiveAction(
  state: GameState,
  member: CrewMember,
  action: ActiveAction,
  actionType: CrewActionState["type"],
): CrewActionState {
  const actionRecord = action as ActiveAction & {
    objectId?: string;
    handler?: string;
    actionDefId?: string;
  };
  const candidateObject =
    action.actionType === "gather" || action.actionType === "build"
      ? findCandidateObject(action.targetTile ?? member.currentTile, action.actionType, state.map)
      : undefined;
  const objectId = stringParam(actionRecord.objectId) ?? candidateObject?.id;
  const perRoundYield = typeof action.perRoundYield === "number" ? action.perRoundYield : undefined;
  return {
    id: action.id,
    crew_id: member.id,
    type: actionType,
    status: "active",
    source: "player_command",
    parent_event_id: null,
    objective_id: null,
    action_request_id: null,
    from_tile_id: action.fromTile ?? member.currentTile,
    to_tile_id: action.actionType === "move" ? action.targetTile ?? null : null,
    target_tile_id: action.targetTile ?? member.currentTile,
    path_tile_ids: action.route,
    started_at: action.startTime,
    ends_at: action.startTime + action.durationSeconds,
    progress_seconds: 0,
    duration_seconds: action.durationSeconds,
    action_params: {
      ...action.params,
      ...(action.resource
        ? {
            resource_id: action.resource,
            perRoundYieldByResource: {
              [action.resource]: perRoundYield ?? 1,
            },
          }
        : {}),
      ...(perRoundYield ? { per_round_yield: perRoundYield } : {}),
      ...(objectId ? { object_id: objectId } : {}),
      ...(typeof actionRecord.handler === "string" ? { handler: actionRecord.handler } : {}),
      ...(typeof actionRecord.actionDefId === "string" ? { action_def_id: actionRecord.actionDefId } : {}),
      ...(action.actionType === "move"
        ? {
            route_step_index: action.routeStepIndex ?? 0,
            step_started_at: action.stepStartedAt ?? action.startTime,
            step_finish_time: action.stepFinishTime ?? action.finishTime,
            step_durations_seconds: action.route?.map(() => action.durationSeconds / Math.max(1, action.route?.length ?? 1)),
          }
        : {}),
    },
    can_interrupt: true,
    interrupt_duration_seconds: 10,
  };
}

function collectDueCrewActions(crewActions: Record<Id, CrewActionState>, elapsedGameSeconds: number): Map<Id, CrewActionState> {
  const dueActions = Object.values(crewActions)
    .filter((action) => action.status === "active" && typeof action.ends_at === "number" && action.ends_at <= elapsedGameSeconds)
    .sort((left, right) => (left.ends_at ?? 0) - (right.ends_at ?? 0) || left.id.localeCompare(right.id));
  const byCrew = new Map<Id, CrewActionState>();

  for (const action of dueActions) {
    if (!byCrew.has(action.crew_id)) {
      byCrew.set(action.crew_id, action);
    }
  }

  return byCrew;
}

function selectActiveCrewActionForCrew(crewActions: Record<Id, CrewActionState>, crewId: Id, actionType?: CrewActionState["type"]): CrewActionState | undefined {
  return Object.values(crewActions)
    .filter((action) => action.crew_id === crewId && action.status === "active" && (!actionType || action.type === actionType))
    .sort((left, right) => (right.started_at ?? 0) - (left.started_at ?? 0) || right.id.localeCompare(left.id))[0];
}

function completeCrewActionState(action: CrewActionState, elapsedGameSeconds: number): CrewActionState {
  return {
    ...action,
    status: "completed",
    ends_at: action.ends_at ?? elapsedGameSeconds,
    progress_seconds: action.duration_seconds,
  };
}

function settleCrewActionState(
  action: CrewActionState,
  member: CrewMember,
  elapsedGameSeconds: number,
  resources: ResourceSummary,
  baseInventory: GameState["baseInventory"],
  tiles: MapTile[],
  logs: SystemLog[],
  map: GameMapState,
): ActionSettlementPatch {
  if (action.type === "standby") {
    return settleStandbyCrewActionState(action, member, elapsedGameSeconds, resources, baseInventory, tiles, logs, map);
  }

  if (action.type === "stop") {
    return settleStopCrewActionState(action, member, elapsedGameSeconds, resources, baseInventory, tiles, logs, map);
  }

  if (canSettleWithLegacyHandler(action)) {
    const settled = settleAction({
      member,
      action: createSettlementActionFromCrewAction(member, action),
      occurredAt: elapsedGameSeconds,
      resources,
      baseInventory,
      tiles,
      map,
      logs,
    });

    return {
      ...settled,
      triggerContexts: settled.triggerContexts.length > 0 ? settled.triggerContexts : [createCrewActionCompleteTrigger(action, member, elapsedGameSeconds)],
    };
  }

  const nextMember = {
    ...member,
    status: action.type === "event_waiting" ? "待命中。" : "行动完成，待命中。",
    statusTone: (action.type === "event_waiting" ? "muted" : "neutral") as Tone,
    activeAction: member.activeAction?.id === action.id ? undefined : member.activeAction,
    unavailable: action.type === "event_waiting" ? false : member.unavailable,
    canCommunicate: action.type === "event_waiting" ? true : member.canCommunicate,
  };

  return {
    member: nextMember,
    resources,
    baseInventory,
    tiles,
    map,
    logs: appendLogEntry(logs, `${member.name} 的行动已完成。`, "neutral", elapsedGameSeconds),
    triggerContexts: [createCrewActionCompleteTrigger(action, member, elapsedGameSeconds)],
  };
}

function settleStandbyCrewActionState(
  action: CrewActionState,
  member: CrewMember,
  elapsedGameSeconds: number,
  resources: ResourceSummary,
  baseInventory: GameState["baseInventory"],
  tiles: MapTile[],
  logs: SystemLog[],
  map: GameMapState,
): ActionSettlementPatch {
  return {
    member: {
      ...member,
      status: "待命中。",
      statusTone: "muted" as Tone,
      activeAction: member.activeAction?.id === action.id ? undefined : member.activeAction,
      unavailable: false,
      canCommunicate: true,
    },
    resources,
    baseInventory,
    tiles,
    map,
    logs: appendLogEntry(logs, `${member.name} 原地待命。`, "muted", elapsedGameSeconds),
    triggerContexts: [
      {
        trigger_type: "idle_time",
        occurred_at: elapsedGameSeconds,
        source: "crew_action",
        crew_id: member.id,
        tile_id: member.currentTile,
        action_id: action.id,
        payload: {
          action_type: "standby",
        },
      },
    ],
  };
}

function settleStopCrewActionState(
  action: CrewActionState,
  member: CrewMember,
  elapsedGameSeconds: number,
  resources: ResourceSummary,
  baseInventory: GameState["baseInventory"],
  tiles: MapTile[],
  logs: SystemLog[],
  map: GameMapState,
): ActionSettlementPatch {
  return {
    member: {
      ...member,
      status: "行动已停止，待命中。",
      statusTone: "muted" as Tone,
      activeAction: member.activeAction?.id === action.id ? undefined : member.activeAction,
      unavailable: false,
      canCommunicate: true,
    },
    resources,
    baseInventory,
    tiles,
    map,
    logs: appendLogEntry(logs, `${member.name} 停止当前行动。`, "danger", elapsedGameSeconds),
    triggerContexts: [],
  };
}

function canSettleWithLegacyHandler(
  action: CrewActionState,
): action is LegacySettleableCrewAction {
  return action.type === "survey" || action.type === "gather" || action.type === "build" || action.type === "extract";
}

function createSettlementActionFromCrewAction(member: CrewMember, action: LegacySettleableCrewAction): SettlementActiveAction {
  const startedAt = action.started_at ?? 0;
  const targetTile = action.target_tile_id ?? action.to_tile_id ?? member.currentTile;

  return {
    id: action.id,
    actionType: action.type,
    status: "inProgress",
    startTime: startedAt,
    durationSeconds: action.duration_seconds,
    finishTime: action.ends_at ?? startedAt + action.duration_seconds,
    fromTile: action.from_tile_id ?? member.currentTile,
    targetTile,
    route: action.path_tile_ids,
    resource: stringParam(action.action_params.resource_id),
    perRoundYield: numberParam(action.action_params.per_round_yield),
    params: action.action_params,
    objectId: stringParam(action.action_params.object_id),
    handler: stringParam(action.action_params.handler),
    actionDefId: action.type === "survey" || action.type === "gather" || action.type === "build" || action.type === "extract" ? action.type : undefined,
  };
}

function createCrewActionCompleteTrigger(action: CrewActionState, member: CrewMember, elapsedGameSeconds: number): TriggerContext {
  return {
    trigger_type: "action_complete",
    occurred_at: elapsedGameSeconds,
    source: "crew_action",
    crew_id: action.crew_id,
    tile_id: action.target_tile_id ?? action.to_tile_id ?? member.currentTile,
    action_id: action.id,
    event_id: action.objective_id ? null : action.parent_event_id ?? null,
    node_id: action.action_request_id ?? null,
    objective_id: action.objective_id ?? null,
    payload: {
      action_type: action.type,
      object_id: stringParam(action.action_params.object_id) ?? null,
      tags: readStringArray(action.action_params.tags),
    },
  };
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberParam(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
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

/**
 * Translate a new-schema action id (`universal:<verb>` or `<objectId>:<verb>`)
 * to the legacy "verb[:objectId]" dispatch token consumed by
 * `callActionSettlement.ts`. Unknown ids fall through unchanged with a
 * console warn (R7 defensive impl).
 */
function translateActionIdToLegacyDispatch(actionId: string): string {
  if (actionId.startsWith("universal:")) {
    return actionId.slice("universal:".length);
  }

  const colonIndex = actionId.lastIndexOf(":");
  if (colonIndex > 0) {
    const objectId = actionId.slice(0, colonIndex);
    const verb = actionId.slice(colonIndex + 1);
    if (verb.length > 0) {
      return `${verb}:${objectId}`;
    }
  }

  // Bare verb (legacy-style id) is accepted as-is for back-compat with any
  // call sites that still synthesise the old shape (e.g. App.test.tsx
  // pre-creates an active action with `id: "gather:iron-ridge-outcrop:..."`).
  if (
    actionId === "move" ||
    actionId === "survey" ||
    actionId === "standby" ||
    actionId === "stop" ||
    actionId === "gather" ||
    actionId === "build" ||
    actionId === "extract" ||
    actionId === "scan"
  ) {
    return actionId;
  }

  console.warn(`[App.handleDecision] unrecognized action id: ${actionId}`);
  return actionId;
}

function enrichActionForSettlement(member: CrewMember, action: ActiveAction): ActiveAction | SettlementActiveAction {
  if (hasSettlementMetadata(action)) {
    return action;
  }

  if (isObjectCandidateAction(action.actionType)) {
    const object = findCandidateObject(action.targetTile ?? member.currentTile, action.actionType, undefined);
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

function isObjectCandidateAction(actionType: ActiveAction["actionType"]): actionType is "gather" | "build" {
  return actionType === "gather" || actionType === "build";
}

function findCandidateObject(tileId: string, verb: string, map: GameMapState | undefined): MapObjectDefinition | undefined {
  const configTile = defaultMapConfig.tiles.find((tile) => tile.id === tileId);
  if (!configTile) {
    return undefined;
  }
  for (const objectId of configTile.objectIds) {
    const definition = mapObjectDefinitionById.get(objectId);
    if (!definition) {
      continue;
    }
    if (!isObjectVisible(tileId, definition, map)) {
      continue;
    }
    if (definition.actions.some((action) => action.id === `${objectId}:${verb}`)) {
      return definition;
    }
  }
  return undefined;
}

function isObjectVisible(tileId: string, definition: MapObjectDefinition, map: GameMapState | undefined) {
  if (!map) {
    return true;
  }

  const runtimeTile = map.tilesById[tileId];
  return (
    definition.visibility === "onDiscovered" ||
    runtimeTile?.revealedObjectIds?.includes(definition.id) ||
    (definition.visibility === "onInvestigated" && runtimeTile?.investigated)
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

function triggerCurrentAreaSurvey(state: GameState, crewId: CrewId): { state: GameState; createdEvent: boolean } {
  const member = state.crew.find((item) => item.id === crewId);
  if (!member) {
    return { state, createdEvent: false };
  }

  const eventState = toEventEngineState(state);
  for (const context of createCurrentAreaSurveyTriggerContexts(state, member)) {
    const result = processTrigger({
      state: eventState,
      index: eventContentIndex,
      context,
    });
    if ((result.candidate_report?.created_event_ids.length ?? 0) > 0) {
      return { state: mergeEventRuntimeState(state, result.state), createdEvent: true };
    }
  }

  return { state, createdEvent: false };
}

function createCurrentAreaSurveyTriggerContexts(state: GameState, member: CrewMember): TriggerContext[] {
  const tileId = member.currentTile;
  const objects = getVisibleSurveyObjects(state, tileId);
  const contexts = objects.map((object) => createCurrentAreaSurveyTriggerContext(state, member, object));
  contexts.push(createCurrentAreaSurveyTriggerContext(state, member));
  return contexts;
}

function createCurrentAreaSurveyTriggerContext(
  state: GameState,
  member: CrewMember,
  object?: MapObjectDefinition,
): TriggerContext {
  return {
    trigger_type: "action_complete",
    occurred_at: state.elapsedGameSeconds,
    source: "crew_action",
    crew_id: member.id,
    tile_id: member.currentTile,
    action_id: `current-area-survey:${member.id}:${member.currentTile}:${state.elapsedGameSeconds}`,
    payload: {
      action_type: "survey",
      object_id: object?.id ?? null,
      tags: mergeTags(getCurrentAreaSurveyTileTags(state, member.currentTile), object?.tags ?? []),
    },
  };
}

function getVisibleSurveyObjects(state: GameState, tileId: string): MapObjectDefinition[] {
  const configTile = defaultMapConfig.tiles.find((tile) => tile.id === tileId);
  if (!configTile) {
    return [];
  }

  return configTile.objectIds
    .map((objectId) => mapObjectDefinitionById.get(objectId))
    .filter((definition): definition is MapObjectDefinition => Boolean(definition && isObjectVisible(tileId, definition, state.map)))
    .filter((definition) => definition.actions.some((action) => action.id === `${definition.id}:survey`));
}

function getCurrentAreaSurveyTileTags(state: GameState, tileId: string): string[] {
  const tile = state.tiles.find((item) => item.id === tileId);
  return tile ? mergeTags(inferTileTags(tile), inferTileDangerTags(tile)) : [];
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

export function toEventEngineState(state: GameState): GraphRunnerGameState {
  return {
    ...state,
    elapsed_game_seconds: state.elapsedGameSeconds,
    crew: Object.fromEntries(state.crew.map((member) => [member.id, toCrewState(member, state.crew_actions)])),
    tiles: Object.fromEntries(state.tiles.map((tile) => [tile.id, toTileState(tile)])),
    resources: numericResources(state.resources),
    inventories: {
      ...state.inventories,
      ...toInventoryStates(state),
    },
  };
}

export function mergeEventRuntimeState(state: GameState, eventState: GraphRunnerGameState): GameState {
  const views = syncEventRuntimeToViews(state, eventState);
  const bridged = bridgeCrewActions({ ...state, crew: views.crew }, eventState);
  const eventMap = (eventState as GraphRunnerGameState & { map?: GameMapState }).map;
  const worldFlags = withReturnHomeCompletionTime(state, eventState.world_flags);

  return {
    ...state,
    crew: bridged.crew,
    baseInventory: views.baseInventory,
    resources: views.resources,
    map: eventMap ?? state.map,
    tiles: views.tiles,
    logs: bridged.logs,
    active_events: eventState.active_events,
    active_calls: eventState.active_calls,
    objectives: eventState.objectives,
    event_logs: eventState.event_logs,
    world_history: eventState.world_history,
    world_flags: worldFlags,
    crew_actions: eventState.crew_actions,
    inventories: eventState.inventories,
    rng_state: eventState.rng_state,
  };
}

function withReturnHomeCompletionTime(state: GameState, worldFlags: GameState["world_flags"]): GameState["world_flags"] {
  if (worldFlags.return_home_completed?.value !== true) {
    return worldFlags;
  }

  const existing = worldFlags.return_home_completed_at;
  if (typeof existing?.value === "number" && existing.value > 0) {
    return worldFlags;
  }

  const completedAt = Math.max(0, state.elapsedGameSeconds);
  const flag: WorldFlag = {
    key: "return_home_completed_at",
    value: completedAt,
    value_type: "number",
    created_at: existing?.created_at ?? completedAt,
    updated_at: completedAt,
    source_event_id: existing?.source_event_id ?? worldFlags.return_home_completed.source_event_id ?? null,
    tags: existing?.tags ?? ["mainline", "ending", "completion_time"],
  };

  return {
    ...worldFlags,
    return_home_completed_at: flag,
  };
}

function bridgeCrewActions(state: GameState, eventState: GraphRunnerGameState): { crew: CrewMember[]; logs: SystemLog[] } {
  const actionByCrew = collectBridgeableCrewActions(eventState.crew_actions);
  let logs = state.logs;

  const crew = state.crew.map((member) => {
    const eventAction = actionByCrew.get(member.id);
    if (!eventAction) {
      if (member.activeAction?.actionType === "event" || (member.unavailable && member.canCommunicate && member.status === "遭遇事件，等待通讯接通。")) {
        return {
          ...member,
          status: "待命中。",
          statusTone: "muted" as Tone,
          activeAction: undefined,
          unavailable: false,
          canCommunicate: true,
        };
      }
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
    if (action.type === "move") {
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
  const baseInventory = eventState.inventories.base;

  return {
    crew: state.crew.map((member) => {
      const runtimeCrew = eventState.crew[member.id];
      const crewInventory = eventState.inventories[crewInventoryId(member.id)];

      return {
        ...member,
        ...(runtimeCrew
          ? {
              personalityTags: mergeStringLists(member.personalityTags, runtimeCrew.personality_tags),
              conditions: mergeStringLists(member.conditions, runtimeCrew.condition_tags),
            }
          : {}),
        ...(crewInventory ? { inventory: toGameInventoryEntries(crewInventory.items) } : {}),
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
    baseInventory: baseInventory ? toGameInventoryEntries(baseInventory.items) : state.baseInventory,
    resources: baseInventory ? toResourceSummary(state.resources, baseInventory.resources) : state.resources,
  };
}

function toGameInventoryEntries(items: InventoryState["items"]): GameState["baseInventory"] {
  return items.filter((item) => item.quantity > 0).map((item) => ({ itemId: item.item_id, quantity: item.quantity }));
}

function toResourceSummary(existing: ResourceSummary, resources: Record<string, number>): ResourceSummary {
  return {
    ...existing,
    energy: resources.energy ?? existing.energy,
    iron: resources.iron ?? existing.iron,
    wood: resources.wood ?? existing.wood,
    food: resources.food ?? existing.food,
    water: resources.water ?? existing.water,
    baseIntegrity: resources.baseIntegrity ?? existing.baseIntegrity,
    sol: resources.sol ?? existing.sol,
    power: resources.power ?? existing.power,
  };
}

function mergeStringLists(existing: string[], incoming: string[]) {
  return Array.from(new Set([...existing, ...incoming]));
}

function mergeTags(...groups: string[][]) {
  return Array.from(new Set(groups.flat()));
}

function mergeEventMarks(existing: NonNullable<MapTile["eventMarks"]>, incoming: NonNullable<TileState["event_marks"]>) {
  const marksById = new Map(existing.map((mark) => [mark.id, mark]));
  for (const mark of incoming) {
    marksById.set(mark.id, mark);
  }
  return Array.from(marksById.values()).sort((left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id));
}

function toCrewState(member: CrewMember, crewActions: Record<Id, CrewActionState> = {}): CrewState {
  const activeAction = selectActiveCrewActionForCrew(crewActions, member.id);
  return {
    id: member.id,
    display_name: member.name,
    tile_id: member.currentTile,
    status: toCrewRuntimeStatus(member, activeAction),
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
    current_action_id: activeAction?.id ?? member.activeAction?.id ?? null,
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

function toCrewRuntimeStatus(member: CrewMember, activeAction?: CrewActionState): CrewState["status"] {
  if (member.unavailable) {
    return "unavailable";
  }
  if (!member.canCommunicate) {
    return "lost_contact";
  }
  if (activeAction?.type === "move") {
    return "moving";
  }
  if (activeAction) {
    return "acting";
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

function getWorldFlagNumber(state: GameState, key: string): number | undefined {
  const value = state.world_flags[key]?.value;
  return typeof value === "number" ? value : undefined;
}

function crewInventoryId(crewId: CrewId) {
  return `crew:${crewId}`;
}

function inferTileTags(tile: MapTile) {
  const text = [tile.terrain, tile.status, tile.danger, ...tile.resources, ...tile.buildings, ...tile.instruments].join(" ");
  const configTile = defaultMapConfig.tiles.find((item) => item.id === tile.id);
  const explicitTags = "tags" in tile && Array.isArray(tile.tags) ? tile.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const contentTags = configTile
    ? configTile.objectIds.flatMap((objectId) => {
        const def = mapObjectDefinitionById.get(objectId);
        return def?.tags?.filter((tag) => tag === "crash_site") ?? [];
      })
    : [];
  const tags = new Set<string>([...explicitTags, ...contentTags]);

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
    mapObjects: { ...(fresh.mapObjects ?? {}), ...(map.mapObjects ?? {}) },
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
        revealedObjectIds: addUnique(
          previous.revealedObjectIds ?? [],
          ...configTile.objectIds.flatMap((objectId) => {
            const def = mapObjectDefinitionById.get(objectId);
            return def && def.visibility === "onDiscovered" ? [objectId] : [];
          }),
        ),
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
