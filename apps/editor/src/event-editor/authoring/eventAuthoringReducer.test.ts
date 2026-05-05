import { describe, expect, it } from "vitest";
import type { CallNode, EventGraph } from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope, EventDraftWorkingCallTemplate, EventEditorStep } from "../types";
import { createDefaultNewDraftEnvelope } from "./draftEnvelope";
import { eventAuthoringReducer } from "./eventAuthoringReducer";
import { createDefaultCallTemplateShell, createDefaultNodeTemplate } from "./templates";

const CREATED_AT = "2026-05-05T15:30:12.000Z";

describe("event authoring reducer", () => {
  it("updates Basic, Trigger, Graph, Effects, and Review step selection without changing draft identity fields", () => {
    const draft = createDraft();
    const steps = ["basic", "trigger", "graph", "effects", "review"] as const satisfies readonly EventEditorStep[];

    const updated = steps.reduce((currentDraft, step) => {
      const selection = { step };
      const nextDraft = eventAuthoringReducer(currentDraft, {
        type: "select_step",
        step,
        selection,
      });

      expect(nextDraft).not.toBe(currentDraft);
      expect(nextDraft.editor_state).toEqual({
        ...currentDraft.editor_state,
        active_step: step,
        selection,
      });
      expect(nextDraft.draft_id).toBe(draft.draft_id);
      expect(nextDraft.source).toBe(draft.source);
      expect(nextDraft.target).toBe(draft.target);
      expect(nextDraft.hashes).toBe(draft.hashes);

      return nextDraft;
    }, draft);

    expect(updated.editor_state).toMatchObject({ active_step: "review", selection: { step: "review" } });
    expect(draft.editor_state).toEqual({
      active_step: "basic",
      selection: null,
      collapsed_sections: [],
    });
  });

  it("adds a call option and creates a matching option line in the call template", () => {
    const draft = createDraft();

    const updated = eventAuthoringReducer(draft, {
      type: "add_call_option",
      nodeId: "call",
      optionId: "scan_bridge",
      nextNodeId: "end",
    });

    expect(getCallNode(updated, "call").options).toEqual([{ id: "ack", is_default: true }, { id: "scan_bridge" }]);
    expect(getCallNode(updated, "call").option_node_mapping).toEqual({
      ack: "end",
      scan_bridge: "end",
    });
    expect(updated.working_call_templates[0]?.option_lines).toMatchObject({
      ack: expect.any(Object),
      scan_bridge: {
        selection: "first_match",
        variants: [{ id: "default", text: "Choose scan bridge.", priority: 1 }],
      },
    });
    expect(getGraph(updated).edges).toContainEqual({
      from_node_id: "call",
      to_node_id: "end",
      via: "scan_bridge",
    });
    expect(draft.working_call_templates[0]?.option_lines).not.toHaveProperty("scan_bridge");
  });

  it("removes a call option, option mapping, graph edge, and matching option line", () => {
    const draft = eventAuthoringReducer(createDraft(), {
      type: "add_call_option",
      nodeId: "call",
      optionId: "scan_bridge",
      nextNodeId: "end",
    });

    const updated = eventAuthoringReducer(draft, {
      type: "remove_call_option",
      nodeId: "call",
      optionId: "scan_bridge",
    });

    expect(getCallNode(updated, "call").options).toEqual([{ id: "ack", is_default: true }]);
    expect(getCallNode(updated, "call").option_node_mapping).toEqual({ ack: "end" });
    expect(updated.working_call_templates[0]?.option_lines).not.toHaveProperty("scan_bridge");
    expect(getGraph(updated).edges).not.toContainEqual({
      from_node_id: "call",
      to_node_id: "end",
      via: "scan_bridge",
    });
  });

  it("renames a call option across node options, mappings, graph edges, and call template option lines", () => {
    const draft = eventAuthoringReducer(createDraft(), {
      type: "add_call_option",
      nodeId: "call",
      optionId: "scan_bridge",
      nextNodeId: "end",
    });

    const updated = eventAuthoringReducer(draft, {
      type: "rename_call_option",
      nodeId: "call",
      fromOptionId: "scan_bridge",
      toOptionId: "inspect_bridge",
    });

    expect(getCallNode(updated, "call").options).toEqual([{ id: "ack", is_default: true }, { id: "inspect_bridge" }]);
    expect(getCallNode(updated, "call").option_node_mapping).toEqual({
      ack: "end",
      inspect_bridge: "end",
    });
    expect(getGraph(updated).edges).toContainEqual({
      from_node_id: "call",
      to_node_id: "end",
      via: "inspect_bridge",
    });
    expect(getGraph(updated).edges).not.toContainEqual({
      from_node_id: "call",
      to_node_id: "end",
      via: "scan_bridge",
    });
    expect(updated.working_call_templates[0]?.option_lines).toHaveProperty("inspect_bridge");
    expect(updated.working_call_templates[0]?.option_lines).not.toHaveProperty("scan_bridge");
    expect(updated.working_call_templates[0]?.option_lines?.inspect_bridge).toEqual({
      selection: "first_match",
      variants: [{ id: "default", text: "Choose scan bridge.", priority: 1 }],
    });
  });

  it("deletes a call node and removes its generated call template", () => {
    const draft = createDraftWithFollowupCall();

    const updated = eventAuthoringReducer(draft, {
      type: "delete_node",
      nodeId: "followup",
    });

    expect(getGraph(updated).nodes.map((node) => node.id)).toEqual(["call", "end"]);
    expect(getGraph(updated).edges).toEqual([{ from_node_id: "call", to_node_id: "end", via: "ack" }]);
    expect(getGraph(updated).terminal_node_ids).toEqual(["end"]);
    expect(updated.working_call_templates.map((template) => template.id)).toEqual(["forest_bridge_choice.call.call"]);
    expect(updated.working_definition.content_refs?.call_template_ids).toEqual(["forest_bridge_choice.call.call"]);
  });
});

function createDraft(): EventDraftEnvelope {
  return createDefaultNewDraftEnvelope({
    domain: "forest",
    definitionId: "forest_bridge_choice",
    title: "Bridge choice",
    summary: "Choose how to cross the bridge.",
    createdAt: CREATED_AT,
  });
}

function createDraftWithFollowupCall(): EventDraftEnvelope {
  const draft = createDraft();
  const graph = getGraph(draft);
  const followupNode = createDefaultNodeTemplate({
    type: "call",
    eventDefinitionId: "forest_bridge_choice",
    nodeId: "followup",
    nextNodeId: "end",
  }) as CallNode;
  const followupTemplate: EventDraftWorkingCallTemplate = {
    ...createDefaultCallTemplateShell({
      domain: "forest",
      eventDefinitionId: "forest_bridge_choice",
      nodeId: "followup",
    }),
  };

  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      event_graph: {
        ...graph,
        nodes: [...graph.nodes, followupNode],
        edges: [
          ...graph.edges,
          { from_node_id: "call", to_node_id: "followup", via: "followup" },
          { from_node_id: "followup", to_node_id: "end", via: "ack" },
        ],
        terminal_node_ids: [...graph.terminal_node_ids, "followup"],
      },
      content_refs: {
        ...draft.working_definition.content_refs,
        call_template_ids: [
          ...(draft.working_definition.content_refs?.call_template_ids ?? []),
          "forest_bridge_choice.call.followup",
        ],
      },
    },
    working_call_templates: [...draft.working_call_templates, followupTemplate],
  };
}

function getGraph(draft: EventDraftEnvelope): EventGraph {
  const graph = draft.working_definition.event_graph;

  if (!graph) {
    throw new Error("Expected draft event graph.");
  }

  return graph;
}

function getCallNode(draft: EventDraftEnvelope, nodeId: string): CallNode {
  const node = getGraph(draft).nodes.find((candidate) => candidate.id === nodeId);

  if (!node || node.type !== "call") {
    throw new Error(`Expected call node ${nodeId}.`);
  }

  return node;
}
