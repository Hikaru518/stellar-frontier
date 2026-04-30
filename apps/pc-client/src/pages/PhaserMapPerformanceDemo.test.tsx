import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhaserMapPerformanceDemo } from "./PhaserMapPerformanceDemo";

describe("PhaserMapPerformanceDemo", () => {
  it("renders the performance demo shell and close action", () => {
    const onClose = vi.fn();

    render(<PhaserMapPerformanceDemo onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "3x3 / 20x20 Phaser 地图 Demo" })).toBeInTheDocument();
    expect(screen.getByText(/外层只有 3x3 大地块/)).toBeInTheDocument();
    expect(screen.getByText(/人物全局寻路，慢速移动/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "地块详情" })).toBeInTheDocument();
    expect(screen.getByText("可执行选项")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭 Demo" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
