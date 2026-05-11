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

  it("rejects duplicate feature ids, out-of-bounds spans, and non-contiguous footprints", () => {
    const draft = {
      ...baseMap({ rows: 2, cols: 3 }),
      features: [
        feature("duplicate_feature", [{ row: 1, colStart: 1, colEnd: 1 }]),
        feature("duplicate_feature", [{ row: 1, colStart: 2, colEnd: 2 }]),
        feature("outside_feature", [{ row: 3, colStart: 1, colEnd: 1 }]),
        feature("split_feature", [
          { row: 1, colStart: 1, colEnd: 1 },
          { row: 2, colStart: 3, colEnd: 3 },
        ]),
      ],
    };

    const result = validateMapEditorMap(draft, { mapObjects });

    expect(result.valid).toBe(false);
    expect(errorCodes(result)).toEqual(
      expect.arrayContaining([
        "duplicate_feature_id",
        "feature_span_out_of_bounds",
        "feature_footprint_not_contiguous",
      ]),
    );
    for (const code of ["duplicate_feature_id", "feature_span_out_of_bounds", "feature_footprint_not_contiguous"]) {
      expect(result.errors.find((error) => error.code === code)?.target?.kind).toBe("feature");
    }
  });
});

function errorCodes(result) {
  return result.errors.map((error) => error.code);
}

function baseMap({ rows = 1, cols = 2 } = {}) {
  return {
    id: "test-map",
    name: "Test Map",
    version: 3,
    size: { rows, cols },
    originTileId: "1-1",
    initialDiscoveredTileIds: ["1-1"],
    radarPath: "content/maps/radar/test-map-radar.json",
    features: [],
    tiles: Array.from({ length: rows * cols }, (_, index) => {
      const row = Math.floor(index / cols) + 1;
      const col = (index % cols) + 1;
      return tile(row, col, row === 1 && col === 1 ? ["known-object"] : []);
    }),
    radar: {
      world: { width: cols, height: rows, origin: { x: 0, y: 0 } },
      glyphRows: Array.from({ length: rows }, () => ".".repeat(cols)),
      toneRows: Array.from({ length: rows }, () => "g".repeat(cols)),
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

function tile(row, col, objectIds) {
  return {
    id: `${row}-${col}`,
    row,
    col,
    areaName: `Area ${row}-${col}`,
    terrain: "平原",
    weather: "晴朗",
    environment: {
      temperatureCelsius: 20,
      humidityPercent: 40,
      magneticFieldMicroTesla: 50,
      radiationLevel: "none",
    },
    objectIds,
    specialStates: [],
  };
}

function feature(id, spans) {
  return {
    id,
    name: id,
    kind: "site:test",
    priority: 10,
    visibility: "onDiscovered",
    footprint: {
      type: "row_spans",
      spans,
    },
  };
}
