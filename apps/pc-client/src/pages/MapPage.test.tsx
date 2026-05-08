import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialMapState, initialCrew, initialTiles } from "../data/gameData";
import type { PhaserMapCanvasProps } from "../phaser-map/PhaserMapCanvas";
import { MapPage } from "./MapPage";

const phaserMapCanvasState = vi.hoisted(() => ({ latestProps: null as PhaserMapCanvasProps | null }));

vi.mock("../phaser-map/PhaserMapCanvas", () => ({
  PhaserMapCanvas: (props: PhaserMapCanvasProps) => {
    phaserMapCanvasState.latestProps = props;
    return (
      <div className="phaser-map-stage">
        <button type="button" onClick={() => props.setZoomLevelInReact?.(3)}>
          simulate wheel zoom
        </button>
      </div>
    );
  },
}));

describe("MapPage", () => {
  beforeEach(() => {
    phaserMapCanvasState.latestProps = null;
  });

  it("renders four zoom pips and updates active zoom from Phaser", () => {
    renderMapPage();
    const zoomBar = screen.getByLabelText("地图缩放级别");
    expect(within(zoomBar).getAllByRole("listitem")).toHaveLength(4);
    expect(within(zoomBar).getByText("全局")).toHaveClass("zoom-level-active");

    fireEvent.click(screen.getByRole("button", { name: "simulate wheel zoom" }));
    expect(within(zoomBar).getByText("精细")).toHaveClass("zoom-level-active");
  });

  it("passes the full authored 8x8 map into Phaser", () => {
    renderMapPage();

    expect(phaserMapCanvasState.latestProps?.columns).toBe(8);
    expect(phaserMapCanvasState.latestProps?.tileViews).toHaveLength(64);
    expect(phaserMapCanvasState.latestProps?.tileViews.find((tile) => tile.id === "1-1")).toMatchObject({
      row: 0,
      col: 0,
      status: "discovered",
      displayCoord: "(-3,3)",
    });
    expect(phaserMapCanvasState.latestProps?.tileViews.find((tile) => tile.id === "4-4")).toMatchObject({
      row: 3,
      col: 3,
      status: "discovered",
      displayCoord: "(0,0)",
    });
    expect(phaserMapCanvasState.latestProps?.tileViews.find((tile) => tile.id === "8-8")).toMatchObject({
      row: 7,
      col: 7,
      status: "discovered",
      displayCoord: "(4,-4)",
    });
  });

  it("shows authored tile details after selecting a tile", () => {
    renderMapPage();

    act(() => phaserMapCanvasState.latestProps?.onSelectTile("1-1"));
    expect(screen.getByText("起点")).toBeInTheDocument();
    expect(screen.getByText("未确认新的地块对象")).toBeInTheDocument();

    act(() => phaserMapCanvasState.latestProps?.onSelectTile("4-4"));
    expect(screen.getAllByText("IAFS坠毁点").length).toBeGreaterThan(0);
    expect(screen.getByText("发电机 / 维生装置 / 穿梭机核心")).toBeInTheDocument();
  });

  it("passes no authored visual layers for the current map content", () => {
    renderMapPage();

    expect(phaserMapCanvasState.latestProps?.tileViews.every((tile) => (tile.visualLayers ?? []).length === 0)).toBe(true);
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
