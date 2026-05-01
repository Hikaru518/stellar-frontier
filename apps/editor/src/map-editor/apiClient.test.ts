import { describe, expect, it, vi } from "vitest";
import { DEFAULT_HELPER_BASE_URL, MapEditorApiError, loadMapEditorLibrary } from "./apiClient";
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
});

function createLibraryResponse(): MapEditorLibraryResponse {
  return {
    maps: [],
    tileset_registry: { tilesets: [] },
    map_objects: [],
    schemas: {},
  };
}
