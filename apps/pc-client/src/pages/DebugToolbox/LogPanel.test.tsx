import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
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

  it("archive mode 不渲染 current 列表", async () => {
    const user = userEvent.setup();
    const facade = makeMockFacade();
    facade.getRingBufferSnapshot = vi.fn(() =>
      makeEntries([{ type: "system.run.start", source: "system", seq: 1 }]),
    );
    render(<LogPanel facade={facade} />);
    await user.click(screen.getByRole("button", { name: "历史" }));
    // current-mode list is not rendered while in archive mode (TASK-018:
    // archive mode now shows the historical run list instead of a placeholder,
    // but the `日志列表` aria-label is still owned by current mode only).
    expect(screen.queryByLabelText("日志列表")).toBeNull();
  });
});

describe("LogPanel — TASK-013 导出当前 run", () => {
  it("AC1：点击导出 → flush + exportCurrent 顺序调用，按钮 await 期间 disabled", async () => {
    let flushResolve: (() => void) | undefined;
    let exportResolve: (() => void) | undefined;
    const facade = makeMockFacade();
    facade.flush = vi.fn(
      () =>
        new Promise<void>((r) => {
          flushResolve = r;
        }),
    );
    facade.exportCurrent = vi.fn(
      () =>
        new Promise<void>((r) => {
          exportResolve = r;
        }),
    );
    render(<LogPanel facade={facade} />);
    const btn = screen.getByRole("button", { name: "导出当前 run" });
    expect(btn).not.toBeDisabled();
    await userEvent.click(btn);
    expect(facade.flush).toHaveBeenCalledTimes(1);
    expect(btn).toBeDisabled();
    expect(facade.exportCurrent).not.toHaveBeenCalled(); // still awaiting flush
    act(() => {
      flushResolve!();
    });
    await waitFor(() => expect(facade.exportCurrent).toHaveBeenCalledTimes(1));
    expect(btn).toBeDisabled();
    act(() => {
      exportResolve!();
    });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it("AC2：mode=memory_only 时按钮 disabled，点击不触发 flush/exportCurrent", async () => {
    const facade = makeMockFacade({ mode: "memory_only" });
    facade.flush = vi.fn(async () => {});
    facade.exportCurrent = vi.fn(async () => {});
    render(<LogPanel facade={facade} />);
    const btn = screen.getByRole("button", { name: "导出当前 run" });
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toMatch(/OPFS/);
    await userEvent.click(btn);
    expect(facade.flush).not.toHaveBeenCalled();
    expect(facade.exportCurrent).not.toHaveBeenCalled();
  });

  it("AC3：exportCurrent reject 后按钮恢复 enabled，错误文案显示", async () => {
    const facade = makeMockFacade();
    facade.flush = vi.fn(async () => {});
    facade.exportCurrent = vi.fn(async () => {
      throw new Error("opfs busy");
    });
    render(<LogPanel facade={facade} />);
    const btn = screen.getByRole("button", { name: "导出当前 run" });
    await userEvent.click(btn);
    await waitFor(() => expect(btn).not.toBeDisabled());
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/opfs busy/);
  });

  it("AC4：错误文案 10 秒后自动清除", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const facade = makeMockFacade();
      facade.flush = vi.fn(async () => {});
      facade.exportCurrent = vi.fn(async () => {
        throw new Error("boom");
      });
      render(<LogPanel facade={facade} />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const btn = screen.getByRole("button", { name: "导出当前 run" });
      await user.click(btn);
      // Error alert is now visible.
      expect(screen.queryByRole("alert")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(10001);
      });
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("LogPanel — TASK-018 archive list", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function makeRun(spec: {
    runId: string;
    createdAtRealTime: string;
    sizeBytes?: number;
    isCurrent?: boolean;
    entryCount?: number;
  }): import("../../logger/types").RunArchive {
    return {
      run_id: spec.runId,
      created_at_real_time: spec.createdAtRealTime,
      updated_at_real_time: spec.createdAtRealTime,
      size_bytes: spec.sizeBytes ?? 100,
      is_current: spec.isCurrent ?? false,
      ...(spec.entryCount !== undefined ? { entry_count: spec.entryCount } : {}),
    };
  }

  it("AC1: 切到 archive 调 listRuns 一次并按 fixture 顺序渲染 3 行", async () => {
    const facade = makeMockFacade();
    facade.listRuns = vi.fn(async () => [
      makeRun({
        runId: "run-2",
        createdAtRealTime: "2026-05-01T03:00:00.000Z",
        sizeBytes: 1000,
        isCurrent: true,
      }),
      makeRun({
        runId: "run-1",
        createdAtRealTime: "2026-05-01T02:00:00.000Z",
        sizeBytes: 500,
      }),
      makeRun({
        runId: "run-0",
        createdAtRealTime: "2026-05-01T01:00:00.000Z",
        sizeBytes: 200,
      }),
    ]);
    render(<LogPanel facade={facade} />);
    await userEvent.click(screen.getByRole("button", { name: "历史" }));
    await waitFor(() => expect(facade.listRuns).toHaveBeenCalledTimes(1));
    const list = await screen.findByLabelText("历史 run 列表");
    const rows = list.querySelectorAll(".log-panel-archive-row");
    expect(rows.length).toBe(3);
    // The "当前" badge appears only on the run flagged is_current.
    expect(rows[0].textContent).toContain("当前");
    expect(rows[1].textContent).not.toContain("当前");
    expect(rows[2].textContent).not.toContain("当前");
  });

  it("AC1: 当前 run 那行删除按钮 disabled，非当前 run 不 disabled", async () => {
    const facade = makeMockFacade();
    facade.listRuns = vi.fn(async () => [
      makeRun({
        runId: "run-2",
        createdAtRealTime: "2026-05-01T03:00:00.000Z",
        sizeBytes: 1000,
        isCurrent: true,
      }),
      makeRun({
        runId: "run-1",
        createdAtRealTime: "2026-05-01T02:00:00.000Z",
        sizeBytes: 500,
      }),
    ]);
    render(<LogPanel facade={facade} />);
    await userEvent.click(screen.getByRole("button", { name: "历史" }));
    await waitFor(() => screen.getByText("run-2"));
    const list = screen.getByLabelText("历史 run 列表");
    const currentRow = list.querySelector<HTMLElement>(
      '[data-run-id="run-2"]',
    );
    const otherRow = list.querySelector<HTMLElement>(
      '[data-run-id="run-1"]',
    );
    expect(currentRow).not.toBeNull();
    expect(otherRow).not.toBeNull();
    const currentDelete = currentRow!.querySelector<HTMLButtonElement>(
      'button[data-action="delete"]',
    );
    const otherDelete = otherRow!.querySelector<HTMLButtonElement>(
      'button[data-action="delete"]',
    );
    expect(currentDelete).not.toBeNull();
    expect(otherDelete).not.toBeNull();
    expect(currentDelete!.disabled).toBe(true);
    expect(otherDelete!.disabled).toBe(false);
  });

  it("AC2: 点查看 → readRun + 解码 → 渲染只读 entries", async () => {
    const facade = makeMockFacade();
    facade.listRuns = vi.fn(async () => [
      makeRun({
        runId: "run-1",
        createdAtRealTime: "2026-05-01T02:00:00.000Z",
        sizeBytes: 500,
      }),
    ]);
    const entries = [
      {
        run_id: "run-1",
        seq: 1,
        type: "system.run.start",
        source: "system",
        payload: {},
        log_version: 1,
        game_version: "1",
        occurred_at_game_seconds: 0,
        occurred_at_real_time: "2026-05-01T02:00:00.000Z",
      },
      {
        run_id: "run-1",
        seq: 2,
        type: "player.call.choice",
        source: "player_command",
        payload: {},
        log_version: 1,
        game_version: "1",
        occurred_at_game_seconds: 1,
        occurred_at_real_time: "2026-05-01T02:00:01.000Z",
      },
    ];
    const jsonl =
      entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    const buffer = new TextEncoder().encode(jsonl).buffer as ArrayBuffer;
    facade.readRun = vi.fn(async () => buffer);
    render(<LogPanel facade={facade} />);
    await userEvent.click(screen.getByRole("button", { name: "历史" }));
    await waitFor(() => screen.getByText("run-1"));
    await userEvent.click(screen.getAllByRole("button", { name: "查看" })[0]);
    await waitFor(() => screen.getByLabelText("查看 run"));
    expect(facade.readRun).toHaveBeenCalledWith("run-1");
    const viewList = screen
      .getByLabelText("查看 run")
      .querySelector(".log-panel-list");
    expect(viewList).not.toBeNull();
    const rows = viewList!.querySelectorAll(".log-panel-row");
    expect(rows.length).toBe(2);
    expect(rows[0].getAttribute("data-type")).toBe("system.run.start");
    expect(rows[1].getAttribute("data-type")).toBe("player.call.choice");
  });

  it("AC3: 删除 → confirm → deleteRun + listRuns 各 1 次额外", async () => {
    const facade = makeMockFacade();
    let callCount = 0;
    facade.listRuns = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return [
          makeRun({
            runId: "run-2",
            createdAtRealTime: "2026-05-01T03:00:00.000Z",
            sizeBytes: 1000,
            isCurrent: true,
          }),
          makeRun({
            runId: "run-1",
            createdAtRealTime: "2026-05-01T02:00:00.000Z",
            sizeBytes: 500,
          }),
        ];
      }
      return [
        makeRun({
          runId: "run-2",
          createdAtRealTime: "2026-05-01T03:00:00.000Z",
          sizeBytes: 1000,
          isCurrent: true,
        }),
      ];
    });
    facade.deleteRun = vi.fn(async () => {});
    render(<LogPanel facade={facade} />);
    await userEvent.click(screen.getByRole("button", { name: "历史" }));
    await waitFor(() => screen.getByText("run-1"));
    // Click delete on the non-current row (run-1).
    const list = screen.getByLabelText("历史 run 列表");
    const targetRow = list.querySelector<HTMLElement>('[data-run-id="run-1"]');
    expect(targetRow).not.toBeNull();
    const deleteBtn = targetRow!.querySelector<HTMLButtonElement>(
      'button[data-action="delete"]',
    );
    expect(deleteBtn).not.toBeNull();
    await userEvent.click(deleteBtn!);
    expect(facade.deleteRun).toHaveBeenCalledTimes(1);
    expect(facade.deleteRun).toHaveBeenCalledWith("run-1");
    await waitFor(() => expect(facade.listRuns).toHaveBeenCalledTimes(2));
    // After refresh the run-1 row is gone.
    await waitFor(() => {
      const rowsAfter = list.querySelectorAll(".log-panel-archive-row");
      expect(rowsAfter.length).toBe(1);
    });
  });

  it("AC3: 当前 run 删除按钮 disabled 时点击不触发 deleteRun", async () => {
    const facade = makeMockFacade();
    facade.listRuns = vi.fn(async () => [
      makeRun({
        runId: "run-2",
        createdAtRealTime: "2026-05-01T03:00:00.000Z",
        sizeBytes: 1000,
        isCurrent: true,
      }),
    ]);
    facade.deleteRun = vi.fn(async () => {});
    render(<LogPanel facade={facade} />);
    await userEvent.click(screen.getByRole("button", { name: "历史" }));
    await waitFor(() => screen.getByText("run-2"));
    const list = screen.getByLabelText("历史 run 列表");
    const currentRow = list.querySelector<HTMLElement>(
      '[data-run-id="run-2"]',
    );
    const deleteBtn = currentRow!.querySelector<HTMLButtonElement>(
      'button[data-action="delete"]',
    );
    expect(deleteBtn!.disabled).toBe(true);
    // userEvent.click on a disabled button is a no-op; ensure deleteRun stays
    // untouched.
    await userEvent.click(deleteBtn!);
    expect(facade.deleteRun).not.toHaveBeenCalled();
  });

  it("AC4: readRun 含坏 jsonl 行 → console.warn 一次 + 其他行正常渲染", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const facade = makeMockFacade();
    facade.listRuns = vi.fn(async () => [
      makeRun({
        runId: "run-1",
        createdAtRealTime: "2026-05-01T02:00:00.000Z",
        sizeBytes: 500,
      }),
    ]);
    const jsonl =
      '{"run_id":"run-1","seq":1,"type":"system.run.start","source":"system","payload":{},"log_version":1,"game_version":"1","occurred_at_game_seconds":0,"occurred_at_real_time":"2026-05-01T02:00:00.000Z"}\n' +
      "!!!bad json line!!!\n" +
      '{"run_id":"run-1","seq":2,"type":"player.call.choice","source":"player_command","payload":{},"log_version":1,"game_version":"1","occurred_at_game_seconds":1,"occurred_at_real_time":"2026-05-01T02:00:01.000Z"}\n';
    const buffer = new TextEncoder().encode(jsonl).buffer as ArrayBuffer;
    facade.readRun = vi.fn(async () => buffer);
    render(<LogPanel facade={facade} />);
    await userEvent.click(screen.getByRole("button", { name: "历史" }));
    await waitFor(() => screen.getByText("run-1"));
    await userEvent.click(screen.getByRole("button", { name: "查看" }));
    await waitFor(() => screen.getByLabelText("查看 run"));
    const viewList = screen
      .getByLabelText("查看 run")
      .querySelector(".log-panel-list");
    const rows = viewList!.querySelectorAll(".log-panel-row");
    expect(rows.length).toBe(2);
    expect(consoleWarn).toHaveBeenCalled();
  });

  it("点 [导出] → 调 facade.exportRun(id)", async () => {
    const facade = makeMockFacade();
    facade.listRuns = vi.fn(async () => [
      makeRun({
        runId: "run-1",
        createdAtRealTime: "2026-05-01T02:00:00.000Z",
        sizeBytes: 500,
      }),
    ]);
    facade.exportRun = vi.fn(async () => {});
    render(<LogPanel facade={facade} />);
    await userEvent.click(screen.getByRole("button", { name: "历史" }));
    await waitFor(() => screen.getByText("run-1"));
    await userEvent.click(screen.getByRole("button", { name: "导出" }));
    expect(facade.exportRun).toHaveBeenCalledTimes(1);
    expect(facade.exportRun).toHaveBeenCalledWith("run-1");
  });

  it("查看模式 → 点 '返回列表' 回到 list 视图", async () => {
    const facade = makeMockFacade();
    facade.listRuns = vi.fn(async () => [
      makeRun({
        runId: "run-1",
        createdAtRealTime: "2026-05-01T02:00:00.000Z",
        sizeBytes: 500,
      }),
    ]);
    facade.readRun = vi.fn(async () => new TextEncoder().encode("").buffer as ArrayBuffer);
    render(<LogPanel facade={facade} />);
    await userEvent.click(screen.getByRole("button", { name: "历史" }));
    await waitFor(() => screen.getByText("run-1"));
    await userEvent.click(screen.getByRole("button", { name: "查看" }));
    await waitFor(() => screen.getByLabelText("查看 run"));
    // List view is hidden while viewing.
    expect(screen.queryByLabelText("历史 run 列表")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "返回列表" }));
    await waitFor(() => screen.getByLabelText("历史 run 列表"));
    expect(screen.queryByLabelText("查看 run")).toBeNull();
  });
});
