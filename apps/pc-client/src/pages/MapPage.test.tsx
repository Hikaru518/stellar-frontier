import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { initialCrew, initialLogs, initialTiles } from "../data/gameData";
import { MapPage } from "./MapPage";

describe("MapPage", () => {
  it("renders a single interactive ascii map surface after the header", () => {
    renderMapPage();

    expect(screen.getByRole("heading", { name: "卫星雷达地图" })).toBeInTheDocument();
    expect(screen.getByLabelText("ASCII 地图")).toBeInTheDocument();
    expect(screen.getByText("render + function / 256 x 256")).toBeInTheDocument();
  });

  it("does not render the old quest sidebar UI", () => {
    renderMapPage();

    expect(screen.queryByRole("button", { name: "展开任务" })).not.toBeInTheDocument();
    expect(screen.queryByText("最近更新")).not.toBeInTheDocument();
  });

  it("keeps crew action buttons visible in the left rail", () => {
    renderMapPage();

    expect(screen.getByRole("button", { name: "查看状态" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看背包" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "通话" })).toBeInTheDocument();
  });

  it("returns crew status and inventory requests to the control center handlers", () => {
    const onOpenCrewStatusInControl = vi.fn();
    const onOpenCrewInventoryInControl = vi.fn();
    renderMapPage({ onOpenCrewStatusInControl, onOpenCrewInventoryInControl });

    fireEvent.click(screen.getByRole("button", { name: "查看状态" }));
    fireEvent.click(screen.getByRole("button", { name: "查看背包" }));

    expect(onOpenCrewStatusInControl).toHaveBeenCalledWith(initialCrew[0].id);
    expect(onOpenCrewInventoryInControl).toHaveBeenCalledWith(initialCrew[0].id);
  });

  it("records map interaction info in the right trace panel", () => {
    renderMapPage();

    const mapSurface = screen.getByLabelText("ASCII 地图");
    Object.defineProperty(mapSurface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 900, height: 700, right: 900, bottom: 700, x: 0, y: 0, toJSON: () => ({}) }),
    });
    fireEvent.click(mapSurface, { clientX: 220, clientY: 180 });
    expect(screen.getAllByText(/^\[FOCUS\]/).length).toBeGreaterThan(0);
  });

  it("uses center-origin display coordinates for the function layer", () => {
    renderMapPage();

    expect(screen.getAllByText("(0,0)").length).toBeGreaterThan(0);
  });

  it("shows the latest system log in the bottom bar", () => {
    renderMapPage();

    expect(screen.getByText(initialLogs[initialLogs.length - 1].text)).toBeInTheDocument();
  });
});

function renderMapPage(overrides: Partial<ComponentProps<typeof MapPage>> = {}) {
  return render(
    <MapPage
      tiles={initialTiles}
      crew={initialCrew}
      crewActions={{}}
      activeCalls={{}}
      elapsedGameSeconds={0}
      gameTimeLabel="第 1 日 00 小时 00 分钟 00 秒"
      returnTarget="control"
      onOpenControl={vi.fn()}
      onOpenTask={vi.fn()}
      onStartCall={vi.fn()}
      onOpenCrewStatusInControl={vi.fn()}
      onOpenCrewInventoryInControl={vi.fn()}
      logs={initialLogs}
      {...overrides}
    />
  );
}
