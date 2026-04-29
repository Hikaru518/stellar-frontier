import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MobileTerminalApp } from "./MobileTerminalApp";

describe("MobileTerminalApp", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders the companion terminal role, runtime transport status, and a neutral empty call state", () => {
    render(<MobileTerminalApp />);

    expect(screen.getByRole("heading", { name: "等待配对" })).toBeInTheDocument();
    expect(screen.getAllByText(/yuan-wss/).length).toBeGreaterThan(0);
    expect(screen.getByText("实时连接状态")).toBeInTheDocument();
    expect(screen.getByText("局域网升级")).toBeInTheDocument();
    expect(screen.getByText("公网兜底")).toBeInTheDocument();
    expect(screen.getByText("enableWebRTC=true")).toBeInTheDocument();
    expect(screen.getByText(/游戏结算仍由 PC 完成/)).toBeInTheDocument();
    expect(screen.getByText("暂无私密来电")).toBeInTheDocument();
    expect(screen.getByText("没有 PC 授权的私密来电时，手机端会保持待命。")).toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: "私人通讯终端" })).toBeInTheDocument();
    expect(screen.getByText("ABCDEF")).toBeInTheDocument();
    expect(screen.getByText("sf-room")).toBeInTheDocument();
  });
});
