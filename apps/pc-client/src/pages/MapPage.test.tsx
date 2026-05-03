import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialMapState, initialCrew, initialTiles } from "../data/gameData";
import type { PhaserMapCanvasProps } from "../phaser-map/PhaserMapCanvas";
import { MapPage } from "./MapPage";

const phaserMapCanvasState = vi.hoisted(() => ({
  latestProps: null as PhaserMapCanvasProps | null,
}));

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

describe("MapPage zoom level UI", () => {
  beforeEach(() => {
    phaserMapCanvasState.latestProps = null;
  });

  it("renders four zoom pips and marks the current zoom level active", () => {
    renderMapPage();

    const zoomBar = screen.getByLabelText("地图缩放级别");
    expect(within(zoomBar).getAllByRole("listitem")).toHaveLength(4);
    expect(within(zoomBar).getByText("全局")).toHaveClass("zoom-level-active");
    expect(within(zoomBar).getByText("区域")).toBeInTheDocument();
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

  it("does not show tile details until the player clicks a tile", () => {
    renderMapPage();

    expect(screen.getByText("尚未选择地块")).toBeInTheDocument();
    expect(screen.getByText("点按地图地块后显示选框，并在此处显示该地块信息")).toBeInTheDocument();
  });

  it("passes the full 8x8 default map into the Phaser map without discovery clipping", () => {
    renderMapPage();

    expect(phaserMapCanvasState.latestProps?.columns).toBe(8);
    expect(phaserMapCanvasState.latestProps?.tileViews).toHaveLength(64);
    expect(phaserMapCanvasState.latestProps?.tileViews.find((tile) => tile.id === "1-1")).toMatchObject({
      row: 0,
      col: 0,
      status: "discovered",
      displayCoord: "(-3,3)",
    });
    expect(phaserMapCanvasState.latestProps?.tileViews.find((tile) => tile.id === "8-8")).toMatchObject({
      row: 7,
      col: 7,
      status: "discovered",
      displayCoord: "(4,-4)",
    });
    expect(phaserMapCanvasState.latestProps?.tileViews.some((tile) => tile.status !== "discovered")).toBe(false);
  });

  it("selects a tile through Phaser and then shows the detail panel information", () => {
    renderMapPage();

    act(() => phaserMapCanvasState.latestProps?.onSelectTile("4-4"));

    expect(screen.getByText("坠毁区域")).toBeInTheDocument();
    expect(screen.getByText(/坠毁残骸/)).toBeInTheDocument();
  });

  it("shows details for non-origin tiles because the PC map is not currently fog-clipped", () => {
    renderMapPage();

    act(() => phaserMapCanvasState.latestProps?.onSelectTile("1-1"));

    expect(screen.getByText("北部玄武高地")).toBeInTheDocument();
    expect(screen.getByText("高地")).toBeInTheDocument();
  });

  it("passes authored visual layers from the default map into the Phaser map", () => {
    renderMapPage();

    const originView = phaserMapCanvasState.latestProps?.tileViews.find((tile) => tile.id === "4-4");
    const topLeftView = phaserMapCanvasState.latestProps?.tileViews.find((tile) => tile.id === "1-1");
    const bottomRightView = phaserMapCanvasState.latestProps?.tileViews.find((tile) => tile.id === "8-8");

    expect(originView?.visualLayers).toEqual([
      { layerId: "layer-1", layerName: "Layer 1", order: 0, opacity: 1, tilesetId: "kenney-tiny-battle", tileIndex: 0 },
    ]);
    expect(topLeftView?.visualLayers).toEqual([
      { layerId: "layer-1", layerName: "Layer 1", order: 0, opacity: 1, tilesetId: "kenney-tiny-battle", tileIndex: 0 },
    ]);
    expect(bottomRightView?.visualLayers).toEqual([
      { layerId: "layer-1", layerName: "Layer 1", order: 0, opacity: 1, tilesetId: "kenney-tiny-battle", tileIndex: 146 },
    ]);
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
