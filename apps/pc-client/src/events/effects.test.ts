import { describe, expect, it } from "vitest";
import { executeEffects, type EffectExecutionContext, type EffectGameState } from "./effects";
import type { Effect, HandlerDefinition, TriggerContext } from "./types";

describe("structured effect executor", () => {
  it("writes event logs, world history, and world flags without mutating the input state", () => {
    const state = createState();
    const before = structuredClone(state);

    const result = executeEffects(
      [
        effect("log", "add_event_log", { type: "event_log" }, { summary: "Amy found a safe trail.", importance: "major" }),
        effect(
          "history",
          "write_world_history",
          { type: "world_history" },
          { key: "forest.safe_trail", scope: "crew", value: { outcome: "safe" }, last_result: "safe" },
        ),
        effect("flag", "set_world_flag", { type: "world_flags" }, { key: "forest_safe_trail_known", value: true, tags: ["forest"] }),
      ],
      createContext(state),
    );

    expect(result.status).toBe("success");
    expect(result.errors).toEqual([]);
    expect(result.applied_effect_ids).toEqual(["log", "history", "flag"]);
    expect(result.state).not.toBe(state);
    expect(state).toEqual(before);

    expect(result.state.event_logs).toEqual([
      expect.objectContaining({
        id: "evt_beast:log",
        event_id: "evt_beast",
        event_definition_id: "forest_beast_encounter",
        occurred_at: 120,
        summary: "Amy found a safe trail.",
        crew_ids: ["amy"],
        tile_ids: ["2-3"],
        importance: "major",
        visibility: "player_visible",
      }),
    ]);
    expect(result.state.world_history["forest.safe_trail"]).toEqual(
      expect.objectContaining({
        key: "forest.safe_trail",
        scope: "crew",
        event_id: "evt_beast",
        event_definition_id: "forest_beast_encounter",
        crew_id: "amy",
        tile_id: "2-3",
        first_triggered_at: 120,
        last_triggered_at: 120,
        trigger_count: 1,
        last_result: "safe",
        value: { outcome: "safe" },
      }),
    );
    expect(result.state.world_flags.forest_safe_trail_known).toEqual(
      expect.objectContaining({
        key: "forest_safe_trail_known",
        value: true,
        value_type: "boolean",
        created_at: 120,
        updated_at: 120,
        source_event_id: "evt_beast",
        tags: ["forest"],
      }),
    );
  });

  it("updates crew, tile, inventory, objective, and diary event-accessible fields", () => {
    const result = executeEffects(
      [
        effect("condition", "add_crew_condition", { type: "primary_crew" }, { condition: "shaken" }),
        effect("attribute", "update_crew_attribute", { type: "primary_crew" }, { attribute: "perception", delta: 1 }),
        effect("personality", "add_personality_tag", { type: "primary_crew" }, { tag: "cautious" }),
        effect("expertise", "add_expertise_tag", { type: "primary_crew" }, { tag: "forest_navigation" }),
        effect("location", "update_crew_location", { type: "primary_crew" }, { tile_id: "base" }),
        effect("tile-field", "update_tile_field", { type: "event_tile" }, { field: "visibility", value: "revealed_by_event" }),
        effect("tile-tag", "add_tile_tag", { type: "event_tile" }, { tag: "landmark" }),
        effect("danger", "add_danger_tag", { type: "event_tile" }, { tag: "unstable_ground" }),
        effect("mark", "add_event_mark", { type: "event_tile" }, { id: "mark_safe_trail", label: "Safe trail" }),
        effect("item", "add_item", { type: "crew_inventory", id: "inv_amy" }, { item_id: "flare", quantity: 2 }),
        effect("resource", "remove_resource", { type: "base_resources" }, { resource_id: "energy", amount: 5 }),
        effect("tile-resource", "update_tile_resource", { type: "tile_resources", id: "2-3" }, { resource_id: "wood", amount_delta: -2, state: "discovered" }),
        effect("objective", "complete_objective", { type: "objective_id", id: "obj_rescue" }, { result_key: "safe_trail_found" }),
        effect("diary", "add_diary_entry", { type: "primary_crew" }, { entry_id: "amy_safe_trail", trigger_node: "call_warning", text: "The trail is safer than it looked." }),
      ],
      createContext(createState()),
    );

    expect(result.status).toBe("success");
    expect(result.errors).toEqual([]);

    const crew = result.state.crew.amy;
    expect(crew.condition_tags).toContain("shaken");
    expect(crew.attributes.perception).toBe(5);
    expect(crew.personality_tags).toContain("cautious");
    expect(crew.expertise_tags).toContain("forest_navigation");
    expect(crew.tile_id).toBe("base");
    expect(crew.diary_entry_ids).toContain("amy_safe_trail");

    const oldTile = result.state.tiles["2-3"];
    const newTile = result.state.tiles.base;
    expect(oldTile.current_crew_ids).not.toContain("amy");
    expect(oldTile.visibility).toBe("revealed_by_event");
    expect(oldTile.tags).toContain("landmark");
    expect(oldTile.danger_tags).toContain("unstable_ground");
    expect(oldTile.event_marks).toEqual([
      expect.objectContaining({ id: "mark_safe_trail", event_id: "evt_beast", label: "Safe trail", created_at: 120 }),
    ]);
    expect(oldTile.resource_nodes[0]).toEqual(expect.objectContaining({ resource_id: "wood", amount: 4, state: "discovered" }));
    expect(newTile.current_crew_ids).toContain("amy");

    expect(result.state.inventories.inv_amy.items).toEqual([
      { item_id: "medkit", quantity: 2 },
      { item_id: "flare", quantity: 2 },
    ]);
    expect(result.state.inventories.base.resources.energy).toBe(37);
    expect(result.state.objectives.obj_rescue).toEqual(
      expect.objectContaining({
        status: "completed",
        completed_at: 120,
        result_key: "safe_trail_found",
      }),
    );
  });

  it("creates active crew actions with bridge-ready fields", () => {
    const result = executeEffects(
      [
        effect("dispatch", "create_crew_action", { type: "primary_crew" }, {
          type: "move",
          target_tile_id: "base",
          duration_seconds: 45,
          action_params: { reason: "event order" },
        }),
      ],
      createContext(createState()),
    );

    expect(result.status).toBe("success");
    expect(result.state.crew.amy.current_action_id).toBe("dispatch:action");
    expect(result.state.crew_actions["dispatch:action"]).toMatchObject({
      id: "dispatch:action",
      crew_id: "amy",
      type: "move",
      status: "active",
      source: "event_action_request",
      started_at: 120,
      duration_seconds: 45,
      target_tile_id: "base",
      action_params: { reason: "event order" },
    });
  });

  it("rejects crew actions when the target crew already has an active current action", () => {
    const state = createState();
    const busyState: EffectGameState = {
      ...state,
      crew: {
        ...state.crew,
        amy: {
          ...state.crew.amy,
          status: "acting",
          current_action_id: "act_survey",
        },
      },
      crew_actions: {
        act_survey: crewAction("act_survey", "survey"),
      },
    };

    const result = executeEffects(
      [
        effect("dispatch", "create_crew_action", { type: "primary_crew" }, {
          action_id: "act_move",
          type: "move",
          target_tile_id: "base",
          duration_seconds: 45,
        }),
      ],
      createContext(busyState),
    );

    expect(result.status).toBe("failed");
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "invalid_effect",
        effect_id: "dispatch",
        path: "effects[0].params.action_id",
        message: expect.stringContaining("already has active crew action act_survey"),
      }),
    ]);
    expect(result.state.crew.amy.current_action_id).toBe("act_survey");
    expect(result.state.crew_actions.act_survey).toEqual(busyState.crew_actions.act_survey);
    expect(result.state.crew_actions.act_move).toBeUndefined();
  });

  it("calls only registered effect handlers and returns clear handler errors", () => {
    const state = createState();
    const context = createContext(state, {
      handler_registry: [
        handlerDefinition({ handler_type: "custom_effect", kind: "effect", allowed_target_types: ["world_flags"] }),
        handlerDefinition({ handler_type: "custom_condition", kind: "condition", allowed_target_types: ["world_flags"] }),
      ],
      effect_handlers: {
        custom_effect: ({ context: handlerContext }) => ({
          state: {
            ...handlerContext.state,
            world_flags: {
              ...handlerContext.state.world_flags,
              custom_handler_ran: {
                key: "custom_handler_ran",
                value: "yes",
                value_type: "string",
                created_at: 120,
                updated_at: 120,
              },
            },
          },
        }),
      },
    });

    const handled = executeEffects(
      [effect("handler", "handler_effect", { type: "world_flags" }, {}, { handler_type: "custom_effect" })],
      context,
    );

    expect(handled.status).toBe("success");
    expect(handled.state.world_flags.custom_handler_ran?.value).toBe("yes");

    const wrongKind = executeEffects(
      [effect("wrong-kind", "handler_effect", { type: "world_flags" }, {}, { handler_type: "custom_condition" })],
      context,
    );

    expect(wrongKind.status).toBe("failed");
    expect(wrongKind.errors).toEqual([
      expect.objectContaining({
        code: "invalid_handler_kind",
        effect_id: "wrong-kind",
        path: "effects[0].handler_type",
        message: expect.stringContaining("custom_condition"),
      }),
    ]);

    const missingImplementation = executeEffects(
      [
        effect("missing-implementation", "handler_effect", { type: "world_flags" }, {}, { handler_type: "missing_effect" }),
      ],
      createContext(state, {
        handler_registry: [
          handlerDefinition({ handler_type: "missing_effect", kind: "effect", allowed_target_types: ["world_flags"] }),
        ],
      }),
    );

    expect(missingImplementation.status).toBe("failed");
    expect(missingImplementation.errors).toEqual([
      expect.objectContaining({
        code: "missing_handler_implementation",
        effect_id: "missing-implementation",
        path: "effects[0].handler_type",
        message: expect.stringContaining("missing_effect"),
      }),
    ]);
  });

  it("returns a clear fail_event error when a target cannot be resolved", () => {
    const result = executeEffects(
      [effect("bad-target", "add_crew_condition", { type: "crew_id", id: "missing_crew" }, { condition: "lost" })],
      createContext(createState()),
    );

    expect(result.status).toBe("failed");
    expect(result.applied_effect_ids).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "missing_target",
        effect_id: "bad-target",
        path: "effects[0].target",
        message: expect.stringContaining("missing_crew"),
      }),
    ]);
  });
});

function createContext(
  state: EffectGameState,
  overrides: Partial<EffectExecutionContext> = {},
): EffectExecutionContext {
  return {
    state,
    trigger_context: triggerContext(),
    active_event_id: "evt_beast",
    ...overrides,
  };
}

function createState(): EffectGameState {
  return {
    elapsed_game_seconds: 120,
    crew: {
      amy: {
        id: "amy",
        display_name: "Amy",
        tile_id: "2-3",
        status: "acting",
        attributes: {
          strength: 3,
          agility: 4,
          intelligence: 5,
          perception: 4,
          luck: 2,
        },
        personality_tags: ["careful"],
        expertise_tags: ["scout"],
        condition_tags: ["tired"],
        communication_state: "available",
        current_action_id: null,
        background_event_ids: [],
        inventory_id: "inv_amy",
        diary_entry_ids: [],
        event_history_keys: [],
      },
    },
    tiles: {
      base: {
        id: "base",
        coordinates: { x: 0, y: 0 },
        terrain_type: "base",
        tags: ["base"],
        danger_tags: [],
        discovery_state: "known",
        survey_state: "surveyed",
        visibility: "visible",
        current_crew_ids: [],
        resource_nodes: [],
        site_objects: [],
        buildings: [],
        event_marks: [],
        history_keys: [],
      },
      "2-3": {
        id: "2-3",
        coordinates: { x: 2, y: 3 },
        terrain_type: "forest",
        tags: ["forest"],
        danger_tags: ["beast"],
        discovery_state: "visited",
        survey_state: "surveyed",
        visibility: "visible",
        current_crew_ids: ["amy"],
        resource_nodes: [{ id: "wood_node", resource_id: "wood", amount: 6, state: "discovered" }],
        site_objects: [],
        buildings: [],
        event_marks: [],
        history_keys: [],
      },
    },
    inventories: {
      inv_amy: {
        id: "inv_amy",
        owner_type: "crew",
        owner_id: "amy",
        items: [{ item_id: "medkit", quantity: 2 }],
        resources: { wood: 4 },
      },
      base: {
        id: "base",
        owner_type: "base",
        owner_id: "base",
        items: [],
        resources: { energy: 42 },
      },
    },
    crew_actions: {},
    active_events: {
      evt_beast: {
        id: "evt_beast",
        event_definition_id: "forest_beast_encounter",
        event_definition_version: 1,
        status: "waiting_call",
        current_node_id: "call_warning",
        primary_crew_id: "amy",
        related_crew_ids: [],
        primary_tile_id: "2-3",
        related_tile_ids: [],
        child_event_ids: [],
        objective_ids: ["obj_rescue"],
        selected_options: {},
        random_results: {},
        blocking_claim_ids: [],
        created_at: 90,
        updated_at: 120,
        trigger_context_snapshot: triggerContext(),
        history_keys: [],
      },
    },
    active_calls: {},
    objectives: {
      obj_rescue: {
        id: "obj_rescue",
        status: "in_progress",
        parent_event_id: "evt_beast",
        created_by_node_id: "objective",
        title: "Rescue Amy",
        summary: "Reach the forest before the trail goes cold.",
        target_tile_id: "2-3",
        eligible_crew_conditions: [],
        required_action_type: "move",
        required_action_params: {},
        assigned_crew_id: "amy",
        action_id: "act_survey",
        created_at: 95,
        completion_trigger_type: "objective_completed",
      },
    },
    event_logs: [],
    world_history: {},
    world_flags: {},
    rng_state: null,
  };
}

function crewAction(id: string, type: "move" | "survey") {
  return {
    id,
    crew_id: "amy",
    type,
    status: "active" as const,
    source: "event_action_request" as const,
    parent_event_id: "evt_beast",
    objective_id: "obj_rescue",
    action_request_id: null,
    from_tile_id: "2-3",
    to_tile_id: type === "move" ? "base" : undefined,
    target_tile_id: type === "move" ? "base" : "2-3",
    path_tile_ids: [],
    started_at: 100,
    ends_at: 160,
    progress_seconds: 20,
    duration_seconds: 60,
    action_params: {},
    can_interrupt: true,
    interrupt_duration_seconds: 10,
  };
}

function effect(
  id: string,
  type: Effect["type"],
  target: Effect["target"],
  params: Effect["params"],
  overrides: Partial<Effect> = {},
): Effect {
  return {
    id,
    type,
    target,
    params,
    failure_policy: "fail_event",
    record_policy: {
      write_event_log: false,
      write_world_history: false,
    },
    ...overrides,
  };
}

function triggerContext(): TriggerContext {
  return {
    trigger_type: "arrival",
    occurred_at: 120,
    source: "tile_system",
    crew_id: "amy",
    tile_id: "2-3",
    action_id: "act_survey",
    event_id: "evt_beast",
    event_definition_id: "forest_beast_encounter",
    node_id: "call_warning",
    call_id: null,
    objective_id: "obj_rescue",
    selected_option_id: null,
    world_flag_key: null,
    proximity: null,
    payload: {},
  };
}

function handlerDefinition(overrides: Partial<HandlerDefinition>): HandlerDefinition {
  return {
    handler_type: "handler",
    kind: "effect",
    description: "Test handler.",
    params_schema_ref: "#/$defs/test",
    allowed_target_types: ["world_flags"],
    deterministic: true,
    uses_random: false,
    failure_policy: "fail_event",
    sample_fixtures: [],
    ...overrides,
  };
}
