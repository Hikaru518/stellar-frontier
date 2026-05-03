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
  it("formats tile ids and player-facing display coordinates from the origin", () => {
    expect(getTileId(4, 4)).toBe("4-4");
    expect(parseTileId("3-5")).toEqual({ row: 3, col: 5 });
    expect(parseTileId("bad-id")).toBeNull();
    expect(getDisplayCoord({ row: 4, col: 4 }, { row: 4, col: 4 })).toEqual({ displayX: 0, displayY: 0 });
    expect(getDisplayCoord({ row: 3, col: 5 }, { row: 4, col: 4 })).toEqual({ displayX: 1, displayY: 1 });
  });

  it("uses area name and player coordinates for location labels", () => {
    expect(getTileAreaName(defaultMapConfig, "3-3")).toBe("丘陵矿带");
    expect(getTileLocationLabel(defaultMapConfig, "3-3")).toBe("丘陵矿带 (-1,1)");
    expect(getTileLocationLabel(defaultMapConfig, "missing")).toBe("missing");
  });

  it("builds a frontier window from 8-neighbor discovered tiles", () => {
    const window = getVisibleTileWindow(defaultMapConfig, runtime(["4-4"]));

    expect(window).toMatchObject({ minRow: 3, maxRow: 5, minCol: 3, maxCol: 5 });
    expect(window.cells).toHaveLength(9);
    expect(window.cells.find((cell) => cell.id === "4-4")?.status).toBe("discovered");
    expect(window.cells.filter((cell) => cell.status === "frontier")).toHaveLength(8);
    expect(window.cells.some((cell) => cell.status === "unknownHole")).toBe(false);
  });

  it("clamps visible windows at map boundaries", () => {
    const window = getVisibleTileWindow(defaultMapConfig, runtime(["1-1"]));

    expect(window).toMatchObject({ minRow: 1, maxRow: 2, minCol: 1, maxCol: 2 });
    expect(window.cells.map((cell) => cell.id).sort()).toEqual(["1-1", "1-2", "2-1", "2-2"]);
  });

  it("marks enclosed cells inside the visible rectangle as unknown holes", () => {
    const window = getVisibleTileWindow(defaultMapConfig, runtime(["4-4", "4-8"]));

    expect(window.cells.find((cell) => cell.id === "4-6")?.status).toBe("unknownHole");
    expect(window.cells.find((cell) => cell.id === "4-7")?.status).toBe("frontier");
  });

  it("builds a full map window without discovery restrictions for the PC map view", () => {
    const window = getFullTileWindow(defaultMapConfig);

    expect(window).toMatchObject({ minRow: 1, maxRow: 8, minCol: 1, maxCol: 8 });
    expect(window.cells).toHaveLength(64);
    expect(window.cells.find((cell) => cell.id === "1-1")).toMatchObject({
      row: 1,
      col: 1,
      displayX: -3,
      displayY: 3,
      status: "discovered",
      tile: expect.objectContaining({ areaName: "北部玄武高地" }),
    });
    expect(window.cells.find((cell) => cell.id === "8-8")).toMatchObject({
      row: 8,
      col: 8,
      displayX: 4,
      displayY: -4,
      status: "discovered",
      tile: expect.objectContaining({ areaName: "东南荒滩" }),
    });
    expect(window.cells.some((cell) => cell.status !== "discovered")).toBe(false);
  });

  it("allows movement to authored map tiles without discovery restrictions", () => {
    const map = runtime(["4-4", "4-8"]);

    expect(canMoveToTile(defaultMapConfig, map, "4-4")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "4-7")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "4-6")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "1-1")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "8-8")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "9-9")).toBe(false);
    expect(canMoveToTile(defaultMapConfig, map, "not-a-tile")).toBe(false);
  });

});
