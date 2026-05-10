import { useMemo, useState, type ReactNode } from "react";
import { FieldList, GameConsoleLayout, Modal, Panel } from "../components/Layout";
import { type CrewId, type CrewMember, type GameMapState, type InvestigationReport, type ResourceSummary, type SystemLog } from "../data/gameData";
import { formatGameTime } from "../timeSystem";
import type { EventLog, Objective } from "../events/types";
import type { PcMobileStatusCard } from "../App";
import { getInventoryView, type InventoryItemView } from "../inventorySystem";

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
  onStartCall: (crewId: CrewMember["id"]) => void;
  onAppendLog: (text: string, tone?: "neutral" | "muted" | "accent" | "danger" | "success") => void;
  mobileStatus?: PcMobileStatusCard;
  consoleViewMode: "overview" | "crewStatus" | "crewInventory";
  consoleViewCrewId: CrewId | null;
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
  gameTimeLabel,
  onOpenStation,
  onOpenMap,
  onOpenDebug,
  onStartCall,
  onAppendLog,
  mobileStatus,
  consoleViewMode,
  consoleViewCrewId,
  onShowCrewStatus,
  onShowCrewInventory,
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
  const mobileActive = mobileStatus?.mode === "active";
  const latestLog = logs[logs.length - 1];
  const detailCrew = consoleViewMode === "crewStatus" && consoleViewCrewId ? crew.find((member) => member.id === consoleViewCrewId) ?? null : null;
  const inventoryCrew = consoleViewMode === "crewInventory" && consoleViewCrewId ? crew.find((member) => member.id === consoleViewCrewId) ?? null : null;
  const selectedConsoleCrew = detailCrew ?? inventoryCrew;
  const navItems = [
    { id: "control", label: "控制台", meta: "main", active: true },
    { id: "task", label: "任务", meta: "task", onClick: onOpenStation },
    { id: "map", label: "地图", meta: "map", onClick: onOpenMap },
  ];

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
            <strong>
              {detailCrew
                ? `${detailCrew.name} / Crew Status`
                : inventoryCrew
                  ? `${inventoryCrew.name} / Inventory`
                  : "前沿基地控制中心 / Frontline Base Control"}
            </strong>
            <span>
              {detailCrew
                ? "status / profile / field condition"
                : inventoryCrew
                  ? "inventory / carried items / response tools"
                  : "status / overview / system log"}
            </span>
          </div>

          <div className="console-screen-body">
            {detailCrew ? (
              <CrewStatusScreen member={detailCrew} eventLogs={eventLogs} />
            ) : inventoryCrew ? (
              <CrewInventoryScreen member={inventoryCrew} />
            ) : (
              <>
                <div className="console-screen-block">
                  <p className="console-screen-command">] RUN CONTROL-CENTER.BAS</p>
                  <p className="console-screen-line console-screen-line-cyan">BASE STATUS: FRONTIER OUTPOST / PRIMARY LOOP STABLE</p>
                </div>

                <div className="console-screen-block">
                  <p className="console-screen-section">[ FACILITIES ]</p>
                  <p>1) COMMUNICATION STATION ......... {incomingCount ? "INCOMING" : "READY"}</p>
                  <p>2) SATELLITE RADAR MAP .......... ONLINE</p>
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
                      {index + 1}) {member.name.toUpperCase()} {member.location.toUpperCase()} / {member.status.toUpperCase()}
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
              </>
            )}

            {selectedConsoleCrew ? (
              <div className="console-screen-block">
                <p className="console-screen-command">] RETURN TO OVERVIEW</p>
                <p className="console-screen-line console-screen-line-cyan">
                  点击左侧其他探员，或再次切换到任务 / 地图继续操作。
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </GameConsoleLayout>

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

    </>
  );
}

function CrewLinkPanel({
  crew,
  incomingCrewIds,
  onStartCall,
  onOpenDetail,
  onOpenInventory,
}: {
  crew: CrewMember[];
  incomingCrewIds: Set<CrewMember["id"]>;
  onStartCall: (crewId: CrewMember["id"]) => void;
  onOpenDetail: (crewId: CrewMember["id"]) => void;
  onOpenInventory: (crewId: CrewMember["id"]) => void;
}) {
  return (
    <div className="console-crew-stack">
      {crew.map((member) => {
        const inventorySummary = member.inventory.length
          ? member.inventory.map((entry) => `${entry.itemId} x${entry.quantity}`).join(" / ")
          : "未记录携带物。";
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
              <p>{member.status}</p>
              <p>位置：{member.location}</p>
              <p>背包：{inventorySummary}</p>
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
                className="console-crew-button"
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

function CrewInventoryList({ member }: { member: CrewMember }) {
  const inventoryView = getInventoryView(member.inventory);

  if (!inventoryView.length) {
    return <p>未记录携带物。</p>;
  }

  return (
    <div className="expertise-list">
      {inventoryView.map((item) => (
        <article key={item.itemId} className="expertise-item">
          <div className="expertise-heading">
            <strong>{item.name}</strong>
            <span>{item.categoryLabel}</span>
          </div>
          <FieldList
            rows={[
              ["数量", `x${item.quantity}`],
              ["分类", item.categoryLabel],
              ["标签", formatInventoryTags(item)],
              ["描述", item.description],
            ]}
          />
        </article>
      ))}
    </div>
  );
}

function CrewStatusScreen({ member, eventLogs }: { member: CrewMember; eventLogs: EventLog[] }) {
  const recentLogs = eventLogs
    .filter((log) => log.visibility === "player_visible" && log.crew_ids.includes(member.id))
    .slice()
    .sort((left, right) => right.occurred_at - left.occurred_at || right.id.localeCompare(left.id))
    .slice(0, 3);

  return (
    <>
      <div className="console-screen-block">
        <p className="console-screen-command">] RUN CREW-STATUS.BAS</p>
        <p className="console-screen-line console-screen-line-cyan">
          CREW: {member.name.toUpperCase()} / ROLE: {member.role.toUpperCase()}
        </p>
      </div>

      <div className="console-screen-block">
        <p className="console-screen-section">[ FIELD CONDITION ]</p>
        <p>STATUS ........ {member.status.toUpperCase()}</p>
        <p>LOCATION ...... {member.location.toUpperCase()}</p>
        <p>LINK .......... {member.canCommunicate ? "ONLINE" : "OFFLINE"}</p>
        <p>VOICE ......... {member.voiceTone.toUpperCase()}</p>
      </div>

      <div className="console-screen-block">
        <p className="console-screen-section">[ PROFILE ]</p>
        <p>ORIGIN ........ {member.profile.originWorld.toUpperCase()}</p>
        <p>PROFESSION .... {member.profile.originProfession.toUpperCase()}</p>
        <p>EXPERIENCE .... {member.profile.experience.toUpperCase()}</p>
      </div>

      <div className="console-screen-block">
        <p className="console-screen-section">[ ATTRIBUTES ]</p>
        <p>PHY {member.attributes.physical} / AGI {member.attributes.agility} / INT {member.attributes.intellect}</p>
        <p>PER {member.attributes.perception} / LUCK {member.attributes.luck}</p>
      </div>

      <div className="console-screen-block">
        <p className="console-screen-section">[ RECENT TRACE ]</p>
        {recentLogs.length ? recentLogs.map((log) => <p key={log.id}>[{log.occurred_at}] {log.summary.toUpperCase()}</p>) : <p>NO PLAYER-VISIBLE EVENT TRACE.</p>}
      </div>
    </>
  );
}

function CrewInventoryScreen({ member }: { member: CrewMember }) {
  const inventoryView = getInventoryView(member.inventory);

  return (
    <>
      <div className="console-screen-block">
        <p className="console-screen-command">] RUN INVENTORY.BAS</p>
        <p className="console-screen-line console-screen-line-cyan">
          CREW: {member.name.toUpperCase()} / CARRIED ITEMS {inventoryView.length}
        </p>
      </div>

      <div className="console-screen-block">
        <p className="console-screen-section">[ INVENTORY ]</p>
        {inventoryView.length ? (
          inventoryView.map((item) => (
            <p key={item.itemId}>
              {item.name.toUpperCase()} X{item.quantity} / {item.categoryLabel.toUpperCase()} / {(item.tagLabels.join(" / ") || "NONE").toUpperCase()}
            </p>
          ))
        ) : (
          <p>NO CARRIED ITEMS.</p>
        )}
      </div>
    </>
  );
}

function MobileCommunicationStatus({ status }: { status: PcMobileStatusCard }) {
  const active = status.mode === "active";
  return (
    <Panel title="移动通讯设备" className="control-hint" tone={active ? "accent" : status.mode === "fallback" ? "danger" : "neutral"}>
      <FieldList
        rows={[
          ["模式", active ? "手机在线，PC 通讯台入口已收起" : status.mode === "fallback" ? "PC fallback 已接管" : "等待手机心跳"],
          ["待处理", `${status.unreadCount} 条通讯 / ${status.emergencyCount} 条紧急`],
          ["最近心跳", status.lastHeartbeatAt ? `${Math.max(0, Math.round((Date.now() - status.lastHeartbeatAt) / 1000))} 秒前` : "未收到"],
          ["fallback", `${Math.round(status.fallbackAfterMs / 1000)} 秒无心跳后恢复 PC 通讯台`],
        ]}
      />
      {active ? <p className="muted-text">请在手机端处理通讯选择；移动指令仍回到 PC 地图确认。</p> : null}
    </Panel>
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

function formatInventoryTags(item: InventoryItemView) {
  return item.tagLabels.length ? item.tagLabels.join(" / ") : "无";
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
