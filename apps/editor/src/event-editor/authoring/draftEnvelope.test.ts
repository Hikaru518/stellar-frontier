import { describe, expect, it } from "vitest";
import {
  createDefaultEditorState,
  createDefaultNewDraftEnvelope,
  createDefaultTargetRef,
  isEventDraftEnvelope,
  isSafeDraftTargetRef,
} from "./draftEnvelope";

describe("event draft envelope authoring helpers", () => {
  it("creates a default new draft envelope with a legal working shell", () => {
    const draft = createDefaultNewDraftEnvelope({
      domain: "forest",
      definitionId: "forest_bridge_choice",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
      createdAt: "2026-05-05T15:30:12.000Z",
    });

    expect(draft).toMatchObject({
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
    });
    expect(draft.working_definition).toMatchObject({
      schema_version: "event-program-model-v1",
      id: "forest_bridge_choice",
      domain: "forest",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
      event_graph: {
        graph_rules: {
          acyclic: true,
          max_active_nodes: 1,
          allow_parallel_nodes: false,
        },
      },
    });
    expect(draft.working_call_templates).toEqual([
      expect.objectContaining({
        id: "forest_bridge_choice.call.call",
        event_definition_id: "forest_bridge_choice",
        node_id: "call",
      }),
    ]);
    expect(isEventDraftEnvelope(draft)).toBe(true);
  });

  it("derives draft ids from the explicit timestamp in UTC", () => {
    const draft = createDefaultNewDraftEnvelope({
      domain: "forest",
      definitionId: "forest_signal",
      createdAt: new Date("2026-05-05T23:30:12+08:00"),
    });

    expect(draft.draft_id).toBe("forest_signal_20260505_153012");
    expect(draft.created_at).toBe("2026-05-05T15:30:12.000Z");
  });

  it("creates default target refs and editor state", () => {
    expect(createDefaultTargetRef({ domain: "mine", definitionId: "mine_signal" })).toEqual({
      domain: "mine",
      definition_id: "mine_signal",
      definition_file_path: "content/events/definitions/mine.json",
      call_template_file_path: "content/events/call_templates/mine.json",
    });
    expect(createDefaultEditorState()).toEqual({
      active_step: "basic",
      selection: null,
      collapsed_sections: [],
    });
  });

  it("marks unsafe draft ids and target ids as invalid", () => {
    const draft = createDefaultNewDraftEnvelope({
      domain: "forest",
      definitionId: "forest_signal",
      createdAt: "2026-05-05T15:30:12.000Z",
    });

    expect(isSafeDraftTargetRef(draft.target)).toBe(true);
    expect(isSafeDraftTargetRef({ ...draft.target, domain: "Forest" })).toBe(false);
    expect(isSafeDraftTargetRef({ ...draft.target, definition_id: "../forest" })).toBe(false);
    expect(isEventDraftEnvelope({ ...draft, draft_id: "../forest_signal" })).toBe(false);
    expect(isEventDraftEnvelope({ ...draft, target: { ...draft.target, definition_id: "forest.signal" } })).toBe(false);
  });

  it("rejects invalid explicit timestamps instead of reading global time", () => {
    expect(() =>
      createDefaultNewDraftEnvelope({
        domain: "forest",
        definitionId: "forest_signal",
        createdAt: "not-a-date",
      }),
    ).toThrow("Invalid draft timestamp.");
  });
});
