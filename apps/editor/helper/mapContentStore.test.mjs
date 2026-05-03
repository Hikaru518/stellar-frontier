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
    await writeJson("content/maps/tilesets/registry.json", {
      tilesets: [
        {
          id: "test-tileset",
          name: "Test Tileset",
          tileWidth: 16,
          tileHeight: 16,
          tileCount: 4,
          columns: 2,
        },
      ],
    });
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
    await writeJson("content/schemas/map-tilesets.schema.json", { title: "tileset schema" });
    await writeJson("content/schemas/map-objects.schema.json", { title: "map objects schema" });
  });

  afterEach(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  it("loads maps, tileset registry, map objects, and schemas from the provided repo root", async () => {
    const library = await loadMapEditorLibrary({ repoRoot });

    expect(library.maps).toEqual([
      expect.objectContaining({
        id: "default-map",
        file_path: "content/maps/default-map.json",
        data: expect.objectContaining({ id: "default-map" }),
      }),
    ]);
    expect(library.tileset_registry.tilesets[0].id).toBe("test-tileset");
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
        "content/schemas/map-tilesets.schema.json",
        "content/schemas/map-objects.schema.json",
      ]),
    );
  });

  it("does not read maps from the real repository when a temporary repo root is supplied", async () => {
    await writeJson("content/maps/temp-only.json", minimalMap("temp-only"));

    const library = await loadMapEditorLibrary({ repoRoot });

    expect(library.maps.map((map) => map.file_path)).toEqual([
      "content/maps/default-map.json",
      "content/maps/temp-only.json",
    ]);
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
