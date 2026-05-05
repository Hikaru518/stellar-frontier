import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ActionRequestNode,
  EventNode,
  ObjectiveNode,
  SpawnEventNode,
} from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope } from "../types";
import { createDefaultNewDraftEnvelope } from "./draftEnvelope";
import GraphStructureEditor from "./GraphStructureEditor";

vi.mock("./GraphPreviewPanel", () => ({
  default: () => <section aria-label="Read-only graph preview">Graph Preview</section>,
}));

const CREATED_AT = "2026-05-05T15:30:12.000Z";

describe("Advanced node editors", () => {
  afterEach(() => {
    cleanup();
  });

  it("adds and edits an action_request node without raw JSON params", () => {
    const onDraftChange = vi.fn();

    render(<GraphStructureEditorHarness draft={createDraft()} onDraftChange={onDraftChange} />);

    const addForm = screen.getByRole("form", { name: "Add graph node" });
    expect(within(addForm).getByRole("option", { name: "Action request" })).toBeInTheDocument();
    fireEvent.change(within(addForm).getByLabelText("Node type"), { target: { value: "action_request" } });
    fireEvent.change(within(addForm).getByLabelText("New node id"), { target: { value: "survey_bridge" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Add node" }));

    const fields = screen.getByRole("group", { name: "Action request node fields" });
    fireEvent.change(within(fields).getByLabelText("Request id"), { target: { value: "bridge_survey_request" } });
    fireEvent.change(within(fields).getByLabelText("Action type"), { target: { value: "gather" } });
    fireEvent.change(within(fields).getByLabelText("Target crew type"), { target: { value: "crew_id" } });
    fireEvent.change(within(fields).getByLabelText("Target crew id"), { target: { value: "amy" } });
    fireEvent.change(within(fields).getByLabelText("Target tile type"), { target: { value: "tile_id" } });
    fireEvent.change(within(fields).getByLabelText("Target tile id"), { target: { value: "forest_04" } });

    const actionParams = within(fields).getByRole("group", { name: "Action params" });
    expect(within(actionParams).queryByLabelText(/json/i)).not.toBeInTheDocument();
    fireEvent.change(within(actionParams).getByLabelText("New Action params key"), { target: { value: "resource_id" } });
    fireEvent.change(within(actionParams).getByLabelText("New Action params value"), { target: { value: "bridge_planks" } });
    fireEvent.click(within(actionParams).getByRole("button", { name: "Add Action params row" }));

    const completionTrigger = within(fields).getByRole("group", { name: "Completion trigger" });
    expect(within(completionTrigger).queryByLabelText(/json/i)).not.toBeInTheDocument();
    fireEvent.change(within(completionTrigger).getByLabelText("Completion trigger type"), {
      target: { value: "action_complete" },
    });
    fireEvent.change(within(completionTrigger).getByLabelText("Completion trigger required context"), {
      target: { value: "action_id, crew_id" },
    });

    fireEvent.change(within(fields).getByLabelText("Accepted node id"), { target: { value: "accepted_note" } });
    fireEvent.change(within(fields).getByLabelText("Completed node id"), { target: { value: "" } });
    fireEvent.change(within(fields).getByLabelText("Failed node id"), { target: { value: "failed_end" } });

    expect(screen.getByText("Missing required transition: Completed node id.")).toBeInTheDocument();

    const callCountBeforeWarningEdit = onDraftChange.mock.calls.length;
    fireEvent.change(within(fields).getByLabelText("Request id"), { target: { value: "bridge_survey_request_v2" } });
    expect(onDraftChange.mock.calls.length).toBeGreaterThan(callCountBeforeWarningEdit);

    expect(getActionRequestNode(getLatestDraft(onDraftChange), "survey_bridge")).toMatchObject({
      request_id: "bridge_survey_request_v2",
      action_type: "gather",
      target_crew_ref: { type: "crew_id", id: "amy" },
      target_tile_ref: { type: "tile_id", id: "forest_04" },
      action_params: { resource_id: "bridge_planks" },
      completion_trigger: { type: "action_complete", required_context: ["action_id", "crew_id"] },
      on_accepted_node_id: "accepted_note",
      on_completed_node_id: "",
      on_failed_node_id: "failed_end",
    });
  });

  it("adds and edits an objective node with structured required action params", () => {
    const onDraftChange = vi.fn();

    render(<GraphStructureEditorHarness draft={createDraft()} onDraftChange={onDraftChange} />);

    const addForm = screen.getByRole("form", { name: "Add graph node" });
    expect(within(addForm).getByRole("option", { name: "Objective" })).toBeInTheDocument();
    fireEvent.change(within(addForm).getByLabelText("Node type"), { target: { value: "objective" } });
    fireEvent.change(within(addForm).getByLabelText("New node id"), { target: { value: "repair_objective" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Add node" }));

    const fields = screen.getByRole("group", { name: "Objective node fields" });
    fireEvent.change(within(fields).getByLabelText("Objective title"), { target: { value: "Repair the bridge" } });
    fireEvent.change(within(fields).getByLabelText("Objective summary"), {
      target: { value: "Use materials to make the bridge passable." },
    });
    fireEvent.change(within(fields).getByLabelText("Objective target tile type"), { target: { value: "tile_id" } });
    fireEvent.change(within(fields).getByLabelText("Objective target tile id"), { target: { value: "forest_04" } });
    fireEvent.change(within(fields).getByLabelText("Required action type"), { target: { value: "build" } });

    const requiredParams = within(fields).getByRole("group", { name: "Required action params" });
    expect(within(requiredParams).queryByLabelText(/json/i)).not.toBeInTheDocument();
    fireEvent.change(within(requiredParams).getByLabelText("New Required action params key"), {
      target: { value: "structure_id" },
    });
    fireEvent.change(within(requiredParams).getByLabelText("New Required action params value"), {
      target: { value: "rope_bridge" },
    });
    fireEvent.click(within(requiredParams).getByRole("button", { name: "Add Required action params row" }));

    fireEvent.change(within(fields).getByLabelText("Mode"), { target: { value: "create_and_continue" } });
    fireEvent.change(within(fields).getByLabelText("Created node id"), { target: { value: "objective_created_log" } });
    fireEvent.change(within(fields).getByLabelText("Completed node id"), { target: { value: "" } });
    fireEvent.change(within(fields).getByLabelText("Failed node id"), { target: { value: "objective_failed" } });
    fireEvent.click(within(fields).getByLabelText("Parent event link"));

    expect(screen.getByText("Missing required transition: Completed node id.")).toBeInTheDocument();
    expect(getObjectiveNode(getLatestDraft(onDraftChange), "repair_objective")).toMatchObject({
      objective_template: {
        title: "Repair the bridge",
        summary: "Use materials to make the bridge passable.",
        target_tile_ref: { type: "tile_id", id: "forest_04" },
        required_action_type: "build",
        required_action_params: { structure_id: "rope_bridge" },
      },
      mode: "create_and_continue",
      on_created_node_id: "objective_created_log",
      on_completed_node_id: "",
      on_failed_node_id: "objective_failed",
      parent_event_link: false,
    });
  });

  it("adds and edits a spawn_event node with structured context mapping", () => {
    const onDraftChange = vi.fn();

    render(<GraphStructureEditorHarness draft={createDraft()} onDraftChange={onDraftChange} />);

    const addForm = screen.getByRole("form", { name: "Add graph node" });
    expect(within(addForm).getByRole("option", { name: "Spawn event" })).toBeInTheDocument();
    fireEvent.change(within(addForm).getByLabelText("Node type"), { target: { value: "spawn_event" } });
    fireEvent.change(within(addForm).getByLabelText("New node id"), { target: { value: "spawn_rescue" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Add node" }));

    const fields = screen.getByRole("group", { name: "Spawn event node fields" });
    fireEvent.change(within(fields).getByLabelText("Event definition id"), { target: { value: "forest_rescue_followup" } });
    fireEvent.change(within(fields).getByLabelText("Spawn policy"), { target: { value: "deferred_until_trigger" } });

    const contextMapping = within(fields).getByRole("group", { name: "Context mapping" });
    expect(within(contextMapping).queryByLabelText(/json/i)).not.toBeInTheDocument();
    fireEvent.change(within(contextMapping).getByLabelText("New Context mapping key"), { target: { value: "crew_id" } });
    fireEvent.change(within(contextMapping).getByLabelText("New Context mapping value"), {
      target: { value: "trigger.crew_id" },
    });
    fireEvent.click(within(contextMapping).getByRole("button", { name: "Add Context mapping row" }));

    fireEvent.click(within(fields).getByLabelText("Parent event link"));
    fireEvent.change(within(fields).getByLabelText("Next node id"), { target: { value: "" } });

    expect(screen.getByText("Missing required transition: Next node id.")).toBeInTheDocument();
    expect(getSpawnEventNode(getLatestDraft(onDraftChange), "spawn_rescue")).toMatchObject({
      event_definition_id: "forest_rescue_followup",
      spawn_policy: "deferred_until_trigger",
      context_mapping: { crew_id: "trigger.crew_id" },
      parent_event_link: false,
      next_node_id: "",
    });
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

function createDraft(): EventDraftEnvelope {
  return createDefaultNewDraftEnvelope({
    domain: "forest",
    definitionId: "forest_bridge_choice",
    title: "Bridge choice",
    summary: "Choose how to cross the bridge.",
    createdAt: CREATED_AT,
  });
}

function getLatestDraft(onDraftChange: ReturnType<typeof vi.fn>): EventDraftEnvelope {
  const lastCall = onDraftChange.mock.calls[onDraftChange.mock.calls.length - 1];

  if (!lastCall) {
    throw new Error("Expected draft change.");
  }

  return lastCall[0] as EventDraftEnvelope;
}

function getActionRequestNode(draft: EventDraftEnvelope, nodeId: string): ActionRequestNode {
  const node = getNode(draft, nodeId);

  if (node.type !== "action_request") {
    throw new Error(`Expected action request node ${nodeId}.`);
  }

  return node;
}

function getObjectiveNode(draft: EventDraftEnvelope, nodeId: string): ObjectiveNode {
  const node = getNode(draft, nodeId);

  if (node.type !== "objective") {
    throw new Error(`Expected objective node ${nodeId}.`);
  }

  return node;
}

function getSpawnEventNode(draft: EventDraftEnvelope, nodeId: string): SpawnEventNode {
  const node = getNode(draft, nodeId);

  if (node.type !== "spawn_event") {
    throw new Error(`Expected spawn event node ${nodeId}.`);
  }

  return node;
}

function getNode(draft: EventDraftEnvelope, nodeId: string): EventNode {
  const node = draft.working_definition.event_graph?.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Expected graph node ${nodeId}.`);
  }

  return node;
}
