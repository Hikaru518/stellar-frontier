import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEditorApiError } from "./apiClient";
import { buildDraftStorageKey } from "./draftStorage";
import EventEditorPage from "./EventEditorPage";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

describe("EventEditorPage", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads the helper library and shows a summary", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal")],
        call_templates: [createCallTemplateAsset("forest.signal.call")],
        handlers: [createHandler()],
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(screen.getByText("Loading event library...")).toBeInTheDocument();
    const summary = await screen.findByLabelText("Event library status");
    expect(summary).toHaveClass("editor-library-status-pill");
    expect(within(summary).queryByRole("heading", { name: "Library loaded" })).not.toBeInTheDocument();
    expect(within(summary).getByText("Loaded")).toBeInTheDocument();
    expect(screen.getByText("1 definition")).toBeInTheDocument();
    expect(screen.getByText("1 call template")).toBeInTheDocument();
    expect(screen.getByText("1 handler")).toBeInTheDocument();
  });

  it("shows the local helper startup hint when loading fails", async () => {
    const loadLibrary = vi.fn(
      async () =>
        Promise.reject(
          new EventEditorApiError("helper_unavailable", "Unable to reach helper. Start it with npm run editor:helper.", {
            status: 0,
          }),
        ),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByText("Helper unavailable")).toBeInTheDocument();
    expect(screen.getAllByText(/npm run editor:helper/).length).toBeGreaterThan(0);
  });

  it("shows an empty state when the library has no editable assets", async () => {
    const loadLibrary = vi.fn(async () => createLibraryResponse());

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByText("No editable event assets found")).toBeInTheDocument();
  });

  it("defaults to the central inspector tab", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
        schemas: createSchemas(),
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("tab", { name: "Inspector" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Schema" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("content/schemas/events/event-definition.schema.json")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Summary" })).not.toBeInTheDocument();
  });

  it("collapses and expands the event browser pane", async () => {
    const loadLibrary = vi.fn(async () => createLibraryResponse({ definitions: [createDefinitionAsset("forest.signal")] }));

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse event browser" }));

    expect(screen.getByRole("button", { name: "Expand event browser" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Event Browser" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand event browser" }));
    expect(screen.getByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
  });

  it("restores a matching local draft and keeps changed-base drafts out of the active state", async () => {
    const asset = createDefinitionAsset("forest.signal", { base_hash: "base-a" });
    const staleAsset = createDefinitionAsset("forest.signal", { base_hash: "base-old" });
    window.localStorage.setItem(buildDraftStorageKey(asset), JSON.stringify({ id: "forest.signal", notes: "matching draft" }));
    window.localStorage.setItem(buildDraftStorageKey(staleAsset), JSON.stringify({ id: "forest.signal", notes: "stale draft" }));
    const loadLibrary = vi.fn(async () => createLibraryResponse({ definitions: [asset] }));

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByText("1 local draft restored")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("tab", { name: "Editor" }));
    fireEvent.click(screen.getByRole("tab", { name: "JSON" }));
    expect((screen.getByLabelText("Raw JSON draft") as HTMLTextAreaElement).value).toContain("matching draft");
    expect(screen.queryByText("stale draft")).not.toBeInTheDocument();
  });

  it("switches central workspace tabs without losing draft changes", async () => {
    const asset = createDefinitionAsset("forest.signal", { data: createDefinitionData() });
    const loadLibrary = vi.fn(async () => createLibraryResponse({ definitions: [asset] }));

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("tab", { name: "Inspector" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "Editor" }));
    fireEvent.click(screen.getByRole("tab", { name: "JSON" }));
    fireEvent.change(screen.getByLabelText("Raw JSON draft"), {
      target: { value: JSON.stringify({ ...asset.data, title: "Tabbed edit" }, null, 2) },
    });
    fireEvent.click(screen.getByRole("tab", { name: "Form" }));

    expect(await screen.findByLabelText(/^Title/)).toHaveValue("Tabbed edit");
    expect(screen.queryByLabelText("Raw JSON draft")).not.toBeInTheDocument();
  });

  it("persists draft edits to localStorage", async () => {
    const asset = createDefinitionAsset("forest.signal", { data: { id: "forest.signal", status: "ready" } });
    const loadLibrary = vi.fn(async () => createLibraryResponse({ definitions: [asset] }));

    render(<EventEditorPage loadLibrary={loadLibrary} />);
    fireEvent.click(await screen.findByRole("tab", { name: "Editor" }));
    fireEvent.click(screen.getByRole("tab", { name: "JSON" }));
    const draftInput = await screen.findByLabelText("Raw JSON draft");
    fireEvent.change(draftInput, {
      target: { value: '{\n  "id": "forest.signal",\n  "notes": "local change"\n}' },
    });

    await waitFor(() => {
      expect(window.localStorage.getItem(buildDraftStorageKey(asset))).toContain("local change");
    });
  });

  it("shows the content write target and a change summary when the active asset has an unsaved draft", async () => {
    const asset = createDefinitionAsset("forest.signal", { data: { id: "forest.signal", status: "ready", title: "Old title" } });
    const loadLibrary = vi.fn(async () => createLibraryResponse({ definitions: [asset] }));

    render(<EventEditorPage loadLibrary={loadLibrary} />);
    await changeRawJson({ ...asset.data, title: "New title" });

    const savePanel = await screen.findByLabelText("Save draft panel");
    expect(savePanel).toHaveTextContent("Writes to content target");
    expect(savePanel).toHaveTextContent("content/events/definitions/forest.json");
    expect(savePanel).toHaveTextContent("Changed fields: title");
    expect(within(savePanel).getByRole("button", { name: "Save draft to content" })).toBeEnabled();
  });

  it("keeps the draft and surfaces validation issues when save preflight fails", async () => {
    const asset = createDefinitionAsset("forest.signal", { data: { id: "forest.signal", status: "ready", title: "Old title" } });
    const validation = {
      passed: false,
      issues: [
        {
          severity: "error" as const,
          code: "schema_validation_failed",
          message: "title is required",
          file_path: asset.file_path,
          asset_type: asset.asset_type,
          asset_id: asset.id,
          json_path: `${asset.json_path}/title`,
        },
      ],
      command: "npm run validate:content",
    };
    const validateDraft = vi.fn(async () => ({
      status: "validated" as const,
      file_path: asset.file_path,
      asset_type: "event_definition" as const,
      asset_id: asset.id,
      validation,
    }));
    const saveDraftAsset = vi.fn();
    const loadLibrary = vi.fn(async () => createLibraryResponse({ definitions: [asset] }));

    render(<EventEditorPage loadLibrary={loadLibrary} validateDraft={validateDraft} saveDraftAsset={saveDraftAsset} />);
    await changeRawJson({ ...asset.data, title: "" });
    fireEvent.click(screen.getByRole("button", { name: "Save draft to content" }));

    expect(await screen.findByText("Draft did not pass validation.")).toBeInTheDocument();
    expect(screen.getByText("schema_validation_failed")).toBeInTheDocument();
    expect(saveDraftAsset).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(buildDraftStorageKey(asset))).toContain('"title":""');
  });

  it("reports hash conflicts without overwriting the target asset", async () => {
    const asset = createDefinitionAsset("forest.signal", { data: { id: "forest.signal", status: "ready", title: "Old title" } });
    const validateDraft = vi.fn(async () => ({
      status: "validated" as const,
      file_path: asset.file_path,
      asset_type: "event_definition" as const,
      asset_id: asset.id,
      validation: { passed: true, issues: [], command: "npm run validate:content" },
    }));
    const saveDraftAsset = vi.fn(async () =>
      Promise.reject(
        Object.assign(new Error("The target asset changed after this draft was created."), {
          name: "EventEditorApiError",
          code: "conflict",
          status: 409,
          details: { current_base_hash: "c".repeat(64) },
        }),
      ),
    );
    const loadLibrary = vi.fn(async () => createLibraryResponse({ definitions: [asset] }));

    render(<EventEditorPage loadLibrary={loadLibrary} validateDraft={validateDraft} saveDraftAsset={saveDraftAsset} />);
    await changeRawJson({ ...asset.data, title: "Attempted overwrite" });
    fireEvent.click(screen.getByRole("button", { name: "Save draft to content" }));

    expect(await screen.findByText("Hash conflict detected.")).toBeInTheDocument();
    expect(screen.getByText(/Reload the library or manually merge/)).toBeInTheDocument();
    expect(window.localStorage.getItem(buildDraftStorageKey(asset))).toContain("Attempted overwrite");
    expect(loadLibrary).toHaveBeenCalledTimes(1);
  });

  it("keeps the draft and gives a helper startup hint when saving cannot reach the helper", async () => {
    const asset = createDefinitionAsset("forest.signal", { data: { id: "forest.signal", status: "ready", title: "Old title" } });
    const validateDraft = vi.fn(async () => ({
      status: "validated" as const,
      file_path: asset.file_path,
      asset_type: "event_definition" as const,
      asset_id: asset.id,
      validation: { passed: true, issues: [], command: "npm run validate:content" },
    }));
    const saveDraftAsset = vi.fn(async () =>
      Promise.reject(
        Object.assign(new Error("Unable to reach helper."), {
          name: "EventEditorApiError",
          code: "helper_unavailable",
          status: 0,
        }),
      ),
    );
    const loadLibrary = vi.fn(async () => createLibraryResponse({ definitions: [asset] }));

    render(<EventEditorPage loadLibrary={loadLibrary} validateDraft={validateDraft} saveDraftAsset={saveDraftAsset} />);
    await changeRawJson({ ...asset.data, title: "Local edit while helper offline" });
    fireEvent.click(screen.getByRole("button", { name: "Save draft to content" }));

    expect(await screen.findByText(/Helper unavailable/)).toBeInTheDocument();
    expect(screen.getByText(/npm run editor:helper/)).toBeInTheDocument();
    expect(window.localStorage.getItem(buildDraftStorageKey(asset))).toContain("Local edit while helper offline");
    expect(loadLibrary).toHaveBeenCalledTimes(1);
  });

  it("clears the saved draft and refreshes the library to the new base hash", async () => {
    const asset = createDefinitionAsset("forest.signal", {
      base_hash: "base-a",
      data: { id: "forest.signal", status: "ready", title: "Old title" },
    });
    const refreshedAsset = createDefinitionAsset("forest.signal", {
      base_hash: "base-b",
      data: { id: "forest.signal", status: "ready", title: "Saved title" },
    });
    const loadLibrary = vi
      .fn<() => Promise<EventEditorLibraryResponse>>()
      .mockResolvedValueOnce(createLibraryResponse({ definitions: [asset] }))
      .mockResolvedValueOnce(createLibraryResponse({ definitions: [refreshedAsset] }));
    const validateDraft = vi.fn(async () => ({
      status: "validated" as const,
      file_path: asset.file_path,
      asset_type: "event_definition" as const,
      asset_id: asset.id,
      validation: { passed: true, issues: [], command: "npm run validate:content" },
    }));
    const saveDraftAsset = vi.fn(async () => ({
      status: "saved" as const,
      file_path: asset.file_path,
      asset_type: "event_definition" as const,
      asset_id: asset.id,
      base_hash: "base-b",
      validation: { passed: true, issues: [], command: "npm run validate:content" },
    }));

    render(<EventEditorPage loadLibrary={loadLibrary} validateDraft={validateDraft} saveDraftAsset={saveDraftAsset} />);
    await changeRawJson({ ...asset.data, title: "Saved title" });
    fireEvent.click(screen.getByRole("button", { name: "Save draft to content" }));

    expect(await screen.findByText("Saved to content/events/definitions/forest.json.")).toBeInTheDocument();
    expect(window.localStorage.getItem(buildDraftStorageKey(asset))).toBeNull();
    expect((screen.getByLabelText("Raw JSON draft") as HTMLTextAreaElement).value).toContain("Saved title");
    expect(screen.getByLabelText("Selection summary")).toHaveTextContent("base-b");
    expect(loadLibrary).toHaveBeenCalledTimes(2);
    expect(validateDraft.mock.invocationCallOrder[0]).toBeLessThan(saveDraftAsset.mock.invocationCallOrder[0]);
  });

  it("updates the selection summary from the event browser and keeps legacy assets read-only", async () => {
    const definition = createDefinitionAsset("forest.signal", {
      data: {
        id: "forest.signal",
        title: "Signal flare",
        summary: "Crew finds a rescue marker.",
        trigger: { type: "arrival" },
        effect_groups: [],
      },
    });
    const legacy = createLegacyAsset("legacy.distress");
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [definition],
        legacy_events: [legacy],
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /select legacy.distress/i }));

    expect(screen.getByRole("heading", { name: "Selection summary" })).toBeInTheDocument();
    const summary = screen.getByLabelText("Selection summary");
    expect(summary).toHaveTextContent("legacy.distress");
    expect(summary).toHaveTextContent("Read-only legacy format");
    expect(screen.queryByLabelText("Raw JSON draft")).not.toBeInTheDocument();
  });

  it("shows schema, graph, and validation details in the central inspector", async () => {
    const definition = createDefinitionAsset("forest.signal", {
      data: createDefinitionData(),
    });
    const callTemplate = createCallTemplateAsset("forest.signal.call", {
      data: createCallTemplateData(),
      json_path: "$.call_templates[0]",
    });
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [definition],
        call_templates: [callTemplate],
        schemas: createSchemas(),
        validation: {
          passed: false,
          issues: [
            {
              severity: "error",
              code: "missing_variant",
              message: "Opening line needs a default variant.",
              asset_type: "call_template",
              asset_id: "forest.signal.call",
              json_path: "$.call_templates[0].opening_lines",
            },
          ],
        },
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Inspector" })).toBeInTheDocument();
    expect(screen.getByText("content/schemas/events/event-definition.schema.json")).toBeInTheDocument();
    expect(screen.getByText("$.event_graph.nodes")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("tablist", { name: "Inspector tabs" })).getByRole("tab", { name: "Inspector Graph" }));
    expect(within(screen.getByRole("list", { name: "Graph nodes" })).getByText("intro_call")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Graph transitions" })).getByText("intro_call -> resolved")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Terminal graph nodes" })).getByText("resolved")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
    fireEvent.click(screen.getByRole("button", { name: /open issue missing_variant/i }));

    expect(screen.getByLabelText("Selection summary")).toHaveTextContent("forest.signal.call");
    const selectedPath = screen.getByLabelText("Selected JSON path");
    expect(selectedPath).toHaveTextContent("Selected JSON path");
    expect(selectedPath).toHaveTextContent("$.call_templates[0].opening_lines");
  });

  it("previews call dialogue and options without entering the save flow", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
        call_templates: [createCallTemplateAsset("forest.signal.call", { data: createCallTemplateData() })],
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Inspector" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));

    expect(screen.getByText("Amy reports a signal flare.")).toBeInTheDocument();
    expect(screen.getByText("Ask Amy to investigate.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });
});

function createLibraryResponse(overrides: Partial<EventEditorLibraryResponse> = {}): EventEditorLibraryResponse {
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
    ...overrides,
  };
}

async function changeRawJson(nextDraft: unknown): Promise<void> {
  const editorTab = await screen.findByRole("tab", { name: "Editor" });
  fireEvent.click(editorTab);
  const jsonTab = await screen.findByRole("tab", { name: "JSON" });
  fireEvent.click(jsonTab);
  const draftInput = await screen.findByLabelText("Raw JSON draft");
  fireEvent.change(draftInput, {
    target: { value: JSON.stringify(nextDraft, null, 2) },
  });
}

function createAsset(id: string, overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return {
    id,
    domain: "forest",
    asset_type: "event_definition" as const,
    file_path: "content/events/definitions/forest.json",
    json_path: "$.event_definitions[0]",
    base_hash: "base-a",
    data: { id, status: "ready" },
    editable: true,
    ...overrides,
  };
}

function createDefinitionAsset(
  id: string,
  overrides: Partial<EditorEventAsset<unknown>> = {},
): EventEditorLibraryResponse["definitions"][number] {
  return createAsset(id, overrides) as EventEditorLibraryResponse["definitions"][number];
}

function createCallTemplateAsset(
  id: string,
  overrides: Partial<EditorEventAsset<unknown>> = {},
): EventEditorLibraryResponse["call_templates"][number] {
  return createAsset(id, {
    asset_type: "call_template",
    file_path: "content/events/call_templates/forest.json",
    ...overrides,
  }) as EventEditorLibraryResponse["call_templates"][number];
}

function createLegacyAsset(id: string, overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return createAsset(id, {
    asset_type: "legacy_event",
    file_path: "content/events/events.json",
    editable: false,
    data: { id, title: "Legacy distress beacon" },
    ...overrides,
  });
}

function createHandler() {
  return {
    handler_type: "grant_item",
    kind: "effect" as const,
    description: "Grant item",
    params_schema_ref: "#/$defs/grant_item",
    allowed_target_types: ["crew_inventory" as const],
    deterministic: true,
    uses_random: false,
    failure_policy: "fail_event" as const,
    sample_fixtures: [],
  };
}

function createDefinitionData(): unknown {
  return {
    schema_version: "event-definition.v1",
    id: "forest.signal",
    version: 1,
    domain: "forest",
    title: "Signal flare",
    summary: "Crew finds a rescue marker.",
    status: "ready_for_test",
    trigger: { type: "arrival" },
    candidate_selection: {
      priority: 10,
      weight: 1,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    },
    repeat_policy: {
      scope: "global",
      cooldown_seconds: 0,
      history_key_template: "forest.signal",
      allow_while_active: false,
    },
    event_graph: {
      entry_node_id: "intro_call",
      nodes: [
        {
          id: "intro_call",
          type: "call",
          title: "Incoming signal",
          blocking: { occupies_crew_action: false, occupies_communication: true },
          call_template_id: "forest.signal.call",
          speaker_crew_ref: { type: "crew_id", id: "amy" },
          urgency: "normal",
          delivery: "incoming_call",
          options: [{ id: "investigate", is_default: true }],
          option_node_mapping: { investigate: "resolved" },
        },
        {
          id: "resolved",
          type: "end",
          title: "Resolved",
          blocking: { occupies_crew_action: false, occupies_communication: false },
        },
      ],
      edges: [{ from_node_id: "intro_call", to_node_id: "resolved", via: "investigate" }],
      terminal_node_ids: ["resolved"],
      graph_rules: { acyclic: true, max_active_nodes: 1, allow_parallel_nodes: false },
    },
    effect_groups: [
      {
        id: "effects",
        effects: [
          {
            id: "grant-signal-flare",
            type: "handler_effect",
            target: { type: "crew_inventory", ref: "amy" },
            handler_type: "grant_item",
            params: { item_id: "signal_flare", quantity: 1 },
            failure_policy: "fail_event",
            record_policy: { write_event_log: false, write_world_history: false },
          },
        ],
      },
    ],
    sample_contexts: [
      {
        trigger_type: "arrival",
        occurred_at: 25,
        source: "tile_system",
        crew_id: "amy",
        tile_id: "forest-a1",
        payload: {
          preview_state: {
            crew: {
              amy: {
                id: "amy",
                display_name: "Amy",
              },
            },
            baseInventory: [],
          },
        },
      },
    ],
  };
}

function createCallTemplateData(): unknown {
  return {
    schema_version: "event-call-template.v1",
    id: "forest.signal.call",
    version: 1,
    domain: "forest",
    event_definition_id: "forest.signal",
    node_id: "intro_call",
    render_context_fields: ["crew_display_name"],
    opening_lines: {
      selection: "first_match",
      variants: [{ id: "default", text: "{{crew_display_name}} reports a signal flare.", priority: 0 }],
    },
    option_lines: {
      investigate: {
        selection: "first_match",
        variants: [{ id: "default", text: "Ask {{crew_display_name}} to investigate.", priority: 0 }],
      },
    },
    fallback_order: ["default"],
    default_variant_required: true,
  };
}

function createSchemas(): Record<string, unknown> {
  return {
    "content/schemas/events/event-definition.schema.json": {
      $defs: {
        event_definition: {
          type: "object",
          required: ["id", "event_graph"],
          properties: {
            id: { type: "string", description: "Unique event definition id." },
            title: { type: "string", description: "Planning-facing title." },
            event_graph: {
              type: "object",
              properties: {
                nodes: { type: "array", description: "Runtime graph nodes." },
              },
            },
          },
        },
      },
    },
    "content/schemas/events/call-template.schema.json": {
      $defs: {
        call_template: {
          type: "object",
          properties: {
            opening_lines: { type: "object", description: "Rendered opening dialogue." },
          },
        },
      },
    },
  };
}

function installMemoryLocalStorage(): void {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
      key: (index: number) => Array.from(values.keys())[index] ?? null,
      get length() {
        return values.size;
      },
    } satisfies Storage,
  });
}
