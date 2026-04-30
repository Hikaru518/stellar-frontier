import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createInitialMapState, initialCrew, initialTiles } from "../data/gameData";
import { MapPage } from "./MapPage";

vi.mock("../phaser-map/PhaserMapCanvas", () => ({
  PhaserMapCanvas: ({ setZoomLevelInReact }: { setZoomLevelInReact?: (zoomLevel: number) => void }) => (
    <div className="phaser-map-stage">
      <button type="button" onClick={() => setZoomLevelInReact?.(3)}>
        simulate wheel zoom
      </button>
    </div>
  ),
}));

describe("MapPage zoom level UI", () => {
  it("renders four zoom pips and marks the current zoom level active", () => {
    renderMapPage();

    const zoomBar = screen.getByLabelText("地图缩放级别");
    expect(within(zoomBar).getAllByRole("listitem")).toHaveLength(4);
    expect(within(zoomBar).getByText("全局")).toBeInTheDocument();
    expect(within(zoomBar).getByText("区域")).toHaveClass("zoom-level-active");
    expect(within(zoomBar).getByText("地块")).toBeInTheDocument();
    expect(within(zoomBar).getByText("精细")).toBeInTheDocument();
  });

  it("updates the active zoom pip when Phaser reports wheel zoom changes", () => {
    renderMapPage();

    fireEvent.click(screen.getByRole("button", { name: "simulate wheel zoom" }));
    const zoomBar = screen.getByLabelText("地图缩放级别");

    expect(within(zoomBar).getByText("区域")).not.toHaveClass("zoom-level-active");
    expect(within(zoomBar).getByText("精细")).toHaveClass("zoom-level-active");
  });
});

function renderMapPage() {
  return render(
    <MapPage
      tiles={initialTiles}
      map={createInitialMapState()}
      crew={initialCrew}
      crewActions={{}}
      activeCalls={{}}
      eventLogs={[]}
      elapsedGameSeconds={0}
      gameTimeLabel="第 1 日 00 小时 00 分钟 00 秒"
      returnTarget="control"
      onReturn={vi.fn()}
    />,
  );
}
