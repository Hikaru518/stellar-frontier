import { describe, expect, it } from "vitest";

import { defaultMapConfig } from "./content/contentData";
import {
  canMoveToTile,
  getDisplayCoord,
  getFullTileWindow,
  getTileAreaName,
  getTileId,
  getTileLocationLabel,
  getVisibleTileWindow,
  parseTileId,
  type RuntimeMapState,
} from "./mapSystem";

function runtime(discoveredTileIds: string[], tilesById: RuntimeMapState["tilesById"] = {}): RuntimeMapState {
  return {
    configId: defaultMapConfig.id,
    configVersion: defaultMapConfig.version,
    rows: defaultMapConfig.size.rows,
    cols: defaultMapConfig.size.cols,
    originTileId: defaultMapConfig.originTileId,
    discoveredTileIds,
    investigationReportsById: {},
    tilesById,
  };
}

describe("mapSystem", () => {
  it("formats tile ids and display coordinates from the 1-1 origin", () => {
    expect(getTileId(1, 1)).toBe("1-1");
    expect(parseTileId("3-5")).toEqual({ row: 3, col: 5 });
    expect(parseTileId("bad-id")).toBeNull();
    expect(getDisplayCoord({ row: 1, col: 1 }, { row: 1, col: 1 })).toEqual({ displayX: 0, displayY: 0 });
    expect(getDisplayCoord({ row: 3, col: 5 }, { row: 1, col: 1 })).toEqual({ displayX: 4, displayY: -2 });
  });

  it("uses the authored map area names and origin-relative location labels", () => {
    expect(getTileAreaName(defaultMapConfig, "1-1")).toBe("起点");
    expect(getTileLocationLabel(defaultMapConfig, "1-1")).toBe("起点 (-3,3)");
    expect(getTileLocationLabel(defaultMapConfig, "3-3")).toBe("坠毁西北坡 (-1,1)");
  });

  it("builds visible windows from discovered tiles and clamps boundaries", () => {
    expect(getVisibleTileWindow(defaultMapConfig, runtime(["1-1"]))).toMatchObject({ minRow: 1, maxRow: 2, minCol: 1, maxCol: 2 });
    expect(getVisibleTileWindow(defaultMapConfig, runtime(["4-4"]))).toMatchObject({ minRow: 3, maxRow: 5, minCol: 3, maxCol: 5 });
  });

  it("builds the full authored 8x8 map window from the crash-site origin", () => {
    const window = getFullTileWindow(defaultMapConfig);

    expect(window).toMatchObject({ minRow: 1, maxRow: 8, minCol: 1, maxCol: 8 });
    expect(window.cells).toHaveLength(64);
    expect(window.cells.find((cell) => cell.id === "1-1")).toMatchObject({ displayX: -3, displayY: 3, tile: expect.objectContaining({ areaName: "起点" }) });
    expect(window.cells.find((cell) => cell.id === "4-4")).toMatchObject({ displayX: 0, displayY: 0, tile: expect.objectContaining({ areaName: "IAFS坠毁点" }) });
    expect(window.cells.find((cell) => cell.id === "8-8")).toMatchObject({ displayX: 4, displayY: -4, tile: expect.objectContaining({ areaName: "空白区域" }) });
  });

  it("allows movement to any authored tile inside the map bounds", () => {
    const map = runtime(["1-1"]);
    expect(canMoveToTile(defaultMapConfig, map, "1-1")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "4-4")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "8-8")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "9-9")).toBe(false);
  });
});
