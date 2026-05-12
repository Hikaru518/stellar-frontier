import { useMemo } from "react";
import { buildCallView, type CallActionTargetView, type CallFeatureContextView } from "../callActions";
import { GameConsoleLayout } from "../components/Layout";
import { defaultMapConfig } from "../content/contentData";
import { createMovePreview, deriveCrewActionViewModel, type CrewActionViewModel } from "../crewSystem";
import type { ActionOption, CallContext, CrewId, CrewMember, GameMapState, GameState, MapTile, SystemLog } from "../data/gameData";
import type { RuntimeCall } from "../events/types";
import { getTileLocationLabel } from "../mapSystem";
import { formatDuration, getRemainingSeconds } from "../timeSystem";

type CallActionOption = ActionOption & {
  target?: CallActionTargetView;
  disabled?: boolean;
  disabledReason?: string;
};

interface CallView {
  scene: string;
  lines: string[];
  meta: string;
  actions: CallActionOption[];
  actionGroups: CallActionGroupView[];
  featureContexts: CallFeatureContextView[];
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
  hasQuestUpdates: boolean;
  gameState: GameState;
  logs: SystemLog[];
  onDecision: (actionId: string) => void;
  onEndCall: () => void;
  onConfirmMove: () => void;
  onClearMoveTarget: () => void;
  onOpenMap: () => void;
  onOpenControl: () => void;
  onOpenTask: () => void;
  onStartCall: (crewId: CrewId) => void;
  onShowCrewStatus: (crewId: CrewId) => void;
  onShowCrewInventory: (crewId: CrewId) => void;
}

export function CallPage({
  call,
  crew,
  tiles,
  activeCalls,
  elapsedGameSeconds,
  gameTimeLabel,
  hasQuestUpdates,
  gameState,
  logs,
  onDecision,
  onEndCall,
  onConfirmMove,
  onClearMoveTarget,
  onOpenMap,
  onOpenControl,
  onOpenTask,
  onStartCall,
  onShowCrewStatus,
  onShowCrewInventory,
}: CallPageProps) {
  const latestLog = logs[logs.length - 1];
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
      ) as Record<CrewId, CrewActionViewModel>,
    [activeCalls, crew, elapsedGameSeconds, gameState.crew_actions, tiles],
  );
  const memberActionView = member ? crewActionViews[member.id] : null;
  const callView = useMemo<CallView | null>(() => {
    if (!call || !member || !memberActionView) {
      return null;
    }

    const currentLocation = getTileLocationLabel(defaultMapConfig, member.currentTile, gameState.map);
    if (call.runtimeCallId) {
      if (!runtimeCall || !isRuntimeCallActive(runtimeCall, elapsedGameSeconds)) {
        return {
          scene: "通话画面 / 事件快照不可用",
          lines: ["当前没有可处理的 runtime call。请返回任务页或控制台继续操作。"],
          meta: "事件通话已关闭",
          actions: [],
          actionGroups: [],
          featureContexts: [],
          badge: "已关闭",
          isRuntime: true,
        };
      }

      return {
        scene: "通话中的图片 / runtime call / 已渲染快照",
        lines: runtimeCall.rendered_lines.length ? runtimeCall.rendered_lines.map((line) => line.text) : ["通讯内容为空。"],
        meta: `事件：${runtimeCall.event_id} / 节点：${runtimeCall.event_node_id}`,
        actions: runtimeCall.available_options.map((option) => ({
          id: option.option_id,
          label: option.text,
        })),
        actionGroups: [],
        featureContexts: [],
        badge: formatRuntimeCallStatus(runtimeCall),
        isRuntime: true,
      };
    }

    const currentTile = tiles.find((tile) => tile.id === member.currentTile);
    const normalCallView = currentTile
      ? buildCallView({
          member,
          tile: currentTile,
          gameState,
        })
      : null;

    return {
      scene: "通话画面 / 状态确认 / 当前坐标回传",
      lines: [
        memberActionView.actionStatus === "idle"
          ? `${member.name} 正在等待新的行动指令。`
          : `${member.name} 当前状态：${memberActionView.statusText}`,
      ],
      meta: `地点：${currentLocation} / 行动：${memberActionView.actionTitle}`,
      actions: [],
      actionGroups: normalCallView?.groups ?? [],
      featureContexts: normalCallView?.featureContexts ?? [],
      badge: "普通通话",
      isRuntime: false,
    };
  }, [activeCalls, call, elapsedGameSeconds, gameState, member, memberActionView, runtimeCall, tiles]);

  if (!call || !member || !callView || !memberActionView) {
    return (
      <GameConsoleLayout
        title="通话界面"
        subtitle=""
        gameTimeLabel={gameTimeLabel}
        navItems={[
          { id: "control", label: "控制台", meta: "main", onClick: onOpenControl },
          { id: "task", label: "任务", meta: "task", attention: hasQuestUpdates, onClick: onOpenTask },
          { id: "map", label: "地图", meta: "map", onClick: onOpenMap },
        ]}
        crewPanel={<div className="console-crew-stack" />}
        rightPanel={<section className="console-side-panel console-right-empty" aria-hidden="true" />}
        bottomBar={
          <div className="console-bottom-strip">
            <strong>] LOG:</strong>
            <span>当前没有活动通话。</span>
          </div>
        }
      >
        <div className="console-screen-content console-call-screen">
          <div className="console-screen-header">
            <span>crt live call</span>
            <strong>通话界面 / idle</strong>
            <span>no active call</span>
          </div>
          <div className="console-screen-body">
            <section className="console-screen-block">
              <p className="console-screen-command">] WAIT FOR SIGNAL</p>
              <p>当前没有活动通话。请从任务页或控制台重新接入。</p>
            </section>
          </div>
        </div>
      </GameConsoleLayout>
    );
  }

  return (
    <GameConsoleLayout
      title={`${member.name} 通话界面`}
      subtitle=""
      gameTimeLabel={gameTimeLabel}
      statusItems={[
        { label: "channel", value: callView.isRuntime ? "runtime" : "normal" },
        { label: "crew", value: member.name },
        { label: "status", value: callView.badge },
        { label: "timer", value: callView.isRuntime && runtimeCall ? getRuntimeCallTiming(runtimeCall, elapsedGameSeconds) : memberActionView.timingText },
      ]}
      navItems={[
        { id: "control", label: "控制台", meta: "main", onClick: onOpenControl },
        { id: "task", label: "任务", meta: "task", attention: hasQuestUpdates, onClick: onOpenTask },
        { id: "map", label: "地图", meta: "map", onClick: onOpenMap },
      ]}
      crewPanel={
        <div className="console-crew-stack">
          {crew.map((item) => {
            const actionView = crewActionViews[item.id];
            const isActiveCrew = item.id === member.id;
            const hasRuntime = Object.values(activeCalls).some((entry) => entry.crew_id === item.id && isRuntimeCallActive(entry, elapsedGameSeconds));
            const canSwitchCall = callClosed || isActiveCrew;
            return (
              <article key={item.id} className={`console-crew-card ${isActiveCrew || hasRuntime || item.hasIncoming ? "console-crew-card-alert" : ""}`}>
                <div className="console-crew-avatar">{item.name.slice(0, 1)}</div>
                <div className="console-crew-copy">
                  <div className="console-crew-heading">
                    <strong>{item.name}</strong>
                    <span>{item.role}</span>
                    <span className={`console-crew-state-inline ${item.canCommunicate ? "console-crew-state-success" : "console-crew-state-danger"}`}>
                      {item.canCommunicate ? "在线" : "失联"}
                    </span>
                  </div>
                  <p>{getTileLocationLabel(defaultMapConfig, item.currentTile, gameState.map)}</p>
                  <p>{actionView.statusText}</p>
                  <p>{actionView.blockingReason ?? actionView.timingText}</p>
                </div>
                <div className="console-crew-actions">
                  <button
                    type="button"
                    className="console-crew-button console-crew-button-secondary"
                    onClick={() => onShowCrewStatus(item.id)}
                  >
                    查看状态
                  </button>
                  <button
                    type="button"
                    className="console-crew-button console-crew-button-secondary"
                    onClick={() => onShowCrewInventory(item.id)}
                  >
                    查看背包
                  </button>
                  <button
                    type="button"
                    className={`console-crew-button ${isActiveCrew ? "console-crew-button-active-call" : ""}`}
                    onClick={() => onStartCall(item.id)}
                    disabled={!canSwitchCall || !actionView.canStartCall}
                  >
                    {isActiveCrew ? "通话中" : canSwitchCall ? "通话" : "占线"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      }
      rightPanel={
        <section className="console-side-panel console-call-side-panel">
          <div className="console-column-header">
            <span>call controls</span>
          </div>

          <button type="button" className="choice-button choice-muted" onClick={onEndCall}>
            <span>结束通话</span>
          </button>

          {call.selectingMoveTarget && !callView.isRuntime ? (
            <MoveConfirmPanel
              member={member}
              map={gameState.map}
              targetTile={selectedMoveTarget}
              preview={movePreview}
              callClosed={callClosed}
              onOpenMap={onOpenMap}
              onConfirmMove={onConfirmMove}
              onClearMoveTarget={onClearMoveTarget}
            />
          ) : null}

          {!callView.isRuntime && callView.featureContexts.length ? <FeatureContextPanel features={callView.featureContexts} /> : null}

          {callView.isRuntime ? (
            <div className="console-call-action-groups">
              <section className="console-call-action-group">
                <h3>事件选项</h3>
                <div className="console-call-option-list">
                  {callView.actions.map((action) => renderActionButton(action, callClosed, onDecision))}
                </div>
              </section>
            </div>
          ) : (
            <div className="console-call-action-groups">
              {callView.actionGroups.map((group) => (
                <section key={group.title} className="console-call-action-group">
                  <h3>{group.title}</h3>
                  <div className="console-call-option-list">
                    {group.actions.map((action) => renderActionButton(action, callClosed, onDecision))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <div className="console-task-trace">
            <p className="console-map-trace-line">
              {callView.isRuntime
                ? callClosed
                  ? "[CALL] 事件通话已关闭。"
                  : "[CALL] 选择后只提交 option_id，事件推进由 runtime engine 负责。"
                : callClosed
                  ? "[CALL] 本轮选择已结算。"
                  : "[CALL] 选择行动后会更新队员、地块或通讯状态。"}
            </p>
          </div>
        </section>
      }
      bottomBar={
        <div className="console-bottom-strip">
          <strong>] LOG:</strong>
          <span>{latestLog ? latestLog.text : "通话链路稳定。"}</span>
        </div>
      }
    >
      <div className="console-screen-content console-call-screen">
        <div className="console-screen-header">
          <span>crt live call</span>
          <strong>{member.name} / {callView.isRuntime ? "Runtime Channel" : "Field Link"}</strong>
          <span>{callView.scene}</span>
        </div>
        <div className="console-screen-body">
          <>
            <section className="console-screen-block console-call-visual-grid">
              <div className="console-call-art-block">
                <p className="console-screen-command">] OPEN SIGNAL-CAPTURE.BAS</p>
                {buildCallAsciiScene(callView, member, callClosed).map((line, index) => (
                  <p key={`scene-${index}-${line}`} className="console-call-art-line">{line}</p>
                ))}
              </div>
              <div className="console-call-portrait-block">
                <p className="console-screen-command">] CREW PORTRAIT</p>
                {buildCrewPortrait(member, callView.isRuntime).map((line, index) => (
                  <p key={`portrait-${index}-${line}`} className="console-call-portrait-line">{line}</p>
                ))}
                <div className="console-call-profile-copy">
                  <p className="console-screen-line console-screen-line-cyan">CREW: {member.name.toUpperCase()} / {member.role}</p>
                  <p className="console-call-note-line">VOICE: {member.voiceTone}</p>
                  <p className="console-call-note-line">TAGS: {member.personalityTags.join(" / ") || "NONE"}</p>
                  <p className="console-call-note-line">INTRO: {member.profile.selfIntro}</p>
                </div>
              </div>
            </section>
            <section className="console-screen-block">
              <p className="console-screen-section">[ LIVE TRANSCRIPT ]</p>
              {(call.result && !callView.isRuntime ? [call.result] : callView.lines).map((line, index) => (
                <p key={`transcript-${index}-${line}`} className="console-call-dialogue-line">{line}</p>
              ))}
              <p className={callView.isRuntime ? "console-screen-line console-screen-line-rose" : "console-screen-line console-screen-line-cyan"}>
                {callView.isRuntime && runtimeCall ? getRuntimeCallTiming(runtimeCall, elapsedGameSeconds) : memberActionView.timingText}
              </p>
            </section>
            <section className="console-screen-block">
              <p className="console-screen-section">[ CALL META ]</p>
              <p className="console-screen-line console-screen-line-amber">{callView.meta}</p>
              {!callView.isRuntime ? (
                <p className="console-call-note-line">
                  {call.selectingMoveTarget ? "地图已进入候选坐标标记模式，确认仍需在右侧完成。" : "移动、调查、修复等行动都在右侧控制区提交。"}
                </p>
              ) : (
                <p className="console-call-note-line">事件图像只是快照回传，真正推进由右侧选项完成。</p>
              )}
            </section>
          </>
        </div>
      </div>
    </GameConsoleLayout>
  );
}

function renderActionButton(action: CallActionOption, callClosed: boolean, onDecision: (actionId: string) => void) {
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
      {action.target?.kind === "feature" ? (
        <small className="choice-target-meta" aria-hidden="true">
          {formatFeatureTargetMeta(action.target)}
        </small>
      ) : null}
      {action.hint ? <small>{action.hint}</small> : null}
      {action.disabledReason ? <small className="choice-disabled-reason">{action.disabledReason}</small> : null}
    </button>
  );
}

function FeatureContextPanel({ features }: { features: CallFeatureContextView[] }) {
  return (
    <section className="console-call-feature-context" aria-label="Feature 目标上下文">
      <h3>Feature上下文</h3>
      <div className="feature-context-list">
        {features.map((feature) => (
          <div key={feature.id} className={`feature-context-row ${feature.isActionTarget ? "feature-context-row-target" : ""}`}>
            <strong>{feature.name}</strong>
            <span>{formatFeatureContextStatus(feature)}</span>
            <em>{feature.isActionTarget ? "可行动目标" : "仅上下文"}</em>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatFeatureTargetMeta(target: CallActionTargetView) {
  const parts = [`目标：${target.name}`];
  const status = target.statusLabel ?? target.status;
  if (status) {
    parts.push(`状态：${status}`);
  }
  return parts.join(" / ");
}

function formatFeatureContextStatus(feature: CallFeatureContextView) {
  const status = feature.statusLabel ?? feature.status;
  return status ? `状态：${status}` : "状态：未知";
}

function MoveConfirmPanel({
  member,
  map,
  targetTile,
  preview,
  callClosed,
  onOpenMap,
  onConfirmMove,
  onClearMoveTarget,
}: {
  member: CrewMember;
  map: GameMapState;
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
        <p>打开地图标记一个候选目的地。移动指令仍需回到通话中确认。</p>
        <button type="button" className="primary-button" onClick={onOpenMap} disabled={callClosed}>
          打开地图选择目的地
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
          <dd>{getTileLocationLabel(defaultMapConfig, member.currentTile, map)}</dd>
        </div>
        <div>
          <dt>目标</dt>
          <dd>{formatMoveTargetLabel(targetTile, map)}</dd>
        </div>
        <div>
          <dt>路线</dt>
          <dd>{preview.canMove ? formatVisibleMoveRoute(preview, map) : preview.reason}</dd>
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
          确认请求 {member.name} 前往 {formatMoveTargetShortLabel(targetTile, map)}
        </button>
        <button type="button" className="secondary-button" onClick={onOpenMap} disabled={callClosed}>
          重新选择
        </button>
        <button type="button" className="secondary-button" onClick={onClearMoveTarget} disabled={callClosed}>
          清除候选
        </button>
      </div>
    </div>
  );
}

function buildCallAsciiScene(callView: CallView, member: CrewMember, callClosed: boolean) {
  const sceneKey = `${callView.meta} ${callView.lines.join(" ")}`.toLowerCase();
  if (callView.isRuntime) {
    if (sceneKey.includes("坠毁") || sceneKey.includes("crash")) {
      return [
        frameTop("EVENT VIEW", 61),
        frameLine("CASE 1A / CRASH COUNTDOWN", 61),
        frameLine("CORE LOSS / BACKUP POWER / LIFE SUPPORT", 61),
        frameLine("", 61),
        frameLine("           ^^^^                      ######", 61),
        frameLine("        ^^^^^^^^^^                 ###****###", 61),
        frameLine("      ^^^^^^^^^^^^^^             ##***##***##", 61),
        frameLine("     ^^^^^^^||^^^^^^^          ###***####***###", 61),
        frameLine(" .....^^^^^^||^^^^^^^.....     ##***######***##", 61),
        frameLine("::::::::::::||::::::::::::     ######/==\\\\######", 61),
        frameLine(":::::::::::/\\\\::::::::::::      ||  /====\\\\  ||", 61),
        frameLine("::::::::::/##\\\\:::::::::::      || /======\\\\ ||", 61),
        frameLine(":::::::::/####\\\\::::::::::     /**\\\\|  XX  |/**\\\\", 61),
        frameLine("::::::::/######\\\\:::::::::    /****\\\\______/****\\\\", 61),
        frameLine(":::::::/########\\\\::::::::      **    /\\\\    **", 61),
        frameLine("", 61),
        frameLine(callClosed ? "CALL CLOSED / SIGNAL FADING" : "CALL OPEN / RISK CRITICAL / WAIT DECISION", 61),
      ];
    }
    if (sceneKey.includes("门域") || sceneKey.includes("接触")) {
      return [
        frameTop("EVENT VIEW", 61),
        frameLine("CASE 3A / GATE CONTACT", 61),
        frameLine("", 61),
        frameLine("        . . . . . . . . . . . . . . . . .", 61),
        frameLine("     . . . . . . .       . . . . . . . . .", 61),
        frameLine("   . . . . .       ____       . . . . . .", 61),
        frameLine(" . . . . .       /::::::\\\\       . . . . .", 61),
        frameLine(". . . .        /:::/\\\\  /:::\\\\        . . . .", 61),
        frameLine(". . .         |::|  ||  |::|         . . .", 61),
        frameLine(". . .         |::|  ||  |::|    +++  . . .", 61),
        frameLine(". . .          \\\\::\\\\_||_/::/   +++++++ . . .", 61),
        frameLine(" . . .           \\\\::::::::/   +++ +++ . . .", 61),
        frameLine("   . . .           \\\\::::/       +++  . . .", 61),
        frameLine("     . . .          /__/              . . .", 61),
        frameLine("", 61),
        frameLine(callClosed ? "CONTACT ENDED / ARCHIVE SEALED" : "CONTACT LIVE / UNKNOWN SEMANTICS / HOLD", 61),
      ];
    }
    return [
      frameTop("EVENT VIEW", 61),
      frameLine("SIDE EVENT / REMOTE SNAPSHOT", 61),
      frameLine("", 61),
      frameLine("     ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~", 61),
      frameLine("   ~ ~       signal wash / unstable frame   ~ ~", 61),
      frameLine(" ~ ~      ##############################     ~ ~", 61),
      frameLine("~ ~       ######  ######  ######  ######      ~ ~", 61),
      frameLine("~ ~       ##  ##  ##  ##  ##  ##  ##  ##      ~ ~", 61),
      frameLine("~ ~       ######  ######  ######  ######      ~ ~", 61),
      frameLine(" ~ ~        ||      ||      ||      ||       ~ ~", 61),
      frameLine("   ~ ~      ||      ||      ||      ||     ~ ~", 61),
      frameLine("     ~ ~    /\\\\      /\\\\      /\\\\      /\\\\   ~ ~", 61),
      frameLine("", 61),
      frameLine(callClosed ? "SNAPSHOT COMPLETE / LINK TERMINATED" : "SNAPSHOT LIVE / OPTION INPUT REQUIRED", 61),
    ];
  }

  return [
    frameTop("FIELD LINK", 61),
    frameLine(`CREW ${member.name.toUpperCase()} / OPEN CHANNEL`, 61),
    frameLine("", 61),
    frameLine("             _____________", 61),
    frameLine("            /  RADIO CRT  \\\\", 61),
    frameLine("           /_______________\\\\", 61),
    frameLine("                ||   ||", 61),
    frameLine("         __     ||   ||     __", 61),
    frameLine("        / /|    ||   ||    |\\\\ \\\\", 61),
    frameLine("       /_/ |   /||___||\\\\   | \\\\_\\\\", 61),
    frameLine("       ||  |  /_  ___  _\\\\  |  ||", 61),
    frameLine("       ||  |    \\\\/   \\\\/    |  ||", 61),
    frameLine("       ||  |    /|   |\\\\    |  ||", 61),
    frameLine("       ||  |   /_|___|_\\\\   |  ||", 61),
    frameLine("       ||  |      /_\\\\      |  ||", 61),
    frameLine("       ||__|               |__||", 61),
    frameLine("", 61),
    frameLine(callClosed ? "CHANNEL SEALED / DECISION LOGGED" : "CHANNEL OPEN / ACTION READY / FIELD VOICE STABLE", 61),
  ];
}

function buildCrewPortrait(member: CrewMember, runtime: boolean) {
  const accent = runtime ? "RUNTIME" : "FIELD";
  return [
    frameTop("CREW PORTRAIT", 20),
    frameLine(member.name.toUpperCase(), 20),
    frameLine("", 20),
    frameLine("     .-''''''-.", 20),
    frameLine("   .'  .--.   '.", 20),
    frameLine("  /   / __ \\\\   \\\\", 20),
    frameLine(" |   | /  \\\\ |   |", 20),
    frameLine(" |   | |  | |   |", 20),
    frameLine(" |   | |__| |   |", 20),
    frameLine("  \\\\   \\\\____/   /", 20),
    frameLine("   '._  __  _.-'", 20),
    frameLine("      \\\\/__\\\\/", 20),
    frameLine(`TAG ${accent}`, 20),
    frameLine("VOX TIGHT / LOW", 20),
  ];
}

function frameTop(label: string, innerWidth: number) {
  const core = `-[${label}]-`;
  return `+${core}${"-".repeat(Math.max(0, innerWidth - core.length))}+`;
}

function frameLine(text: string, innerWidth: number) {
  return `|${text.padEnd(innerWidth, " ")}|`;
}

function formatMoveTargetLabel(tile: MapTile | undefined, map: GameMapState) {
  if (!tile) {
    return "未知目标";
  }

  return `${getTileLocationLabel(defaultMapConfig, tile.id, map)} / 地形：${tile.terrain}`;
}

function formatMoveTargetShortLabel(tile: MapTile | undefined, map: GameMapState) {
  return tile ? getTileLocationLabel(defaultMapConfig, tile.id, map) : "未知目标";
}

function formatVisibleMoveRoute(preview: NonNullable<ReturnType<typeof createMovePreview>>, map: GameMapState) {
  return preview.steps
    .map((step) => {
      return `${getTileLocationLabel(defaultMapConfig, step.tileId, map)} ${step.terrain}`;
    })
    .join(" -> ");
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
