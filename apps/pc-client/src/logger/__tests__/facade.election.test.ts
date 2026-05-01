import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger } from "../index";
import type { LoggerBroadcastMessage } from "../broadcast-protocol";
import type { BroadcastChannelLike } from "../writerElection";
import type { LogWorkerCommand, LogWorkerEvent } from "../worker-protocol";

/**
 * TASK-015 — facade integrates writerElection.
 *
 * The facade owns the BroadcastChannel: it constructs one per `createLogger`
 * call (or accepts an injected factory for tests), wires it into
 * `createWriterElection`, and reflects the live role through
 * `getStatus().writerRole`.
 *
 * Per the task decision the integration is purely informational — facade does
 * NOT change worker postMessage behavior based on writerRole.
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
  public closed = false;

  constructor(private broker: InMemoryBroker) {
    broker.channels.add(this);
  }

  postMessage(message: LoggerBroadcastMessage): void {
    if (this.closed) return;
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
    this.closed = true;
    this.broker.channels.delete(this);
  }

  deliver(message: LoggerBroadcastMessage): void {
    if (this.closed) return;
    for (const listener of this.listeners.slice()) {
      listener({ data: message } as MessageEvent<LoggerBroadcastMessage>);
    }
  }
}

class MockWorker {
  public posted: LogWorkerCommand[] = [];
  public onmessage: ((e: MessageEvent<LogWorkerEvent>) => void) | null = null;
  public terminated = false;

  postMessage(cmd: LogWorkerCommand): void {
    this.posted.push(cmd);
  }

  emit(event: LogWorkerEvent): void {
    this.onmessage?.({ data: event } as MessageEvent<LogWorkerEvent>);
  }

  terminate(): void {
    this.terminated = true;
  }
}

const FIXED_NOW = new Date("2026-05-01T02:44:00.000Z");
const FIXED_RUN_ID = "run-2026-05-01-0244-test";

describe("logger facade — TASK-015 writer election integration", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("AC1: 第二个 facade 实例（共享 channel）启动后恰好一个 writer + 一个 reader", () => {
    const broker = new InMemoryBroker();
    const w1 = new MockWorker();
    const w2 = new MockWorker();

    const lg1 = createLogger({
      workerFactory: () => w1 as unknown as Worker,
      initialRunId: `${FIXED_RUN_ID}-a`,
      now: () => FIXED_NOW,
      electionChannelFactory: () => new InMemoryChannel(broker),
      electionTabId: "aaa",
    });
    const lg2 = createLogger({
      workerFactory: () => w2 as unknown as Worker,
      initialRunId: `${FIXED_RUN_ID}-b`,
      now: () => FIXED_NOW,
      electionChannelFactory: () => new InMemoryChannel(broker),
      electionTabId: "zzz",
    });

    // Allow claim grace + a heartbeat cycle to pass so contention settles.
    vi.advanceTimersByTime(1500);

    const roles = [lg1.getStatus().writerRole, lg2.getStatus().writerRole];
    expect(roles.filter((r) => r === "writer").length).toBe(1);
    expect(roles.filter((r) => r === "reader").length).toBe(1);

    lg1._stop?.();
    lg2._stop?.();
  });

  it("AC2: writer 实例 _stop() 后 reader 在 holderTimeout + claimGrace 内升级为 writer", () => {
    const broker = new InMemoryBroker();
    const w1 = new MockWorker();
    const w2 = new MockWorker();

    const lg1 = createLogger({
      workerFactory: () => w1 as unknown as Worker,
      initialRunId: `${FIXED_RUN_ID}-a`,
      now: () => FIXED_NOW,
      electionChannelFactory: () => new InMemoryChannel(broker),
      electionTabId: "aaa",
    });
    const lg2 = createLogger({
      workerFactory: () => w2 as unknown as Worker,
      initialRunId: `${FIXED_RUN_ID}-b`,
      now: () => FIXED_NOW,
      electionChannelFactory: () => new InMemoryChannel(broker),
      electionTabId: "zzz",
    });

    vi.advanceTimersByTime(1500);
    // Larger-id (zzz) wins; smaller-id (aaa) becomes reader.
    expect(lg2.getStatus().writerRole).toBe("writer");
    expect(lg1.getStatus().writerRole).toBe("reader");

    lg2._stop?.();
    // holderTimeout (2500ms) + claimGrace (200ms) + a margin.
    vi.advanceTimersByTime(2500 + 200 + 50);
    expect(lg1.getStatus().writerRole).toBe("writer");

    lg1._stop?.();
  });

  it("AC4: electionChannelFactory 返回 null → writerRole 永远为 'writer'，facade 仍正常工作", () => {
    const w = new MockWorker();
    const lg = createLogger({
      workerFactory: () => w as unknown as Worker,
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
      electionChannelFactory: () => null,
    });

    expect(lg.getStatus().writerRole).toBe("writer");

    // Worker still gets `init` immediately and behaves normally.
    expect(w.posted[0]).toEqual({ kind: "init", runId: FIXED_RUN_ID });
    w.emit({ kind: "ready", runId: FIXED_RUN_ID });
    expect(lg.getStatus().mode).toBe("ok");

    vi.advanceTimersByTime(5000);
    expect(lg.getStatus().writerRole).toBe("writer");

    lg._stop?.();
  });

  it("AC3 supplement: 当 election 注入但只有单实例时，最终仍为 'writer'（保证 LogPanel banner 不误显示）", () => {
    const broker = new InMemoryBroker();
    const w = new MockWorker();
    const lg = createLogger({
      workerFactory: () => w as unknown as Worker,
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
      electionChannelFactory: () => new InMemoryChannel(broker),
      electionTabId: "solo",
    });

    // Allow claim grace to pass.
    vi.advanceTimersByTime(500);
    expect(lg.getStatus().writerRole).toBe("writer");

    lg._stop?.();
  });

  it("_stop closes the injected election channel", () => {
    const broker = new InMemoryBroker();
    const ch = new InMemoryChannel(broker);
    const w = new MockWorker();
    const lg = createLogger({
      workerFactory: () => w as unknown as Worker,
      initialRunId: FIXED_RUN_ID,
      now: () => FIXED_NOW,
      electionChannelFactory: () => ch,
      electionTabId: "solo",
    });

    vi.advanceTimersByTime(500);
    expect(ch.closed).toBe(false);

    lg._stop?.();
    expect(ch.closed).toBe(true);
  });
});
