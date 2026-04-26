import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it("renders the control center by default", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "前沿基地控制中心" })).toBeInTheDocument();
    expect(screen.getByText("第 1 日 00 小时 00 分钟 00 秒")).toBeInTheDocument();
    expect(screen.getByText("未读通讯 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /通讯台/ })).toBeInTheDocument();
  });

  it("advances game time while the app is running", () => {
    vi.useFakeTimers();

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("第 1 日 00 小时 00 分钟 01 秒")).toBeInTheDocument();
  });

  it("settles Garry mining from the time system", () => {
    vi.useFakeTimers();

    render(<App />);

    act(() => {
      vi.advanceTimersByTime(300_000);
    });

    expect(screen.getByText("1245")).toBeInTheDocument();
    expect(screen.getByText(/Garry 完成了 1 轮铁矿采集/)).toBeInTheDocument();
  });

  it("handles an incoming Amy call and settles a decision", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.click(screen.getByRole("button", { name: /通讯台/ }));
    expect(screen.getByRole("heading", { name: "通讯台" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "接通" }));
    expect(screen.getByRole("heading", { name: "通话页面：Amy 紧急事件" })).toBeInTheDocument();
    expect(screen.getByText("头儿，我遇到熊了我草。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "快跑（资源中断）" }));

    expect(screen.getByText("Amy 切断了采集路线并开始撤离。熊没有签署停火协议。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "快跑（资源中断）" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "结束通话" })).toHaveLength(2);
  });

  it("selects a move target from the map and confirms movement in the call", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const callButtons = screen.getAllByRole("button", { name: "通话" });
    fireEvent.click(callButtons[callButtons.length - 1]);

    expect(screen.getByRole("heading", { name: "通话页面：Garry 普通状态" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /请求前往/ }));
    expect(screen.getByText("请在地图中标记候选目的地。移动指令仍需回到通话中确认。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /地图二级菜单/ }));
    expect(screen.getByRole("heading", { name: "卫星雷达地图" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\(3,2\)/ }));
    fireEvent.click(screen.getByRole("button", { name: "标记为目的地，返回通话确认" }));

    expect(screen.getByText("移动确认")).toBeInTheDocument();
    expect(screen.getByText(/当前采集，未完成的一轮不会结算/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /确认请求 Garry 前往 \(3,2\)/ }));

    expect(screen.getByText("移动请求已确认。队员开始按路线逐格推进，抵达后会原地待命。")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    const endButtons = screen.getAllByRole("button", { name: "结束通话" });
    fireEvent.click(endButtons[endButtons.length - 1]);
    expect(screen.getByRole("heading", { name: "通讯台" })).toBeInTheDocument();
    expect(screen.getByText("位于 (3,2)，待命中。")).toBeInTheDocument();
  });
});
