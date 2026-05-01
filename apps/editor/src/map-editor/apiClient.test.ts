import { describe, expect, it, vi } from "vitest";
import { DEFAULT_HELPER_BASE_URL, MapEditorApiError, loadMapEditorLibrary, saveMapDraft, validateMapDraft } from "./apiClient";
import { createMapEditorDraft } from "./mapEditorModel";
import type { MapEditorLibraryResponse } from "./apiClient";

describe("map editor API client", () => {
  it("loads the map editor library from the helper API", async () => {
    const library = createLibraryResponse();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(library), { status: 200 }));

    await expect(loadMapEditorLibrary({ fetchImpl })).resolves.toEqual(library);

    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/map-editor/library`, {
      headers: { Accept: "application/json" },
    });
  });

  it("turns helper JSON errors into actionable API errors", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "not_found", message: "Route not found." } }), {
          status: 404,
        }),
    );

    await expect(loadMapEditorLibrary({ fetchImpl })).rejects.toMatchObject({
      name: "MapEditorApiError",
      code: "not_found",
      message: "Route not found.",
      status: 404,
    });
  });

  it("uses a local startup hint when the helper cannot be reached", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(loadMapEditorLibrary({ fetchImpl })).rejects.toBeInstanceOf(MapEditorApiError);
    await expect(loadMapEditorLibrary({ fetchImpl })).rejects.toMatchObject({
      code: "helper_unavailable",
      message: expect.stringContaining("npm run editor:helper"),
    });
  });

  it("validates map drafts through the helper API", async () => {
    const draft = createMapEditorDraft({ id: "crash-site", name: "Crash Site", rows: 1, cols: 1 });
    const validation = { valid: true, errors: [], warnings: [] };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(validation), { status: 200 }));

    await expect(validateMapDraft({ filePath: "content/maps/crash-site.json", data: draft, fetchImpl })).resolves.toEqual(validation);

    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/map-editor/validate`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ file_path: "content/maps/crash-site.json", data: draft }),
    });
  });

  it("omits file_path when saving a new map so helper conflict checks remain authoritative", async () => {
    const draft = createMapEditorDraft({ id: "new-site", name: "New Site", rows: 1, cols: 1 });
    const saveResult = { saved: true, file_path: "content/maps/new-site.json", errors: [], warnings: [] };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(saveResult), { status: 200 }));

    await expect(saveMapDraft({ filePath: null, data: draft, fetchImpl })).resolves.toEqual(saveResult);

    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/map-editor/save`, expect.objectContaining({
      body: JSON.stringify({ data: draft }),
    }));
  });

  it("surfaces save conflicts as API errors", async () => {
    const draft = createMapEditorDraft({ id: "default-map", name: "Default Map", rows: 1, cols: 1 });
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: "file_exists", message: "Map file already exists." } }), {
          status: 409,
        }),
    );

    await expect(saveMapDraft({ filePath: null, data: draft, fetchImpl })).rejects.toMatchObject({
      code: "file_exists",
      status: 409,
    });
  });
});

function createLibraryResponse(): MapEditorLibraryResponse {
  return {
    maps: [],
    tileset_registry: { tilesets: [] },
    map_objects: [],
    schemas: {},
  };
}
