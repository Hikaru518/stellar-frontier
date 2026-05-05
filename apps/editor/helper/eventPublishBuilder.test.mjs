// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildEventPublishContent } from "./eventPublishBuilder.mjs";

describe("eventPublishBuilder", () => {
  it("builds a ready-for-test formal definition for a new draft", () => {
    const result = buildEventPublishContent(
      draftEnvelope({
        mode: "new",
        target: targetRef({ domain: "forest", definition_id: "forest_bridge_choice" }),
        working_definition: minimalEventDefinition({
          id: "tampered_id",
          domain: "tampered_domain",
          status: "draft",
          schema_version: "old-version",
          graph_rules: {
            acyclic: false,
            max_active_nodes: 7,
            allow_parallel_nodes: true,
          },
        }),
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.generated.definition).toEqual(
      expect.objectContaining({
        schema_version: "event-program-model-v1",
        id: "forest_bridge_choice",
        domain: "forest",
        status: "ready_for_test",
      }),
    );
    expect(result.generated.definition.event_graph.graph_rules).toEqual({
      acyclic: true,
      max_active_nodes: 1,
      allow_parallel_nodes: false,
    });
  });

  it("derives stable call template ids and exact option lines for call nodes without template ids", () => {
    const result = buildEventPublishContent(
      draftEnvelope({
        target: targetRef({ definition_id: "forest_bridge_choice" }),
        working_definition: minimalEventDefinition({
          id: "forest_bridge_choice",
          nodes: [
            minimalCallNode({
              id: "briefing",
              call_template_id: undefined,
              options: [{ id: "accept" }, { id: "decline" }],
              option_node_mapping: { accept: "end", decline: "end" },
            }),
            minimalEndNode(),
          ],
        }),
        working_call_templates: [
          minimalCallTemplate({
            id: "stale_template",
            node_id: "briefing",
            option_lines: {
              accept: variantGroup("Keep this line."),
              stale: variantGroup("Drop this stale line."),
            },
          }),
        ],
      }),
    );

    const callNode = result.generated.definition.event_graph.nodes[0];
    const [template] = result.generated.call_templates;

    expect(callNode.call_template_id).toBe("forest_bridge_choice.call.briefing");
    expect(template).toEqual(
      expect.objectContaining({
        schema_version: "event-program-model-v1",
        id: "forest_bridge_choice.call.briefing",
        domain: "forest",
        event_definition_id: "forest_bridge_choice",
        node_id: "briefing",
      }),
    );
    expect(Object.keys(template.option_lines).sort()).toEqual(["accept", "decline"]);
    expect(template.option_lines.accept).toEqual(variantGroup("Keep this line."));
    expect(template.option_lines.decline.variants[0].text).toContain("decline");
    expect(result.generated.definition.content_refs.call_template_ids).toEqual(["forest_bridge_choice.call.briefing"]);
  });

  it("preserves existing call template ids while deriving ids for new call nodes in edit-existing drafts", () => {
    const result = buildEventPublishContent(
      draftEnvelope({
        mode: "edit_existing",
        source: {
          definition_id: "forest_trace_small_camp",
          domain: "forest",
          definition_file_path: "content/events/definitions/forest.json",
          definition_json_path: "/event_definitions/0",
          call_template_file_path: "content/events/call_templates/forest.json",
          call_template_ids: ["forest_trace_small_camp.call.report"],
          call_template_json_paths: ["/call_templates/0"],
          manifest_file_path: "content/events/manifest.json",
        },
        target: targetRef({ definition_id: "forest_trace_small_camp" }),
        working_definition: minimalEventDefinition({
          id: "forest_trace_small_camp",
          content_refs: {
            call_template_ids: ["stale_template_id"],
            item_ids: ["signal_flare"],
          },
          nodes: [
            minimalCallNode({
              id: "report",
              call_template_id: "forest_trace_small_camp.call.report",
              options: [{ id: "ack" }],
              option_node_mapping: { ack: "new_followup" },
            }),
            minimalCallNode({
              id: "new_followup",
              call_template_id: undefined,
              options: [{ id: "continue" }],
              option_node_mapping: { continue: "end" },
            }),
            minimalEndNode(),
          ],
        }),
        working_call_templates: [
          minimalCallTemplate({
            id: "forest_trace_small_camp.call.report",
            event_definition_id: "wrong_event",
            node_id: "report",
            option_lines: {
              ack: variantGroup("Acknowledged."),
            },
          }),
        ],
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.generated.definition.event_graph.nodes[0].call_template_id).toBe("forest_trace_small_camp.call.report");
    expect(result.generated.definition.event_graph.nodes[1].call_template_id).toBe("forest_trace_small_camp.call.new_followup");
    expect(result.generated.call_templates.map((template) => template.id)).toEqual([
      "forest_trace_small_camp.call.report",
      "forest_trace_small_camp.call.new_followup",
    ]);
    expect(result.generated.call_templates[0]).toEqual(
      expect.objectContaining({
        event_definition_id: "forest_trace_small_camp",
        node_id: "report",
      }),
    );
    expect(result.generated.definition.content_refs).toEqual({
      call_template_ids: ["forest_trace_small_camp.call.report", "forest_trace_small_camp.call.new_followup"],
      item_ids: ["signal_flare"],
    });
  });

  it("returns structured issues instead of throwing when target fields are missing", () => {
    const result = buildEventPublishContent({
      schema_version: "event-editor-draft-v1",
      draft_id: "broken_draft",
      mode: "new",
      status: "active",
      source: null,
      target: {},
      working_definition: {},
      working_call_templates: [],
    });

    expect(result.valid).toBe(false);
    expect(result.generated).toBeUndefined();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "missing_target_domain",
          asset_type: "draft",
          asset_id: "broken_draft",
          json_path: "/target/domain",
        }),
        expect.objectContaining({
          severity: "error",
          code: "missing_target_definition_id",
          asset_type: "draft",
          asset_id: "broken_draft",
          json_path: "/target/definition_id",
        }),
      ]),
    );
  });
});

function draftEnvelope(overrides = {}) {
  return {
    schema_version: "event-editor-draft-v1",
    draft_id: "draft_1",
    mode: "new",
    status: "active",
    source: null,
    target: targetRef(),
    working_definition: minimalEventDefinition({}),
    working_call_templates: [],
    editor_state: {
      active_step: "basic",
      selection: null,
      collapsed_sections: [],
    },
    hashes: {
      source_definition_file: null,
      source_call_template_file: null,
      source_manifest: null,
      draft: null,
    },
    created_at: "2026-05-05T15:30:12.000Z",
    updated_at: "2026-05-05T15:30:12.000Z",
    published_at: null,
    published_files: [],
    ...overrides,
  };
}

function targetRef(overrides = {}) {
  return {
    domain: "forest",
    definition_id: "forest_trace",
    definition_file_path: "content/events/definitions/forest.json",
    call_template_file_path: "content/events/call_templates/forest.json",
    ...overrides,
  };
}

function minimalEventDefinition({
  id = "forest_trace",
  domain = "forest",
  status = "draft",
  schema_version = "event-program-model-v1",
  graph_rules = {
    acyclic: true,
    max_active_nodes: 1,
    allow_parallel_nodes: false,
  },
  nodes = [minimalCallNode(), minimalEndNode()],
  content_refs,
} = {}) {
  return {
    schema_version,
    id,
    version: 1,
    domain,
    title: "Forest Trace",
    summary: "A small trace in the forest.",
    tags: ["forest"],
    status,
    trigger: {
      type: "arrival",
      conditions: [],
    },
    candidate_selection: {
      priority: 1,
      weight: 1,
      mutex_group: null,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    },
    repeat_policy: {
      scope: "world",
      max_trigger_count: null,
      cooldown_seconds: 0,
      history_key_template: `event:${id}`,
      allow_while_active: false,
    },
    event_graph: {
      entry_node_id: nodes[0]?.id ?? "call",
      nodes,
      edges: nodes
        .filter((node) => node.type === "call")
        .flatMap((node) => node.options.map((option) => ({ from_node_id: node.id, to_node_id: node.option_node_mapping[option.id], via: option.id }))),
      terminal_node_ids: ["end"],
      graph_rules,
    },
    effect_groups: [],
    log_templates: [],
    ...(content_refs ? { content_refs } : {}),
    sample_contexts: [],
  };
}

function minimalCallNode(overrides = {}) {
  const node = {
    id: "call",
    type: "call",
    title: "Call",
    blocking: minimalBlocking(),
    event_log_template_id: null,
    call_template_id: "forest_trace.call.call",
    speaker_crew_ref: { type: "primary_crew" },
    urgency: "normal",
    delivery: "incoming_call",
    options: [{ id: "accept" }, { id: "decline" }],
    option_node_mapping: {
      accept: "end",
      decline: "end",
    },
    ...overrides,
  };

  if (overrides.call_template_id === undefined) {
    delete node.call_template_id;
  }

  return node;
}

function minimalEndNode() {
  return {
    id: "end",
    type: "end",
    title: "End",
    blocking: minimalBlocking(),
    resolution: "resolved",
    result_key: "resolved",
    event_log_template_id: null,
    history_writes: [],
    cleanup_policy: {
      release_blocking_claims: true,
      delete_active_calls: true,
      keep_player_summary: true,
    },
  };
}

function minimalCallTemplate(overrides = {}) {
  return {
    schema_version: "event-program-model-v1",
    id: "forest_trace.call.call",
    version: 1,
    domain: "forest",
    event_definition_id: "forest_trace",
    node_id: "call",
    render_context_fields: [],
    opening_lines: variantGroup("Opening"),
    option_lines: {
      accept: variantGroup("Accept"),
      decline: variantGroup("Decline"),
    },
    fallback_order: ["default"],
    default_variant_required: true,
    ...overrides,
  };
}

function variantGroup(text) {
  return {
    variants: [{ id: "default", text, priority: 1 }],
    selection: "first_match",
  };
}

function minimalBlocking() {
  return {
    occupies_crew_action: false,
    occupies_communication: false,
    blocking_key_template: null,
  };
}
