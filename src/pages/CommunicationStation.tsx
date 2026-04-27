import { useState } from "react";
import { ConsoleShell, FieldList, Modal, Panel, StatusTag } from "../components/Layout";
import { defaultMapConfig } from "../content/contentData";
import { getCrewActionTiming } from "../crewSystem";
import type { CrewId, CrewMember } from "../data/gameData";
import type { EventLog, Objective, RuntimeCall } from "../events/types";
import { getInventoryView, type InventoryItemView } from "../inventorySystem";
import { getTileLocationLabel } from "../mapSystem";
import { CrewDetail } from "./CrewDetail";
import { formatDuration, getRemainingSeconds } from "../timeSystem";

interface CommunicationStationProps {
  crew: CrewMember[];
  activeCalls: Record<string, RuntimeCall>;
  objectives: Record<string, Objective>;
  eventLogs: EventLog[];
  elapsedGameSeconds: number;
  gameTimeLabel: string;
  onBack: () => void;
  onStartCall: (crewId: CrewId) => void;
}

export function CommunicationStation({
  crew,
  activeCalls,
  objectives,
  eventLogs,
  elapsedGameSeconds,
  gameTimeLabel,
  onBack,
  onStartCall,
}: CommunicationStationProps) {
  const [contactsOpen, setContactsOpen] = useState(true);
  const [detailCrewId, setDetailCrewId] = useState<CrewId | null>(null);
  const [inventoryCrewId, setInventoryCrewId] = useState<CrewId | null>(null);
  const activeRuntimeCalls = Object.values(activeCalls)
    .filter((call) => isRuntimeCallActive(call, elapsedGameSeconds))
    .sort((left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id));
  const activeCallCrewIds = new Set(activeRuntimeCalls.map((call) => call.crew_id));
  const incomingCount = activeRuntimeCalls.length + crew.filter((member) => member.hasIncoming && !activeCallCrewIds.has(member.id)).length;
  const openObjectives = Object.values(objectives)
    .filter((objective) => objective.status === "available" || objective.status === "assigned" || objective.status === "in_progress")
    .sort((left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id));
  const detailCrew = crew.find((member) => member.id === detailCrewId);
  const inventoryCrew = crew.find((member) => member.id === inventoryCrewId);
  const latestRuntimeLine = activeRuntimeCalls[0]?.rendered_lines[0]?.text;
  const recentEventLogs = eventLogs
    .filter((log) => log.visibility === "player_visible")
    .slice()
    .sort((left, right) => right.occurred_at - left.occurred_at || right.id.localeCompare(left.id))
    .slice(0, 3);

  return (
    <ConsoleShell
      title="通讯台"
      subtitle="频道 A-17 / 信号噪声 38% / 当前仅允许一条通话事件"
      gameTimeLabel={gameTimeLabel}
      actions={
        <>
          <button type="button" className="secondary-button" onClick={onBack}>
            返回控制中心
          </button>
          <button type="button" className="primary-button" onClick={() => setContactsOpen((value) => !value)}>
            {contactsOpen ? "收起通讯录" : `通讯录 ${incomingCount ? `${incomingCount} 条来电` : ""}`}
          </button>
        </>
      }
    >
      <div className="station-layout">
        <Panel title="通讯台主机" className="station-deck">
          <p>天线：偏移 2.1° / 校准建议：忽略</p>
          <p className="accent-text">最近信号：{latestRuntimeLine ?? "Amy / 森林 / 非常不礼貌的求救"}</p>
          <div className="terminal-box">
            这里保留通讯台主区域。通讯录展开时悬浮在左侧，不完全遮挡当前上下文。
          </div>
          <p className="muted-text">[信号日志] 森林方向存在重复回声。</p>
        </Panel>

        {activeRuntimeCalls.length ? (
          <Panel title={`事件通话 · ${activeRuntimeCalls.length} 条`} className="station-deck" tone="accent">
            <div className="crew-list">
              {activeRuntimeCalls.map((call) => {
                const member = crew.find((item) => item.id === call.crew_id);
                const crewId = isCrewId(call.crew_id) ? call.crew_id : null;
                const isUrgent = isUrgentRuntimeCall(call);
                return (
                  <article key={call.id} className="crew-card crew-card-alert">
                    <div className="avatar-box">信号</div>
                    <div className="crew-card-body">
                      <div className="crew-card-heading">
                        <h3>{member ? `${member.name}，${member.role}` : call.crew_id}</h3>
                        <StatusTag tone={isUrgent ? "danger" : "neutral"}>{formatRuntimeCallSeverity(call)}</StatusTag>
                      </div>
                      <p className="crew-status status-accent">{call.rendered_lines[0]?.text ?? "事件通话等待接入。"}</p>
                      {isUrgent ? <p className="muted-text">{formatRuntimeCallTiming(call, elapsedGameSeconds)}</p> : null}
                    </div>
                    <div className="crew-actions">
                      {crewId ? (
                        <button type="button" className="primary-button" onClick={() => onStartCall(crewId)}>
                          接通
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </Panel>
        ) : null}

        {contactsOpen ? (
          <Panel title={`通讯录 · ${incomingCount} 条来电`} className="contacts-panel" tone={incomingCount ? "accent" : "neutral"}>
            <div className="crew-list">
              {crew.map((member) => (
                <CrewCard
                  key={member.id}
                  member={member}
                  elapsedGameSeconds={elapsedGameSeconds}
                  hasRuntimeCall={activeCallCrewIds.has(member.id)}
                  onOpenDetail={() => setDetailCrewId(member.id)}
                  onOpenInventory={() => setInventoryCrewId(member.id)}
                  onStartCall={() => onStartCall(member.id)}
                />
              ))}
            </div>
          </Panel>
        ) : (
          <button type="button" className="collapsed-contacts" onClick={() => setContactsOpen(true)}>
            通讯录 {incomingCount ? `${incomingCount} 条来电` : "无新来电"}
          </button>
        )}

        <Panel className="station-rule">
          <p>通话中也可打开通讯录，但不能直接开启第二个通话事件。</p>
        </Panel>

        {openObjectives.length ? (
          <Panel title={`可分配目标 · ${openObjectives.length} 条`} className="station-rule" tone="accent">
            <div className="expertise-list">
              {openObjectives.map((objective) => (
                <article key={objective.id} className="expertise-item">
                  <div className="expertise-heading">
                    <strong>{objective.title}</strong>
                    <StatusTag tone={objective.status === "available" ? "accent" : "muted"}>{formatObjectiveStatus(objective)}</StatusTag>
                  </div>
                  <p>{objective.summary}</p>
                  <p className="muted-text">
                    {objective.target_tile_id ? `目标地块：${objective.target_tile_id} / ` : ""}
                    {objective.assigned_crew_id ? `已分配：${objective.assigned_crew_id}` : "等待分配"}
                  </p>
                </article>
              ))}
            </div>
          </Panel>
        ) : (
          <Panel title="可分配目标" className="station-rule">
            <p className="muted-text">暂无可分配目标。</p>
          </Panel>
        )}

        <Panel title="近期事件摘要" className="station-rule" tone={recentEventLogs.length ? "accent" : "neutral"}>
          {recentEventLogs.length ? (
            <div className="expertise-list">
              {recentEventLogs.map((log) => (
                <article key={log.id} className="expertise-item">
                  <div className="expertise-heading">
                    <strong>{log.summary}</strong>
                    <StatusTag tone={log.importance === "major" || log.importance === "critical" ? "accent" : "muted"}>
                      {formatEventImportance(log.importance)}
                    </StatusTag>
                  </div>
                  <p className="muted-text">{log.tile_ids.length ? `关联地块：${log.tile_ids.join(" / ")}` : "无关联地块"}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted-text">暂无事件记录。</p>
          )}
        </Panel>
      </div>

      {detailCrew ? (
        <Modal title={`${detailCrew.name} / 队员档案`} onClose={() => setDetailCrewId(null)}>
          <FieldList
            rows={[
              ["身份", detailCrew.role],
              ["位置", getCrewLocationLabel(detailCrew)],
              ["当前状态", detailCrew.status],
              ["时间状态", getCrewTiming(detailCrew, elapsedGameSeconds)],
            ]}
          />
          <CrewDetail member={detailCrew} eventLogs={eventLogs} />
        </Modal>
      ) : null}

      {inventoryCrew ? (
        <Modal title={`${inventoryCrew.name} / 背包`} onClose={() => setInventoryCrewId(null)}>
          <CrewInventoryList member={inventoryCrew} />
        </Modal>
      ) : null}
    </ConsoleShell>
  );
}

function CrewCard({
  member,
  elapsedGameSeconds,
  hasRuntimeCall,
  onOpenDetail,
  onOpenInventory,
  onStartCall,
}: {
  member: CrewMember;
  elapsedGameSeconds: number;
  hasRuntimeCall: boolean;
  onOpenDetail: () => void;
  onOpenInventory: () => void;
  onStartCall: () => void;
}) {
  const hasCallEntry = member.hasIncoming || hasRuntimeCall;
  const callDisabled = member.unavailable && !hasRuntimeCall;
  return (
    <article className={`crew-card ${hasCallEntry ? "crew-card-alert" : ""}`}>
      <div className="avatar-box">头像</div>
      <div className="crew-card-body">
        <div className="crew-card-heading">
          <h3>
            {member.name}，{member.role}
          </h3>
          {hasCallEntry ? <StatusTag tone={hasRuntimeCall ? "accent" : "danger"}>来电</StatusTag> : <StatusTag tone={member.statusTone}>在线</StatusTag>}
        </div>
        <p className={`crew-status status-${member.statusTone}`}>{member.status}</p>
        <p className="muted-text">位置：{getCrewLocationLabel(member)}</p>
        <p className="muted-text">{getCrewTiming(member, elapsedGameSeconds)}</p>
        <p className="muted-text">{member.summary}</p>
      </div>
      <div className="crew-actions">
        {hasCallEntry ? (
          <>
            <button type="button" className="primary-button" disabled={callDisabled} onClick={onStartCall}>
              {callDisabled ? "信号中断" : hasRuntimeCall ? "接通" : "通话"}
            </button>
            <button type="button" className="secondary-button" onClick={onOpenInventory}>
              查看背包
            </button>
          </>
        ) : (
          <>
            <button type="button" className="secondary-button" onClick={onOpenDetail}>
              查看档案
            </button>
            <button type="button" className="secondary-button" onClick={onOpenInventory}>
              查看背包
            </button>
            <button type="button" className="secondary-button" disabled={member.unavailable} onClick={onStartCall}>
              通话
            </button>
          </>
        )}
      </div>
    </article>
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
            <StatusTag tone={item.missingDefinition ? "danger" : "neutral"}>{item.categoryLabel}</StatusTag>
          </div>
          <FieldList
            rows={[
              ["数量", `x${item.quantity}`],
              ["分类", item.categoryLabel],
              ["中文标签", formatItemTags(item)],
              ["描述", item.description],
              ["可用于响应", formatBoolean(item.usableInResponse)],
              ["使用后消耗", formatBoolean(item.consumedOnUse)],
            ]}
          />
        </article>
      ))}
    </div>
  );
}

function formatItemTags(item: InventoryItemView) {
  return item.tagLabels.length ? item.tagLabels.join(" / ") : "无标签";
}

function formatBoolean(value: boolean) {
  return value ? "是" : "否";
}

function getCrewLocationLabel(member: CrewMember) {
  return getTileLocationLabel(defaultMapConfig, member.currentTile);
}

function getCrewTiming(member: CrewMember, elapsedGameSeconds: number) {
  if (member.activeAction?.status === "inProgress") {
    return getCrewActionTiming(member, elapsedGameSeconds);
  }

  return "无进行中的计时行动";
}

function isRuntimeCallActive(call: RuntimeCall, elapsedGameSeconds: number) {
  return (
    (call.status === "incoming" || call.status === "connected" || call.status === "awaiting_choice") &&
    (typeof call.expires_at !== "number" || call.expires_at > elapsedGameSeconds)
  );
}

function formatRuntimeCallTiming(call: RuntimeCall, elapsedGameSeconds: number) {
  if (typeof call.expires_at === "number") {
    return `剩余 ${formatDuration(getRemainingSeconds(call.expires_at, elapsedGameSeconds))}`;
  }

  return "无强制倒计时";
}

function formatRuntimeCallSeverity(call: RuntimeCall) {
  const severity = getRuntimeCallSeverity(call);
  if (severity === "critical") {
    return "危急";
  }
  if (severity === "high") {
    return "紧急";
  }
  return "普通";
}

function isUrgentRuntimeCall(call: RuntimeCall) {
  const severity = getRuntimeCallSeverity(call);
  return severity === "high" || severity === "critical";
}

function getRuntimeCallSeverity(call: RuntimeCall) {
  const callWithSeverity = call as RuntimeCall & { severity?: unknown };
  const severity = typeof callWithSeverity.severity === "string" ? callWithSeverity.severity : call.render_context_snapshot.severity;
  return typeof severity === "string" ? severity : null;
}

function formatObjectiveStatus(objective: Objective) {
  if (objective.status === "available") {
    return "可分配";
  }
  if (objective.status === "assigned") {
    return "已分配";
  }
  if (objective.status === "in_progress") {
    return "进行中";
  }
  return objective.status;
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

function isCrewId(value: string): value is CrewId {
  return value === "mike" || value === "amy" || value === "garry" || value === "lin_xia" || value === "kael";
}
