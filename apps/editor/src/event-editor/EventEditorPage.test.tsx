import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEditorApiError } from "./apiClient";
import EventEditorPage from "./EventEditorPage";
import type {
  CreateDomainResponse,
  CreateDraftResponse,
  EditorEventAsset,
  EventDomainSummary,
  EventDraftEnvelope,
  EventDraftSummary,
  EventEditorLibraryResponse,
} from "./types";

describe("EventEditorPage", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    installResizeObserver();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads the helper library and shows a summary pill", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
        call_templates: [createCallTemplateAsset("forest.signal.call", { data: createCallTemplateData() })],
        schemas: createSchemas(),
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(screen.getByText("Loading event library...")).toBeInTheDocument();
    const summary = await screen.findByLabelText("Event library status");
    expect(within(summary).getByText("Loaded")).toBeInTheDocument();
    expect(within(summary).getByText("1 definition")).toBeInTheDocument();
    expect(within(summary).getByText("1 call template")).toBeInTheDocument();
  });

  it("shows the helper startup hint when loading fails", async () => {
    const loadLibrary = vi.fn(async () =>
      Promise.reject(
        new EventEditorApiError("helper_unavailable", "Unable to reach helper. Start it with npm run editor:helper.", { status: 0 }),
      ),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByText("Helper unavailable")).toBeInTheDocument();
    expect(screen.getAllByText(/npm run editor:helper/).length).toBeGreaterThan(0);
  });

  it("shows an empty state when the library has no event assets", async () => {
    const loadLibrary = vi.fn(async () => createLibraryResponse());

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByText("No event assets found")).toBeInTheDocument();
  });

  it("shows active drafts and the Create Event entry", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
        domains: [createDomainSummary("forest")],
        drafts: [
          createDraftSummary("forest_bridge_choice_20260505_153012", { title: "Bridge choice" }),
          createDraftSummary("forest_archived_20260505_153012", { status: "archived", title: "Archived draft" }),
        ],
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Draft Browser" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Event" })).toBeInTheDocument();

    const draftList = screen.getByRole("list", { name: "Active drafts" });
    expect(within(draftList).getByText("forest_bridge_choice_20260505_153012")).toBeInTheDocument();
    expect(within(draftList).queryByText("forest_archived_20260505_153012")).not.toBeInTheDocument();
  });

  it("creates an edit-existing draft from a definition row with the exact request", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
        domains: [createDomainSummary("forest")],
        schemas: createSchemas(),
      }),
    );
    const createDraftRequest = vi.fn(async (): Promise<CreateDraftResponse> => ({
      draft: createDraftEnvelope({
        draft_id: "forest_signal_20260505_153012",
        mode: "edit_existing",
        target: {
          domain: "forest",
          definition_id: "forest.signal",
          definition_file_path: "content/events/definitions/forest.json",
          call_template_file_path: "content/events/call_templates/forest.json",
        },
        working_definition: createDefinitionData() as EventDraftEnvelope["working_definition"],
      }),
      file_path: "content/events/drafts/forest_signal_20260505_153012.json",
    }));

    render(<EventEditorPage loadLibrary={loadLibrary} createDraftRequest={createDraftRequest} />);

    fireEvent.click(await screen.findByRole("button", { name: "Edit Existing forest.signal" }));

    await waitFor(() => {
      expect(createDraftRequest).toHaveBeenCalledWith({
        mode: "edit_existing",
        definition_id: "forest.signal",
        domain: "forest",
      });
    });
    expect(await screen.findByRole("heading", { name: "Event Authoring Workspace" })).toBeInTheDocument();
    expect(screen.getByText("forest_signal_20260505_153012")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Basic" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByLabelText("Draft domain")).toHaveTextContent("forest");
    expect(screen.getByLabelText("Draft domain")).toHaveTextContent("Locked");
    expect(screen.getByLabelText("Draft definition id")).toHaveTextContent("forest.signal");
    expect(screen.getByLabelText("Draft definition id")).toHaveTextContent("Locked");
  });

  it("opens a draft into the authoring workspace and changes wizard steps", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        domains: [createDomainSummary("forest")],
        drafts: [createDraftSummary("forest_bridge_choice_20260505_153012")],
      }),
    );
    const loadDraftRequest = vi.fn(async (): Promise<EventDraftEnvelope> => createDraftEnvelope());

    render(<EventEditorPage loadLibrary={loadLibrary} loadDraftRequest={loadDraftRequest} />);

    fireEvent.click(await screen.findByRole("button", { name: "Open draft forest_bridge_choice_20260505_153012" }));

    expect(await screen.findByRole("heading", { name: "Event Authoring Workspace" })).toBeInTheDocument();
    const stepNav = screen.getByRole("navigation", { name: "Event authoring steps" });
    for (const label of ["Basic", "Trigger", "Graph", "Effects", "Review"]) {
      expect(within(stepNav).getByRole("button", { name: label })).toBeInTheDocument();
    }

    fireEvent.click(within(stepNav).getByRole("button", { name: "Review" }));

    expect(within(stepNav).getByRole("button", { name: "Review" })).toHaveAttribute("aria-current", "step");
    expect(screen.getByRole("heading", { name: "Review" })).toBeInTheDocument();
    expect(screen.getByLabelText("Draft metadata")).toHaveTextContent("review");
  });

  it("creates a domain and refreshes library summaries", async () => {
    const forestLibrary = createLibraryResponse({
      definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
      domains: [createDomainSummary("forest")],
    });
    const refreshedLibrary = createLibraryResponse({
      definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
      domains: [createDomainSummary("forest"), createDomainSummary("ruins")],
    });
    const loadLibrary = vi.fn().mockResolvedValueOnce(forestLibrary).mockResolvedValueOnce(refreshedLibrary);
    const createDomainRequest = vi.fn(async (domainId: string): Promise<CreateDomainResponse> => createDomainResponse(domainId));

    render(<EventEditorPage loadLibrary={loadLibrary} createDomainRequest={createDomainRequest} />);

    fireEvent.click(await screen.findByRole("button", { name: "Create Domain" }));
    fireEvent.change(screen.getByLabelText("Domain id"), { target: { value: "ruins" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(createDomainRequest).toHaveBeenCalledWith("ruins");
      expect(loadLibrary).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByLabelText("Event library status")).toHaveTextContent("2 domains");
    expect(screen.getByLabelText("Create event domain")).toHaveTextContent("ruins");
  });

  it("shows a readable create draft error without clearing the current library", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
        domains: [createDomainSummary("forest")],
        schemas: createSchemas(),
      }),
    );
    const createDraftRequest = vi.fn(async (): Promise<CreateDraftResponse> => {
      throw new EventEditorApiError("helper_unavailable", "Unable to reach the local event editor helper.", { status: 0 });
    });

    render(<EventEditorPage loadLibrary={loadLibrary} createDraftRequest={createDraftRequest} />);

    await screen.findByRole("heading", { name: "Draft Browser" });
    fireEvent.change(screen.getByLabelText("Definition id"), { target: { value: "forest_bridge_choice" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Event" }));

    expect(await screen.findByText("Helper unavailable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /select forest.signal/i })).toBeInTheDocument();
  });

  it("defaults to the schema tab and renders schema fields for the active asset", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
        schemas: createSchemas(),
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("tab", { name: "Schema" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Inspector Graph" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByText("content/schemas/events/event-definition.schema.json")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Inspector" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Editor" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Preview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Validation" })).not.toBeInTheDocument();
  });

  it("collapses and expands the event browser pane", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({ definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })] }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Collapse event browser" }));
    expect(screen.getByRole("button", { name: "Expand event browser" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Event Browser" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand event browser" }));
    expect(screen.getByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
  });

  it("switches to the graph tab and renders the trigger and graph canvas", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
        call_templates: [createCallTemplateAsset("forest.signal.call", { data: createCallTemplateData() })],
        schemas: createSchemas(),
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    fireEvent.click(
      within(await screen.findByRole("tablist", { name: "Inspector tabs" })).getByRole("tab", { name: "Inspector Graph" }),
    );

    expect(screen.getByRole("heading", { name: "Event Trigger" })).toBeInTheDocument();
    expect(screen.getByLabelText("Event graph canvas")).toBeInTheDocument();
    expect(screen.getByText("option:investigate · default")).toBeInTheDocument();

    const triggerSummary = screen.getByLabelText("Event trigger summary");
    expect(within(triggerSummary).getByText(/personality_tags 包含 "relic_sensitive"/)).toBeInTheDocument();
    expect(within(triggerSummary).getByText("Repeat Policy")).toBeInTheDocument();
    expect(within(triggerSummary).getByText(/每位队员/)).toBeInTheDocument();
    expect(within(triggerSummary).getByText(/最多 1 次/)).toBeInTheDocument();
    expect(within(triggerSummary).getByText("Intended For")).toBeInTheDocument();
    expect(within(triggerSummary).getByText("amy")).toBeInTheDocument();
  });

  it("omits the Intended For row when content_refs.crew_ids is empty", async () => {
    const baseDefinition = createDefinitionData() as Record<string, unknown>;
    const { content_refs: _omit, ...withoutContentRefs } = baseDefinition;
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal", { data: withoutContentRefs })],
        call_templates: [createCallTemplateAsset("forest.signal.call", { data: createCallTemplateData() })],
        schemas: createSchemas(),
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    fireEvent.click(
      within(await screen.findByRole("tablist", { name: "Inspector tabs" })).getByRole("tab", { name: "Inspector Graph" }),
    );

    const triggerSummary = screen.getByLabelText("Event trigger summary");
    expect(within(triggerSummary).queryByText("Intended For")).not.toBeInTheDocument();
  });

  it("renders the linked event graph when a call template is selected", async () => {
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [createDefinitionAsset("forest.signal", { data: createDefinitionData() })],
        call_templates: [createCallTemplateAsset("forest.signal.call", { data: createCallTemplateData() })],
        schemas: createSchemas(),
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /select forest.signal.call/i }));

    fireEvent.click(
      within(screen.getByRole("tablist", { name: "Inspector tabs" })).getByRole("tab", { name: "Inspector Graph" }),
    );

    expect(screen.getByRole("heading", { name: "Event Trigger" })).toBeInTheDocument();
    expect(screen.getByLabelText("Event graph canvas")).toBeInTheDocument();
  });

  it("updates the selection summary from the event browser", async () => {
    const definition = createDefinitionAsset("forest.signal", { data: createDefinitionData() });
    const callTemplate = createCallTemplateAsset("forest.signal.call", { data: createCallTemplateData() });
    const loadLibrary = vi.fn(async () =>
      createLibraryResponse({
        definitions: [definition],
        call_templates: [callTemplate],
        schemas: createSchemas(),
      }),
    );

    render(<EventEditorPage loadLibrary={loadLibrary} />);

    expect(await screen.findByRole("heading", { name: "Event Browser" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /select forest.signal.call/i }));

    const summary = screen.getByLabelText("Selection summary");
    expect(summary).toHaveTextContent("forest.signal.call");
    expect(summary).toHaveTextContent("call_template");
    expect(summary).toHaveTextContent("content/events/call_templates/forest.json");
  });
});

function createLibraryResponse(overrides: Partial<EventEditorLibraryResponse> = {}): EventEditorLibraryResponse {
  return {
    definitions: [],
    call_templates: [],
    presets: [],
    handlers: [],
    schemas: {},
    ...overrides,
    domains: overrides.domains ?? [],
    drafts: overrides.drafts ?? [],
  };
}

function createDomainSummary(id: string): EventDomainSummary {
  return {
    id,
    manifest_path: "content/events/manifest.json",
    manifest_json_path: "/domains/0",
    definitions_file_path: `content/events/definitions/${id}.json`,
    call_templates_file_path: `content/events/call_templates/${id}.json`,
    presets_file_path: null,
    definition_count: 0,
    call_template_count: 0,
    preset_count: 0,
    has_presets: false,
    editable: true,
  };
}

function createDomainResponse(domainId: string): CreateDomainResponse {
  return {
    created: true,
    domain: createDomainSummary(domainId),
    written_files: [
      `content/events/definitions/${domainId}.json`,
      `content/events/call_templates/${domainId}.json`,
      "content/events/manifest.json",
    ],
    issues: [],
  };
}

function createDraftSummary(draftId: string, overrides: Partial<EventDraftSummary> = {}): EventDraftSummary {
  return {
    draft_id: draftId,
    mode: "new",
    status: "active",
    file_path: `content/events/drafts/${draftId}.json`,
    domain: "forest",
    definition_id: "forest_bridge_choice",
    target: null,
    source: null,
    title: "Bridge choice",
    summary: "Choose how to cross the bridge.",
    active_step: "basic",
    created_at: "2026-05-05T15:30:12.000Z",
    updated_at: "2026-05-05T15:30:12.000Z",
    published_at: null,
    draft_hash: "a".repeat(64),
    ...overrides,
  };
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

function createAsset(id: string, overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return {
    id,
    domain: "forest",
    asset_type: "event_definition" as const,
    file_path: "content/events/definitions/forest.json",
    json_path: "$.event_definitions[0]",
    data: { id, status: "ready" },
    editable: false,
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

function createDefinitionData(): unknown {
  return {
    schema_version: "event-definition.v1",
    id: "forest.signal",
    version: 1,
    domain: "forest",
    title: "Signal flare",
    summary: "Crew finds a rescue marker.",
    status: "ready_for_test",
    trigger: {
      type: "arrival",
      required_context: ["crew_id"],
      conditions: [
        { type: "has_tag", target: { type: "primary_crew" }, field: "personality_tags", value: "relic_sensitive" },
      ],
    },
    candidate_selection: {
      priority: 10,
      weight: 1,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    },
    repeat_policy: {
      scope: "crew",
      max_trigger_count: 1,
      cooldown_seconds: 0,
      history_key_template: "x:{crew_id}",
      allow_while_active: false,
    },
    content_refs: {
      crew_ids: ["amy"],
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
            crew: { amy: { id: "amy", display_name: "Amy" } },
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

function installResizeObserver(): void {
  class TestResizeObserver implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  });
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: TestResizeObserver,
  });
}
