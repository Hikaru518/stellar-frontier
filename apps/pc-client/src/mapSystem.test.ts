import { describe, expect, it } from "vitest";

import { defaultMapConfig } from "./content/contentData";
import {
  canMoveToTile,
  getDisplayCoord,
  getTileId,
  getTileLocationLabel,
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

  it("uses feature labels or tile ids with origin-relative location labels", () => {
    expect(getTileLocationLabel(defaultMapConfig, "126-126")).toBe("126-126 (-3,3)");
    expect(getTileLocationLabel(defaultMapConfig, "128-128")).toBe("IAFS坠毁点 (-1,1)");
    expect(getTileLocationLabel(defaultMapConfig, "129-129")).toBe("IAFS坠毁点 (0,0)");
  });

  it("allows movement to any authored tile inside the 256x256 map bounds", () => {
    const map = runtime(["129-129"]);
    expect(canMoveToTile(defaultMapConfig, map, "1-1")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "129-129")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "256-256")).toBe(true);
    expect(canMoveToTile(defaultMapConfig, map, "257-257")).toBe(false);
  });
});
