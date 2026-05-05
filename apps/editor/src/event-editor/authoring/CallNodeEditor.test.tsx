import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CallNode } from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope } from "../types";
import { createDefaultNewDraftEnvelope } from "./draftEnvelope";
import GraphStructureEditor from "./GraphStructureEditor";

vi.mock("./GraphPreviewPanel", () => ({
  default: () => <section aria-label="Read-only graph preview">Graph Preview</section>,
}));

const CREATED_AT = "2026-05-05T15:30:12.000Z";

describe("Call node editor", () => {
  afterEach(() => {
    cleanup();
  });

  it("edits call fields and keeps option mappings plus template option lines in sync", () => {
    const onDraftChange = vi.fn();

    render(<GraphStructureEditorHarness draft={createDraft()} onDraftChange={onDraftChange} />);

    const callFields = screen.getByRole("group", { name: "Call node fields" });
    fireEvent.change(within(callFields).getByLabelText("Speaker type"), { target: { value: "crew_id" } });
    fireEvent.change(within(callFields).getByLabelText("Speaker id"), { target: { value: "amy" } });
    fireEvent.change(within(callFields).getByLabelText("Urgency"), { target: { value: "urgent" } });
    fireEvent.change(within(callFields).getByLabelText("Delivery"), { target: { value: "incoming_call" } });
    fireEvent.change(within(callFields).getByLabelText("Expires in seconds"), { target: { value: "45" } });

    expect(getCallNode(getLatestDraft(onDraftChange), "call")).toMatchObject({
      speaker_crew_ref: { type: "crew_id", id: "amy" },
      urgency: "urgent",
      delivery: "incoming_call",
      expires_in_seconds: 45,
    });

    fireEvent.change(within(callFields).getByLabelText("Option ack next node id"), {
      target: { value: "missing_ack_target" },
    });
    expect(getCallNode(getLatestDraft(onDraftChange), "call").option_node_mapping).toEqual({
      ack: "missing_ack_target",
    });
    expect(screen.getByText("Edge target node not found: missing_ack_target.")).toBeInTheDocument();

    fireEvent.change(within(callFields).getByLabelText("New option id"), { target: { value: "scan_bridge" } });
    fireEvent.change(within(callFields).getByLabelText("New option next node id"), { target: { value: "end" } });
    fireEvent.click(within(callFields).getByRole("button", { name: "Add option" }));

    expect(getCallNode(getLatestDraft(onDraftChange), "call").option_node_mapping).toEqual({
      ack: "missing_ack_target",
      scan_bridge: "end",
    });
    expect(getLatestDraft(onDraftChange).working_call_templates[0]?.option_lines).toHaveProperty("scan_bridge");

    fireEvent.change(within(callFields).getByLabelText("Option scan_bridge id"), {
      target: { value: "inspect_bridge" },
    });

    expect(getCallNode(getLatestDraft(onDraftChange), "call").options.map((option) => option.id)).toEqual([
      "ack",
      "inspect_bridge",
    ]);
    expect(getCallNode(getLatestDraft(onDraftChange), "call").option_node_mapping).toEqual({
      ack: "missing_ack_target",
      inspect_bridge: "end",
    });
    expect(getLatestDraft(onDraftChange).working_call_templates[0]?.option_lines).toHaveProperty("inspect_bridge");
    expect(getLatestDraft(onDraftChange).working_call_templates[0]?.option_lines).not.toHaveProperty("scan_bridge");

    fireEvent.click(within(callFields).getByRole("button", { name: "Delete option inspect_bridge" }));

    expect(getCallNode(getLatestDraft(onDraftChange), "call").options.map((option) => option.id)).toEqual(["ack"]);
    expect(getCallNode(getLatestDraft(onDraftChange), "call").option_node_mapping).toEqual({
      ack: "missing_ack_target",
    });
    expect(getLatestDraft(onDraftChange).working_call_templates[0]?.option_lines).not.toHaveProperty("inspect_bridge");
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

function getCallNode(draft: EventDraftEnvelope, nodeId: string): CallNode {
  const node = draft.working_definition.event_graph?.nodes.find((candidate) => candidate.id === nodeId);

  if (!node || node.type !== "call") {
    throw new Error(`Expected call node ${nodeId}.`);
  }

  return node;
}
