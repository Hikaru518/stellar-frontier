import { describe, expect, it } from "vitest";
import { EventContentIndex } from "./contentIndex";
import { processEventWakeups, processTrigger, selectCallOption } from "./eventEngine";
import { startRuntimeEvent, type GraphRunnerGameState } from "./graphRunner";
import {
  createEmptyEventRuntimeState,
  type ActionRequestNode,
  type CallNode,
  type CallTemplate,
  type CrewState,
  type EndNode,
  type EventDefinition,
  type EventNode,
  type ObjectiveNode,
  type TriggerContext,
  type WaitNode,
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

describe("event engine trigger intake", () => {
  it("starts arrival candidates and advances call choice contexts", () => {
    const definition = eventDefinition([
      callNode("signal_call", { press_on: "success_end" }),
      endNode("success_end", "resolved", "pressed_on", false),
    ]);
    const index = indexFor([definition], [callTemplate()]);
    const started = processTrigger({
      state: createState(),
      index,
      context: triggerContext(120),
    });
    const callId = started.event?.active_call_id ?? "";

    expect(started.errors).toEqual([]);
    expect(started.candidate_report?.selected_event_definition_ids).toEqual(["test_event"]);
    expect(started.event?.status).toBe("waiting_call");
    expect(started.state.active_calls[callId]?.status).toBe("awaiting_choice");

    const selected = processTrigger({
      state: started.state,
      index,
      context: {
        ...triggerContext(130),
        trigger_type: "call_choice",
        source: "call",
        event_id: started.event?.id,
        event_definition_id: "test_event",
        call_id: callId,
        selected_option_id: "press_on",
      },
    });

    expect(selected.errors).toEqual([]);
    expect(selected.event?.status).toBe("resolved");
    expect(selected.event?.selected_options).toEqual({ signal_call: "press_on" });
  });

  it("advances action completion and objective completion contexts", () => {
    const actionDefinition = definitionWith({
      id: "action_wait",
      triggerType: "arrival",
      nodes: [
        actionRequestNode("request_scan", "action_done", "action_failed"),
        endNode("action_done", "resolved", "action_done", false),
        endNode("action_failed", "failed", "action_failed", false),
      ],
    });
    const objectiveDefinition = definitionWith({
      id: "objective_wait",
      triggerType: "arrival",
      nodes: [
        objectiveNode("map_site", "objective_done", "objective_failed"),
        endNode("objective_done", "resolved", "objective_done", false),
        endNode("objective_failed", "failed", "objective_failed", false),
      ],
    });
    const index = indexFor([actionDefinition, objectiveDefinition]);
    const actionStarted = startRuntimeEvent(createState(), actionDefinition, {
      ...triggerContext(200),
      event_id: "evt_action",
      event_definition_id: "action_wait",
    });
    const objectiveStarted = startRuntimeEvent(createState(), objectiveDefinition, {
      ...triggerContext(210),
      event_id: "evt_objective",
      event_definition_id: "objective_wait",
    });
    const objectiveId = objectiveStarted.event.objective_ids[0];

    const actionCompleted = processTrigger({
      state: actionStarted.state,
      index,
      context: {
        ...triggerContext(240),
        trigger_type: "action_complete",
        source: "crew_action",
        event_id: "evt_action",
        event_definition_id: "action_wait",
        action_id: "action_evt_action",
      },
    });
    const objectiveCompleted = processTrigger({
      state: objectiveStarted.state,
      index,
      context: {
        ...triggerContext(250),
        trigger_type: "objective_completed",
        source: "objective",
        event_id: "evt_objective",
        event_definition_id: "objective_wait",
        objective_id: objectiveId,
      },
    });

    expect(actionCompleted.errors).toEqual([]);
    expect(actionCompleted.event?.status).toBe("resolved");
    expect(actionCompleted.event?.result_key).toBe("action_done");
    expect(objectiveCompleted.errors).toEqual([]);
    expect(objectiveCompleted.event?.status).toBe("resolved");
    expect(objectiveCompleted.event?.result_key).toBe("objective_done");
  });

  it("processes due time wakeups and leaves future wakeups untouched", () => {
    const definition = definitionWith({
      id: "timed_event",
      triggerType: "arrival",
      nodes: [waitNode("wait_for_signal", 30, "time_done"), endNode("time_done", "resolved", "time_done", false)],
    });
    const index = indexFor([definition]);
    const started = startRuntimeEvent(createState(), definition, {
      ...triggerContext(300),
      event_id: "evt_timed",
      event_definition_id: "timed_event",
    });

    const early = processEventWakeups({ state: started.state, index, elapsed_game_seconds: 329 });
    const due = processEventWakeups({ state: started.state, index, elapsed_game_seconds: 330 });

    expect(early.errors).toEqual([]);
    expect(early.events ?? []).toEqual([]);
    expect(early.state.active_events.evt_timed.status).toBe("waiting_time");
    expect(due.errors).toEqual([]);
    expect((due.events ?? []).map((event) => event.id)).toEqual(["evt_timed"]);
    expect(due.state.active_events.evt_timed.status).toBe("resolved");
  });

  it("filters candidates blocked by cooldown, max count, mutex, or blocking slot", () => {
    const selectedDefinition = definitionWith({ id: "selectable_event", triggerType: "arrival", priority: 1 });
    const cooldownDefinition = definitionWith({ id: "cooldown_event", triggerType: "arrival", priority: 2, cooldownSeconds: 60 });
    const maxedDefinition = definitionWith({ id: "maxed_event", triggerType: "arrival", priority: 2, maxTriggerCount: 1 });
    const mutexDefinition = definitionWith({ id: "mutex_event", triggerType: "arrival", priority: 2, mutexGroup: "crew_crisis" });
    const activeMutexDefinition = definitionWith({ id: "active_mutex_event", triggerType: "idle_time", mutexGroup: "crew_crisis" });
    const blockingDefinition = definitionWith({
      id: "blocking_event",
      triggerType: "arrival",
      priority: 2,
      requiresBlockingSlot: true,
    });
    const state = {
      ...createState(),
      crew: {
        amy: {
          ...crew("amy"),
          blocking_event_id: "evt_existing_block",
        },
      },
      active_events: {
        evt_mutex_active: runtimeEvent("evt_mutex_active", "active_mutex_event", "active"),
      },
      world_history: {
        "event:cooldown_event": historyEntry("event:cooldown_event", "cooldown_event", 2, 170),
        "event:maxed_event": historyEntry("event:maxed_event", "maxed_event", 1, null),
      },
    } satisfies GraphRunnerGameState;
    const index = indexFor([
      selectedDefinition,
      cooldownDefinition,
      maxedDefinition,
      mutexDefinition,
      activeMutexDefinition,
      blockingDefinition,
    ]);

    const result = processTrigger({ state, index, context: triggerContext(120) });

    expect(result.errors).toEqual([]);
    expect(result.candidate_report?.filtered_by_history_ids).toEqual(["cooldown_event", "maxed_event"]);
    expect(result.candidate_report?.filtered_by_mutex_ids).toEqual(["mutex_event"]);
    expect(result.candidate_report?.filtered_by_blocking_ids).toEqual(["blocking_event"]);
    expect(result.candidate_report?.selected_event_definition_ids).toEqual(["selectable_event"]);
    expect(result.event?.event_definition_id).toBe("selectable_event");
  });

  it("uses priority first and weight for deterministic candidate selection", () => {
    const lowPriority = definitionWith({ id: "low_priority", triggerType: "arrival", priority: 1, weight: 100 });
    const zeroWeight = definitionWith({ id: "zero_weight", triggerType: "arrival", priority: 5, weight: 0 });
    const weightedWinner = definitionWith({ id: "weighted_winner", triggerType: "arrival", priority: 5, weight: 10 });
    const index = indexFor([lowPriority, zeroWeight, weightedWinner]);

    const result = processTrigger({ state: createState(), index, context: triggerContext(120) });

    expect(result.errors).toEqual([]);
    expect(result.candidate_report?.selected_event_definition_ids).toEqual(["weighted_winner"]);
    expect(result.candidate_report?.roll_seed).toBe("arrival:120:amy:2-3");
    expect(result.event?.event_definition_id).toBe("weighted_winner");
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
    event_id: null,
    event_definition_id: null,
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

function definitionWith(input: {
  id: string;
  triggerType: TriggerContext["trigger_type"];
  nodes?: EventNode[];
  priority?: number;
  weight?: number;
  mutexGroup?: string | null;
  requiresBlockingSlot?: boolean;
  cooldownSeconds?: number;
  maxTriggerCount?: number | null;
}): EventDefinition {
  const nodes = input.nodes ?? [endNode("end", "resolved", `${input.id}_resolved`, false)];
  return {
    ...eventDefinition(nodes),
    id: input.id,
    title: input.id,
    trigger: { type: input.triggerType, conditions: [] },
    candidate_selection: {
      priority: input.priority ?? 1,
      weight: input.weight ?? 1,
      mutex_group: input.mutexGroup ?? null,
      max_instances_per_trigger: 1,
      requires_blocking_slot: input.requiresBlockingSlot ?? false,
    },
    repeat_policy: {
      scope: "world",
      max_trigger_count: input.maxTriggerCount ?? null,
      cooldown_seconds: input.cooldownSeconds ?? 0,
      history_key_template: `event:${input.id}`,
      allow_while_active: true,
    },
    sample_contexts: [{ ...triggerContext(120), trigger_type: input.triggerType, event_definition_id: input.id }],
  };
}

function indexFor(definitions: EventDefinition[], templates: CallTemplate[] = []): EventContentIndex {
  const index = new EventContentIndex();
  definitions.forEach((definition) => index.addDefinition(definition));
  templates.forEach((template) => index.addCallTemplate(template));
  return index;
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

function actionRequestNode(id: string, onCompletedNodeId: string, onFailedNodeId: string): ActionRequestNode {
  return {
    ...baseNode(id, "action_request"),
    type: "action_request",
    request_id: `${id}_request`,
    action_type: "survey",
    target_crew_ref: { type: "primary_crew" },
    target_tile_ref: { type: "event_tile" },
    action_params: {},
    acceptance_conditions: [],
    completion_trigger: { type: "action_complete", conditions: [] },
    on_completed_node_id: onCompletedNodeId,
    on_failed_node_id: onFailedNodeId,
    occupies_crew_action: false,
  };
}

function objectiveNode(id: string, onCompletedNodeId: string, onFailedNodeId: string): ObjectiveNode {
  return {
    ...baseNode(id, "objective"),
    type: "objective",
    objective_template: {
      title: "Map the site",
      summary: "Map the site.",
      target_tile_ref: { type: "event_tile" },
      eligible_crew_conditions: [],
      required_action_type: "survey",
      required_action_params: {},
    },
    mode: "create_and_wait",
    on_completed_node_id: onCompletedNodeId,
    on_failed_node_id: onFailedNodeId,
    parent_event_link: true,
  };
}

function waitNode(id: string, durationSeconds: number, nextNodeId: string): WaitNode {
  return {
    ...baseNode(id, "wait"),
    type: "wait",
    duration_seconds: durationSeconds,
    wake_trigger_type: "time_wakeup",
    next_node_id: nextNodeId,
    set_next_wakeup_at: true,
    interrupt_policy: "not_interruptible",
  };
}

function runtimeEvent(id: string, definitionId: string, status: GraphRunnerGameState["active_events"][string]["status"]) {
  return {
    id,
    event_definition_id: definitionId,
    event_definition_version: 1,
    status,
    current_node_id: "entry",
    primary_crew_id: "amy",
    related_crew_ids: [],
    primary_tile_id: "2-3",
    related_tile_ids: [],
    child_event_ids: [],
    objective_ids: [],
    active_call_id: null,
    selected_options: {},
    random_results: {},
    blocking_claim_ids: [],
    created_at: 100,
    updated_at: 100,
    deadline_at: null,
    next_wakeup_at: null,
    trigger_context_snapshot: triggerContext(100),
    history_keys: [],
    result_key: null,
    result_summary: null,
  };
}

function historyEntry(key: string, eventDefinitionId: string, triggerCount: number, cooldownUntil: number | null) {
  return {
    key,
    scope: "world" as const,
    event_definition_id: eventDefinitionId,
    event_id: null,
    crew_id: "amy",
    tile_id: "2-3",
    objective_id: null,
    first_triggered_at: 90,
    last_triggered_at: 100,
    trigger_count: triggerCount,
    last_result: null,
    cooldown_until: cooldownUntil,
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

function endNode(id: string, resolution: EndNode["resolution"], resultKey: string, deleteActiveCalls: boolean): EndNode {
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
