import { describe, expect, it } from "vitest";
import {
  buildRelayJoinUrl,
  createDualDeviceMessage,
  createPairingCode,
  createPairingSession,
  formatPairingCode,
  getLatencyTarget,
  isPairingSessionExpired,
  paidMainlandHybridPlan,
  selectPreferredTransport,
  shouldEnablePcFallback,
  validateDualDeviceMessage,
} from "./index.js";

describe("dual-device protocol", () => {
  it("selects LAN before the mainland relay when both are healthy", () => {
    const selection = selectPreferredTransport([
      { kind: "mainland-relay", health: "healthy", rttMs: 60 },
      { kind: "lan-websocket", health: "healthy", rttMs: 12 },
    ]);

    expect(selection.selected).toBe("lan-websocket");
    expect(selection.fallback).toBe("mainland-relay");
  });

  it("falls back to the mainland relay when LAN is unavailable", () => {
    const selection = selectPreferredTransport([
      { kind: "lan-websocket", health: "unavailable" },
      { kind: "mainland-relay", health: "healthy", rttMs: 80 },
    ]);

    expect(selection.selected).toBe("mainland-relay");
  });

  it("formats pairing codes without ambiguous characters", () => {
    expect(formatPairingCode(new Uint8Array([0, 1, 2, 3, 4, 5]))).toBe("ABCDEF");
    expect(createPairingCode(() => new Uint8Array([10, 11, 12, 13, 14, 15]))).toHaveLength(6);
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

  it("creates short-lived pairing sessions with mobile and relay URLs", () => {
    const randomInputs = [new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), new Uint8Array(16).fill(15)];
    const session = createPairingSession({
      nowMs: 1000,
      relayUrl: "wss://relay.example.test/relay",
      mobileBaseUrl: "https://game.example.test/mobile",
      randomBytes: () => randomInputs.shift() ?? new Uint8Array(16),
    });

    expect(session.pairingCode).toBe("ABCDEF");
    expect(session.roomId).toBe("sf-000102030405");
    expect(session.token).toBe("0f".repeat(16));
    expect(session.expiresAt).toBe(301000);
    expect(session.mobileUrl).toContain("roomId=sf-000102030405");
    expect(session.mobileUrl).toContain("code=ABCDEF");
    expect(buildRelayJoinUrl(session.relayUrl, { roomId: session.roomId, clientId: "pc-host", role: "pc", token: session.token })).toContain(
      "role=pc",
    );
    expect(isPairingSessionExpired(session, 300999)).toBe(false);
    expect(isPairingSessionExpired(session, 301000)).toBe(true);
  });

  it("creates PC-authored private signal messages", () => {
    expect(
      createDualDeviceMessage({
        type: "phone.call.incoming",
        roomId: "room-1",
        clientId: "pc-host",
        sequence: 2,
        nowMs: 2000,
        payload: { title: "私密来电" },
      }),
    ).toEqual({ type: "phone.call.incoming", roomId: "room-1", clientId: "pc-host", sequence: 2, sentAt: 2000, payload: { title: "私密来电" } });
  });

  it("enables PC fallback after heartbeat timeout", () => {
    expect(shouldEnablePcFallback({ transport: "mainland-relay", lastHeartbeatAt: 1000, fallbackAfterMs: 5000 }, 7000)).toBe(true);
    expect(shouldEnablePcFallback({ transport: "mainland-relay", lastHeartbeatAt: 1000, fallbackAfterMs: 5000 }, 3000)).toBe(false);
    expect(shouldEnablePcFallback({ transport: "offline", fallbackAfterMs: 5000 }, 3000)).toBe(true);
  });

  it("documents the stable mainland deployment target", () => {
    expect(paidMainlandHybridPlan.projects.map((project) => project.folder)).toEqual([
      "apps/pc-client",
      "apps/mobile-client",
      "apps/relay-server",
      "packages/protocol",
    ]);
    expect(getLatencyTarget(paidMainlandHybridPlan, "同区域国内 relay RTT")).toBe("20-80ms");
  });
});
