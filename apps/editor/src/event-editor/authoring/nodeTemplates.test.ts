import { describe, expect, it } from "vitest";
import type { EventNodeType } from "../../../../pc-client/src/events/types";
import { createDefaultBlocking, createDefaultNodeTemplate } from "./templates";

const EXPECTED_NODE_TYPES = [
  "call",
  "wait",
  "check",
  "random",
  "action_request",
  "objective",
  "spawn_event",
  "log_only",
  "end",
] as const satisfies readonly EventNodeType[];

describe("event node authoring templates", () => {
  it("creates every current node type with common node fields", () => {
    for (const type of EXPECTED_NODE_TYPES) {
      const node = createDefaultNodeTemplate({
        type,
        eventDefinitionId: "forest_signal",
        nodeId: `${type}_node`,
        nextNodeId: "next_node",
      });

      expect(node).toMatchObject({
        id: `${type}_node`,
        type,
        title: expect.any(String),
        blocking: expect.any(Object),
      });
      expect(node.title).not.toHaveLength(0);
      expect(node.blocking).toMatchObject({
        occupies_crew_action: expect.any(Boolean),
        occupies_communication: expect.any(Boolean),
      });
    }
  });

  it("creates call nodes with a default call template binding and option", () => {
    const node = createDefaultNodeTemplate({
      type: "call",
      eventDefinitionId: "forest_signal",
      nodeId: "briefing",
      nextNodeId: "end",
    });

    expect(node).toMatchObject({
      type: "call",
      call_template_id: "forest_signal.call.briefing",
      options: [{ id: "ack", is_default: true }],
      option_node_mapping: { ack: "end" },
      blocking: {
        occupies_communication: true,
      },
    });
  });

  it("creates end nodes with cleanup policy and event log placeholder", () => {
    const node = createDefaultNodeTemplate({
      type: "end",
      nodeId: "failed_end",
    });

    expect(node).toEqual({
      id: "failed_end",
      type: "end",
      title: "End",
      blocking: createDefaultBlocking(),
      resolution: "resolved",
      result_key: "resolved",
      event_log_template_id: "TODO_EVENT_LOG",
      history_writes: [],
      cleanup_policy: {
        release_blocking_claims: true,
        delete_active_calls: true,
        keep_player_summary: true,
      },
    });
  });

  it("uses deterministic placeholder ids when optional ids are omitted", () => {
    expect(createDefaultNodeTemplate({ type: "call" })).toMatchObject({
      id: "call",
      call_template_id: "TODO_EVENT.call.call",
      option_node_mapping: { ack: "next_node" },
    });
    expect(createDefaultNodeTemplate({ type: "wait" })).toMatchObject({
      id: "wait",
      next_node_id: "next_node",
    });
  });
});
