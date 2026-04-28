import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_HELPER_BASE_URL,
  EventEditorApiError,
  loadEventEditorLibrary,
  saveEventEditorDraft,
  validateEventEditorDraft,
} from "./apiClient";
import type { EventEditorLibraryResponse, EventEditorSaveRequest } from "./types";

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

  it("validates an event draft through the helper without saving", async () => {
    const validationResponse = {
      status: "validated",
      file_path: "content/events/definitions/forest.json",
      asset_type: "event_definition",
      asset_id: "forest.signal",
      validation: { passed: true, issues: [], command: "npm run validate:content" },
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(validationResponse), { status: 200 }));
    const request = createSaveRequest();

    await expect(validateEventEditorDraft(request, { fetchImpl })).resolves.toEqual(validationResponse);

    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/event-editor/validate-draft`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  });

  it("saves an event draft through the helper with a change summary", async () => {
    const saveResponse = {
      status: "saved",
      file_path: "content/events/definitions/forest.json",
      asset_type: "event_definition",
      asset_id: "forest.signal",
      base_hash: "b".repeat(64),
      validation: { passed: true, issues: [], command: "npm run validate:content" },
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(saveResponse), { status: 200 }));
    const request = createSaveRequest({ change_summary: "Changed fields: title" });

    await expect(saveEventEditorDraft(request, { fetchImpl })).resolves.toEqual(saveResponse);

    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/event-editor/save`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  });

  it("preserves helper conflict details on save errors", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "conflict", message: "The target asset changed after this draft was created." },
            current_base_hash: "c".repeat(64),
          }),
          { status: 409 },
        ),
    );

    await expect(saveEventEditorDraft(createSaveRequest(), { fetchImpl })).rejects.toMatchObject({
      name: "EventEditorApiError",
      code: "conflict",
      message: "The target asset changed after this draft was created.",
      status: 409,
      details: { current_base_hash: "c".repeat(64) },
    });
  });

  it("uses the local startup hint when saving cannot reach the helper", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(saveEventEditorDraft(createSaveRequest(), { fetchImpl })).rejects.toMatchObject({
      code: "helper_unavailable",
      message: expect.stringContaining("npm run editor:helper"),
    });
  });
});

function createLibraryResponse(): EventEditorLibraryResponse {
  return {
    manifest: { schema_version: "event-manifest.v1", domains: [] },
    domains: ["forest"],
    definitions: [],
    call_templates: [],
    handlers: [],
    presets: [],
    legacy_events: [],
    schemas: {},
    validation: { passed: true, issues: [] },
  };
}

function createSaveRequest(overrides: Partial<EventEditorSaveRequest> = {}): EventEditorSaveRequest {
  return {
    asset_type: "event_definition",
    asset_id: "forest.signal",
    file_path: "content/events/definitions/forest.json",
    json_path: "/event_definitions/0",
    base_hash: "a".repeat(64),
    draft: { id: "forest.signal", title: "Signal flare" },
    ...overrides,
  };
}
