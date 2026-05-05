import { describe, expect, it } from "vitest";
import {
  createDefaultBlocking,
  createDefaultCallTemplateShell,
  createDefaultEventDefinitionShell,
  createDefaultGraphRules,
  createTextVariantGroup,
  deriveCallTemplateId,
  isSafeEventId,
  normalizeEventIdCandidate,
} from "./templates";

describe("event authoring templates", () => {
  it("validates helper-side safe event ids", () => {
    expect(isSafeEventId("forest_trace-01")).toBe(true);
    expect(isSafeEventId("0_intro")).toBe(true);

    expect(isSafeEventId("ForestTrace")).toBe(false);
    expect(isSafeEventId("_forest")).toBe(false);
    expect(isSafeEventId("forest.trace")).toBe(false);
    expect(isSafeEventId("../forest")).toBe(false);
    expect(isSafeEventId("")).toBe(false);
  });

  it("normalizes author input into a safe event id candidate", () => {
    expect(normalizeEventIdCandidate(" Forest Signal 01 ")).toBe("forest_signal_01");
    expect(normalizeEventIdCandidate("forest.signal/call")).toBe("forest_signal_call");
    expect(normalizeEventIdCandidate("__Forest--Signal!!")).toBe("forest--signal");
    expect(normalizeEventIdCandidate("!!!")).toBe("");
  });

  it("derives stable call template ids from the event id and node id", () => {
    expect(deriveCallTemplateId("forest_bridge_choice", "briefing")).toBe("forest_bridge_choice.call.briefing");
    expect(deriveCallTemplateId("forest_bridge_choice", "briefing")).toBe("forest_bridge_choice.call.briefing");
    expect(deriveCallTemplateId("forest_bridge_choice", "followup")).toBe("forest_bridge_choice.call.followup");
  });

  it("creates fixed default graph rules", () => {
    expect(createDefaultGraphRules()).toEqual({
      acyclic: true,
      max_active_nodes: 1,
      allow_parallel_nodes: false,
    });
  });

  it("creates schema-aligned blocking and text variant defaults", () => {
    expect(createDefaultBlocking()).toEqual({
      occupies_crew_action: false,
      occupies_communication: false,
      blocking_key_template: null,
    });
    expect(createDefaultBlocking({ occupiesCommunication: true })).toEqual({
      occupies_crew_action: false,
      occupies_communication: true,
      blocking_key_template: null,
    });
    expect(createTextVariantGroup("Opening line.")).toEqual({
      selection: "first_match",
      variants: [{ id: "default", text: "Opening line.", priority: 1 }],
    });
    expect(createTextVariantGroup().variants[0]?.text).toBe("TODO text.");
  });

  it("creates a schema-aligned default event definition shell with one call path", () => {
    const definition = createDefaultEventDefinitionShell({
      domain: "forest",
      definitionId: "forest_signal",
      title: "Forest Signal",
      summary: "Crew hears a signal in the forest.",
    });
    const graph = definition.event_graph;

    expect(definition).toMatchObject({
      schema_version: "event-program-model-v1",
      id: "forest_signal",
      version: 1,
      domain: "forest",
      title: "Forest Signal",
      summary: "Crew hears a signal in the forest.",
      status: "draft",
      trigger: {
        type: "arrival",
        conditions: [],
      },
      candidate_selection: {
        priority: 0,
        weight: 1,
        max_instances_per_trigger: 1,
        requires_blocking_slot: false,
      },
      repeat_policy: {
        scope: "event",
        max_trigger_count: null,
        cooldown_seconds: 0,
        history_key_template: "forest_signal_triggered",
        allow_while_active: false,
      },
      content_refs: {
        call_template_ids: ["forest_signal.call.call"],
      },
      sample_contexts: [],
    });
    expect(graph).toBeDefined();
    expect(graph?.entry_node_id).toBe("call");
    expect(graph?.terminal_node_ids).toEqual(["end"]);
    expect(graph?.graph_rules).toEqual({
      acyclic: true,
      max_active_nodes: 1,
      allow_parallel_nodes: false,
    });
    expect(graph?.edges).toEqual([{ from_node_id: "call", to_node_id: "end", via: "ack" }]);
    expect(graph?.nodes).toHaveLength(2);
    expect(graph?.nodes[0]).toMatchObject({
      id: "call",
      type: "call",
      call_template_id: "forest_signal.call.call",
      speaker_crew_ref: { type: "primary_crew" },
      urgency: "normal",
      delivery: "queued_message",
      options: [{ id: "ack", is_default: true }],
      option_node_mapping: { ack: "end" },
      blocking: {
        occupies_crew_action: false,
        occupies_communication: true,
        blocking_key_template: null,
      },
    });
    expect(graph?.nodes[1]).toMatchObject({
      id: "end",
      type: "end",
      resolution: "resolved",
      result_key: "resolved",
      event_log_template_id: "resolved_log",
      history_writes: [],
      cleanup_policy: {
        release_blocking_claims: true,
        delete_active_calls: true,
        keep_player_summary: true,
      },
    });
    expect(definition.log_templates).toEqual([
      {
        id: "resolved_log",
        summary: "Forest Signal resolved.",
        importance: "normal",
        visibility: "player_visible",
      },
    ]);
  });

  it("creates a matching default call template shell", () => {
    const template = createDefaultCallTemplateShell({
      domain: "forest",
      eventDefinitionId: "forest_signal",
      nodeId: "call",
    });

    expect(template).toEqual({
      schema_version: "event-program-model-v1",
      id: "forest_signal.call.call",
      version: 1,
      domain: "forest",
      event_definition_id: "forest_signal",
      node_id: "call",
      render_context_fields: [],
      opening_lines: createTextVariantGroup("Opening line for call."),
      option_lines: {
        ack: createTextVariantGroup("Acknowledge."),
      },
      fallback_order: ["default"],
      default_variant_required: true,
    });
  });
});
