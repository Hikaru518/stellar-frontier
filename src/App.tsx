import { useState } from "react";
import { CallPage } from "./pages/CallPage";
import { CommunicationStation } from "./pages/CommunicationStation";
import { ControlCenter } from "./pages/ControlCenter";
import { MapPage } from "./pages/MapPage";
import {
  initialCrew,
  initialLogs,
  initialTiles,
  resources,
  type CallContext,
  type CrewId,
  type CrewMember,
  type MapReturnTarget,
  type MapTile,
  type PageId,
  type SystemLog,
  type Tone,
} from "./data/gameData";

function App() {
  const [page, setPage] = useState<PageId>("control");
  const [crew, setCrew] = useState<CrewMember[]>(initialCrew);
  const [tiles, setTiles] = useState<MapTile[]>(initialTiles);
  const [logs, setLogs] = useState<SystemLog[]>(initialLogs);
  const [currentCall, setCurrentCall] = useState<CallContext | null>(null);
  const [mapReturnTarget, setMapReturnTarget] = useState<MapReturnTarget>("control");

  function appendLog(text: string, tone: Tone = "neutral") {
    setLogs((items) => [
      ...items,
      {
        id: Date.now() + items.length,
        time: new Intl.DateTimeFormat("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).format(new Date()),
        text,
        tone,
      },
    ]);
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

    const type = member.hasIncoming ? "emergency" : "normal";
    setCurrentCall({ crewId, type, settled: false });
    setPage("call");
    appendLog(`${member.name} 的${type === "emergency" ? "紧急来电已接通" : "普通通话已接通"}。`, type === "emergency" ? "danger" : "neutral");
  }

  function endCall() {
    if (currentCall && !currentCall.settled) {
      appendLog("通话尚未下达指令，通讯台将其标记为待决策。", "accent");
    }

    setPage("station");
  }

  function handleDecision(actionId: string) {
    if (!currentCall || currentCall.settled) {
      return;
    }

    const decision = resolveDecision(currentCall.crewId, actionId);
    if (!decision) {
      return;
    }

    setCrew((members) =>
      members.map((member) =>
        member.id === currentCall.crewId
          ? {
              ...member,
              status: decision.status,
              statusTone: decision.tone,
              hasIncoming: false,
              location: decision.location ?? member.location,
              coord: decision.coord ?? member.coord,
              summary: decision.summary,
            }
          : member,
      ),
    );

    if (decision.tileUpdate) {
      setTiles((items) =>
        items.map((tile) =>
          tile.id === decision.tileUpdate?.id
            ? {
                ...tile,
                ...decision.tileUpdate.patch,
              }
            : tile,
        ),
      );
    }

    setCurrentCall((call) =>
      call
        ? {
            ...call,
            settled: true,
            result: decision.result,
          }
        : call,
    );

    appendLog(decision.log, decision.tone);
  }

  if (page === "station") {
    return <CommunicationStation crew={crew} onBack={() => setPage("control")} onStartCall={startCall} />;
  }

  if (page === "call") {
    return (
      <CallPage
        call={currentCall}
        crew={crew}
        onDecision={handleDecision}
        onOpenMap={() => openMap("call")}
        onEndCall={endCall}
        onOpenStation={() => setPage("station")}
      />
    );
  }

  if (page === "map") {
    return <MapPage tiles={tiles} crew={crew} returnTarget={mapReturnTarget} onReturn={returnFromMap} />;
  }

  return (
    <ControlCenter
      crew={crew}
      logs={logs}
      resources={resources}
      onOpenStation={openStation}
      onOpenMap={() => openMap("control")}
      onAppendLog={appendLog}
    />
  );
}

export default App;

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
}

function resolveDecision(crewId: CrewId, actionId: string): DecisionResult | null {
  if (crewId === "amy") {
    if (actionId === "run") {
      return {
        status: "撤离中，资源采集中断。",
        summary: "Amy 正在从森林撤离，熊仍然拥有当地解释权。",
        result: "Amy 切断了采集路线并开始撤离。熊没有签署停火协议。",
        log: "Amy 执行撤离。森林地块标记为警戒，资源产出中断。",
        tone: "accent",
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
        log: "Amy 暂缓行动。森林危险倒计时推进。",
        tone: "danger",
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
        tileUpdate: {
          id: "3-3",
          patch: { buildings: ["采矿厂：铁 #2", "临时支架"], status: "建设中" },
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
      tileUpdate: {
        id: "2-1",
        patch: { status: "行进路径" },
      },
    };
  }

  return null;
}
