import { useMemo, useState } from "react";
import { ConsoleShell, Panel, StatusTag } from "../components/Layout";
import { createMovePreview, formatMoveRoute } from "../crewSystem";
import { garryActions, type ActionOption, type CallContext, type CrewMember, type MapTile } from "../data/gameData";
import type { RuntimeCall } from "../events/types";
import { findUsableInventoryItemByTag, getItemTagLabel } from "../inventorySystem";
import { formatDuration, getRemainingSeconds } from "../timeSystem";

type CallActionOption = ActionOption & {
  usesItemTag?: string;
  unavailableHint?: string;
};

interface CallView {
  title: string;
  subtitle: string;
  scene: string;
  lines: string[];
  meta: string;
  actions: CallActionOption[];
  badge: string;
  isRuntime: boolean;
}

interface CallPageProps {
  call: CallContext | null;
  crew: CrewMember[];
  tiles: MapTile[];
  activeCalls: Record<string, RuntimeCall>;
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
  activeCalls,
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
  const runtimeCall = call?.runtimeCallId ? activeCalls[call.runtimeCallId] : null;
  const isRuntimeContext = Boolean(call?.runtimeCallId);
  const runtimeCallClosed = isRuntimeContext && (!runtimeCall || !isRuntimeCallActive(runtimeCall, elapsedGameSeconds));
  const callClosed = Boolean(call?.settled || runtimeCallClosed);
  const selectedMoveTarget = tiles.find((tile) => tile.id === call?.selectedTargetTileId);
  const movePreview = member && call?.selectedTargetTileId ? createMovePreview(member, call.selectedTargetTileId, tiles) : null;

  const callView = useMemo<CallView | null>(() => {
    if (!call || !member) {
      return null;
    }

    if (call.runtimeCallId) {
      if (!runtimeCall || !isRuntimeCallActive(runtimeCall, elapsedGameSeconds)) {
        return {
          title: `通话页面：${member.name} 事件通话`,
          subtitle: "这条事件通话已经结束、过期或不可用。",
          scene: "通话中的图片 / 信号静默 / 事件快照不可用",
          lines: ["当前没有可处理的 runtime call。请返回通讯台查看其他频道。"],
          meta: "事件通话已关闭",
          actions: [] satisfies CallActionOption[],
          badge: "已关闭",
          isRuntime: true,
        };
      }

      return {
        title: `通话页面：${member.name} 事件通话`,
        subtitle: "本页只展示事件引擎保存的通话快照，并提交稳定 option_id。",
        scene: "通话中的图片 / runtime call / 已渲染快照",
        lines: runtimeCall.rendered_lines.length ? runtimeCall.rendered_lines.map((line) => line.text) : ["通讯内容为空。"],
        meta: `事件：${runtimeCall.event_id} / 节点：${runtimeCall.event_node_id}`,
        actions: runtimeCall.available_options.map((option) => ({
          id: option.option_id,
          label: option.text,
        })) satisfies CallActionOption[],
        badge: formatRuntimeCallStatus(runtimeCall),
        isRuntime: true,
      };
    }

    if (member.id === "garry") {
      return {
        title: "通话页面：Garry 普通状态",
        subtitle: "当前只与 Garry 通话。地图和通讯录是辅助浮层，不会切换通话对象。",
        scene: "通话中的图片 / 矿床 / 灰尘 / 正常采矿",
        lines: ["头儿，我正在矿床采矿，有什么事吗？"],
        meta: "地点：矿床 / 状态：采矿中",
        actions: garryActions satisfies CallActionOption[],
        badge: "普通通话",
        isRuntime: false,
      };
    }

    return {
      title: `通话页面：${member.name} 状态确认`,
      subtitle: "当前只处理这一条通话事件。其他队员可以查看，但不能接入第二条通话。",
      scene: "通话中的图片 / 湖泊 / 低频风声 / 画面延迟",
      lines: ["收到。湖泊边缘不在原来的位置，但我还在走。"],
      meta: "地点：湖泊 / 状态：行进中",
      actions: [
        { id: "mike-status", label: "要求继续前进", hint: "维持行进状态。" },
        { id: "mike-hold", label: "原地等待", hint: "暂停探索，避免进入未知水域。" },
      ] satisfies CallActionOption[],
      badge: "普通通话",
      isRuntime: false,
    };
  }, [call, elapsedGameSeconds, member, runtimeCall]);

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

          <blockquote>
            {call.result && !callView.isRuntime ? (
              call.result
            ) : (
              callView.lines.map((line) => (
                <p key={line}>{line}</p>
              ))
            )}
          </blockquote>

          <p className="muted-text">
            {callView.isRuntime && runtimeCall ? getRuntimeCallTiming(runtimeCall, elapsedGameSeconds) : getCallTiming(member, elapsedGameSeconds)}
          </p>

          {!callView.isRuntime ? (
            <button type="button" className={`map-chip ${call.selectingMoveTarget ? "map-chip-active" : ""}`} onClick={onOpenMap}>
              <strong>地图二级菜单</strong>
              <span>{call.selectingMoveTarget ? "标记候选目的地" : "只读查看坐标，不下指令"}</span>
            </button>
          ) : null}

          {!callView.isRuntime && call.selectingMoveTarget ? (
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
            {callView.isRuntime
              ? `可以打开通讯录查看其他队员，但本页不会解释事件图，只处理 ${member.name} 的 runtime call 快照。`
              : `可以打开地图查看坐标，或打开通讯录查看其他队员，但本页仍只处理 ${member.name} 的当前事件。`}
          </p>
        </Panel>

        <Panel title="本页反馈" className="call-feedback">
          <p>
            {callView.isRuntime
              ? callClosed
                ? "这条事件通话已关闭。按钮已禁用。"
                : "选择后只提交 option_id，事件推进由 runtime engine 负责。"
              : callClosed
                ? "本轮选择已结算。按钮已禁用，通讯台与地图状态已同步。"
                : "选择行动后会写入日志，并更新队员、地块或通讯状态。"}
          </p>
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
  if (member.activeAction?.status === "inProgress") {
    const remaining = getRemainingSeconds(member.activeAction.finishTime, elapsedGameSeconds);
    return `当前行动剩余 ${formatDuration(remaining)}`;
  }

  return "当前通话没有强制倒计时。";
}

function isRuntimeCallActive(call: RuntimeCall, elapsedGameSeconds: number) {
  return (
    (call.status === "incoming" || call.status === "connected" || call.status === "awaiting_choice") &&
    (typeof call.expires_at !== "number" || call.expires_at > elapsedGameSeconds)
  );
}

function formatRuntimeCallStatus(call: RuntimeCall) {
  if (call.status === "awaiting_choice") {
    return "等待选择";
  }
  if (call.status === "incoming") {
    return "来电";
  }
  if (call.status === "connected") {
    return "已接通";
  }
  return "已关闭";
}

function getRuntimeCallTiming(call: RuntimeCall, elapsedGameSeconds: number) {
  if (typeof call.expires_at === "number") {
    return `事件通话剩余 ${formatDuration(getRemainingSeconds(call.expires_at, elapsedGameSeconds))}`;
  }

  return "事件通话没有强制倒计时。";
}
