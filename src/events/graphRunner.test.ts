import { describe, expect, it } from "vitest";
import { advanceRuntimeEvent, startRuntimeEvent, type GraphRunnerGameState } from "./graphRunner";
import { createEmptyEventRuntimeState, type EventDefinition, type EventNode, type TriggerContext } from "./types";

describe("event graph runner", () => {
  it("starts at the entry node and advances through branch and call option mappings", () => {
    const definition = eventDefinition([
      logNode("entry", "check_route"),
      checkNode("check_route", "signal_call", "fallback_end"),
      callNode("signal_call", { press_on: "success_end", retreat: "fallback_end" }),
      endNode("success_end", "resolved", "pressed_on"),
      endNode("fallback_end", "cancelled", "fallback"),
    ]);
    const started = startRuntimeEvent(createState({ route_open: true }), definition, triggerContext());

    expect(started.errors).toEqual([]);
    expect(started.event.current_node_id).toBe("signal_call");
    expect(started.event.status).toBe("waiting_call");
    expect(started.event.active_call_id).toBe("evt_test:signal_call:call");

    const advanced = advanceRuntimeEvent(started.state, definition, "evt_test", {
      ...triggerContext(),
      trigger_type: "call_choice",
      source: "call",
      node_id: "signal_call",
      selected_option_id: "press_on",
    });

    expect(advanced.errors).toEqual([]);
    expect(advanced.event.current_node_id).toBe("success_end");
    expect(advanced.event.status).toBe("resolved");
    expect(advanced.event.selected_options).toEqual({ signal_call: "press_on" });
    expect(advanced.event.result_key).toBe("pressed_on");
    expect(advanced.event.result_summary).toBe("Route opened: pressed_on");
  });

  it("sets wakeup time for wait nodes and releases blocking claims at end nodes", () => {
    const definition = eventDefinition([
      waitNode("wait_for_scan", "done_end", 45),
      endNode("done_end", "resolved", "scan_done"),
    ]);
    const started = startRuntimeEvent(createState(), definition, triggerContext(120), { event_id: "evt_wait" });

    expect(started.errors).toEqual([]);
    expect(started.event.current_node_id).toBe("wait_for_scan");
    expect(started.event.status).toBe("waiting_time");
    expect(started.event.next_wakeup_at).toBe(165);
    expect(started.event.blocking_claim_ids).toEqual(["evt_wait:wait_for_scan:crew_action"]);

    const awakened = advanceRuntimeEvent(started.state, definition, "evt_wait", {
      ...triggerContext(165),
      trigger_type: "time_wakeup",
      source: "time_system",
      event_id: "evt_wait",
      node_id: "wait_for_scan",
    });

    expect(awakened.errors).toEqual([]);
    expect(awakened.event.status).toBe("resolved");
    expect(awakened.event.next_wakeup_at).toBeNull();
    expect(awakened.event.blocking_claim_ids).toEqual([]);
    expect(awakened.event.result_summary).toBe("Route opened: scan_done");
  });

  it("stores deterministic random node results on the runtime event", () => {
    const definition = eventDefinition([
      randomNode("roll_weather", "clear_end", "storm_end"),
      endNode("clear_end", "resolved", "clear"),
      endNode("storm_end", "resolved", "storm"),
    ]);

    const first = startRuntimeEvent(createState(), definition, triggerContext(), { event_id: "evt_random" });
    const second = startRuntimeEvent(createState(), definition, triggerContext(), { event_id: "evt_random" });

    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    expect(first.event.random_results.weather).toEqual(second.event.random_results.weather);
    expect(first.event.random_results.weather).toEqual(
      expect.objectContaining({
        branch_id: expect.any(String),
        roll: expect.any(Number),
        seed: "evt_random:roll_weather:weather",
      }),
    );
    expect(first.event.status).toBe("resolved");
  });
});

function createState(flags: Record<string, boolean | number | string> = {}): GraphRunnerGameState {
  return {
    ...createEmptyEventRuntimeState(),
    elapsed_game_seconds: 120,
    crew: {},
    tiles: {},
    world_flags: Object.fromEntries(
      Object.entries(flags).map(([key, value]) => [
        key,
        {
          key,
          value,
          value_type: typeof value,
          created_at: 120,
          updated_at: 120,
        },
      ]),
    ) as GraphRunnerGameState["world_flags"],
  };
}

function triggerContext(occurredAt = 120): TriggerContext {
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
    sample_contexts: [triggerContext()],
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

function logNode(id: string, nextNodeId: string): EventNode {
  return {
    ...baseNode(id, "log_only"),
    type: "log_only",
    event_log_template_id: "route_log",
    next_node_id: nextNodeId,
  };
}

function checkNode(id: string, passNodeId: string, defaultNodeId: string): EventNode {
  return {
    ...baseNode(id, "check"),
    type: "check",
    branches: [
      {
        id: "route_open",
        conditions: [{ type: "world_flag_equals", field: "route_open", value: true }],
        next_node_id: passNodeId,
      },
    ],
    default_next_node_id: defaultNodeId,
    evaluation_order: "first_match",
  };
}

function callNode(id: string, mapping: Record<string, string>): EventNode {
  return {
    ...baseNode(id, "call"),
    type: "call",
    call_template_id: `${id}_template`,
    speaker_crew_ref: { type: "primary_crew" },
    urgency: "normal",
    delivery: "incoming_call",
    options: Object.keys(mapping).map((optionId) => ({ id: optionId })),
    option_node_mapping: mapping,
  };
}

function waitNode(id: string, nextNodeId: string, durationSeconds: number): EventNode {
  return {
    ...baseNode(id, "wait"),
    type: "wait",
    blocking: {
      occupies_crew_action: true,
      occupies_communication: false,
      blocking_key_template: null,
    },
    duration_seconds: durationSeconds,
    wake_trigger_type: "time_wakeup",
    next_node_id: nextNodeId,
    set_next_wakeup_at: true,
    interrupt_policy: "not_interruptible",
  };
}

function randomNode(id: string, firstNodeId: string, secondNodeId: string): EventNode {
  return {
    ...baseNode(id, "random"),
    type: "random",
    seed_scope: "event_instance",
    store_result_as: "weather",
    branches: [
      { id: "clear", weight: 1, next_node_id: firstNodeId },
      { id: "storm", weight: 1, next_node_id: secondNodeId },
    ],
  };
}

function endNode(id: string, resolution: "resolved" | "cancelled" | "expired" | "failed", resultKey: string): EventNode {
  return {
    ...baseNode(id, "end"),
    type: "end",
    resolution,
    result_key: resultKey,
    event_log_template_id: "route_log",
    history_writes: [],
    cleanup_policy: {
      release_blocking_claims: true,
      delete_active_calls: true,
      keep_player_summary: true,
    },
  };
}
