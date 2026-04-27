import { useEffect, useMemo, useState } from "react";
import { CallPage } from "./pages/CallPage";
import { CommunicationStation } from "./pages/CommunicationStation";
import { ControlCenter } from "./pages/ControlCenter";
import { DebugToolbox, type TimeMultiplier } from "./pages/DebugToolbox";
import { MapPage } from "./pages/MapPage";
import { advanceCrewMovement, createMovePreview, normalizeCrewMember, startCrewMove, syncTileCrew } from "./crewSystem";
import { appendDiaryEntry } from "./diarySystem";
import { eventContentLibrary } from "./content/contentData";
import { buildEventContentIndex } from "./events/contentIndex";
import { completeObjective, processEventWakeups, processTrigger, selectCallOption } from "./events/eventEngine";
import type { GraphRunnerGameState } from "./events/graphRunner";
import {
  createEmptyEventRuntimeState,
  type CrewState,
  type EventRuntimeState,
  type Id,
  type InventoryState,
  type RuntimeCall,
  type TileState,
  type TriggerContext,
} from "./events/types";
import { addInventoryItem, type InventoryEntry } from "./inventorySystem";
import { defaultMapConfig } from "./content/contentData";
import { canMoveToTile, deriveLegacyTiles, getTileLocationLabel, getVisibleTileWindow } from "./mapSystem";
import {
  createBaseInventoryFromResources,
  createInitialMapState,
  initialCrew,
  initialLogs,
  resources as initialResources,
  type ActiveAction,
  type ActionStatus,
  type CallContext,
  type CrewId,
  type GameState,
  type CrewMember,
  type GameMapState,
  type InvestigationReport,
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

interface DecisionResult {
  status: string;
  summary: string;
  result: string;
  log: string;
  tone: Tone;
  location?: string;
  coord?: string;
  tileUpdate?: {
    id: string;
    patch: Partial<MapTile>;
  };
  activeAction?: ActiveAction;
  clearAction?: boolean;
  emergencySettled?: boolean;
  advanceSeconds?: number;
  unavailable?: boolean;
  canCommunicate?: boolean;
  conditions?: string[];
  inventory?: InventoryEntry[];
  baseInventory?: InventoryEntry[];
  resources?: ResourceSummary;
  logs?: SystemLog[];
}

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

    const decision = resolveDecision(currentCall.crewId, actionId, elapsedGameSeconds);
    if (!decision) {
      return;
    }

    setGameState((state) => {
      const updatedCrew = state.crew.map((member) => {
        if (member.id !== currentCall.crewId) {
          return member;
        }

        const nextMember = {
          ...member,
          status: decision.status,
          statusTone: decision.tone,
          hasIncoming: false,
          location: decision.location ?? member.location,
          coord: decision.coord ?? member.coord,
          summary: decision.summary,
          activeAction: decision.clearAction ? undefined : decision.activeAction ?? member.activeAction,
          unavailable: decision.unavailable ?? member.unavailable,
          canCommunicate: decision.canCommunicate ?? member.canCommunicate,
          conditions: decision.conditions ?? member.conditions,
          inventory: decision.inventory ?? member.inventory,
        };

        return nextMember;
      });

      const updatedMap = decision.tileUpdate ? patchMapFromLegacyTile(state.map, decision.tileUpdate.id, decision.tileUpdate.patch) : state.map;
      const updatedTiles = decision.tileUpdate ? patchTile(deriveLegacyTiles(defaultMapConfig, updatedMap), decision.tileUpdate.id, decision.tileUpdate.patch) : state.tiles;

      const advancedState = {
        ...state,
        elapsedGameSeconds: state.elapsedGameSeconds + (decision.advanceSeconds ?? 0),
        crew: updatedCrew,
        map: syncMapCrew(updatedMap, updatedCrew),
        tiles: updatedTiles,
        baseInventory: decision.baseInventory ?? state.baseInventory,
        resources: decision.resources ?? state.resources,
        logs: decision.logs ?? appendLogEntry(state.logs, decision.log, decision.tone, state.elapsedGameSeconds),
      };

      const settledState = settleGameTime(advancedState);
      return actionId === "standby"
        ? processAppEventTrigger(settledState, {
            trigger_type: "idle_time",
            occurred_at: settledState.elapsedGameSeconds,
            source: "crew_action",
            crew_id: currentCall.crewId,
            tile_id: updatedCrew.find((member) => member.id === currentCall.crewId)?.currentTile ?? null,
            action_id: null,
            payload: { action_type: "standby" },
          })
        : settledState;
    });

    setCurrentCall((call) =>
      call
        ? {
            ...call,
            settled: actionId === "wait" ? false : true,
            result: decision.result,
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
      const completedActionType = member.activeAction.actionType;
      const completedActionId = member.activeAction.id;
      const settled = settleCrewAction(member, state.elapsedGameSeconds, resources, tiles, logs, map);
      nextMember = settled.member;
      resources = settled.resources;
      tiles = settled.tiles;
      logs = settled.logs;
      map = settled.map;
      changed = true;

      if (shouldTriggerActionComplete(completedActionType)) {
        triggerContexts.push({
          trigger_type: "action_complete",
          occurred_at: state.elapsedGameSeconds,
          source: "crew_action",
          crew_id: nextMember.id,
          tile_id: nextMember.currentTile,
          action_id: completedActionId,
          payload: { action_type: completedActionType },
        });
      }
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
  tiles: MapTile[],
  logs: SystemLog[],
  map: GameMapState,
) {
  const action = member.activeAction;
  if (!action) {
    return { member, resources, tiles, logs, map };
  }

  if (member.id === "garry" && action.actionType === "gather" && (action.resource === "iron" || action.resource === "iron_ore")) {
    const duration = Math.max(1, action.durationSeconds);
    let nextFinishTime = action.finishTime;
    let completedRounds = 0;

    while (elapsedGameSeconds >= nextFinishTime) {
      completedRounds += 1;
      nextFinishTime += duration;
    }

    const ironYield = (action.perRoundYield ?? 5) * completedRounds;
    const nextMember = appendDiaryEntry(
      {
        ...member,
        inventory: addInventoryItem(member.inventory, "iron_ore", ironYield),
        status: "在矿床，采矿中。",
        statusTone: "muted" as Tone,
        summary: `已完成 ${completedRounds} 轮采矿，本轮剩余 ${formatDuration(nextFinishTime - elapsedGameSeconds)}。`,
        activeAction: {
          ...action,
          startTime: nextFinishTime - duration,
          finishTime: nextFinishTime,
        },
      },
      {
        entryId: "garry_mining_round_1",
        triggerNode: "采矿结算",
        gameSecond: elapsedGameSeconds,
        text: "矿脉的声音比昨天低一点。年轻人会说这是数据波动，我会说这是它在提醒你别贪。",
      },
    );

    return {
      member: nextMember,
      resources,
      tiles,
      logs: appendLogEntry(logs, `Garry 完成了 ${completedRounds} 轮铁矿采集，获得 ${ironYield} 铁矿石。`, "success", elapsedGameSeconds),
      map,
    };
  }

  if (member.id === "mike" && action.actionType === "move") {
    return {
      member: appendArrivalDiary(
        {
          ...member,
          status: "已抵达湖泊边缘，正在观察。",
          statusTone: "neutral" as Tone,
          summary: "Mike 抵达湖泊边缘。湖水仍然拒绝待在地图标注的位置。",
          activeAction: undefined,
        },
        elapsedGameSeconds,
      ),
      resources,
      tiles: patchTile(tiles, "2-1", { status: "观察中" }),
      logs: appendLogEntry(logs, "Mike 抵达湖泊边缘，开始观察异常水位。", "neutral", elapsedGameSeconds),
      map,
    };
  }

  if (member.id === "garry" && action.actionType === "build") {
    return {
      member: {
        ...member,
        status: "临时支架安装完成，恢复采矿待命。",
        statusTone: "success" as Tone,
        summary: "Garry 完成临时支架安装，并要求把它叫作工程，不要叫摆架子。",
        activeAction: undefined,
      },
      resources,
      tiles: patchTile(tiles, "3-3", { buildings: ["采矿厂：铁 #2", "临时支架"], status: "设施已加固" }),
      logs: appendLogEntry(logs, "丘陵地块的临时支架已安装完成。", "success", elapsedGameSeconds),
      map,
    };
  }

  if (member.id === "garry" && action.actionType === "survey") {
    const surveyedMember = appendDiaryEntry(
      {
        ...member,
        status: "调查完成，待命中。",
        statusTone: "neutral" as Tone,
        summary: "Garry 完成了一轮调查，正在回报发现。",
        activeAction: undefined,
      },
      {
        entryId: `garry_survey_${member.currentTile.replace("-", "_")}_${elapsedGameSeconds}`,
        triggerNode: "矿床调查",
        gameSecond: elapsedGameSeconds,
        text: "温度计这次没骗人。岩壁里面有一段空声，像有人把矿脉掏走又后悔了。",
      },
    );
    const withExpertise = applySurveyExpertiseBonus(surveyedMember, resources, logs, elapsedGameSeconds);
    const investigation = completeInvestigation(map, member.currentTile, member.id, elapsedGameSeconds);

    return {
      member: withExpertise.member,
      resources: withExpertise.resources,
      tiles: patchTile(deriveLegacyTiles(defaultMapConfig, investigation.map), member.currentTile, { investigated: true, status: "已调查" }),
      logs: appendLogEntry(withExpertise.logs, `${member.name} 完成一轮调查。`, "neutral", elapsedGameSeconds, investigation.report.id),
      map: investigation.map,
    };
  }

  if (member.id === "mike" && action.actionType === "survey") {
    const surveyedMember = appendDiaryEntry(
      {
        ...member,
        status: "调查完成，待命中。",
        statusTone: "neutral" as Tone,
        summary: "Mike 完成调查。他的报告比地图更像地图。",
        activeAction: undefined,
      },
      {
        entryId: `mike_survey_${member.currentTile.replace("-", "_")}_${elapsedGameSeconds}`,
        triggerNode: "野外调查",
        gameSecond: elapsedGameSeconds,
        text: "废弃营地里没有人，但有太多被匆忙丢下的东西。人离开时通常比地图诚实。",
      },
    );
    const withExpertise = applySurveyExpertiseBonus(surveyedMember, resources, logs, elapsedGameSeconds);
    const investigation = completeInvestigation(map, member.currentTile, member.id, elapsedGameSeconds);

    return {
      member: withExpertise.member,
      resources: withExpertise.resources,
      tiles: patchTile(deriveLegacyTiles(defaultMapConfig, investigation.map), member.currentTile, { investigated: true, status: "已调查" }),
      logs: appendLogEntry(withExpertise.logs, `${member.name} 完成一轮调查。`, "neutral", elapsedGameSeconds, investigation.report.id),
      map: investigation.map,
    };
  }

  return {
    member: { ...member, activeAction: undefined },
    resources,
    tiles,
    logs: appendLogEntry(logs, `${member.name} 的行动已完成。`, "neutral", elapsedGameSeconds),
    map,
  };
}

function shouldTriggerActionComplete(actionType: ActiveAction["actionType"]) {
  return actionType === "survey" || actionType === "gather" || actionType === "build";
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

  return {
    ...state,
    crew: views.crew,
    tiles: views.tiles,
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
    danger_tags: tile.dangerTags ?? (tile.danger === "未发现即时危险" ? [] : [tile.danger]),
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

function appendLogEntry(logs: SystemLog[], text: string, tone: Tone, elapsedGameSeconds: number, reportId?: string) {
  const id = logs.reduce((highest, log) => Math.max(highest, log.id), 0) + 1;
  return [...logs, { id, time: formatGameTime(elapsedGameSeconds), text, tone, ...(reportId ? { reportId } : {}) }];
}

function completeInvestigation(map: GameMapState, tileId: string, crewId: CrewId, elapsedGameSeconds: number) {
  const configTile = defaultMapConfig.tiles.find((tile) => tile.id === tileId);
  const previous = map.tilesById[tileId] ?? {};
  const reportId = `investigation-${tileId.replace("-", "_")}-${crewId}-${elapsedGameSeconds}`;

  if (!configTile) {
    const report: InvestigationReport = {
      id: reportId,
      tileId,
      crewId,
      createdAtGameSeconds: elapsedGameSeconds,
      areaName: tileId,
      playerCoord: tileId,
      terrain: "未知",
      weather: "未知",
      environment: { temperatureCelsius: 0, humidityPercent: 0, magneticFieldMicroTesla: 0, radiationLevel: "unknown" },
      revealedObjects: [],
      revealedSpecialStates: [],
    };
    return { report, map: { ...map, investigationReportsById: { ...map.investigationReportsById, [reportId]: report } } };
  }

  const revealedObjectIds = configTile.objects.filter((object) => object.visibility === "onInvestigated").map((object) => object.id);
  const activeStateIds = previous.activeSpecialStateIds ?? configTile.specialStates.filter((state) => state.startsActive).map((state) => state.id);
  const revealedSpecialStateIds = configTile.specialStates
    .filter((state) => state.visibility === "onInvestigated" && activeStateIds.includes(state.id))
    .map((state) => state.id);
  const origin = defaultMapConfig.tiles.find((tile) => tile.id === defaultMapConfig.originTileId);
  const playerCoord = origin ? `(${configTile.col - origin.col},${origin.row - configTile.row})` : `(${configTile.row},${configTile.col})`;
  const report: InvestigationReport = {
    id: reportId,
    tileId,
    crewId,
    createdAtGameSeconds: elapsedGameSeconds,
    areaName: configTile.areaName,
    playerCoord,
    terrain: configTile.terrain,
    weather: configTile.weather,
    environment: configTile.environment,
    revealedObjects: configTile.objects
      .filter((object) => revealedObjectIds.includes(object.id) && !(previous.revealedObjectIds ?? []).includes(object.id))
      .map((object) => ({ id: object.id, name: object.name, kind: object.kind })),
    revealedSpecialStates: configTile.specialStates
      .filter((state) => revealedSpecialStateIds.includes(state.id) && !(previous.revealedSpecialStateIds ?? []).includes(state.id))
      .map((state) => ({ id: state.id, name: state.name, severity: state.severity })),
  };

  return {
    report,
    map: {
      ...map,
      discoveredTileIds: map.discoveredTileIds.includes(tileId) ? map.discoveredTileIds : [...map.discoveredTileIds, tileId],
      investigationReportsById: { ...map.investigationReportsById, [reportId]: report },
      tilesById: {
        ...map.tilesById,
        [tileId]: {
          ...previous,
          discovered: true,
          investigated: true,
          status: "已调查",
          revealedObjectIds: addUnique(previous.revealedObjectIds ?? [], ...revealedObjectIds),
          revealedSpecialStateIds: addUnique(previous.revealedSpecialStateIds ?? [], ...revealedSpecialStateIds),
          lastInvestigationReportId: reportId,
        },
      },
    },
  };
}

function patchTile(tiles: MapTile[], id: string, patch: Partial<MapTile>) {
  return tiles.map((tile) => (tile.id === id ? { ...tile, ...patch } : tile));
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

function patchMapFromLegacyTile(map: GameMapState, tileId: string, patch: Partial<MapTile>): GameMapState {
  const previous = map.tilesById[tileId] ?? {};
  return {
    ...map,
    tilesById: {
      ...map.tilesById,
      [tileId]: {
        ...previous,
        status: patch.status ?? previous.status,
        investigated: patch.investigated ?? previous.investigated,
        crew: patch.crew ?? previous.crew,
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

function appendEmergencyDiary(member: CrewMember, actionId: string, elapsedGameSeconds: number) {
  if (member.id !== "amy") {
    return member;
  }

  const isLost = member.unavailable || !member.canCommunicate || member.status.includes("失联");
  const entryId = `amy_emergency_${actionId}_${elapsedGameSeconds}`;
  const text = isLost
    ? "如果这条记录能传回去，说明我至少赢了其中一半。另一半正在树后面呼吸。"
    : actionId === "fight"
      ? "我没有计划和野兽进行任何社交活动。结果很难看，但它先退了。"
      : "撤离不是逃跑。撤离是把尖叫留给更需要戏剧性的人。";

  return appendDiaryEntry(member, {
    entryId,
    triggerNode: "森林紧急事件",
    gameSecond: elapsedGameSeconds,
    text,
  });
}

function applySurveyExpertiseBonus(member: CrewMember, resources: ResourceSummary, logs: SystemLog[], elapsedGameSeconds: number) {
  return member.expertise.reduce(
    (state, expertise) => {
      const effect = expertise.ruleEffect;
      if (!effect || effect.type !== "surveyBonus") {
        return state;
      }

      if (effect.tileId && effect.tileId !== member.currentTile) {
        return state;
      }

      const roll = getDeterministicRoll(`${member.id}:${expertise.expertiseId}:${member.currentTile}:${elapsedGameSeconds}`);
      if (roll >= effect.chance) {
        return state;
      }

      const inventory = addInventoryItem(state.member.inventory, effect.resourceId, effect.amount);
      const nextMember = { ...state.member, inventory };
      return {
        member: nextMember,
        resources: state.resources,
        logs: appendLogEntry(state.logs, effect.customLogText, "success", elapsedGameSeconds),
      };
    },
    { member, resources, logs },
  );
}

function getDeterministicRoll(seed: string) {
  let value = 0;
  for (const char of seed) {
    value = (value * 31 + char.charCodeAt(0)) % 233280;
  }

  return ((value * 9301 + 49297) % 233280) / 233280;
}

function resolveDecision(crewId: CrewId, actionId: string, elapsedGameSeconds: number): DecisionResult | null {
  if (crewId === "amy") {
    if (actionId === "run") {
      return {
        status: "撤离中，资源采集中断。",
        summary: "Amy 正在从森林撤离，熊仍然拥有当地解释权。",
        result: "Amy 切断了采集路线并开始撤离。熊没有签署停火协议。",
        log: "Amy 执行撤离。森林地块标记为警戒，资源产出中断。",
        tone: "accent",
        emergencySettled: true,
        tileUpdate: {
          id: "2-3",
          patch: { danger: "大型野兽仍在附近", status: "警戒", crew: ["amy"] },
        },
      };
    }

    if (actionId === "fight") {
      return {
        status: "受伤，击退野兽。",
        summary: "Amy 活下来了。她要求你不要把这称为成功管理。",
        result: "Amy 击退了熊，但通讯里全是喘息和不适合记录的词。",
        log: "Amy 高风险战斗结算：野兽被击退，角色受伤。",
        tone: "danger",
        emergencySettled: true,
        tileUpdate: {
          id: "2-3",
          patch: { danger: "野兽被击退，区域仍危险", status: "危险已缓解", crew: ["amy"] },
        },
      };
    }

    if (actionId === "wait") {
      return {
        status: "躲避中，等待下一步指令。",
        summary: "Amy 暂时稳住了。倒计时没有停止，只是变得更安静。",
        result: "Amy 躲到树后。通讯里传来树枝断裂声，中控台建议你快一点。",
        log: "Amy 暂缓行动。森林危险倒计时推进 30 秒。",
        tone: "danger",
        advanceSeconds: 30,
        tileUpdate: {
          id: "2-3",
          patch: { danger: "大型野兽正在搜索", status: "倒计时推进", crew: ["amy"] },
        },
      };
    }
  }

  if (crewId === "garry") {
    if (actionId === "move") {
      return {
        status: "等待目标坐标指令。",
        summary: "Garry 停下矿镐，开始怀疑地图是否真的比他可靠。",
        result: "Garry 等待目标坐标。请打开地图查看目标，再回到通话确认。",
        log: "Garry 暂停采矿，等待目标坐标。",
        tone: "accent",
        clearAction: true,
        tileUpdate: {
          id: "3-3",
          patch: { status: "等待调度" },
        },
      };
    }

    if (actionId === "build") {
      return {
        status: "安装临时支架中。",
        summary: "Garry 开始安装支架，并要求把维护责任写清楚。",
        result: "Garry 开始安装临时支架。采矿效率可能提高，维护清单肯定增加。",
        log: "Garry 在 (3,3) 安装临时支架。新的维护问题已生成。",
        tone: "success",
        activeAction: createAction("garry-build-support", "build", elapsedGameSeconds, 120, "3-3"),
        tileUpdate: {
          id: "3-3",
          patch: { buildings: ["采矿厂：铁 #2", "临时支架（安装中）"], status: "建设中" },
        },
      };
    }

    if (actionId === "standby") {
      return {
        status: "原地待命，采矿暂停。",
        summary: "Garry 停止采矿。他看起来像终于赢了一局。",
        result: "Garry 原地待命。铁矿产出暂停，但至少没有新的噪音。",
        log: "Garry 停止采矿并原地待命。",
        tone: "muted",
        clearAction: true,
        tileUpdate: {
          id: "3-3",
          patch: { status: "待命", buildings: ["采矿厂：铁 #2"] },
        },
      };
    }

    if (actionId === "survey") {
      return {
        status: "调查矿床异常中。",
        summary: "Garry 开始调查低频震动，并坚称矿脉不会自己唱歌。",
        result: "Garry 开始调查矿床。温度计读数正在用一种不科学的方式上升。",
        log: "Garry 调查矿床异常。(3,3) 出现低频震动记录。",
        tone: "accent",
        activeAction: createAction("garry-survey-mine", "survey", elapsedGameSeconds, 180, "3-3"),
        tileUpdate: {
          id: "3-3",
          patch: { danger: "低频震动", status: "调查中" },
        },
      };
    }
  }

  if (crewId === "mike") {
    if (actionId === "mike-hold") {
      return {
        status: "湖泊边缘待命。",
        summary: "Mike 暂停前进。湖水没有，因此更像一个决定。",
        result: "Mike 停在湖泊边缘。水面继续以不合理的距离靠近。",
        log: "Mike 原地待命，湖泊坐标保持观察。",
        tone: "muted",
        clearAction: true,
        tileUpdate: {
          id: "2-1",
          patch: { status: "观察中" },
        },
      };
    }

    return {
      status: "继续前往湖泊，行进中。",
      summary: "Mike 继续前进，并报告湖泊听起来像正在呼吸。",
      result: "Mike 确认继续前进。通讯延迟增加了 0.4 秒。",
      log: "Mike 继续前往湖泊，路线保持记录。",
      tone: "neutral",
      activeAction: createAction("mike-move-lake", "move", elapsedGameSeconds, 60, "2-1"),
      tileUpdate: {
        id: "2-1",
        patch: { status: "行进路径" },
      },
    };
  }

  return null;
}

function createAction(
  id: string,
  actionType: ActiveAction["actionType"],
  startTime: number,
  durationSeconds: number,
  targetTile?: string,
  status: ActionStatus = "inProgress",
): ActiveAction {
  return {
    id,
    actionType,
    status,
    startTime,
    durationSeconds,
    finishTime: startTime + durationSeconds,
    targetTile,
  };
}
