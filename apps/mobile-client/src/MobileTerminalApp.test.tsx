import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MobileTerminalApp } from "./MobileTerminalApp";

describe("MobileTerminalApp", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders the companion terminal role, runtime transport status, and a message-list empty state", () => {
    render(<MobileTerminalApp />);

    expect(screen.getByRole("heading", { name: "等待配对" })).toBeInTheDocument();
    expect(screen.getAllByText(/yuan-wss/).length).toBeGreaterThan(0);
    expect(screen.getByText("实时连接状态")).toBeInTheDocument();
    expect(screen.getByText(/局域网升级/)).toBeInTheDocument();
    expect(screen.getByText(/公网兜底/)).toBeInTheDocument();
    expect(screen.getAllByText(/enableWebRTC=true/).length).toBeGreaterThan(0);
    expect(screen.getByText(/游戏结算仍由 PC 完成/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "消息" })).toBeInTheDocument();
    expect(screen.getByText("等待 PC 授权的通讯快照。未连接手机时，PC 仍可 fallback。")).toBeInTheDocument();
    expect(
      screen.queryByText(new RegExp([[ "演", "示" ].join(""), "Demo", ["求", "救"].join(""), "世界状态"].join("|"), "i")),
    ).not.toBeInTheDocument();
  });

  it("renders pairing params from a QR or manual-code URL", () => {
    window.history.pushState(
      {},
      "",
      "/?roomId=sf-room&token=t1&code=ABCDEF&hostUrl=ws%3A%2F%2F127.0.0.1%3A8888%2F&tenantPublicKey=tenant-1&pcTerminalId=stellar-pc-host&phoneTerminalId=stellar-phone-abcdef",
    );

    render(<MobileTerminalApp />);

    expect(screen.getByRole("heading", { name: "移动通讯设备" })).toBeInTheDocument();
    expect(screen.getByText(/短码 ABCDEF/)).toBeInTheDocument();
  });
});
