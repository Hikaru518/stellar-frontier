import { describe, expect, it } from "vitest";
import { renderRuntimeCall } from "./callRenderer";
import { createEmptyEventRuntimeState, type CallNode, type CallTemplate, type CrewState, type RuntimeEvent, type TriggerContext } from "./types";
import type { GraphRunnerGameState } from "./graphRunner";

describe("runtime call renderer", () => {
  it("renders a call snapshot with matched lines, available options, context, and expiry", () => {
    const result = renderRuntimeCall({
      state: createState(),
      event: runtimeEvent(),
      node: callNode(),
      template: callTemplate(),
      trigger_context: triggerContext(200),
    });

    expect(result.errors).toEqual([]);
    expect(result.call).toEqual(
      expect.objectContaining({
        id: "evt_test:signal_call:call",
        event_id: "evt_test",
        event_node_id: "signal_call",
        call_template_id: "signal_template",
        crew_id: "amy",
        status: "awaiting_choice",
        created_at: 200,
        expires_at: 245,
        render_context_snapshot: {
          crew_id: "amy",
          personality_tags: ["steady"],
          event_pressure: "urgent",
          previous_choices: { previous_call: "scan" },
        },
      }),
    );
    expect(result.call.rendered_lines).toEqual([
      {
        template_variant_id: "opening_steady",
        text: "Amy keeps her voice steady.",
        speaker_crew_id: "amy",
      },
      {
        template_variant_id: "body_default",
        text: "Signal pressure: urgent.",
        speaker_crew_id: "amy",
      },
    ]);
    expect(result.call.available_options).toEqual([
      {
        option_id: "press_on",
        template_variant_id: "press_steady",
        text: "Keep searching carefully",
        is_default: false,
      },
    ]);
  });
});

function createState(): GraphRunnerGameState {
  return {
    ...createEmptyEventRuntimeState(),
    elapsed_game_seconds: 200,
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
    expertise_tags: ["scanner"],
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

function runtimeEvent(): RuntimeEvent {
  return {
    id: "evt_test",
    event_definition_id: "test_event",
    event_definition_version: 1,
    status: "active",
    current_node_id: "signal_call",
    primary_crew_id: "amy",
    related_crew_ids: [],
    primary_tile_id: "2-3",
    related_tile_ids: [],
    parent_event_id: null,
    child_event_ids: [],
    objective_ids: [],
    active_call_id: null,
    selected_options: { previous_call: "scan" },
    random_results: {},
    blocking_claim_ids: [],
    created_at: 180,
    updated_at: 190,
    deadline_at: null,
    next_wakeup_at: null,
    trigger_context_snapshot: triggerContext(180),
    history_keys: [],
    result_key: null,
    result_summary: null,
  };
}

function callNode(): CallNode {
  return {
    id: "signal_call",
    type: "call",
    title: "Signal Call",
    blocking: {
      occupies_crew_action: false,
      occupies_communication: true,
      blocking_key_template: null,
    },
    call_template_id: "signal_template",
    speaker_crew_ref: { type: "primary_crew" },
    urgency: "urgent",
    delivery: "incoming_call",
    expires_in_seconds: 45,
    options: [
      { id: "press_on" },
      {
        id: "retreat",
        requirements: [{ type: "world_flag_equals", field: "retreat_unlocked", value: true }],
      },
    ],
    option_node_mapping: {
      press_on: "success_end",
      retreat: "retreat_end",
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
    render_context_fields: ["crew_id", "personality_tags", "event_pressure", "previous_choices"],
    opening_lines: {
      selection: "best_match",
      variants: [
        { id: "opening_default", text: "Default report.", priority: 0 },
        { id: "opening_steady", text: "Amy keeps her voice steady.", when: [...steadyCondition], priority: 10 },
      ],
    },
    body_lines: [
      {
        selection: "first_match",
        variants: [{ id: "body_default", text: "Signal pressure: {{event_pressure}}.", priority: 0 }],
      },
    ],
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
    node_id: "signal_call",
    call_id: null,
    objective_id: null,
    selected_option_id: null,
    world_flag_key: null,
    proximity: null,
    payload: {},
  };
}
