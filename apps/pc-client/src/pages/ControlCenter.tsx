import { useMemo, useState, type ReactNode } from "react";
import { ConsoleShell, FieldList, Modal, Panel, StatusTag, SystemLogPanel } from "../components/Layout";
import { facilities, type CrewMember, type GameMapState, type InvestigationReport, type ResourceSummary, type SystemLog } from "../data/gameData";
import { formatGameTime } from "../timeSystem";
import type { EventLog, Objective } from "../events/types";

interface ControlCenterProps {
  crew: CrewMember[];
  logs: SystemLog[];
  eventLogs: EventLog[];
  objectives: Record<string, Objective>;
  resources: ResourceSummary;
  map: GameMapState;
  gameTimeLabel: string;
  onOpenStation: () => void;
  onOpenMap: () => void;
  onOpenDebug: () => void;
  onAppendLog: (text: string, tone?: "neutral" | "muted" | "accent" | "danger" | "success") => void;
}

export function ControlCenter({
  crew,
  logs,
  eventLogs,
  objectives,
  resources,
  map,
  gameTimeLabel,
  onOpenStation,
  onOpenMap,
  onOpenDebug,
  onAppendLog,
}: ControlCenterProps) {
  const [modal, setModal] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const incomingCrew = crew.filter((member) => member.hasIncoming);
  const incomingCount = incomingCrew.length;
  const incomingNames = incomingCrew.map((member) => member.name).join("、");
  const report = reportId ? map.investigationReportsById[reportId] : undefined;
  const visibleEventLogs = eventLogs
    .filter((log) => log.visibility === "player_visible")
    .slice()
    .sort((left, right) => right.occurred_at - left.occurred_at || right.id.localeCompare(left.id))
    .slice(0, 3);
  const objectiveList = Object.values(objectives).sort((left, right) => right.created_at - left.created_at || right.id.localeCompare(left.id));

  const modalContent = useMemo(() => getFacilityModal(modal, resources), [modal, resources]);

  function handleFacility(id: string) {
    if (id === "station") {
      onOpenStation();
      return;
    }

    if (id === "radar") {
      onOpenMap();
      return;
    }

    setModal(id);
    const logText = facilityLog[id] ?? "控制中心记录了一次没有登记用途的点击。";
    onAppendLog(logText, id === "research" || id === "trade" ? "muted" : "neutral");
  }

  return (
    <ConsoleShell
      title="前沿基地控制中心"
      subtitle={`SOL ${String(resources.sol).padStart(3, "0")} / 本地供电 ${resources.power}% / 通讯窗口：${resources.commWindow}`}
      gameTimeLabel={gameTimeLabel}
      actions={
        <>
          <StatusTag tone={incomingCount > 0 ? "danger" : "muted"}>未读通讯 {incomingCount}</StatusTag>
          <button type="button" className="debug-button" onClick={onOpenDebug}>
            [DEBUG]
          </button>
        </>
      }
    >
      <div className="control-layout">
        <Panel title="中控台摘要" className="resource-summary">
          <FieldList
            rows={[
              ["能源", resources.energy],
              ["铁矿", resources.iron],
              ["基地完整度", `${resources.baseIntegrity}%`],
              ["通讯提示", incomingCount ? `${incomingNames || "未知队员"} 正在请求接入` : "暂无新的通讯请求。"],
            ]}
          />
        </Panel>

        <div className="facility-grid">
          {facilities.map((facility) => (
            <button
              type="button"
              key={facility.id}
              className={`facility-card ${facility.variant ? `facility-${facility.variant}` : ""}`}
              onClick={() => handleFacility(facility.id)}
            >
              <span className="facility-label">{facility.label}</span>
              <span className={facility.id === "station" && incomingCount ? "facility-alert" : "facility-sub"}>
                {facility.id === "station" && incomingCount ? `${incomingCount} 条来电 · ${incomingNames || "未知队员"}` : facility.subLabel}
              </span>
            </button>
          ))}
        </div>

        <Panel title="当前建议" className="control-hint" tone={incomingCount ? "accent" : "neutral"}>
          <p>
            {incomingCount
              ? "先处理通讯台来电。"
              : "暂无紧急请求。可查看通讯台、地图或调试工具。"}
          </p>
        </Panel>

        <Panel title="事件态势" className="control-hint" tone={visibleEventLogs.length || objectiveList.length ? "accent" : "neutral"}>
          <FieldList
            rows={[
              ["近期事件", visibleEventLogs.length ? `${visibleEventLogs.length} 条可见记录` : "暂无事件记录。"],
              ["目标状态", objectiveList.length ? `${objectiveList.length} 条事件目标` : "暂无事件目标。"],
            ]}
          />
          {visibleEventLogs.length ? (
            <ol className="diary-list">
              {visibleEventLogs.map((log) => (
                <li key={log.id}>
                  <div className="diary-meta">
                    <span>{formatEventTime(log.occurred_at)}</span>
                    <StatusTag tone={log.importance === "major" || log.importance === "critical" ? "accent" : "muted"}>
                      {formatEventImportance(log.importance)}
                    </StatusTag>
                  </div>
                  <p>{log.summary}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </Panel>

        <SystemLogPanel logs={logs} onOpenReport={setReportId} />
      </div>

      {modal && modalContent ? (
        <Modal title={modalContent.title} onClose={() => setModal(null)}>
          {modalContent.body}
        </Modal>
      ) : null}

      {report ? (
        <Modal title="调查报告" onClose={() => setReportId(null)}>
          <InvestigationReportView report={report} crew={crew} />
        </Modal>
      ) : null}
    </ConsoleShell>
  );
}

function InvestigationReportView({ report, crew }: { report: InvestigationReport; crew: CrewMember[] }) {
  const member = crew.find((item) => item.id === report.crewId);
  const environment = report.environment;
  return (
    <div className="report-modal">
      <FieldList
        rows={[
          ["队员", member?.name ?? report.crewId],
          ["时间", formatGameTime(report.createdAtGameSeconds)],
          ["区域", report.areaName],
          ["坐标", report.playerCoord],
          ["地形", report.terrain],
          ["天气", report.weather],
          ["温度", `${environment.temperatureCelsius} °C`],
          ["湿度", `${environment.humidityPercent}%`],
          ["磁场", `${environment.magneticFieldMicroTesla} μT`],
          ["辐射", environment.radiationLevel],
          ["毒性", environment.toxicityLevel ?? "none"],
          ["气压", environment.atmosphericPressureKpa ? `${environment.atmosphericPressureKpa} kPa` : "未知"],
        ]}
      />
      <section>
        <h3>揭示对象</h3>
        {report.revealedObjects.length ? <ul>{report.revealedObjects.map((object) => <li key={object.id}>{object.name}</li>)}</ul> : <p>未确认新的地块对象</p>}
      </section>
      <section>
        <h3>特殊状态</h3>
        {report.revealedSpecialStates.length ? (
          <ul>{report.revealedSpecialStates.map((state) => <li key={state.id}>{state.name}</li>)}</ul>
        ) : (
          <p>未确认新的特殊状态</p>
        )}
      </section>
    </div>
  );
}

const facilityLog: Record<string, string> = {
  window: "外部观察入口已打开。该模块暂未接入实时数据。",
  console: "中控台资源摘要已打开。",
  coffee: "休息终端入口已打开。该模块暂未接入玩法效果。",
  record: "音频终端入口已打开。该模块暂未接入玩法效果。",
  fridge: "物资柜入口已打开。该模块暂未接入玩法效果。",
  research: "研究台入口已登记，当前未供电。",
  trade: "星际贸易入口已登记，当前等待授权。",
  gate: "星际之门入口已登记，当前等待授权。",
};

function formatEventTime(seconds: number) {
  return `T+${seconds}s`;
}

function formatEventImportance(importance: EventLog["importance"]) {
  if (importance === "critical") {
    return "紧急";
  }
  if (importance === "major") {
    return "重要";
  }
  if (importance === "normal") {
    return "记录";
  }
  return "简报";
}

function getFacilityModal(id: string | null, resources: ResourceSummary): { title: string; body: ReactNode } | null {
  switch (id) {
    case "window":
      return {
        title: "外部观察",
        body: (
          <>
            <div className="image-placeholder">外部观察图像占位</div>
            <p>该入口尚未接入实时外部观察数据。</p>
          </>
        ),
      };
    case "console":
      return {
        title: "中控台 / 资源状态",
        body: (
          <FieldList
            rows={[
              ["能源", resources.energy],
              ["铁矿", resources.iron],
              ["木材", resources.wood],
              ["基地完整度", `${resources.baseIntegrity}%`],
            ]}
          />
        ),
      };
    case "coffee":
      return {
        title: "休息终端",
        body: <p>该入口尚未接入玩法效果。</p>,
      };
    case "record":
      return {
        title: "音频终端",
        body: <p>该入口尚未接入玩法效果。</p>,
      };
    case "fridge":
      return {
        title: "物资柜",
        body: <p>该入口尚未接入玩法效果。</p>,
      };
    case "research":
      return {
        title: "研究台",
        body: <p>科技树入口已登记，但研究台当前未供电。</p>,
      };
    case "trade":
      return {
        title: "星际贸易",
        body: <p>资源交换入口已登记，当前等待授权。</p>,
      };
    case "gate":
      return {
        title: "星际之门",
        body: <p>星际之门入口已登记，当前等待授权。</p>,
      };
    default:
      return null;
  }
}
