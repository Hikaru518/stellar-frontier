export type DualDeviceTransportKind = "yuan-webrtc-datachannel" | "yuan-wss" | "offline";

export type DualDeviceTransportHealth = "healthy" | "degraded" | "unavailable";

export type DualDeviceRole = "pc" | "phone";

export interface DualDeviceTransportCandidate {
  kind: DualDeviceTransportKind;
  health: DualDeviceTransportHealth;
  rttMs?: number;
  reason?: string;
}

export interface DualDeviceTransportSelection {
  selected: DualDeviceTransportKind;
  fallback: DualDeviceTransportKind;
  reason: string;
}

export interface YuanRealtimeLinkPresentation {
  current: DualDeviceTransportKind;
  webRtcUpgrade: {
    kind: "yuan-webrtc-datachannel";
    enabled: boolean;
    health: DualDeviceTransportHealth;
    label: string;
  };
  publicFallback: {
    kind: "yuan-wss" | "offline";
    health: DualDeviceTransportHealth;
    label: string;
  };
}

export type DualDeviceMessageType =
  | "phone.message.delivered"
  | "phone.message.read"
  | "phone.call.incoming"
  | "phone.call.answer"
  | "phone.choice.select"
  | "phone.fallback.enabled"
  | "link.heartbeat"
  | "link.connected";

export interface DualDeviceMessage {
  type: DualDeviceMessageType;
  roomId: string;
  clientId: string;
  sequence: number;
  sentAt: number;
  payload: Record<string, unknown>;
}

export interface YuanTerminalMessage {
  source_terminal_id: string;
  target_terminal_id: string;
  trace_id: string;
  seq_id: number;
  method?: string;
  req?: unknown;
  event?: { type: string; payload?: unknown };
  done?: boolean;
}

export interface DualDeviceLinkStatus {
  transport: DualDeviceTransportKind;
  lastHeartbeatAt?: number;
  fallbackAfterMs: number;
}

export interface DualDevicePairingSession {
  roomId: string;
  hostId: string;
  tenantPublicKey: string;
  pcTerminalId: string;
  phoneTerminalId: string;
  pairingCode: string;
  token: string;
  hostUrl: string;
  mobileUrl: string;
  createdAt: number;
  expiresAt: number;
}

export interface CreatePairingSessionOptions {
  nowMs?: number;
  expiresInMs?: number;
  hostUrl: string;
  mobileBaseUrl: string;
  pcTerminalId?: string;
  tenantPublicKey?: string;
  randomBytes?: (length: number) => Uint8Array;
}

export interface CreateDualDeviceMessageOptions {
  type: DualDeviceMessageType;
  roomId: string;
  clientId: string;
  sequence: number;
  payload?: Record<string, unknown>;
  nowMs?: number;
}

export interface DualDeviceDeploymentPlan {
  name: string;
  summary: string;
  projects: Array<{ name: string; folder: string; responsibility: string }>;
  transportPriority: DualDeviceTransportKind[];
  latencyTargets: Array<{ label: string; target: string }>;
  rollout: string[];
}

const TRANSPORT_PRIORITY: Record<DualDeviceTransportKind, number> = {
  "yuan-webrtc-datachannel": 0,
  "yuan-wss": 1,
  offline: 99,
};

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;

export const yuanBackedDualDevicePlan: DualDeviceDeploymentPlan = {
  name: "Yuan-backed Dual Device",
  summary: "Stellar 不再维护专属 server；PC 与手机都作为 Yuan Terminal 接入同一 host/tenant，业务层只定义配对、token、消息和 fallback。",
  projects: [
    { name: "PC client", folder: "apps/pc-client", responsibility: "权威 GameState、配对入口、PC-side DualDevice services 与 fallback UI。" },
    { name: "Mobile client", folder: "apps/mobile-client", responsibility: "扫码进入的 Yuan Terminal companion，只展示派生状态并发送 typed events。" },
    { name: "Dual-device library", folder: "packages/dual-device", responsibility: "PC/mobile 共享的 room、QR、token、Yuan message 映射和 fallback 业务抽象。" },
    { name: "Yuan Host", folder: "external: No-Trade-No-Life/Yuan apps/host", responsibility: "外部 WSS Host、Terminal routing、WebRTC signaling、DataChannel upgrade 与 WS fallback。" },
  ],
  transportPriority: ["yuan-webrtc-datachannel", "yuan-wss", "offline"],
  latencyTargets: [
    { label: "手机本地反馈", target: "<50ms" },
    { label: "Yuan WebRTC DataChannel RTT", target: "同网时机会性低于 WSS" },
    { label: "Yuan WSS Host RTT", target: "同区域 20-80ms，跨区域 <150ms" },
  ],
  rollout: ["共享业务层 scaffold", "Yuan Host WSS 接入", "PC/mobile Terminal 化", "开启 Yuan WebRTC upgrade", "生产鉴权与观测 hardening"],
};

export function selectPreferredTransport(candidates: DualDeviceTransportCandidate[]): DualDeviceTransportSelection {
  const available = candidates
    .filter((candidate) => candidate.health !== "unavailable")
    .slice()
    .sort((left, right) => {
      const healthDelta = healthScore(left.health) - healthScore(right.health);
      if (healthDelta !== 0) {
        return healthDelta;
      }

      const priorityDelta = TRANSPORT_PRIORITY[left.kind] - TRANSPORT_PRIORITY[right.kind];
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      return (left.rttMs ?? Number.POSITIVE_INFINITY) - (right.rttMs ?? Number.POSITIVE_INFINITY);
    });

  const selected = available[0];

  if (!selected) {
    return { selected: "offline", fallback: "offline", reason: "没有可用 Yuan 链路，必须启用 PC fallback。" };
  }

  const fallback = available.find((candidate) => candidate.kind !== selected.kind)?.kind ?? "offline";
  return {
    selected: selected.kind,
    fallback,
    reason: selected.reason ?? formatTransportReason(selected),
  };
}

export function describeYuanRealtimeLink(candidates: DualDeviceTransportCandidate[]): YuanRealtimeLinkPresentation {
  const selection = selectPreferredTransport(candidates);
  const webRtc = candidates.find((candidate) => candidate.kind === "yuan-webrtc-datachannel");
  const wss = candidates.find((candidate) => candidate.kind === "yuan-wss");
  const webRtcHealth = webRtc?.health ?? "unavailable";
  const wssHealth = wss?.health ?? "unavailable";

  return {
    current: selection.selected,
    webRtcUpgrade: {
      kind: "yuan-webrtc-datachannel",
      enabled: webRtcHealth !== "unavailable",
      health: webRtcHealth,
      label: formatWebRtcUpgradeLabel(webRtcHealth),
    },
    publicFallback: {
      kind: wssHealth === "unavailable" ? "offline" : "yuan-wss",
      health: wssHealth,
      label: wssHealth === "unavailable" ? "Yuan WSS 不可用，PC fallback 接管" : "Yuan WSS baseline / 公网兜底",
    },
  };
}

export function formatPairingCode(bytes: Uint8Array): string {
  if (bytes.length < 6) {
    throw new Error("Pairing code requires at least 6 bytes of entropy.");
  }

  return Array.from(bytes.slice(0, 6), (byte) => PAIRING_ALPHABET[byte % PAIRING_ALPHABET.length]).join("");
}

export function createPairingCode(randomBytes: (length: number) => Uint8Array = createRandomBytes): string {
  return formatPairingCode(randomBytes(6));
}

export function createPairingSession({
  nowMs = Date.now(),
  expiresInMs = DEFAULT_PAIRING_TTL_MS,
  hostUrl,
  mobileBaseUrl,
  pcTerminalId = "stellar-pc-host",
  tenantPublicKey,
  randomBytes = createRandomBytes,
}: CreatePairingSessionOptions): DualDevicePairingSession {
  const roomEntropy = randomBytes(10);
  const tokenEntropy = randomBytes(16);
  const pairingCode = formatPairingCode(roomEntropy);
  const roomId = `sf-${formatToken(roomEntropy).slice(0, 12)}`;
  const publicKey = tenantPublicKey ?? `stellar-${formatToken(roomEntropy)}`;
  const phoneTerminalId = `stellar-phone-${pairingCode.toLowerCase()}`;
  const token = formatToken(tokenEntropy);
  const expiresAt = nowMs + expiresInMs;

  return {
    roomId,
    hostId: publicKey,
    tenantPublicKey: publicKey,
    pcTerminalId,
    phoneTerminalId,
    pairingCode,
    token,
    hostUrl,
    mobileUrl: buildMobilePairingUrl(mobileBaseUrl, { roomId, hostUrl, tenantPublicKey: publicKey, token, pairingCode, pcTerminalId, phoneTerminalId, expiresAt }),
    createdAt: nowMs,
    expiresAt,
  };
}

export function buildMobilePairingUrl(
  mobileBaseUrl: string,
  params: {
    roomId: string;
    hostUrl: string;
    tenantPublicKey: string;
    token: string;
    pairingCode: string;
    pcTerminalId: string;
    phoneTerminalId: string;
    expiresAt: number;
  },
): string {
  const url = new URL(mobileBaseUrl);
  url.searchParams.set("roomId", params.roomId);
  url.searchParams.set("hostUrl", params.hostUrl);
  url.searchParams.set("tenantPublicKey", params.tenantPublicKey);
  url.searchParams.set("token", params.token);
  url.searchParams.set("code", params.pairingCode);
  url.searchParams.set("pcTerminalId", params.pcTerminalId);
  url.searchParams.set("phoneTerminalId", params.phoneTerminalId);
  url.searchParams.set("expiresAt", String(params.expiresAt));
  return url.toString();
}

export function buildYuanHostConnectionUrl(
  hostUrl: string,
  params: { terminalId: string; hostToken?: string; publicKey?: string; signature?: string },
): string {
  const url = new URL(hostUrl);
  url.searchParams.set("terminal_id", params.terminalId);
  if (params.hostToken) {
    url.searchParams.set("host_token", params.hostToken);
  }
  if (params.publicKey) {
    url.searchParams.set("public_key", params.publicKey);
  }
  if (params.signature) {
    url.searchParams.set("signature", params.signature);
  }
  return url.toString();
}

export function isPairingSessionExpired(session: Pick<DualDevicePairingSession, "expiresAt">, nowMs = Date.now()): boolean {
  return nowMs >= session.expiresAt;
}

export function createDualDeviceMessage({
  type,
  roomId,
  clientId,
  sequence,
  payload = {},
  nowMs = Date.now(),
}: CreateDualDeviceMessageOptions): DualDeviceMessage {
  return { type, roomId, clientId, sequence, sentAt: nowMs, payload };
}

export function createYuanTerminalMessage(
  message: DualDeviceMessage,
  params: { sourceTerminalId: string; targetTerminalId: string; traceId?: string; seqId?: number },
): YuanTerminalMessage {
  return {
    source_terminal_id: params.sourceTerminalId,
    target_terminal_id: params.targetTerminalId,
    trace_id: params.traceId ?? `${message.roomId}-${message.sequence}`,
    seq_id: params.seqId ?? message.sequence,
    method: `DualDevice/${message.type}`,
    req: message,
  };
}

export function encodeYuanWireMessage(message: YuanTerminalMessage): string {
  const headers = {
    target_terminal_id: message.target_terminal_id,
    source_terminal_id: message.source_terminal_id,
  };
  return `${JSON.stringify(headers)}\n${JSON.stringify(message)}`;
}

export function decodeYuanWireMessage(raw: string): YuanTerminalMessage | null {
  const separator = raw.indexOf("\n");
  const body = separator >= 0 ? raw.slice(separator + 1) : raw;
  try {
    const value = JSON.parse(body) as unknown;
    return validateYuanTerminalMessage(value) ? value : null;
  } catch {
    return null;
  }
}

export function extractDualDeviceMessage(message: YuanTerminalMessage): DualDeviceMessage | null {
  if (validateDualDeviceMessage(message.req)) {
    return message.req;
  }
  if (validateDualDeviceMessage(message.event?.payload)) {
    return message.event.payload;
  }
  return null;
}

export function validateDualDeviceMessage(value: unknown): value is DualDeviceMessage {
  if (!isRecord(value)) {
    return false;
  }

  const sequence = value.sequence;
  const sentAt = value.sentAt;

  return (
    isDualDeviceMessageType(value.type) &&
    typeof value.roomId === "string" &&
    value.roomId.length > 0 &&
    typeof value.clientId === "string" &&
    value.clientId.length > 0 &&
    typeof sequence === "number" &&
    Number.isInteger(sequence) &&
    sequence >= 0 &&
    typeof sentAt === "number" &&
    Number.isFinite(sentAt) &&
    isRecord(value.payload)
  );
}

export function validateYuanTerminalMessage(value: unknown): value is YuanTerminalMessage {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.source_terminal_id === "string" &&
    value.source_terminal_id.length > 0 &&
    typeof value.target_terminal_id === "string" &&
    value.target_terminal_id.length > 0 &&
    typeof value.trace_id === "string" &&
    value.trace_id.length > 0 &&
    typeof value.seq_id === "number" &&
    Number.isInteger(value.seq_id)
  );
}

export function shouldEnablePcFallback(status: DualDeviceLinkStatus, nowMs: number): boolean {
  if (status.transport === "offline") {
    return true;
  }

  if (typeof status.lastHeartbeatAt !== "number") {
    return false;
  }

  return nowMs - status.lastHeartbeatAt >= status.fallbackAfterMs;
}

export function getLatencyTarget(plan: DualDeviceDeploymentPlan, label: string): string | undefined {
  return plan.latencyTargets.find((target) => target.label === label)?.target;
}

function healthScore(health: DualDeviceTransportHealth) {
  if (health === "healthy") {
    return 0;
  }
  if (health === "degraded") {
    return 1;
  }
  return 2;
}

function formatTransportReason(candidate: DualDeviceTransportCandidate) {
  const latency = typeof candidate.rttMs === "number" ? `，估计 RTT ${candidate.rttMs}ms` : "";
  if (candidate.kind === "yuan-webrtc-datachannel") {
    return `Yuan WebRTC DataChannel 可用${latency}，优先使用无感升级后的低延迟链路。`;
  }
  if (candidate.kind === "yuan-wss") {
    return `Yuan Host WSS 可用${latency}，作为稳定公网基线和 WebRTC signaling 通道。`;
  }
  return "离线状态，只能使用 PC fallback。";
}

function formatWebRtcUpgradeLabel(health: DualDeviceTransportHealth) {
  if (health === "healthy") {
    return "WebRTC DataChannel 已升级为当前低延迟链路";
  }
  if (health === "degraded") {
    return "enableWebRTC=true，等待局域网候选协商";
  }
  return "enableWebRTC=true，但当前没有可用直连候选";
}

function createRandomBytes(length: number) {
  const bytes = new Uint8Array(length);
  const cryptoApi = (globalThis as typeof globalThis & { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) {
    return cryptoApi.getRandomValues(bytes);
  }

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function isDualDeviceMessageType(value: unknown): value is DualDeviceMessageType {
  return (
    value === "phone.message.read" ||
    value === "phone.message.delivered" ||
    value === "phone.call.incoming" ||
    value === "phone.call.answer" ||
    value === "phone.choice.select" ||
    value === "phone.fallback.enabled" ||
    value === "link.heartbeat" ||
    value === "link.connected"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatToken(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
