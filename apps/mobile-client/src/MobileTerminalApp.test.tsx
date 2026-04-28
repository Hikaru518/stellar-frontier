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
    expect(screen.getByText("yuan-wss")).toBeInTheDocument();
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
