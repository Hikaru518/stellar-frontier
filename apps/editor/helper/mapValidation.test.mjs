// @vitest-environment node

import { describe, expect, it } from "vitest";
import { validateMapEditorMap } from "./mapValidation.mjs";

const mapObjects = [{ id: "known-object" }];
const tilesetRegistry = {
  tilesets: [{ id: "known-tileset", tileCount: 3 }],
};

describe("mapValidation", () => {
  it("accepts valid maps without visual data", () => {
    const result = validateMapEditorMap(baseMap(), { mapObjects, tilesetRegistry });

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("accepts maps with empty visual layers", () => {
    const result = validateMapEditorMap(
      {
        ...baseMap(),
        visual: { layers: [] },
      },
      { mapObjects, tilesetRegistry },
    );

    expect(result.valid).toBe(true);
  });

  it("rejects missing gameplay and visual references", () => {
    const draft = {
      ...baseMap(),
      originTileId: "9-9",
      initialDiscoveredTileIds: ["1-1", "8-8"],
      tiles: [
        {
          ...baseMap().tiles[0],
          objectIds: ["missing-object"],
        },
        baseMap().tiles[1],
      ],
      visual: {
        layers: [
          {
            id: "terrain",
            name: "Terrain",
            visible: true,
            locked: false,
            opacity: 1,
            cells: {
              "3-3": { tilesetId: "known-tileset", tileIndex: 0 },
              "1-1": { tilesetId: "missing-tileset", tileIndex: 0 },
              "1-2": { tilesetId: "known-tileset", tileIndex: 3 },
            },
          },
        ],
      },
    };

    const result = validateMapEditorMap(draft, { mapObjects, tilesetRegistry });

    expect(result.valid).toBe(false);
    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        "unknown_origin_tile_id",
        "unknown_initial_discovered_tile_id",
        "origin_not_initially_discovered",
        "unknown_object_id",
        "unknown_visual_cell_tile_id",
        "unknown_tileset_id",
        "tile_index_out_of_bounds",
      ]),
    );
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unknown_visual_cell_tile_id",
          path: "/visual/layers/0/cells/3-3",
          target: expect.objectContaining({ kind: "cell", tileId: "3-3", layerId: "terrain" }),
        }),
        expect.objectContaining({
          code: "tile_index_out_of_bounds",
          path: "/visual/layers/0/cells/1-2/tileIndex",
          target: expect.objectContaining({ kind: "cell", tileId: "1-2", tilesetId: "known-tileset" }),
        }),
      ]),
    );
  });

  it("rejects tile coordinates outside map bounds", () => {
    const draft = {
      ...baseMap(),
      tiles: [
        baseMap().tiles[0],
        {
          ...baseMap().tiles[1],
          id: "2-1",
          row: 2,
          col: 1,
        },
      ],
    };

    const result = validateMapEditorMap(draft, { mapObjects, tilesetRegistry });

    expect(result.valid).toBe(false);
    expect(errorCodes(result)).toContain("tile_coordinate_out_of_bounds");
  });
});

function errorCodes(result) {
  return result.errors.map((error) => error.code);
}

function baseMap() {
  return {
    id: "test-map",
    name: "Test Map",
    version: 1,
    size: { rows: 1, cols: 2 },
    originTileId: "1-1",
    initialDiscoveredTileIds: ["1-1"],
    tiles: [
      {
        id: "1-1",
        row: 1,
        col: 1,
        areaName: "Area 1-1",
        terrain: "平原",
        weather: "晴朗",
        environment: {
          temperatureCelsius: 20,
          humidityPercent: 40,
          magneticFieldMicroTesla: 50,
          radiationLevel: "none",
        },
        objectIds: ["known-object"],
        specialStates: [],
      },
      {
        id: "1-2",
        row: 1,
        col: 2,
        areaName: "Area 1-2",
        terrain: "平原",
        weather: "晴朗",
        environment: {
          temperatureCelsius: 20,
          humidityPercent: 40,
          magneticFieldMicroTesla: 50,
          radiationLevel: "none",
        },
        objectIds: [],
        specialStates: [],
      },
    ],
  };
}
