import { useEffect, useRef, useState } from "react";
import {
  buildYuanHostConnectionUrl,
  createDualDeviceMessage,
  createYuanTerminalMessage,
  decodeYuanWireMessage,
  encodeYuanWireMessage,
  extractDualDeviceMessage,
  selectPreferredTransport,
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
  const socketRef = useRef<WebSocket | null>(null);
  const sequenceRef = useRef(1);
  const selected = selectPreferredTransport([
    { kind: "yuan-webrtc-datachannel", health: "degraded", reason: "等待 Yuan Terminal 完成 WebRTC 无感升级。" },
    { kind: "yuan-wss", health: "healthy", rttMs: 60 },
  ]);

  useEffect(() => {
    if (!pairing || typeof WebSocket === "undefined") {
      return;
    }

    setConnectionStatus("connecting");
    const socket = new WebSocket(
      buildYuanHostConnectionUrl(pairing.hostUrl, { terminalId: pairing.clientId, hostToken: pairing.token, publicKey: pairing.tenantPublicKey }),
    );
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnectionStatus("connected");
      setLocalFeedback("已连接。手机点击会立即反馈，最终结果等待 PC ack。");
    });

    socket.addEventListener("message", (event) => {
      const yuanMessage = parseYuanWireMessage(event.data);
      const message = yuanMessage ? extractDualDeviceMessage(yuanMessage) : null;
      if (!message) {
        return;
      }

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

    socket.addEventListener("close", () => setConnectionStatus("disconnected"));
    socket.addEventListener("error", () => setConnectionStatus("disconnected"));

    const heartbeatId = window.setInterval(() => {
      sendPhoneEvent(pairing, socket, sequenceRef, "link.heartbeat", {});
    }, 4000);

    return () => {
      window.clearInterval(heartbeatId);
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      socket.close();
    };
  }, [pairing?.clientId, pairing?.hostUrl, pairing?.roomId, pairing?.tenantPublicKey, pairing?.token]);

  function acknowledgePrivateSignal(kind: "read" | "answer") {
    if (!pairing || !privateSignal) {
      return;
    }

    setLocalFeedback(kind === "answer" ? "已接听。本地反馈已完成，等待 PC ack。" : "已读。本地反馈已完成，等待 PC ack。");
    sendPhoneEvent(pairing, socketRef.current, sequenceRef, kind === "answer" ? "phone.call.answer" : "phone.message.read", {
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
      ) : null}
      <section className="terminal-card">
        <h2>推荐链路</h2>
        <p>{yuanBackedDualDevicePlan.summary}</p>
        <dl>
          <div>
            <dt>当前首选</dt>
            <dd>{selected.selected}</dd>
          </div>
          <div>
            <dt>公网兜底</dt>
            <dd>{selected.fallback}</dd>
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

function parseYuanWireMessage(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return decodeYuanWireMessage(value);
}

function sendPhoneEvent(
  pairing: PairingParams,
  socket: WebSocket | null,
  sequenceRef: { current: number },
  type: "link.heartbeat" | "phone.message.read" | "phone.call.answer",
  payload: Record<string, unknown>,
) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const message = createDualDeviceMessage({
    type,
    roomId: pairing.roomId,
    clientId: pairing.clientId,
    sequence: sequenceRef.current,
    payload,
  });
  socket.send(encodeYuanWireMessage(createYuanTerminalMessage(message, { sourceTerminalId: pairing.clientId, targetTerminalId: pairing.pcTerminalId })));
  sequenceRef.current += 1;
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
