import { describe, expect, it } from "vitest";
import {
  buildYuanHostConnectionUrl,
  createDualDeviceMessage,
  createPairingCode,
  createPairingSession,
  createYuanTerminalMessage,
  describeYuanRealtimeLink,
  decodeYuanWireMessage,
  encodeYuanWireMessage,
  extractDualDeviceMessage,
  formatPairingCode,
  getLatencyTarget,
  isPairingSessionExpired,
  selectPreferredTransport,
  shouldEnablePcFallback,
  validateDualDeviceMessage,
  yuanBackedDualDevicePlan,
} from "./index.js";

describe("Yuan-backed dual-device business layer", () => {
  it("selects Yuan WebRTC before Yuan WSS when both are healthy", () => {
    const selection = selectPreferredTransport([
      { kind: "yuan-wss", health: "healthy", rttMs: 60 },
      { kind: "yuan-webrtc-datachannel", health: "healthy", rttMs: 12 },
    ]);

    expect(selection.selected).toBe("yuan-webrtc-datachannel");
    expect(selection.fallback).toBe("yuan-wss");
  });

  it("falls back to Yuan WSS when WebRTC is unavailable", () => {
    const selection = selectPreferredTransport([
      { kind: "yuan-webrtc-datachannel", health: "unavailable" },
      { kind: "yuan-wss", health: "healthy", rttMs: 80 },
    ]);

    expect(selection.selected).toBe("yuan-wss");
  });

  it("keeps WebRTC as a LAN upgrade and WSS as the public fallback", () => {
    const presentation = describeYuanRealtimeLink([
      { kind: "yuan-webrtc-datachannel", health: "degraded" },
      { kind: "yuan-wss", health: "healthy", rttMs: 80 },
    ]);

    expect(presentation.current).toBe("yuan-wss");
    expect(presentation.webRtcUpgrade).toMatchObject({ kind: "yuan-webrtc-datachannel", enabled: true, health: "degraded" });
    expect(presentation.webRtcUpgrade.label).toContain("enableWebRTC=true");
    expect(presentation.publicFallback).toMatchObject({ kind: "yuan-wss", health: "healthy" });
    expect(presentation.publicFallback.label).toContain("公网兜底");
  });

  it("formats pairing codes without ambiguous characters", () => {
    expect(formatPairingCode(new Uint8Array([0, 1, 2, 3, 4, 5]))).toBe("ABCDEF");
    expect(createPairingCode(() => new Uint8Array([10, 11, 12, 13, 14, 15]))).toHaveLength(6);
  });

  it("creates Yuan host-backed pairing sessions", () => {
    const randomInputs = [new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), new Uint8Array(16).fill(15)];
    const session = createPairingSession({
      nowMs: 1000,
      hostUrl: "wss://yuan.example.test/host",
      mobileBaseUrl: "https://game.example.test/mobile",
      tenantPublicKey: "tenant-pubkey",
      randomBytes: () => randomInputs.shift() ?? new Uint8Array(16),
    });

    expect(session.roomId).toBe("sf-000102030405");
    expect(session.hostId).toBe("tenant-pubkey");
    expect(session.pcTerminalId).toBe("stellar-pc-abcdef");
    expect(session.phoneTerminalId).toBe("stellar-phone-abcdef");
    expect(session.mobileUrl).toContain("hostUrl=wss%3A%2F%2Fyuan.example.test%2Fhost");
    expect(session.mobileUrl).toContain("tenantPublicKey=tenant-pubkey");
    expect(buildYuanHostConnectionUrl(session.hostUrl, { terminalId: session.pcTerminalId, hostToken: session.token })).toContain("terminal_id=stellar-pc-abcdef");
    expect(isPairingSessionExpired(session, 300999)).toBe(false);
    expect(isPairingSessionExpired(session, 301000)).toBe(true);
  });

  it("wraps DualDeviceMessage inside a Yuan terminal wire message", () => {
    const dualMessage = createDualDeviceMessage({
      type: "phone.call.incoming",
      roomId: "room-1",
      clientId: "stellar-pc-host",
      sequence: 2,
      nowMs: 2000,
      payload: { title: "私密来电" },
    });
    const yuanMessage = createYuanTerminalMessage(dualMessage, {
      sourceTerminalId: "stellar-pc-host",
      targetTerminalId: "stellar-phone-abcdef",
    });

    expect(yuanMessage.method).toBe("DualDevice/phone.call.incoming");
    expect(extractDualDeviceMessage(yuanMessage)).toEqual(dualMessage);
    expect(decodeYuanWireMessage(encodeYuanWireMessage(yuanMessage))).toEqual(yuanMessage);
  });

  it("validates small typed messages and rejects malformed input", () => {
    expect(
      validateDualDeviceMessage({
        type: "phone.message.read",
        roomId: "room-1",
        clientId: "phone-1",
        sequence: 1,
        sentAt: 1000,
        payload: { messageId: "m1" },
      }),
    ).toBe(true);
    expect(validateDualDeviceMessage({ type: "phone.message.read", roomId: "room-1" })).toBe(false);
  });

  it("enables PC fallback after heartbeat timeout", () => {
    expect(shouldEnablePcFallback({ transport: "yuan-wss", lastHeartbeatAt: 1000, fallbackAfterMs: 5000 }, 7000)).toBe(true);
    expect(shouldEnablePcFallback({ transport: "yuan-wss", lastHeartbeatAt: 1000, fallbackAfterMs: 5000 }, 3000)).toBe(false);
    expect(shouldEnablePcFallback({ transport: "offline", fallbackAfterMs: 5000 }, 3000)).toBe(true);
  });

  it("documents Yuan Host as external infrastructure, not a Stellar server package", () => {
    expect(yuanBackedDualDevicePlan.projects.map((project) => project.folder)).toEqual([
      "apps/pc-client",
      "apps/mobile-client",
      "packages/dual-device",
      "external: No-Trade-No-Life/Yuan apps/host",
    ]);
    expect(getLatencyTarget(yuanBackedDualDevicePlan, "Yuan WSS Host RTT")).toBe("同区域 20-80ms，跨区域 <150ms");
  });
});
