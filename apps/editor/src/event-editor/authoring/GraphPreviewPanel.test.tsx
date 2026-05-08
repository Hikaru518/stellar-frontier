import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventDefinition } from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope } from "../types";
import GraphPreviewPanel from "./GraphPreviewPanel";

const graphCanvasMock = vi.hoisted(() => ({
  calls: [] as Array<{ interactive?: boolean; edges: unknown[] }>,
}));

vi.mock("../GraphCanvas", () => ({
  default: (props: { interactive?: boolean; edges: unknown[] }) => {
    graphCanvasMock.calls.push(props);

    return (
      <div aria-label="Event graph canvas" data-interactive={String(props.interactive)}>
        Mock graph canvas
      </div>
    );
  },
}));

describe("GraphPreviewPanel", () => {
  afterEach(() => {
    cleanup();
    graphCanvasMock.calls = [];
  });

  it("renders working_definition nodes and derived transitions in read-only mode", () => {
    render(<GraphPreviewPanel draft={createDraftEnvelope({ working_definition: createDefinition() as EventDraftEnvelope["working_definition"] })} />);

    expect(screen.getByRole("heading", { name: "Graph Preview" })).toBeInTheDocument();
    expect(screen.getByLabelText("Graph preview summary")).toHaveTextContent("2");
    expect(screen.getByLabelText("Graph preview summary")).toHaveTextContent("1");
    expect(screen.getByRole("heading", { name: "Graph Health" })).toBeInTheDocument();
    expect(screen.getByText("No structural issues detected.")).toBeInTheDocument();

    const nodes = screen.getByRole("list", { name: "Graph preview nodes" });
    expect(within(nodes).getByText("intro_call")).toBeInTheDocument();
    expect(within(nodes).getByText("resolved")).toBeInTheDocument();

    const transitions = screen.getByRole("list", { name: "Graph preview transitions" });
    expect(within(transitions).getByText("intro_call -> resolved")).toBeInTheDocument();
    expect(within(transitions).getByText("option:investigate · default")).toBeInTheDocument();

    expect(screen.getByLabelText("Event graph canvas")).toHaveAttribute("data-interactive", "false");
    expect(graphCanvasMock.calls).toHaveLength(1);
    expect(graphCanvasMock.calls[0]?.interactive).toBe(false);
    expect(graphCanvasMock.calls[0]?.edges).toHaveLength(1);
  });

  it("shows health issues instead of crashing when the graph is incomplete", () => {
    render(<GraphPreviewPanel workingDefinition={createIncompleteDefinition()} />);

    expect(screen.getByRole("heading", { name: "Graph Preview" })).toBeInTheDocument();
    expect(screen.getByText("Graph preview is incomplete.")).toBeInTheDocument();
    expect(screen.getByText("Entry node not found: missing_entry.")).toBeInTheDocument();
    expect(screen.getByText("Terminal node not found: missing_terminal.")).toBeInTheDocument();
    expect(screen.getByText("Call option intro_call.orphan has no option_node_mapping target.")).toBeInTheDocument();
    expect(screen.getByText("Edge target node not found: missing_target.")).toBeInTheDocument();
    expect(screen.getByText("Edge source node not found: missing_source.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Event graph canvas")).not.toBeInTheDocument();
    expect(graphCanvasMock.calls).toHaveLength(0);
  });
});

function createDraftEnvelope(overrides: Partial<EventDraftEnvelope> = {}): EventDraftEnvelope {
  const draft: EventDraftEnvelope = {
    schema_version: "event-editor-draft-v1",
    draft_id: "forest_bridge_choice_20260505_153012",
    mode: "new",
    status: "active",
    source: null,
    target: {
      domain: "forest",
      definition_id: "forest.bridge_choice",
      definition_file_path: "content/events/definitions/forest.json",
      call_template_file_path: "content/events/call_templates/forest.json",
    },
    working_definition: createDefinition() as EventDraftEnvelope["working_definition"],
    working_call_templates: [],
    editor_state: {
      active_step: "graph",
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

  return {
    ...draft,
    ...overrides,
  };
}

function createDefinition(): EventDefinition {
  return {
    schema_version: "event-program-model-v1",
    id: "forest.bridge_choice",
    version: 1,
    domain: "forest",
    title: "Bridge choice",
    summary: "Choose how to cross the bridge.",
    status: "draft",
    trigger: { type: "arrival", conditions: [] },
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
      history_key_template: "forest.bridge_choice",
      allow_while_active: false,
    },
    event_graph: {
      entry_node_id: "intro_call",
      terminal_node_ids: ["resolved"],
      graph_rules: { acyclic: true, max_active_nodes: 1, allow_parallel_nodes: false },
      edges: [],
      nodes: [
        {
          id: "intro_call",
          type: "call",
          title: "Incoming signal",
          blocking: { occupies_crew_action: false, occupies_communication: true },
          call_template_id: "forest.bridge_choice.call",
          speaker_crew_ref: { type: "primary_crew" },
          urgency: "normal",
          delivery: "incoming_call",
          options: [{ id: "investigate", is_default: true }],
          option_node_mapping: { investigate: "resolved" },
        },
        {
          id: "resolved",
          type: "end",
          title: "Resolved",
          blocking: { occupies_crew_action: false, occupies_communication: false },
          resolution: "resolved",
          result_key: "resolved",
          event_log_template_id: "resolved_log",
          history_writes: [],
          cleanup_policy: {
            release_blocking_claims: true,
            delete_active_calls: true,
            keep_player_summary: true,
          },
        },
      ],
    },
    log_templates: [{ id: "resolved_log", summary: "Resolved.", importance: "normal", visibility: "player_visible" }],
    sample_contexts: [],
  };
}

function createIncompleteDefinition(): EventDefinition {
  const definition = createDefinition();
  definition.event_graph.entry_node_id = "missing_entry";
  definition.event_graph.terminal_node_ids = ["resolved", "missing_terminal"];
  definition.event_graph.edges = [{ from_node_id: "missing_source", to_node_id: "resolved", via: "manual" }];
  const callNode = definition.event_graph.nodes[0];

  if (callNode.type === "call") {
    callNode.options.push({ id: "orphan" });
    callNode.option_node_mapping.investigate = "missing_target";
  }

  return definition;
}
