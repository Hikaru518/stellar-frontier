import { describe, expect, it } from "vitest";
import type { CallTemplate, EventDefinition } from "../../../pc-client/src/events/types";
import type { EventEditorLibraryResponse } from "./types";
import { deriveGraphEdges, findCallTemplate, formatEdgeMechanism, layoutGraph, resolveEffectRefs, resolveLogTemplate } from "./graphModel";

describe("graphModel", () => {
  it("derives readable transitions from every supported event node shape", () => {
    const definition = createGraphDefinition();

    const edges = deriveGraphEdges(definition);

    expect(edges.map((edge) => `${edge.fromNodeId}->${edge.toNodeId}:${formatEdgeMechanism(edge.mechanism)}`)).toEqual([
      "call->mark_log:option:mark · default",
      "call->missed_end:on_missed",
      "wait->check:wait_next",
      "wait->failed_end:on_interrupted",
      "check->random:branch:has_item",
      "check->failed_end:default",
      "random->action:branch:lucky (w=3)",
      "random->failed_end:default",
      "action->objective:on_accepted",
      "action->spawn:on_completed",
      "action->failed_end:on_failed",
      "objective->log:on_created",
      "objective->mark_end:on_completed",
      "objective->failed_end:on_failed",
      "spawn->log:spawn_next",
      "log->mark_end:log_next",
      "auto->mark_end:auto",
      "timeout->failed_end:timeout",
      "mark_log->mark_end:log_next",
    ]);
    expect(edges.find((edge) => edge.key === "call:mark_log:option:mark")?.effectRefs).toEqual(["mark_effects"]);
    expect(edges.find((edge) => edge.key === "wait:failed_end:on_interrupted")?.effectRefs).toEqual(["interrupt_effects"]);
    expect(edges.find((edge) => edge.key === "timeout:failed_end:timeout")?.effectRefs).toEqual(["timeout_effects"]);
  });

  it("resolves call templates, effect references, and log templates for graph details", () => {
    const definition = createGraphDefinition();
    const library = createLibraryResponse({
      definitions: [{ id: definition.id, domain: "test", asset_type: "event_definition", file_path: "content/events/definitions/test.json", json_path: "$.event_definitions[0]", editable: false, data: definition }],
      call_templates: [
        {
          id: "test.event.call",
          domain: "test",
          asset_type: "call_template",
          file_path: "content/events/call_templates/test.json",
          json_path: "$.call_templates[0]",
          editable: false,
          data: createCallTemplate(),
        },
      ],
    });

    expect(findCallTemplate(library, "test.event", "call")?.id).toBe("test.event.call");
    expect(resolveEffectRefs(definition, ["mark_effects"]).map((effect) => effect.id)).toEqual(["mark"]);
    expect(resolveLogTemplate(definition, "marked_log")?.summary).toBe("Marked");
  });

  it("lays out nodes from left to right and includes the virtual trigger position", () => {
    const definition = createGraphDefinition();
    const edges = deriveGraphEdges(definition);

    const layout = layoutGraph(definition.event_graph.nodes, edges, definition.event_graph.entry_node_id);

    expect(layout.triggerPosition.x).toBeLessThan(layout.nodePositions.call.x);
    expect(layout.nodePositions.mark_end.x).toBeGreaterThan(layout.nodePositions.call.x);
  });
});

function createLibraryResponse(overrides: Partial<EventEditorLibraryResponse> = {}): EventEditorLibraryResponse {
  return {
    definitions: [],
    call_templates: [],
    schemas: {},
    ...overrides,
  };
}

function createCallTemplate(): CallTemplate {
  return {
    schema_version: "event-program-model-v1",
    id: "test.event.call",
    version: 1,
    domain: "test",
    event_definition_id: "test.event",
    node_id: "call",
    render_context_fields: [],
    opening_lines: { selection: "first_match", variants: [{ id: "default", text: "Opening", priority: 0 }] },
    option_lines: {
      mark: { selection: "first_match", variants: [{ id: "default", text: "Mark it.", priority: 0 }] },
    },
    fallback_order: ["default"],
    default_variant_required: true,
  };
}

function createGraphDefinition(): EventDefinition {
  return {
    schema_version: "event-program-model-v1",
    id: "test.event",
    version: 1,
    domain: "test",
    title: "Test event",
    summary: "Test event graph.",
    status: "ready_for_test",
    trigger: { type: "action_complete" },
    candidate_selection: {
      priority: 1,
      weight: 1,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    },
    repeat_policy: {
      scope: "event",
      cooldown_seconds: 0,
      history_key_template: "test.event",
      allow_while_active: false,
    },
    event_graph: {
      entry_node_id: "call",
      terminal_node_ids: ["mark_end", "failed_end", "missed_end"],
      graph_rules: { acyclic: true, max_active_nodes: 1, allow_parallel_nodes: false },
      edges: [],
      nodes: [
        {
          id: "call",
          type: "call",
          title: "Call",
          blocking: { occupies_crew_action: false, occupies_communication: true },
          call_template_id: "test.event.call",
          speaker_crew_ref: { type: "primary_crew" },
          urgency: "normal",
          delivery: "incoming_call",
          options: [{ id: "mark", is_default: true, effect_refs: ["mark_effects"] }],
          option_node_mapping: { mark: "mark_log" },
          on_missed: { next_node_id: "missed_end", effect_refs: ["miss_effects"] },
        },
        {
          id: "wait",
          type: "wait",
          title: "Wait",
          blocking: { occupies_crew_action: false, occupies_communication: false },
          duration_seconds: 30,
          wake_trigger_type: "time_wakeup",
          next_node_id: "check",
          set_next_wakeup_at: true,
          interrupt_policy: "event_can_cancel",
          on_interrupted: { next_node_id: "failed_end", effect_refs: ["interrupt_effects"] },
        },
        {
          id: "check",
          type: "check",
          title: "Check",
          blocking: { occupies_crew_action: false, occupies_communication: false },
          branches: [{ id: "has_item", conditions: [{ type: "inventory_has_item", description: "Has item" }], next_node_id: "random", effect_refs: ["check_effects"] }],
          default_next_node_id: "failed_end",
          evaluation_order: "first_match",
        },
        {
          id: "random",
          type: "random",
          title: "Random",
          blocking: { occupies_crew_action: false, occupies_communication: false },
          seed_scope: "event_instance",
          branches: [{ id: "lucky", weight: 3, next_node_id: "action", effect_refs: ["lucky_effects"] }],
          default_next_node_id: "failed_end",
          store_result_as: "roll",
        },
        {
          id: "action",
          type: "action_request",
          title: "Action",
          blocking: { occupies_crew_action: true, occupies_communication: false },
          request_id: "repair",
          action_type: "survey",
          target_crew_ref: { type: "primary_crew" },
          action_params: {},
          completion_trigger: { type: "action_complete" },
          on_accepted_node_id: "objective",
          on_completed_node_id: "spawn",
          on_failed_node_id: "failed_end",
          occupies_crew_action: true,
        },
        {
          id: "objective",
          type: "objective",
          title: "Objective",
          blocking: { occupies_crew_action: false, occupies_communication: false },
          objective_template: { title: "Objective", summary: "Do it", required_action_type: "survey", required_action_params: {} },
          mode: "create_and_wait",
          on_created_node_id: "log",
          on_completed_node_id: "mark_end",
          on_failed_node_id: "failed_end",
          parent_event_link: true,
        },
        {
          id: "spawn",
          type: "spawn_event",
          title: "Spawn",
          blocking: { occupies_crew_action: false, occupies_communication: false },
          event_definition_id: "child.event",
          spawn_policy: "immediate",
          context_mapping: {},
          parent_event_link: true,
          next_node_id: "log",
        },
        {
          id: "log",
          type: "log_only",
          title: "Log",
          blocking: { occupies_crew_action: false, occupies_communication: false },
          event_log_template_id: "marked_log",
          effect_refs: ["log_effects"],
          next_node_id: "mark_end",
        },
        {
          id: "auto",
          type: "end",
          title: "Auto",
          resolution: "resolved",
          result_key: "auto",
          event_log_template_id: "marked_log",
          history_writes: [],
          blocking: { occupies_crew_action: false, occupies_communication: false },
          auto_next_node_id: "mark_end",
          cleanup_policy: { release_blocking_claims: true, delete_active_calls: true, keep_player_summary: true },
        },
        {
          id: "timeout",
          type: "end",
          title: "Timeout",
          resolution: "expired",
          result_key: "timeout",
          event_log_template_id: "marked_log",
          history_writes: [],
          blocking: { occupies_crew_action: false, occupies_communication: false },
          timeout: { duration_seconds: 10, next_node_id: "failed_end", effect_refs: ["timeout_effects"] },
          cleanup_policy: { release_blocking_claims: true, delete_active_calls: true, keep_player_summary: true },
        },
        {
          id: "mark_log",
          type: "log_only",
          title: "Mark log",
          blocking: { occupies_crew_action: false, occupies_communication: false },
          event_log_template_id: "marked_log",
          next_node_id: "mark_end",
        },
        createEndNode("mark_end", "Marked"),
        createEndNode("failed_end", "Failed"),
        createEndNode("missed_end", "Missed"),
      ],
    },
    effect_groups: [
      {
        id: "mark_effects",
        effects: [
          {
            id: "mark",
            type: "add_event_mark",
            target: { type: "event_tile" },
            params: { label: "Marked" },
            failure_policy: "fail_event",
            record_policy: { write_event_log: false, write_world_history: false },
          },
        ],
      },
    ],
    log_templates: [{ id: "marked_log", summary: "Marked", importance: "normal", visibility: "player_visible" }],
    sample_contexts: [],
  } as EventDefinition;
}

function createEndNode(id: string, title: string) {
  return {
    id,
    type: "end",
    title,
    resolution: "resolved",
    result_key: id,
    event_log_template_id: "marked_log",
    history_writes: [],
    blocking: { occupies_crew_action: false, occupies_communication: false },
    cleanup_policy: { release_blocking_claims: true, delete_active_calls: true, keep_player_summary: true },
  };
}
