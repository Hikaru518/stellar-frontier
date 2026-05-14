// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadMapEditorLibrary } from "./mapContentStore.mjs";

describe("mapContentStore", () => {
  let repoRoot;

  beforeEach(async () => {
    repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-map-store-"));
    await writeJson("content/maps/default-map.json", minimalMap("default-map"));
    await writeJson("content/maps/ascii/default-map-radar.json", minimalRadar("default-map"));
    await writeJson("content/map-objects/resources.json", {
      map_objects: [
        {
          id: "test-object",
          name: "Test Object",
          kind: "resourceNode",
          visibility: "onDiscovered",
        },
      ],
    });
    await writeJson("content/schemas/maps.schema.json", { title: "maps schema" });
    await writeJson("content/schemas/map-radar.schema.json", { title: "map radar schema" });
    await writeJson("content/schemas/map-objects.schema.json", { title: "map objects schema" });
  });

  afterEach(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it("loads maps, map objects, and schemas from the provided repo root", async () => {
    const library = await loadMapEditorLibrary({ repoRoot });

    expect(library.maps).toEqual([
      expect.objectContaining({
        id: "default-map",
        file_path: "content/maps/default-map.json",
        radar_file_path: "content/maps/ascii/default-map-radar.json",
        data: expect.objectContaining({ id: "default-map", features: [] }),
      }),
    ]);
    expect(library.map_objects).toEqual([
      expect.objectContaining({
        id: "test-object",
        file_path: "content/map-objects/resources.json",
        json_path: "/map_objects/0",
      }),
    ]);
    expect(Object.keys(library.schemas)).toEqual(
      expect.arrayContaining([
        "content/schemas/maps.schema.json",
        "content/schemas/map-radar.schema.json",
        "content/schemas/map-objects.schema.json",
      ]),
    );
  });

  it("does not read maps from the real repository when a temporary repo root is supplied", async () => {
    await writeJson("content/maps/temp-only.json", minimalMap("temp-only"));
    await writeJson("content/maps/ascii/temp-only-radar.json", minimalRadar("temp-only"));

    const library = await loadMapEditorLibrary({ repoRoot });

    expect(library.maps.map((map) => map.file_path)).toEqual([
      "content/maps/default-map.json",
      "content/maps/temp-only.json",
    ]);
  });

  it("preserves map features when loading maps", async () => {
    const feature = minimalFeature("loaded_feature");
    await writeJson("content/maps/feature-map.json", {
      ...minimalMap("feature-map"),
      features: [feature],
    });
    await writeJson("content/maps/ascii/feature-map-radar.json", minimalRadar("feature-map"));

    const library = await loadMapEditorLibrary({ repoRoot });

    expect(library.maps.find((map) => map.id === "feature-map")?.data.features).toEqual([feature]);
  });

  async function writeJson(relativePath, value) {
    const absolutePath = path.join(repoRoot, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
});

function minimalMap(id) {
  return {
    id,
    name: id,
    version: 1,
    size: { rows: 1, cols: 1 },
    originTileId: "1-1",
    initialDiscoveredTileIds: ["1-1"],
    radarPath: `content/maps/ascii/${id}-radar.json`,
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
        objectIds: [],
        specialStates: [],
      },
    ],
  };
}

function minimalFeature(id) {
  return {
    id,
    name: "Test Feature",
    kind: "site:test",
    priority: 10,
    visibility: "onDiscovered",
    footprint: {
      type: "row_spans",
      spans: [{ row: 1, colStart: 1, colEnd: 1 }],
    },
  };
}

function minimalRadar(mapId) {
  return {
    $schema: "../../schemas/map-radar.schema.json",
    mapId,
    world: { width: 1, height: 1, origin: { x: 0, y: 0 } },
    glyphRows: ["."],
    toneRows: ["g"],
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
  };
}
