import { describe, expect, it } from "vitest";
import { renderEventEditorPreview } from "./previewRenderer";
import type { EditorEventAsset, EventEditorLibraryResponse } from "./types";

describe("renderEventEditorPreview", () => {
  it("renders call lines and options without mutating preview state or applying effects", () => {
    const definition = createDefinitionAsset();
    const template = createCallTemplateAsset();
    const previewState = {
      elapsed_game_seconds: 99,
      crew: {
        amy: {
          id: "amy",
          display_name: "Amy",
        },
      },
      baseInventory: [] as unknown[],
    };
    const originalState = JSON.stringify(previewState);

    const result = renderEventEditorPreview({
      asset: definition,
      draft: definition.data,
      library: createLibraryResponse({ definitions: [definition], call_templates: [template] }),
      previewState,
    });

    expect(result.status).toBe("rendered");
    expect(result.lines.map((line) => line.text)).toEqual(["Amy reports a signal flare."]);
    expect(result.options.map((option) => option.text)).toEqual(["Ask Amy to investigate."]);
    expect(JSON.stringify(previewState)).toBe(originalState);
    expect(previewState.baseInventory).toEqual([]);
  });

  it("reports missing context fields instead of pretending the preview is complete", () => {
    const definition = createDefinitionAsset({
      data: {
        ...createDefinitionData(),
        sample_contexts: [{ trigger_type: "arrival", occurred_at: 25, source: "tile_system", crew_id: "amy" }],
      },
    });
    const template = createCallTemplateAsset();

    const result = renderEventEditorPreview({
      asset: definition,
      draft: definition.data,
      library: createLibraryResponse({ definitions: [definition], call_templates: [template] }),
    });

    expect(result.status).toBe("missing_context");
    expect(result.missingContext).toContain("crew_display_name");
    expect(result.lines.map((line) => line.text)).toEqual([" reports a signal flare."]);
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

function createAsset(id: string, overrides: Partial<EditorEventAsset<unknown>> = {}): EditorEventAsset<unknown> {
  return {
    id,
    domain: "forest",
    asset_type: "event_definition",
    file_path: "content/events/definitions/forest.json",
    json_path: "$.event_definitions[0]",
    base_hash: "base-a",
    data: createDefinitionData(),
    editable: true,
    ...overrides,
  };
}

function createDefinitionAsset(overrides: Partial<EditorEventAsset<unknown>> = {}): EventEditorLibraryResponse["definitions"][number] {
  return createAsset("forest.signal", overrides) as EventEditorLibraryResponse["definitions"][number];
}

function createCallTemplateAsset(overrides: Partial<EditorEventAsset<unknown>> = {}): EventEditorLibraryResponse["call_templates"][number] {
  return createAsset("forest.signal.call", {
    asset_type: "call_template",
    file_path: "content/events/call_templates/forest.json",
    data: createCallTemplateData(),
    ...overrides,
  }) as EventEditorLibraryResponse["call_templates"][number];
}

function createDefinitionData(): Record<string, unknown> {
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
        payload: {
          preview_state: {
            crew: {
              amy: {
                id: "amy",
                display_name: "Amy",
              },
            },
          },
        },
      },
    ],
  };
}

function createCallTemplateData(): Record<string, unknown> {
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
