import { describe, expect, expectTypeOf, it } from "vitest";
import type { GameState } from "../data/gameData";
import { GAME_SAVE_KEY, GAME_SAVE_SCHEMA_VERSION, isCompatibleGameSaveState, loadGameSave } from "../timeSystem";
import {
  createEmptyEventRuntimeState,
  type EventDefinition,
  type EventLog,
  type EventRuntimeState,
  type Objective,
  type RuntimeCall,
  type RuntimeEvent,
  type SaveState,
  type TriggerContext,
  type WorldFlag,
  type WorldHistoryEntry,
} from "./types";

describe("event program model contracts", () => {
  it("adds the event runtime collections to GameState with empty defaults", () => {
    const eventState = createEmptyEventRuntimeState();

    expect(eventState).toEqual({
      active_events: {},
      active_calls: {},
      objectives: {},
      event_logs: [],
      world_history: {},
      world_flags: {},
      crew_actions: {},
      inventories: {},
      rng_state: null,
    });

    expectTypeOf<GameState>().toMatchTypeOf<EventRuntimeState>();
    expectTypeOf<GameState["active_events"]>().toEqualTypeOf<Record<string, RuntimeEvent>>();
    expectTypeOf<GameState["active_calls"]>().toEqualTypeOf<Record<string, RuntimeCall>>();
    expectTypeOf<GameState["objectives"]>().toEqualTypeOf<Record<string, Objective>>();
    expectTypeOf<GameState["event_logs"]>().toEqualTypeOf<EventLog[]>();
    expectTypeOf<GameState["world_history"]>().toEqualTypeOf<Record<string, WorldHistoryEntry>>();
    expectTypeOf<GameState["world_flags"]>().toEqualTypeOf<Record<string, WorldFlag>>();
    expectTypeOf<GameState["crew_actions"]>().toEqualTypeOf<EventRuntimeState["crew_actions"]>();
    expectTypeOf<GameState["inventories"]>().toEqualTypeOf<EventRuntimeState["inventories"]>();
    expectTypeOf<GameState["rng_state"]>().toEqualTypeOf<object | null>();
  });

  it("rejects obsolete saves instead of returning a partial old state", () => {
    window.localStorage.setItem(
      GAME_SAVE_KEY,
      JSON.stringify({
        elapsedGameSeconds: 12,
        crew: [],
        tiles: [],
        logs: [],
        resources: {},
        eventHistory: {},
      }),
    );

    expect(loadGameSave(isCompatibleGameSaveState)).toBeNull();
  });

  it("accepts saves only when the new event collections are present", () => {
    const saveState = {
      schema_version: GAME_SAVE_SCHEMA_VERSION,
      created_at_real_time: "2026-04-27T00:00:00.000Z",
      updated_at_real_time: "2026-04-27T00:00:00.000Z",
      elapsed_game_seconds: 0,
      crew: {},
      crew_actions: {},
      tiles: {},
      inventories: {},
      active_events: {},
      active_calls: {},
      objectives: {},
      event_logs: [],
      world_history: {},
      world_flags: {},
      rng_state: null,
    } satisfies SaveState;

    window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(saveState));

    expect(loadGameSave(isCompatibleGameSaveState)).toEqual(saveState);
  });

  it("uses canonical snake_case event model fields without camelCase synonyms", () => {
    const triggerContext = {
      trigger_type: "arrival",
      occurred_at: 42,
      source: "tile_system",
      crew_id: "mike",
      tile_id: "2-1",
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
    } satisfies TriggerContext;

    const definition = {
      schema_version: "event-program-model-v1",
      id: "fixture_normal_discovery",
      version: 1,
      domain: "fixture_events",
      title: "Fixture Discovery",
      summary: "A small fixture discovery event.",
      tags: ["fixture"],
      status: "draft",
      trigger: {
        type: "arrival",
        conditions: [],
        required_context: ["crew_id", "tile_id"],
      },
      candidate_selection: {
        priority: 1,
        weight: 1,
        mutex_group: null,
        max_instances_per_trigger: 1,
        requires_blocking_slot: false,
      },
      repeat_policy: {
        scope: "crew_tile",
        max_trigger_count: 1,
        cooldown_seconds: 0,
        history_key_template: "crew_tile:{crew_id}:{tile_id}:fixture_normal_discovery",
        allow_while_active: false,
      },
      event_graph: {
        entry_node_id: "start",
        nodes: [
          {
            id: "start",
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
        terminal_node_ids: ["start"],
        graph_rules: {
          acyclic: true,
          max_active_nodes: 1,
          allow_parallel_nodes: false,
        },
      },
      sample_contexts: [triggerContext],
    } satisfies EventDefinition;

    expect(definition.event_graph.entry_node_id).toBe("start");

    type RuntimeEventCamelCaseSynonyms = Extract<
      keyof RuntimeEvent,
      | "eventDefinitionId"
      | "eventDefinitionVersion"
      | "currentNodeId"
      | "primaryCrewId"
      | "activeCallId"
      | "selectedOptions"
      | "triggerContextSnapshot"
      | "resultSummary"
    >;
    type RuntimeCallCamelCaseSynonyms = Extract<
      keyof RuntimeCall,
      "eventId" | "eventNodeId" | "callTemplateId" | "crewId" | "renderedLines" | "availableOptions" | "selectedOptionId"
    >;

    expectTypeOf<RuntimeEventCamelCaseSynonyms>().toEqualTypeOf<never>();
    expectTypeOf<RuntimeCallCamelCaseSynonyms>().toEqualTypeOf<never>();
  });
});
