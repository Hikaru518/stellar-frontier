import { useEffect, useMemo, useRef, useState } from "react";
import {
  createDualDeviceMessage,
  acquireYuanDualDeviceTerminal,
  describeYuanRealtimeLink,
  DUAL_DEVICE_PC_EVENT_METHOD,
  DUAL_DEVICE_PHONE_DELIVERY_METHOD,
  provideDualDeviceService,
  requestDualDeviceMessage,
  selectPreferredTransport,
  validatePhoneChoiceSelectPayload,
  type PhoneChoiceSelectPayload,
  type YuanDualDeviceTerminal,
  yuanBackedDualDevicePlan,
} from "@stellar-frontier/dual-device";

type MobileConnectionStatus = "manual" | "connecting" | "connected" | "disconnected";

interface PairingParams {
  roomId: string;
  token: string;
  code: string;
  hostUrl: string;
  tenantPublicKey: string;
  clientId: string;
  pcTerminalId: string;
}

interface MobileThread {
  id: string;
  crewId?: string;
  title: string;
  preview: string;
  priority?: "normal" | "call" | "emergency";
  messages?: Array<{ id: string; speaker?: string; text: string }>;
  options?: Array<{ id: string; label: string; disabled?: boolean; payload: Omit<PhoneChoiceSelectPayload, "clientRequestId"> | null }>;
}

interface MobileSnapshot {
  kind?: string;
  title?: string;
  body?: string;
  threads?: MobileThread[];
  taskSummary?: string[];
  recentEvents?: string[];
}

interface PendingChoice {
  clientRequestId: string;
  label: string;
  status: "pending" | "accepted" | "rejected";
  reason?: string;
}

export function MobileTerminalApp() {
  const pairing = readPairingParams();
  const [connectionStatus, setConnectionStatus] = useState<MobileConnectionStatus>(pairing ? "connecting" : "manual");
  const [snapshot, setSnapshot] = useState<MobileSnapshot>({ threads: [] });
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [localFeedback, setLocalFeedback] = useState("等待 PC 授权的通讯快照。未连接手机时，PC 仍可 fallback。");
  const [pendingChoices, setPendingChoices] = useState<Record<string, PendingChoice>>({});
  const terminalRef = useRef<YuanDualDeviceTerminal | null>(null);
  const sequenceRef = useRef(1);
  const transportCandidates = [
    { kind: "yuan-webrtc-datachannel", health: "degraded", reason: "等待 Yuan Terminal 完成 WebRTC 无感升级。" },
    { kind: "yuan-wss", health: "healthy", rttMs: 60 },
  ] as const;
  const selected = selectPreferredTransport([...transportCandidates]);
  const realtimeLink = describeYuanRealtimeLink([...transportCandidates]);
  const threads = useMemo(() => normalizeThreads(snapshot), [snapshot]);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0];
  const emergencyThread = threads.find((thread) => thread.priority === "emergency");

  useEffect(() => {
    if (!pairing || !shouldStartYuanTerminal()) {
      return;
    }

    setConnectionStatus("connecting");
    const lease = acquireYuanDualDeviceTerminal({
      hostUrl: pairing.hostUrl,
      terminalId: pairing.clientId,
      token: pairing.token,
      tenantPublicKey: pairing.tenantPublicKey,
      name: "Stellar Frontier Phone Terminal",
      enableWebRTC: true,
    });
    const { terminal } = lease;
    terminalRef.current = terminal;

    const connectionSubscription = terminal.isConnected$.subscribe((connected) => {
      setConnectionStatus(connected ? "connected" : "disconnected");
      if (connected) {
        setLocalFeedback("已连接 Yuan Host。手机选择会立即 pending，最终由 PC ack。");
      }
    });

    const service = provideDualDeviceService(terminal, DUAL_DEVICE_PHONE_DELIVERY_METHOD, (message) => {
      if (message.type === "phone.message.delivered" || message.type === "phone.call.incoming") {
        if (message.payload.kind === "intent_ack" && typeof message.payload.clientRequestId === "string") {
          setPendingChoices((choices) => ({
            ...choices,
            [message.payload.clientRequestId as string]: {
              ...(choices[message.payload.clientRequestId as string] ?? { clientRequestId: message.payload.clientRequestId as string, label: "已提交" }),
              status: message.payload.status === "accepted" ? "accepted" : "rejected",
              reason: typeof message.payload.reason === "string" ? message.payload.reason : undefined,
            },
          }));
          return;
        }
        setSnapshot(readSnapshot(message.payload));
        setLocalFeedback(message.type === "phone.call.incoming" ? "收到高优先级来电，已置顶。" : "通讯快照已同步。");
      }
      if (message.type === "phone.fallback.enabled") {
        setLocalFeedback("PC fallback 已启用：这条通讯可在主机端安全处理。");
      }
    });

    const heartbeatId = window.setInterval(() => sendPhoneEvent(pairing, terminal, sequenceRef, "link.heartbeat", {}), 4000);
    sendPhoneEvent(pairing, terminal, sequenceRef, "link.heartbeat", {});

    return () => {
      window.clearInterval(heartbeatId);
      service.dispose();
      connectionSubscription.unsubscribe();
      if (terminalRef.current === terminal) {
        terminalRef.current = null;
      }
      lease.dispose();
    };
  }, [pairing?.clientId, pairing?.hostUrl, pairing?.roomId, pairing?.tenantPublicKey, pairing?.token]);

  function acknowledgePrivateSignal(kind: "read" | "answer") {
    if (!pairing) {
      return;
    }
    setLocalFeedback(kind === "answer" ? "已接听。本地反馈已完成，等待 PC ack。" : "已读。本地反馈已完成，等待 PC ack。");
    sendPhoneEvent(pairing, terminalRef.current, sequenceRef, kind === "answer" ? "phone.call.answer" : "phone.message.read", {
      threadId: selectedThread?.id,
    });
  }

  function sendChoice(option: NonNullable<MobileThread["options"]>[number]) {
    if (!pairing || !option.payload || !validatePhoneChoiceSelectPayload({ ...option.payload, clientRequestId: "probe" })) {
      setLocalFeedback("该选项不能在手机端提交；请回到 PC 地图 / 通话流程。");
      return;
    }
    const clientRequestId = `phone-${Date.now()}-${sequenceRef.current}`;
    setPendingChoices((choices) => ({ ...choices, [clientRequestId]: { clientRequestId, label: option.label, status: "pending" } }));
    sendPhoneEvent(pairing, terminalRef.current, sequenceRef, "phone.choice.select", { ...option.payload, clientRequestId });
  }

  const statusChips = [
    { label: "链路", value: formatConnectionStatus(connectionStatus), tone: formatConnectionTone(connectionStatus) },
    { label: "短码", value: pairing?.code ?? "等待 PC 显示", tone: undefined },
    { label: "路径", value: selected.selected, tone: undefined },
  ];
  const messageStack = selectedThread?.messages?.length ? selectedThread.messages : [{ id: "empty", text: snapshot.body ?? "PC 尚未下发通讯内容。" }];
  const taskSummary = snapshot.taskSummary ?? [];
  const recentEvents = snapshot.recentEvents ?? [];
  const pendingChoiceList = Object.values(pendingChoices);

  return (
    <main className="mobile-terminal-shell" data-paired={pairing ? "true" : "false"}>
      <header className="terminal-hero">
        <div className="terminal-title-block">
          <p className="eyebrow">Stellar Frontier / Handset Relay</p>
          <h1>{pairing ? "移动通讯设备" : "等待配对"}</h1>
          <p className="terminal-subtitle">PC 权威端保持结算；本机只提交通讯 intent。</p>
        </div>

        <div className="terminal-idplate" aria-label="配对状态摘要">
          {statusChips.map((chip) => (
            <span key={chip.label} className={`status-chip ${chip.tone ? `status-chip-${chip.tone}` : ""}`}>
              <span className="status-chip-label">{chip.label}</span> <strong>{chip.value}</strong>
            </span>
          ))}
        </div>
      </header>

      {emergencyThread ? (
        <section className="terminal-module terminal-module-alert emergency-call-panel" aria-label="紧急来电">
          <div className="module-header">
            <div>
              <p className="eyebrow">Priority Interrupt</p>
              <h2>{emergencyThread.title}</h2>
            </div>
            <span className="priority-badge priority-badge-emergency">紧急</span>
          </div>
          <p className="emergency-preview">{emergencyThread.preview}</p>
          <div className="terminal-actions emergency-actions">
            <button type="button" onClick={() => acknowledgePrivateSignal("answer")}>接听</button>
            <button type="button" onClick={() => setSelectedThreadId(emergencyThread.id)}>查看选项</button>
          </div>
        </section>
      ) : null}

      <section className="terminal-module chat-layout">
        <aside className="thread-list" aria-label="消息列表">
          <div className="module-header compact-header">
            <div>
              <p className="eyebrow">Message Bus</p>
              <h2>消息</h2>
            </div>
            <span className="count-badge">{threads.length.toString().padStart(2, "0")}</span>
          </div>

          <div className="thread-stack">
            {threads.map((thread) => (
              <button key={thread.id} type="button" className={`thread-row ${selectedThread?.id === thread.id ? "thread-row-active" : ""}`} onClick={() => setSelectedThreadId(thread.id)}>
                <span className="thread-row-topline">
                  <strong>{thread.title}</strong>
                  <em className={`priority-badge priority-badge-${thread.priority ?? "normal"}`}>{formatThreadPriority(thread.priority)}</em>
                </span>
                <span className="thread-preview">{thread.preview}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="chat-thread" aria-label="会话线程">
          <div className="module-header thread-header">
            <div>
              <p className="eyebrow">Selected Thread</p>
              <h2>{selectedThread?.title ?? "等待通讯"}</h2>
            </div>
            <span className="priority-badge priority-badge-command">PC 结算</span>
          </div>

          <div className="message-stream">
            {messageStack.map((message, index) => (
              <article key={message.id} className="chat-bubble">
                <span className="message-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  {message.speaker ? <span className="message-speaker">{message.speaker}</span> : null}
                  <p>{message.text}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="structured-options" aria-label="可提交选项">
            {selectedThread?.options?.length ? (
              selectedThread.options.map((option) => (
                <button key={option.id} type="button" disabled={option.disabled} onClick={() => sendChoice(option)}>
                  <span>提交</span>
                  <strong>{option.label}</strong>
                </button>
              ))
            ) : (
              <p className="empty-options">当前线程没有可在手机端提交的结构化选项。</p>
            )}
          </div>

          {pendingChoiceList.length ? (
            <div className="pending-stack" aria-label="待确认指令">
              {pendingChoiceList.map((choice) => (
                <p key={choice.clientRequestId} className={`pending-line pending-line-${choice.status}`}>{choice.label}: {formatPending(choice)}</p>
              ))}
            </div>
          ) : null}
        </section>
      </section>

      <section className="terminal-module terminal-feed">
        <div className="module-header compact-header">
          <div>
            <p className="eyebrow">Ops Feed</p>
            <h2>任务摘要 / 近期事件</h2>
          </div>
          <span className="count-badge">LOG</span>
        </div>
        <div className="feed-grid">
          <article>
            <h3>任务摘要</h3>
            <p>{taskSummary.join(" / ") || "等待 PC 同步任务摘要。"}</p>
          </article>
          <article>
            <h3>近期事件</h3>
            <p>{recentEvents.join(" / ") || "暂无近期事件。"}</p>
          </article>
          <article className="feedback-line">
            <h3>本机反馈</h3>
            <p>{localFeedback}</p>
          </article>
        </div>
      </section>

      <section className="terminal-module terminal-telemetry">
        <div className="module-header compact-header">
          <div>
            <p className="eyebrow">Transport Scope</p>
            <h2>实时连接状态</h2>
          </div>
          <span className="priority-badge priority-badge-command">只读诊断</span>
        </div>
        <p className="telemetry-summary">{yuanBackedDualDevicePlan.summary}</p>
        <dl className="telemetry-list">
          <div>
            <dt>局域网升级</dt>
            <dd>{realtimeLink.webRtcUpgrade.kind} / {realtimeLink.webRtcUpgrade.label}</dd>
          </div>
          <div>
            <dt>公网兜底</dt>
            <dd>{realtimeLink.publicFallback.kind} / {realtimeLink.publicFallback.label}</dd>
          </div>
          <div>
            <dt>结算边界</dt>
            <dd>enableWebRTC=true；游戏结算仍由 PC 完成。</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

function readSnapshot(payload: Record<string, unknown>): MobileSnapshot {
  return {
    kind: typeof payload.kind === "string" ? payload.kind : undefined,
    title: typeof payload.title === "string" ? payload.title : undefined,
    body: typeof payload.body === "string" ? payload.body : undefined,
    threads: Array.isArray(payload.threads) ? (payload.threads as MobileThread[]) : [],
    taskSummary: readStringArray(payload.taskSummary),
    recentEvents: readStringArray(payload.recentEvents),
  };
}

function normalizeThreads(snapshot: MobileSnapshot): MobileThread[] {
  if (snapshot.threads?.length) {
    return snapshot.threads;
  }
  return [{ id: "pc", title: snapshot.title ?? "PC 权威端", preview: snapshot.body ?? "等待同步", messages: [] }];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readPairingParams(): PairingParams | null {
  const url = new URL(window.location.href);
  const roomId = url.searchParams.get("roomId")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim() ?? "";
  const code = url.searchParams.get("code")?.trim() ?? "";
  const hostUrl = url.searchParams.get("hostUrl")?.trim() ?? "";
  const tenantPublicKey = url.searchParams.get("tenantPublicKey")?.trim() ?? "";
  const pcTerminalId = url.searchParams.get("pcTerminalId")?.trim() ?? "";
  const phoneTerminalId = url.searchParams.get("phoneTerminalId")?.trim() ?? "";

  if (!roomId || !token || !code || !hostUrl || !tenantPublicKey || !pcTerminalId || !phoneTerminalId) {
    return null;
  }

  return { roomId, token, code, hostUrl, tenantPublicKey, clientId: phoneTerminalId, pcTerminalId };
}

function sendPhoneEvent(
  pairing: PairingParams,
  terminal: YuanDualDeviceTerminal | null,
  sequenceRef: { current: number },
  type: "link.heartbeat" | "phone.message.read" | "phone.call.answer" | "phone.choice.select",
  payload: Record<string, unknown>,
) {
  if (!terminal) {
    return;
  }

  const message = createDualDeviceMessage({ type, roomId: pairing.roomId, clientId: pairing.clientId, sequence: sequenceRef.current, payload });
  sequenceRef.current += 1;
  void requestDualDeviceMessage({ terminal, targetTerminalId: pairing.pcTerminalId, method: DUAL_DEVICE_PC_EVENT_METHOD, message }).catch(() => undefined);
}

function shouldStartYuanTerminal() {
  return import.meta.env.MODE !== "test" && typeof WebSocket !== "undefined";
}

function formatConnectionStatus(status: MobileConnectionStatus) {
  if (status === "connected") return "已连接";
  if (status === "connecting") return "连接中";
  if (status === "disconnected") return "已断开 / 等待 PC fallback";
  return "手动输入或扫码加入";
}

function formatConnectionTone(status: MobileConnectionStatus) {
  if (status === "connected") return "online";
  if (status === "connecting") return "syncing";
  if (status === "disconnected") return "alert";
  return "manual";
}

function formatThreadPriority(priority: MobileThread["priority"]) {
  if (priority === "emergency") return "紧急";
  if (priority === "call") return "通话";
  return "常规";
}

function formatPending(choice: PendingChoice) {
  if (choice.status === "accepted") return "已接受";
  if (choice.status === "rejected") return `被拒绝${choice.reason ? `（${choice.reason}）` : ""}`;
  return "等待 PC ack";
}
