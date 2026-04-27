import { describe, expect, it, vi } from "vitest";
import { createRelayRoomRegistry, parseRelayJoinRequest } from "./index.js";
import type { DualDeviceMessage } from "@stellar-frontier/protocol";

describe("relay room registry", () => {
  it("parses valid join URLs and rejects missing role data", () => {
    expect(parseRelayJoinRequest("/relay?roomId=alpha&clientId=pc-1&role=pc")).toEqual({ roomId: "alpha", clientId: "pc-1", role: "pc" });
    expect(parseRelayJoinRequest("/relay?roomId=alpha&clientId=phone-1")).toBeNull();
    expect(parseRelayJoinRequest("/relay?roomId=alpha&clientId=tablet-1&role=tablet")).toBeNull();
  });

  it("broadcasts room messages to peers but not the sender", () => {
    const registry = createRelayRoomRegistry();
    const pcSend = vi.fn();
    const phoneSend = vi.fn();

    registry.join({ roomId: "alpha", clientId: "pc-1", role: "pc", send: pcSend });
    registry.join({ roomId: "alpha", clientId: "phone-1", role: "phone", send: phoneSend });

    const message: DualDeviceMessage = {
      type: "phone.message.read",
      roomId: "alpha",
      clientId: "phone-1",
      sequence: 1,
      sentAt: 100,
      payload: { messageId: "m1" },
    };

    expect(registry.broadcast(message)).toBe(1);
    expect(pcSend).toHaveBeenCalledWith(JSON.stringify(message));
    expect(phoneSend).not.toHaveBeenCalled();
  });

  it("removes empty rooms after clients leave", () => {
    const registry = createRelayRoomRegistry();
    const client = { roomId: "alpha", clientId: "pc-1", role: "pc" as const, send: vi.fn() };

    registry.join(client);
    expect(registry.snapshot()).toHaveLength(1);

    registry.leave(client);
    expect(registry.snapshot()).toEqual([]);
  });
});
