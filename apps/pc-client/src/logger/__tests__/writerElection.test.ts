import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  CLAIM_GRACE_MS,
  HEARTBEAT_INTERVAL_MS,
  HOLDER_TIMEOUT_MS,
  type LoggerBroadcastMessage,
} from "../broadcast-protocol";
import {
  type BroadcastChannelLike,
  createWriterElection,
  type WriterRole,
} from "../writerElection";

/**
 * In-memory broker that simulates a real BroadcastChannel: a message posted
 * by one InMemoryChannel is delivered to every other InMemoryChannel sharing
 * the same broker (but never echoed back to the sender).
 */
class InMemoryBroker {
  channels = new Set<InMemoryChannel>();

  broadcast(from: InMemoryChannel, message: LoggerBroadcastMessage): void {
    for (const ch of this.channels) {
      if (ch === from) continue;
      ch.deliver(message);
    }
  }
}

class InMemoryChannel implements BroadcastChannelLike {
  private listeners: Array<(event: MessageEvent<LoggerBroadcastMessage>) => void> = [];

  constructor(private broker: InMemoryBroker) {
    broker.channels.add(this);
  }

  postMessage(message: LoggerBroadcastMessage): void {
    this.broker.broadcast(this, message);
  }

  addEventListener(
    _type: "message",
    listener: (event: MessageEvent<LoggerBroadcastMessage>) => void,
  ): void {
    this.listeners.push(listener);
  }

  removeEventListener(
    _type: "message",
    listener: (event: MessageEvent<LoggerBroadcastMessage>) => void,
  ): void {
    this.listeners = this.listeners.filter((x) => x !== listener);
  }

  close(): void {
    this.broker.channels.delete(this);
  }

  deliver(message: LoggerBroadcastMessage): void {
    for (const listener of this.listeners.slice()) {
      listener({ data: message } as MessageEvent<LoggerBroadcastMessage>);
    }
  }
}

describe("writerElection.createWriterElection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("AC1: 单实例 start 后 claim grace 后变 writer", () => {
    const broker = new InMemoryBroker();
    const ch = new InMemoryChannel(broker);
    const e = createWriterElection({ channel: ch, tabId: "tab-a" });

    e.start();
    expect(e.getRole()).toBe("pending");

    vi.advanceTimersByTime(CLAIM_GRACE_MS + 10);
    expect(e.getRole()).toBe("writer");

    e.stop();
  });

  test("AC2: 两实例共享 channel，恰好一个为 writer，另一个 reader", () => {
    const broker = new InMemoryBroker();
    const chA = new InMemoryChannel(broker);
    const chB = new InMemoryChannel(broker);
    const eA = createWriterElection({ channel: chA, tabId: "aaa" });
    const eB = createWriterElection({ channel: chB, tabId: "zzz" });

    eA.start();
    eB.start();
    vi.advanceTimersByTime(
      CLAIM_GRACE_MS + HEARTBEAT_INTERVAL_MS + HOLDER_TIMEOUT_MS + 100,
    );

    const roles = [eA.getRole(), eB.getRole()];
    expect(roles.filter((r) => r === "writer").length).toBe(1);
    expect(roles.filter((r) => r === "reader").length).toBe(1);

    eA.stop();
    eB.stop();
  });

  test("AC3: writer.stop() 后 reader 晋升 + onRoleChange 通知", () => {
    const broker = new InMemoryBroker();
    const chA = new InMemoryChannel(broker);
    const chB = new InMemoryChannel(broker);
    const eA = createWriterElection({ channel: chA, tabId: "aaa" });
    const eB = createWriterElection({ channel: chB, tabId: "zzz" });

    eA.start();
    eB.start();
    vi.advanceTimersByTime(
      CLAIM_GRACE_MS + HEARTBEAT_INTERVAL_MS + HOLDER_TIMEOUT_MS + 100,
    );
    // eB is writer (字典序大), eA is reader.
    expect(eB.getRole()).toBe("writer");
    expect(eA.getRole()).toBe("reader");

    const aRoleChanges: WriterRole[] = [];
    eA.onRoleChange((r) => aRoleChanges.push(r));

    eB.stop();
    // reader waits holderTimeoutMs, then re-claims and after grace becomes writer.
    vi.advanceTimersByTime(HOLDER_TIMEOUT_MS + CLAIM_GRACE_MS + 50);
    expect(eA.getRole()).toBe("writer");
    expect(aRoleChanges).toContain("writer");

    eA.stop();
  });

  test("AC4: postMessage 抛异常时角色不变 + 不向上抛", () => {
    const broker = new InMemoryBroker();
    const ch = new InMemoryChannel(broker);
    const flakyCh: BroadcastChannelLike = {
      postMessage: vi.fn(() => {
        throw new Error("flaky");
      }),
      addEventListener: ch.addEventListener.bind(ch),
      removeEventListener: ch.removeEventListener.bind(ch),
      close: ch.close.bind(ch),
    };
    const e = createWriterElection({ channel: flakyCh, tabId: "x" });

    expect(() => e.start()).not.toThrow();
    expect(e.getRole()).toBe("pending");

    vi.advanceTimersByTime(CLAIM_GRACE_MS + 10);
    // claim post failed, but timeout still fires → writer.
    expect(e.getRole()).toBe("writer");

    e.stop();
  });

  test("AC5: 多次 start/stop 安全 (idempotent)", () => {
    const broker = new InMemoryBroker();
    const ch = new InMemoryChannel(broker);
    const postSpy = vi.spyOn(ch, "postMessage");
    const e = createWriterElection({ channel: ch, tabId: "x" });

    e.start();
    const claimsAfterFirstStart = postSpy.mock.calls.length;
    e.start(); // second start must be a no-op (no extra claim posted)
    expect(postSpy.mock.calls.length).toBe(claimsAfterFirstStart);

    expect(() => e.stop()).not.toThrow();
    expect(() => e.stop()).not.toThrow();
  });

  test("onRoleChange unsubscribe stops further notifications", () => {
    const broker = new InMemoryBroker();
    const ch = new InMemoryChannel(broker);
    const e = createWriterElection({ channel: ch, tabId: "x" });

    const events: WriterRole[] = [];
    const unsubscribe = e.onRoleChange((r) => events.push(r));

    e.start();
    vi.advanceTimersByTime(CLAIM_GRACE_MS + 10);
    expect(events).toContain("writer");

    unsubscribe();
    const lengthBeforeStop = events.length;
    e.stop();
    // No further notifications after unsubscribe even if state changes internally.
    expect(events.length).toBe(lengthBeforeStop);
  });

  test("listener exception does not block other listeners", () => {
    const broker = new InMemoryBroker();
    const ch = new InMemoryChannel(broker);
    const e = createWriterElection({ channel: ch, tabId: "x" });

    const goodCalls: WriterRole[] = [];
    e.onRoleChange(() => {
      throw new Error("boom");
    });
    e.onRoleChange((r) => goodCalls.push(r));

    e.start();
    vi.advanceTimersByTime(CLAIM_GRACE_MS + 10);
    expect(goodCalls).toContain("writer");

    e.stop();
  });
});
