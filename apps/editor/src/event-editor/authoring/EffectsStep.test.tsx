import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EndNode, EventNode } from "../../../../pc-client/src/events/types";
import type { EventDraftEnvelope } from "../types";
import { createDefaultNewDraftEnvelope } from "./draftEnvelope";
import EffectsStep from "./EffectsStep";
import { effectHandlerOptions } from "./capabilityCatalog";

const CREATED_AT = "2026-05-05T15:30:12.000Z";

describe("EffectsStep", () => {
  afterEach(() => {
    cleanup();
  });

  it("edits effect groups, effects, log templates, and node history writes with structured controls", () => {
    const onDraftChange = vi.fn();

    render(<EffectsStepHarness draft={createDraftWithMissingEffectRef()} onDraftChange={onDraftChange} />);

    const warnings = screen.getByRole("list", { name: "Effect refs warnings" });
    expect(warnings).toHaveTextContent("missing_effects");

    const effectGroups = screen.getByRole("group", { name: "Effect groups" });
    fireEvent.click(within(effectGroups).getByRole("button", { name: "Add effect group" }));

    let groupFields = screen.getByRole("group", { name: "Effect group effect_group" });
    fireEvent.change(within(groupFields).getByLabelText("Effect group effect_group id"), {
      target: { value: "bridge_effects" },
    });

    groupFields = screen.getByRole("group", { name: "Effect group bridge_effects" });
    fireEvent.change(within(groupFields).getByLabelText("Effect group bridge_effects description"), {
      target: { value: "Effects written when the bridge resolves." },
    });
    fireEvent.click(within(groupFields).getByRole("button", { name: "Add effect" }));

    let effectFields = screen.getByRole("group", { name: "Effect effect" });
    fireEvent.change(within(effectFields).getByLabelText("Effect effect id"), {
      target: { value: "mark_bridge_ready" },
    });

    effectFields = screen.getByRole("group", { name: "Effect mark_bridge_ready" });
    fireEvent.change(within(effectFields).getByLabelText("Effect mark_bridge_ready type"), {
      target: { value: "handler_effect" },
    });
    fireEvent.change(within(effectFields).getByLabelText("Effect mark_bridge_ready target type"), {
      target: { value: "crew_id" },
    });
    fireEvent.change(within(effectFields).getByLabelText("Effect mark_bridge_ready target id"), {
      target: { value: "amy" },
    });

    const params = within(effectFields).getByRole("group", { name: "Effect mark_bridge_ready params" });
    expect(within(params).queryByLabelText(/json/i)).not.toBeInTheDocument();
    fireEvent.click(within(params).getByRole("button", { name: "Add param" }));
    fireEvent.change(within(params).getByLabelText("Effect mark_bridge_ready param 1 key"), {
      target: { value: "flag_key" },
    });
    fireEvent.change(within(params).getByLabelText("Effect mark_bridge_ready param 1 value"), {
      target: { value: "bridge_ready" },
    });

    fireEvent.change(within(effectFields).getByLabelText("Effect mark_bridge_ready failure policy"), {
      target: { value: "skip_group" },
    });
    fireEvent.click(within(effectFields).getByLabelText("Effect mark_bridge_ready write event log"));
    fireEvent.click(within(effectFields).getByLabelText("Effect mark_bridge_ready write world history"));
    fireEvent.change(within(effectFields).getByLabelText("Effect mark_bridge_ready history key template"), {
      target: { value: "bridge:{event_id}" },
    });
    if (effectHandlerOptions[0]) {
      fireEvent.change(within(effectFields).getByLabelText("Effect mark_bridge_ready handler type"), {
        target: { value: effectHandlerOptions[0].value },
      });
    }

    const logTemplates = screen.getByRole("group", { name: "Log templates" });
    fireEvent.click(within(logTemplates).getByRole("button", { name: "Add log template" }));

    let logFields = screen.getByRole("group", { name: "Log template event_log" });
    fireEvent.change(within(logFields).getByLabelText("Log template event_log id"), {
      target: { value: "bridge_resolved_log" },
    });
    logFields = screen.getByRole("group", { name: "Log template bridge_resolved_log" });
    fireEvent.change(within(logFields).getByLabelText("Log template bridge_resolved_log summary"), {
      target: { value: "The bridge route is resolved." },
    });
    fireEvent.change(within(logFields).getByLabelText("Log template bridge_resolved_log importance"), {
      target: { value: "major" },
    });
    fireEvent.change(within(logFields).getByLabelText("Log template bridge_resolved_log visibility"), {
      target: { value: "hidden_until_resolved" },
    });

    const nodeHistory = screen.getByRole("group", { name: "Node end history writes" });
    fireEvent.change(within(nodeHistory).getByLabelText("Node end final effect refs"), {
      target: { value: "bridge_effects, missing_effects" },
    });
    fireEvent.click(within(nodeHistory).getByRole("button", { name: "Add history write" }));
    fireEvent.change(within(nodeHistory).getByLabelText("Node end history write 1 key template"), {
      target: { value: "bridge:{crew_id}" },
    });
    fireEvent.change(within(nodeHistory).getByLabelText("Node end history write 1 scope"), {
      target: { value: "crew_tile" },
    });
    fireEvent.change(within(nodeHistory).getByLabelText("Node end history write 1 value"), {
      target: { value: "true" },
    });

    const latestDraft = getLatestDraft(onDraftChange);
    expect(latestDraft.working_definition.effect_groups).toEqual([
      {
        id: "bridge_effects",
        description: "Effects written when the bridge resolves.",
        effects: [
          {
            id: "mark_bridge_ready",
            type: "handler_effect",
            target: { type: "crew_id", id: "amy" },
            params: { flag_key: "bridge_ready" },
            failure_policy: "skip_group",
            record_policy: {
              write_event_log: true,
              write_world_history: true,
              history_key_template: "bridge:{event_id}",
            },
            handler_type: effectHandlerOptions[0]?.value ?? "TODO_HANDLER",
          },
        ],
      },
    ]);
    expect(latestDraft.working_definition.log_templates).toEqual(
      expect.arrayContaining([
        {
          id: "bridge_resolved_log",
          summary: "The bridge route is resolved.",
          importance: "major",
          visibility: "hidden_until_resolved",
        },
      ]),
    );
    expect(getEndNode(latestDraft)).toMatchObject({
      final_effect_refs: ["bridge_effects", "missing_effects"],
      history_writes: [{ key_template: "bridge:{crew_id}", scope: "crew_tile", value: true }],
    });
    expect(screen.getByRole("list", { name: "Effect refs warnings" })).toHaveTextContent("missing_effects");
  });
});

function EffectsStepHarness({
  draft,
  onDraftChange,
}: {
  draft: EventDraftEnvelope;
  onDraftChange: (draft: EventDraftEnvelope) => void;
}) {
  const [currentDraft, setCurrentDraft] = useState(draft);
  const [selectedEffectGroupId, setSelectedEffectGroupId] = useState<string | null>(null);

  return (
    <EffectsStep
      draft={currentDraft}
      selectedEffectGroupId={selectedEffectGroupId}
      onSelectedEffectGroupIdChange={setSelectedEffectGroupId}
      onDraftChange={(nextDraft) => {
        setCurrentDraft(nextDraft);
        onDraftChange(nextDraft);
      }}
    />
  );
}

function createDraftWithMissingEffectRef(): EventDraftEnvelope {
  const draft = createDefaultNewDraftEnvelope({
    domain: "forest",
    definitionId: "forest_bridge_choice",
    title: "Bridge choice",
    summary: "Choose how to cross the bridge.",
    createdAt: CREATED_AT,
  });
  const graph = draft.working_definition.event_graph;

  if (!graph) {
    throw new Error("Expected graph.");
  }

  return {
    ...draft,
    working_definition: {
      ...draft.working_definition,
      event_graph: {
        ...graph,
        nodes: graph.nodes.map((node): EventNode => (node.type === "end" ? { ...node, final_effect_refs: ["missing_effects"] } : node)),
      },
    },
  };
}

function getLatestDraft(onDraftChange: ReturnType<typeof vi.fn>): EventDraftEnvelope {
  const lastCall = onDraftChange.mock.calls[onDraftChange.mock.calls.length - 1];

  if (!lastCall) {
    throw new Error("Expected draft change.");
  }

  return lastCall[0] as EventDraftEnvelope;
}

function getEndNode(draft: EventDraftEnvelope): EndNode {
  const node = draft.working_definition.event_graph?.nodes.find((candidate) => candidate.type === "end");

  if (!node || node.type !== "end") {
    throw new Error("Expected end node.");
  }

  return node;
}
