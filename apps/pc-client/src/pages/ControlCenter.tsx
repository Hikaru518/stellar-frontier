import { useState } from "react";
import { FieldList, GameConsoleLayout, Modal } from "../components/Layout";
import { deriveCrewActionViewModel, type CrewActionViewModel } from "../crewSystem";
import { defaultMapConfig } from "../content/contentData";
import { type CrewId, type CrewMember, type GameMapState, type InvestigationReport, type MapTile, type ResourceSummary, type SystemLog } from "../data/gameData";
import { formatGameTime } from "../timeSystem";
import { getTileLocationLabel } from "../mapSystem";
import type { CrewActionState, EventLog, Objective, RuntimeCall } from "../events/types";
import type { PcMobileStatusCard } from "../App";

interface ControlCenterProps {
  crew: CrewMember[];
  logs: SystemLog[];
  eventLogs: EventLog[];
  objectives: Record<string, Objective>;
  resources: ResourceSummary;
  map: GameMapState;
  crewActions: Record<string, CrewActionState>;
  activeCalls: Record<string, RuntimeCall>;
  elapsedGameSeconds: number;
  tiles: MapTile[];
  gameTimeLabel: string;
  hasQuestUpdates: boolean;
  isMapAvailable: boolean;
  onOpenStation: () => void;
  onOpenMap: () => void;
  onStartCall: (crewId: CrewMember["id"]) => void;
  runtimeCallCrewIds?: string[];
  mobileStatus?: PcMobileStatusCard;
  onShowCrewStatus: (crewId: CrewId) => void;
  onShowCrewInventory: (crewId: CrewId) => void;
}

export function ControlCenter({
  crew,
  logs,
  eventLogs,
  objectives,
  resources,
  map,
  crewActions,
  activeCalls,
  elapsedGameSeconds,
  tiles,
  gameTimeLabel,
  hasQuestUpdates,
  isMapAvailable,
  onOpenStation,
  onOpenMap,
  onStartCall,
  runtimeCallCrewIds = [],
  mobileStatus,
  onShowCrewStatus,
  onShowCrewInventory,
}: ControlCenterProps) {
  const [reportId, setReportId] = useState<string | null>(null);
  const runtimeCallCrewIdSet = new Set(runtimeCallCrewIds);
  const incomingCrew = crew.filter((member) => member.hasIncoming || runtimeCallCrewIdSet.has(member.id));
  const incomingCount = incomingCrew.length;
  const report = reportId ? map.investigationReportsById[reportId] : undefined;
  const visibleEventLogs = eventLogs
    .filter((log) => log.visibility === "player_visible")
    .slice()
    .sort((left, right) => right.occurred_at - left.occurred_at || right.id.localeCompare(left.id))
    .slice(0, 3);
  const objectiveList = Object.values(objectives).sort((left, right) => right.created_at - left.created_at || right.id.localeCompare(left.id));
  const latestLog = logs[logs.length - 1];
  const crewActionViews = Object.fromEntries(
    crew.map((member) => [
      member.id,
      deriveCrewActionViewModel({
        member,
        crewActions,
        activeCalls,
        elapsedGameSeconds,
        tiles,
      }),
    ]),
  ) as Record<CrewId, CrewActionViewModel>;
  const navItems = [
    { id: "control", label: "控制台", meta: "main", active: true },
    { id: "task", label: "任务", meta: "task", attention: hasQuestUpdates, onClick: onOpenStation },
    { id: "map", label: "地图", meta: isMapAvailable ? "map" : "offline", onClick: onOpenMap, disabled: !isMapAvailable, disabledReason: "修复雷达装置后可用" },
  ];
  return (
    <>
      <GameConsoleLayout
        title="前沿基地控制中心"
        subtitle=""
        gameTimeLabel={gameTimeLabel}
        statusItems={[
          { label: "signal", value: `未读通讯 ${incomingCount}` },
          { label: "objectives", value: objectiveList.length ? `${objectiveList.length} 条` : "0 条" },
          { label: "mobile", value: mobileStatusLabel(mobileStatus) },
          { label: "sync", value: mobileStatus?.mode === "active" ? "68%" : "41%" },
        ]}
        navItems={navItems}
        crewPanel={
          <CrewLinkPanel
            crew={crew}
            map={map}
            crewActionViews={crewActionViews}
            incomingCrewIds={new Set(incomingCrew.map((member) => member.id))}
            onStartCall={onStartCall}
            onOpenDetail={onShowCrewStatus}
            onOpenInventory={onShowCrewInventory}
          />
        }
        rightPanel={<section className="console-side-panel console-right-empty" aria-hidden="true" />}
        bottomBar={
          <div className="console-bottom-strip">
            <strong>] LOG:</strong>
            <span>{latestLog ? latestLog.text : "控制中心在线。"}</span>
          </div>
        }
      >
        <div className="console-screen-content">
          <div className="console-screen-header">
            <span>crt situation board</span>
            <strong>前沿基地控制中心 / Frontline Base Control</strong>
            <span>status / overview / system log</span>
          </div>

          <div className="console-screen-body">
            <div className="console-screen-block">
              <p className="console-screen-command">] RUN CONTROL-CENTER.BAS</p>
              <p className="console-screen-line console-screen-line-cyan">BASE STATUS: FRONTIER OUTPOST / PRIMARY LOOP STABLE</p>
            </div>

            <div className="console-screen-block">
              <p className="console-screen-section">[ FACILITIES ]</p>
              <p>1) COMMUNICATION STATION ......... {incomingCount ? "INCOMING" : "READY"}</p>
              <p>2) SATELLITE RADAR MAP .......... {isMapAvailable ? "ONLINE" : "OFFLINE / REPAIR RADAR"}</p>
              <p>3) MISSION BOARD ................ {objectiveList.length ? "TRACKING" : "IDLE"}</p>
              <p>4) FIELD SUPPORT ................ {resources.baseIntegrity >= 70 ? "STABLE" : "RISK"}</p>
            </div>

            <div className="console-screen-block">
              <p className="console-screen-section">[ EVENT SITUATION ]</p>
              <p className="console-screen-line console-screen-line-amber">
                ACTIVE CASE: {visibleEventLogs[0]?.summary ?? "暂无需要立即处理的事件。"}
              </p>
              <p className="console-screen-line console-screen-line-rose">
                PRIORITY: {incomingCount ? "CALLBACK REQUIRED" : objectiveList.length ? "OBJECTIVE WATCH" : "LOW"}
              </p>
            </div>

            <div className="console-screen-block">
              <p className="console-screen-section">[ CREW LINK ]</p>
              {crew.map((member, index) => (
                <p key={member.id}>
                  {index + 1}) {member.name.toUpperCase()} {getTileLocationLabel(defaultMapConfig, member.currentTile, map).toUpperCase()} / {member.status.toUpperCase()}
                </p>
              ))}
            </div>

            <div className="console-screen-block">
              <p className="console-screen-section">[ LOG FEED ]</p>
              {(latestLog ? logs.slice(-4) : []).map((log) => (
                <p
                  key={log.id}
                  className={
                    log.tone === "danger"
                      ? "console-screen-line console-screen-line-rose"
                      : log.tone === "accent"
                        ? "console-screen-line console-screen-line-cyan"
                        : undefined
                  }
                >
                  [{log.time}] {log.text}
                </p>
              ))}
            </div>

            <div className="console-screen-block">
              <p className="console-screen-command">] SHORTCUT [T] TASK [R] RADAR [C] CALL</p>
              <p className="console-screen-line">{incomingCount ? "READY FOR INCOMING CHANNEL." : "READY."}</p>
            </div>
          </div>
        </div>
      </GameConsoleLayout>
      {report ? (
        <Modal title="调查报告" onClose={() => setReportId(null)}>
          <InvestigationReportView report={report} crew={crew} />
        </Modal>
      ) : null}

    </>
  );
}

function CrewLinkPanel({
  crew,
  map,
  crewActionViews,
  incomingCrewIds,
  onStartCall,
  onOpenDetail,
  onOpenInventory,
}: {
  crew: CrewMember[];
  map: GameMapState;
  crewActionViews: Record<CrewId, CrewActionViewModel>;
  incomingCrewIds: Set<CrewMember["id"]>;
  onStartCall: (crewId: CrewMember["id"]) => void;
  onOpenDetail: (crewId: CrewMember["id"]) => void;
  onOpenInventory: (crewId: CrewMember["id"]) => void;
}) {
  return (
    <div className="console-crew-stack">
      {crew.map((member) => {
        const actionView = crewActionViews[member.id];
        const timingText = actionView.blockingReason ?? actionView.timingText;
        return (
          <article key={member.id} className={`console-crew-card ${incomingCrewIds.has(member.id) ? "console-crew-card-alert" : ""}`}>
            <div className="console-crew-avatar">{member.name.slice(0, 1)}</div>
            <div className="console-crew-copy">
              <div className="console-crew-heading">
                <strong>{member.name}</strong>
                <span>{member.role}</span>
                <span className={`console-crew-state-inline ${member.canCommunicate ? "console-crew-state-success" : "console-crew-state-danger"}`}>
                  {member.canCommunicate ? "在线" : "失联"}
                </span>
              </div>
              <p>{getTileLocationLabel(defaultMapConfig, member.currentTile, map)}</p>
              <p>{actionView.statusText}</p>
              {timingText ? <p>{timingText}</p> : null}
            </div>
            <div className="console-crew-actions">
              <button type="button" className="console-crew-button console-crew-button-secondary" onClick={() => onOpenDetail(member.id)}>
                查看状态
              </button>
              <button type="button" className="console-crew-button console-crew-button-secondary" onClick={() => onOpenInventory(member.id)}>
                查看背包
              </button>
              <button
                type="button"
                className={`console-crew-button ${incomingCrewIds.has(member.id) ? "console-crew-button-incoming" : ""}`}
                onClick={() => onStartCall(member.id)}
                disabled={!member.canCommunicate && !incomingCrewIds.has(member.id)}
              >
                {incomingCrewIds.has(member.id) ? "接通" : "通话"}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function mobileStatusLabel(status?: PcMobileStatusCard) {
  if (!status) {
    return "N/A";
  }
  if (status.mode === "active") {
    return "ACTIVE";
  }
  if (status.mode === "fallback") {
    return "FALLBACK";
  }
  return "WAIT";
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
          ["区块", report.tileId],
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
