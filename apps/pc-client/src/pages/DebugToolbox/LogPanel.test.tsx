import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { LogPanel } from "./LogPanel";
import type { LoggerFacade, LogStatus } from "../../logger";
import type { LogEntry, LogSource } from "../../logger/types";

function makeMockFacade(initial: Partial<LogStatus> = {}): LoggerFacade {
  const status: LogStatus = {
    mode: "ok",
    writerRole: "writer",
    ...initial,
  };
  return {
    log: vi.fn(),
    flush: vi.fn(async () => {}),
    subscribe: vi.fn(() => () => {}),
    getCurrentRunId: vi.fn(() => "run-test"),
    getRingBufferSnapshot: vi.fn(() => []),
    getStatus: vi.fn(() => status),
    rotate: vi.fn(async () => "run-new"),
    listRuns: vi.fn(async () => []),
    readRun: vi.fn(async () => new ArrayBuffer(0)),
    deleteRun: vi.fn(async () => {}),
    exportCurrent: vi.fn(async () => {}),
    exportRun: vi.fn(async () => {}),
  };
}

interface MakeEntrySpec {
  type: string;
  source: LogSource;
  seq: number;
  runId?: string;
  payload?: unknown;
  occurredAtRealTime?: string;
}

/**
 * Build a fully-shaped LogEntry for tests. The `LogEntry` discriminated union is
 * narrowed by `(type, source, payload)`; tests only care about a few fields, so
 * we produce a generic envelope and cast.
 */
function makeEntry(spec: MakeEntrySpec): LogEntry {
  return {
    seq: spec.seq,
    log_version: 1,
    game_version: "test",
    run_id: spec.runId ?? "run-test",
    occurred_at_game_seconds: 0,
    occurred_at_real_time: spec.occurredAtRealTime ?? "2026-05-01T02:44:33.000Z",
    type: spec.type,
    source: spec.source,
    payload: spec.payload ?? {},
  } as unknown as LogEntry;
}

function makeEntries(specs: MakeEntrySpec[]): LogEntry[] {
  return specs.map(makeEntry);
}

describe("LogPanel — TASK-011 骨架", () => {
  it("AC1：渲染 Panel 标题为 '游戏日志'", () => {
    render(<LogPanel facade={makeMockFacade()} />);
    expect(screen.getByText("游戏日志")).toBeInTheDocument();
  });

  it("AC2：显示 '实时' 与 '历史' 两个 mode 按钮，默认 '实时' 高亮", async () => {
    render(<LogPanel facade={makeMockFacade()} />);
    const realtime = screen.getByRole("button", { name: "实时" });
    const archive = screen.getByRole("button", { name: "历史" });
    expect(realtime.className).toContain("primary-button");
    expect(archive.className).toContain("secondary-button");
    await userEvent.click(archive);
    expect(realtime.className).toContain("secondary-button");
    expect(archive.className).toContain("primary-button");
  });

  it("AC3 OPFS 红色横幅：mode='memory_only' 时显示", () => {
    const facade = makeMockFacade({ mode: "memory_only", reason: "opfs_unavailable" });
    render(<LogPanel facade={facade} />);
    const banner = screen.getByRole("alert");
    expect(banner.textContent).toMatch(/OPFS 不可用/);
  });

  it("AC3 OPFS 横幅：mode='ok' 时不显示", () => {
    const facade = makeMockFacade({ mode: "ok" });
    render(<LogPanel facade={facade} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("AC4：type 过滤输入框 + source 下拉渲染并响应 onChange", async () => {
    render(<LogPanel facade={makeMockFacade()} />);
    const typeInput = screen.getByLabelText<HTMLInputElement>("type 过滤");
    await userEvent.type(typeInput, "event.");
    expect(typeInput.value).toBe("event.");

    const sourceSelect = screen.getByLabelText<HTMLSelectElement>("source 过滤");
    await userEvent.selectOptions(sourceSelect, "player_command");
    expect(sourceSelect.value).toBe("player_command");
  });

  it("订阅 logger 在 mount 时调用一次，unmount 时调用 unsubscribe", () => {
    const unsubscribe = vi.fn();
    const facade = makeMockFacade();
    facade.subscribe = vi.fn(() => unsubscribe);
    const { unmount } = render(<LogPanel facade={facade} />);
    expect(facade.subscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("导出按钮在 mode='memory_only' 时 disabled + tooltip", () => {
    const facade = makeMockFacade({ mode: "memory_only" });
    render(<LogPanel facade={facade} />);
    const button = screen.getByRole("button", { name: "导出当前 run" });
    expect(button).toBeDisabled();
    expect(button.getAttribute("title")).toMatch(/OPFS 不可用/);
  });
});

describe("LogPanel — TASK-012 tail + filter", () => {
  it("AC1：getRingBufferSnapshot 返回 5 条不同 type 的条目按 seq 升序渲染", () => {
    const entries = makeEntries([
      { type: "system.run.start", source: "system", seq: 1 },
      { type: "player.call.choice", source: "player_command", seq: 2 },
      { type: "event.trigger", source: "event_engine", seq: 3 },
      { type: "event.node.enter", source: "event_engine", seq: 4 },
      { type: "event.resolved", source: "event_engine", seq: 5 },
    ]);
    const facade = makeMockFacade();
    facade.getRingBufferSnapshot = vi.fn(() => entries);
    render(<LogPanel facade={facade} />);

    const list = screen.getByLabelText("日志列表");
    const rows = list.querySelectorAll(".log-panel-row");
    expect(rows.length).toBe(5);
    expect(rows[0].textContent).toContain("#1");
    expect(rows[1].textContent).toContain("#2");
    expect(rows[2].textContent).toContain("#3");
    expect(rows[3].textContent).toContain("#4");
    expect(rows[4].textContent).toContain("#5");
  });

  it("AC1：subscribe push 1 条新条目立即出现", () => {
    let listener: ((d: { entries: LogEntry[] }) => void) | undefined;
    const facade = makeMockFacade();
    facade.getRingBufferSnapshot = vi.fn(() => []);
    facade.subscribe = vi.fn((cb) => {
      listener = cb;
      return () => {};
    });
    render(<LogPanel facade={facade} />);
    expect(listener).toBeDefined();

    act(() => {
      listener!({
        entries: [
          makeEntry({ type: "player.call.choice", source: "player_command", seq: 1 }),
        ],
      });
    });
    const list = screen.getByLabelText("日志列表");
    const rows = list.querySelectorAll(".log-panel-row");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("#1");
    expect(rows[0].getAttribute("data-type")).toBe("player.call.choice");
  });

  it("AC2：type 前缀过滤 + 删除过滤恢复全部", async () => {
    const user = userEvent.setup();
    const facade = makeMockFacade();
    facade.getRingBufferSnapshot = vi.fn(() =>
      makeEntries([
        { type: "system.run.start", source: "system", seq: 1 },
        { type: "event.trigger", source: "event_engine", seq: 2 },
        { type: "event.node.enter", source: "event_engine", seq: 3 },
      ]),
    );
    render(<LogPanel facade={facade} />);

    const list = screen.getByLabelText("日志列表");
    expect(list.querySelectorAll(".log-panel-row").length).toBe(3);

    await user.type(screen.getByLabelText("type 过滤"), "event.");
    const filtered = list.querySelectorAll(".log-panel-row");
    expect(filtered.length).toBe(2);
    expect(filtered[0].getAttribute("data-type")).toBe("event.trigger");
    expect(filtered[1].getAttribute("data-type")).toBe("event.node.enter");

    await user.clear(screen.getByLabelText("type 过滤"));
    expect(list.querySelectorAll(".log-panel-row").length).toBe(3);
  });

  it("AC3：source 下拉过滤 + 与 type 同时生效", async () => {
    const user = userEvent.setup();
    const facade = makeMockFacade();
    facade.getRingBufferSnapshot = vi.fn(() =>
      makeEntries([
        { type: "system.run.start", source: "system", seq: 1 },
        { type: "player.call.choice", source: "player_command", seq: 2 },
        { type: "player.move.target", source: "player_command", seq: 3 },
        { type: "event.trigger", source: "event_engine", seq: 4 },
        { type: "event.node.enter", source: "event_engine", seq: 5 },
      ]),
    );
    render(<LogPanel facade={facade} />);
    const list = screen.getByLabelText("日志列表");

    // source=player_command alone → only player.* entries (2 rows).
    await user.selectOptions(screen.getByLabelText("source 过滤"), "player_command");
    const onlyPlayer = list.querySelectorAll(".log-panel-row");
    expect(onlyPlayer.length).toBe(2);
    expect(onlyPlayer[0].getAttribute("data-source")).toBe("player_command");
    expect(onlyPlayer[1].getAttribute("data-source")).toBe("player_command");

    // type="event." + source="event_engine" → only event.* entries (2 rows).
    await user.selectOptions(screen.getByLabelText("source 过滤"), "event_engine");
    await user.type(screen.getByLabelText("type 过滤"), "event.");
    const both = list.querySelectorAll(".log-panel-row");
    expect(both.length).toBe(2);
    expect(both[0].getAttribute("data-type")).toBe("event.trigger");
    expect(both[1].getAttribute("data-type")).toBe("event.node.enter");
  });

  // Rendering 2000 rows in jsdom + React 19 is heavy; bump the per-test
  // timeout so the case stays green when the suite runs under parallel
  // contention. The cap behaviour itself is the only thing being asserted.
  it(
    "AC4：超出 ENTRY_CAP=2000 时只保留最后 2000 条",
    () => {
      let listener: ((d: { entries: LogEntry[] }) => void) | undefined;
      const facade = makeMockFacade();
      // Initial snapshot: 1500 entries.
      const initial = Array.from({ length: 1500 }, (_, i) =>
        makeEntry({ type: "event.trigger", source: "event_engine", seq: i + 1 }),
      );
      facade.getRingBufferSnapshot = vi.fn(() => initial);
      facade.subscribe = vi.fn((cb) => {
        listener = cb;
        return () => {};
      });
      render(<LogPanel facade={facade} />);

      // Push another 600 → total in-state would be 2100, must cap at 2000.
      const delta = Array.from({ length: 600 }, (_, i) =>
        makeEntry({ type: "event.trigger", source: "event_engine", seq: 1500 + i + 1 }),
      );
      act(() => {
        listener!({ entries: delta });
      });

      const list = screen.getByLabelText("日志列表");
      const rows = list.querySelectorAll(".log-panel-row");
      expect(rows.length).toBe(2000);
      // The oldest 100 entries (seq 1..100) should have been dropped; first row
      // should be seq=101 and last should be seq=2100.
      expect(rows[0].textContent).toContain("#101");
      expect(rows[rows.length - 1].textContent).toContain("#2100");
    },
    20_000,
  );

  it("payload 单行预览限长 200 字符 + '...'", () => {
    const longPayload = { text: "a".repeat(500) };
    const facade = makeMockFacade();
    facade.getRingBufferSnapshot = vi.fn(() => [
      makeEntry({
        type: "event.trigger",
        source: "event_engine",
        seq: 1,
        payload: longPayload,
      }),
    ]);
    render(<LogPanel facade={facade} />);
    const list = screen.getByLabelText("日志列表");
    const payloadCell = list.querySelector(".log-panel-payload");
    expect(payloadCell).not.toBeNull();
    const text = payloadCell!.textContent ?? "";
    expect(text.length).toBeLessThanOrEqual(200);
    expect(text.endsWith("...")).toBe(true);
  });

  it("HH:MM:SS 时间渲染来自 occurred_at_real_time", () => {
    const facade = makeMockFacade();
    facade.getRingBufferSnapshot = vi.fn(() => [
      makeEntry({
        type: "event.trigger",
        source: "event_engine",
        seq: 1,
        occurredAtRealTime: "2026-05-01T13:14:15.678Z",
      }),
    ]);
    render(<LogPanel facade={facade} />);
    const list = screen.getByLabelText("日志列表");
    const timeCell = list.querySelector(".log-panel-time");
    expect(timeCell?.textContent).toBe("13:14:15");
  });

  it("空列表 + 无过滤 → 显示 '暂无日志'", () => {
    const facade = makeMockFacade();
    facade.getRingBufferSnapshot = vi.fn(() => []);
    render(<LogPanel facade={facade} />);
    const list = screen.getByLabelText("日志列表");
    expect(list.textContent).toMatch(/暂无日志/);
    expect(list.textContent).not.toMatch(/过滤后无匹配/);
  });

  it("空列表 + 有过滤 → 提示过滤后无匹配", async () => {
    const user = userEvent.setup();
    const facade = makeMockFacade();
    facade.getRingBufferSnapshot = vi.fn(() =>
      makeEntries([{ type: "system.run.start", source: "system", seq: 1 }]),
    );
    render(<LogPanel facade={facade} />);
    await user.type(screen.getByLabelText("type 过滤"), "event.");
    const list = screen.getByLabelText("日志列表");
    expect(list.textContent).toMatch(/过滤后无匹配/);
  });

  it("archive mode 显示 placeholder 不渲染列表", async () => {
    const user = userEvent.setup();
    const facade = makeMockFacade();
    facade.getRingBufferSnapshot = vi.fn(() =>
      makeEntries([{ type: "system.run.start", source: "system", seq: 1 }]),
    );
    render(<LogPanel facade={facade} />);
    await user.click(screen.getByRole("button", { name: "历史" }));
    expect(screen.getByText(/历史 run 列表将在 TASK-018 接入/)).toBeInTheDocument();
    // current-mode list is not rendered while in archive mode.
    expect(screen.queryByLabelText("日志列表")).toBeNull();
  });
});
