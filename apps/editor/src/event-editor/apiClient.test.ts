import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_HELPER_BASE_URL,
  EventEditorApiError,
  createDomain,
  createDraft,
  loadDraft,
  loadEventEditorLibrary,
  saveDraft,
  validateDraft,
} from "./apiClient";
import type { CreateDraftRequest, EventDraftEnvelope, EventEditorLibraryResponse } from "./types";

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
        new Response(
          JSON.stringify({
            error: {
              code: "not_found",
              message: "Route not found.",
              details: { route: "/api/event-editor/library" },
            },
          }),
          {
            status: 404,
          },
        ),
    );

    await expect(loadEventEditorLibrary({ fetchImpl })).rejects.toMatchObject({
      name: "EventEditorApiError",
      code: "not_found",
      message: "Route not found.",
      status: 404,
      details: { route: "/api/event-editor/library" },
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

  it("creates event domains through the helper API", async () => {
    const response = {
      created: true,
      domain: {
        id: "ruins",
        manifest_path: "content/events/manifest.json",
        manifest_json_path: "/domains/1",
        definitions_file_path: "content/events/definitions/ruins.json",
        call_templates_file_path: "content/events/call_templates/ruins.json",
        presets_file_path: null,
        definition_count: 0,
        call_template_count: 0,
        preset_count: 0,
        has_presets: false,
        editable: true,
      },
      written_files: [
        "content/events/definitions/ruins.json",
        "content/events/call_templates/ruins.json",
        "content/events/manifest.json",
      ],
      issues: [],
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));

    await expect(createDomain({ domainId: "ruins", fetchImpl })).resolves.toEqual(response);

    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/event-editor/domains`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain_id: "ruins" }),
    });
  });

  it("creates new and edit-existing drafts with contract-only request bodies", async () => {
    const draft = createDraftEnvelope();
    const createResponse = { draft, file_path: "content/events/drafts/forest_bridge_choice_20260505_153012.json" };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(createResponse), { status: 200 }));
    const newRequest = {
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_bridge_choice",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
      extra_field: "must not be sent",
    } as CreateDraftRequest & { extra_field: string };

    await expect(createDraft({ request: newRequest, fetchImpl })).resolves.toEqual(createResponse);

    expect(fetchImpl).toHaveBeenLastCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/event-editor/drafts`, expect.any(Object));
    expect(readLastJsonBody(fetchImpl)).toEqual({
      mode: "new",
      target_domain: "forest",
      definition_id: "forest_bridge_choice",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
    });

    const editRequest = {
      mode: "edit_existing",
      domain: "forest",
      definition_id: "forest_trace",
      title: "must not be sent",
    } as CreateDraftRequest & { title: string };

    await expect(createDraft({ request: editRequest, fetchImpl })).resolves.toEqual(createResponse);

    expect(fetchImpl).toHaveBeenLastCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/event-editor/drafts`, expect.any(Object));
    expect(readLastJsonBody(fetchImpl)).toEqual({
      mode: "edit_existing",
      domain: "forest",
      definition_id: "forest_trace",
    });
  });

  it("loads active or archived drafts from the helper API", async () => {
    const draft = createDraftEnvelope({ status: "archived", published_at: "2026-05-05T16:00:00.000Z" });
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(draft), { status: 200 }));

    await expect(loadDraft({ draftId: "forest_bridge_choice_20260505_153012", includeArchived: true, fetchImpl })).resolves.toEqual(draft);

    expect(fetchImpl).toHaveBeenCalledWith(
      `${DEFAULT_HELPER_BASE_URL}/api/event-editor/drafts/forest_bridge_choice_20260505_153012?include_archived=true`,
      { headers: { Accept: "application/json" } },
    );
  });

  it("saves draft envelopes with contract-only request bodies", async () => {
    const draft = createDraftEnvelope();
    const response = {
      saved: true,
      file_path: "content/events/drafts/forest_bridge_choice_20260505_153012.json",
      draft_hash: "b".repeat(64),
      issues: [],
      draft: createDraftEnvelope({ hashes: { ...draft.hashes, draft: "b".repeat(64) } }),
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));

    await expect(saveDraft({
      draftId: draft.draft_id,
      draft,
      expectedDraftHash: "a".repeat(64),
      fetchImpl,
    })).resolves.toEqual(response);

    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/event-editor/drafts/${draft.draft_id}/save`, expect.any(Object));
    expect(readLastJsonBody(fetchImpl)).toEqual({
      draft,
      expected_draft_hash: "a".repeat(64),
    });
  });

  it("returns 200 validation failures instead of throwing", async () => {
    const draft = createDraftEnvelope();
    const validation = {
      valid: false,
      issues: [
        {
          severity: "error",
          code: "invalid_working_definition",
          message: "working_definition must be an object.",
          asset_type: "draft",
          asset_id: draft.draft_id,
          json_path: "/working_definition",
        },
      ],
    };
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(validation), { status: 200 }));

    await expect(validateDraft({ draftId: draft.draft_id, level: "draft", draft, fetchImpl })).resolves.toEqual(validation);

    expect(fetchImpl).toHaveBeenCalledWith(`${DEFAULT_HELPER_BASE_URL}/api/event-editor/drafts/${draft.draft_id}/validate`, expect.any(Object));
    expect(readLastJsonBody(fetchImpl)).toEqual({
      draft,
      level: "draft",
    });
  });

  it("surfaces draft save conflicts as API errors with helper details", async () => {
    const draft = createDraftEnvelope();
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "draft_hash_conflict",
              message: "Draft has changed on disk.",
              details: {
                draft_id: draft.draft_id,
                expected_draft_hash: "a".repeat(64),
                actual_draft_hash: "b".repeat(64),
              },
            },
          }),
          { status: 409 },
        ),
    );

    await expect(saveDraft({ draftId: draft.draft_id, draft, expectedDraftHash: "a".repeat(64), fetchImpl })).rejects.toMatchObject({
      code: "draft_hash_conflict",
      status: 409,
      details: {
        draft_id: draft.draft_id,
        expected_draft_hash: "a".repeat(64),
        actual_draft_hash: "b".repeat(64),
      },
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
    domains: [],
    drafts: [],
  };
}

function readLastJsonBody(fetchImpl: ReturnType<typeof vi.fn>): unknown {
  const lastCall = fetchImpl.mock.calls[fetchImpl.mock.calls.length - 1];
  const init = lastCall?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body));
}

function createDraftEnvelope(overrides: Partial<EventDraftEnvelope> = {}): EventDraftEnvelope {
  const draft: EventDraftEnvelope = {
    schema_version: "event-editor-draft-v1",
    draft_id: "forest_bridge_choice_20260505_153012",
    mode: "new",
    status: "active",
    source: null,
    target: {
      domain: "forest",
      definition_id: "forest_bridge_choice",
      definition_file_path: "content/events/definitions/forest.json",
      call_template_file_path: "content/events/call_templates/forest.json",
    },
    working_definition: {
      id: "forest_bridge_choice",
      domain: "forest",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
    },
    working_call_templates: [],
    editor_state: {
      active_step: "basic",
      selection: null,
      collapsed_sections: [],
    },
    hashes: {
      source_definition_file: null,
      source_call_template_file: null,
      source_manifest: null,
      draft: "a".repeat(64),
    },
    created_at: "2026-05-05T15:30:12.000Z",
    updated_at: "2026-05-05T15:30:12.000Z",
    published_at: null,
    published_files: [],
  };

  return {
    ...draft,
    ...overrides,
  };
}
