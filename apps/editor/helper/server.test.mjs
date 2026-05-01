// @vitest-environment node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_VERSION, createHelperServer } from "./server.mjs";

describe("helper server", () => {
  const repoRoot = path.resolve(import.meta.dirname, "../../..");
  let server;
  let baseUrl;
  let tempRepoRoot;

  beforeEach(async () => {
    server = createHelperServer({ repoRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
    if (tempRepoRoot) {
      await fs.rm(tempRepoRoot, { recursive: true, force: true });
      tempRepoRoot = undefined;
    }
  });

  it("returns helper metadata from /api/health", async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.api_version).toBe(API_VERSION);
    expect(body.repo_root).toBe(repoRoot);
  });

  it("serves the event library shape from /api/event-editor/library", async () => {
    const response = await fetch(`${baseUrl}/api/event-editor/library`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.definitions)).toBe(true);
    expect(body.definitions.length).toBeGreaterThan(0);
    expect(Array.isArray(body.call_templates)).toBe(true);
    expect(body.call_templates.length).toBeGreaterThan(0);
    expect(typeof body.schemas).toBe("object");
  });

  it("serves the map editor library shape from /api/map-editor/library", async () => {
    const response = await fetch(`${baseUrl}/api/map-editor/library`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.maps)).toBe(true);
    expect(body.maps.length).toBeGreaterThan(0);
    expect(typeof body.tileset_registry).toBe("object");
    expect(Array.isArray(body.map_objects)).toBe(true);
    expect(typeof body.schemas).toBe("object");
  });

  it("returns validation errors from /api/map-editor/validate", async () => {
    await restartWithTempRepo();
    const response = await postJson("/api/map-editor/validate", {
      data: {
        ...minimalMap("broken-map"),
        originTileId: "9-9",
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unknown_origin_tile_id" }),
        expect.objectContaining({ code: "origin_not_initially_discovered" }),
      ]),
    );
  });

  it("does not write invalid map drafts from /api/map-editor/save", async () => {
    await restartWithTempRepo();
    const response = await postJson("/api/map-editor/save", {
      file_path: "content/maps/broken-map.json",
      data: {
        ...minimalMap("broken-map"),
        originTileId: "9-9",
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.valid).toBe(false);
    expect(body.saved).toBe(false);
    await expect(fs.access(path.join(tempRepoRoot, "content/maps/broken-map.json"))).rejects.toThrow();
  });

  it("writes valid map drafts to an allowed content/maps path from /api/map-editor/save", async () => {
    await restartWithTempRepo();
    const response = await postJson("/api/map-editor/save", {
      data: minimalMap("new-map"),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      valid: true,
      saved: true,
      file_path: "content/maps/new-map.json",
    }));
    const saved = JSON.parse(await fs.readFile(path.join(tempRepoRoot, "content/maps/new-map.json"), "utf8"));
    expect(saved.id).toBe("new-map");
  });

  it("rejects map saves outside content/maps", async () => {
    await restartWithTempRepo();
    const response = await postJson("/api/map-editor/save", {
      file_path: "content/events/new-map.json",
      data: minimalMap("new-map"),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("path_not_allowed");
  });

  it("serves PNG assets from /api/map-editor/assets", async () => {
    await restartWithTempRepo();
    const response = await fetch(`${baseUrl}/api/map-editor/assets?path=assets/test/sample.png`);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer()).slice(0, 4)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  it("rejects non-assets paths from /api/map-editor/assets", async () => {
    await restartWithTempRepo();
    const response = await fetch(`${baseUrl}/api/map-editor/assets?path=content/maps/default-map.json`);

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("path_not_allowed");
  });

  it("supports OPTIONS preflight", async () => {
    const response = await fetch(`${baseUrl}/api/map-editor/save`, { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("returns 404 for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/api/event-editor/something-else`);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe("not_found");
  });

  it("rejects non-GET methods", async () => {
    const response = await fetch(`${baseUrl}/api/health`, { method: "POST" });
    expect(response.status).toBe(405);
    const body = await response.json();
    expect(body.error.code).toBe("method_not_allowed");
  });

  async function restartWithTempRepo() {
    await new Promise((resolve) => server.close(resolve));
    tempRepoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "stellar-map-server-"));
    await writeTempJson("content/maps/default-map.json", minimalMap("default-map"));
    await writeTempJson("content/maps/tilesets/registry.json", {
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
    await writeTempJson("content/map-objects/resources.json", { map_objects: [] });
    await writeTempJson("content/schemas/maps.schema.json", { title: "maps schema" });
    await writeTempJson("content/schemas/map-tilesets.schema.json", { title: "tileset schema" });
    await writeTempJson("content/schemas/map-objects.schema.json", { title: "map objects schema" });
    await fs.mkdir(path.join(tempRepoRoot, "assets/test"), { recursive: true });
    await fs.writeFile(path.join(tempRepoRoot, "assets/test/sample.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    server = createHelperServer({ repoRoot: tempRepoRoot });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  async function postJson(pathname, body) {
    return fetch(`${baseUrl}${pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function writeTempJson(relativePath, value) {
    const absolutePath = path.join(tempRepoRoot, relativePath);
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
    visual: {
      layers: [
        {
          id: "terrain",
          name: "Terrain",
          visible: true,
          locked: false,
          opacity: 1,
          cells: {
            "1-1": { tilesetId: "test-tileset", tileIndex: 0 },
          },
        },
      ],
    },
  };
}
