import { describe, expect, it } from "vitest";
import { EventContentIndex } from "./contentIndex";
import { assignObjective, completeObjective } from "./eventEngine";
import { startRuntimeEvent, type GraphRunnerGameState } from "./graphRunner";
import {
  createEmptyEventRuntimeState,
  type CrewState,
  type EndNode,
  type EventDefinition,
  type EventNode,
  type ObjectiveNode,
  type TriggerContext,
} from "./types";

describe("objective runtime", () => {
  it("creates available objectives from objective nodes with parent event metadata", () => {
    const definition = eventDefinition([objectiveNode("map_site", "objective_done"), endNode("objective_done", "resolved", "objective_done")]);

    const started = startRuntimeEvent(createState(), definition, triggerContext(120), { event_id: "evt_objective" });
    const objectiveId = started.event.objective_ids[0];

    expect(started.errors).toEqual([]);
    expect(started.event.status).toBe("waiting_objective");
    expect(objectiveId).toBe("evt_objective:map_site:objective");
    expect(started.state.objectives[objectiveId]).toEqual(
      expect.objectContaining({
        id: objectiveId,
        status: "available",
        parent_event_id: "evt_objective",
        created_by_node_id: "map_site",
      }),
    );
  });

  it("assigns eligible crew and creates an objective crew action", () => {
    const definition = eventDefinition([objectiveNode("map_site", "objective_done"), endNode("objective_done", "resolved", "objective_done")]);
    const index = indexFor(definition);
    const started = startRuntimeEvent(createState(), definition, triggerContext(120), { event_id: "evt_objective" });
    const objectiveId = started.event.objective_ids[0];

    const assigned = assignObjective({
      state: started.state,
      index,
      objective_id: objectiveId,
      crew_id: "kael",
      occurred_at: 130,
    });

    const objective = assigned.state.objectives[objectiveId];
    expect(assigned.errors).toEqual([]);
    expect(objective).toEqual(
      expect.objectContaining({
        status: "assigned",
        assigned_crew_id: "kael",
        assigned_at: 130,
        action_id: "evt_objective:map_site:objective:kael:action",
      }),
    );
    expect(assigned.state.crew_actions[objective.action_id ?? ""]).toEqual(
      expect.objectContaining({
        id: "evt_objective:map_site:objective:kael:action",
        crew_id: "kael",
        type: "survey",
        source: "objective",
        parent_event_id: "evt_objective",
        objective_id: objectiveId,
        target_tile_id: "2-3",
      }),
    );
    expect(assigned.state.crew.kael.current_action_id).toBe(objective.action_id);
  });

  it("does not assign ineligible crew or advance the parent event", () => {
    const definition = eventDefinition([objectiveNode("map_site", "objective_done"), endNode("objective_done", "resolved", "objective_done")]);
    const index = indexFor(definition);
    const started = startRuntimeEvent(createState(), definition, triggerContext(120), { event_id: "evt_objective" });
    const objectiveId = started.event.objective_ids[0];

    const rejected = assignObjective({
      state: started.state,
      index,
      objective_id: objectiveId,
      crew_id: "amy",
      occurred_at: 130,
    });

    expect(rejected.errors).toEqual([expect.objectContaining({ code: "crew_not_eligible", objective_id: objectiveId, crew_id: "amy" })]);
    expect(rejected.state.objectives[objectiveId]).toEqual(started.state.objectives[objectiveId]);
    expect(rejected.state.active_events.evt_objective).toEqual(started.state.active_events.evt_objective);
    expect(rejected.state.crew.amy.current_action_id).toBeNull();
  });

  it("completes objectives and advances the parent event with an objective_completed context", () => {
    const definition = eventDefinition([objectiveNode("map_site", "objective_done"), endNode("objective_done", "resolved", "objective_done")]);
    const index = indexFor(definition);
    const started = startRuntimeEvent(createState(), definition, triggerContext(120), { event_id: "evt_objective" });
    const objectiveId = started.event.objective_ids[0];
    const assigned = assignObjective({
      state: started.state,
      index,
      objective_id: objectiveId,
      crew_id: "kael",
      occurred_at: 130,
    });

    const completed = completeObjective({
      state: assigned.state,
      index,
      objective_id: objectiveId,
      occurred_at: 170,
      result_key: "mapped",
    });

    expect(completed.errors).toEqual([]);
    expect(completed.state.objectives[objectiveId]).toEqual(
      expect.objectContaining({
        status: "completed",
        completed_at: 170,
        result_key: "mapped",
      }),
    );
    expect(completed.event).toEqual(expect.objectContaining({ id: "evt_objective", status: "resolved", result_key: "objective_done" }));
    expect(completed.graph_result?.event.trigger_context_snapshot.event_id).toBe("evt_objective");
  });
});

function createState(): GraphRunnerGameState {
  return {
    ...createEmptyEventRuntimeState(),
    elapsed_game_seconds: 120,
    crew: {
      amy: crew("amy", 4),
      kael: crew("kael", 5),
    },
    tiles: {},
  };
}

function crew(id: string, perception: number): CrewState {
  return {
    id,
    display_name: id,
    tile_id: "2-3",
    status: "idle",
    attributes: {
      strength: 3,
      agility: 3,
      intelligence: 3,
      perception,
      luck: 3,
    },
    personality_tags: [],
    expertise_tags: [],
    condition_tags: [],
    communication_state: "available",
    current_action_id: null,
    blocking_event_id: null,
    blocking_call_id: null,
    background_event_ids: [],
    inventory_id: `inv_${id}`,
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
    event_id: "evt_objective",
    event_definition_id: "objective_event",
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
    id: "objective_event",
    version: 1,
    domain: "test",
    title: "Objective Event",
    summary: "A test objective event.",
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
      history_key_template: "objective_event",
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
    log_templates: [{ id: "objective_log", summary: "Objective closed", importance: "normal", visibility: "player_visible" }],
    sample_contexts: [triggerContext(120)],
  };
}

function objectiveNode(id: string, onCompletedNodeId: string): ObjectiveNode {
  return {
    ...baseNode(id, "objective"),
    type: "objective",
    objective_template: {
      title: "Map the site",
      summary: "Map the site.",
      target_tile_ref: { type: "event_tile" },
      eligible_crew_conditions: [{ type: "attribute_check", target: { type: "primary_crew" }, field: "perception", op: "gte", value: 5 }],
      required_action_type: "survey",
      required_action_params: { duration_seconds: 40 },
    },
    mode: "create_and_wait",
    on_completed_node_id: onCompletedNodeId,
    on_failed_node_id: "objective_failed",
    parent_event_link: true,
  };
}

function endNode(id: string, resolution: EndNode["resolution"], resultKey: string): EndNode {
  return {
    ...baseNode(id, "end"),
    type: "end",
    resolution,
    result_key: resultKey,
    event_log_template_id: "objective_log",
    history_writes: [],
    cleanup_policy: {
      release_blocking_claims: true,
      delete_active_calls: true,
      keep_player_summary: true,
    },
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

function indexFor(definition: EventDefinition): EventContentIndex {
  const index = new EventContentIndex();
  index.addDefinition(definition);
  return index;
}
