import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileTerminalApp } from "./MobileTerminalApp";

describe("MobileTerminalApp", () => {
  it("renders the companion terminal role and selected transport", () => {
    render(<MobileTerminalApp />);

    expect(screen.getByRole("heading", { name: "等待配对" })).toBeInTheDocument();
    expect(screen.getByText("mainland-relay")).toBeInTheDocument();
    expect(screen.getByText(/游戏结算仍由 PC 完成/)).toBeInTheDocument();
  });
});
