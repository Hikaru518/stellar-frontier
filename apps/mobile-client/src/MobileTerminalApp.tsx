import { useEffect, useRef, useState } from "react";
import {
  createDualDeviceMessage,
  acquireYuanDualDeviceTerminal,
  describeYuanRealtimeLink,
  DUAL_DEVICE_PC_EVENT_METHOD,
  DUAL_DEVICE_PHONE_DELIVERY_METHOD,
  provideDualDeviceService,
  requestDualDeviceMessage,
  selectPreferredTransport,
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

interface PrivateSignal {
  title: string;
  body: string;
}

export function MobileTerminalApp() {
  const pairing = readPairingParams();
  const [connectionStatus, setConnectionStatus] = useState<MobileConnectionStatus>(pairing ? "connecting" : "manual");
  const [privateSignal, setPrivateSignal] = useState<PrivateSignal | null>(null);
  const [localFeedback, setLocalFeedback] = useState("等待 PC 授权的私密通讯。未连接手机时，PC 仍可 fallback。");
  const terminalRef = useRef<YuanDualDeviceTerminal | null>(null);
  const sequenceRef = useRef(1);
  const transportCandidates = [
    { kind: "yuan-webrtc-datachannel", health: "degraded", reason: "等待 Yuan Terminal 完成 WebRTC 无感升级。" },
    { kind: "yuan-wss", health: "healthy", rttMs: 60 },
  ] as const;
  const selected = selectPreferredTransport([...transportCandidates]);
  const realtimeLink = describeYuanRealtimeLink([...transportCandidates]);

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
        setLocalFeedback("已连接 Yuan Host。手机点击会立即反馈，最终结果等待 PC ack。");
      }
    });

    const service = provideDualDeviceService(terminal, DUAL_DEVICE_PHONE_DELIVERY_METHOD, (message) => {
      if (message.type === "phone.call.incoming" || message.type === "phone.message.delivered") {
        setPrivateSignal({
          title: typeof message.payload.title === "string" ? message.payload.title : "私密通讯",
          body: typeof message.payload.body === "string" ? message.payload.body : "收到一条 PC 授权的私密信号。",
        });
        setLocalFeedback("新私密信号已本地显示。阅读或接听后会回传 PC 权威端。");
      }

      if (message.type === "phone.fallback.enabled") {
        setLocalFeedback("PC fallback 已启用：这条通讯可在主机端安全处理。");
      }
    });

    const heartbeatId = window.setInterval(() => {
      sendPhoneEvent(pairing, terminal, sequenceRef, "link.heartbeat", {});
    }, 4000);
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
    if (!pairing || !privateSignal) {
      return;
    }

    setLocalFeedback(kind === "answer" ? "已接听。本地反馈已完成，等待 PC ack。" : "已读。本地反馈已完成，等待 PC ack。");
    sendPhoneEvent(pairing, terminalRef.current, sequenceRef, kind === "answer" ? "phone.call.answer" : "phone.message.read", {
      title: privateSignal.title,
    });
  }

  return (
    <main className="mobile-terminal-shell">
      <p className="eyebrow">Stellar Frontier / 私人通讯终端</p>
      <h1>{pairing ? "私人通讯终端" : "等待配对"}</h1>
      <section className="terminal-card">
        <h2>配对状态</h2>
        <dl>
          <div>
            <dt>连接</dt>
            <dd>{formatConnectionStatus(connectionStatus)}</dd>
          </div>
          <div>
            <dt>短码</dt>
            <dd>{pairing?.code ?? "等待 PC 显示"}</dd>
          </div>
          <div>
            <dt>房间</dt>
            <dd>{pairing?.roomId ?? "未加入"}</dd>
          </div>
        </dl>
      </section>
      {privateSignal ? (
        <section className="terminal-card terminal-card-alert">
          <h2>{privateSignal.title}</h2>
          <p>{privateSignal.body}</p>
          <div className="terminal-actions">
            <button type="button" onClick={() => acknowledgePrivateSignal("answer")}>
              接听并回传 PC
            </button>
            <button type="button" onClick={() => acknowledgePrivateSignal("read")}>
              标记已读
            </button>
          </div>
        </section>
      ) : (
        <section className="terminal-card terminal-card-muted" aria-label="私密来电状态">
          <h2>暂无私密来电</h2>
          <p>没有 PC 授权的私密来电时，手机端会保持待命。</p>
        </section>
      )}
      <section className="terminal-card terminal-live-card" aria-label="实时连接状态">
        <div className="live-heading">
          <div>
            <p className="eyebrow">Yuan Runtime Link</p>
            <h2>实时连接状态</h2>
          </div>
          <span>{formatConnectionStatus(connectionStatus)}</span>
        </div>
        <div className="signal-orbit" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="signal-route" aria-hidden="true">
          <span>PC</span>
          <b />
          <span>Yuan</span>
          <b />
          <span>PHONE</span>
        </div>
      </section>
      <section className="terminal-card">
        <h2>推荐链路</h2>
        <p>{yuanBackedDualDevicePlan.summary}</p>
        <dl>
          <div>
            <dt>当前链路</dt>
            <dd>{selected.selected}</dd>
          </div>
          <div>
            <dt>局域网升级</dt>
            <dd>{realtimeLink.webRtcUpgrade.kind} / {realtimeLink.webRtcUpgrade.label}</dd>
          </div>
          <div>
            <dt>公网兜底</dt>
            <dd>{realtimeLink.publicFallback.kind} / {realtimeLink.publicFallback.label}</dd>
          </div>
          <div>
            <dt>Yuan 配置</dt>
            <dd>enableWebRTC=true</dd>
          </div>
        </dl>
      </section>
      <section className="terminal-card terminal-card-muted">
        <h2>手机端职责</h2>
        <p>本端只显示 PC 授权的私密通讯，并发送已读、接听、选择等 typed events。游戏结算仍由 PC 完成。</p>
        <p>{localFeedback}</p>
      </section>
    </main>
  );
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
  type: "link.heartbeat" | "phone.message.read" | "phone.call.answer",
  payload: Record<string, unknown>,
) {
  if (!terminal) {
    return;
  }

  const message = createDualDeviceMessage({
    type,
    roomId: pairing.roomId,
    clientId: pairing.clientId,
    sequence: sequenceRef.current,
    payload,
  });
  sequenceRef.current += 1;

  void requestDualDeviceMessage({
    terminal,
    targetTerminalId: pairing.pcTerminalId,
    method: DUAL_DEVICE_PC_EVENT_METHOD,
    message,
  }).catch(() => undefined);
}

function shouldStartYuanTerminal() {
  return import.meta.env.MODE !== "test" && typeof WebSocket !== "undefined";
}

function formatConnectionStatus(status: MobileConnectionStatus) {
  if (status === "connected") {
    return "已连接";
  }
  if (status === "connecting") {
    return "连接中";
  }
  if (status === "disconnected") {
    return "已断开 / 等待 PC fallback";
  }
  return "手动输入或扫码加入";
}
