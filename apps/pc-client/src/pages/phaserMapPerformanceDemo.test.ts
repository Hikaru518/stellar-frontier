import { describe, expect, it } from "vitest";
import {
  createPerformanceDemoTiles,
  findPerformanceDemoPath,
  getDemoTileActions,
  getDemoTileDetails,
  getDemoTerrainLabel,
  isPerformanceDemoTileWalkable,
} from "./phaserMapDemoData";

describe("phaserMapPerformanceDemo", () => {
  it("generates a deterministic 100 by 100 RPG-style tile map", () => {
    const tiles = createPerformanceDemoTiles(100);

    expect(tiles).toHaveLength(10_000);
    expect(tiles[0]).toMatchObject({ row: 0, col: 0 });
    expect(new Set(tiles.map((tile) => tile.terrain)).size).toBeGreaterThanOrEqual(6);
    expect(tiles.some((tile) => tile.detail === "forest")).toBe(true);
    expect(tiles.some((tile) => tile.detail === "mountain")).toBe(true);
    expect(tiles.some((tile) => tile.detail === "building")).toBe(true);
  });

  it("labels terrain and marks water as non-walkable", () => {
    expect(getDemoTerrainLabel("water")).toBe("水面");
    expect(isPerformanceDemoTileWalkable({ id: "0-0", row: 0, col: 0, terrain: "water", detail: null })).toBe(false);
    expect(isPerformanceDemoTileWalkable({ id: "0-1", row: 0, col: 1, terrain: "grass", detail: null })).toBe(true);
  });

  it("finds a walkable path between two land tiles", () => {
    const tiles = [
      { id: "0-0", row: 0, col: 0, terrain: "grass" as const, detail: null },
      { id: "0-1", row: 0, col: 1, terrain: "road" as const, detail: null },
      { id: "0-2", row: 0, col: 2, terrain: "grass" as const, detail: null },
      { id: "1-0", row: 1, col: 0, terrain: "water" as const, detail: null },
      { id: "1-1", row: 1, col: 1, terrain: "water" as const, detail: null },
      { id: "1-2", row: 1, col: 2, terrain: "grass" as const, detail: null },
    ];

    expect(findPerformanceDemoPath(tiles, 3, "0-0", "0-2").map((tile) => tile.id)).toEqual(["0-0", "0-1", "0-2"]);
    expect(findPerformanceDemoPath(tiles, 3, "0-0", "1-0")).toEqual([]);
  });

  it("describes grass tiles with flower planting options", () => {
    const tile = { id: "2-3", row: 2, col: 3, terrain: "grass" as const, detail: null };

    expect(getDemoTileDetails(tile)).toMatchObject({
      areaName: "青草平原",
      terrainLabel: "草地",
      speciesLabel: "短叶星纹草",
    });
    expect(getDemoTileActions(tile).map((action) => action.label)).toEqual(["种花"]);
  });

  it("describes forest tiles with tree planting and hunting options", () => {
    const tile = { id: "4-5", row: 4, col: 5, terrain: "forest" as const, detail: "forest" as const };

    expect(getDemoTileDetails(tile)).toMatchObject({
      areaName: "密林边缘",
      terrainLabel: "森林",
      speciesLabel: "黑松与银叶灌木混生林",
    });
    expect(getDemoTileActions(tile).map((action) => action.label)).toEqual(["种树", "捕猎"]);
  });
});
