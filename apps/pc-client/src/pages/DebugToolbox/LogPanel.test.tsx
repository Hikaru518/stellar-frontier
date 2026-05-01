import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { LogPanel } from "./LogPanel";
import type { LoggerFacade, LogStatus } from "../../logger";

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
