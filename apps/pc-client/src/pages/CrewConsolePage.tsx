import { useMemo } from "react";
import { GameConsoleLayout } from "../components/Layout";
import { deriveCrewActionViewModel, type CrewActionViewModel } from "../crewSystem";
import type { CrewId, CrewMember, MapTile, SystemLog } from "../data/gameData";
import type { EventLog, CrewActionState, RuntimeCall } from "../events/types";
import { getInventoryView } from "../inventorySystem";
import { getTileLocationLabel } from "../mapSystem";
import { defaultMapConfig } from "../content/contentData";

export type CrewConsoleMode = "status" | "inventory";

interface CrewConsolePageProps {
  crew: CrewMember[];
  crewActions: Record<string, CrewActionState>;
  activeCalls: Record<string, RuntimeCall>;
  elapsedGameSeconds: number;
  tiles: MapTile[];
  eventLogs: EventLog[];
  logs: SystemLog[];
  gameTimeLabel: string;
  selectedCrewId: CrewId | null;
  mode: CrewConsoleMode;
  onOpenControl: () => void;
  onOpenTask: () => void;
  onOpenMap: () => void;
  onStartCall: (crewId: CrewId) => void;
  onShowCrewStatus: (crewId: CrewId) => void;
  onShowCrewInventory: (crewId: CrewId) => void;
}

export function CrewConsolePage({
  crew,
  crewActions,
  activeCalls,
  elapsedGameSeconds,
  tiles,
  eventLogs,
  logs,
  gameTimeLabel,
  selectedCrewId,
  mode,
  onOpenControl,
  onOpenTask,
  onOpenMap,
  onStartCall,
  onShowCrewStatus,
  onShowCrewInventory,
}: CrewConsolePageProps) {
  const latestLog = logs[logs.length - 1];
  const selectedCrew = crew.find((member) => member.id === selectedCrewId) ?? crew[0] ?? null;
  const crewActionViews = useMemo(
    () =>
      Object.fromEntries(
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
      ) as Record<CrewId, CrewActionViewModel>,
    [activeCalls, crew, crewActions, elapsedGameSeconds, tiles],
  );
  const selectedActionView = selectedCrew ? crewActionViews[selectedCrew.id] : null;

  return (
    <GameConsoleLayout
      title={selectedCrew ? `${selectedCrew.name} 角色档案` : "角色档案"}
      subtitle=""
      gameTimeLabel={gameTimeLabel}
      statusItems={[
        { label: "crew", value: selectedCrew ? selectedCrew.name : "--" },
        { label: "view", value: mode === "status" ? "status" : "inventory" },
        { label: "signal", value: selectedCrew?.canCommunicate ? "online" : "offline" },
        { label: "calls", value: `${Object.values(activeCalls).filter((call) => call.crew_id === selectedCrew?.id && isActiveRuntimeCall(call.status)).length} 路` },
      ]}
      navItems={[
        { id: "control", label: "控制台", meta: "main", onClick: onOpenControl },
        { id: "task", label: "任务", meta: "task", onClick: onOpenTask },
        { id: "map", label: "地图", meta: "map", onClick: onOpenMap },
      ]}
      crewPanel={
        <div className="console-crew-stack">
          {crew.map((member) => {
            const actionView = crewActionViews[member.id];
            const incoming = Object.values(activeCalls).some((call) => call.crew_id === member.id && isActiveRuntimeCall(call.status));
            const isStatusActive = mode === "status" && selectedCrew?.id === member.id;
            const isInventoryActive = mode === "inventory" && selectedCrew?.id === member.id;
            return (
              <article key={member.id} className={`console-crew-card ${incoming || member.hasIncoming ? "console-crew-card-alert" : ""}`}>
                <div className="console-crew-avatar">{member.name.slice(0, 1)}</div>
                <div className="console-crew-copy">
                  <div className="console-crew-heading">
                    <strong>{member.name}</strong>
                    <span>{member.role}</span>
                    <span className={`console-crew-state-inline ${member.canCommunicate ? "console-crew-state-success" : "console-crew-state-danger"}`}>
                      {member.canCommunicate ? "在线" : "失联"}
                    </span>
                  </div>
                  <p>{member.location}</p>
                  <p>{actionView.statusText}</p>
                  <p>{actionView.timingText}</p>
                </div>
                <div className="console-crew-actions">
                  <button
                    type="button"
                    className={`console-crew-button console-crew-button-secondary ${isStatusActive ? "console-crew-button-active-panel" : ""}`}
                    onClick={() => onShowCrewStatus(member.id)}
                  >
                    查看状态
                  </button>
                  <button
                    type="button"
                    className={`console-crew-button console-crew-button-secondary ${isInventoryActive ? "console-crew-button-active-panel" : ""}`}
                    onClick={() => onShowCrewInventory(member.id)}
                  >
                    查看背包
                  </button>
                  <button type="button" className="console-crew-button" onClick={() => onStartCall(member.id)} disabled={!member.canCommunicate && !member.hasIncoming}>
                    {incoming || member.hasIncoming ? "接通" : "通话"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      }
      rightPanel={
        <section className="console-side-panel">
          <div className="console-column-header">
            <span>crew archive</span>
          </div>
          {selectedCrew ? (
            <div className="console-task-trace">
              <p className="console-map-trace-line console-map-trace-line-active">[CREW] {selectedCrew.name} / {selectedCrew.role}</p>
              <p className="console-map-trace-line">[LINK] {selectedCrew.canCommunicate ? "在线 / 可通话" : "失联 / 不可通话"}</p>
              <p className="console-map-trace-line">[LOC] {getTileLocationLabel(defaultMapConfig, selectedCrew.currentTile)}</p>
              <p className="console-map-trace-line">[VIEW] {mode === "status" ? "角色状态页" : "角色背包页"}</p>
              <p className="console-map-trace-line">[VOICE] {selectedCrew.voiceTone}</p>
              <p className="console-map-trace-line">[TAGS] {selectedCrew.personalityTags.join(" / ") || "none"}</p>
              <p className="console-map-trace-line">[TIP] 点击左侧其他探员可直接切换到对应角色查看页。</p>
            </div>
          ) : (
            <div className="console-task-trace">
              <p className="console-map-trace-line">[CREW] 暂无可显示成员。</p>
            </div>
          )}
        </section>
      }
      bottomBar={
        <div className="console-bottom-strip">
          <strong>] LOG:</strong>
          <span>{latestLog ? latestLog.text : "角色档案在线。"}</span>
        </div>
      }
    >
      <div className="console-screen-content">
        <div className="console-screen-header">
          <span>crt crew archive</span>
          <strong>{selectedCrew ? `${selectedCrew.name} / ${mode === "status" ? "Status" : "Inventory"}` : "crew archive / idle"}</strong>
          <span>{mode === "status" ? "status / profile / field condition" : "inventory / carried items / field kit"}</span>
        </div>
        <div className="console-screen-body">
          {selectedCrew && selectedActionView ? (
            mode === "status" ? (
              <CrewStatusScreen member={selectedCrew} actionView={selectedActionView} eventLogs={eventLogs} />
            ) : (
              <CrewInventoryScreen member={selectedCrew} />
            )
          ) : (
            <section className="console-screen-block">
              <p className="console-screen-command">] WAIT FOR CREW SELECT</p>
              <p>请从左侧选择一名探员。</p>
            </section>
          )}
        </div>
      </div>
    </GameConsoleLayout>
  );
}

function CrewStatusScreen({
  member,
  actionView,
  eventLogs,
}: {
  member: CrewMember;
  actionView: CrewActionViewModel;
  eventLogs: EventLog[];
}) {
  const recentLogs = eventLogs
    .filter((log) => log.visibility === "player_visible" && log.crew_ids.includes(member.id))
    .slice()
    .sort((left, right) => right.occurred_at - left.occurred_at || right.id.localeCompare(left.id))
    .slice(0, 3);

  return (
    <>
      <section className="console-screen-block">
        <p className="console-screen-command">] RUN CREW-STATUS.BAS</p>
        <p className="console-screen-line console-screen-line-cyan">CREW: {member.name.toUpperCase()} / ROLE: {member.role.toUpperCase()}</p>
      </section>
      <section className="console-screen-block">
        <p className="console-screen-section">[ FIELD CONDITION ]</p>
        <p>STATUS ........ {member.status.toUpperCase()}</p>
        <p>ACTION ........ {actionView.actionTitle.toUpperCase()}</p>
        <p>TIMER ......... {(actionView.blockingReason ?? actionView.timingText).toUpperCase()}</p>
        <p>LOCATION ...... {member.location.toUpperCase()}</p>
        <p>LINK .......... {member.canCommunicate ? "ONLINE" : "OFFLINE"}</p>
      </section>
      <section className="console-screen-block">
        <p className="console-screen-section">[ PROFILE ]</p>
        <p>ORIGIN ........ {member.profile.originWorld.toUpperCase()}</p>
        <p>PROFESSION .... {member.profile.originProfession.toUpperCase()}</p>
        <p>VOICE ......... {member.voiceTone.toUpperCase()}</p>
        <p>TAGS .......... {(member.personalityTags.join(" / ") || "NONE").toUpperCase()}</p>
        <p>INTRO ......... {member.profile.selfIntro.toUpperCase()}</p>
      </section>
      <section className="console-screen-block">
        <p className="console-screen-section">[ ATTRIBUTES ]</p>
        <p>PHY {member.attributes.physical} / AGI {member.attributes.agility} / INT {member.attributes.intellect}</p>
        <p>PER {member.attributes.perception} / LUCK {member.attributes.luck}</p>
      </section>
      <section className="console-screen-block">
        <p className="console-screen-section">[ RECENT TRACE ]</p>
        {recentLogs.length ? recentLogs.map((log) => <p key={log.id}>[{log.occurred_at}] {log.summary.toUpperCase()}</p>) : <p>NO PLAYER-VISIBLE EVENT TRACE.</p>}
      </section>
    </>
  );
}

function CrewInventoryScreen({ member }: { member: CrewMember }) {
  const inventoryView = getInventoryView(member.inventory);

  return (
    <>
      <section className="console-screen-block">
        <p className="console-screen-command">] RUN INVENTORY.BAS</p>
        <p className="console-screen-line console-screen-line-cyan">CREW: {member.name.toUpperCase()} / CARRIED ITEMS {inventoryView.length}</p>
      </section>
      <section className="console-screen-block">
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
      </section>
    </>
  );
}

function isActiveRuntimeCall(status: RuntimeCall["status"]) {
  return status === "incoming" || status === "connected" || status === "awaiting_choice";
}
