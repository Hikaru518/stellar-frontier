import { useMemo, useState } from "react";
import { ConsoleShell, Panel, StatusTag } from "../components/Layout";
import { createMovePreview, formatMoveRoute } from "../crewSystem";
import { getEmergencyChoices, getEmergencyEventDefinition } from "../eventSystem";
import { garryActions, type ActionOption, type CallContext, type CrewMember, type MapTile } from "../data/gameData";
import { findUsableInventoryItemByTag, getItemTagLabel } from "../inventorySystem";
import { formatDuration, getRemainingSeconds } from "../timeSystem";

type CallActionOption = ActionOption & {
  usesItemTag?: string;
  unavailableHint?: string;
};

interface CallPageProps {
  call: CallContext | null;
  crew: CrewMember[];
  tiles: MapTile[];
  elapsedGameSeconds: number;
  gameTimeLabel: string;
  onDecision: (actionId: string) => void;
  onConfirmMove: () => void;
  onClearMoveTarget: () => void;
  onOpenMap: () => void;
  onEndCall: () => void;
  onOpenStation: () => void;
}

export function CallPage({
  call,
  crew,
  tiles,
  elapsedGameSeconds,
  gameTimeLabel,
  onDecision,
  onConfirmMove,
  onClearMoveTarget,
  onOpenMap,
  onEndCall,
  onOpenStation,
}: CallPageProps) {
  const [contactsOpen, setContactsOpen] = useState(false);
  const member = crew.find((item) => item.id === call?.crewId);
  const emergencyEvent = member?.emergencyEvent;
  const callClosed = Boolean(call?.settled || (call?.type === "emergency" && emergencyEvent?.settled));
  const selectedMoveTarget = tiles.find((tile) => tile.id === call?.selectedTargetTileId);
  const movePreview = member && call?.selectedTargetTileId ? createMovePreview(member, call.selectedTargetTileId, tiles) : null;

  const callView = useMemo(() => {
    if (!call || !member) {
      return null;
    }

    const emergencyDefinition = getEmergencyEventDefinition(member);
    if (emergencyDefinition) {
      return {
        title: `通话页面：${member.name} 紧急事件`,
        subtitle: `当前只与 ${member.name} 通话。紧急选择会按事件配置结算风险。`,
        scene: "通话中的图片 / 森林 / 噪声 / 有东西在靠近",
        line: emergencyDefinition.resultText.start ?? emergencyDefinition.title,
        meta: `地点：${member.location} / 危险阶段 ${member.emergencyEvent?.dangerStage ?? 0}`,
        actions: getEmergencyChoices(member).map((choice) => ({
          id: choice.choiceId,
          label: choice.text,
          hint: choice.hint,
          tone: choice.tone,
          usesItemTag: choice.usesItemTag,
          unavailableHint: choice.unavailableHint,
        })) satisfies CallActionOption[],
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
        actions: garryActions satisfies CallActionOption[],
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
      ] satisfies CallActionOption[],
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

          <button type="button" className={`map-chip ${call.selectingMoveTarget ? "map-chip-active" : ""}`} onClick={onOpenMap}>
            <strong>地图二级菜单</strong>
            <span>{call.selectingMoveTarget ? "标记候选目的地" : "只读查看坐标，不下指令"}</span>
          </button>

          {call.selectingMoveTarget ? (
            <MoveConfirmPanel
              member={member}
              targetTile={selectedMoveTarget}
              preview={movePreview}
              callClosed={callClosed}
              onOpenMap={onOpenMap}
              onConfirmMove={onConfirmMove}
              onClearMoveTarget={onClearMoveTarget}
            />
          ) : null}

          <div className="action-stack">
            {callView.actions.map((action) => {
              const itemAvailability = getChoiceItemAvailability(action, member);
              return (
                <button
                  type="button"
                  key={action.id}
                  className={`choice-button choice-${action.tone ?? "neutral"}`}
                  onClick={() => onDecision(action.id)}
                  disabled={callClosed || itemAvailability.disabled}
                >
                  <span>{action.label}</span>
                  {action.hint ? <small>{action.hint}</small> : null}
                  {itemAvailability.description ? <small>{itemAvailability.description}</small> : null}
                </button>
              );
            })}
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

function MoveConfirmPanel({
  member,
  targetTile,
  preview,
  callClosed,
  onOpenMap,
  onConfirmMove,
  onClearMoveTarget,
}: {
  member: CrewMember;
  targetTile: MapTile | undefined;
  preview: ReturnType<typeof createMovePreview> | null;
  callClosed: boolean;
  onOpenMap: () => void;
  onConfirmMove: () => void;
  onClearMoveTarget: () => void;
}) {
  if (!targetTile || !preview) {
    return (
      <div className="move-confirm-box">
        <strong>目的地未标记</strong>
        <p>打开地图，选择一个地块并标记为候选目的地。地图不会直接下达移动指令。</p>
        <button type="button" className="secondary-button full-width" onClick={onOpenMap} disabled={callClosed}>
          打开地图标记目的地
        </button>
      </div>
    );
  }

  return (
    <div className={`move-confirm-box ${preview.canMove ? "" : "move-confirm-blocked"}`}>
      <strong>移动确认</strong>
      <dl className="compact-fields">
        <div>
          <dt>起点</dt>
          <dd>
            {member.coord} {member.location}
          </dd>
        </div>
        <div>
          <dt>目标</dt>
          <dd>
            {targetTile.coord} {targetTile.terrain}
          </dd>
        </div>
        <div>
          <dt>路线</dt>
          <dd>{preview.canMove ? formatMoveRoute(preview) : preview.reason}</dd>
        </div>
        <div>
          <dt>预计耗时</dt>
          <dd>{preview.canMove ? formatDuration(preview.totalDurationSeconds) : "不可达"}</dd>
        </div>
      </dl>
      {preview.interruptionWarning ? <p className="danger-text">{preview.interruptionWarning}</p> : null}
      <p className="muted-text">确认后才会下达移动指令。抵达目标地块后，{member.name} 将原地待命。</p>
      <div className="move-confirm-actions">
        <button type="button" className="primary-button" onClick={onConfirmMove} disabled={!preview.canMove || callClosed}>
          确认请求 {member.name} 前往 {targetTile.coord}
        </button>
        <button type="button" className="secondary-button" onClick={onClearMoveTarget} disabled={callClosed}>
          清除候选
        </button>
      </div>
    </div>
  );
}

function getChoiceItemAvailability(action: CallActionOption, member: CrewMember) {
  if (!action.usesItemTag) {
    return { disabled: false, description: null };
  }

  const tagLabel = getItemTagLabel(action.usesItemTag);
  const candidate = findUsableInventoryItemByTag(member.inventory, action.usesItemTag);
  if (!candidate) {
    return {
      disabled: true,
      description: action.unavailableHint ?? `需要可用的${tagLabel}道具。`,
    };
  }

  return {
    disabled: false,
    description: `${tagLabel}道具：将使用${candidate.item.name}，${candidate.item.consumedOnUse ? "使用后消耗" : "不会消耗"}。`,
  };
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
