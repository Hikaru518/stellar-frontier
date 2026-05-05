import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventDraftEnvelope } from "../types";
import StructuredJsonViewer from "./StructuredJsonViewer";

describe("StructuredJsonViewer", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders draft JSON in named collapsible sections with counts", () => {
    render(<StructuredJsonViewer draft={createDraft()} />);

    expect(screen.getByRole("region", { name: "Structured raw JSON viewer" })).toBeInTheDocument();

    for (const label of [
      "Draft Envelope",
      "Event Definition",
      "Trigger",
      "Graph Nodes",
      "Effect Groups",
      "Log Templates",
      "Call Templates",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }

    expect(screen.getByRole("button", { name: "Graph Nodes" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("2 nodes")).toBeInTheDocument();
    expect(screen.getByText("1 groups")).toBeInTheDocument();
    expect(screen.getAllByText("1 templates").length).toBe(2);
  });

  it("expands matching sections when searching", () => {
    render(<StructuredJsonViewer draft={createDraft()} />);

    fireEvent.change(screen.getByLabelText("Search raw JSON"), { target: { value: "bridge_effects" } });

    expect(screen.getByRole("button", { name: "Effect Groups" })).toHaveAttribute("aria-expanded", "true");
    const tree = screen.getByRole("list", { name: "Effect Groups JSON tree" });
    expect(within(tree).getByText("\"bridge_effects\"")).toBeInTheDocument();
    expect(screen.getAllByText("match").length).toBeGreaterThan(0);
  });

  it("copies section and field JSON paths", () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<StructuredJsonViewer draft={createDraft()} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy path /working_definition/event_graph/nodes" }));
    fireEvent.click(screen.getByRole("button", { name: "Event Definition" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy path /working_definition/title" }));

    expect(writeText).toHaveBeenNthCalledWith(1, "/working_definition/event_graph/nodes");
    expect(writeText).toHaveBeenNthCalledWith(2, "/working_definition/title");
  });

  it("opens and marks the section that contains a focused JSON path", () => {
    render(<StructuredJsonViewer draft={createDraft()} focusPath="/working_definition/event_graph/nodes/0/id" />);

    expect(screen.getByRole("button", { name: "Graph Nodes" })).toHaveAttribute("aria-expanded", "true");
    const tree = screen.getByRole("list", { name: "Graph Nodes JSON tree" });
    const focusedPath = within(tree).getByText("/working_definition/event_graph/nodes/0/id").closest(".structured-json-row");

    expect(focusedPath).toHaveAttribute("data-focused", "true");
    expect(screen.getByText("focused path")).toBeInTheDocument();
  });
});

function createDraft(): EventDraftEnvelope {
  return {
    schema_version: "event-editor-draft-v1",
    draft_id: "forest_bridge_choice_20260505_153012",
    mode: "new",
    status: "active",
    source: null,
    target: {
      domain: "forest",
      definition_id: "forest_bridge_choice",
      definition_file_path: "content/events/definitions/forest.json",
      call_template_file_path: "content/events/call_templates/forest.json",
    },
    working_definition: {
      schema_version: "event-program-model-v1",
      id: "forest_bridge_choice",
      version: 1,
      domain: "forest",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
      status: "ready_for_test",
      trigger: { type: "arrival", required_context: ["crew_id", "tile_id"] },
      candidate_selection: {
        priority: 0,
        weight: 1,
        mutex_group: null,
        max_instances_per_trigger: 1,
        requires_blocking_slot: false,
      },
      repeat_policy: {
        scope: "event",
        max_trigger_count: null,
        cooldown_seconds: 0,
        history_key_template: "forest_bridge_choice_triggered",
        allow_while_active: false,
      },
      event_graph: {
        entry_node_id: "call",
        nodes: [
          {
            id: "call",
            type: "call",
            title: "Call",
            blocking: { occupies_crew_action: false, occupies_communication: false },
            call_template_id: "forest_bridge_choice.call.call",
            speaker_crew_ref: { type: "primary_crew" },
            urgency: "normal",
            delivery: "incoming_call",
            options: [{ id: "ack", is_default: true }],
            option_node_mapping: { ack: "end" },
          },
          {
            id: "end",
            type: "end",
            title: "End",
            blocking: { occupies_crew_action: false, occupies_communication: false },
            resolution: "resolved",
            result_key: "resolved",
            event_log_template_id: "bridge_log",
            history_writes: [],
            cleanup_policy: { release_blocking_claims: true, delete_active_calls: true, keep_player_summary: true },
          },
        ],
        edges: [{ from_node_id: "call", to_node_id: "end", via: "ack" }],
        terminal_node_ids: ["end"],
        graph_rules: { acyclic: true, max_active_nodes: 1, allow_parallel_nodes: false },
      },
      effect_groups: [{ id: "bridge_effects", description: "Bridge effects.", effects: [] }],
      log_templates: [{ id: "bridge_log", summary: "Bridge resolved.", importance: "normal", visibility: "player_visible" }],
      content_refs: { call_template_ids: ["forest_bridge_choice.call.call"] },
      sample_contexts: [],
    },
    working_call_templates: [
      {
        schema_version: "event-program-model-v1",
        id: "forest_bridge_choice.call.call",
        version: 1,
        domain: "forest",
        event_definition_id: "forest_bridge_choice",
        node_id: "call",
        render_context_fields: [],
        opening_lines: { selection: "first_match", variants: [{ id: "default", text: "Report.", priority: 1 }] },
        option_lines: { ack: { selection: "first_match", variants: [{ id: "default", text: "Acknowledge.", priority: 1 }] } },
        fallback_order: ["default"],
        default_variant_required: true,
      },
    ],
    editor_state: {
      active_step: "review",
      selection: null,
      collapsed_sections: [],
    },
    hashes: {
      source_definition_file: null,
      source_call_template_file: null,
      source_manifest: null,
      draft: "a".repeat(64),
    },
    created_at: "2026-05-05T15:30:12.000Z",
    updated_at: "2026-05-05T15:30:12.000Z",
    published_at: null,
    published_files: [],
  };
}
