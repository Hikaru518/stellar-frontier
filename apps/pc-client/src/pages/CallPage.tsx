import { useMemo, useState } from "react";
import { buildCallView } from "../callActions";
import { ConsoleShell, Panel, StatusTag } from "../components/Layout";
import { defaultMapConfig } from "../content/contentData";
import { createMovePreview, deriveCrewActionViewModel } from "../crewSystem";
import type { ActionOption, CallContext, CrewMember, GameState, MapTile } from "../data/gameData";
import type { RuntimeCall } from "../events/types";
import { getFullTileWindow, getTileLocationLabel, type VisibleTileCell } from "../mapSystem";
import { formatDuration, getRemainingSeconds } from "../timeSystem";

type CallActionOption = ActionOption & {
  disabled?: boolean;
  disabledReason?: string;
};

interface CallView {
  title: string;
  subtitle: string;
  scene: string;
  lines: string[];
  meta: string;
  actions: CallActionOption[];
  actionGroups: CallActionGroupView[];
  badge: string;
  isRuntime: boolean;
}

interface CallActionGroupView {
  title: string;
  actions: CallActionOption[];
}

interface CallPageProps {
  call: CallContext | null;
  crew: CrewMember[];
  tiles: MapTile[];
  activeCalls: Record<string, RuntimeCall>;
  elapsedGameSeconds: number;
  gameTimeLabel: string;
  /** Full game state — used to build the condition-evaluation context for action visibility. */
  gameState: GameState;
  onDecision: (actionId: string) => void;
  onConfirmMove: () => void;
  onClearMoveTarget: () => void;
  onSelectMoveTarget: (tileId: string) => void;
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
  gameState,
  onDecision,
  onConfirmMove,
  onClearMoveTarget,
  onSelectMoveTarget,
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
  const crewActionViews = useMemo(
    () =>
      Object.fromEntries(
        crew.map((item) => [
          item.id,
          deriveCrewActionViewModel({
            member: item,
            crewActions: gameState.crew_actions,
            activeCalls,
            elapsedGameSeconds,
            tiles,
          }),
        ]),
      ),
    [activeCalls, crew, elapsedGameSeconds, gameState.crew_actions, tiles],
  );
  const memberActionView = member ? crewActionViews[member.id] : null;
  const moveCells = useMemo(() => getFullTileWindow(defaultMapConfig).cells, []);

  const callView = useMemo<CallView | null>(() => {
    if (!call || !member || !memberActionView) {
      return null;
    }

    const currentLocation = getTileLocationLabel(defaultMapConfig, member.currentTile);
    if (call.runtimeCallId) {
      if (!runtimeCall || !isRuntimeCallActive(runtimeCall, elapsedGameSeconds)) {
        return {
          title: `通话页面：${member.name} 事件通话`,
          subtitle: "这条事件通话已经结束、过期或不可用。",
          scene: "通话画面 / 事件快照不可用",
          lines: ["当前没有可处理的 runtime call。请返回通讯台查看事件通话。"],
          meta: "事件通话已关闭",
          actions: [] satisfies CallActionOption[],
          actionGroups: [],
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
        actionGroups: [],
        badge: formatRuntimeCallStatus(runtimeCall),
        isRuntime: true,
      };
    }

    const currentTile = tiles.find((tile) => tile.id === member.currentTile);
    const actionGroups = currentTile
      ? buildCallView({
          member,
          tile: currentTile,
          gameState,
        }).groups
      : [];

    return {
      title: `通话页面：${member.name} 状态确认`,
      subtitle: "当前只处理这一条通话。其他队员可以查看，但不能接入第二条通话。",
        scene: "通话画面 / 状态确认 / 当前坐标回传",
      lines: [
        memberActionView.actionStatus === "idle"
          ? `${member.name} 正在等待新的行动指令。`
          : `${member.name} 当前状态：${memberActionView.statusText}`,
      ],
      meta: `地点：${currentLocation} / 行动：${memberActionView.actionTitle}`,
      actions: [] satisfies CallActionOption[],
      actionGroups: actionGroups satisfies CallActionGroupView[],
      badge: "普通通话",
      isRuntime: false,
    };
  }, [activeCalls, call, elapsedGameSeconds, gameState, member, memberActionView, runtimeCall, tiles]);

  if (!call || !member || !callView || !memberActionView) {
    return (
      <ConsoleShell title="通话页面" subtitle="没有活动通话。" gameTimeLabel={gameTimeLabel}>
        <Panel>
          <p>当前没有通话事件。请返回通讯台。</p>
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

        <Panel className="call-panel" tone={memberActionView.statusTone}>
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
            {callView.isRuntime && runtimeCall ? getRuntimeCallTiming(runtimeCall, elapsedGameSeconds) : memberActionView.timingText}
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
              targetCell={moveCells.find((cell) => cell.id === call.selectedTargetTileId)}
              moveCells={moveCells}
              tiles={tiles}
              preview={movePreview}
              callClosed={callClosed}
              selectedTargetTileId={call.selectedTargetTileId}
              onOpenMap={onOpenMap}
              onSelectMoveTarget={onSelectMoveTarget}
              onConfirmMove={onConfirmMove}
              onClearMoveTarget={onClearMoveTarget}
            />
          ) : null}

          {callView.isRuntime ? (
            <div className="action-stack">{callView.actions.map((action) => renderActionButton(action, member, callClosed, onDecision))}</div>
          ) : (
            <div className="action-stack">
              {callView.actionGroups.map((group) => (
                <section key={group.title} className="call-action-group">
                  <h3>{group.title}</h3>
                  <div className="action-stack">{group.actions.map((action) => renderActionButton(action, member, callClosed, onDecision))}</div>
                </section>
              ))}
            </div>
          )}

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
                <StatusTag tone={crewActionViews[item.id].statusTone}>{crewActionViews[item.id].statusText}</StatusTag>
              </div>
            ))}
          </Panel>
        ) : null}
      </div>
    </ConsoleShell>
  );
}

function renderActionButton(action: CallActionOption, _member: CrewMember, callClosed: boolean, onDecision: (actionId: string) => void) {
  const disabled = callClosed || Boolean(action.disabled);

  return (
    <button
      type="button"
      key={action.id}
      className={`choice-button choice-${action.tone ?? "neutral"}`}
      onClick={() => onDecision(action.id)}
      disabled={disabled}
    >
      <span>{action.label}</span>
      {action.hint ? <small>{action.hint}</small> : null}
      {action.disabledReason ? <small>{action.disabledReason}</small> : null}
    </button>
  );
}

function MoveConfirmPanel({
  member,
  targetTile,
  targetCell,
  moveCells,
  tiles,
  preview,
  callClosed,
  selectedTargetTileId,
  onOpenMap,
  onSelectMoveTarget,
  onConfirmMove,
  onClearMoveTarget,
}: {
  member: CrewMember;
  targetTile: MapTile | undefined;
  targetCell: VisibleTileCell | undefined;
  moveCells: VisibleTileCell[];
  tiles: MapTile[];
  preview: ReturnType<typeof createMovePreview> | null;
  callClosed: boolean;
  selectedTargetTileId: string | undefined;
  onOpenMap: () => void;
  onSelectMoveTarget: (tileId: string) => void;
  onConfirmMove: () => void;
  onClearMoveTarget: () => void;
}) {
  if (!targetTile || !preview) {
    return (
      <div className="move-confirm-box">
        <strong>目的地未标记</strong>
        <p>从下方列表或地图选择一个候选目的地。移动指令仍需在通话中确认。</p>
        <MoveTargetList
          member={member}
          moveCells={moveCells}
          tiles={tiles}
          selectedTargetTileId={selectedTargetTileId}
          callClosed={callClosed}
          onSelectMoveTarget={onSelectMoveTarget}
        />
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
            {getTileLocationLabel(defaultMapConfig, member.currentTile)}
          </dd>
        </div>
        <div>
          <dt>目标</dt>
          <dd>{formatMoveTargetLabel(targetCell, targetTile)}</dd>
        </div>
        <div>
          <dt>路线</dt>
          <dd>{preview.canMove ? formatVisibleMoveRoute(preview, moveCells) : preview.reason}</dd>
        </div>
        <div>
          <dt>预计耗时</dt>
          <dd>{preview.canMove ? formatDuration(preview.totalDurationSeconds) : "不可达"}</dd>
        </div>
      </dl>
      {preview.interruptionWarning ? <p className="danger-text">{preview.interruptionWarning}</p> : null}
      <MoveTargetList
        member={member}
        moveCells={moveCells}
        tiles={tiles}
        selectedTargetTileId={selectedTargetTileId}
        callClosed={callClosed}
        onSelectMoveTarget={onSelectMoveTarget}
      />
      <p className="muted-text">确认后才会下达移动指令。抵达目标地块后，{member.name} 将原地待命。</p>
      <div className="move-confirm-actions">
        <button type="button" className="primary-button" onClick={onConfirmMove} disabled={!preview.canMove || callClosed}>
          确认请求 {member.name} 前往 {formatMoveTargetShortLabel(targetCell, targetTile)}
        </button>
        <button type="button" className="secondary-button" onClick={onClearMoveTarget} disabled={callClosed}>
          清除候选
        </button>
      </div>
    </div>
  );
}

function MoveTargetList({
  member,
  moveCells,
  tiles,
  selectedTargetTileId,
  callClosed,
  onSelectMoveTarget,
}: {
  member: CrewMember;
  moveCells: VisibleTileCell[];
  tiles: MapTile[];
  selectedTargetTileId: string | undefined;
  callClosed: boolean;
  onSelectMoveTarget: (tileId: string) => void;
}) {
  return (
    <div className="move-target-list" aria-label="移动目标列表">
      {moveCells.map((cell) => {
        const tile = tiles.find((item) => item.id === cell.id);
        const preview = createMovePreview(member, cell.id, tiles);
        const selected = selectedTargetTileId === cell.id;
        return (
          <button
            type="button"
            key={cell.id}
            className={`choice-button ${selected ? "choice-accent" : "choice-neutral"}`}
            disabled={callClosed || !tile || !preview.canMove}
            onClick={() => onSelectMoveTarget(cell.id)}
          >
            <span>{formatMoveTargetLabel(cell, tile)}</span>
            <small>{preview.canMove ? `预计 ${formatDuration(preview.totalDurationSeconds)}` : preview.reason ?? "不可达"}</small>
          </button>
        );
      })}
    </div>
  );
}

function formatMoveTargetLabel(cell: VisibleTileCell | undefined, tile: MapTile | undefined) {
  if (!cell) {
    return tile?.coord ?? "未知目标";
  }

  return `${getTileLocationLabel(defaultMapConfig, cell.id)} / 地形：${cell.tile?.terrain ?? tile?.terrain ?? "未知地形"}`;
}

function formatMoveTargetShortLabel(cell: VisibleTileCell | undefined, tile: MapTile | undefined) {
  if (!cell) {
    return tile?.coord ?? "未知目标";
  }

  return getTileLocationLabel(defaultMapConfig, cell.id);
}

function formatVisibleMoveRoute(preview: NonNullable<ReturnType<typeof createMovePreview>>, moveCells: VisibleTileCell[]) {
  const cellsById = new Map(moveCells.map((cell) => [cell.id, cell]));
  return preview.steps
    .map((step) => {
      const cell = cellsById.get(step.tileId);
      if (cell) {
        return `${getTileLocationLabel(defaultMapConfig, cell.id)} ${step.terrain}`;
      }

      return step.coord;
    })
    .join(" → ");
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
