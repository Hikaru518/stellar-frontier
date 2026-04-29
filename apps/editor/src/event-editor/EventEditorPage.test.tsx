import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventEditorApiError } from "./apiClient";
import EventEditorPage from "./EventEditorPage";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

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
    expect(within(triggerSummary).getByText("kael")).toBeInTheDocument();
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
      crew_ids: ["kael"],
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
