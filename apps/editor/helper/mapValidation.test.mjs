// @vitest-environment node

import { describe, expect, it } from "vitest";
import { validateMapEditorMap } from "./mapValidation.mjs";

const mapObjects = [{ id: "known-object" }];

describe("mapValidation", () => {
  it("accepts valid maps with explicit tiles and radar rows", () => {
    const result = validateMapEditorMap(baseMap(), { mapObjects });

    expect(result).toEqual({ valid: true, errors: [], warnings: [] });
  });

  it("rejects missing gameplay and radar references", () => {
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
      radar: {
        ...baseMap().radar,
        toneRows: ["gx"],
      },
    };

    const result = validateMapEditorMap(draft, { mapObjects });

    expect(result.valid).toBe(false);
    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        "unknown_origin_tile_id",
        "unknown_initial_discovered_tile_id",
        "origin_not_initially_discovered",
        "unknown_object_id",
        "unknown_radar_tone",
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

    const result = validateMapEditorMap(draft, { mapObjects });

    expect(result.valid).toBe(false);
    expect(errorCodes(result)).toContain("tile_coordinate_out_of_bounds");
  });

  it("rejects radar row shape mismatches", () => {
    const draft = {
      ...baseMap(),
      radar: {
        ...baseMap().radar,
        glyphRows: ["."],
      },
    };

    const result = validateMapEditorMap(draft, { mapObjects });

    expect(result.valid).toBe(false);
    expect(errorCodes(result)).toContain("invalid_radar_glyphRows_row");
  });
});

function errorCodes(result) {
  return result.errors.map((error) => error.code);
}

function baseMap() {
  return {
    id: "test-map",
    name: "Test Map",
    version: 3,
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
    radar: {
      world: { width: 2, height: 1, origin: { x: 0, y: 0 } },
      glyphRows: [".."],
      toneRows: ["gg"],
      palette: { g: "#9bbf74" },
      symbols: {
        crew: { glyph: "@", tone: "g" },
        focus: { glyph: "X", tone: "g" },
      },
      trace: {
        layerNotice: "notice",
        controlMode: "control",
        callMode: "call",
        worldLine: "world",
        jsonLine: "json",
        emptyLine: "empty",
      },
      regions: [],
    },
  };
}
