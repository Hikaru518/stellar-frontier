import { useEffect, useMemo, useRef, useState } from "react";
import { CallPage } from "./pages/CallPage";
import { ControlCenter } from "./pages/ControlCenter";
import { CrewConsolePage, type CrewConsoleMode } from "./pages/CrewConsolePage";
import { DebugToolbox, type TimeMultiplier } from "./pages/DebugToolbox";
import { EndingPage } from "./pages/EndingPage";
import { MapPage } from "./pages/MapPage";
import { TaskPage } from "./pages/TaskPage";
import { QuestSidebar } from "./components/QuestSidebar";
import { settleAction, type ActionSettlementPatch } from "./callActionSettlement";
import { advanceCrewMoveAction, createMovePreview, normalizeCrewMember, startCrewMove, syncTileCrew } from "./crewSystem";
import { appendDiaryEntry } from "./diarySystem";
import { eventContentLibrary, questDefinitions, type QuestNavigationEntry } from "./content/contentData";
import { buildCallView, getTimedRepairLockReason, isMapObjectRepaired } from "./callActions";
import { mapObjectDefinitionById, type ActionDef, type MapObjectDefinition, type TimedRepairLocalActionDef } from "./content/mapObjects";
import { buildEventContentIndex } from "./events/contentIndex";
import { completeObjective, processEventWakeups, processTrigger, selectCallOption } from "./events/eventEngine";
import type { GraphRunnerGameState } from "./events/graphRunner";
import {
  createEmptyEventRuntimeState,
  type CrewState,
  type CrewActionState,
  type EventRuntimeState,
  type Id,
  type InventoryState,
  type RuntimeCall,
  type TileState,
  type TriggerContext,
  type WorldFlag,
} from "./events/types";
import { defaultMapConfig } from "./content/contentData";
import { canMoveToTile, getTileLocationLabel } from "./mapSystem";
import {
  createBaseInventoryFromResources,
  createInitialMapState,
  createMapTilesFromConfig,
  initialCrew,
  initialLogs,
  resources as initialResources,
  type ActiveAction,
  type CallContext,
  type CrewId,
  type GameState,
  type CrewMember,
  type GameMapState,
  type MapReturnTarget,
  type MapTile,
  type PageId,
  type ResourceSummary,
  type SystemLog,
  type Tone,
} from "./data/gameData";
import { clearGameSaves, formatDuration, formatGameTime, loadGameSave, saveGameState } from "./timeSystem";
import { GAME_SAVE_SCHEMA_VERSION, isCompatibleGameSaveState } from "./timeSystem";
import { buildQuestSidebarView, createInitialQuestState, normalizeQuestState, type QuestCategoryFilter, type QuestStatusFilter } from "./questSystem";
import { logger } from "./logger";
import {
  acquireYuanDualDeviceTerminal,
  createDualDeviceMessage,
  createPairingSession,
  DUAL_DEVICE_PC_EVENT_METHOD,
  DUAL_DEVICE_PHONE_DELIVERY_METHOD,
  provideDualDeviceService,
  requestDualDeviceMessage,
  shouldEnablePcFallback,
  validatePhoneChoiceSelectPayload,
  type DualDeviceMessage,
  type DualDevicePairingSession,
  type PhoneChoiceSelectPayload,
  type YuanDualDeviceTerminal,
} from "@stellar-frontier/dual-device";

const eventContentIndexResult = buildEventContentIndex(eventContentLibrary);
if (eventContentIndexResult.errors.length > 0) {
  throw new Error(`Event content index failed: ${eventContentIndexResult.errors.map((error) => error.message).join("; ")}`);
}
const eventContentIndex = eventContentIndexResult.index;
const CURRENT_AREA_SURVEY_EMPTY_RESULT = "当前地点没有可触发的调查事件。";
const MOBILE_FALLBACK_AFTER_MS = 10000;
const defaultMapTileById = new Map(defaultMapConfig.tiles.map((tile) => [tile.id, tile]));

type QuestNavigationHint =
  | { type: "tile"; tileId: string; label: string }
  | { type: "crew"; crewId: CrewId; label: string }
  | { type: "unavailable"; label: string };

type SavedCrewMember = Partial<CrewMember> & { id: CrewId };

type SavedGameState = Partial<Omit<GameState, "crew">> & {
  crew?: SavedCrewMember[];
};

type MobileMode = "waiting" | "active" | "fallback";
type MobileSessionStatus = "waiting" | "connected" | "offline";
interface MobileSessionState {
  status: MobileSessionStatus;
  lastHeartbeatAt?: number;
  fallbackAfterMs: number;
}

export interface PcMobileStatusCard {
  mode: MobileMode;
  lastHeartbeatAt?: number;
  fallbackAfterMs: number;
  unreadCount: number;
  emergencyCount: number;
}

export function validatePhoneMessageEnvelope(
  message: DualDeviceMessage,
  pairingSession: Pick<DualDevicePairingSession, "roomId" | "phoneTerminalId">,
  lastAcceptedSequence: number,
): { ok: true; nextSequence: number } | { ok: false; reason: "room_mismatch" | "client_mismatch" | "invalid_sequence" | "replayed_sequence" } {
  if (message.roomId !== pairingSession.roomId) {
    return { ok: false, reason: "room_mismatch" };
  }
  if (message.clientId !== pairingSession.phoneTerminalId) {
    return { ok: false, reason: "client_mismatch" };
  }
  if (!Number.isSafeInteger(message.sequence) || message.sequence <= 0) {
    return { ok: false, reason: "invalid_sequence" };
  }
  if (message.sequence <= lastAcceptedSequence) {
    return { ok: false, reason: "replayed_sequence" };
  }
  return { ok: true, nextSequence: message.sequence };
}

export function resolvePhoneRuntimeCallCrewId(
  payloadCrewId: Extract<PhoneChoiceSelectPayload, { kind: "runtime_call_option" }>["crewId"],
  authoritativeCrewId: string,
): { ok: true; crewId: string } | { ok: false; reason: "crew_mismatch" } {
  if (payloadCrewId !== null && payloadCrewId !== authoritativeCrewId) {
    return { ok: false, reason: "crew_mismatch" };
  }
  return { ok: true, crewId: authoritativeCrewId };
}

function App() {
  const initialState = useMemo(createInitialGameState, []);
  const [gameState, setGameState] = useState<GameState>(initialState);
  const [page, setPage] = useState<PageId>("control");
  const [currentCall, setCurrentCall] = useState<CallContext | null>(null);
  const [mapReturnTarget, setMapReturnTarget] = useState<MapReturnTarget>("control");
  const [timeMultiplier, setTimeMultiplier] = useState<TimeMultiplier>(1);
  const [debugOpen, setDebugOpen] = useState(false);
  const [questSidebarCollapsed, setQuestSidebarCollapsed] = useState(true);
  const [questStatusFilter, setQuestStatusFilter] = useState<QuestStatusFilter>("all");
  const [questCategoryFilter, setQuestCategoryFilter] = useState<QuestCategoryFilter>("all");
  const [selectedQuestId, setSelectedQuestId] = useState<string | undefined>();
  const [questNavigationHint, setQuestNavigationHint] = useState<QuestNavigationHint | null>(null);
  const [crewConsoleView, setCrewConsoleView] = useState<{ mode: CrewConsoleMode; crewId: CrewId | null }>({
    mode: "status",
    crewId: null,
  });
  const [mobilePairingSession, setMobilePairingSession] = useState(() => createPhoneTerminalPairingSession());
  const [mobileSession, setMobileSession] = useState<MobileSessionState>({ status: "waiting", fallbackAfterMs: MOBILE_FALLBACK_AFTER_MS });
  const terminalRef = useRef<YuanDualDeviceTerminal | null>(null);
  const mobileSequenceRef = useRef(1);
  const lastAcceptedPhoneSequenceRef = useRef(0);
  const gameStateRef = useRef(gameState);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const { elapsedGameSeconds, crew, map, tiles, logs, resources } = gameState;
  const gameTimeLabel = formatGameTime(elapsedGameSeconds);
  const returnHomeCompleted = gameState.world_flags.return_home_completed?.value === true;
  const returnHomeCompletedAt = getWorldFlagNumber(gameState, "return_home_completed_at");
  const completedAtLabel = formatGameTime(returnHomeCompletedAt ?? elapsedGameSeconds);
  const mobileFallback = shouldEnablePcFallback({ transport: mobileSession.status === "offline" ? "offline" : "yuan-wss", lastHeartbeatAt: mobileSession.lastHeartbeatAt, fallbackAfterMs: mobileSession.fallbackAfterMs }, nowMs);
  const mobileMode: MobileMode = typeof mobileSession.lastHeartbeatAt === "number" && !mobileFallback ? "active" : mobileFallback ? "fallback" : "waiting";
  const activeMobileCalls = getActiveRuntimeCalls(gameState, elapsedGameSeconds);
  const activeRuntimeCallCrewIds = activeMobileCalls.map((call) => call.crew_id);
  const mobileStatusCard = {
    mode: mobileMode,
    lastHeartbeatAt: mobileSession.lastHeartbeatAt,
    fallbackAfterMs: mobileSession.fallbackAfterMs,
    unreadCount: activeMobileCalls.length + crew.filter((member) => member.hasIncoming).length,
    emergencyCount: activeMobileCalls.filter(isUrgentRuntimeCallState).length,
  };
  const questSidebarView = useMemo(
    () =>
      buildQuestSidebarView({
        state: gameState.quest_state,
        definitions: questDefinitions,
        statusFilter: questStatusFilter,
        categoryFilter: questCategoryFilter,
        selectedQuestId,
      }),
    [gameState.quest_state, questCategoryFilter, questStatusFilter, selectedQuestId],
  );
  const questSidebar = (
      <QuestSidebar
        view={questSidebarView}
        onNavigate={handleQuestSidebarNavigate}
        navigationMessage={questNavigationHint?.type === "unavailable" ? `任务导航目标不可用：${questNavigationHint.label}` : undefined}
        collapsed={questSidebarCollapsed}
      statusFilter={questStatusFilter}
      categoryFilter={questCategoryFilter}
      onCollapsedChange={setQuestSidebarCollapsed}
      onStatusFilterChange={setQuestStatusFilter}
      onCategoryFilterChange={setQuestCategoryFilter}
      onSelectedQuestIdChange={setSelectedQuestId}
    />
  );

  function handleQuestSidebarNavigate(entry: QuestNavigationEntry) {
    if (entry.type === "page") {
      setQuestNavigationHint(null);
      setMapReturnTarget("control");
      setPage(entry.page);
      return;
    }

    if (entry.type === "tile") {
      if (!tiles.some((tile) => tile.id === entry.tile_id)) {
        setQuestNavigationHint({ type: "unavailable", label: entry.label });
        return;
      }
      setQuestNavigationHint({ type: "tile", tileId: entry.tile_id, label: entry.label });
      setMapReturnTarget("control");
      setPage("map");
      return;
    }

    const crewMember = crew.find((member) => member.id === entry.crew_id);
    if (!crewMember) {
      setQuestNavigationHint({ type: "unavailable", label: entry.label });
      return;
    }
    setQuestNavigationHint({ type: "crew", crewId: crewMember.id, label: entry.label });
    setPage("station");
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setGameState((state) => {
        const incremented = { ...state, elapsedGameSeconds: state.elapsedGameSeconds + timeMultiplier };
        const next = settleGameTime(incremented);
        diffActionsAndLog(state.crew_actions, next.crew_actions, next.elapsedGameSeconds);
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [timeMultiplier]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!shouldStartYuanTerminal()) {
      return;
    }

    setMobileSession((session) => ({ ...session, status: "waiting" }));
    const lease = acquireYuanDualDeviceTerminal({
      hostUrl: mobilePairingSession.hostUrl,
      terminalId: mobilePairingSession.pcTerminalId,
      token: mobilePairingSession.token,
      tenantPublicKey: mobilePairingSession.tenantPublicKey,
      name: "Stellar Frontier PC Authority",
      enableWebRTC: true,
    });
    const { terminal } = lease;
    terminalRef.current = terminal;
    const connectionSubscription = terminal.isConnected$.subscribe((connected) => {
      setMobileSession((session) => ({ ...session, status: connected ? session.status : "offline" }));
    });
    const service = provideDualDeviceService(terminal, DUAL_DEVICE_PC_EVENT_METHOD, handlePhoneEventMessage);
    return () => {
      service.dispose();
      connectionSubscription.unsubscribe();
      if (terminalRef.current === terminal) {
        terminalRef.current = null;
      }
      lease.dispose();
    };
  }, [mobilePairingSession]);

  useEffect(() => {
    saveGameState(gameState);
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    // App 首次挂载：写入 system.run.start。该 useEffect 依赖数组为空，
    // 只在挂载时执行一次。后续 reset 的 run.start 由 resetGame() 内部直接写。
    // payload 不附 GameState 起始 snapshot（ADR-005 / ADR-009）。
    logger.log({
      type: "system.run.start",
      source: "system",
      payload: {
        game_version: __APP_VERSION__,
        schema_version: GAME_SAVE_SCHEMA_VERSION,
      },
      gameSeconds: 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only effect
  }, []);

  useEffect(() => {
    if (returnHomeCompleted) {
      setPage("ending");
    }
  }, [returnHomeCompleted]);

  useEffect(() => {
    if (!currentCall) {
      return;
    }

    const runtimeCall = findRuntimeCallForCrew(gameState, currentCall.crewId);
    if (!runtimeCall || currentCall.runtimeCallId === runtimeCall.id) {
      return;
    }

    const currentRuntimeCall = currentCall.runtimeCallId ? gameState.active_calls[currentCall.runtimeCallId] : undefined;
    if (currentRuntimeCall && isRuntimeCallActiveForState(currentRuntimeCall, gameState.elapsedGameSeconds)) {
      return;
    }

    setCurrentCall((call) =>
      call && call.crewId === currentCall.crewId
        ? {
            ...call,
            type: isUrgentRuntimeCallState(runtimeCall) ? "emergency" : call.type,
            settled: false,
            runtimeCallId: runtimeCall.id,
            result: undefined,
          }
        : call,
    );
  }, [currentCall, gameState]);

  // beforeunload 路径下 handler 必须同步访问最新的 elapsedGameSeconds，但下面
  // 注册 listener 的 useEffect 依赖 `[]`，闭包会捕获 stale state。所以用 ref
  // 同步 elapsedGameSeconds（design §10.1 / §11.US-010 / ADR-003）。
  const elapsedGameSecondsRef = useRef(gameState.elapsedGameSeconds);
  useEffect(() => {
    elapsedGameSecondsRef.current = gameState.elapsedGameSeconds;
  }, [gameState.elapsedGameSeconds]);

  useEffect(() => {
    // 浏览器关闭/刷新前 best-effort 写一条 system.run.end{reason:"unload"} 并
    // 触发 flush。handler 必须同步：beforeunload 内不能 await。
    let fired = false;
    const handleBeforeUnload = (): void => {
      if (fired) return;
      fired = true;
      try {
        logger.log({
          type: "system.run.end",
          source: "system",
          payload: { reason: "unload" },
          gameSeconds: elapsedGameSecondsRef.current,
        });
        void logger.flush();
      } catch {
        // best-effort：忽略错误，不阻塞页面卸载。
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only effect
  }, []);

  function appendLog(text: string, tone: Tone = "neutral") {
    setGameState((state) => ({
      ...state,
      logs: appendLogEntry(state.logs, text, tone, state.elapsedGameSeconds),
    }));
  }

  function openStation() {
    setPage("station");
  }

  function openControlOverview() {
    setPage("control");
  }

  function openCrewStatusPage(crewId: CrewId) {
    setCrewConsoleView({ mode: "status", crewId });
    setPage("crew");
  }

  function openCrewInventoryPage(crewId: CrewId) {
    setCrewConsoleView({ mode: "inventory", crewId });
    setPage("crew");
  }

  function openMap(returnTarget: MapReturnTarget) {
    setMapReturnTarget(returnTarget);
    setPage("map");
  }

  function returnFromMap() {
    setPage(mapReturnTarget === "call" && currentCall ? "call" : "control");
  }

  function resetGame() {
    // 1) 同步写 run.end (旧 run)。logger.log 是 fire-and-forget。
    logger.log({
      type: "system.run.end",
      source: "system",
      payload: { reason: "reset" },
      gameSeconds: gameState.elapsedGameSeconds,
    });

    // 2) 异步 flush + rotate + run.start（与下面的 React state 重置并行）。
    //    UI 重置不能因为 logger 阻塞 — rotate 失败也吞掉，OPFS 不可用时
    //    rotate 内部已按 ADR-001 进入 memory_only no-op resolve 路径。
    void (async () => {
      try {
        await logger.flush();
        await logger.rotate("reset");
      } catch (err) {
        console.warn("[logger] rotate failed during reset:", err);
      }
      logger.log({
        type: "system.run.start",
        source: "system",
        payload: {
          game_version: __APP_VERSION__,
          schema_version: GAME_SAVE_SCHEMA_VERSION,
        },
        gameSeconds: 0,
      });
    })();

    // 3) 同步 React state 重置：与 logger 异步路径并行。
    clearGameSaves();
    const freshState = createInitialGameState();
    setGameState(freshState);
    setCurrentCall(null);
    setMapReturnTarget("control");
    setPage("control");
    setDebugOpen(false);
  }

  function regenerateMobilePairingSession() {
    setMobilePairingSession(createPhoneTerminalPairingSession());
    lastAcceptedPhoneSequenceRef.current = 0;
    setMobileSession({ status: "waiting", fallbackAfterMs: MOBILE_FALLBACK_AFTER_MS });
  }

  async function sendMobileSnapshot(messageType: "phone.message.delivered" | "phone.call.incoming" = "phone.message.delivered", extraPayload: Record<string, unknown> = {}) {
    if (!terminalRef.current) {
      return;
    }
    const message = createDualDeviceMessage({
      type: messageType,
      roomId: mobilePairingSession.roomId,
      clientId: mobilePairingSession.pcTerminalId,
      sequence: mobileSequenceRef.current,
      payload: { ...buildMobileViewModel(gameStateRef.current, gameStateRef.current.elapsedGameSeconds), fallbackAfterMs: MOBILE_FALLBACK_AFTER_MS, ...extraPayload },
    });
    mobileSequenceRef.current += 1;
    await requestDualDeviceMessage({ terminal: terminalRef.current, targetTerminalId: mobilePairingSession.phoneTerminalId, method: DUAL_DEVICE_PHONE_DELIVERY_METHOD, message }).catch(() => undefined);
  }

  function enableMobileFallback() {
    setMobileSession((session) => ({ ...session, status: "offline" }));
    void sendMobileSnapshot("phone.message.delivered", { kind: "phone_fallback_enabled", reason: "pc_manual_fallback" });
  }

  async function handlePhoneEventMessage(message: DualDeviceMessage) {
    const trusted = validatePhoneMessageEnvelope(message, mobilePairingSession, lastAcceptedPhoneSequenceRef.current);
    if (!trusted.ok) {
      return;
    }
    lastAcceptedPhoneSequenceRef.current = trusted.nextSequence;
    if (message.type === "link.heartbeat") {
      setMobileSession((session) => ({ ...session, status: "connected", lastHeartbeatAt: Date.now() }));
      void sendMobileSnapshot();
      return;
    }
    if (message.type === "phone.message.read" || message.type === "phone.call.answer") {
      setMobileSession((session) => ({ ...session, status: "connected", lastHeartbeatAt: Date.now() }));
      return;
    }
    if (message.type === "phone.choice.select") {
      const accepted = await handlePhoneChoiceSelect(message.payload, message.clientId);
      void sendIntentAck(message.payload, accepted.ok ? "accepted" : "rejected", accepted.ok ? undefined : accepted.reason);
    }
  }

  async function sendIntentAck(payload: Record<string, unknown>, status: "accepted" | "rejected", reason?: string) {
    if (typeof payload.clientRequestId !== "string") {
      return;
    }
    await sendMobileSnapshot("phone.message.delivered", { kind: "intent_ack", clientRequestId: payload.clientRequestId, status, reason });
  }

  async function handlePhoneChoiceSelect(payload: unknown, _clientId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const authoritativeState = gameStateRef.current;
    if (!validatePhoneChoiceSelectPayload(payload)) {
      appendLog("手机指令被拒绝：payload 无效。", "muted");
      return { ok: false, reason: "invalid_payload" };
    }
    if (payload.kind === "runtime_call_option") {
      const call = authoritativeState.active_calls[payload.callId];
      if (!call || !isRuntimeCallActiveForState(call, authoritativeState.elapsedGameSeconds) || !call.available_options.some((option) => option.option_id === payload.optionId)) {
        appendLog("手机事件选项被拒绝：通话已过期或选项不可用。", "muted");
        return { ok: false, reason: "call_or_option_unavailable" };
      }
      const resolvedCrew = resolvePhoneRuntimeCallCrewId(payload.crewId, call.crew_id);
      if (!resolvedCrew.ok) {
        appendLog("手机事件选项被拒绝：队员与通话不匹配。", "muted");
        return { ok: false, reason: "crew_mismatch" };
      }
      dispatchRuntimeCallOption(payload.callId, resolvedCrew.crewId, payload.optionId);
      return { ok: true };
    }
    if (payload.kind === "basic_action") {
      if (!authoritativeState.crew.some((member) => member.id === payload.crewId)) {
        appendLog("手机基础行动被拒绝：队员不存在。", "muted");
        return { ok: false, reason: "crew_unavailable" };
      }
      dispatchBasicOrStoryAction(payload.crewId as CrewId, payload.actionId);
      return { ok: true };
    }
    if (!authoritativeState.crew.some((member) => member.id === payload.crewId) || !findVisibleLocationStoryAction(authoritativeState, payload.crewId as CrewId, payload.actionId)) {
      appendLog("手机地点行动被拒绝：行动不可见或不可执行。", "muted");
      return { ok: false, reason: "story_action_unavailable" };
    }
    dispatchBasicOrStoryAction(payload.crewId as CrewId, payload.actionId);
    return { ok: true };
  }

  function startCall(crewId: CrewId) {
    const member = crew.find((item) => item.id === crewId);
    const runtimeCall = findRuntimeCallForCrew(gameState, crewId);
    if (!member || (member.unavailable && !runtimeCall)) {
      appendLog("通讯台尝试接入失败。信号像一条拒绝工作的蛇。", "muted");
      return;
    }

    const type = runtimeCall && isUrgentRuntimeCallState(runtimeCall) ? "emergency" : "normal";
    setCurrentCall({ crewId, type, settled: false, runtimeCallId: runtimeCall?.id });
    setGameState((state) => ({
      ...state,
      crew: state.crew.map((item) => (item.id === crewId ? { ...item, hasIncoming: false } : item)),
      logs: appendLogEntry(
        state.logs,
        runtimeCall ? `${member.name} 的事件通话已接通。` : `${member.name} 的普通通话已接通。`,
        "neutral",
        state.elapsedGameSeconds,
      ),
    }));
    setPage("call");
  }

  function endCall() {
    if (currentCall && !currentCall.settled) {
      appendLog("通话尚未下达指令，通讯台将其标记为待决策。", "accent");
    }

    setPage("station");
  }

  function handleDecision(actionId: string) {
    if (!currentCall) {
      return;
    }

    if (currentCall.runtimeCallId) {
      if (currentCall.settled) {
        return;
      }
      dispatchRuntimeCallOption(currentCall.runtimeCallId!, currentCall.crewId ?? null, actionId);
      setCurrentCall((call) => (call ? { ...call, settled: true, result: "事件选项已提交。" } : call));
      return;
    }

    if (actionId === "universal:move") {
      setCurrentCall((call) =>
        call
          ? {
              ...call,
              selectingMoveTarget: true,
              selectedTargetTileId: undefined,
              result: "请在地图中标记候选目的地。移动指令仍需回到通话中确认。",
            }
          : call,
      );
      setMapReturnTarget("call");
      setPage("map");
      appendLog("通话进入目的地选择模式。地图只记录候选坐标，不直接下达移动指令。", "accent");
      return;
    }

    if (currentCall.settled) {
      return;
    }

    dispatchBasicOrStoryAction(currentCall.crewId, actionId, true);
  }

  function dispatchRuntimeCallOption(callId: string, crewId: string | null, optionId: string) {
    const authoritativeState = gameStateRef.current;
    logger.log({
      type: "player.call.choice",
      source: "player_command",
      payload: {
        call_id: callId,
        choice_key: optionId,
        crew_id: crewId,
      },
      gameSeconds: authoritativeState.elapsedGameSeconds,
    });
    setGameState((state) =>
      mergeEventRuntimeState(
        state,
        selectCallOption({
          state: toEventEngineState(state),
          index: eventContentIndex,
          call_id: callId,
          option_id: optionId,
          occurred_at: state.elapsedGameSeconds,
        }).state,
      ),
    );
  }

  function dispatchBasicOrStoryAction(crewId: CrewId, actionId: string, updateCurrentCall = false) {
    const authoritativeState = gameStateRef.current;
    if (actionId === "universal:survey") {
      logger.log({
        type: "player.action.dispatch",
        source: "player_command",
        payload: {
          crew_id: crewId,
          action_id: "universal:survey",
          action_kind: "survey",
        },
        gameSeconds: authoritativeState.elapsedGameSeconds,
      });
      setGameState((state) => createSurveyCrewAction(state, crewId, state.elapsedGameSeconds));
      if (updateCurrentCall) {
        setCurrentCall((call) =>
          call
            ? {
                ...call,
                settled: true,
                result: `调查指令已提交，预计 ${formatDuration(15)} 后回传结果。`,
              }
            : call,
        );
      }
      return;
    }

    if (currentCall?.settled) {
      return;
    }

    if (actionId === "universal:standby" || actionId === "universal:stop") {
      logger.log({
        type: "player.action.dispatch",
        source: "player_command",
        payload: {
          crew_id: crewId,
          action_id: actionId,
          action_kind: actionId === "universal:standby" ? "standby" : "stop",
        },
        gameSeconds: authoritativeState.elapsedGameSeconds,
      });
      setGameState((state) => {
        const nextState = actionId === "universal:standby" ? createStandbyCrewAction(state, crewId, state.elapsedGameSeconds) : createStopCrewAction(state, crewId, state.elapsedGameSeconds);
        return settleGameTime(nextState);
      });
      if (updateCurrentCall) {
        setCurrentCall((call) => (call ? { ...call, settled: true, result: "行动指令已提交。" } : call));
      }
      return;
    }

    const localTimedResult = dispatchTimedLocalAction(authoritativeState, crewId, actionId);
    if (localTimedResult.matched) {
      if (localTimedResult.accepted) {
        logger.log({
          type: "player.action.dispatch",
          source: "player_command",
          payload: {
            crew_id: crewId,
            action_id: actionId,
            action_kind: "repair",
          },
          gameSeconds: authoritativeState.elapsedGameSeconds,
        });
      }
      setGameState(localTimedResult.state);
      if (updateCurrentCall) {
        setCurrentCall((call) => (call ? { ...call, settled: localTimedResult.accepted, result: localTimedResult.reason } : call));
      }
      return;
    }

    const selectedStoryAction = findVisibleLocationStoryAction(authoritativeState, crewId, actionId);
    if (selectedStoryAction) {
      const applied = triggerLocationStoryAction(authoritativeState, selectedStoryAction);
      setGameState(applied.state);
      if (updateCurrentCall) {
        setCurrentCall((call) =>
          call
            ? {
                ...call,
                settled: applied.createdEvent ? false : true,
                runtimeCallId: applied.runtimeCallId ?? call.runtimeCallId,
                result: applied.createdEvent ? undefined : "当前地点没有可触发的地点事件。",
              }
            : call,
        );
      }
      return;
    }

    appendLog(`通话选项未提交：${actionId} 不是可执行的基础行动或事件选项。`, "muted");
  }

  function selectMoveTarget(tileId: string) {
    const targetLabel = getMoveTargetSelectionLabel(gameState.map, tileId);
    setCurrentCall((call) =>
      call?.selectingMoveTarget
        ? {
            ...call,
            selectedTargetTileId: tileId,
            result: `已标记候选目的地 ${targetLabel}。返回通话后确认是否下达移动指令。`,
          }
        : call,
    );
    setPage("call");
  }

  function clearMoveTarget() {
    setCurrentCall((call) =>
      call
        ? {
            ...call,
            selectedTargetTileId: undefined,
            result: "候选目的地已清除。地图仍然愿意假装自己是可靠的。",
          }
        : call,
    );
  }

  function confirmMove() {
    if (!currentCall?.selectedTargetTileId) {
      appendLog("移动确认失败：没有候选目的地。", "muted");
      return;
    }

    logger.log({
      type: "player.move.target",
      source: "player_command",
      payload: {
        crew_id: currentCall.crewId,
        tile_id: currentCall.selectedTargetTileId,
      },
      gameSeconds: gameState.elapsedGameSeconds,
    });

    setGameState((state) => {
      const member = state.crew.find((item) => item.id === currentCall.crewId);
      if (!member) {
        return state;
      }

      const blockingAction = selectActiveCrewActionForCrew(state.crew_actions, member.id);
      if (blockingAction) {
        return {
          ...state,
          logs: appendLogEntry(state.logs, "移动确认失败：队员已有进行中的主要行动。", "danger", state.elapsedGameSeconds),
        };
      }

      const targetTileId = currentCall.selectedTargetTileId!;
      if (!canMoveToTile(defaultMapConfig, state.map, targetTileId)) {
        return {
          ...state,
          logs: appendLogEntry(state.logs, "移动确认失败：目标不在地图范围内。", "danger", state.elapsedGameSeconds),
        };
      }

      const preview = createMovePreview(member, targetTileId, state.tiles);
      if (!preview.canMove) {
        return {
          ...state,
          logs: appendLogEntry(state.logs, `移动确认失败：${preview.reason ?? "目标不可达。"}`, "danger", state.elapsedGameSeconds),
        };
      }

      const targetTile = state.tiles.find((tile) => tile.id === preview.targetTileId);
      const startedMove = startCrewMove(member, preview, state.tiles, state.elapsedGameSeconds);
      const updatedCrew = state.crew.map((item) =>
        item.id === currentCall.crewId ? startedMove.member : item,
      );

      const nextMap = syncMapCrew(state.map, updatedCrew);
      return {
        ...state,
        crew: updatedCrew,
        crew_actions: {
          ...state.crew_actions,
          [startedMove.action.id]: startedMove.action,
        },
        map: nextMap,
        tiles: syncTileCrew(createMapTilesFromConfig(nextMap, state.tiles), updatedCrew),
        logs: appendLogEntry(
          state.logs,
          `${member.name} 开始前往 ${targetTile?.coord ?? preview.targetTileId}，预计 ${formatDuration(preview.totalDurationSeconds)}。`,
          "accent",
          state.elapsedGameSeconds,
        ),
      };
    });

    setCurrentCall((call) =>
      call
        ? {
            ...call,
            settled: true,
            selectingMoveTarget: false,
            result: "移动请求已确认。队员开始按路线逐格推进，抵达后会原地待命。",
          }
        : call,
    );
  }

  if (page === "ending") {
    return (
      <EndingPage
        completedAtLabel={completedAtLabel}
        gameTimeLabel={gameTimeLabel}
        onResetGame={resetGame}
        onReturnControl={() => setPage("control")}
      />
    );
  }

  if (page === "station") {
    return (
      <TaskPage
        view={questSidebarView}
        statusFilter={questStatusFilter}
        categoryFilter={questCategoryFilter}
        navigationMessage={
          questNavigationHint?.type === "crew"
            ? `任务导航：已定位 ${crew.find((member) => member.id === questNavigationHint.crewId)?.name ?? questNavigationHint.crewId}，需手动点击通话。`
            : questNavigationHint?.type === "unavailable"
              ? `任务导航目标不可用：${questNavigationHint.label}`
              : undefined
        }
        crew={crew}
        crewActions={gameState.crew_actions}
        activeCalls={gameState.active_calls}
        elapsedGameSeconds={elapsedGameSeconds}
        tiles={tiles}
        gameTimeLabel={gameTimeLabel}
        logs={logs}
        onStatusFilterChange={setQuestStatusFilter}
        onCategoryFilterChange={setQuestCategoryFilter}
        onSelectedQuestIdChange={setSelectedQuestId}
        onNavigate={handleQuestSidebarNavigate}
        onOpenControl={openControlOverview}
        onOpenMap={() => openMap("control")}
        onStartCall={startCall}
        onShowCrewStatus={openCrewStatusPage}
        onShowCrewInventory={openCrewInventoryPage}
      />
    );
  }

  if (page === "call") {
    return (
      <CallPage
        call={currentCall}
        crew={crew}
        tiles={tiles}
        activeCalls={gameState.active_calls}
        elapsedGameSeconds={elapsedGameSeconds}
        gameTimeLabel={gameTimeLabel}
        gameState={gameState}
        logs={logs}
        onDecision={handleDecision}
        onConfirmMove={confirmMove}
        onClearMoveTarget={clearMoveTarget}
        onOpenMap={() => openMap("call")}
        onOpenControl={openControlOverview}
        onOpenTask={openStation}
        onStartCall={startCall}
        onShowCrewStatus={openCrewStatusPage}
        onShowCrewInventory={openCrewInventoryPage}
      />
    );
  }

  if (page === "map") {
    return (
      <MapPage
        tiles={tiles}
        crew={crew}
        crewActions={gameState.crew_actions}
        activeCalls={gameState.active_calls}
        elapsedGameSeconds={elapsedGameSeconds}
        gameTimeLabel={gameTimeLabel}
        returnTarget={mapReturnTarget}
        moveSelectionCrewId={currentCall?.selectingMoveTarget ? currentCall.crewId : null}
        initialSelectedTileId={questNavigationHint?.type === "tile" ? questNavigationHint.tileId : undefined}
        onOpenControl={openControlOverview}
        onOpenTask={openStation}
        onReturnFromMap={returnFromMap}
        onSelectMoveTarget={selectMoveTarget}
        onStartCall={startCall}
        onShowCrewStatus={openCrewStatusPage}
        onShowCrewInventory={openCrewInventoryPage}
        logs={logs}
      />
    );
  }

  if (page === "crew") {
    return (
      <CrewConsolePage
        crew={crew}
        crewActions={gameState.crew_actions}
        activeCalls={gameState.active_calls}
        elapsedGameSeconds={elapsedGameSeconds}
        tiles={tiles}
        eventLogs={gameState.event_logs}
        logs={logs}
        gameTimeLabel={gameTimeLabel}
        selectedCrewId={crewConsoleView.crewId}
        mode={crewConsoleView.mode}
        onOpenControl={openControlOverview}
        onOpenTask={openStation}
        onOpenMap={() => openMap("control")}
        onStartCall={startCall}
        onShowCrewStatus={openCrewStatusPage}
        onShowCrewInventory={openCrewInventoryPage}
      />
    );
  }

  return (
    <>
      <ControlCenter
        crew={crew}
        logs={logs}
        eventLogs={gameState.event_logs}
        objectives={gameState.objectives}
        resources={resources}
        gameTimeLabel={gameTimeLabel}
        runtimeCallCrewIds={activeRuntimeCallCrewIds}
        onOpenStation={openStation}
        onOpenMap={() => openMap("control")}
        onStartCall={startCall}
        map={map}
        mobileStatus={mobileStatusCard}
        onShowCrewStatus={openCrewStatusPage}
        onShowCrewInventory={openCrewInventoryPage}
      />
      {debugOpen ? (
        <DebugToolbox
          timeMultiplier={timeMultiplier}
          onSetTimeMultiplier={setTimeMultiplier}
          onResetGame={resetGame}
          onClose={() => setDebugOpen(false)}
        />
      ) : null}
    </>
  );
}

export default App;

function createInitialGameState(): GameState {
  const saved = loadGameSave<SavedGameState>(isCompatibleGameSaveState);
  const now = new Date().toISOString();
  const emptyEventState = createEmptyEventRuntimeState();

  if (saved && isSavedBaselineCompatible(saved) && typeof saved.elapsedGameSeconds === "number" && Number.isFinite(saved.elapsedGameSeconds) && saved.crew && saved.map && saved.logs && saved.resources) {
    const normalizedCrew = saved.crew.map((member) => {
      const initialMember = initialCrew.find((item) => item.id === member.id) ?? member;
      const normalizedMember = normalizeCrewMember(member as CrewMember, initialMember as CrewMember);

      return {
        ...normalizedMember,
        inventory: Array.isArray(member.inventory) ? member.inventory : (initialMember as CrewMember).inventory,
      };
    });
    const savedCrewIds = new Set(normalizedCrew.map((member) => member.id));
    const crewWithNewDefaults = [...normalizedCrew, ...initialCrew.filter((member) => !savedCrewIds.has(member.id))];
    const map = normalizeSavedMap(saved.map);
    const syncedMap = syncMapCrew(map, crewWithNewDefaults);
    return {
      ...saved,
      schema_version: GAME_SAVE_SCHEMA_VERSION,
      created_at_real_time: saved.created_at_real_time ?? now,
      updated_at_real_time: now,
      crew: crewWithNewDefaults,
      baseInventory: Array.isArray(saved.baseInventory)
        ? saved.baseInventory
        : createBaseInventoryFromResources(saved.resources),
      map: syncedMap,
      tiles: syncTileCrew(createMapTilesFromConfig(syncedMap, saved.tiles), crewWithNewDefaults),
      eventHistory: saved.eventHistory ?? {},
      active_events: saved.active_events ?? emptyEventState.active_events,
      active_calls: saved.active_calls ?? emptyEventState.active_calls,
      objectives: saved.objectives ?? emptyEventState.objectives,
      event_logs: saved.event_logs ?? emptyEventState.event_logs,
      world_history: saved.world_history ?? emptyEventState.world_history,
      world_flags: saved.world_flags ?? emptyEventState.world_flags,
      crew_actions: saved.crew_actions ?? emptyEventState.crew_actions,
      inventories: saved.inventories ?? emptyEventState.inventories,
      rng_state: saved.rng_state ?? emptyEventState.rng_state,
      quest_state: normalizeQuestState(saved.quest_state, questDefinitions, saved.elapsedGameSeconds),
    } as GameState;
  }

  const map = syncMapCrew(createInitialMapState(), initialCrew);
  const state = {
    schema_version: GAME_SAVE_SCHEMA_VERSION,
    created_at_real_time: now,
    updated_at_real_time: now,
    elapsedGameSeconds: 0,
    crew: initialCrew,
    baseInventory: createBaseInventoryFromResources(initialResources),
    map,
    tiles: createMapTilesFromConfig(map),
    logs: initialLogs,
    resources: initialResources,
    eventHistory: {},
    quest_state: createInitialQuestState(questDefinitions, 0),
    ...emptyEventState,
  };

  return bootstrapGameStartEvent({ ...state, tiles: syncTileCrew(state.tiles, state.crew) });
}

function bootstrapGameStartEvent(state: GameState): GameState {
  const result = processTrigger({
    state: toEventEngineState(state),
    index: eventContentIndex,
    context: {
      trigger_type: "game_start",
      occurred_at: 0,
      source: "time_system",
      crew_id: "mike",
      tile_id: "4-4",
      payload: { phase: "new_game" },
    },
  });

  if (result.errors.length > 0 || (result.candidate_report?.created_event_ids.length ?? 0) === 0) {
    return state;
  }

  return mergeEventRuntimeState(state, result.state);
}

function isSavedBaselineCompatible(saved: SavedGameState) {
  if (!saved.map || typeof saved.map !== "object") {
    return false;
  }

  return saved.map.configId === defaultMapConfig.id && saved.map.configVersion === defaultMapConfig.version;
}

function getMoveTargetSelectionLabel(_map: GameMapState, tileId: string) {
  return getTileLocationLabel(defaultMapConfig, tileId);
}

function createStandbyCrewAction(state: GameState, crewId: CrewId, occurredAt: number): GameState {
  const member = state.crew.find((item) => item.id === crewId);
  if (!member) {
    return state;
  }

  const crewActions = state.crew_actions;
  if (findActiveCrewActionForMember(crewActions, member)) {
    return {
      ...state,
      logs: appendLogEntry(state.logs, `${member.name} 正在执行行动，不能切换为原地待命。`, "muted", occurredAt),
      crew_actions: crewActions,
    };
  }

  const actionId = `standby:${crewId}:${occurredAt}`;
  const action = createBasicCrewAction({
    id: actionId,
    crewId,
    type: "standby",
    source: "player_command",
    tileId: member.currentTile,
    occurredAt,
    durationSeconds: 0,
  });

  return {
    ...state,
    crew_actions: {
      ...crewActions,
      [actionId]: action,
    },
  };
}

function createStopCrewAction(state: GameState, crewId: CrewId, occurredAt: number): GameState {
  const member = state.crew.find((item) => item.id === crewId);
  if (!member) {
    return state;
  }

  const materializedActions = state.crew_actions;
  const runtimeAction = findActiveCrewActionForMember(materializedActions, member);
  if (!runtimeAction) {
    return {
      ...state,
      logs: appendLogEntry(state.logs, `${member.name} 没有可停止的当前行动。`, "muted", occurredAt),
      crew_actions: materializedActions,
    };
  }

  if (!runtimeAction.can_interrupt) {
    return {
      ...state,
      logs: appendLogEntry(state.logs, `${member.name} 的当前行动不能被中断。`, "danger", occurredAt),
      crew_actions: materializedActions,
    };
  }

  const stopDuration = runtimeAction.interrupt_duration_seconds || 10;
  const stopActionId = `stop:${crewId}:${runtimeAction.id}:${occurredAt}`;
  const stopAction = createBasicCrewAction({
    id: stopActionId,
    crewId,
    type: "stop",
    source: "player_command",
    tileId: member.currentTile,
    occurredAt,
    durationSeconds: stopDuration,
  });
  const interruptedAction = interruptCrewActionState(runtimeAction, occurredAt);
  const stoppingMember = {
    ...member,
    status: "停止当前行动中。",
    statusTone: "danger" as Tone,
  };

  return {
    ...state,
    crew: state.crew.map((item) => (item.id === crewId ? stoppingMember : item)),
    logs: appendLogEntry(state.logs, `${member.name} 开始停止当前行动。`, "danger", occurredAt),
    crew_actions: {
      ...materializedActions,
      [runtimeAction.id]: interruptedAction,
      [stopActionId]: stopAction,
    },
  };
}

function createBasicCrewAction(args: {
  id: Id;
  crewId: Id;
  type: "standby" | "stop" | "survey";
  source: CrewActionState["source"];
  tileId: Id;
  occurredAt: number;
  durationSeconds: number;
  actionParams?: Record<string, unknown>;
}): CrewActionState {
  return {
    id: args.id,
    crew_id: args.crewId,
    type: args.type,
    status: "active",
    source: args.source,
    parent_event_id: null,
    objective_id: null,
    action_request_id: null,
    from_tile_id: args.tileId,
    to_tile_id: null,
    target_tile_id: args.tileId,
    path_tile_ids: [],
    started_at: args.occurredAt,
    ends_at: args.occurredAt + args.durationSeconds,
    progress_seconds: 0,
    duration_seconds: args.durationSeconds,
    action_params: args.actionParams ?? {},
    can_interrupt: true,
    interrupt_duration_seconds: 10,
  };
}

function createSurveyCrewAction(state: GameState, crewId: CrewId, occurredAt: number): GameState {
  const member = state.crew.find((item) => item.id === crewId);
  if (!member) {
    return state;
  }

  if (findActiveCrewActionForMember(state.crew_actions, member)) {
    return {
      ...state,
      logs: appendLogEntry(state.logs, `${member.name} 正在执行行动，不能开始调查。`, "muted", occurredAt),
    };
  }

  const actionId = `survey:${crewId}:${member.currentTile}:${occurredAt}`;
  const action = createBasicCrewAction({
    id: actionId,
    crewId,
    type: "survey",
    source: "player_command",
    tileId: member.currentTile,
    occurredAt,
    durationSeconds: 15,
    actionParams: { surveyLevel: "standard" },
  });

  return {
    ...state,
    crew: state.crew.map((item) =>
      item.id === crewId
        ? {
            ...item,
            status: "正在调查当前区域。",
            statusTone: "accent",
            activeAction: {
              id: action.id,
              actionType: "survey",
              status: "inProgress",
              startTime: occurredAt,
              durationSeconds: action.duration_seconds,
              finishTime: action.ends_at ?? occurredAt + action.duration_seconds,
              targetTile: member.currentTile,
              params: action.action_params,
            },
          }
        : item,
    ),
    logs: appendLogEntry(state.logs, `${member.name} 开始调查当前区域。`, "accent", occurredAt),
    crew_actions: {
      ...state.crew_actions,
      [actionId]: action,
    },
  };
}

function findActiveCrewActionForMember(crewActions: Record<Id, CrewActionState>, member: CrewMember): CrewActionState | undefined {
  return Object.values(crewActions)
    .filter((action) => action.crew_id === member.id && action.status === "active")
    .sort((left, right) => (right.started_at ?? 0) - (left.started_at ?? 0) || right.id.localeCompare(left.id))[0];
}

function interruptCrewActionState(action: CrewActionState, occurredAt: number): CrewActionState {
  const startedAt = action.started_at ?? occurredAt;
  return {
    ...action,
    status: "interrupted",
    ends_at: occurredAt,
    progress_seconds: Math.min(action.duration_seconds, Math.max(0, occurredAt - startedAt)),
  };
}

// 终态集合：行动从非终态切到终态时（含从 prev 不存在直接出现为终态），
// 由 diffActionsAndLog 写一条 action.complete 日志（ADR-005 / §0.2 hook 点 D）。
const TERMINAL_ACTION_STATUSES = new Set<CrewActionState["status"]>([
  "completed",
  "failed",
  "interrupted",
  "cancelled",
]);

/**
 * 比对 settleGameTime 调用前后的 crew_actions：对每一个新进入终态的 action
 * 写一条 action.complete（source = "time_loop"）。
 *
 * 触发条件：
 *   - prev 不存在该 id 且 next 已是终态 → 写
 *   - prev 存在且非终态 + next 终态 → 写
 *   - prev 已是终态 → 不写（避免重复）
 *   - next 非终态 → 不写
 *
 * 注意：React 19 严格/开发模式下 setState callback 可能被调两次，导致同帧
 * 重复写入。MVP 接受该风险（design §13.R3）；生产模式无影响。
 */
function diffActionsAndLog(
  prev: Record<string, CrewActionState>,
  next: Record<string, CrewActionState>,
  gameSeconds: number,
): void {
  for (const [id, action] of Object.entries(next)) {
    const before = prev[id];
    const wasTerminalBefore = before ? TERMINAL_ACTION_STATUSES.has(before.status) : false;
    const isTerminalNow = TERMINAL_ACTION_STATUSES.has(action.status);
    if (wasTerminalBefore || !isTerminalNow) continue;
    logger.log({
      type: "action.complete",
      source: "time_loop",
      payload: {
        crew_id: action.crew_id,
        action_id: id,
        action_kind: action.type,
        status: action.status as "completed" | "failed" | "interrupted" | "cancelled",
      },
      gameSeconds,
    });
  }
}

function settleGameTime(state: GameState): GameState {
  let changed = false;
  let resources = state.resources;
  let map = state.map;
  let tiles = state.tiles;
  let logs = state.logs;
  let baseInventory = state.baseInventory;
  let crewActions = state.crew_actions;
  const triggerContexts: TriggerContext[] = [];
  const dueActionsByCrew = collectDueCrewActions(crewActions, state.elapsedGameSeconds);

  const crew = state.crew.map((member) => {
    let nextMember = member;
    const dueAction = dueActionsByCrew.get(member.id);
    const activeMoveAction = selectActiveCrewActionForCrew(crewActions, member.id, "move");

    if (activeMoveAction) {
      const settled = advanceCrewMoveAction(member, activeMoveAction, tiles, logs, state.elapsedGameSeconds);
      nextMember = settled.member;
      logs = settled.logs;
      crewActions = {
        ...crewActions,
        [activeMoveAction.id]: settled.action,
      };
      changed = changed || settled.changed || settled.action !== activeMoveAction;

      if (settled.changed && nextMember.currentTile !== member.currentTile) {
        map = discoverMapTile(map, nextMember.currentTile);
        tiles = syncTileCrew(createMapTilesFromConfig(map, tiles), state.crew.map((crewMember) => (crewMember.id === nextMember.id ? nextMember : crewMember)));
      }

      if (settled.arrived) {
        nextMember = appendArrivalDiary(nextMember, state.elapsedGameSeconds);
        triggerContexts.push({
          trigger_type: "arrival",
          occurred_at: state.elapsedGameSeconds,
          source: "crew_action",
          crew_id: nextMember.id,
          tile_id: nextMember.currentTile,
          action_id: activeMoveAction.id,
          payload: {
            action_type: "move",
            from_tile_id: activeMoveAction.from_tile_id ?? null,
            target_tile_id: activeMoveAction.target_tile_id ?? activeMoveAction.to_tile_id ?? null,
          },
        });
      }
    } else if (dueAction) {
      const settled = settleCrewActionState(dueAction, member, state.elapsedGameSeconds, resources, baseInventory, tiles, logs, map);
      nextMember = settled.member;
      resources = settled.resources;
      tiles = settled.tiles;
      logs = settled.logs;
      map = settled.map;
      baseInventory = settled.baseInventory ?? baseInventory;
      crewActions = {
        ...crewActions,
        [dueAction.id]: completeCrewActionState(dueAction, state.elapsedGameSeconds),
      };
      triggerContexts.push(...settled.triggerContexts);
      changed = true;
    }

    return nextMember;
  });

  const syncedMap = syncMapCrew(map, crew);
  let nextState = changed ? { ...state, crew, resources, baseInventory, map: syncedMap, tiles: syncTileCrew(tiles, crew), logs, crew_actions: crewActions } : state;
  nextState = processObjectiveCompletions(nextState, triggerContexts);

  for (const context of triggerContexts) {
    nextState = processAppEventTrigger(nextState, context);
  }

  return processAppEventWakeups(nextState);
}

type RuntimeSettleableCrewAction = CrewActionState & { type: "survey" | "gather" | "build" | "extract" | "repair" };
export interface TimedLocalDispatchResult {
  matched: boolean;
  accepted: boolean;
  reason: string;
  state: GameState;
}

function collectDueCrewActions(crewActions: Record<Id, CrewActionState>, elapsedGameSeconds: number): Map<Id, CrewActionState> {
  const dueActions = Object.values(crewActions)
    .filter((action) => action.status === "active" && typeof action.ends_at === "number" && action.ends_at <= elapsedGameSeconds)
    .sort((left, right) => (left.ends_at ?? 0) - (right.ends_at ?? 0) || left.id.localeCompare(right.id));
  const byCrew = new Map<Id, CrewActionState>();

  for (const action of dueActions) {
    if (!byCrew.has(action.crew_id)) {
      byCrew.set(action.crew_id, action);
    }
  }

  return byCrew;
}

function selectActiveCrewActionForCrew(crewActions: Record<Id, CrewActionState>, crewId: Id, actionType?: CrewActionState["type"]): CrewActionState | undefined {
  return Object.values(crewActions)
    .filter((action) => action.crew_id === crewId && action.status === "active" && (!actionType || action.type === actionType))
    .sort((left, right) => (right.started_at ?? 0) - (left.started_at ?? 0) || right.id.localeCompare(left.id))[0];
}

function completeCrewActionState(action: CrewActionState, elapsedGameSeconds: number): CrewActionState {
  return {
    ...action,
    status: "completed",
    ends_at: action.ends_at ?? elapsedGameSeconds,
    progress_seconds: action.duration_seconds,
  };
}

function settleCrewActionState(
  action: CrewActionState,
  member: CrewMember,
  elapsedGameSeconds: number,
  resources: ResourceSummary,
  baseInventory: GameState["baseInventory"],
  tiles: MapTile[],
  logs: SystemLog[],
  map: GameMapState,
): ActionSettlementPatch {
  if (action.type === "standby") {
    return settleStandbyCrewActionState(action, member, elapsedGameSeconds, resources, baseInventory, tiles, logs, map);
  }

  if (action.type === "stop") {
    return settleStopCrewActionState(action, member, elapsedGameSeconds, resources, baseInventory, tiles, logs, map);
  }

  if (canSettleWithRuntimeHandler(action)) {
    const settled = settleAction({
      member,
      action,
      occurredAt: elapsedGameSeconds,
      resources,
      baseInventory,
      tiles,
      map,
      logs,
    });

    return {
      ...settled,
      triggerContexts: settled.triggerContexts.length > 0 ? settled.triggerContexts : [createCrewActionCompleteTrigger(action, member, elapsedGameSeconds)],
    };
  }

  const nextMember = {
    ...member,
    status: action.type === "event_waiting" ? "待命中。" : "行动完成，待命中。",
    statusTone: (action.type === "event_waiting" ? "muted" : "neutral") as Tone,
    unavailable: action.type === "event_waiting" ? false : member.unavailable,
    canCommunicate: action.type === "event_waiting" ? true : member.canCommunicate,
  };

  return {
    member: nextMember,
    resources,
    baseInventory,
    tiles,
    map,
    logs: appendLogEntry(logs, `${member.name} 的行动已完成。`, "neutral", elapsedGameSeconds),
    triggerContexts: [createCrewActionCompleteTrigger(action, member, elapsedGameSeconds)],
  };
}

function settleStandbyCrewActionState(
  action: CrewActionState,
  member: CrewMember,
  elapsedGameSeconds: number,
  resources: ResourceSummary,
  baseInventory: GameState["baseInventory"],
  tiles: MapTile[],
  logs: SystemLog[],
  map: GameMapState,
): ActionSettlementPatch {
  return {
    member: {
      ...member,
      status: "待命中。",
      statusTone: "muted" as Tone,
      unavailable: false,
      canCommunicate: true,
    },
    resources,
    baseInventory,
    tiles,
    map,
    logs: appendLogEntry(logs, `${member.name} 原地待命。`, "muted", elapsedGameSeconds),
    triggerContexts: [
      {
        trigger_type: "idle_time",
        occurred_at: elapsedGameSeconds,
        source: "crew_action",
        crew_id: member.id,
        tile_id: member.currentTile,
        action_id: action.id,
        payload: {
          action_type: "standby",
        },
      },
    ],
  };
}

function settleStopCrewActionState(
  action: CrewActionState,
  member: CrewMember,
  elapsedGameSeconds: number,
  resources: ResourceSummary,
  baseInventory: GameState["baseInventory"],
  tiles: MapTile[],
  logs: SystemLog[],
  map: GameMapState,
): ActionSettlementPatch {
  return {
    member: {
      ...member,
      status: "行动已停止，待命中。",
      statusTone: "muted" as Tone,
      unavailable: false,
      canCommunicate: true,
    },
    resources,
    baseInventory,
    tiles,
    map,
    logs: appendLogEntry(logs, `${member.name} 停止当前行动。`, "danger", elapsedGameSeconds),
    triggerContexts: [],
  };
}

function canSettleWithRuntimeHandler(
  action: CrewActionState,
): action is RuntimeSettleableCrewAction {
  return action.type === "survey" || action.type === "gather" || action.type === "build" || action.type === "extract" || action.type === "repair";
}

function createCrewActionCompleteTrigger(action: CrewActionState, member: CrewMember, elapsedGameSeconds: number): TriggerContext {
  return {
    trigger_type: "action_complete",
    occurred_at: elapsedGameSeconds,
    source: "crew_action",
    crew_id: action.crew_id,
    tile_id: action.target_tile_id ?? action.to_tile_id ?? member.currentTile,
    action_id: action.id,
    event_id: action.objective_id ? null : action.parent_event_id ?? null,
    node_id: action.action_request_id ?? null,
    objective_id: action.objective_id ?? null,
    payload: {
      action_type: action.type,
      object_id: stringParam(action.action_params.object_id) ?? null,
      tags: readStringArray(action.action_params.tags),
    },
  };
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function findCandidateObject(tileId: string, verb: string, map: GameMapState | undefined): MapObjectDefinition | undefined {
  const configTile = defaultMapTileById.get(tileId);
  if (!configTile) {
    return undefined;
  }
  for (const objectId of configTile.objectIds) {
    const definition = mapObjectDefinitionById.get(objectId);
    if (!definition) {
      continue;
    }
    if (!isObjectVisible(tileId, definition, map)) {
      continue;
    }
    if (definition.actions.some((action) => action.id === `${objectId}:${verb}`)) {
      return definition;
    }
  }
  return undefined;
}

function isObjectVisible(tileId: string, definition: MapObjectDefinition, map: GameMapState | undefined) {
  if (!map) {
    return true;
  }

  const runtimeTile = map.tilesById[tileId];
  return (
    definition.visibility === "onDiscovered" ||
    runtimeTile?.revealedObjectIds?.includes(definition.id) ||
    (definition.visibility === "onInvestigated" && runtimeTile?.investigated)
  );
}

/**
 * 对前/后两份 event_logs 做 id 集合差集，对每条新增 EventLog 写一条
 * `event.resolved`。R2（design §13）：用 EventLog.id 集合做差集，绝不能用
 * 数组长度判断。
 */
function diffEventLogsAndLog(
  prev: GameState["event_logs"],
  next: GameState["event_logs"],
  gameSeconds: number,
): void {
  const prevIds = new Set(prev.map((log) => log.id));
  for (const log of next) {
    if (prevIds.has(log.id)) continue;
    logger.log({
      type: "event.resolved",
      source: "event_engine",
      payload: {
        event_log_id: log.id,
        event_id: log.event_id,
        event_definition_id: log.event_definition_id,
        result_key: log.result_key ?? null,
        summary: log.summary ?? null,
        importance: log.importance,
      },
      gameSeconds,
    });
  }
}

function processAppEventTrigger(state: GameState, context: TriggerContext): GameState {
  // 1) 写 event.trigger（在调原 processTrigger 之前；ADR-004 / design §9）
  logger.log({
    type: "event.trigger",
    source: "event_engine",
    payload: { trigger: context },
    gameSeconds: state.elapsedGameSeconds,
  });

  // 2) 调原引擎
  const result = processTrigger({
    state: toEventEngineState(state),
    index: eventContentIndex,
    context,
  });

  // 3) 写 event.node.enter（每个 transition 一条；ADR-004）。
  // result.graph_result 与 result.graph_results 不一定同时存在。
  if (result.graph_result) {
    const eventId = result.event?.id ?? result.graph_result.event.id;
    for (const t of result.graph_result.transitions) {
      logger.log({
        type: "event.node.enter",
        source: "event_engine",
        payload: { event_id: eventId, from_node_id: t.from_node_id, to_node_id: t.to_node_id },
        gameSeconds: state.elapsedGameSeconds,
      });
    }
  }
  if (result.graph_results) {
    for (const r of result.graph_results) {
      for (const t of r.transitions) {
        logger.log({
          type: "event.node.enter",
          source: "event_engine",
          payload: { event_id: r.event.id, from_node_id: t.from_node_id, to_node_id: t.to_node_id },
          gameSeconds: state.elapsedGameSeconds,
        });
      }
    }
  }

  // 4) 合并 state，做 event_logs diff，写 event.resolved。
  const merged = mergeEventRuntimeState(state, result.state);
  diffEventLogsAndLog(state.event_logs, merged.event_logs, state.elapsedGameSeconds);

  return merged;
}

function processAppEventWakeups(state: GameState): GameState {
  // wakeups 不写 event.trigger（trigger 概念是显式 dispatch；wakeups 是定时
  // 唤醒）。这是 design §9 的语义约定。
  const result = processEventWakeups({
    state: toEventEngineState(state),
    index: eventContentIndex,
    elapsed_game_seconds: state.elapsedGameSeconds,
  });

  // 写 event.node.enter（来自所有 graph_results）
  if (result.graph_results) {
    for (const r of result.graph_results) {
      for (const t of r.transitions) {
        logger.log({
          type: "event.node.enter",
          source: "event_engine",
          payload: { event_id: r.event.id, from_node_id: t.from_node_id, to_node_id: t.to_node_id },
          gameSeconds: state.elapsedGameSeconds,
        });
      }
    }
  }

  const merged = mergeEventRuntimeState(state, result.state);
  diffEventLogsAndLog(state.event_logs, merged.event_logs, state.elapsedGameSeconds);

  return merged;
}

interface LocationStoryActionSelection {
  member: CrewMember;
  object: MapObjectDefinition;
  action: ActionDef;
}

function findVisibleLocationStoryAction(
  state: GameState,
  crewId: CrewId,
  actionId: string,
): LocationStoryActionSelection | undefined {
  const selection = findLocationStoryActionSelection(state, crewId, actionId);
  if (!selection) {
    return undefined;
  }

  const visibleEnabled = buildCallView({ member: selection.member, tile: selection.tile, gameState: state }).groups.some((group) =>
    group.actions.some((action) => action.id === actionId && !action.disabled),
  );
  if (!visibleEnabled) {
    return undefined;
  }

  return selection;
}

function findLocationStoryActionSelection(
  state: GameState,
  crewId: CrewId,
  actionId: string,
): (LocationStoryActionSelection & { tile: MapTile }) | undefined {
  const member = state.crew.find((item) => item.id === crewId);
  const tile = member ? createRuntimeTileView(state, member.currentTile) : undefined;
  if (!member || !tile) {
    return undefined;
  }

  for (const object of getVisibleMapObjects(state, member.currentTile)) {
    const action = object.actions.find((item) => item.id === actionId);
    if (!action) {
      continue;
    }
    return { member, tile, object, action };
  }

  return undefined;
}

export function dispatchTimedLocalAction(state: GameState, crewId: CrewId, actionId: string): TimedLocalDispatchResult {
  const selection = findLocationStoryActionSelection(state, crewId, actionId);
  if (!selection || selection.action.local_action?.kind !== "timed_repair") {
    return {
      matched: false,
      accepted: false,
      reason: "",
      state,
    };
  }

  if (isMapObjectRepaired(state, selection.object.id)) {
    return {
      matched: true,
      accepted: false,
      reason: "该对象已经修复，不能重复维修。",
      state,
    };
  }

  const lockReason = getTimedRepairLockReason(state.crew_actions, crewId, selection.object.id);
  if (lockReason) {
    return {
      matched: true,
      accepted: false,
      reason: lockReason,
      state,
    };
  }

  const blockingAction = selectActiveCrewActionForCrew(state.crew_actions, crewId);
  if (blockingAction) {
    return {
      matched: true,
      accepted: false,
      reason: "该队员已有进行中的主要行动。",
      state,
    };
  }

  const action = createRepairCrewActionState(state, selection);
  const nextMember = {
    ...selection.member,
    status: `正在维修${selection.object.name}。`,
    statusTone: "accent" as Tone,
    activeAction: {
      id: action.id,
      actionType: "repair" as const,
      status: "inProgress" as const,
      startTime: state.elapsedGameSeconds,
      durationSeconds: action.duration_seconds,
      finishTime: action.ends_at ?? state.elapsedGameSeconds + action.duration_seconds,
      targetTile: selection.member.currentTile,
      params: action.action_params,
    },
  };
  const nextState = {
    ...state,
    crew: state.crew.map((member) => (member.id === nextMember.id ? nextMember : member)),
    crew_actions: {
      ...state.crew_actions,
      [action.id]: action,
    },
    logs: appendLogEntry(
      state.logs,
      `${selection.member.name} 开始维修${selection.object.name}，预计 ${formatDuration(action.duration_seconds)}。`,
      "accent",
      state.elapsedGameSeconds,
    ),
  };

  return {
    matched: true,
    accepted: true,
    reason: "维修指令已提交。",
    state: nextState,
  };
}


function createRepairCrewActionState(
  state: GameState,
  selection: LocationStoryActionSelection,
): CrewActionState {
  const localAction = selection.action.local_action as TimedRepairLocalActionDef;
  const actionId = `repair:${selection.member.id}:${selection.object.id}:${state.elapsedGameSeconds}`;
  return {
    id: actionId,
    crew_id: selection.member.id,
    type: "repair",
    status: "active",
    source: "player_command",
    parent_event_id: null,
    objective_id: null,
    action_request_id: null,
    from_tile_id: selection.member.currentTile,
    to_tile_id: null,
    target_tile_id: selection.member.currentTile,
    path_tile_ids: [],
    started_at: state.elapsedGameSeconds,
    ends_at: state.elapsedGameSeconds + localAction.duration_seconds,
    progress_seconds: 0,
    duration_seconds: localAction.duration_seconds,
    action_params: {
      object_id: selection.object.id,
      success_check: localAction.success_check,
      success_effects: localAction.success_effects,
      failure_effects: localAction.failure_effects,
    },
    can_interrupt: true,
    interrupt_duration_seconds: 10,
  };
}

function triggerLocationStoryAction(
  state: GameState,
  selection: LocationStoryActionSelection,
): { state: GameState; createdEvent: boolean; runtimeCallId?: string } {
  const context = createLocationStoryActionTriggerContext(state, selection);
  const result = processTrigger({
    state: toEventEngineState(state),
    index: eventContentIndex,
    context,
  });

  const nextState = mergeEventRuntimeState(state, result.state);
  const runtimeCallId = findRuntimeCallForCrew(nextState, selection.member.id)?.id;

  return {
    state: nextState,
    createdEvent: (result.candidate_report?.created_event_ids.length ?? 0) > 0,
    runtimeCallId,
  };
}

function createLocationStoryActionTriggerContext(
  state: GameState,
  { member, object, action }: LocationStoryActionSelection,
): TriggerContext {
  return {
    trigger_type: "action_complete",
    occurred_at: state.elapsedGameSeconds,
    source: "call",
    crew_id: member.id,
    tile_id: member.currentTile,
    action_id: action.id,
    event_definition_id: action.event_id,
    payload: {
      action_type: actionVerb(action.id),
      action_def_id: action.id,
      object_id: object.id,
      tags: mergeTags(getCurrentAreaSurveyTileTags(state, member.currentTile), object.tags ?? []),
    },
  };
}

function getVisibleMapObjects(state: GameState, tileId: string): MapObjectDefinition[] {
  const configTile = defaultMapTileById.get(tileId);
  if (!configTile) {
    return [];
  }

  return configTile.objectIds
    .map((objectId) => mapObjectDefinitionById.get(objectId))
    .filter((definition): definition is MapObjectDefinition => Boolean(definition && isObjectVisible(tileId, definition, state.map)));
}

function getCurrentAreaSurveyTileTags(state: GameState, tileId: string): string[] {
  const tile = createRuntimeTileView(state, tileId);
  return tile ? mergeTags(inferTileTags(tile), inferTileDangerTags(tile, state.map)) : [];
}

function actionVerb(actionId: string): string {
  const parts = actionId.split(":");
  return parts[parts.length - 1] || actionId;
}

function processObjectiveCompletions(state: GameState, contexts: TriggerContext[]): GameState {
  let nextState = state;

  for (const context of contexts) {
    if (context.trigger_type !== "action_complete" || !context.action_id) {
      continue;
    }

    const objective = Object.values(nextState.objectives).find(
      (item) => item.action_id === context.action_id && (item.status === "assigned" || item.status === "in_progress"),
    );
    if (!objective) {
      continue;
    }

    const completed = completeObjective({
      state: toEventEngineState(nextState),
      index: eventContentIndex,
      objective_id: objective.id,
      occurred_at: context.occurred_at,
      result_key: "action_completed",
    });
    nextState = mergeEventRuntimeState(nextState, completed.state);
  }

  return nextState;
}

function findRuntimeCallForCrew(state: GameState, crewId: CrewId): RuntimeCall | undefined {
  return Object.values(state.active_calls).find(
    (call) =>
      call.crew_id === crewId &&
      (call.status === "incoming" || call.status === "connected" || call.status === "awaiting_choice") &&
      (typeof call.expires_at !== "number" || call.expires_at > state.elapsedGameSeconds),
  );
}

export function toEventEngineState(state: GameState): GraphRunnerGameState {
  return {
    ...state,
    elapsed_game_seconds: state.elapsedGameSeconds,
    crew: Object.fromEntries(state.crew.map((member) => [member.id, toCrewState(member, state.crew_actions)])),
    tiles: toEventTileStates(state),
    resources: numericResources(state.resources),
    inventories: {
      ...state.inventories,
      ...toInventoryStates(state),
    },
  };
}

export function mergeEventRuntimeState(state: GameState, eventState: GraphRunnerGameState): GameState {
  const views = syncEventRuntimeToViews(state, eventState);
  const bridged = bridgeCrewActions({ ...state, crew: views.crew }, eventState);
  const eventMap = (eventState as GraphRunnerGameState & { map?: GameMapState }).map;
  const worldFlags = withReturnHomeCompletionTime(state, eventState.world_flags);

  return {
    ...state,
    crew: bridged.crew,
    baseInventory: views.baseInventory,
    resources: views.resources,
    map: eventMap ?? state.map,
    tiles: views.tiles,
    logs: bridged.logs,
    active_events: eventState.active_events,
    active_calls: eventState.active_calls,
    objectives: eventState.objectives,
    event_logs: eventState.event_logs,
    world_history: eventState.world_history,
    world_flags: worldFlags,
    quest_state: eventState.quest_state ?? state.quest_state,
    crew_actions: eventState.crew_actions,
    inventories: eventState.inventories,
    rng_state: eventState.rng_state,
  };
}

function withReturnHomeCompletionTime(state: GameState, worldFlags: GameState["world_flags"]): GameState["world_flags"] {
  if (worldFlags.return_home_completed?.value !== true) {
    return worldFlags;
  }

  const existing = worldFlags.return_home_completed_at;
  if (typeof existing?.value === "number" && existing.value > 0) {
    return worldFlags;
  }

  const completedAt = Math.max(0, state.elapsedGameSeconds);
  const flag: WorldFlag = {
    key: "return_home_completed_at",
    value: completedAt,
    value_type: "number",
    created_at: existing?.created_at ?? completedAt,
    updated_at: completedAt,
    source_event_id: existing?.source_event_id ?? worldFlags.return_home_completed.source_event_id ?? null,
    tags: existing?.tags ?? ["mainline", "ending", "completion_time"],
  };

  return {
    ...worldFlags,
    return_home_completed_at: flag,
  };
}

function bridgeCrewActions(state: GameState, eventState: GraphRunnerGameState): { crew: CrewMember[]; logs: SystemLog[] } {
  const actionByCrew = collectBridgeableCrewActions(eventState.crew_actions);
  let logs = state.logs;

  const crew = state.crew.map((member) => {
    const eventAction = actionByCrew.get(member.id);
    if (!eventAction) {
      if (member.unavailable && member.canCommunicate && member.status === "遭遇事件，等待通讯接通。") {
        return {
          ...member,
          status: "待命中。",
          statusTone: "muted" as Tone,
          unavailable: false,
          canCommunicate: true,
        };
      }
      return member;
    }

    if (eventAction.type === "event_waiting") {
      return {
        ...member,
        status: "遭遇事件，等待通讯接通。",
        statusTone: "danger" as Tone,
        unavailable: true,
        canCommunicate: true,
      };
    }

    return member;
  });

  return { crew, logs };
}

function collectBridgeableCrewActions(crewActions: Record<Id, CrewActionState>) {
  const actionByCrew = new Map<Id, CrewActionState>();

  for (const action of Object.values(crewActions)) {
    if (action.source !== "event_action_request" || action.status !== "active") {
      continue;
    }
    if (action.type === "move") {
      continue;
    }

    const existing = actionByCrew.get(action.crew_id);
    if (!existing || compareCrewActionRecency(action, existing) > 0) {
      actionByCrew.set(action.crew_id, action);
    }
  }

  return actionByCrew;
}

function compareCrewActionRecency(left: CrewActionState, right: CrewActionState) {
  const leftStartedAt = left.started_at ?? 0;
  const rightStartedAt = right.started_at ?? 0;
  return leftStartedAt === rightStartedAt ? left.id.localeCompare(right.id) : leftStartedAt - rightStartedAt;
}

function syncEventRuntimeToViews(state: GameState, eventState: GraphRunnerGameState) {
  const baseInventory = eventState.inventories.base;
  const runtimeTileOverlays = Object.entries(eventState.tiles).filter(([, tile]) => tile.danger_tags.length > 0 || tile.event_marks.length > 0);

  return {
    crew: state.crew.map((member) => {
      const runtimeCrew = eventState.crew[member.id];
      const crewInventory = eventState.inventories[crewInventoryId(member.id)];

      return {
        ...member,
        ...(runtimeCrew
          ? {
              personalityTags: mergeStringLists(member.personalityTags, runtimeCrew.personality_tags),
              conditions: mergeStringLists(member.conditions, runtimeCrew.condition_tags),
            }
          : {}),
        ...(crewInventory ? { inventory: toGameInventoryEntries(crewInventory.items) } : {}),
      };
    }),
    tiles: runtimeTileOverlays.length > 0 ? mergeRuntimeTileOverlays(state.tiles, Object.fromEntries(runtimeTileOverlays)) : state.tiles,
    baseInventory: baseInventory ? toGameInventoryEntries(baseInventory.items) : state.baseInventory,
    resources: baseInventory ? toResourceSummary(state.resources, baseInventory.resources) : state.resources,
  };
}

function mergeRuntimeTileOverlays(tiles: MapTile[], runtimeTiles: Record<Id, TileState>) {
  let changed = false;
  const nextTiles = tiles.map((tile) => {
    const runtimeTile = runtimeTiles[tile.id];
    if (!runtimeTile) {
      return tile;
    }

    const nextDangerTags = mergeStringLists(tile.dangerTags ?? [], runtimeTile.danger_tags);
    const nextEventMarks = mergeEventMarks(tile.eventMarks ?? [], runtimeTile.event_marks);
    const nextTile = {
      ...tile,
      dangerTags: nextDangerTags,
      eventMarks: nextEventMarks,
    };
    changed = changed || nextDangerTags !== tile.dangerTags || nextEventMarks !== tile.eventMarks;
    return nextTile;
  });

  return changed ? nextTiles : tiles;
}

function toGameInventoryEntries(items: InventoryState["items"]): GameState["baseInventory"] {
  return items.filter((item) => item.quantity > 0).map((item) => ({ itemId: item.item_id, quantity: item.quantity }));
}

function toResourceSummary(existing: ResourceSummary, resources: Record<string, number>): ResourceSummary {
  return {
    ...existing,
    energy: resources.energy ?? existing.energy,
    iron: resources.iron ?? existing.iron,
    wood: resources.wood ?? existing.wood,
    food: resources.food ?? existing.food,
    water: resources.water ?? existing.water,
    baseIntegrity: resources.baseIntegrity ?? existing.baseIntegrity,
    sol: resources.sol ?? existing.sol,
    power: resources.power ?? existing.power,
  };
}

function mergeStringLists(existing: string[], incoming: string[]) {
  return Array.from(new Set([...existing, ...incoming]));
}

function mergeTags(...groups: string[][]) {
  return Array.from(new Set(groups.flat()));
}

function mergeEventMarks(existing: NonNullable<MapTile["eventMarks"]>, incoming: NonNullable<TileState["event_marks"]>) {
  const marksById = new Map(existing.map((mark) => [mark.id, mark]));
  for (const mark of incoming) {
    marksById.set(mark.id, mark);
  }
  return Array.from(marksById.values()).sort((left, right) => left.created_at - right.created_at || left.id.localeCompare(right.id));
}

function toCrewState(member: CrewMember, crewActions: Record<Id, CrewActionState> = {}): CrewState {
  const runtimeAction = selectActiveCrewActionForCrew(crewActions, member.id);
  return {
    id: member.id,
    display_name: member.name,
    tile_id: member.currentTile,
    status: toCrewRuntimeStatus(member, runtimeAction),
    attributes: {
      strength: member.attributes.physical,
      agility: member.attributes.agility,
      intelligence: member.attributes.intellect,
      perception: member.attributes.perception,
      luck: member.attributes.luck,
    },
    personality_tags: member.personalityTags,
    expertise_tags: member.expertise.map((item) => item.expertiseId),
    condition_tags: member.conditions,
    communication_state: member.unavailable || !member.canCommunicate ? "lost_contact" : "available",
    current_action_id: runtimeAction?.id ?? null,
    blocking_event_id: null,
    blocking_call_id: null,
    background_event_ids: [],
    inventory_id: crewInventoryId(member.id),
    diary_entry_ids: member.diaryEntries.map((entry) => entry.entryId),
    event_history_keys: [],
  };
}

function toTileState(tile: MapTile, map: GameMapState): TileState {
  return {
    id: tile.id,
    coordinates: {
      x: tile.col,
      y: tile.row,
    },
    terrain_type: tile.terrain,
    tags: inferTileTags(tile),
    danger_tags: inferTileDangerTags(tile, map),
    discovery_state: tile.investigated ? "mapped" : "known",
    survey_state: tile.investigated ? "surveyed" : "unsurveyed",
    visibility: "visible",
    current_crew_ids: tile.crew,
    resource_nodes: [],
    site_objects: getConfigTileObjects(tile).map((object) => ({ id: object.id, object_type: object.kind, tags: object.tags ?? [] })),
    buildings: [],
    event_marks: tile.eventMarks ?? [],
    history_keys: [],
  };
}

function toEventTileStates(state: GameState): Record<Id, TileState> {
  const tileIds = collectEventTileIds(state);

  const entries: Array<[string, TileState]> = [];
  for (const tileId of tileIds) {
    const tile = createRuntimeTileView(state, tileId);
    if (tile) {
      entries.push([tileId, toTileState(tile, state.map)]);
    }
  }

  return Object.fromEntries(entries);
}

function collectEventTileIds(state: GameState) {
  const tileIds = new Set<string>(Object.keys(state.map.tilesById));

  for (const member of state.crew) {
    tileIds.add(member.currentTile);
  }

  for (const event of Object.values(state.active_events)) {
    if (event.primary_tile_id) {
      tileIds.add(event.primary_tile_id);
    }
  }

  for (const action of Object.values(state.crew_actions)) {
    if (action.from_tile_id) {
      tileIds.add(action.from_tile_id);
    }
    if (action.to_tile_id) {
      tileIds.add(action.to_tile_id);
    }
    if (action.target_tile_id) {
      tileIds.add(action.target_tile_id);
    }
    for (const tileId of action.path_tile_ids ?? []) {
      tileIds.add(tileId);
    }
  }

  return tileIds;
}

function createRuntimeTileView(state: GameState, tileId: string): MapTile | undefined {
  const configTile = defaultMapTileById.get(tileId);
  if (!configTile) {
    return undefined;
  }

  const runtimeTile = state.map.tilesById[tileId];
  const discovered = state.map.discoveredTileIds.includes(tileId) || Boolean(runtimeTile?.discovered);
  return {
    id: configTile.id,
    coord: getTileLocationLabel(defaultMapConfig, configTile.id),
    row: configTile.row,
    col: configTile.col,
    terrain: configTile.terrain,
    crew: runtimeTile?.crew ?? state.crew.filter((member) => member.currentTile === tileId && !member.unavailable).map((member) => member.id),
    status: runtimeTile?.status ?? (discovered ? "已发现" : "未探索"),
    investigated: Boolean(runtimeTile?.investigated),
  };
}

function toInventoryStates(state: GameState): Record<Id, InventoryState> {
  const crewInventories = Object.fromEntries(
    state.crew.map((member) => [
      crewInventoryId(member.id),
      {
        id: crewInventoryId(member.id),
        owner_type: "crew" as const,
        owner_id: member.id,
        items: member.inventory.map((item) => ({ item_id: item.itemId, quantity: item.quantity })),
        resources: {},
      },
    ]),
  );

  return {
    base: {
      id: "base",
      owner_type: "base",
      owner_id: "base",
      items: state.baseInventory.map((item) => ({ item_id: item.itemId, quantity: item.quantity })),
      resources: numericResources(state.resources),
    },
    ...crewInventories,
  };
}

function toCrewRuntimeStatus(member: CrewMember, runtimeAction?: CrewActionState): CrewState["status"] {
  if (member.unavailable) {
    return "unavailable";
  }
  if (!member.canCommunicate) {
    return "lost_contact";
  }
  if (runtimeAction?.type === "move") {
    return "moving";
  }
  if (runtimeAction) {
    return "acting";
  }
  return "idle";
}

function numericResources(resources: ResourceSummary): Record<string, number> {
  return {
    energy: resources.energy,
    iron: resources.iron,
    wood: resources.wood,
    food: resources.food,
    water: resources.water,
    baseIntegrity: resources.baseIntegrity,
    sol: resources.sol,
    power: resources.power,
  };
}

function getWorldFlagNumber(state: GameState, key: string): number | undefined {
  const value = state.world_flags[key]?.value;
  return typeof value === "number" ? value : undefined;
}

function crewInventoryId(crewId: CrewId) {
  return `crew:${crewId}`;
}

function inferTileTags(tile: MapTile) {
  const configObjects = getConfigTileObjects(tile);
  const text = [tile.terrain, tile.status, ...configObjects.flatMap((object) => [object.name, object.kind, ...(object.tags ?? [])])].join(" ");
  const explicitTags = "tags" in tile && Array.isArray(tile.tags) ? tile.tags.filter((tag): tag is string => typeof tag === "string") : [];
  const tags = new Set<string>([...explicitTags, ...configObjects.flatMap((object) => object.tags ?? [])]);

  if (/森林|木材|野生动物/.test(text)) {
    tags.add("forest");
  }
  if (/山|丘陵/.test(text)) {
    tags.add("mountain");
  }
  if (/断续信号|广播塔|中继器|回声/.test(text)) {
    tags.add("mountain_signal");
  }
  if (/沙漠/.test(text)) {
    tags.add("desert");
  }
  if (/火山|灰|ash/i.test(text)) {
    tags.add("volcanic");
  }

  return Array.from(tags);
}

function inferTileDangerTags(tile: MapTile, map: GameMapState) {
  if (tile.dangerTags) {
    return tile.dangerTags;
  }

  const configTile = defaultMapTileById.get(tile.id);
  const runtimeTile = map.tilesById[tile.id];
  const activeSpecialStateIds = new Set(runtimeTile?.activeSpecialStateIds ?? configTile?.specialStates.filter((state) => state.startsActive).map((state) => state.id) ?? []);
  const configDangerTags =
    configTile?.specialStates
      .filter((state) => activeSpecialStateIds.has(state.id))
      .flatMap((state) => {
        const dangerTags = "dangerTags" in state && Array.isArray(state.dangerTags) ? state.dangerTags.filter((tag): tag is string => typeof tag === "string") : [];
        return dangerTags.length ? dangerTags : (state.tags ?? []);
      }) ?? [];

  return configDangerTags;
}

function getConfigTileObjects(tile: Pick<MapTile, "id">): MapObjectDefinition[] {
  const configTile = defaultMapTileById.get(tile.id);
  return (
    configTile?.objectIds
      .map((objectId) => mapObjectDefinitionById.get(objectId))
      .filter((object): object is MapObjectDefinition => Boolean(object)) ?? []
  );
}

function appendLogEntry(logs: SystemLog[], text: string, tone: Tone, elapsedGameSeconds: number, reportId?: string) {
  const id = logs.reduce((highest, log) => Math.max(highest, log.id), 0) + 1;
  return [...logs, { id, time: formatGameTime(elapsedGameSeconds), text, tone, ...(reportId ? { reportId } : {}) }];
}

function normalizeSavedMap(map: Partial<GameMapState>): GameMapState {
  const fresh = createInitialMapState();
  if (map.configId !== defaultMapConfig.id || map.configVersion !== defaultMapConfig.version) {
    return fresh;
  }

  const discoveredTileIds = Array.isArray(map.discoveredTileIds) ? map.discoveredTileIds.filter((id) => defaultMapTileById.has(id)) : fresh.discoveredTileIds;
  return {
    configId: defaultMapConfig.id,
    configVersion: defaultMapConfig.version,
    rows: defaultMapConfig.size.rows,
    cols: defaultMapConfig.size.cols,
    originTileId: defaultMapConfig.originTileId,
    tilesById: { ...fresh.tilesById, ...(map.tilesById ?? {}) },
    discoveredTileIds,
    investigationReportsById: map.investigationReportsById ?? {},
    mapObjects: { ...(fresh.mapObjects ?? {}), ...(map.mapObjects ?? {}) },
  };
}

function syncMapCrew(map: GameMapState, crew: CrewMember[]): GameMapState {
  const tilesById: GameMapState["tilesById"] = {};

  for (const [tileId, state] of Object.entries(map.tilesById)) {
    if (!state) {
      continue;
    }

    const { crew: _crew, ...tileStateWithoutCrew } = state;
    if (Object.keys(tileStateWithoutCrew).length > 0) {
      tilesById[tileId] = tileStateWithoutCrew;
    }
  }

  for (const member of crew) {
    if (member.unavailable) {
      continue;
    }

    const currentTileState = tilesById[member.currentTile] ?? {};
    tilesById[member.currentTile] = {
      ...currentTileState,
      crew: [...(currentTileState.crew ?? []), member.id],
    };
  }

  return { ...map, tilesById };
}

function discoverMapTile(map: GameMapState, tileId: string): GameMapState {
  const configTile = defaultMapTileById.get(tileId);
  if (!configTile) {
    return map;
  }

  const discoveredTileIds = map.discoveredTileIds.includes(tileId) ? map.discoveredTileIds : [...map.discoveredTileIds, tileId];
  const previous = map.tilesById[tileId] ?? {};
  return {
    ...map,
    discoveredTileIds,
    tilesById: {
      ...map.tilesById,
      [tileId]: {
        ...previous,
        discovered: true,
        revealedObjectIds: addUnique(
          previous.revealedObjectIds ?? [],
          ...configTile.objectIds.flatMap((objectId) => {
            const def = mapObjectDefinitionById.get(objectId);
            return def && def.visibility === "onDiscovered" ? [objectId] : [];
          }),
        ),
        revealedSpecialStateIds: addUnique(
          previous.revealedSpecialStateIds ?? [],
          ...configTile.specialStates.filter((state) => state.visibility === "onDiscovered" && (previous.activeSpecialStateIds ?? []).includes(state.id)).map((state) => state.id),
        ),
      },
    },
  };
}

function addUnique<T>(items: T[], ...values: T[]) {
  return [...items, ...values.filter((value) => !items.includes(value))];
}

function createPhoneTerminalPairingSession(): DualDevicePairingSession {
  return createPairingSession({
    hostUrl: getConfiguredYuanHostUrl(),
    mobileBaseUrl: getConfiguredMobileTerminalUrl(),
  });
}

function shouldStartYuanTerminal() {
  return import.meta.env.MODE !== "test" && import.meta.env.VITE_DISABLE_YUAN_TERMINAL !== "true" && typeof WebSocket !== "undefined";
}

function getConfiguredYuanHostUrl() {
  const configured = import.meta.env.VITE_YUAN_HOST_URL as string | undefined;
  if (configured) {
    return configured;
  }

  const url = new URL(window.location.href);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.port = "8888";
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function getConfiguredMobileTerminalUrl() {
  const configured = import.meta.env.VITE_MOBILE_TERMINAL_URL as string | undefined;
  if (configured) {
    return configured;
  }

  const url = new URL(window.location.href);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    url.port = "5174";
    url.pathname = "/";
  } else {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/mobile/`;
  }
  url.search = "";
  url.hash = "";
  return url.toString();
}

function buildMobileViewModel(state: GameState, elapsedGameSeconds: number) {
  const activeCalls = getActiveRuntimeCalls(state, elapsedGameSeconds);
  const contacts = state.crew.map((member) => ({ id: member.id, name: member.name, role: member.role, status: member.status }));
  const threads = state.crew.map((member) => {
    const call = activeCalls.find((item) => item.crew_id === member.id);
    const tile = createRuntimeTileView(state, member.currentTile);
    const callView = tile ? buildCallView({ member, tile, gameState: state }) : null;
    return {
      id: `crew:${member.id}`,
      crewId: member.id,
      title: member.name,
      preview: call?.rendered_lines[0]?.text ?? member.status,
      priority: call && isUrgentRuntimeCallState(call) ? "emergency" : call ? "call" : "normal",
      messages: call?.rendered_lines.map((line) => ({ id: `${call.id}:${line.speaker_crew_id}:${line.text}`, speaker: line.speaker_crew_id, text: line.text })) ?? [],
      options: call
        ? call.available_options.map((option) => ({ id: option.option_id, label: option.text, payload: { version: 1, kind: "runtime_call_option", callId: call.id, crewId: call.crew_id, optionId: option.option_id } }))
        : [
            { id: "universal:survey", label: "调查当前区域", payload: { version: 1, kind: "basic_action", crewId: member.id, actionId: "universal:survey" } },
            { id: "universal:standby", label: "原地待命", payload: { version: 1, kind: "basic_action", crewId: member.id, actionId: "universal:standby" } },
            { id: "universal:stop", label: "停止当前行动", payload: { version: 1, kind: "basic_action", crewId: member.id, actionId: "universal:stop" } },
            ...(callView?.groups.flatMap((group) => group.actions.filter((action) => action.id !== "universal:move" && !action.id.startsWith("universal:") && !action.disabled).map((action) => ({ id: action.id, label: action.label, payload: { version: 1, kind: "story_action", crewId: member.id, actionId: action.id } }))) ?? []),
            { id: "universal:move", label: "移动（请回到 PC 地图流程）", disabled: true, payload: null },
          ],
    };
  });
  return {
    kind: activeCalls.some(isUrgentRuntimeCallState) ? "emergency_snapshot" : "snapshot",
    title: activeCalls[0]?.rendered_lines[0]?.text ?? "移动通讯设备已同步",
    body: activeCalls[0]?.rendered_lines[1]?.text ?? "PC 权威端已下发通讯快照。",
    contacts,
    threads,
    taskSummary: Object.values(state.objectives).filter((objective) => objective.status === "available" || objective.status === "assigned" || objective.status === "in_progress").slice(0, 3).map((objective) => objective.title),
    recentEvents: state.event_logs.filter((log) => log.visibility === "player_visible").slice(-3).map((log) => log.summary),
  };
}

function getActiveRuntimeCalls(state: GameState, elapsedGameSeconds: number): RuntimeCall[] {
  return Object.values(state.active_calls).filter((call) => isRuntimeCallActiveForState(call, elapsedGameSeconds));
}

function isRuntimeCallActiveForState(call: RuntimeCall, elapsedGameSeconds: number) {
  return (call.status === "incoming" || call.status === "connected" || call.status === "awaiting_choice") && (typeof call.expires_at !== "number" || call.expires_at > elapsedGameSeconds);
}

function isUrgentRuntimeCallState(call: RuntimeCall) {
  const severity = (call as RuntimeCall & { severity?: unknown }).severity ?? call.render_context_snapshot.severity;
  return severity === "high" || severity === "critical";
}

function appendArrivalDiary(member: CrewMember, elapsedGameSeconds: number) {
  if (member.id !== "mike") {
    return member;
  }

  return appendDiaryEntry(member, {
    entryId: "mike_arrival_lake",
    triggerNode: "抵达湖泊边缘",
    gameSecond: elapsedGameSeconds,
    text: "湖没有声音，但通讯里有回声。它离地图更近，也离我更近。先不要让 Amy 知道我这么写。",
  });
}
