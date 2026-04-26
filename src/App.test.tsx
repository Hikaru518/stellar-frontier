import { act, fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(screen.getByText("队员压低声音报告：附近有大型野兽正在靠近。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "立刻撤离" }));

    expect(screen.getByText("队员成功撤离。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "立刻撤离" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "结束通话" })).toHaveLength(2);
  });

  it("selects a move target from the map and confirms movement in the call", async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const garryCard = screen.getByText("Garry，退休老大爷").closest("article");
    expect(garryCard).not.toBeNull();
    fireEvent.click(within(garryCard as HTMLElement).getByRole("button", { name: "通话" }));

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

  it("opens a crew profile with attributes, tags, expertise, and diary entries", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /通讯台/ }));
    const mikeCard = screen.getByText("Mike，特战干员").closest("article");
    expect(mikeCard).not.toBeNull();
    fireEvent.click(within(mikeCard as HTMLElement).getByRole("button", { name: "查看档案" }));

    expect(screen.getByRole("heading", { name: "Mike / 队员档案" })).toBeInTheDocument();
    expect(screen.getByText("5 维轻量属性")).toBeInTheDocument();
    expect(screen.getByText("嘴硬心软")).toBeInTheDocument();
    expect(screen.getByText("拾荒者")).toBeInTheDocument();
    expect(screen.getByText(/湖的位置不对/)).toBeInTheDocument();
  });

  it("uses the debug toolbox to accelerate game time", () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "[DEBUG]" }));
    fireEvent.click(screen.getByRole("button", { name: "4x" }));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText("第 1 日 00 小时 00 分钟 04 秒")).toBeInTheDocument();
  });

  it("requires confirmation before resetting the save from debug toolbox", () => {
    vi.useFakeTimers();
    render(<App />);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("第 1 日 00 小时 00 分钟 02 秒")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "[DEBUG]" }));
    fireEvent.click(screen.getByRole("button", { name: "重置存档" }));
    expect(screen.getByText("确定要重置吗？")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));
    expect(screen.getByText("第 1 日 00 小时 00 分钟 00 秒")).toBeInTheDocument();
  });
});
