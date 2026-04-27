import { describe, expect, it } from "vitest";
import { EventContentIndex } from "./contentIndex";
import { selectCallOption } from "./eventEngine";
import { startRuntimeEvent, type GraphRunnerGameState } from "./graphRunner";
import {
  createEmptyEventRuntimeState,
  type CallNode,
  type CallTemplate,
  type CrewState,
  type EndNode,
  type EventDefinition,
  type EventNode,
  type TriggerContext,
} from "./types";

describe("event engine call option selection", () => {
  it("records only the stable option_id when display text is selected", () => {
    const { definition, index } = scenario();
    const started = startRuntimeEvent(createState(), definition, triggerContext(120), { event_id: "evt_test", content_index: index });
    const callId = started.event.active_call_id ?? "";

    expect(started.errors).toEqual([]);
    expect(started.state.active_calls[callId]?.available_options).toEqual([
      {
        option_id: "press_on",
        template_variant_id: "press_steady",
        text: "Keep searching carefully",
        is_default: false,
      },
    ]);

    const selected = selectCallOption({
      state: started.state,
      index,
      call_id: callId,
      option_id: "press_on",
      occurred_at: 130,
    });

    expect(selected.errors).toEqual([]);
    expect(selected.event?.status).toBe("resolved");
    expect(selected.event?.selected_options).toEqual({ signal_call: "press_on" });
    expect(JSON.stringify(selected.event?.selected_options)).not.toContain("Keep searching carefully");
  });

  it("returns runtime errors without advancing unavailable or ended calls", () => {
    const { definition, index } = scenario();
    const started = startRuntimeEvent(createState(), definition, triggerContext(120), { event_id: "evt_test", content_index: index });
    const callId = started.event.active_call_id ?? "";

    const unavailable = selectCallOption({
      state: started.state,
      index,
      call_id: callId,
      option_id: "retreat",
      occurred_at: 130,
    });

    expect(unavailable.errors).toEqual([
      expect.objectContaining({
        code: "option_unavailable",
        call_id: callId,
        option_id: "retreat",
      }),
    ]);
    expect(unavailable.state.active_events.evt_test.current_node_id).toBe("signal_call");
    expect(unavailable.state.active_calls[callId]?.status).toBe("awaiting_choice");

    const selected = selectCallOption({
      state: started.state,
      index,
      call_id: callId,
      option_id: "press_on",
      occurred_at: 131,
    });
    const ended = selectCallOption({
      state: selected.state,
      index,
      call_id: callId,
      option_id: "press_on",
      occurred_at: 132,
    });

    expect(ended.errors).toEqual([
      expect.objectContaining({
        code: "call_not_active",
        call_id: callId,
      }),
    ]);
    expect(ended.state.active_events.evt_test.status).toBe("resolved");
    expect(ended.state.active_events.evt_test.selected_options).toEqual({ signal_call: "press_on" });
  });
});

function scenario(): { definition: EventDefinition; index: EventContentIndex } {
  const definition = eventDefinition([
    callNode("signal_call", { press_on: "success_end", retreat: "retreat_end" }),
    endNode("success_end", "resolved", "pressed_on", false),
    endNode("retreat_end", "cancelled", "retreated", false),
  ]);
  const template = callTemplate();
  const index = new EventContentIndex();
  index.addDefinition(definition);
  index.addCallTemplate(template);

  return { definition, index };
}

function createState(): GraphRunnerGameState {
  return {
    ...createEmptyEventRuntimeState(),
    elapsed_game_seconds: 120,
    crew: {
      amy: crew("amy"),
    },
    tiles: {},
  };
}

function crew(id: string): CrewState {
  return {
    id,
    display_name: "Amy",
    tile_id: "2-3",
    status: "idle",
    attributes: {
      strength: 2,
      agility: 3,
      intelligence: 5,
      perception: 4,
      luck: 3,
    },
    personality_tags: ["steady"],
    expertise_tags: [],
    condition_tags: [],
    communication_state: "available",
    current_action_id: null,
    blocking_event_id: null,
    blocking_call_id: null,
    background_event_ids: [],
    inventory_id: "inv_amy",
    diary_entry_ids: [],
    event_history_keys: [],
  };
}

function triggerContext(occurredAt: number): TriggerContext {
  return {
    trigger_type: "arrival",
    occurred_at: occurredAt,
    source: "tile_system",
    crew_id: "amy",
    tile_id: "2-3",
    action_id: null,
    event_id: "evt_test",
    event_definition_id: "test_event",
    node_id: null,
    call_id: null,
    objective_id: null,
    selected_option_id: null,
    world_flag_key: null,
    proximity: null,
    payload: {},
  };
}

function eventDefinition(nodes: EventNode[]): EventDefinition {
  return {
    schema_version: "event-program-model-v1",
    id: "test_event",
    version: 1,
    domain: "test",
    title: "Test Event",
    summary: "A test event.",
    status: "draft",
    trigger: { type: "arrival", conditions: [] },
    candidate_selection: {
      priority: 1,
      weight: 1,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    },
    repeat_policy: {
      scope: "world",
      cooldown_seconds: 0,
      history_key_template: "test_event",
      allow_while_active: true,
    },
    event_graph: {
      entry_node_id: nodes[0].id,
      nodes,
      edges: [],
      terminal_node_ids: nodes.filter((node) => node.type === "end").map((node) => node.id),
      graph_rules: {
        acyclic: true,
        max_active_nodes: 1,
        allow_parallel_nodes: false,
      },
    },
    effect_groups: [],
    log_templates: [{ id: "route_log", summary: "Route opened", importance: "normal", visibility: "player_visible" }],
    sample_contexts: [triggerContext(120)],
  };
}

function baseNode(id: string, type: EventNode["type"]) {
  return {
    id,
    type,
    title: id,
    blocking: {
      occupies_crew_action: false,
      occupies_communication: false,
      blocking_key_template: null,
    },
  };
}

function callNode(id: string, mapping: Record<string, string>): CallNode {
  return {
    ...baseNode(id, "call"),
    type: "call",
    call_template_id: "signal_template",
    speaker_crew_ref: { type: "primary_crew" },
    urgency: "urgent",
    delivery: "incoming_call",
    options: [
      { id: "press_on" },
      {
        id: "retreat",
        requirements: [{ type: "world_flag_equals", field: "retreat_unlocked", value: true }],
      },
    ],
    option_node_mapping: mapping,
  };
}

function endNode(id: string, resolution: "resolved" | "cancelled", resultKey: string, deleteActiveCalls: boolean): EndNode {
  return {
    ...baseNode(id, "end"),
    type: "end",
    resolution,
    result_key: resultKey,
    event_log_template_id: "route_log",
    history_writes: [],
    cleanup_policy: {
      release_blocking_claims: true,
      delete_active_calls: deleteActiveCalls,
      keep_player_summary: true,
    },
  };
}

function callTemplate(): CallTemplate {
  const steadyCondition = [{ type: "has_tag", target: { type: "primary_crew" }, field: "personality_tags", value: "steady" }] as const;

  return {
    schema_version: "event-program-model-v1",
    id: "signal_template",
    version: 1,
    domain: "test",
    event_definition_id: "test_event",
    node_id: "signal_call",
    render_context_fields: ["crew_id", "personality_tags", "event_pressure"],
    opening_lines: {
      selection: "best_match",
      variants: [{ id: "opening_default", text: "Report in.", priority: 0 }],
    },
    option_lines: {
      press_on: {
        selection: "best_match",
        variants: [
          { id: "press_default", text: "Proceed", priority: 0 },
          { id: "press_steady", text: "Keep searching carefully", when: [...steadyCondition], priority: 5 },
        ],
      },
      retreat: {
        selection: "best_match",
        variants: [{ id: "retreat_default", text: "Fall back", priority: 0 }],
      },
    },
    fallback_order: ["personality_tags", "default"],
    default_variant_required: true,
  };
}
