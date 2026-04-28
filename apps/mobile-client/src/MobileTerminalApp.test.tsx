import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MobileTerminalApp } from "./MobileTerminalApp";

describe("MobileTerminalApp", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("renders the companion terminal role and selected transport", () => {
    render(<MobileTerminalApp />);

    expect(screen.getByRole("heading", { name: "等待配对" })).toBeInTheDocument();
    expect(screen.getAllByText(/yuan-wss/).length).toBeGreaterThan(0);
    expect(screen.getByText("实时连接演示")).toBeInTheDocument();
    expect(screen.getByText("局域网升级")).toBeInTheDocument();
    expect(screen.getByText("公网兜底")).toBeInTheDocument();
    expect(screen.getByText("enableWebRTC=true")).toBeInTheDocument();
    expect(screen.getByText(/游戏结算仍由 PC 完成/)).toBeInTheDocument();
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
