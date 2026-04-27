import { describe, expect, it } from "vitest";
import { validateEventContentLibrary } from "./validation";
import type { EventContentLibrary } from "./contentIndex";
import type {
  CallNode,
  CallTemplate,
  EndNode,
  EventDefinition,
  EventNode,
  HandlerDefinition,
} from "./types";

describe("validateEventContentLibrary", () => {
  it("reports missing entry nodes with asset ids and paths", () => {
    const definition = minimalEventDefinition({
      graphOverrides: {
        entry_node_id: "missing_entry",
      },
    });

    const issues = validateEventContentLibrary(minimalLibrary({ definitions: [definition] }));

    expectIssue(issues, {
      code: "missing_entry_node",
      asset_id: "forest_trace",
      path: "event_definitions[0].event_graph.entry_node_id",
    });
  });

  it("reports orphan nodes", () => {
    const definition = minimalEventDefinition({
      nodes: [
        minimalCallNode(),
        minimalEndNode(),
        {
          ...minimalEndNode(),
          id: "orphan_end",
          title: "Orphan End",
        },
      ],
    });

    const issues = validateEventContentLibrary(minimalLibrary({ definitions: [definition] }));

    expectIssue(issues, {
      code: "orphan_node",
      asset_id: "forest_trace",
      path: "event_definitions[0].event_graph.nodes[2].id",
    });
  });

  it("reports cyclic graphs", () => {
    const call = minimalCallNode({
      option_node_mapping: {
        accept: "call",
        decline: "end",
      },
    });
    const definition = minimalEventDefinition({
      nodes: [call, minimalEndNode()],
      edges: [
        { from_node_id: "call", to_node_id: "call", via: "accept" },
        { from_node_id: "call", to_node_id: "end", via: "decline" },
      ],
    });

    const issues = validateEventContentLibrary(minimalLibrary({ definitions: [definition] }));

    expectIssue(issues, {
      code: "cycle_detected",
      asset_id: "forest_trace",
      path: "event_definitions[0].event_graph.edges[0]",
    });
  });

  it("reports nodes that cannot reach a terminal node", () => {
    const waitNode: EventNode = {
      id: "wait_forever",
      type: "wait",
      title: "Wait Forever",
      blocking: minimalBlocking(),
      duration_seconds: 60,
      wake_trigger_type: "time_wakeup",
      next_node_id: "wait_forever",
      set_next_wakeup_at: true,
      interrupt_policy: "not_interruptible",
    };
    const definition = minimalEventDefinition({
      graphOverrides: {
        entry_node_id: "wait_forever",
        terminal_node_ids: ["end"],
      },
      nodes: [waitNode, minimalEndNode()],
      edges: [{ from_node_id: "wait_forever", to_node_id: "wait_forever", via: "next" }],
    });

    const issues = validateEventContentLibrary(minimalLibrary({ definitions: [definition] }));

    expectIssue(issues, {
      code: "no_terminal_path",
      asset_id: "forest_trace",
      path: "event_definitions[0].event_graph.nodes[0].id",
    });
  });

  it("reports missing and extra call template option lines", () => {
    const template = minimalCallTemplate({
      option_lines: {
        accept: minimalVariantGroup("Accept"),
        extra: minimalVariantGroup("Extra"),
      },
    });

    const issues = validateEventContentLibrary(minimalLibrary({ templates: [template] }));

    expectIssue(issues, {
      code: "missing_call_template_option_line",
      asset_id: "forest_trace_call",
      path: "call_templates[0].option_lines.decline",
    });
    expectIssue(issues, {
      code: "extra_call_template_option_line",
      asset_id: "forest_trace_call",
      path: "call_templates[0].option_lines.extra",
    });
  });

  it("reports unknown effect, log template, handler, and call template references", () => {
    const definition = minimalEventDefinition({
      log_templates: [{ id: "resolved", summary: "Resolved.", importance: "normal", visibility: "player_visible" }],
      effect_groups: [],
      nodes: [
        {
          ...minimalCallNode({
            call_template_id: "missing_template",
            options: [{ id: "accept", effect_refs: ["missing_effect"] }, { id: "decline" }],
          }),
          requirements: [{ type: "handler_condition", handler_type: "missing_condition_handler" }],
        },
        {
          ...minimalEndNode(),
          event_log_template_id: "missing_log",
          final_effect_refs: ["missing_final_effect"],
          inline_effects: [
            {
              id: "inline_handler_effect",
              type: "handler_effect",
              target: { type: "active_event" },
              params: {},
              failure_policy: "fail_event",
              record_policy: {
                write_event_log: false,
                write_world_history: false,
              },
              handler_type: "missing_effect_handler",
            },
          ],
        },
      ],
    });

    const issues = validateEventContentLibrary(minimalLibrary({ definitions: [definition], templates: [] }));

    expectIssue(issues, {
      code: "unknown_call_template",
      asset_id: "forest_trace",
      path: "event_definitions[0].event_graph.nodes[0].call_template_id",
    });
    expectIssue(issues, {
      code: "unknown_effect_ref",
      asset_id: "forest_trace",
      path: "event_definitions[0].event_graph.nodes[0].options[0].effect_refs[0]",
    });
    expectIssue(issues, {
      code: "unknown_log_template",
      asset_id: "forest_trace",
      path: "event_definitions[0].event_graph.nodes[1].event_log_template_id",
    });
    expectIssue(issues, {
      code: "unknown_handler_type",
      asset_id: "forest_trace",
      path: "event_definitions[0].event_graph.nodes[0].requirements[0].handler_type",
    });
    expectIssue(issues, {
      code: "unknown_handler_type",
      asset_id: "forest_trace",
      path: "event_definitions[0].event_graph.nodes[1].inline_effects[0].handler_type",
    });
  });

  it("allows spawn_event nodes to reference another event definition in the same library", () => {
    const spawnNode: EventNode = {
      id: "spawn_child",
      type: "spawn_event",
      title: "Spawn Child",
      blocking: minimalBlocking(),
      event_definition_id: "child_event",
      spawn_policy: "immediate",
      context_mapping: {},
      parent_event_link: true,
      next_node_id: "end",
    };
    const parent = minimalEventDefinition({
      nodes: [spawnNode, minimalEndNode()],
      edges: [{ from_node_id: "spawn_child", to_node_id: "end", via: "next" }],
      graphOverrides: {
        entry_node_id: "spawn_child",
      },
    });
    const child = minimalEventDefinition({
      id: "child_event",
      nodes: [minimalEndNode()],
      edges: [],
      graphOverrides: {
        entry_node_id: "end",
      },
    });

    const issues = validateEventContentLibrary(minimalLibrary({ definitions: [parent, child], templates: [] }));

    expect(issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          asset_id: "forest_trace",
          path: "event_definitions[0].event_graph.nodes[0].event_definition_id",
        }),
      ]),
    );
  });
});

function expectIssue(
  issues: Array<{ code: string; asset_id: string; path: string; severity: string; message: string }>,
  expected: { code: string; asset_id: string; path: string },
) {
  expect(issues).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ...expected,
        severity: "error",
        message: expect.stringContaining(expected.asset_id),
      }),
    ]),
  );
}

interface GraphOverrides {
  entry_node_id?: string;
  terminal_node_ids?: string[];
}

function minimalLibrary({
  definitions = [minimalEventDefinition({})],
  templates = [minimalCallTemplate({})],
  handlers = [],
}: {
  definitions?: EventDefinition[];
  templates?: CallTemplate[];
  handlers?: HandlerDefinition[];
}): EventContentLibrary {
  return {
    event_definitions: definitions,
    call_templates: templates,
    handlers,
    presets: [],
  };
}

function minimalEventDefinition({
  id = "forest_trace",
  nodes = [minimalCallNode(), minimalEndNode()],
  edges = [
    { from_node_id: "call", to_node_id: "end", via: "accept" },
    { from_node_id: "call", to_node_id: "end", via: "decline" },
  ],
  graphOverrides = {},
  effect_groups = [{ id: "mark", effects: [], description: "Mark effects." }],
  log_templates = [
    { id: "call_log", summary: "Call started.", importance: "normal", visibility: "player_visible" },
    { id: "resolved", summary: "Resolved.", importance: "normal", visibility: "player_visible" },
  ],
}: {
  id?: string;
  nodes?: EventNode[];
  edges?: EventDefinition["event_graph"]["edges"];
  graphOverrides?: GraphOverrides;
  effect_groups?: EventDefinition["effect_groups"];
  log_templates?: EventDefinition["log_templates"];
}): EventDefinition {
  return {
    schema_version: "event-program-model-v1",
    id,
    version: 1,
    domain: "forest",
    title: "Forest Trace",
    summary: "A small trace in the forest.",
    tags: ["forest"],
    status: "draft",
    trigger: {
      type: "arrival",
      conditions: [],
    },
    candidate_selection: {
      priority: 1,
      weight: 1,
      mutex_group: null,
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
      entry_node_id: graphOverrides.entry_node_id ?? "call",
      nodes,
      edges,
      terminal_node_ids: graphOverrides.terminal_node_ids ?? ["end"],
      graph_rules: {
        acyclic: true,
        max_active_nodes: 1,
        allow_parallel_nodes: false,
      },
    },
    effect_groups,
    log_templates,
    sample_contexts: [],
  };
}

function minimalCallNode(overrides: Partial<CallNode> = {}): CallNode {
  return {
    id: "call",
    type: "call",
    title: "Call",
    blocking: minimalBlocking(),
    event_log_template_id: "call_log",
    call_template_id: "forest_trace_call",
    speaker_crew_ref: { type: "primary_crew" },
    urgency: "normal",
    delivery: "incoming_call",
    options: [{ id: "accept", effect_refs: ["mark"] }, { id: "decline" }],
    option_node_mapping: {
      accept: "end",
      decline: "end",
    },
    ...overrides,
  };
}

function minimalEndNode(): EndNode {
  return {
    id: "end",
    type: "end",
    title: "End",
    blocking: minimalBlocking(),
    resolution: "resolved",
    result_key: "resolved",
    event_log_template_id: "resolved",
    history_writes: [],
    cleanup_policy: {
      release_blocking_claims: true,
      delete_active_calls: true,
      keep_player_summary: true,
    },
  };
}

function minimalCallTemplate(overrides: Partial<CallTemplate> = {}): CallTemplate {
  return {
    schema_version: "event-program-model-v1",
    id: "forest_trace_call",
    version: 1,
    domain: "forest",
    event_definition_id: "forest_trace",
    node_id: "call",
    render_context_fields: [],
    opening_lines: minimalVariantGroup("Opening"),
    option_lines: {
      accept: minimalVariantGroup("Accept"),
      decline: minimalVariantGroup("Decline"),
    },
    fallback_order: ["default"],
    default_variant_required: true,
    ...overrides,
  };
}

function minimalVariantGroup(text: string): CallTemplate["opening_lines"] {
  return {
    variants: [{ id: "default", text, priority: 1 }],
    selection: "first_match",
  };
}

function minimalBlocking() {
  return {
    occupies_crew_action: false,
    occupies_communication: false,
    blocking_key_template: null,
  };
}
