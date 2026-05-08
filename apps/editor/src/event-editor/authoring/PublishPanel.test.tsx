import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EventDraftEnvelope, EventEditorIssue } from "../types";
import PublishPanel from "./PublishPanel";

describe("PublishPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows generated summary and calls publish when the draft is clean", () => {
    const onPublish = vi.fn();

    render(<PublishPanel draft={createDraft()} isDirty={false} onPublish={onPublish} />);

    expect(screen.getByRole("region", { name: "Publish panel" })).toBeInTheDocument();
    expect(screen.getByLabelText("Publish generated summary")).toHaveTextContent("forest_bridge_choice");
    expect(screen.getByLabelText("Publish generated summary")).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "Publish Draft" }));

    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("requires saving dirty drafts before publish", () => {
    render(<PublishPanel draft={createDraft()} isDirty onPublish={vi.fn()} />);

    expect(screen.getByText("Save Draft before publishing so the helper can compare the latest draft hash.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish Draft" })).toBeDisabled();
  });

  it("groups publish validation issues", () => {
    const issues: EventEditorIssue[] = [
      {
        severity: "error",
        code: "unknown_effect_ref",
        message: "Missing effect group.",
        json_path: "/event_definitions/0/event_graph/nodes/0/options/0/effect_refs/0",
        editor_location: {
          step: "graph",
          node_id: "call",
          option_id: "ack",
        },
      },
    ];

    render(<PublishPanel draft={createDraft()} isDirty={false} issues={issues} result={{ published: false, written_files: [], issues }} />);

    expect(screen.getByRole("region", { name: "Event validation panel" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Graph validation issues" })).toHaveTextContent("unknown_effect_ref");
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
      id: "forest_bridge_choice",
      domain: "forest",
      title: "Bridge choice",
      summary: "Choose how to cross the bridge.",
      status: "ready_for_test",
    },
    working_call_templates: [{ id: "forest_bridge_choice.call.call", event_definition_id: "forest_bridge_choice", node_id: "call" }],
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
