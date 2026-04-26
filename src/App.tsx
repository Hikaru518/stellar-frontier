import { useEffect, useMemo, useState } from "react";
import { CallPage } from "./pages/CallPage";
import { CommunicationStation } from "./pages/CommunicationStation";
import { ControlCenter } from "./pages/ControlCenter";
import { MapPage } from "./pages/MapPage";
import {
  initialCrew,
  initialLogs,
  initialTiles,
  resources as initialResources,
  type ActiveAction,
  type ActionStatus,
  type CallContext,
  type CrewId,
  type CrewMember,
  type MapReturnTarget,
  type MapTile,
  type PageId,
  type ResourceSummary,
  type SystemLog,
  type Tone,
} from "./data/gameData";
import { formatDuration, formatGameTime, loadGameSave, saveGameState } from "./timeSystem";

interface GameState {
  elapsedGameSeconds: number;
  crew: CrewMember[];
  tiles: MapTile[];
  logs: SystemLog[];
  resources: ResourceSummary;
}

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
}

function App() {
  const initialState = useMemo(createInitialGameState, []);
  const [gameState, setGameState] = useState<GameState>(initialState);
  const [page, setPage] = useState<PageId>("control");
  const [currentCall, setCurrentCall] = useState<CallContext | null>(null);
  const [mapReturnTarget, setMapReturnTarget] = useState<MapReturnTarget>("control");

  const { elapsedGameSeconds, crew, tiles, logs, resources } = gameState;
  const gameTimeLabel = formatGameTime(elapsedGameSeconds);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGameState((state) => settleGameTime({ ...state, elapsedGameSeconds: state.elapsedGameSeconds + 1 }));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

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

  function startCall(crewId: CrewId) {
    const member = crew.find((item) => item.id === crewId);
    if (!member || member.unavailable) {
      appendLog("通讯台尝试接入失败。信号像一条拒绝工作的蛇。", "muted");
      return;
    }

    const type = member.emergencyEvent && !member.emergencyEvent.settled ? "emergency" : "normal";
    setCurrentCall({ crewId, type, settled: false });
    setGameState((state) => ({
      ...state,
      crew: state.crew.map((item) => (item.id === crewId ? { ...item, hasIncoming: false } : item)),
      logs: appendLogEntry(
        state.logs,
        `${member.name} 的${type === "emergency" ? "紧急来电已接通" : "普通通话已接通"}。`,
        type === "emergency" ? "danger" : "neutral",
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

    const callMember = crew.find((member) => member.id === currentCall.crewId);
    const emergencySettled = callMember?.emergencyEvent?.settled ?? false;
    if (currentCall.settled || emergencySettled) {
      return;
    }

    const decision = resolveDecision(currentCall.crewId, actionId, elapsedGameSeconds);
    if (!decision) {
      return;
    }

    setGameState((state) => {
      const updatedCrew = state.crew.map((member) =>
        member.id === currentCall.crewId
          ? {
              ...member,
              status: decision.status,
              statusTone: decision.tone,
              hasIncoming: false,
              location: decision.location ?? member.location,
              coord: decision.coord ?? member.coord,
              summary: decision.summary,
              activeAction: decision.clearAction ? undefined : decision.activeAction ?? member.activeAction,
              emergencyEvent:
                decision.emergencySettled && member.emergencyEvent ? { ...member.emergencyEvent, settled: true } : member.emergencyEvent,
            }
          : member,
      );

      const updatedTiles = decision.tileUpdate
        ? patchTile(state.tiles, decision.tileUpdate.id, decision.tileUpdate.patch)
        : state.tiles;

      const advancedState = {
        ...state,
        elapsedGameSeconds: state.elapsedGameSeconds + (decision.advanceSeconds ?? 0),
        crew: updatedCrew,
        tiles: updatedTiles,
        logs: appendLogEntry(state.logs, decision.log, decision.tone, state.elapsedGameSeconds),
      };

      return settleGameTime(advancedState);
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

  if (page === "station") {
    return (
      <CommunicationStation
        crew={crew}
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
        elapsedGameSeconds={elapsedGameSeconds}
        gameTimeLabel={gameTimeLabel}
        onDecision={handleDecision}
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
        crew={crew}
        elapsedGameSeconds={elapsedGameSeconds}
        gameTimeLabel={gameTimeLabel}
        returnTarget={mapReturnTarget}
        onReturn={returnFromMap}
      />
    );
  }

  return (
    <ControlCenter
      crew={crew}
      logs={logs}
      resources={resources}
      gameTimeLabel={gameTimeLabel}
      onOpenStation={openStation}
      onOpenMap={() => openMap("control")}
      onAppendLog={appendLog}
    />
  );
}

export default App;

function createInitialGameState(): GameState {
  const saved = loadGameSave<GameState>();

  if (saved && Number.isFinite(saved.elapsedGameSeconds) && saved.crew && saved.tiles && saved.logs && saved.resources) {
    return saved;
  }

  return {
    elapsedGameSeconds: 0,
    crew: initialCrew,
    tiles: initialTiles,
    logs: initialLogs,
    resources: initialResources,
  };
}

function settleGameTime(state: GameState): GameState {
  let changed = false;
  let resources = state.resources;
  let tiles = state.tiles;
  let logs = state.logs;

  const crew = state.crew.map((member) => {
    let nextMember = member;

    if (member.activeAction?.status === "inProgress" && state.elapsedGameSeconds >= member.activeAction.finishTime) {
      const settled = settleCrewAction(member, state.elapsedGameSeconds, resources, tiles, logs);
      nextMember = settled.member;
      resources = settled.resources;
      tiles = settled.tiles;
      logs = settled.logs;
      changed = true;
    }

    if (nextMember.emergencyEvent && !nextMember.emergencyEvent.settled) {
      const settled = settleEmergencyEvent(nextMember, state.elapsedGameSeconds, tiles, logs);
      nextMember = settled.member;
      tiles = settled.tiles;
      logs = settled.logs;
      changed = changed || settled.changed;
    }

    return nextMember;
  });

  return changed ? { ...state, crew, resources, tiles, logs } : state;
}

function settleCrewAction(
  member: CrewMember,
  elapsedGameSeconds: number,
  resources: ResourceSummary,
  tiles: MapTile[],
  logs: SystemLog[],
) {
  const action = member.activeAction;
  if (!action) {
    return { member, resources, tiles, logs };
  }

  if (member.id === "garry" && action.actionType === "gather" && action.resource === "iron") {
    const duration = Math.max(1, action.durationSeconds);
    let nextFinishTime = action.finishTime;
    let completedRounds = 0;

    while (elapsedGameSeconds >= nextFinishTime) {
      completedRounds += 1;
      nextFinishTime += duration;
    }

    const ironYield = (action.perRoundYield ?? 5) * completedRounds;
    return {
      member: {
        ...member,
        status: "在矿床，采矿中。",
        statusTone: "muted" as Tone,
        summary: `已完成 ${completedRounds} 轮采矿，本轮剩余 ${formatDuration(nextFinishTime - elapsedGameSeconds)}。`,
        activeAction: {
          ...action,
          startTime: nextFinishTime - duration,
          finishTime: nextFinishTime,
        },
      },
      resources: { ...resources, iron: resources.iron + ironYield },
      tiles,
      logs: appendLogEntry(logs, `Garry 完成了 ${completedRounds} 轮铁矿采集，获得 ${ironYield} 铁矿石。`, "success", elapsedGameSeconds),
    };
  }

  if (member.id === "mike" && action.actionType === "move") {
    return {
      member: {
        ...member,
        status: "已抵达湖泊边缘，正在观察。",
        statusTone: "neutral" as Tone,
        summary: "Mike 抵达湖泊边缘。湖水仍然拒绝待在地图标注的位置。",
        activeAction: undefined,
      },
      resources,
      tiles: patchTile(tiles, "2-1", { status: "观察中" }),
      logs: appendLogEntry(logs, "Mike 抵达湖泊边缘，开始观察异常水位。", "neutral", elapsedGameSeconds),
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
    };
  }

  if (member.id === "garry" && action.actionType === "survey") {
    return {
      member: {
        ...member,
        status: "矿床异常调查完成。",
        statusTone: "accent" as Tone,
        summary: "Garry 记录了低频震动。矿脉没有解释为什么会哼歌。",
        activeAction: undefined,
      },
      resources,
      tiles: patchTile(tiles, "3-3", { danger: "低频震动已记录", status: "异常已记录" }),
      logs: appendLogEntry(logs, "Garry 完成矿床异常调查，记录低频震动。", "accent", elapsedGameSeconds),
    };
  }

  return {
    member: { ...member, activeAction: undefined },
    resources,
    tiles,
    logs: appendLogEntry(logs, `${member.name} 的行动已完成。`, "neutral", elapsedGameSeconds),
  };
}

function settleEmergencyEvent(member: CrewMember, elapsedGameSeconds: number, tiles: MapTile[], logs: SystemLog[]) {
  const event = member.emergencyEvent;
  if (!event) {
    return { member, tiles, logs, changed: false };
  }

  if (elapsedGameSeconds >= event.deadlineTime) {
    return {
      member: {
        ...member,
        status: "受重伤并失联。",
        statusTone: "danger" as Tone,
        summary: "Amy 错过处理窗口，通讯只剩断续噪声。",
        hasIncoming: false,
        unavailable: true,
        emergencyEvent: { ...event, dangerStage: 4, settled: true },
      },
      tiles: patchTile(tiles, "2-3", { danger: "紧急事件自动结算：Amy 失联", status: "失联" }),
      logs: appendLogEntry(logs, "Amy 的紧急事件超过最终期限，系统按坏结果自动结算。", "danger", elapsedGameSeconds),
      changed: true,
    };
  }

  let nextStage = event.dangerStage;
  let nextEscalationTime = event.nextEscalationTime;
  while (elapsedGameSeconds >= nextEscalationTime && nextEscalationTime < event.deadlineTime) {
    nextStage += 1;
    nextEscalationTime += 30;
  }

  if (nextStage === event.dangerStage) {
    return { member, tiles, logs, changed: false };
  }

  return {
    member: {
      ...member,
      status: `森林危险阶段 ${nextStage}，等待决策。`,
      statusTone: "danger" as Tone,
      summary: "Amy 的情况正在恶化。倒计时没有停止。",
      emergencyEvent: { ...event, dangerStage: nextStage, nextEscalationTime },
    },
    tiles: patchTile(tiles, "2-3", { danger: `大型野兽接近，危险阶段 ${nextStage}`, status: "危险升级" }),
    logs: appendLogEntry(logs, `Amy 的情况正在恶化，危险等级提升到 ${nextStage}。`, "danger", elapsedGameSeconds),
    changed: true,
  };
}

function appendLogEntry(logs: SystemLog[], text: string, tone: Tone, elapsedGameSeconds: number) {
  const id = logs.reduce((highest, log) => Math.max(highest, log.id), 0) + 1;
  return [...logs, { id, time: formatGameTime(elapsedGameSeconds), text, tone }];
}

function patchTile(tiles: MapTile[], id: string, patch: Partial<MapTile>) {
  return tiles.map((tile) => (tile.id === id ? { ...tile, ...patch } : tile));
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
