import { describe, expect, it } from "vitest";
import type {
  CallNode,
  CheckNode,
  Condition,
  EventGraph,
  EventNode,
  LogOnlyNode,
  RandomNode,
  WaitNode,
} from "../../../../pc-client/src/events/types";
import { analyzeGraphHealth } from "../graphModel";
import type { EventDraftEnvelope, EventDraftWorkingCallTemplate, EventEditorStep } from "../types";
import { createDefaultNewDraftEnvelope } from "./draftEnvelope";
import { eventAuthoringReducer } from "./eventAuthoringReducer";
import { triggerCapabilities } from "./capabilityCatalog";
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

  it("updates basic definition fields without changing draft identity fields", () => {
    const draft = createDraft();

    const updated = eventAuthoringReducer(draft, {
      type: "update_basic_fields",
      fields: {
        title: "Revised bridge choice",
        summary: "Choose whether to cross, repair, or retreat.",
        tags: ["bridge", "crew_choice"],
      },
    });

    expect(updated).not.toBe(draft);
    expect(updated.working_definition).toMatchObject({
      id: "forest_bridge_choice",
      domain: "forest",
      title: "Revised bridge choice",
      summary: "Choose whether to cross, repair, or retreat.",
      tags: ["bridge", "crew_choice"],
    });
    expect(updated.draft_id).toBe(draft.draft_id);
    expect(updated.source).toBe(draft.source);
    expect(updated.target).toBe(draft.target);
    expect(updated.hashes).toBe(draft.hashes);
    expect(draft.working_definition.title).toBe("Bridge choice");
    expect(draft.working_definition.tags).toBeUndefined();
  });

  it("updates candidate selection fields without mutating the existing candidate selection", () => {
    const draft = createDraft();

    const updated = eventAuthoringReducer(draft, {
      type: "update_candidate_selection",
      fields: {
        priority: 12,
        weight: 3.5,
        mutex_group: "forest_bridge",
        max_instances_per_trigger: 2,
        requires_blocking_slot: true,
      },
    });

    expect(updated.working_definition.candidate_selection).toEqual({
      priority: 12,
      weight: 3.5,
      mutex_group: "forest_bridge",
      max_instances_per_trigger: 2,
      requires_blocking_slot: true,
    });
    expect(draft.working_definition.candidate_selection).toEqual({
      priority: 0,
      weight: 1,
      max_instances_per_trigger: 1,
      requires_blocking_slot: false,
    });
  });

  it("updates repeat policy fields without mutating the existing repeat policy", () => {
    const draft = createDraft();

    const updated = eventAuthoringReducer(draft, {
      type: "update_repeat_policy",
      fields: {
        scope: "crew_tile",
        max_trigger_count: 4,
        cooldown_seconds: 90,
        history_key_template: "bridge:{crew_id}:{tile_id}",
        allow_while_active: true,
      },
    });

    expect(updated.working_definition.repeat_policy).toEqual({
      scope: "crew_tile",
      max_trigger_count: 4,
      cooldown_seconds: 90,
      history_key_template: "bridge:{crew_id}:{tile_id}",
      allow_while_active: true,
    });
    expect(draft.working_definition.repeat_policy).toEqual({
      scope: "event",
      max_trigger_count: null,
      cooldown_seconds: 0,
      history_key_template: "forest_bridge_choice_triggered",
      allow_while_active: false,
    });
  });

  it("updates trigger type from the capability template while preserving reusable conditions and identity fields", () => {
    const bridgeReadyCondition: Condition = {
      type: "world_flag_equals",
      field: "bridge_ready",
      value: true,
    };
    const draft = createDraft({
      working_definition: {
        ...createDraft().working_definition,
        trigger: {
          type: "arrival",
          required_context: ["crew_id"],
          conditions: [bridgeReadyCondition],
          probability: { base: 0.25, min: 0.1 },
        },
      },
    });

    const updated = eventAuthoringReducer(draft, {
      type: "update_trigger_type",
      triggerType: "call_choice",
    });

    expect(updated.working_definition.trigger).toEqual({
      type: "call_choice",
      required_context: getTriggerTemplate("call_choice").required_context,
      conditions: [bridgeReadyCondition],
      probability: { base: 0.25, min: 0.1 },
    });
    expect(updated.draft_id).toBe(draft.draft_id);
    expect(updated.source).toBe(draft.source);
    expect(updated.target).toBe(draft.target);
    expect(updated.hashes).toBe(draft.hashes);
    expect(draft.working_definition.trigger?.type).toBe("arrival");
    expect(draft.working_definition.trigger?.required_context).toEqual(["crew_id"]);
  });

  it("updates trigger required context and probability without mutating the existing trigger", () => {
    const draft = createDraft();

    const withContext = eventAuthoringReducer(draft, {
      type: "update_trigger_required_context",
      requiredContext: ["crew_id", "tile_id", "call_id"],
    });
    const updated = eventAuthoringReducer(withContext, {
      type: "update_trigger_probability",
      probability: { base: 0.75, max: 1 },
    });

    expect(updated.working_definition.trigger).toMatchObject({
      type: "arrival",
      required_context: ["crew_id", "tile_id", "call_id"],
      probability: { base: 0.75, max: 1 },
    });
    expect(draft.working_definition.trigger?.required_context).toBeUndefined();
    expect(draft.working_definition.trigger?.probability).toBeUndefined();
  });

  it("adds, updates, and removes trigger conditions at the requested index", () => {
    const firstCondition: Condition = { type: "time_compare", op: "gte", value: 0 };
    const insertedCondition: Condition = { type: "has_tag", target: { type: "primary_crew" }, value: "bridge_scout" };
    const replacementCondition: Condition = { type: "world_flag_equals", field: "bridge_ready", value: true };
    const draft = createDraft({
      working_definition: {
        ...createDraft().working_definition,
        trigger: {
          type: "arrival",
          conditions: [firstCondition],
        },
      },
    });

    const withInsertedCondition = eventAuthoringReducer(draft, {
      type: "add_trigger_condition",
      condition: insertedCondition,
      index: 0,
    });
    const withUpdatedCondition = eventAuthoringReducer(withInsertedCondition, {
      type: "update_trigger_condition",
      index: 1,
      condition: replacementCondition,
    });
    const withRemovedCondition = eventAuthoringReducer(withUpdatedCondition, {
      type: "remove_trigger_condition",
      index: 0,
    });

    expect(withInsertedCondition.working_definition.trigger?.conditions).toEqual([insertedCondition, firstCondition]);
    expect(withUpdatedCondition.working_definition.trigger?.conditions).toEqual([insertedCondition, replacementCondition]);
    expect(withRemovedCondition.working_definition.trigger?.conditions).toEqual([replacementCondition]);
    expect(draft.working_definition.trigger?.conditions).toEqual([firstCondition]);
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

  it("updates call node fields and option targets while preserving draft saveability", () => {
    const draft = createDraft();

    const withCallFields = eventAuthoringReducer(draft, {
      type: "update_call_node",
      nodeId: "call",
      fields: {
        speaker_crew_ref: { type: "crew_id", id: "amy" },
        urgency: "urgent",
        delivery: "incoming_call",
        expires_in_seconds: 45,
        on_missed: {
          next_node_id: "missed_end",
          effect_refs: ["missed_call_effects"],
        },
      },
    });
    const updated = eventAuthoringReducer(withCallFields, {
      type: "update_call_option",
      nodeId: "call",
      optionId: "ack",
      fields: {
        next_node_id: "missing_ack_target",
        effect_refs: ["ack_effects"],
      },
    });
    const health = analyzeGraphHealth(updated.working_definition);

    expect(getCallNode(updated, "call")).toMatchObject({
      speaker_crew_ref: { type: "crew_id", id: "amy" },
      urgency: "urgent",
      delivery: "incoming_call",
      expires_in_seconds: 45,
      on_missed: {
        next_node_id: "missed_end",
        effect_refs: ["missed_call_effects"],
      },
      options: [{ id: "ack", is_default: true, effect_refs: ["ack_effects"] }],
      option_node_mapping: { ack: "missing_ack_target" },
    });
    expect(getGraph(updated).edges).toEqual([{ from_node_id: "call", to_node_id: "missing_ack_target", via: "ack" }]);
    expect(health.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "missing_edge_target", targetNodeId: "missing_ack_target" })]),
    );
    expect(getCallNode(draft, "call").option_node_mapping).toEqual({ ack: "end" });
  });

  it("updates check and random branch fields with typed node actions", () => {
    const draft = createDraftWithCheckAndRandomNodes();
    const branchCondition: Condition = {
      type: "world_flag_equals",
      field: "bridge_ready",
      value: true,
    };

    const withCheck = eventAuthoringReducer(draft, {
      type: "update_check_node",
      nodeId: "gate",
      fields: {
        default_next_node_id: "missing_default",
        branches: [
          {
            id: "has_bridge",
            conditions: [branchCondition],
            next_node_id: "randomizer",
            effect_refs: ["mark_bridge_ready"],
          },
        ],
      },
    });
    const updated = eventAuthoringReducer(withCheck, {
      type: "update_random_node",
      nodeId: "randomizer",
      fields: {
        default_next_node_id: "missing_random_default",
        store_result_as: "bridge_roll",
        branches: [
          {
            id: "lucky",
            weight: 3,
            conditions: [branchCondition],
            next_node_id: "missing_random_target",
            effect_refs: ["lucky_effects"],
          },
        ],
      },
    });

    expect(getCheckNode(updated, "gate")).toMatchObject({
      default_next_node_id: "missing_default",
      branches: [
        {
          id: "has_bridge",
          conditions: [branchCondition],
          next_node_id: "randomizer",
          effect_refs: ["mark_bridge_ready"],
        },
      ],
    });
    expect(getRandomNode(updated, "randomizer")).toMatchObject({
      default_next_node_id: "missing_random_default",
      store_result_as: "bridge_roll",
      branches: [
        {
          id: "lucky",
          weight: 3,
          conditions: [branchCondition],
          next_node_id: "missing_random_target",
          effect_refs: ["lucky_effects"],
        },
      ],
    });
    expect(analyzeGraphHealth(updated.working_definition).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_edge_target", targetNodeId: "missing_default" }),
        expect.objectContaining({ code: "missing_edge_target", targetNodeId: "missing_random_target" }),
      ]),
    );
    expect(getCheckNode(draft, "gate").branches[0]?.conditions).toEqual([]);
  });

  it("adds, selects, and edits base graph nodes without mutating the original graph", () => {
    const draft = createDraft();

    const withNode = eventAuthoringReducer(draft, {
      type: "add_node",
      nodeType: "wait",
      nodeId: "delay",
    });
    const updated = eventAuthoringReducer(withNode, {
      type: "update_node_common_fields",
      nodeId: "delay",
      fields: {
        id: "pause_for_signal",
        title: "Pause for signal",
        description: "Wait for the relay to answer.",
        enter_effect_refs: ["mark_waiting"],
        exit_effect_refs: ["clear_waiting"],
        auto_next_node_id: "end",
        blocking: {
          occupies_crew_action: true,
          occupies_communication: true,
          blocking_key_template: "bridge:{crew_id}",
        },
      },
    });

    expect(getGraph(withNode).nodes.map((node) => node.id)).toEqual(["call", "end", "delay"]);
    expect(withNode.editor_state).toMatchObject({
      active_step: "graph",
      selection: { step: "graph", nodeId: "delay" },
    });
    expect(getWaitNode(updated, "pause_for_signal")).toMatchObject({
      id: "pause_for_signal",
      title: "Pause for signal",
      description: "Wait for the relay to answer.",
      enter_effect_refs: ["mark_waiting"],
      exit_effect_refs: ["clear_waiting"],
      auto_next_node_id: "end",
      blocking: {
        occupies_crew_action: true,
        occupies_communication: true,
        blocking_key_template: "bridge:{crew_id}",
      },
    });
    expect(updated.editor_state).toMatchObject({
      active_step: "graph",
      selection: { step: "graph", nodeId: "pause_for_signal" },
    });
    expect(getGraph(draft).nodes.map((node) => node.id)).toEqual(["call", "end"]);
  });

  it("initializes a missing graph when adding the first node", () => {
    const draft = createDraft({
      working_definition: {
        ...createDraft().working_definition,
        event_graph: undefined,
      },
    });

    const updated = eventAuthoringReducer(draft, {
      type: "add_node",
      nodeType: "wait",
      nodeId: "first_wait",
    });

    expect(getGraph(updated)).toMatchObject({
      entry_node_id: "first_wait",
      terminal_node_ids: [],
      graph_rules: { acyclic: true, max_active_nodes: 1, allow_parallel_nodes: false },
    });
    expect(getGraph(updated).nodes.map((node) => node.id)).toEqual(["first_wait"]);
    expect(getWaitNode(updated, "first_wait")).toMatchObject({
      next_node_id: "first_wait",
      duration_seconds: 60,
    });
    expect(updated.editor_state).toMatchObject({
      active_step: "graph",
      selection: { step: "graph", nodeId: "first_wait" },
    });
  });

  it("renames a node id without rewriting graph references", () => {
    const draft = createDraft();

    const updated = eventAuthoringReducer(draft, {
      type: "update_node_common_fields",
      nodeId: "end",
      fields: {
        id: "resolved_end",
        title: "Resolved end",
      },
    });

    expect(getGraph(updated).nodes.map((node) => node.id)).toEqual(["call", "resolved_end"]);
    expect(getGraph(updated).terminal_node_ids).toEqual(["end"]);
    expect(getGraph(updated).edges).toContainEqual({ from_node_id: "call", to_node_id: "end", via: "ack" });
    expect(getCallNode(updated, "call").option_node_mapping).toEqual({ ack: "end" });
    expect(updated.editor_state).toMatchObject({
      active_step: "graph",
      selection: { step: "graph", nodeId: "resolved_end" },
    });
  });

  it("updates end, log-only, and wait node fields with typed node actions", () => {
    const draftWithLog = eventAuthoringReducer(createDraft(), {
      type: "add_node",
      nodeType: "log_only",
      nodeId: "record_signal",
    });
    const draftWithWait = eventAuthoringReducer(draftWithLog, {
      type: "add_node",
      nodeType: "wait",
      nodeId: "delay",
    });
    const withEnd = eventAuthoringReducer(draftWithWait, {
      type: "update_end_node",
      nodeId: "end",
      fields: {
        resolution: "failed",
        result_key: "bridge_failed",
        event_log_template_id: "bridge_failed_log",
        cleanup_policy: {
          release_blocking_claims: false,
          delete_active_calls: false,
          keep_player_summary: true,
        },
      },
    });
    const withLog = eventAuthoringReducer(withEnd, {
      type: "update_log_only_node",
      nodeId: "record_signal",
      fields: {
        event_log_template_id: "signal_recorded_log",
        effect_refs: ["write_marker", "grant_item"],
        next_node_id: "delay",
      },
    });
    const updated = eventAuthoringReducer(withLog, {
      type: "update_wait_node",
      nodeId: "delay",
      fields: {
        duration_seconds: 120,
        wake_trigger_type: "event_node_finished",
        next_node_id: "end",
        interrupt_policy: "player_can_cancel",
      },
    });

    expect(getNode(updated, "end")).toMatchObject({
      type: "end",
      resolution: "failed",
      result_key: "bridge_failed",
      event_log_template_id: "bridge_failed_log",
      cleanup_policy: {
        release_blocking_claims: false,
        delete_active_calls: false,
        keep_player_summary: true,
      },
    });
    expect(getLogOnlyNode(updated, "record_signal")).toMatchObject({
      event_log_template_id: "signal_recorded_log",
      effect_refs: ["write_marker", "grant_item"],
      next_node_id: "delay",
    });
    expect(getWaitNode(updated, "delay")).toMatchObject({
      duration_seconds: 120,
      wake_trigger_type: "event_node_finished",
      next_node_id: "end",
      interrupt_policy: "player_can_cancel",
    });
  });

  it("deletes a call node and removes its generated call template", () => {
    const draft = createDraftWithFollowupCall();

    const updated = eventAuthoringReducer(draft, {
      type: "delete_node",
      nodeId: "followup",
    });

    expect(getGraph(updated).nodes.map((node) => node.id)).toEqual(["call", "end"]);
    expect(getGraph(updated).edges).toEqual([
      { from_node_id: "call", to_node_id: "end", via: "ack" },
      { from_node_id: "call", to_node_id: "followup", via: "followup" },
      { from_node_id: "followup", to_node_id: "end", via: "ack" },
    ]);
    expect(getGraph(updated).terminal_node_ids).toEqual(["end", "followup"]);
    expect(updated.working_call_templates.map((template) => template.id)).toEqual(["forest_bridge_choice.call.call"]);
    expect(updated.working_definition.content_refs?.call_template_ids).toEqual(["forest_bridge_choice.call.call"]);
  });

  it("deletes a referenced node without deleting other references so graph health can warn", () => {
    const draft = createDraft();

    const updated = eventAuthoringReducer(draft, {
      type: "delete_node",
      nodeId: "end",
    });
    const health = analyzeGraphHealth(updated.working_definition);

    expect(getGraph(updated).nodes.map((node) => node.id)).toEqual(["call"]);
    expect(getGraph(updated).edges).toEqual([{ from_node_id: "call", to_node_id: "end", via: "ack" }]);
    expect(getGraph(updated).terminal_node_ids).toEqual(["end"]);
    expect(getCallNode(updated, "call").option_node_mapping).toEqual({ ack: "end" });
    expect(health.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "missing_terminal_node", nodeId: "end" }),
        expect.objectContaining({ code: "missing_edge_target", targetNodeId: "end" }),
      ]),
    );
  });
});

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

function createDraftWithCheckAndRandomNodes(): EventDraftEnvelope {
  const draft = createDraft();
  const graph = getGraph(draft);
  const checkNode = createDefaultNodeTemplate({
    type: "check",
    eventDefinitionId: "forest_bridge_choice",
    nodeId: "gate",
    nextNodeId: "end",
  }) as CheckNode;
  const randomNode = createDefaultNodeTemplate({
    type: "random",
    eventDefinitionId: "forest_bridge_choice",
    nodeId: "randomizer",
    nextNodeId: "end",
  }) as RandomNode;

  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      event_graph: {
        ...graph,
        nodes: [...graph.nodes, checkNode, randomNode],
      },
    },
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

function getWaitNode(draft: EventDraftEnvelope, nodeId: string): WaitNode {
  const node = getNode(draft, nodeId);

  if (node.type !== "wait") {
    throw new Error(`Expected wait node ${nodeId}.`);
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

function getCheckNode(draft: EventDraftEnvelope, nodeId: string): CheckNode {
  const node = getNode(draft, nodeId);

  if (node.type !== "check") {
    throw new Error(`Expected check node ${nodeId}.`);
  }

  return node;
}

function getRandomNode(draft: EventDraftEnvelope, nodeId: string): RandomNode {
  const node = getNode(draft, nodeId);

  if (node.type !== "random") {
    throw new Error(`Expected random node ${nodeId}.`);
  }

  return node;
}

function getNode(draft: EventDraftEnvelope, nodeId: string): EventNode {
  const node = getGraph(draft).nodes.find((candidate) => candidate.id === nodeId);

  if (!node) {
    throw new Error(`Expected graph node ${nodeId}.`);
  }

  return node;
}

function getTriggerTemplate(triggerType: string) {
  const capability = triggerCapabilities.find((candidate) => candidate.type === triggerType);

  if (!capability) {
    throw new Error(`Expected trigger capability ${triggerType}.`);
  }

  return capability.template;
}
