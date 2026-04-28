import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EventDetailWorkspace from "./EventDetailWorkspace";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

describe("EventDetailWorkspace", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows editable assets in side-by-side form and JSON panels", () => {
    renderWorkspace();

    expect(screen.getByLabelText("Event detail workspace")).toBeInTheDocument();
    expect(screen.getByRole("form", { name: "Schema form editor" })).toBeInTheDocument();
    expect(screen.getByLabelText("Raw JSON draft")).toBeInTheDocument();
  });

  it("can render form and JSON panels independently for tabbed layouts", () => {
    const { rerender } = renderWorkspace({ mode: "form" });

    expect(screen.getByRole("form", { name: "Schema form editor" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Raw JSON draft")).not.toBeInTheDocument();

    rerender(
      <EventDetailWorkspace
        asset={createAsset()}
        draft={createDraft()}
        library={createLibraryResponse()}
        mode="json"
        onDraftChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole("form", { name: "Schema form editor" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Raw JSON draft")).toBeInTheDocument();
  });

  it("renders structured schemas that reference shared root definitions", () => {
    expect(() => renderWorkspace({ library: createLibraryResponseWithSharedDefinitions() })).not.toThrow();

    expect(screen.getByLabelText(/^Title/)).toHaveValue("Signal flare");
  });

  it("updates the JSON draft when the schema form changes", async () => {
    const onDraftChange = vi.fn();
    renderWorkspace({ onDraftChange });

    fireEvent.change(screen.getByLabelText(/^Title/), { target: { value: "Changed title" } });

    await waitFor(() => {
      expect((screen.getByLabelText("Raw JSON draft") as HTMLTextAreaElement).value).toContain('"title": "Changed title"');
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Changed title" }));
  });

  it("updates the schema form when valid JSON changes", async () => {
    const onDraftChange = vi.fn();
    renderWorkspace({ onDraftChange });

    fireEvent.change(screen.getByLabelText("Raw JSON draft"), {
      target: { value: JSON.stringify({ ...createDraft(), title: "JSON title" }, null, 2) },
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/^Title/)).toHaveValue("JSON title");
    });
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "JSON title" }));
  });

  it("keeps the last valid draft when JSON parsing fails", async () => {
    const onDraftChange = vi.fn();
    renderWorkspace({ onDraftChange });

    fireEvent.change(screen.getByLabelText("Raw JSON draft"), {
      target: { value: JSON.stringify({ ...createDraft(), title: "Last valid title" }, null, 2) },
    });
    await screen.findByDisplayValue("Last valid title");
    onDraftChange.mockClear();

    fireEvent.change(screen.getByLabelText("Raw JSON draft"), {
      target: { value: '{ "title": "broken",' },
    });

    expect(await screen.findByText(/JSON parse error/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toHaveValue("Last valid title");
    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it("gives complex event fields structured editors instead of only raw JSON", () => {
    renderWorkspace();

    expect(screen.getByText("Graph outline")).toBeInTheDocument();
    expect(screen.getByText("1 node")).toBeInTheDocument();
    expect(screen.getByText("1 edge")).toBeInTheDocument();

    const conditionEditor = screen.getByLabelText("Structured condition editor");
    expect(within(conditionEditor).getByText("compare_field")).toBeInTheDocument();
    expect(within(conditionEditor).getByText("target: primary_crew")).toBeInTheDocument();

    const effectEditor = screen.getByLabelText("Structured effect editor");
    expect(within(effectEditor).getByText("handler_effect")).toBeInTheDocument();
    expect(within(effectEditor).getByText("handler: grant_item")).toBeInTheDocument();
    expect(within(effectEditor).getByText("item_id: signal_flare")).toBeInTheDocument();
  });

  it("shows readonly legacy assets as a summary without entering draft editing", () => {
    render(
      <EventDetailWorkspace
        asset={createLegacyAsset()}
        draft={createLegacyAsset().data}
        library={createLibraryResponse()}
        onDraftChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Read-only legacy asset")).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Schema form editor" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Raw JSON draft")).not.toBeInTheDocument();
  });
});

function renderWorkspace({
  asset = createAsset(),
  draft = createDraft(),
  library = createLibraryResponse(),
  mode,
  onDraftChange = vi.fn(),
}: {
  asset?: EditorEventAsset<unknown>;
  draft?: unknown;
  library?: EventEditorLibraryResponse;
  mode?: "all" | "form" | "json";
  onDraftChange?: (draft: unknown) => void;
} = {}) {
  return render(<EventDetailWorkspace asset={asset} draft={draft} library={library} mode={mode} onDraftChange={onDraftChange} />);
}

function createDraft() {
  return {
    id: "forest.signal",
    title: "Signal flare",
    status: "draft",
    trigger: {
      type: "arrival",
      conditions: [
        {
          type: "compare_field",
          target: { type: "primary_crew" },
          field: "perception",
          op: "gte",
          value: 3,
        },
      ],
    },
    event_graph: {
      entry_node_id: "start",
      nodes: [{ id: "start", type: "end", title: "Resolved" }],
      edges: [{ from_node_id: "start", to_node_id: "start", via: "self" }],
      terminal_node_ids: ["start"],
      graph_rules: { acyclic: false, max_active_nodes: 1, allow_parallel_nodes: false },
    },
    effect_groups: [
      {
        id: "reward",
        effects: [
          {
            id: "grant-signal-flare",
            type: "handler_effect",
            target: { type: "crew_inventory", ref: "primary_crew" },
            handler_type: "grant_item",
            params: { item_id: "signal_flare", quantity: 1 },
            failure_policy: "fail_event",
            record_policy: { write_event_log: true, write_world_history: false },
          },
        ],
      },
    ],
  };
}

function createAsset(overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return {
    id: "forest.signal",
    domain: "forest",
    asset_type: "event_definition",
    file_path: "content/events/definitions/forest.json",
    json_path: "/event_definitions/0",
    base_hash: "base-a",
    data: createDraft(),
    editable: true,
    ...overrides,
  };
}

function createLegacyAsset(): EditorEventAsset<unknown> {
  return createAsset({
    id: "legacy.distress",
    asset_type: "legacy_event",
    file_path: "content/events/events.json",
    editable: false,
    data: { id: "legacy.distress", title: "Legacy distress" },
  });
}

function createLibraryResponse(): EventEditorLibraryResponse {
  return {
    manifest: { schema_version: "event-manifest.v1", domains: [] },
    domains: ["forest"],
    definitions: [createAsset() as EventEditorLibraryResponse["definitions"][number]],
    call_templates: [],
    handlers: [],
    presets: [],
    legacy_events: [],
    schemas: {
      "content/schemas/events/event-definition.schema.json": {
        $id: "https://stellar-frontier.local/schemas/events/event-definition.schema.json",
        $defs: {
          event_definition: {
            type: "object",
            required: ["id", "title", "status", "trigger", "event_graph"],
            properties: {
              id: { type: "string", title: "ID" },
              title: { type: "string", title: "Title" },
              status: { type: "string", title: "Status", enum: ["draft", "ready_for_test"] },
              trigger: {
                type: "object",
                properties: {
                  type: { type: "string", title: "Trigger type" },
                  conditions: { type: "array", title: "Conditions", items: { type: "object" } },
                },
              },
              event_graph: { type: "object", title: "Event graph" },
              effect_groups: { type: "array", title: "Effect groups", items: { type: "object" } },
            },
          },
        },
      },
    },
    validation: { passed: true, issues: [] },
  };
}

function createLibraryResponseWithSharedDefinitions(): EventEditorLibraryResponse {
  const library = createLibraryResponse();
  library.schemas["content/schemas/events/event-definition.schema.json"] = {
    $id: "https://stellar-frontier.local/schemas/events/event-definition.schema.json",
    $defs: {
      non_empty_string: {
        type: "string",
        minLength: 1,
      },
      trigger_definition: {
        type: "object",
        properties: {
          type: { type: "string", title: "Trigger type" },
          conditions: { $ref: "#/$defs/condition_array" },
        },
      },
      condition_array: {
        type: "array",
        title: "Conditions",
        items: { $ref: "https://stellar-frontier.local/schemas/events/condition.schema.json#/$defs/condition" },
      },
      event_definition: {
        type: "object",
        required: ["id", "title", "status", "trigger", "event_graph"],
        properties: {
          id: { type: "string", title: "ID" },
          title: { $ref: "#/$defs/non_empty_string", title: "Title" },
          status: { type: "string", title: "Status", enum: ["draft", "ready_for_test"] },
          trigger: { $ref: "#/$defs/trigger_definition", title: "Trigger" },
          event_graph: { type: "object", title: "Event graph" },
          effect_groups: { type: "array", title: "Effect groups", items: { type: "object" } },
        },
      },
    },
  };
  return library;
}
