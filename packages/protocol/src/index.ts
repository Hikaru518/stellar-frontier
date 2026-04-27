export type DualDeviceTransportKind = "lan-websocket" | "mainland-relay" | "webrtc-datachannel" | "offline";

export type DualDeviceTransportHealth = "healthy" | "degraded" | "unavailable";

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

export interface DualDeviceLinkStatus {
  transport: DualDeviceTransportKind;
  lastHeartbeatAt?: number;
  fallbackAfterMs: number;
}

export interface DualDevicePairingSession {
  roomId: string;
  pcClientId: string;
  pairingCode: string;
  token: string;
  relayUrl: string;
  mobileUrl: string;
  createdAt: number;
  expiresAt: number;
}

export interface CreatePairingSessionOptions {
  nowMs?: number;
  expiresInMs?: number;
  relayUrl: string;
  mobileBaseUrl: string;
  pcClientId?: string;
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
  "lan-websocket": 0,
  "mainland-relay": 1,
  "webrtc-datachannel": 2,
  offline: 99,
};

const PAIRING_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;

export const paidMainlandHybridPlan: DualDeviceDeploymentPlan = {
  name: "Paid Mainland Hybrid",
  summary: "中国内地 WSS relay 提供稳定公网基线，同网时优先 LAN WebSocket，PC 始终持有权威 GameState。",
  projects: [
    { name: "PC client", folder: "apps/pc-client", responsibility: "权威游戏状态、配对入口、fallback UI 与 PC 端通讯台。" },
    { name: "Mobile client", folder: "apps/mobile-client", responsibility: "扫码进入的私人通讯终端，只展示派生状态并发送 typed events。" },
    { name: "Relay server", folder: "apps/relay-server", responsibility: "中国内地 WSS room broker、短期 token、心跳与消息中转。" },
    { name: "Protocol", folder: "packages/protocol", responsibility: "三端共享的消息 envelope、传输选择和配对规则。" },
  ],
  transportPriority: ["lan-websocket", "mainland-relay", "webrtc-datachannel", "offline"],
  latencyTargets: [
    { label: "手机本地反馈", target: "<50ms" },
    { label: "LAN WebSocket RTT", target: "<30ms" },
    { label: "同区域国内 relay RTT", target: "20-80ms" },
    { label: "跨区域国内 relay RTT", target: "<150ms" },
  ],
  rollout: ["Rush monorepo scaffold", "协议模型与 UI 入口", "单区域国内 WSS relay", "LAN direct", "多地域 relay hardening"],
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
    return { selected: "offline", fallback: "offline", reason: "没有可用链路，必须启用 PC fallback。" };
  }

  const fallback = available.find((candidate) => candidate.kind !== selected.kind)?.kind ?? "offline";
  return {
    selected: selected.kind,
    fallback,
    reason: selected.reason ?? formatTransportReason(selected),
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
  relayUrl,
  mobileBaseUrl,
  pcClientId = "pc-host",
  randomBytes = createRandomBytes,
}: CreatePairingSessionOptions): DualDevicePairingSession {
  const roomEntropy = randomBytes(10);
  const tokenEntropy = randomBytes(16);
  const pairingCode = formatPairingCode(roomEntropy);
  const roomId = `sf-${formatToken(roomEntropy).slice(0, 12)}`;
  const token = formatToken(tokenEntropy);
  const expiresAt = nowMs + expiresInMs;

  return {
    roomId,
    pcClientId,
    pairingCode,
    token,
    relayUrl,
    mobileUrl: buildMobilePairingUrl(mobileBaseUrl, { roomId, token, pairingCode, relayUrl }),
    createdAt: nowMs,
    expiresAt,
  };
}

export function buildMobilePairingUrl(
  mobileBaseUrl: string,
  params: { roomId: string; token: string; pairingCode: string; relayUrl: string },
): string {
  const url = new URL(mobileBaseUrl);
  url.searchParams.set("roomId", params.roomId);
  url.searchParams.set("token", params.token);
  url.searchParams.set("code", params.pairingCode);
  url.searchParams.set("relayUrl", params.relayUrl);
  return url.toString();
}

export function buildRelayJoinUrl(relayUrl: string, params: { roomId: string; clientId: string; role: "pc" | "phone"; token: string }): string {
  const url = new URL(relayUrl);
  url.searchParams.set("roomId", params.roomId);
  url.searchParams.set("clientId", params.clientId);
  url.searchParams.set("role", params.role);
  url.searchParams.set("token", params.token);
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
  if (candidate.kind === "lan-websocket") {
    return `同一局域网直连可用${latency}，优先使用最低延迟链路。`;
  }
  if (candidate.kind === "mainland-relay") {
    return `国内 WSS relay 可用${latency}，作为稳定公网基线。`;
  }
  if (candidate.kind === "webrtc-datachannel") {
    return `WebRTC DataChannel 可用${latency}，作为机会性直连优化。`;
  }
  return "离线状态，只能使用 PC fallback。";
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
