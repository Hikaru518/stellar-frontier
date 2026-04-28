import { describe, expect, it } from "vitest";
import { eventContentLibrary } from "../content/contentData";
import { buildEventContentIndex } from "./contentIndex";
import type { CallTemplate, EventDefinition, HandlerDefinition, PresetDefinition, TriggerType } from "./types";

describe("EventContentIndex", () => {
  it("loads the authored event assets and builds an index", () => {
    const result = buildEventContentIndex(eventContentLibrary);

    expect(result.errors).toEqual([]);
    expect(result.index.definitionsById.size).toBeGreaterThanOrEqual(0);
    expect(result.index.callTemplatesById.size).toBeGreaterThanOrEqual(0);
    expect(result.index.handlersByType.size).toBeGreaterThanOrEqual(0);
  });

  it("reports duplicate event definition ids with a path", () => {
    const duplicate = minimalEventDefinition({ id: "forest_trace", triggerType: "arrival" });

    const result = buildEventContentIndex({
      domains: [],
      event_definitions: [duplicate, minimalEventDefinition({ id: "forest_trace", triggerType: "idle_time" })],
      call_templates: [],
      handlers: [],
      presets: [],
    });

    expect(result.errors).toContainEqual({
      code: "duplicate_event_definition_id",
      path: "event_definitions[1].id",
      message: "Duplicate event_definition id: forest_trace",
    });
  });

  it("reports duplicate call template ids and handler types with paths", () => {
    const result = buildEventContentIndex({
      domains: [],
      event_definitions: [],
      call_templates: [
        minimalCallTemplate({ id: "forest_trace_call" }),
        minimalCallTemplate({ id: "forest_trace_call" }),
      ],
      handlers: [minimalHandler({ handlerType: "crew_injured" }), minimalHandler({ handlerType: "crew_injured" })],
      presets: [],
    });

    expect(result.errors).toEqual([
      {
        code: "duplicate_call_template_id",
        path: "call_templates[1].id",
        message: "Duplicate call_template id: forest_trace_call",
      },
      {
        code: "duplicate_handler_type",
        path: "handlers[1].handler_type",
        message: "Duplicate handler_type: crew_injured",
      },
    ]);
  });

  it("returns only candidate definitions for the requested trigger type", () => {
    const arrival = minimalEventDefinition({ id: "arrival_event", triggerType: "arrival" });
    const idle = minimalEventDefinition({ id: "idle_event", triggerType: "idle_time" });

    const result = buildEventContentIndex({
      domains: [],
      event_definitions: [arrival, idle],
      call_templates: [],
      handlers: [],
      presets: [],
    });

    expect(result.index.getDefinitionsByTriggerType("arrival").map((definition) => definition.id)).toEqual([
      "arrival_event",
    ]);
    expect(result.index.getDefinitionsByTriggerType("idle_time").map((definition) => definition.id)).toEqual([
      "idle_event",
    ]);
  });

  it("indexes definitions by domain, tag, and mutex group", () => {
    const definition = minimalEventDefinition({
      id: "forest_warning",
      triggerType: "arrival",
      domain: "forest",
      tags: ["danger", "forest"],
      mutexGroup: "forest_warning_group",
    });

    const result = buildEventContentIndex({
      domains: ["forest"],
      event_definitions: [definition],
      call_templates: [],
      handlers: [],
      presets: [] as PresetDefinition[],
    });

    expect(result.index.getDefinitionsByDomain("forest")).toEqual([definition]);
    expect(result.index.getDefinitionsByTag("danger")).toEqual([definition]);
    expect(result.index.getDefinitionsByMutexGroup("forest_warning_group")).toEqual([definition]);
  });
});

function minimalEventDefinition({
  id,
  triggerType,
  domain = "forest",
  tags = [],
  mutexGroup = null,
}: {
  id: string;
  triggerType: TriggerType;
  domain?: string;
  tags?: string[];
  mutexGroup?: string | null;
}): EventDefinition {
  return {
    schema_version: "event-program-model-v1",
    id,
    version: 1,
    domain,
    title: id,
    summary: `${id} summary`,
    tags,
    status: "draft",
    trigger: {
      type: triggerType,
      conditions: [],
    },
    candidate_selection: {
      priority: 1,
      weight: 1,
      mutex_group: mutexGroup,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    },
    repeat_policy: {
      scope: "world",
      max_trigger_count: null,
      cooldown_seconds: 0,
      history_key_template: `event:${id}`,
      allow_while_active: false,
    },
    event_graph: {
      entry_node_id: "end",
      nodes: [
        {
          id: "end",
          type: "end",
          title: "End",
          blocking: {
            occupies_crew_action: false,
            occupies_communication: false,
            blocking_key_template: null,
          },
          resolution: "resolved",
          result_key: "resolved",
          event_log_template_id: "resolved",
          history_writes: [],
          cleanup_policy: {
            release_blocking_claims: true,
            delete_active_calls: true,
            keep_player_summary: true,
          },
        },
      ],
      edges: [],
      terminal_node_ids: ["end"],
      graph_rules: {
        acyclic: true,
        max_active_nodes: 1,
        allow_parallel_nodes: false,
      },
    },
    sample_contexts: [],
  };
}

function minimalCallTemplate({ id }: { id: string }): CallTemplate {
  return {
    schema_version: "event-program-model-v1",
    id,
    version: 1,
    domain: "forest",
    event_definition_id: "forest_trace",
    node_id: "call",
    render_context_fields: [],
    opening_lines: {
      variants: [{ id: "default", text: "Hello.", priority: 1 }],
      selection: "first_match",
    },
    option_lines: {},
    fallback_order: ["default"],
    default_variant_required: true,
  };
}

function minimalHandler({ handlerType }: { handlerType: string }): HandlerDefinition {
  return {
    handler_type: handlerType,
    kind: "condition",
    description: "Test handler.",
    params_schema_ref: "#/$defs/test",
    allowed_target_types: ["primary_crew"],
    deterministic: true,
    uses_random: false,
    failure_policy: "fail_event",
    sample_fixtures: [],
  };
}
