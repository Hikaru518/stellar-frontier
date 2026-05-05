import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventNode, LogOnlyNode, WaitNode } from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope } from "../types";
import { createDefaultNewDraftEnvelope } from "./draftEnvelope";
import GraphStructureEditor from "./GraphStructureEditor";

vi.mock("./GraphPreviewPanel", () => ({
  default: () => <section aria-label="Read-only graph preview">Graph Preview</section>,
}));

const CREATED_AT = "2026-05-05T15:30:12.000Z";

describe("GraphStructureEditor", () => {
  afterEach(() => {
    cleanup();
  });

  it("adds, selects, edits common fields, and deletes a node through the reducer", () => {
    const onDraftChange = vi.fn();

    render(<GraphStructureEditorHarness draft={createDraft()} onDraftChange={onDraftChange} />);

    const addForm = screen.getByRole("form", { name: "Add graph node" });
    fireEvent.change(within(addForm).getByLabelText("Node type"), { target: { value: "wait" } });
    fireEvent.change(within(addForm).getByLabelText("New node id"), { target: { value: "delay" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Add node" }));

    expect(screen.getByRole("button", { name: "Select node delay" })).toHaveAttribute("aria-pressed", "true");

    const commonFields = screen.getByRole("group", { name: "Common node fields" });
    fireEvent.change(within(commonFields).getByLabelText("Node id"), { target: { value: "pause_for_signal" } });
    fireEvent.change(within(commonFields).getByLabelText("Title"), { target: { value: "Pause for signal" } });
    fireEvent.change(within(commonFields).getByLabelText("Description"), {
      target: { value: "Wait for the relay to answer." },
    });
    fireEvent.click(within(commonFields).getByLabelText("Occupies crew action"));
    fireEvent.click(within(commonFields).getByLabelText("Occupies communication"));
    fireEvent.change(within(commonFields).getByLabelText("Blocking key template"), {
      target: { value: "bridge:{crew_id}" },
    });
    fireEvent.change(within(commonFields).getByLabelText("Enter effect refs"), {
      target: { value: "mark_waiting, notify_crew" },
    });
    fireEvent.change(within(commonFields).getByLabelText("Exit effect refs"), {
      target: { value: "clear_waiting" },
    });
    fireEvent.change(within(commonFields).getByLabelText("Auto next node id"), { target: { value: "end" } });

    expect(getNode(getLatestDraft(onDraftChange), "pause_for_signal")).toMatchObject({
      id: "pause_for_signal",
      title: "Pause for signal",
      description: "Wait for the relay to answer.",
      enter_effect_refs: ["mark_waiting", "notify_crew"],
      exit_effect_refs: ["clear_waiting"],
      auto_next_node_id: "end",
      blocking: {
        occupies_crew_action: true,
        occupies_communication: true,
        blocking_key_template: "bridge:{crew_id}",
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete node pause_for_signal" }));

    expect(getLatestDraft(onDraftChange).working_definition.event_graph?.nodes.map((node) => node.id)).toEqual([
      "call",
      "end",
    ]);
    expect(screen.queryByRole("button", { name: "Select node pause_for_signal" })).not.toBeInTheDocument();
  });

  it("allows the first node to be added when the draft has no event graph yet", () => {
    const onDraftChange = vi.fn();
    const draft = createDraft({
      working_definition: {
        ...createDraft().working_definition,
        event_graph: undefined,
      },
    });

    render(<GraphStructureEditorHarness draft={draft} onDraftChange={onDraftChange} />);

    expect(screen.getByText("No nodes are available yet. Add the first node to initialize event_graph.")).toBeInTheDocument();

    const addForm = screen.getByRole("form", { name: "Add graph node" });
    fireEvent.change(within(addForm).getByLabelText("Node type"), { target: { value: "wait" } });
    fireEvent.change(within(addForm).getByLabelText("New node id"), { target: { value: "first_wait" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Add node" }));

    expect(screen.getByRole("button", { name: "Select node first_wait" })).toHaveAttribute("aria-pressed", "true");
    expect(getLatestDraft(onDraftChange).working_definition.event_graph).toMatchObject({
      entry_node_id: "first_wait",
      terminal_node_ids: [],
    });
    expect(getWaitNode(getLatestDraft(onDraftChange), "first_wait")).toMatchObject({
      next_node_id: "first_wait",
      duration_seconds: 60,
    });
  });

  it("edits end node resolution, result key, event log template, and cleanup policy", () => {
    const onDraftChange = vi.fn();

    render(<GraphStructureEditorHarness draft={createDraft()} onDraftChange={onDraftChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Select node end" }));

    const endFields = screen.getByRole("group", { name: "End node fields" });
    fireEvent.change(within(endFields).getByLabelText("Resolution"), { target: { value: "failed" } });
    fireEvent.change(within(endFields).getByLabelText("Result key"), { target: { value: "bridge_failed" } });
    fireEvent.change(within(endFields).getByLabelText("Event log template id"), {
      target: { value: "bridge_failed_log" },
    });
    fireEvent.click(within(endFields).getByLabelText("Release blocking claims"));
    fireEvent.click(within(endFields).getByLabelText("Delete active calls"));
    fireEvent.click(within(endFields).getByLabelText("Keep player summary"));

    expect(getNode(getLatestDraft(onDraftChange), "end")).toMatchObject({
      type: "end",
      resolution: "failed",
      result_key: "bridge_failed",
      event_log_template_id: "bridge_failed_log",
      cleanup_policy: {
        release_blocking_claims: false,
        delete_active_calls: false,
        keep_player_summary: false,
      },
    });
  });

  it("edits log-only and wait node structured fields", () => {
    const onDraftChange = vi.fn();

    render(<GraphStructureEditorHarness draft={createDraft()} onDraftChange={onDraftChange} />);

    const addForm = screen.getByRole("form", { name: "Add graph node" });
    fireEvent.change(within(addForm).getByLabelText("Node type"), { target: { value: "log_only" } });
    fireEvent.change(within(addForm).getByLabelText("New node id"), { target: { value: "record_signal" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Add node" }));

    const logFields = screen.getByRole("group", { name: "Log only node fields" });
    fireEvent.change(within(logFields).getByLabelText("Event log template id"), {
      target: { value: "signal_recorded_log" },
    });
    fireEvent.change(within(logFields).getByLabelText("Effect refs"), {
      target: { value: "write_marker, grant_item" },
    });
    fireEvent.change(within(logFields).getByLabelText("Next node id"), { target: { value: "end" } });

    expect(getLogOnlyNode(getLatestDraft(onDraftChange), "record_signal")).toMatchObject({
      event_log_template_id: "signal_recorded_log",
      effect_refs: ["write_marker", "grant_item"],
      next_node_id: "end",
    });

    fireEvent.change(within(addForm).getByLabelText("Node type"), { target: { value: "wait" } });
    fireEvent.change(within(addForm).getByLabelText("New node id"), { target: { value: "delay" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Add node" }));

    const waitFields = screen.getByRole("group", { name: "Wait node fields" });
    fireEvent.change(within(waitFields).getByLabelText("Duration seconds"), { target: { value: "120" } });
    fireEvent.change(within(waitFields).getByLabelText("Wake trigger type"), {
      target: { value: "event_node_finished" },
    });
    fireEvent.change(within(waitFields).getByLabelText("Next node id"), { target: { value: "end" } });
    fireEvent.change(within(waitFields).getByLabelText("Interrupt policy"), {
      target: { value: "player_can_cancel" },
    });

    expect(getWaitNode(getLatestDraft(onDraftChange), "delay")).toMatchObject({
      duration_seconds: 120,
      wake_trigger_type: "event_node_finished",
      next_node_id: "end",
      interrupt_policy: "player_can_cancel",
    });
  });

  it("shows structure health warnings after deleting a referenced node without clearing references", () => {
    const onDraftChange = vi.fn();

    render(<GraphStructureEditorHarness draft={createDraft()} onDraftChange={onDraftChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete node end" }));

    const issues = screen.getByRole("list", { name: "Graph structure health issues" });
    expect(within(issues).getByText("Terminal node not found: end.")).toBeInTheDocument();
    expect(within(issues).getAllByText("Edge target node not found: end.").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Read-only graph preview")).toBeInTheDocument();
    expect(getLatestDraft(onDraftChange).working_definition.event_graph?.terminal_node_ids).toEqual(["end"]);
    expect(getLatestDraft(onDraftChange).working_definition.event_graph?.edges).toEqual([
      { from_node_id: "call", to_node_id: "end", via: "ack" },
    ]);
  });
});

function GraphStructureEditorHarness({
  draft,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const [currentDraft, setCurrentDraft] = useState(draft);

  return (
    <GraphStructureEditor
      draft={currentDraft}
      onDraftChange={(nextDraft) => {
        setCurrentDraft(nextDraft);
        onDraftChange(nextDraft);
      }}
    />
  );
}

function createDraft(overrides: Partial<EventDraftEnvelope> = {}): EventDraftEnvelope {
  const draft = createDefaultNewDraftEnvelope({
    domain: "forest",
    definitionId: "forest_bridge_choice",
    title: "Bridge choice",
    summary: "Choose how to cross the bridge.",
    createdAt: CREATED_AT,
  });

  return {
    ...draft,
    ...overrides,
  };
}

function getLatestDraft(onDraftChange: ReturnType<typeof vi.fn>): EventDraftEnvelope {
  const lastCall = onDraftChange.mock.calls[onDraftChange.mock.calls.length - 1];

  if (!lastCall) {
    throw new Error("Expected draft change.");
  }

  return lastCall[0] as EventDraftEnvelope;
}

function getNode(draft: EventDraftEnvelope, nodeId: string): EventNode {
  const node = draft.working_definition.event_graph?.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Expected graph node ${nodeId}.`);
  }

  return node;
}

function getLogOnlyNode(draft: EventDraftEnvelope, nodeId: string): LogOnlyNode {
  const node = getNode(draft, nodeId);

  if (node.type !== "log_only") {
    throw new Error(`Expected log-only node ${nodeId}.`);
  }

  return node;
}

function getWaitNode(draft: EventDraftEnvelope, nodeId: string): WaitNode {
  const node = getNode(draft, nodeId);

  if (node.type !== "wait") {
    throw new Error(`Expected wait node ${nodeId}.`);
  }

  return node;
}
