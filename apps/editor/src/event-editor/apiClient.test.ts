import { describe, expect, it, vi } from "vitest";
import { DEFAULT_HELPER_BASE_URL, EventEditorApiError, loadEventEditorLibrary } from "./apiClient";
import type { EventEditorLibraryResponse } from "./types";

describe("event editor API client", () => {
  it("loads the event editor library from the helper API", async () => {
    const library = createLibraryResponse();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(library), { status: 200 }));

    await expect(loadEventEditorLibrary({ fetchImpl })).resolves.toEqual(library);

    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/event-editor/library`, {
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

    await expect(loadEventEditorLibrary({ fetchImpl })).rejects.toMatchObject({
      name: "EventEditorApiError",
      code: "not_found",
      message: "Route not found.",
      status: 404,
    });
  });

  it("uses a local startup hint when the helper cannot be reached", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(loadEventEditorLibrary({ fetchImpl })).rejects.toBeInstanceOf(EventEditorApiError);
    await expect(loadEventEditorLibrary({ fetchImpl })).rejects.toMatchObject({
      code: "helper_unavailable",
      message: expect.stringContaining("npm run editor:helper"),
    });
  });
});

function createLibraryResponse(): EventEditorLibraryResponse {
  return {
    definitions: [],
    call_templates: [],
    presets: [],
    handlers: [],
    schemas: {},
  };
}
