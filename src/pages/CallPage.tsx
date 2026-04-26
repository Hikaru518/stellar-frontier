import { useMemo, useState } from "react";
import { ConsoleShell, Panel, StatusTag } from "../components/Layout";
import { amyActions, garryActions, type ActionOption, type CallContext, type CrewMember } from "../data/gameData";
import { formatDuration, getRemainingSeconds } from "../timeSystem";

interface CallPageProps {
  call: CallContext | null;
  crew: CrewMember[];
  elapsedGameSeconds: number;
  gameTimeLabel: string;
  onDecision: (actionId: string) => void;
  onOpenMap: () => void;
  onEndCall: () => void;
  onOpenStation: () => void;
}

export function CallPage({ call, crew, elapsedGameSeconds, gameTimeLabel, onDecision, onOpenMap, onEndCall, onOpenStation }: CallPageProps) {
  const [contactsOpen, setContactsOpen] = useState(false);
  const member = crew.find((item) => item.id === call?.crewId);
  const emergencyEvent = member?.emergencyEvent;
  const callClosed = Boolean(call?.settled || (call?.type === "emergency" && emergencyEvent?.settled));

  const callView = useMemo(() => {
    if (!call || !member) {
      return null;
    }

    if (member.id === "amy") {
      return {
        title: "通话页面：Amy 紧急事件",
        subtitle: "当前只与 Amy 通话。紧急选择会结算风险，并同步森林地块与队员状态。",
        scene: "通话中的图片 / 森林 / 噪声 / 有东西在靠近",
        line: "头儿，我遇到熊了我草。",
        meta: "地点：森林 / 危险",
        actions: amyActions,
        badge: "紧急来电",
      };
    }

    if (member.id === "garry") {
      return {
        title: "通话页面：Garry 普通状态",
        subtitle: "当前只与 Garry 通话。地图和通讯录是辅助浮层，不会切换通话对象。",
        scene: "通话中的图片 / 矿床 / 灰尘 / 正常采矿",
        line: "头儿，我正在矿床采矿，有什么事吗？",
        meta: "地点：矿床 / 状态：采矿中",
        actions: garryActions,
        badge: "普通通话",
      };
    }

    return {
      title: `通话页面：${member.name} 状态确认`,
      subtitle: "当前只处理这一条通话事件。其他队员可以查看，但不能接入第二条通话。",
      scene: "通话中的图片 / 湖泊 / 低频风声 / 画面延迟",
      line: "收到。湖泊边缘不在原来的位置，但我还在走。",
      meta: "地点：湖泊 / 状态：行进中",
      actions: [
        { id: "mike-status", label: "要求继续前进", hint: "维持行进状态。" },
        { id: "mike-hold", label: "原地等待", hint: "暂停探索，避免进入未知水域。" },
      ] satisfies ActionOption[],
      badge: "普通通话",
    };
  }, [call, member]);

  if (!call || !member || !callView) {
    return (
      <ConsoleShell title="通话页面" subtitle="没有活动通话。" gameTimeLabel={gameTimeLabel}>
        <Panel>
          <p>当前没有通话事件。通讯台记录显示这可能只是短暂的安静。</p>
          <button type="button" className="primary-button" onClick={onOpenStation}>
            返回通讯台
          </button>
        </Panel>
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell
      title={callView.title}
      subtitle={callView.subtitle}
      gameTimeLabel={gameTimeLabel}
      actions={
        <>
          <button type="button" className="secondary-button" onClick={() => setContactsOpen((value) => !value)}>
            {contactsOpen ? "关闭通讯录" : "打开通讯录"}
          </button>
          <button type="button" className="secondary-button" onClick={onEndCall}>
            {callClosed ? "结束通话" : "返回通讯台"}
          </button>
        </>
      }
    >
      <div className="call-layout">
        <div className="image-placeholder call-scene">{callView.scene}</div>

        <Panel className="call-panel" tone={member.statusTone}>
          <div className="call-person">
            <div className="avatar-box">头像</div>
            <div>
              <h2>
                {member.name}，{member.role}
              </h2>
              <p>{callView.meta}</p>
            </div>
            <StatusTag tone={call.type === "emergency" ? "danger" : "muted"}>{callView.badge}</StatusTag>
          </div>

          <blockquote>{call.result ?? (emergencyEvent?.settled ? member.summary : callView.line)}</blockquote>

          <p className="muted-text">{getCallTiming(member, elapsedGameSeconds)}</p>

          <button type="button" className="map-chip" onClick={onOpenMap}>
            <strong>地图二级菜单</strong>
            <span>只读查看坐标，不下指令</span>
          </button>

          <div className="action-stack">
            {callView.actions.map((action) => (
              <button
                type="button"
                key={action.id}
                className={`choice-button choice-${action.tone ?? "neutral"}`}
                onClick={() => onDecision(action.id)}
                disabled={callClosed}
              >
                <span>{action.label}</span>
                {action.hint ? <small>{action.hint}</small> : null}
              </button>
            ))}
          </div>

          {callClosed ? (
            <button type="button" className="primary-button full-width" onClick={onEndCall}>
              结束通话
            </button>
          ) : null}
        </Panel>

        <Panel title="辅助浮层入口" className="call-helper">
          <p>
            可以打开地图查看坐标，或打开通讯录查看其他队员，但本页仍只处理 {member.name} 的当前事件。
          </p>
        </Panel>

        <Panel title="本页反馈" className="call-feedback">
          <p>{callClosed ? "本轮选择已结算。按钮已禁用，通讯台与地图状态已同步。" : "选择行动后会写入日志，并更新队员、地块或通讯状态。"}</p>
        </Panel>

        {contactsOpen ? (
          <Panel title="通讯录浮层 / 只读" className="contacts-overlay">
            {crew.map((item) => (
              <div key={item.id} className="overlay-row">
                <span>
                  {item.name}，{item.role}
                </span>
                <StatusTag tone={item.statusTone}>{item.status}</StatusTag>
              </div>
            ))}
          </Panel>
        ) : null}
      </div>
    </ConsoleShell>
  );
}

function getCallTiming(member: CrewMember, elapsedGameSeconds: number) {
  if (member.emergencyEvent && !member.emergencyEvent.settled) {
    const remaining = getRemainingSeconds(member.emergencyEvent.deadlineTime, elapsedGameSeconds);
    const nextStage = getRemainingSeconds(member.emergencyEvent.nextEscalationTime, elapsedGameSeconds);
    return `紧急倒计时：剩余 ${formatDuration(remaining)} / 下一次升级 ${formatDuration(nextStage)} / 危险阶段 ${member.emergencyEvent.dangerStage}`;
  }

  if (member.emergencyEvent?.settled) {
    return "紧急事件已结算。";
  }

  if (member.activeAction?.status === "inProgress") {
    const remaining = getRemainingSeconds(member.activeAction.finishTime, elapsedGameSeconds);
    return `当前行动剩余 ${formatDuration(remaining)}`;
  }

  return "当前通话没有强制倒计时。";
}
