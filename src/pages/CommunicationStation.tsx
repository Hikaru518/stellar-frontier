import { useState } from "react";
import { ConsoleShell, FieldList, Modal, Panel, StatusTag } from "../components/Layout";
import { getCrewActionTiming } from "../crewSystem";
import type { CrewId, CrewMember } from "../data/gameData";
import { CrewDetail } from "./CrewDetail";
import { formatDuration, getRemainingSeconds } from "../timeSystem";

interface CommunicationStationProps {
  crew: CrewMember[];
  elapsedGameSeconds: number;
  gameTimeLabel: string;
  onBack: () => void;
  onStartCall: (crewId: CrewId) => void;
}

export function CommunicationStation({ crew, elapsedGameSeconds, gameTimeLabel, onBack, onStartCall }: CommunicationStationProps) {
  const [contactsOpen, setContactsOpen] = useState(true);
  const [detailCrewId, setDetailCrewId] = useState<CrewId | null>(null);
  const incomingCount = crew.filter((member) => member.hasIncoming).length;
  const detailCrew = crew.find((member) => member.id === detailCrewId);

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
          <p className="accent-text">最近信号：Amy / 森林 / 非常不礼貌的求救</p>
          <div className="terminal-box">
            这里保留通讯台主区域。通讯录展开时悬浮在左侧，不完全遮挡当前上下文。
          </div>
          <p className="muted-text">[信号日志] 森林方向存在重复回声。</p>
        </Panel>

        {contactsOpen ? (
          <Panel title={`通讯录 · ${incomingCount} 条来电`} className="contacts-panel" tone={incomingCount ? "accent" : "neutral"}>
            <div className="crew-list">
              {crew.map((member) => (
                <CrewCard
                  key={member.id}
                  member={member}
                  elapsedGameSeconds={elapsedGameSeconds}
                  onOpenDetail={() => setDetailCrewId(member.id)}
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
      </div>

      {detailCrew ? (
        <Modal title={`${detailCrew.name} / 队员档案`} onClose={() => setDetailCrewId(null)}>
          <FieldList
            rows={[
              ["身份", detailCrew.role],
              ["位置", `${detailCrew.location} ${detailCrew.coord}`],
              ["当前状态", detailCrew.status],
              ["时间状态", getCrewTiming(detailCrew, elapsedGameSeconds)],
            ]}
          />
          <CrewDetail member={detailCrew} />
        </Modal>
      ) : null}
    </ConsoleShell>
  );
}

function CrewCard({
  member,
  elapsedGameSeconds,
  onOpenDetail,
  onStartCall,
}: {
  member: CrewMember;
  elapsedGameSeconds: number;
  onOpenDetail: () => void;
  onStartCall: () => void;
}) {
  return (
    <article className={`crew-card ${member.hasIncoming ? "crew-card-alert" : ""}`}>
      <div className="avatar-box">头像</div>
      <div className="crew-card-body">
        <div className="crew-card-heading">
          <h3>
            {member.name}，{member.role}
          </h3>
          {member.hasIncoming ? <StatusTag tone="danger">来电</StatusTag> : <StatusTag tone={member.statusTone}>在线</StatusTag>}
        </div>
        <p className={`crew-status status-${member.statusTone}`}>{member.status}</p>
        <p className="muted-text">{getCrewTiming(member, elapsedGameSeconds)}</p>
        <p className="muted-text">{member.summary}</p>
      </div>
      <div className="crew-actions">
        {member.hasIncoming ? (
          <button type="button" className="primary-button" disabled={member.unavailable} onClick={onStartCall}>
            {member.unavailable ? "信号中断" : "接通"}
          </button>
        ) : (
          <>
            <button type="button" className="secondary-button" onClick={onOpenDetail}>
              查看档案
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

function getCrewTiming(member: CrewMember, elapsedGameSeconds: number) {
  if (member.emergencyEvent && !member.emergencyEvent.settled) {
    const waited = elapsedGameSeconds - member.emergencyEvent.callReceivedTime;
    const remaining = getRemainingSeconds(member.emergencyEvent.deadlineTime, elapsedGameSeconds);
    return `紧急事件：已等待 ${formatDuration(waited)} / 危险阶段 ${member.emergencyEvent.dangerStage} / 剩余 ${formatDuration(remaining)}`;
  }

  if (member.activeAction?.status === "inProgress") {
    return getCrewActionTiming(member, elapsedGameSeconds);
  }

  return "无进行中的计时行动";
}
