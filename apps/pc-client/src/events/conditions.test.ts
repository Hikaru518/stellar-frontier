import { describe, expect, it } from "vitest";
import { evaluateCondition, evaluateConditions, type ConditionEvaluationContext, type ConditionGameState } from "./conditions";
import type { Condition, HandlerDefinition, TriggerContext } from "./types";

describe("structured condition evaluator", () => {
  it("evaluates crew, tile, inventory, world history, and world flag conditions without mutating state", () => {
    const state = createState();
    const before = JSON.parse(JSON.stringify(state));
    const context = createContext(state);

    const result = evaluateConditions(
      [
        { type: "compare_field", target: { type: "primary_crew" }, field: "attributes.perception", op: "gte", value: 4 },
        { type: "has_tag", target: { type: "event_tile" }, value: "forest" },
        { type: "lacks_tag", target: { type: "primary_crew" }, value: "reckless" },
        { type: "has_condition", target: { type: "primary_crew" }, value: "tired" },
        { type: "attribute_check", target: { type: "primary_crew" }, field: "perception", op: "gte", value: 4 },
        { type: "inventory_has_item", target: { type: "crew_inventory", id: "inv_amy" }, value: "medkit", params: { min_quantity: 2 } },
        { type: "inventory_has_item", target: { type: "base_inventory" }, value: "iron_ore", params: { min_quantity: 5 } },
        { type: "resource_amount", target: { type: "base_resources" }, field: "energy", op: "gte", value: 40 },
        { type: "resource_amount", target: { type: "tile_resources", id: "2-3" }, field: "wood", op: "gte", value: 6 },
        { type: "tile_discovery_state", target: { type: "event_tile" }, value: "visited" },
        { type: "tile_survey_state", target: { type: "event_tile" }, value: "surveyed" },
        { type: "world_flag_equals", field: "storm", value: "calm" },
        { type: "world_history_exists", field: "encounter:amy" },
        { type: "world_history_count", field: "encounter:amy", op: "gte", value: 2 },
      ],
      context,
    );

    expect(result).toEqual({ passed: true, errors: [] });
    expect(state).toEqual(before);
  });

  it("evaluates objective, event, crew action, and time conditions", () => {
    const context = createContext(createState());

    const result = evaluateConditions(
      [
        { type: "objective_status", target: { type: "objective_id", id: "obj_rescue" }, value: "in_progress" },
        { type: "event_status", target: { type: "active_event", id: "evt_beast" }, value: "waiting_call" },
        { type: "event_current_node", target: { type: "active_event", id: "evt_beast" }, value: "call_warning" },
        { type: "crew_action_status", target: { type: "primary_crew" }, value: "active" },
        { type: "time_compare", op: "gte", value: 120 },
      ],
      context,
    );

    expect(result).toEqual({ passed: true, errors: [] });
  });

  it("calls only handler_condition entries registered with kind condition", () => {
    const calls: string[] = [];
    const context = createContext(createState(), {
      handler_registry: [
        handlerDefinition({ handler_type: "custom_condition", kind: "condition", allowed_target_types: ["world_history"] }),
        handlerDefinition({ handler_type: "custom_effect", kind: "effect", allowed_target_types: ["world_history"] }),
      ],
      condition_handlers: {
        custom_condition: ({ condition }) => {
          calls.push(condition.handler_type ?? "");
          return { passed: true, errors: [] };
        },
        custom_effect: () => {
          throw new Error("effect handler must not be called as a condition");
        },
      },
    });

    expect(
      evaluateCondition(
        { type: "handler_condition", target: { type: "world_history" }, handler_type: "custom_condition", params: {} },
        context,
      ),
    ).toEqual({ passed: true, errors: [] });
    expect(calls).toEqual(["custom_condition"]);

    const rejected = evaluateCondition(
      { type: "handler_condition", target: { type: "world_history" }, handler_type: "custom_effect", params: {} },
      context,
      "conditions[1]",
    );

    expect(rejected.passed).toBe(false);
    expect(rejected.errors).toEqual([
      expect.objectContaining({
        code: "invalid_handler_kind",
        path: "conditions[1].handler_type",
      }),
    ]);
    expect(calls).toEqual(["custom_condition"]);
  });

  it("checks trigger context fields through the built-in trigger_context_value_equals handler", () => {
    const context = createContext(createState(), {
      trigger_context: {
        ...triggerContext(),
        action_id: "garry-survey-mine",
        payload: { action_type: "survey" },
      },
      handler_registry: [
        handlerDefinition({
          handler_type: "trigger_context_value_equals",
          allowed_target_types: [],
        }),
      ],
    });

    expect(
      evaluateConditions(
        [
          {
            type: "handler_condition",
            handler_type: "trigger_context_value_equals",
            params: { field: "action_id", value: "garry-survey-mine" },
          },
          {
            type: "handler_condition",
            handler_type: "trigger_context_value_equals",
            params: { field: "payload.action_type", value: "survey" },
          },
        ],
        context,
      ),
    ).toEqual({ passed: true, errors: [] });

    expect(
      evaluateCondition(
        {
          type: "handler_condition",
          handler_type: "trigger_context_value_equals",
          params: { field: "payload.action_type", value: "gather" },
        },
        context,
      ).passed,
    ).toBe(false);
  });

  it("checks all available communicable crew are at the requested tile", () => {
    const baseState = createState();
    const amy = (baseState.crew as Record<string, Record<string, unknown>>).amy;
    const condition: Condition = {
      type: "handler_condition",
      handler_type: "all_available_crew_at_tile",
      params: { tile_id: "4-4" },
    };
    const context = createContext(
      {
        ...baseState,
        crew: {
          amy: { ...amy, tile_id: "4-4", status: "idle", communication_state: "available" },
          mike: { id: "mike", tile_id: "4-4", status: "idle", communication_state: "available", condition_tags: [] },
          garry: { id: "garry", tile_id: "3-3", status: "lost_contact", communication_state: "lost_contact", condition_tags: [] },
          lin_xia: { id: "lin_xia", tile_id: "2-2", status: "dead", communication_state: "available", condition_tags: ["dead"] },
          kael: { id: "kael", tile_id: "1-1", status: "unavailable", communication_state: "available", condition_tags: [] },
        },
      },
      {
        handler_registry: [
          handlerDefinition({
            handler_type: "all_available_crew_at_tile",
            allowed_target_types: [],
          }),
        ],
      },
    );

    expect(evaluateCondition(condition, context)).toEqual({ passed: true, errors: [] });

    const negativeContext = createContext(
      {
        ...baseState,
        crew: {
          amy: { ...amy, tile_id: "4-4", status: "idle", communication_state: "available" },
          mike: { id: "mike", tile_id: "4-3", status: "idle", communication_state: "available", condition_tags: [] },
        },
      },
      {
        handler_registry: [
          handlerDefinition({
            handler_type: "all_available_crew_at_tile",
            allowed_target_types: [],
          }),
        ],
      },
    );

    expect(evaluateCondition(condition, negativeContext).passed).toBe(false);
  });

  it("returns located errors for missing fields, incompatible operators, and invalid handler params", () => {
    const context = createContext(createState(), {
      handler_registry: [
        handlerDefinition({
          handler_type: "world_history_value_equals",
          kind: "condition",
          allowed_target_types: ["world_history"],
        }),
      ],
    });

    const result = evaluateConditions(
      [
        { type: "compare_field", target: { type: "primary_crew" }, field: "attributes.bravery", op: "gte", value: 3 },
        { type: "compare_field", target: { type: "primary_crew" }, field: "display_name", op: "gt", value: "Amy" },
        {
          type: "handler_condition",
          target: { type: "world_history" },
          handler_type: "world_history_value_equals",
          params: { value: "safe" },
        },
      ],
      context,
    );

    expect(result.passed).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: "missing_field",
        path: "conditions[0].field",
        message: expect.stringContaining("attributes.bravery"),
      }),
      expect.objectContaining({
        code: "incompatible_operator",
        path: "conditions[1].op",
        message: expect.stringContaining("display_name"),
      }),
      expect.objectContaining({
        code: "invalid_handler_params",
        path: "conditions[2].params.key",
        message: expect.stringContaining("world_history_value_equals"),
      }),
    ]);
  });
});

function createContext(
  state: ConditionGameState,
  overrides: Partial<ConditionEvaluationContext> = {},
): ConditionEvaluationContext {
  return {
    state,
    trigger_context: triggerContext(),
    ...overrides,
  };
}

function createState(): ConditionGameState {
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
        current_action_id: "act_survey",
        background_event_ids: [],
        inventory_id: "inv_amy",
        diary_entry_ids: [],
        event_history_keys: ["encounter:amy"],
      },
    },
    tiles: {
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
        history_keys: ["encounter:amy"],
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
        items: [{ item_id: "iron_ore", quantity: 5 }],
        resources: { energy: 42 },
      },
    },
    crew_actions: {
      act_survey: {
        id: "act_survey",
        crew_id: "amy",
        type: "survey",
        status: "active",
        source: "player_command",
        target_tile_id: "2-3",
        progress_seconds: 30,
        duration_seconds: 60,
        action_params: {},
        can_interrupt: true,
        interrupt_duration_seconds: 10,
      },
    },
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
        history_keys: ["encounter:amy"],
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
    world_history: {
      "encounter:amy": {
        key: "encounter:amy",
        scope: "crew",
        crew_id: "amy",
        first_triggered_at: 10,
        last_triggered_at: 90,
        trigger_count: 2,
        last_result: "escaped",
        value: "safe",
      },
    },
    world_flags: {
      storm: {
        key: "storm",
        value: "calm",
        value_type: "string",
        created_at: 10,
        updated_at: 100,
      },
    },
    rng_state: null,
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
    world_flag_key: "storm",
    proximity: null,
    payload: {},
  };
}

function handlerDefinition(overrides: Partial<HandlerDefinition>): HandlerDefinition {
  return {
    handler_type: "handler",
    kind: "condition",
    description: "Test handler.",
    params_schema_ref: "#/$defs/test",
    allowed_target_types: ["world_history"],
    deterministic: true,
    uses_random: false,
    failure_policy: "fail_event",
    sample_fixtures: [],
    ...overrides,
  };
}
